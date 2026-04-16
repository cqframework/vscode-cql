import * as fse from 'fs-extra';
import { glob } from 'glob';
import * as fs from 'node:fs';
import {
  commands,
  ExtensionContext,
  Position,
  ProgressLocation,
  Range,
  TextEditor,
  Uri,
  window,
  workspace,
} from 'vscode';
import { Utils } from 'vscode-uri';
import { Commands } from '../commands/commands';
import { ExecuteCqlResponse, ExpressionResult, executeCql } from '../cql-service/cqlService.executeCql';
import * as log from '../log-services/logger';
import { extractLibraryVersion, toGlobPath } from '../helpers/fileHelper';
import { parse as parseJsonc } from 'jsonc-parser';
import { CqlParametersConfig, ParameterEntry, ResultParameterEntry } from '../model/parameters';
import { resolveParameters } from '../helpers/parametersHelper';
import { getTestCases, getMeasureReportData, TestCase, TestCaseExclusion } from '../model/testCase';

let _context: ExtensionContext | undefined;

export interface TestCaseResult {
  executedAt: string;
  libraryName: string;
  testCaseName: string | null;
  testCaseDescription: string | null;
  /** All parameters for this evaluation — config-supplied and CQL-declared defaults — ordered config first, defaults appended. Differentiate by the `source` field. */
  parameters: ResultParameterEntry[];
  results: ExpressionResult[];
  errors: string[];
}

interface CqlPaths {
  libraryDirectoryPath: Uri;
  projectDirectoryPath: Uri;
  optionsPath: Uri;
  resultDirectoryPath: Uri;
  terminologyDirectoryPath: Uri;
  testConfigPath: Uri;
  testDirectoryPath: Uri;
}

export interface TestConfig {
  testCasesToExclude: TestCaseExclusion[];
  parameters?: CqlParametersConfig;
  resultFormat?: 'individual' | 'flat';
}

export function register(context: ExtensionContext): void {
  _context = context;
  context.subscriptions.push(
    commands.registerCommand(Commands.EXECUTE_CQL_COMMAND, async (uri: Uri) => {
      executeCQLFile(uri);
    }),
    commands.registerCommand(Commands.EXECUTE_CQL_COMMAND_SELECT_LIBRARIES, async (uri: Uri) => {
      selectLibraries();
    }),
    commands.registerCommand(Commands.EXECUTE_CQL_COMMAND_SELECT_TEST_CASES, async (uri: Uri) => {
      selectTestCases(uri);
    }),
  );
}

