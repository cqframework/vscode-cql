import * as fs from 'fs';
import path from 'node:path';
import { Uri } from 'vscode';
import { Commands } from '../commands/commands';
import { sendRequest } from '../cql-language-server/cqlLanguageClient';
import { CqlParametersConfig } from '../model/parameters';
import { resolveParameters } from '../helpers/parametersHelper';
import { extractLibraryVersion } from '../helpers/fileHelper';
import { TestCase } from '../model/testCase';

export interface ExecuteCqlResponse {
  results: LibraryResult[];
  logs: string[];
}

export interface LibraryResult {
  libraryName: string;
  expressions: ExpressionResult[];
  usedDefaultParameters?: Array<{ name: string; value: string; source: string }>;
}

export interface ExpressionResult {
  name: string;
  value: string;
}

interface ExecuteCqlRequest {
  fhirVersion: string;
  rootDir: string | null;
  optionsPath: string | null;
  libraries: LibraryRequest[];
}

interface ParameterRequest {
  parameterName: string;
  parameterType: string;
  parameterValue: string;
}

interface LibraryRequest {
  libraryName: string;
  libraryUri: string;
  libraryVersion: string | null;
  terminologyUri: string | null;
  model: { modelName: string; modelUri: string } | null;
  context: { contextName: string; contextValue: string } | null;
  parameters: ParameterRequest[];
}

export async function executeCql(
  cqlFileUri: Uri,
  testCases: Array<TestCase>,
  terminologyUri: Uri,
  fhirVersion: string,
  optionsPath: Uri,
  rootDir: Uri,
  contextValue?: string,
  parametersConfig?: CqlParametersConfig,
  libraryVersion?: string,
): Promise<ExecuteCqlResponse> {
  const request = buildRequest(
    cqlFileUri,
    testCases,
    terminologyUri,
    fhirVersion,
    optionsPath,
    rootDir,
    contextValue,
    parametersConfig,
    libraryVersion,
  );
  return await sendRequest(Commands.EXECUTE_CQL, [request]);
}

export function buildRequest(
  cqlFileUri: Uri,
  testCases: Array<TestCase>,
  terminologyUri: Uri,
  fhirVersion: string,
  optionsPath: Uri,
  rootDir: Uri,
  contextValue?: string,
  parametersConfig?: CqlParametersConfig,
  libraryVersion?: string,
): ExecuteCqlRequest {
  const libraryName = path.basename(cqlFileUri.fsPath, '.cql');
  const libraryUri = Uri.file(path.dirname(cqlFileUri.fsPath)).toString();
  // Only read the CQL file when parametersConfig is present and no explicit version is given.
  const resolvedLibraryVersion = parametersConfig
    ? (libraryVersion ?? extractLibraryVersion(fs.readFileSync(cqlFileUri.fsPath, 'utf-8')))
    : undefined;

  const optionsPathStr =
    optionsPath && fs.existsSync(optionsPath.fsPath) ? optionsPath.toString() : null;
  const rootDirStr = rootDir ? rootDir.toString() : null;
  const terminologyUriStr =
    terminologyUri && fs.existsSync(terminologyUri.fsPath) ? terminologyUri.toString() : null;

  const libraries: LibraryRequest[] = testCases.map(testCase => {
    const cv = contextValue ?? testCase.name;
    const resolved = parametersConfig
      ? resolveParameters(parametersConfig, libraryName, resolvedLibraryVersion, cv)
      : [];
    const parameters: ParameterRequest[] = resolved.map(p => ({
      parameterName: p.name,
      parameterType: p.type,
      parameterValue: p.value,
    }));

    return {
      libraryName,
      libraryUri,
      libraryVersion: null,
      terminologyUri: terminologyUriStr,
      model: testCase.path
        ? { modelName: 'FHIR', modelUri: Uri.file(testCase.path.fsPath).toString() }
        : null,
      context: cv ? { contextName: 'Patient', contextValue: cv } : null,
      parameters,
    };
  });

  return {
    fhirVersion,
    rootDir: rootDirStr,
    optionsPath: optionsPathStr,
    libraries,
  };
}
