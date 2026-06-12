import * as fse from 'fs-extra';
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
import { VersionInfo } from '../protocol';
import { CqlSolution } from '../model/cqlSolution';
import { extractLibraryVersion } from '../helpers/fileHelper';
import { resolveParameters } from '../helpers/parametersHelper';
import * as log from '../log-services/logger';
import { CqlParametersConfig, ParameterEntry, ResultParameterEntry } from '../model/parameters';
import { getMeasureReportData, getTestCases, TestCase } from '../model/testCase';
import {
  CqlPaths,
  getCqlPaths,
  getExcludedTestCases,
  getFhirVersion,
  loadTestConfig,
  TestConfig,
  waitForTestCasesLoaded,
} from '../helpers/cqlHelpers';

export interface TestCaseResult {
  executedAt: string;
  libraryName: string;
  testCaseName: string | null;
  testCaseDescription: string | null;
  /** All parameters for this evaluation — config-supplied and CQL-declared defaults — ordered config first, defaults appended. Differentiate by the `source` field. */
  parameters: ResultParameterEntry[];
  results: ExpressionResult[];
  errors: string[];
  versions?: VersionInfo;
}

export function register(context: ExtensionContext): void {
  context.subscriptions.push(
    commands.registerCommand(Commands.EXECUTE_CQL_COMMAND, async (uri: Uri) => {
      executeCQLFile(uri);
    }),
  );
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

  const cqlPaths = getCqlPaths(cqlFileUri);
  if (!cqlPaths) {
    window.showErrorMessage('Unable to determine needed CQL Paths.');
    return;
  }

  const libraryName = Utils.basename(cqlFileUri).replace('.cql', '').split('-')[0];
  const libraryDisplayName = Utils.basename(cqlFileUri).replace('.cql', '');

  const testConfig = loadTestConfig(cqlPaths.testConfigPath);
  const excludedTestCases = getExcludedTestCases(libraryName, testConfig.testCasesToExclude);

  if (testCases === undefined) {
    const project = CqlSolution.getCurrent().findProjectForUri(cqlFileUri);
    const library = project?.Libraries.find(lib => lib.uri.fsPath === cqlFileUri.fsPath);
    if (library && project) {
      await waitForTestCasesLoaded(library, project, showProgress);
    }
  }

  const effectiveTestCases: Array<TestCase> =
    testCases ??
    getTestCases(cqlPaths.testDirectoryPath, libraryName, Array.from(excludedTestCases.keys()));

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
    fse.ensureDirSync(cqlPaths.resultDirectoryPath.fsPath);
    if (!fs.existsSync(outputPath.fsPath)) {
      fs.writeFileSync(outputPath.fsPath, '');
    }
    const textDocument = await workspace.openTextDocument(outputPath);
    const textEditor = await window.showTextDocument(textDocument);
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


    const versionMessage: string[] = [];
    const versions = response.versions;
    if (versions) {
      if (versions.translator) versionMessage.push(`Translator version: ${versions.translator}`);
      if (versions.engine) versionMessage.push(`Engine version: ${versions.engine}`);
      if (versions.clinicalReasoning) versionMessage.push(`Clinical Reasoning version: ${versions.clinicalReasoning}`);
      if (versions.languageServer) versionMessage.push(`Language Server version: ${versions.languageServer}`);
    }

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
    await insertLineAtEnd(textEditor, `${versionMessage.join('\n')}\n`);
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
      versions: response.versions,
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

async function insertLineAtEnd(textEditor: TextEditor, text: string) {
  const document = textEditor.document;
  await textEditor.edit(
    editBuilder => {
      editBuilder.insert(new Position(document.lineCount, 0), text + '\n');
    },
    { undoStopBefore: false, undoStopAfter: false },
  );
}
