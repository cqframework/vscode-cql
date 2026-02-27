import * as fs from 'fs';
import path from 'node:path';
import { Uri } from 'vscode';
import { Commands } from '../commands/commands';
import { sendRequest } from '../cql-language-server/cqlLanguageClient';
import { TestCase } from '../model/testCase';

export async function executeCql(
  cqlFileUri: Uri,
  testCases: Array<TestCase>,
  terminologyUri: Uri,
  fhirVersion: string,
  optionsPath: Uri,
  rootDir: Uri,
  contextValue?: string,
  measurementPeriod?: string,
): Promise<string> {
  let testCasesArgs: string[] = [];
  for (let testCase of testCases) {
    testCasesArgs.push(
      ...getExecArgs(
        cqlFileUri,
        testCase.path,
        terminologyUri,
        contextValue ?? testCase.name,
        measurementPeriod,
      ),
    );
  }

  let operationArgs = getCqlCommandArgs(fhirVersion, optionsPath, rootDir);
  operationArgs.push(...testCasesArgs);
  return await sendRequest(Commands.EXECUTE_CQL, operationArgs);
}

function getCqlCommandArgs(fhirVersion: string, optionsPath: Uri, rootDir: Uri): string[] {
  const args = ['cql'];

  args.push(`-fv=${fhirVersion}`);

  if (optionsPath && fs.existsSync(optionsPath.fsPath)) {
    args.push(`-op=${optionsPath}`);
  }

  if (rootDir) {
    args.push(`-rd=${rootDir}`);
  }

  return args;
}

function getExecArgs(
  cqlFileUri: Uri,
  testCaseUri?: Uri,
  terminologyUri?: Uri,
  contextValue?: string,
  measurementPeriod?: string,
): string[] {
  // TODO: One day we might support other models and contexts
  const modelType = 'FHIR';
  const contextType = 'Patient';

  let args: string[] = [];
  args.push(
    `-ln=${path.basename(cqlFileUri.fsPath, '.cql')}`,
    `-lu=${Uri.file(path.dirname(cqlFileUri.fsPath))}`,
  );

  if (testCaseUri) {
    args.push(`-m=${modelType}`, `-mu=${testCaseUri}`);
  }

  if (terminologyUri) {
    args.push(`-t=${terminologyUri}`);
  }

  if (contextValue) {
    args.push(`-c=${contextType}`, `-cv=${contextValue}`);
  }

  if (measurementPeriod && measurementPeriod !== '') {
    args.push(
      `-p=${path.basename(cqlFileUri.fsPath)}."Measurement Period"`,
      `-pv=${measurementPeriod}`,
    );
  }

  return args;
}
