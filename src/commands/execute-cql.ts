import * as fse from 'fs-extra';
import { glob } from 'glob';
import markdownToText from 'markdown-to-text';
import * as fs from 'node:fs';
import {
  commands,
  ExtensionContext,
  Position,
  ProgressLocation,
  TextEditor,
  Uri,
  window,
  workspace,
} from 'vscode';
import { Utils } from 'vscode-uri';
import { Commands } from '../commands/commands';
import { executeCql } from '../cql-service/cqlService.executeCql';
import * as log from '../log-services/logger';
import { getTestCases, TestCase, TestCaseExclusion } from '../model/testCase';

let _context: ExtensionContext | undefined;

interface CqlPaths {
  libraryDirectoryPath: Uri;
  projectDirectoryPath: Uri;
  optionsPath: Uri;
  resultDirectoryPath: Uri;
  terminologyDirectoryPath: Uri;
  testConfigPath: Uri;
  testDirectoryPath: Uri;
}

interface TestConfig {
  testCasesToExclude: TestCaseExclusion[];
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
  const cqlPaths = getCqlPaths();
  if (!cqlPaths) {
    const msg = 'Unable to resolve needed CQL project paths.';
    log.error(msg);
    window.showErrorMessage(msg);
    return;
  }

  const quickPick = window.createQuickPick();
  const libraryName = Utils.basename(cqlFileUri).replace('.cql', '').split('-')[0];
  const outputPath = Utils.resolvePath(cqlPaths.resultDirectoryPath, `${libraryName}.txt`);
  fse.ensureFileSync(outputPath.fsPath);
  const textDocument = await workspace.openTextDocument(outputPath);
  await window.showTextDocument(textDocument);
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
    detail: markdownToText(testCase.description), // use quickpick detail to get description on 2nd line of quickpick
  }));

  if (quickPickItems.length > 0) {
    quickPick.items = quickPickItems;
    quickPick.canSelectMany = true;

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
