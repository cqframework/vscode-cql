import * as fs from 'fs';
import * as fse from 'fs-extra';
import { glob } from 'glob';
import path from 'path';
import { window, workspace } from 'vscode';
import { URI, Utils } from 'vscode-uri';
import { Connection, ConnectionManager, Context } from './connectionManager';

export type EvaluationParameters = {
  operationArgs: string[] | undefined;
  outputPath: URI | undefined;
  testPath: URI | undefined;
};

/**
 * Builds the parameters required for CQL evaluation.
 * @param {URI} uri - The URI of the CQL file.
 * @param {string | undefined} expression - The specific CQL expression to evaluate, if any.
 * @returns {EvaluationParameters} The parameters required for the CQL evaluation.
 */
export function buildParameters(uri: URI, expression: string | undefined): EvaluationParameters {
  if (!fs.existsSync(uri.fsPath)) {
    window.showInformationMessage('No library content found. Please save before executing.');
    return {
      operationArgs: undefined,
      outputPath: undefined,
      testPath: undefined,
    };
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
    contexts:
      contexts != undefined && connection?.name !== 'Local' && Object.values(contexts).length > 0
        ? new Map(Object.entries(contexts).map(([key, context]) => [key, context]))
        : getLocalContexts(testPath, libraryName),
    measurementPeriod,
  });

  let evaluationParams: EvaluationParameters = {
    operationArgs,
    outputPath,
    testPath,
  };
  return evaluationParams;
}

/**
 * Generates the command-line arguments required for CQL evaluation.
 * @param {object} params - The parameters needed to construct the command-line arguments.
 * @param {string} params.fhirVersion - The FHIR version being used.
 * @param {URI} params.optionsPath - The path to the CQL options file.
 * @param {URI} params.libraryDirectory - The directory of the CQL library.
 * @param {string} params.libraryName - The name of the CQL library.
 * @param {string | undefined} params.expression - The specific CQL expression to evaluate, if any.
 * @param {URI} params.terminologyPath - The path to the FHIR terminology.
 * @param {Connection | undefined} params.connection - The current connection information.
 * @param {Map<string, Context>} params.contexts - The execution contexts for the evaluation.
 * @param {string} params.measurementPeriod - The measurement period to be used.
 * @returns {string[]} The command-line arguments for the CQL evaluation.
 */
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

/**
 * Retrieves the local contexts for CQL evaluation based on the test path.
 * @param {URI} testPath - The URI of the test directory.
 * @param {string} libraryName - The name of the CQL library.
 * @returns {Map<string, Context>} A map of local contexts for CQL evaluation.
 */
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
      testCases.set(URI.file(path.join(dir, c)).toString(), {
        resourceType: 'Patient',
        resourceID: c,
      });
    }
  }
  return testCases;
}

/**
 * Determines the FHIR version used in the active text editor.
 * @returns {string} The FHIR version (e.g., 'R4').
 */
function getFhirVersion(): string {
  const fhirVersionRegex = /using (FHIR|"FHIR") version '(\d(.|\d)*)'/;
  const matches = window.activeTextEditor?.document.getText().match(fhirVersionRegex);
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
