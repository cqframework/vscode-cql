import { glob } from 'glob';
import { Position, TextEditor, Uri, commands, window, workspace } from 'vscode';
import { Utils } from 'vscode-uri';
import { Commands } from './commands';

import * as fs from 'fs';
import * as fse from 'fs-extra';
import path from 'path';

// NOTE: This is not the intended future state of executing CQL.
// There's a CQL debug server under development that will replace this.
export async function executeCQLFile(uri: Uri): Promise<void> {
  if (!fs.existsSync(uri.fsPath)) {
    window.showInformationMessage('No library content found. Please save before executing.');
    return;
  }

  const libraryDirectory = Utils.dirname(uri);
  const libraryName = Utils.basename(uri).replace('.cql', '').split('-')[0];
  const projectPath = workspace.getWorkspaceFolder(uri)!.uri;

  // todo: make this a setting
  let terminologyPath: Uri = Utils.resolvePath(projectPath, 'input', 'vocabulary', 'valueset');

  let fhirVersion = getFhirVersion();
  if (!fhirVersion) {
    fhirVersion = 'R4';
    window.showInformationMessage('Unable to determine version of FHIR used. Defaulting to R4.');
  }

  const optionsPath = Utils.resolvePath(libraryDirectory, 'cql-options.json');
  const measurementPeriod = '';
  const testPath = Utils.resolvePath(projectPath, 'input', 'tests');
  const resultPath = Utils.resolvePath(testPath, 'results');
  const outputPath = Utils.resolvePath(resultPath, `${libraryName}.txt`);

  fse.ensureFileSync(outputPath.fsPath);

  const textDocument = await workspace.openTextDocument(outputPath);
  const textEditor = await window.showTextDocument(textDocument);

  var testCasesArgs: string[] = [];
  var testPaths = getTestPaths(testPath, libraryName);

  // We didn't find any test cases, so we'll just execute an empty one
  if (testPaths.length === 0) {
    testPaths.push({ name: null, path: null });
  }

  for (var p of testPaths) {
    testCasesArgs.push(
      ...getExecArgs(
        libraryDirectory,
        libraryName,
        p.path,
        terminologyPath,
        p.name,
        measurementPeriod,
      ),
    );
  }

  const cqlMessage = `CQL: ${libraryDirectory.fsPath}`;
  const terminologyMessage = fs.existsSync(terminologyPath.fsPath)
    ? `Terminology: ${terminologyPath.fsPath}`
    : `No terminology found at ${terminologyPath.fsPath}. Evaluation may fail if terminology is required.`;

  let testMessage = '';
  if (testPaths.length == 1 && testPaths[0].name === null) {
    testMessage = `No data found at ${testPath.fsPath}. Evaluation may fail if data is required.`;
  } else {
    testMessage = `Test cases:\n`;
    for (var p of testPaths) {
      testMessage += `${p.name} - ${p.path?.fsPath}\n`;
    }
  }

  await insertLineAtEnd(textEditor, `${cqlMessage}`);
  await insertLineAtEnd(textEditor, `${terminologyMessage}`);
  await insertLineAtEnd(textEditor, `${testMessage}`);

  let operationArgs = getCqlCommandArgs(fhirVersion, optionsPath);
  operationArgs.push(...testCasesArgs);
  await executeCQL(textEditor, operationArgs);
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

interface TestCase {
  name: string | null;
  path: Uri | null;
}

/**
 * Get the test cases to execute
 * @param testPath the root path to look for test cases
 * @returns a list of test cases to execute
 */
function getTestPaths(testPath: Uri, libraryName: string): TestCase[] {
  if (!fs.existsSync(testPath.fsPath)) {
    return [];
  }

  let testCases: TestCase[] = [];
  let directories = glob
    .sync(testPath.fsPath + `/**/${libraryName}`)
    .filter(d => fs.statSync(d).isDirectory());
  for (var dir of directories) {
    let cases = fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory());
    for (var c of cases) {
      testCases.push({ name: c, path: Uri.file(path.join(dir, c)) });
    }
  }

  return testCases;
}

async function insertLineAtEnd(textEditor: TextEditor, text: string) {
  const document = textEditor.document;
  await textEditor.edit(editBuilder => {
    editBuilder.insert(new Position(textEditor.document.lineCount, 0), text + '\n');
  });
}

async function executeCQL(textEditor: TextEditor, operationArgs: string[]) {
  const startExecution = Date.now();
  const result: string | undefined = await commands.executeCommand(
    Commands.EXECUTE_WORKSPACE_COMMAND,
    Commands.EXECUTE_CQL,
    ...operationArgs,
  );
  const endExecution = Date.now();

  await insertLineAtEnd(textEditor, result!);
  await insertLineAtEnd(
    textEditor,
    `elapsed: ${((endExecution - startExecution) / 1000).toString()} seconds`,
  );
}

function getCqlCommandArgs(fhirVersion: string, optionsPath: Uri): string[] {
  const args = ['cql'];

  args.push(`-fv=${fhirVersion}`);

  if (optionsPath && fs.existsSync(optionsPath.fsPath)) {
    args.push(`-op=${optionsPath}`);
  }

  return args;
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
  args.push(`-ln=${libraryName}`);
  args.push(`-lu=${libraryDirectory}`);

  if (modelPath) {
    args.push(`-m=${modelType}`);
    args.push(`-mu=${modelPath}`);
  }

  if (terminologyPath) {
    args.push(`-t=${terminologyPath}`);
  }

  if (contextValue) {
    args.push(`-c=${contextType}`);
    args.push(`-cv=${contextValue}`);
  }

  if (measurementPeriod && measurementPeriod !== '') {
    args.push(`-p=${libraryName}."Measurement Period"`);
    args.push(`-pv=${measurementPeriod}`);
  }

  return args;
}
