import { glob } from 'glob';
import { window, workspace } from 'vscode';
import { URI, Utils } from 'vscode-URI';

import * as fs from 'fs';
import * as fse from 'fs-extra';
import path from 'path';
import { Connection, ConnectionManager, Context } from './connectionManager';

export type EvaluationParameters = {
  operationArgs: string[] | undefined;
  outputPath: URI | undefined;
  testPath: URI | undefined;
};

// Should be working with normalized data
export function buildParameters(uri: URI, expression: string | undefined): EvaluationParameters {
  if (!fs.existsSync(uri.fsPath)) {
    window.showInformationMessage('No library content found. Please save before executing.');
    return { operationArgs: undefined, outputPath: undefined, testPath: undefined };
  }

  const libraryDirectory = Utils.dirname(uri);
  const libraryName = Utils.basename(uri).replace('.cql', '').split('-')[0];
  const projectPath = workspace.getWorkspaceFolder(uri)!.uri;
  const terminologyPath: URI = Utils.resolvePath(projectPath, 'input', 'vocabulary', 'valueset');
  const fhirVersion = getFhirVersion();
  const optionsPath = Utils.resolvePath(libraryDirectory, 'cql-options.json');
  const measurementPeriod = '';
  const testPath = Utils.resolvePath(projectPath, 'input', 'tests');
  const resultPath = Utils.resolvePath(testPath, 'results');
  const outputPath = Utils.resolvePath(resultPath, `${libraryName}.txt`);
  const connectionManager = ConnectionManager.getManager();

  fse.ensureFileSync(outputPath.fsPath);

  let contexts = connectionManager.getCurrentContexts();
  let connection = connectionManager.getCurrentConnection();

  if (
    contexts === undefined ||
    (contexts != undefined && connection?.name !== 'Local' && Object.values(contexts).length === 0)
  ) {
    window.showErrorMessage('Remote connection is selected but no contexts are provided.');
  }

  let operationArgs = getCqlCommandArgs({
    fhirVersion,
    optionsPath,
    libraryDirectory,
    libraryName,
    expression,
    terminologyPath,
    connection,
    // I kind of want to make 'Local' a const that I can share....
    // not sure, but I already ran into an issue debugging when I changed the check below, but not this one
<<<<<<< HEAD
    contexts:
      contexts != undefined && connection?.name !== 'Local' && Object.values(contexts).length > 0
        ? new Map(Object.entries(contexts).map(([key, context]) => [key, context]))
        : getLocalContexts(testPath, libraryName),
=======
    contexts != undefined && connection?.name !== 'Local' && Object.values(contexts).length > 0
      ? new Map(Object.values(contexts).map(context => ['', context]))
      : getLocalContexts(testPath, libraryName),
>>>>>>> eface7d (Add in the local connection check for default behaviour)
    measurementPeriod,
  });

  let evaluationParams: EvaluationParameters = {
    operationArgs,
    outputPath,
    testPath,
  };
  return evaluationParams;
}

function getCqlCommandArgs({
  fhirVersion,
  optionsPath,
  libraryDirectory,
  libraryName,
  expression,
  terminologyPath,
  connection,
  contexts,
  measurementPeriod,
}: {
  fhirVersion: string;
  optionsPath: URI;
  libraryDirectory: URI;
  libraryName: string;
  expression: string | undefined;
  terminologyPath: URI;
  connection: Connection | undefined;
  contexts: Map<string, Context>;
  measurementPeriod: string;
}): string[] {
  const args = ['cql'];

  args.push(`-fv=${fhirVersion}`);
  if (optionsPath && fs.existsSync(optionsPath.fsPath)) {
    args.push(`-op=${optionsPath}`);
  }
  const modelType = 'FHIR';
  let modelPath: string | undefined = connection?.endpoint;

  if (contexts) {
    contexts.forEach((value: Context, key: string) => {
      args.push(`-ln=${libraryName}`);
      args.push(`-lu=${libraryDirectory}`);

      if (expression && expression != undefined) {
        args.push(`-e=${expression}`);
      }

      if (terminologyPath) {
        args.push(`-t=${terminologyPath}`);
      }

      if (connection?.name === 'Local') {
        // connection.endpoint = projectPath.toString(); Can't use projectPath because Evaluator is not ok with cql-option.json and other files that are not fhir resources.
        modelPath = key;
      }
      if (modelPath) {
        args.push(`-m=${modelType}`);
        args.push(`-mu=${modelPath}`);
      }

      if (measurementPeriod && measurementPeriod !== '') {
        args.push(`-p=${libraryName}."Measurement Period"`);
        args.push(`-pv=${measurementPeriod}`);
      }
      args.push(`-c=${value.resourceType}`);
      args.push(`-cv=${value.resourceID}`);
    });
  }

  return args;
}

function getLocalContexts(testPath: URI, libraryName: string): Map<string, Context> {
  let testCases: Map<string, Context> = new Map<string, Context>();
  if (!fs.existsSync(testPath.fsPath)) {
    return testCases;
  }
  let directories = glob
    .sync(testPath.fsPath + `/**/${libraryName}`)
    .filter(d => fs.statSync(d).isDirectory());
  for (let dir of directories) {
    let cases = fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory());
    for (let c of cases) {
      // Should really be reading in Patient Resources and getting the ids and everything should be based on a repository like in the evaluator
      testCases.set(URI.file(path.join(dir, c)).toString(), {
        resourceType: 'Patient',
        resourceID: c,
      });
      // path: URI.file(path.join(dir, c))  For Patient specific directory
    }
  }
  return testCases;
}

function getFhirVersion(): string {
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
  window.showInformationMessage('Unable to determine version of FHIR used. Defaulting to R4.');
  return 'R4';
}
