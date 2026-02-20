import * as fse from 'fs-extra';
import { glob } from 'glob';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { commands, ExtensionContext, Position, ProgressLocation, TextEditor, Uri, window, workspace } from 'vscode';
import { Utils } from 'vscode-uri';
import { Commands } from '../commands/commands';
import {
  executeCql,
  TestCase,
  TestCaseExclusion,
  TestConfig,
} from '../cql-service/cqlService.executeCql';
import * as log from '../log-services/logger';

interface CqlPaths {
  libraryDirectoryPath: Uri;
  projectDirectoryPath: Uri;
  optionsPath: Uri;
  resultDirectoryPath: Uri;
  terminologyDirectoryPath: Uri;
  testConfigPath: Uri;
  testDirectoryPath: Uri;
}

export function register(context: ExtensionContext): void {
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
    quickPick.show();

    quickPick.onDidAccept(async () => {
      const selected = [...quickPick.selectedItems];
      quickPick.hide();

      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: 'Executing CQL Libraries',
          cancellable: false,
        },
        async progress => {
          const total = selected.length;
          for (let i = 0; i < total; i++) {
            const item = selected[i];
            progress.report({
              message: `(${i + 1}/${total}) ${item.label}`,
              increment: (1 / total) * 100,
            });
            await executeCQLFile(item.uri);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        },
      );
    });
  }
}

export async function selectTestCases(cqlFileUri: Uri): Promise<void> {
  const quickPick = window.createQuickPick();

  const libraryDirectory = Utils.dirname(cqlFileUri);
  const libraryName = Utils.basename(cqlFileUri).replace('.cql', '').split('-')[0];
  const projectPath = workspace.getWorkspaceFolder(cqlFileUri)!.uri;

  const rootDir = Utils.resolvePath(projectPath);
  const optionsPath = Utils.resolvePath(libraryDirectory, 'cql-options.json');
  const testPath = Utils.resolvePath(projectPath, 'input', 'tests');
  const resultPath = Utils.resolvePath(testPath, 'results');

  const outputPath = Utils.resolvePath(resultPath, `${libraryName}.txt`);
  fse.ensureFileSync(outputPath.fsPath);
  const textDocument = await workspace.openTextDocument(outputPath);
  const textEditor = await window.showTextDocument(textDocument);

  const testConfigPath = Utils.resolvePath(testPath, 'config.json');
  const testConfig = loadTestConfig(testConfigPath);
  const excludedTestCases = getExcludedTestCases(libraryName, testConfig.testCasesToExclude);

  const testCases = getTestCases(testPath, libraryName, Array.from(excludedTestCases.keys()));
  const namedTestCases = testCases.filter(
    (testCase): testCase is Required<TestCase> => testCase.name !== undefined,
  );
  const quickPickItems = namedTestCases.map(testCase => ({ label: testCase.name }));

  if (quickPickItems.length > 0) {
    quickPick.items = quickPickItems;
    quickPick.canSelectMany = true;
    quickPick.show();

    quickPick.onDidAccept(() => {
      const selected = namedTestCases.filter(testCase =>
        quickPick.selectedItems.some(item => item.label === testCase.name),
      );
      quickPick.hide();
      executeCQLFile(cqlFileUri, selected);
    });
  }
}

export async function executeCQLFile(
  cqlFileUri: Uri,
  testCases: Array<TestCase> | undefined = undefined,
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
  const outputPath = Utils.resolvePath(cqlPaths.resultDirectoryPath, `${libraryName}.txt`);
  fse.ensureFileSync(outputPath.fsPath);
  const textDocument = await workspace.openTextDocument(outputPath);
  const textEditor = await window.showTextDocument(textDocument);

  const testConfig = loadTestConfig(cqlPaths.testConfigPath);
  const excludedTestCases = getExcludedTestCases(libraryName, testConfig.testCasesToExclude);

  if (!testCases) {
    testCases = getTestCases(
      cqlPaths.testDirectoryPath,
      libraryName,
      Array.from(excludedTestCases.keys()),
    );
  }

  // We didn't find any test cases, so we'll just execute an empty one
  if (testCases.length === 0) {
    testCases.push({});
  }

  const cqlMessage = `CQL: ${cqlPaths.libraryDirectoryPath.fsPath}`;
  const terminologyMessage = fs.existsSync(cqlPaths.terminologyDirectoryPath.fsPath)
    ? `Terminology: ${cqlPaths.terminologyDirectoryPath.fsPath}`
    : `No terminology found at ${cqlPaths.terminologyDirectoryPath.fsPath}. Evaluation may fail if terminology is required.`;

  let testMessage = [];
  if (testCases.length == 1 && testCases[0].name === null) {
    testMessage.push(
      `No data found at ${cqlPaths.testDirectoryPath.fsPath}. Evaluation may fail if data is required.`,
    );
  } else {
    testMessage.push(`Test cases:`);
    for (let p of testCases) {
      testMessage.push(`${p.name} - ${p.path?.fsPath}`);
    }
  }

  if (excludedTestCases.size > 0) {
    testMessage.push('\nExcluded test cases:');
    for (const [testCase, reason] of excludedTestCases.entries()) {
      testMessage.push(`${testCase} - ${reason}`);
    }
  }

  await insertLineAtEnd(textEditor, `${cqlMessage}`);
  await insertLineAtEnd(textEditor, `${terminologyMessage}`);
  await insertLineAtEnd(textEditor, `${testMessage.join('\n')}\n`);

  const startExecution = Date.now();

  let fhirVersion = getFhirVersion();
  if (!fhirVersion) {
    fhirVersion = 'R4';
    window.showInformationMessage('Unable to determine version of FHIR used. Defaulting to R4.');
  }

  const result: string | undefined = await executeCql(
    cqlFileUri,
    testCases,
    cqlPaths.terminologyDirectoryPath,
    fhirVersion,
    cqlPaths.optionsPath,
    cqlPaths.projectDirectoryPath,
  );

  const endExecution = Date.now();

  await insertLineAtEnd(textEditor, result!);
  await insertLineAtEnd(
    textEditor,
    `elapsed: ${((endExecution - startExecution) / 1000).toString()} seconds`,
  );
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
    testConfigPath: Utils.resolvePath(testDirectoryPath, 'config.json'),
    testDirectoryPath: testDirectoryPath,
  };
}

