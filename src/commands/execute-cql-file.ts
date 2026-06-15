import * as fse from 'fs-extra';
import * as fs from 'node:fs';
import {
  commands,
  ExtensionContext,
  Position,
  ProgressLocation,
  Range,
  Uri,
  window,
  workspace
} from 'vscode';
import { Utils } from 'vscode-uri';
import { Commands } from '../commands/commands';
import { executeCql, ExecuteCqlResponse, ExpressionResult } from '../cql-service/cqlService.executeCql';
import {
  CqlPaths,
  getCqlPaths,
  getExcludedTestCases,
  getFhirVersion,
  loadTestConfig,
  waitForTestCasesLoaded
} from '../helpers/cqlHelpers';
import { extractLibraryVersion } from '../helpers/fileHelper';
import { resolveParameters } from '../helpers/parametersHelper';
import { CqlSolution } from '../model/cqlSolution';
import { CqlParametersConfig, ParameterEntry, ResultParameterEntry } from '../model/parameters';
import { getMeasureReportData, getTestCases, TestCase } from '../model/testCase';
import { VersionInfo } from '../protocol';

export interface TestCaseResult {
  executedAt: string;
  libraryName: string;
  testCaseName: string | null;
  testCaseDescription: string | null;
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

/**
 * Main command entry point orchestrating execution flow.
 */
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

  // Sync / Wait for projects if required
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
  const fhirVersion = determinedFhirVersion ?? 'R4';
  if (!determinedFhirVersion) {
    window.showInformationMessage('Unable to determine version of FHIR used. Defaulting to R4.');
  }
  const libraryVersion = extractLibraryVersion(cqlSource);
  const resultFormat = resultFormatOverride ?? testConfig.resultFormat;

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

  const elapsedSeconds = (Date.now() - startExecution) / 1000;

  if (!response) return;

  // Delegate based on format layout strategy
  if (resultFormat === 'individual') {
    await handleIndividualResults(
      libraryName,
      libraryVersion,
      effectiveTestCases,
      response,
      cqlPaths,
      startExecution,
      testConfig.parameters,
      showCompletion,
      elapsedSeconds
    );
  } else {
    await handleAggregatedTextReport(
      libraryName,
      effectiveTestCases,
      excludedTestCases,
      response,
      cqlPaths,
      elapsedSeconds
    );
  }
}

/**
 * Format Handler: Individual JSON Outputs
 */
async function handleIndividualResults(
  libraryName: string,
  libraryVersion: string | undefined,
  effectiveTestCases: TestCase[],
  response: ExecuteCqlResponse,
  cqlPaths: CqlPaths,
  startExecution: number,
  parameters: CqlParametersConfig | undefined,
  showCompletion: boolean,
  elapsedSeconds: number
) {
  writeIndividualResultFiles(
    libraryName,
    libraryVersion,
    effectiveTestCases,
    response,
    cqlPaths.resultDirectoryPath,
    startExecution,
    parameters,
  );

  if (!showCompletion) return;

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
    window.showInformationMessage(
      `CQL execution complete — ${effectiveTestCases.length} test cases written (${elapsedSeconds.toFixed(1)}s)`,
    );
  }
}

/**
 * Format Handler: Consolidated Text Output
 */
async function handleAggregatedTextReport(
  libraryName: string,
  effectiveTestCases: TestCase[],
  excludedTestCases: Map<string, string>,
  response: ExecuteCqlResponse,
  cqlPaths: CqlPaths,
  elapsedSeconds: number
) {
  const outputPath = Utils.resolvePath(cqlPaths.resultDirectoryPath, `${libraryName}.txt`);
  fse.ensureDirSync(cqlPaths.resultDirectoryPath.fsPath);
  
  if (!fs.existsSync(outputPath.fsPath)) {
    fs.writeFileSync(outputPath.fsPath, '');
  }

  const textDocument = await workspace.openTextDocument(outputPath);
  const textEditor = await window.showTextDocument(textDocument);

  // Generate complete unified report buffer
  const reportText = generateTextReport(
    cqlPaths,
    effectiveTestCases,
    excludedTestCases,
    response,
    elapsedSeconds
  );

  // Atomic replace execution
  const entireDocRange = new Range(
    new Position(0, 0),
    textDocument.lineAt(Math.max(0, textDocument.lineCount - 1)).range.end,
  );

  await textEditor.edit(
    editBuilder => {
      editBuilder.replace(entireDocRange, reportText);
    },
    { undoStopBefore: false, undoStopAfter: false },
  );

  await textDocument.save();
}

/**
 * String Assembler: Composes entire plaintext dashboard view
 */
function generateTextReport(
  cqlPaths: CqlPaths,
  effectiveTestCases: TestCase[],
  excludedTestCases: Map<string, string>,
  response: ExecuteCqlResponse,
  elapsedSeconds: number
): string {
  const lines: string[] = [];

  lines.push(`CQL: ${cqlPaths.libraryDirectoryPath.fsPath}`);

  // Map system variations cleanly via configuration definitions
  if (response.versions) {
    const versionKeys: Array<[keyof VersionInfo, string]> = [
      ['clinicalReasoning', 'Clinical Reasoning version'],
      ['engine', 'Engine version'],
      ['languageServer', 'Language Server version'],
      ['translator', 'Translator version'],
    ];
    for (const [key, label] of versionKeys) {
      if (response.versions[key]) {
        lines.push(`${label}: ${response.versions[key]}`);
      }
    }
  }

  const termPath = cqlPaths.terminologyDirectoryPath.fsPath;
  lines.push(
    fs.existsSync(termPath)
      ? `Terminology: ${termPath}`
      : `No terminology found at ${termPath}. Evaluation may fail if terminology is required.`
  );

  if (effectiveTestCases.length === 1 && !effectiveTestCases[0].name) {
    lines.push(`No data found at ${cqlPaths.testDirectoryPath.fsPath}. Evaluation may fail if data is required.`);
  } else {
    lines.push('Test cases:');
    for (const p of effectiveTestCases) {
      lines.push(`${p.name} - ${p.path?.fsPath}`);
    }
  }

  if (excludedTestCases.size > 0) {
    lines.push('\nExcluded test cases:');
    for (const [testCase, reason] of excludedTestCases.entries()) {
      lines.push(`${testCase} - ${reason}`);
    }
  }

  lines.push('');
  lines.push(formatResponse(response));
  lines.push(`\nelapsed: ${elapsedSeconds.toString()} seconds\n`);

  return lines.join('\n');
}

export function formatResponse(response: ExecuteCqlResponse): string {
  const lines: string[] = [];

  response.results.forEach((result, i) => {
    if (i > 0) lines.push('');
    for (const expr of result.expressions) {
      lines.push(`${expr.name}=${expr.value}`);
    }
  });

  if (response.logs.length > 0) {
    lines.push('', 'Evaluation logs:', ...response.logs);
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