export async function selectLibraries(): Promise<void> {
  const cqlPaths = getCqlPaths();
  if (!cqlPaths) {
    window.showErrorMessage('Unable to determine needed CQL Paths.');
    return;
  }

  const libraries = getLibraries(cqlPaths.libraryDirectoryPath);
  const quickPickItems = libraries
    .map(uri => ({ label: Utils.basename(uri), uri }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const quickPick = window.createQuickPick<{ label: string; uri: Uri }>();
  if (quickPickItems.length > 0) {
    quickPick.items = quickPickItems;
    quickPick.canSelectMany = true;

    const stateKey = 'selectLibraries.selections';
    const savedSelections = _context?.workspaceState.get<string[]>(stateKey) ?? [];
    if (savedSelections.length > 0) {
      quickPick.selectedItems = quickPick.items.filter(item =>
        savedSelections.includes(item.label),
      );
    }

    quickPick.show();

    quickPick.onDidAccept(async () => {
      const selected = [...quickPick.selectedItems];
      _context?.workspaceState.update(stateKey, selected.map(item => item.label));
      quickPick.hide();

      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: 'Executing CQL Libraries',
          cancellable: true,
        },
        async (progress, token) => {
          const total = selected.length;
          const batchStart = Date.now();
          let completed = 0;
          for (let i = 0; i < total; i++) {
            if (token.isCancellationRequested) {
              break;
            }
            const item = selected[i];
            progress.report({
              message: `(${i + 1}/${total}) ${item.label}`,
              increment: (1 / total) * 100,
            });
            const libStart = Date.now();
            try {
              await executeCQLFile(item.uri, undefined, false, 'individual', false);
              log.info(`[PERF] ${item.label}: ${((Date.now() - libStart) / 1000).toFixed(1)}s`);
              completed++;
            } catch (e) {
              log.error(`Error executing CQL for ${item.label}`, e);
              window.showErrorMessage(
                `Failed to execute ${item.label}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          const batchElapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
          log.info(`[PERF] selectLibraries total (${total} libraries): ${batchElapsed}s`);
          const msg =
            completed === total
              ? `CQL execution complete — ${total} ${total === 1 ? 'library' : 'libraries'} (${batchElapsed}s)`
              : `CQL execution cancelled — ${completed}/${total} libraries (${batchElapsed}s)`;
          window.showInformationMessage(msg);
        },
      );
    });
  }
}

export async function selectTestCases(cqlFileUri: Uri): Promise<void> {
  const cqlPaths = getCqlPaths();
  if (!cqlPaths) {
    const msg = 'Unable to resolve needed CQL project paths.';
    log.error(msg);
    window.showErrorMessage(msg);
    return;
  }

  const quickPick = window.createQuickPick();
  const libraryName = Utils.basename(cqlFileUri).replace('.cql', '').split('-')[0];
  const testConfig = loadTestConfig(cqlPaths.testConfigPath);
  const excludedTestCases = getExcludedTestCases(libraryName, testConfig.testCasesToExclude);
  const testCases = getTestCases(
    cqlPaths.testDirectoryPath,
    libraryName,
    Array.from(excludedTestCases.keys()),
  );
  const namedTestCases = testCases.filter(
    (testCase): testCase is Required<TestCase> => testCase.name !== undefined,
  );
  const quickPickItems = namedTestCases.map(testCase => ({
    label: testCase.name,
    detail: getMeasureReportData(testCase.path)?.description,
  }));

  if (quickPickItems.length > 0) {
    quickPick.items = quickPickItems;
    quickPick.canSelectMany = true;
    quickPick.matchOnDetail = true;

    const stateKey = `selectTestCases.selections.${libraryName}`;
    const savedSelections = _context?.workspaceState.get<string[]>(stateKey) ?? [];
    if (savedSelections.length > 0) {
      quickPick.selectedItems = quickPick.items.filter(item =>
        savedSelections.includes(item.label),
      );
    }

    quickPick.show();

    quickPick.onDidAccept(() => {
      const selectedLabels = quickPick.selectedItems.map(item => item.label);
      _context?.workspaceState.update(stateKey, selectedLabels);

      const selected = namedTestCases.filter(testCase =>
        selectedLabels.some(label => label === testCase.name),
      );
      quickPick.hide();
      executeCQLFile(cqlFileUri, selected);
    });
  }
}

export async function executeCQLFile(
  cqlFileUri: Uri,
  testCases: Array<TestCase> | undefined = undefined,
  showProgress: boolean = true,
  resultFormatOverride?: string,
  showCompletion: boolean = true,
): Promise<void> {
  if (!fs.existsSync(cqlFileUri.fsPath)) {
    window.showInformationMessage('No library content found. Please save before executing.');
    return;
  }

  const cqlPaths = getCqlPaths();
  if (!cqlPaths) {
    window.showErrorMessage('Unable to determine needed CQL Paths.');
    return;
  }

  const libraryName = Utils.basename(cqlFileUri).replace('.cql', '').split('-')[0];
  const libraryDisplayName = Utils.basename(cqlFileUri).replace('.cql', '');

  const testConfig = loadTestConfig(cqlPaths.testConfigPath);
  const excludedTestCases = getExcludedTestCases(libraryName, testConfig.testCasesToExclude);

  const effectiveTestCases: Array<TestCase> =
    testCases ??
    getTestCases(cqlPaths.testDirectoryPath, libraryName, Array.from(excludedTestCases.keys()));

  // We didn't find any test cases, so we'll just execute an empty one
  if (effectiveTestCases.length === 0) {
    effectiveTestCases.push({});
  }

  const cqlSource = fs.readFileSync(cqlFileUri.fsPath, 'utf-8');
  const determinedFhirVersion = getFhirVersion(cqlSource);
  const fhirVersion: string = determinedFhirVersion ?? 'R4';
  if (!determinedFhirVersion) {
    window.showInformationMessage('Unable to determine version of FHIR used. Defaulting to R4.');
  }
  const libraryVersion = extractLibraryVersion(cqlSource);

  const resultFormat = resultFormatOverride
    ?? testConfig.resultFormat
    ?? workspace.getConfiguration('cql').get<string>('execute.resultFormat', 'individual');

  const doExecute = () =>
    executeCql(
      cqlFileUri,
      effectiveTestCases,
      cqlPaths.terminologyDirectoryPath,
      fhirVersion,
      cqlPaths.optionsPath,
      cqlPaths.projectDirectoryPath,
      undefined,
      testConfig.parameters,
      libraryVersion,
    );

  const startExecution = Date.now();


  let response: ExecuteCqlResponse | undefined;
  if (showProgress) {
    response = await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: `Executing CQL: ${libraryDisplayName}`,
        cancellable: false,
      },
      async progress => {
        progress.report({ message: 'Running...' });
        return doExecute();
      },
    );
  } else {
    response = await doExecute();
  }

  const endExecution = Date.now();
  const elapsedSeconds = (endExecution - startExecution) / 1000;

  if (resultFormat === 'individual') {
    if (response) {
      writeIndividualResultFiles(
        libraryName,
        libraryVersion,
        effectiveTestCases,
        response,
        cqlPaths.resultDirectoryPath,
        startExecution,
        testConfig.parameters,
      );
    }
    if (showCompletion && response) {
      if (effectiveTestCases.length === 1) {
        const patientId = effectiveTestCases[0].name ?? 'no-context';
        const outputPath = Utils.resolvePath(
          cqlPaths.resultDirectoryPath,
          libraryName,
          `TestCaseResult-${patientId}.json`,
        );
        const textDocument = await workspace.openTextDocument(outputPath);
        await window.showTextDocument(textDocument);
      } else {
        const count = effectiveTestCases.length;
        window.showInformationMessage(
          `CQL execution complete — ${count} test cases written (${elapsedSeconds.toFixed(1)}s)`,
        );
      }
    }
  } else {
    const outputPath = Utils.resolvePath(cqlPaths.resultDirectoryPath, `${libraryName}.txt`);
    // Ensure the result directory and file exist for first-run cases.
    // Do NOT truncate here if the file is already open in VS Code — that would bump the on-disk
    // mtime and trigger a "file is newer" conflict when we later call textDocument.save().
    // The textEditor.edit() delete below clears stale in-memory content on every run.
    fse.ensureDirSync(cqlPaths.resultDirectoryPath.fsPath);
    if (!fs.existsSync(outputPath.fsPath)) {
      fs.writeFileSync(outputPath.fsPath, '');
    }
    const textDocument = await workspace.openTextDocument(outputPath);
    const textEditor = await window.showTextDocument(textDocument);
    // Clear any existing in-memory content before inserting new results.
    // This handles repeated runs where VS Code still holds the previous run's content.
    await textEditor.edit(
      editBuilder => {
        editBuilder.delete(
          new Range(
            new Position(0, 0),
            textDocument.lineAt(Math.max(0, textDocument.lineCount - 1)).range.end,
          ),
        );
      },
      { undoStopBefore: false, undoStopAfter: false },
    );

    const cqlMessage = `CQL: ${cqlPaths.libraryDirectoryPath.fsPath}`;
    const terminologyMessage = fs.existsSync(cqlPaths.terminologyDirectoryPath.fsPath)
      ? `Terminology: ${cqlPaths.terminologyDirectoryPath.fsPath}`
      : `No terminology found at ${cqlPaths.terminologyDirectoryPath.fsPath}. Evaluation may fail if terminology is required.`;

    const testMessage: string[] = [];
    if (effectiveTestCases.length === 1 && !effectiveTestCases[0].name) {
      testMessage.push(
        `No data found at ${cqlPaths.testDirectoryPath.fsPath}. Evaluation may fail if data is required.`,
      );
    } else {
      testMessage.push(`Test cases:`);
      for (const p of effectiveTestCases) {
        testMessage.push(`${p.name} - ${p.path?.fsPath}`);
      }
    }

    if (excludedTestCases.size > 0) {
      testMessage.push('\nExcluded test cases:');
      for (const [testCase, reason] of excludedTestCases.entries()) {
        testMessage.push(`${testCase} - ${reason}`);
      }
    }

    await insertLineAtEnd(textEditor, cqlMessage);
    await insertLineAtEnd(textEditor, terminologyMessage);
    await insertLineAtEnd(textEditor, `${testMessage.join('\n')}\n`);

    if (response) {
      await insertLineAtEnd(textEditor, formatResponse(response));
    }
    await insertLineAtEnd(
      textEditor,
      `\nelapsed: ${elapsedSeconds.toString()} seconds\n`,
    );
    await textDocument.save();
  }
}

export function writeIndividualResultFiles(
  libraryName: string,
  libraryVersion: string | undefined,
  testCases: Array<TestCase>,
  response: ExecuteCqlResponse,
  resultDirectoryPath: Uri,
  executedAt: number,
  parametersConfig?: CqlParametersConfig,
): void {
  const executedAtStr = new Date(executedAt).toISOString();

  for (let i = 0; i < response.results.length; i++) {
    const libraryResult = response.results[i];
    const testCase = testCases[i];
    const testCaseName = testCase?.name ?? null;
    const testCaseDescription = testCase?.path
      ? (getMeasureReportData(testCase.path)?.description ?? null)
      : null;

    const results: ExpressionResult[] = [];
    const errors: string[] = [];
    for (const expr of libraryResult.expressions) {
      if (expr.name === 'Error') {
        errors.push(expr.value);
      } else {
        results.push(expr);
      }
    }

    const resolvedParams: ParameterEntry[] = parametersConfig
      ? resolveParameters(parametersConfig, libraryName, libraryVersion, testCaseName ?? undefined)
      : [];

    const parameters: ResultParameterEntry[] = [
      ...resolvedParams.map(p => ({ name: p.name, type: p.type, value: p.value, source: p.source! })),
      ...(libraryResult.usedDefaultParameters ?? []).map(p => ({ name: p.name, value: p.value, source: 'default' as const })),
    ];

    const result: TestCaseResult = {
      executedAt: executedAtStr,
      libraryName,
      testCaseName,
      testCaseDescription,
      parameters,
      results,
      errors,
    };

    const patientId = testCaseName ?? 'no-context';
    const outputPath = Utils.resolvePath(
      resultDirectoryPath,
      libraryName,
      `TestCaseResult-${patientId}.json`,
    );
    fse.outputFileSync(outputPath.fsPath, JSON.stringify(result, null, 2));
  }
}

export function formatResponse(response: ExecuteCqlResponse): string {
  const lines: string[] = [];
  for (let i = 0; i < response.results.length; i++) {
    if (i > 0) {
      lines.push('');
    }
    for (const expr of response.results[i].expressions) {
      lines.push(`${expr.name}=${expr.value}`);
    }
  }
  if (response.logs.length > 0) {
    lines.push('');
    lines.push('Evaluation logs:');
    lines.push(...response.logs);
  }
  return lines.join('\n');
}

export function resolveTestConfigPath(testDirectoryPath: Uri): Uri {
  const jsoncPath = Utils.resolvePath(testDirectoryPath, 'config.jsonc');
  if (fs.existsSync(jsoncPath.fsPath)) {
    return jsoncPath;
  }
  return Utils.resolvePath(testDirectoryPath, 'config.json');
}

function getCqlPaths(): CqlPaths | undefined {
  const projectDirectoryPath = getWorkspacePath(); //workspace.getWorkspaceFolder(cqlFileUri)!.uri;
  if (!projectDirectoryPath) {
    window.showErrorMessage('Unable to determine path to project root.');
    return;
  }
  const libraryDirectoryPath = Utils.resolvePath(projectDirectoryPath, 'input', 'cql');
  const testDirectoryPath = Utils.resolvePath(projectDirectoryPath, 'input', 'tests');
  return {
    projectDirectoryPath: projectDirectoryPath,
    libraryDirectoryPath: libraryDirectoryPath,
    optionsPath: Utils.resolvePath(libraryDirectoryPath, 'cql-options.json'),
    resultDirectoryPath: Utils.resolvePath(testDirectoryPath, 'results'),
    terminologyDirectoryPath: Utils.resolvePath(
      projectDirectoryPath,
      'input',
      'vocabulary',
      'valueset',
    ),
    testConfigPath: resolveTestConfigPath(testDirectoryPath),
    testDirectoryPath: testDirectoryPath,
  };
}

export function getExcludedTestCases(
  libraryName: string,
  testCasesToExclude: TestCaseExclusion[],
): Map<string, string> {
  let excludedTestCases = new Map<string, string>();
  for (let excludedTestCase of testCasesToExclude) {
    if (excludedTestCase.library == libraryName) {
      excludedTestCases.set(excludedTestCase.testCase, excludedTestCase.reason);
    }
  }
  return excludedTestCases;
}

export function getFhirVersion(cqlContent: string): string | null {
  // Direct FHIR model declaration: using FHIR version 'x.y.z'
  const fhirMatch = cqlContent.match(/using\s+(?:FHIR|"FHIR")\s+version\s+'(\d[^']*)'/);
  if (fhirMatch) {
    const v = fhirMatch[1];
    if (v.startsWith('2')) return 'DSTU2';
    if (v.startsWith('3')) return 'DSTU3';
    if (v.startsWith('4')) return 'R4';
    if (v.startsWith('5')) return 'R5';
  }

  // QICore model declaration: using QICore version 'x.y.z'
  // QICore 3.x targets FHIR DSTU3; 4.x and above target FHIR R4.
  const qicoreMatch = cqlContent.match(/using\s+(?:QICore|"QICore")\s+version\s+'(\d[^']*)'/);
  if (qicoreMatch) {
    return qicoreMatch[1].startsWith('3') ? 'DSTU3' : 'R4';
  }

  // USCore model declaration: all versions target FHIR R4.
  if (/using\s+(?:USCore|"USCore")\s+version\s+'/.test(cqlContent)) {
    return 'R4';
  }

  return null;
}

export function getLibraries(libraryPath: Uri): Array<Uri> {
  if (!fs.existsSync(libraryPath.fsPath)) {
    log.warn(`unable to find libraries @ ${libraryPath.fsPath}`);
    return [];
  }
  return glob
    .sync(`${toGlobPath(libraryPath.fsPath)}/**/*.cql`)
    .filter(f => fs.statSync(f).isFile())
    .map(f => Uri.file(f));
}

function getWorkspacePath(): Uri | undefined {
  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    return workspace.workspaceFolders[0].uri;
  }
  return undefined;
}

async function insertLineAtEnd(textEditor: TextEditor, text: string) {
  const document = textEditor.document;
  await textEditor.edit(
    editBuilder => {
      editBuilder.insert(new Position(document.lineCount, 0), text + '\n');
    },
    { undoStopBefore: false, undoStopAfter: false },
  );
}

export function loadTestConfig(testConfigPath: Uri): TestConfig {
  try {
    const jsonString = fs.readFileSync(testConfigPath.fsPath, 'utf-8');
    return parseJsonc(jsonString) as TestConfig;
  } catch (error) {
    log.error('Error reading/parsing config file', error);
    return { testCasesToExclude: [] };
  }
}