function getExcludedTestCases(
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

function getExecArgs(
  libraryDirectory: Uri,
  libraryName: string,
  modelPath: Uri | null,
  terminologyPath: Uri | null,
  contextValue: string | null,
  measurementPeriod: string,
): string[] {
  // TODO: One day we might support other models and contexts
  const modelType = 'FHIR';
  const contextType = 'Patient';

  let args: string[] = [];
  args.push(`-ln=${libraryName}`, `-lu=${libraryDirectory}`);

  if (modelPath) {
    args.push(`-m=${modelType}`, `-mu=${modelPath}`);
  }

  if (terminologyPath) {
    args.push(`-t=${terminologyPath}`);
  }

  if (contextValue) {
    args.push(`-c=${contextType}`, `-cv=${contextValue}`);
  }

  if (measurementPeriod && measurementPeriod !== '') {
    args.push(`-p=${libraryName}."Measurement Period"`, `-pv=${measurementPeriod}`);
  }

  return args;
}

function getFhirVersion(): string | null {
  const fhirVersionRegex = /using (FHIR|"FHIR") version '(\d(.|\d)*)'/;
  const matches = window.activeTextEditor!.document.getText().match(fhirVersionRegex);
  if (matches && matches.length > 2) {
    const version = matches[2];
    if (version.startsWith('2')) {
      return 'DSTU2';
    } else if (version.startsWith('3')) {
      return 'DSTU3';
    } else if (version.startsWith('4')) {
      return 'R4';
    } else if (version.startsWith('5')) {
      return 'R5';
    }
  }

  return null;
}

function getLibraries(libraryPath: Uri): Array<Uri> {
  if (!fs.existsSync(libraryPath.fsPath)) {
    log.warn(`unable to find libraries @ ${libraryPath.fsPath}`);
    return [];
  }
  return glob
    .sync(libraryPath.fsPath + `/**/*.cql`)
    .filter(f => fs.statSync(f).isFile())
    .map(f => Uri.file(f));
}

/**
 * Get the test cases to execute
 * @param testPath the root path to look for test cases
 * @returns a list of test cases to execute
 */
function getTestCases(
  testPath: Uri,
  libraryName: string,
  testCasesToExclude: string[],
): Array<TestCase> {
  if (!fs.existsSync(testPath.fsPath)) {
    return [];
  }

  let testCases: TestCase[] = [];
  let directories = glob
    .sync(testPath.fsPath + `/**/${libraryName}`)
    .filter(d => fs.statSync(d).isDirectory());
  for (let dir of directories) {
    let cases = fs
      .readdirSync(dir)
      .filter(d => fs.statSync(path.join(dir, d)).isDirectory() && !testCasesToExclude.includes(d));
    for (let c of cases) {
      testCases.push({ name: c, path: Uri.file(path.join(dir, c)) });
    }
  }

  return testCases;
}

function getWorkspacePath(): Uri | undefined {
  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    return workspace.workspaceFolders[0].uri;
  }
  return undefined;
}

async function insertLineAtEnd(textEditor: TextEditor, text: string) {
  const document = textEditor.document;
  await textEditor.edit(editBuilder => {
    editBuilder.insert(new Position(document.lineCount, 0), text + '\n');
  });
}

function loadTestConfig(testConfigPath: Uri): TestConfig {
  try {
    const jsonString = fs.readFileSync(testConfigPath.fsPath, 'utf-8');
    // Cast the parsed object to the User interface
    return JSON.parse(jsonString) as TestConfig;
  } catch (error) {
    log.error('Error reading/parsing config file', error);
    return { testCasesToExclude: [] };
  }
}
