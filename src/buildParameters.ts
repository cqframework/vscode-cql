import { Uri, window, workspace } from 'vscode';
import { URI, Utils } from 'vscode-uri';

import * as fs from 'fs';
import * as fse from 'fs-extra';
import { Connection, ConnectionManager } from './connectionManager';

export type EvaluationParameters = {
  operationArgs: string[] | undefined;
  outputPath: Uri | undefined;
  testPath: Uri | undefined;
};

export function buildParameters(uri: Uri, expression: string | undefined | null): EvaluationParameters {
  if (!fs.existsSync(uri.fsPath)) {
    window.showInformationMessage('No library content found. Please save before executing.');
    return { operationArgs: undefined, outputPath: undefined, testPath: undefined };
  }

  const libraryDirectory = Utils.dirname(uri);
  const libraryName = Utils.basename(uri).replace('.cql', '').split('-')[0];
  const projectPath = workspace.getWorkspaceFolder(uri)!.uri;
  let terminologyPath: Uri = Utils.resolvePath(projectPath, 'input', 'vocabulary', 'valueset');
  let fhirVersion = getFhirVersion();
  const optionsPath = Utils.resolvePath(libraryDirectory, 'cql-options.json');
  const measurementPeriod = '';
  const testPath = Utils.resolvePath(projectPath, 'input', 'tests');
  const resultPath = Utils.resolvePath(testPath, 'results');
  const outputPath = Utils.resolvePath(resultPath, `${libraryName}.txt`);

  fse.ensureFileSync(outputPath.fsPath);
  
  const connectionManager = mockConnectionManager();
  let operationArgs = getCqlCommandArgs(fhirVersion, optionsPath,
    libraryDirectory,
    libraryName,
    expression,
    terminologyPath,
    connectionManager,
    measurementPeriod);

  let evaluationParams: EvaluationParameters = {
    operationArgs,
    outputPath,
    testPath
  };
  return evaluationParams;
}

function getCqlCommandArgs(
  fhirVersion: string,
  optionsPath: Uri,
  libraryDirectory: Uri,
  libraryName: string,
  expression : string | undefined | null,
  terminologyPath: Uri | null,
  connectionManager : ConnectionManager,
  measurementPeriod: string): string[] {
  const args = ['cql'];

  args.push(`-fv=${fhirVersion}`);
  if (optionsPath && fs.existsSync(optionsPath.fsPath)) {
    args.push(`-op=${optionsPath}`);
  }

  let connection = connectionManager.getCurrentConnection();
  let modelPath : string | undefined = connection?.endpoint;
  let contexts = connectionManager.getCurrentContexts();
  const modelType = 'FHIR';
  
  if (contexts) {
    Object.entries(contexts).forEach(([key, value]) => {
  args.push(`-ln=${libraryName}`);
  args.push(`-lu=${libraryDirectory}`);

  if (expression && expression != undefined && expression != null) {
    args.push(`-e=${expression}`)
  }

  if (terminologyPath) {
    args.push(`-t=${terminologyPath}`);
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
  } );
  }

  return args;
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

const mockConnectionManager = () => {
  const mockData: Record<string, Connection> = {
    "Connection1": {
      name: "Remote Connection",
      endpoint: new URL("http://localhost:8000").href,
      contexts: {
        "Patient/R-3868": {
          resourceID: "R-3868",
          resourceType: "Patient",
          resourceDisplay: "MIPS116_TC_12"
        },
        "Patient/R-4726": {
          resourceID: "R-4726",
          resourceType: "Patient",
          resourceDisplay: "MIPS116_TC_14"
        }
      }
    },
    "Connection2": {
      name: "Local Connection",
      endpoint: URI.file("/Users/joshuareynolds/Documents/src/dqm-content-r4/input/tests/measure/CMS165/CMS165-patient-10").toString(),
      contexts: {
        "Patient/CMS165-patient-10": {
          resourceID: "CMS165-patient-10",
          resourceType: "Patient",
          resourceDisplay: "John Doe"
        }, 
        "Patient/CMS165-patient-11": {
          resourceID: "CMS165-patient-11",
          resourceType: "Patient",
          resourceDisplay: "John Doe"
        }
      }
    }
  };

  const manager = new ConnectionManager();
  
  Object.values(mockData).forEach(connection => {
    manager.upsertConnection(connection);
  });

  manager.setCurrentConnection("Local Connection");

  return manager;
};

