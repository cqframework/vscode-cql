import { glob } from 'glob';
import { ParseError, parse as parseJsonc } from 'jsonc-parser';
import * as fs from 'node:fs';
import { ProgressLocation, Uri, window } from 'vscode';
import { Utils } from 'vscode-uri';
import { CqlLibrary, CqlProject, CqlProjectEvents } from '../model/cqlProject';
import { CqlSolution } from '../model/cqlSolution';
import { CqlParametersConfig } from '../model/parameters';
import { TestCaseExclusion } from '../model/testCase';
import * as log from '../log-services/logger';
import { toGlobPath } from './fileHelper';

export interface CqlPaths {
  libraryDirectoryPath: Uri;
  projectDirectoryPath: Uri;
  optionsPath: Uri;
  resultDirectoryPath: Uri;
  terminologyDirectoryPath: Uri;
  testConfigPath: Uri;
  testDirectoryPath: Uri;
}

export interface TestConfig {
  testCasesToExclude: TestCaseExclusion[];
  parameters?: CqlParametersConfig;
  resultFormat: 'individual' | 'flat';
  flatResultsInSubfolder?: boolean;
}

const DEFAULT_TEST_CONFIG: TestConfig = { testCasesToExclude: [], resultFormat: 'flat', flatResultsInSubfolder: false }

export function resolveTestConfigPath(testDirectoryPath: Uri): Uri {
  const jsoncPath = Utils.resolvePath(testDirectoryPath, 'config.jsonc');
  if (fs.existsSync(jsoncPath.fsPath)) {
    return jsoncPath;
  }
  return Utils.resolvePath(testDirectoryPath, 'config.json');
}

export function getCqlPaths(cqlFileUri: Uri): CqlPaths | undefined {
  const project = CqlSolution.getCurrent().findProjectForUri(cqlFileUri);
  if (!project) {
    window.showErrorMessage('Unable to determine path to project root.');
    return;
  }
  const projectDirectoryPath = Uri.file(project.igRoot);
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
    testConfigPath: resolveTestConfigPath(testDirectoryPath),
    testDirectoryPath: testDirectoryPath,
  };
}

export function getExcludedTestCases(
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

export function getFhirVersion(cqlContent: string): string | null {
  const fhirMatch = cqlContent.match(/using\s+(?:FHIR|"FHIR")\s+version\s+'(\d[^']*)'/);
  if (fhirMatch) {
    const v = fhirMatch[1];
    if (v.startsWith('2')) return 'DSTU2';
    if (v.startsWith('3')) return 'DSTU3';
    if (v.startsWith('4')) return 'R4';
    if (v.startsWith('5')) return 'R5';
  }

  const qicoreMatch = cqlContent.match(/using\s+(?:QICore|"QICore")\s+version\s+'(\d[^']*)'/);
  if (qicoreMatch) {
    return qicoreMatch[1].startsWith('3') ? 'DSTU3' : 'R4';
  }

  if (/using\s+(?:USCore|"USCore")\s+version\s+'/.test(cqlContent)) {
    return 'R4';
  }

  return null;
}

export function getLibraries(libraryPath: Uri): Array<Uri> {
  if (!fs.existsSync(libraryPath.fsPath)) {
    log.warn(`unable to find libraries @ ${libraryPath.fsPath}`);
    return [];
  }
  return glob
    .sync(`${toGlobPath(libraryPath.fsPath)}/**/*.cql`)
    .filter(f => fs.statSync(f).isFile())
    .map(f => Uri.file(f));
}

export function loadTestConfig(testConfigPath: Uri): TestConfig {
  if (!fs.existsSync(testConfigPath.fsPath)) {
    log.info('No test config file found, using default settings', testConfigPath.fsPath);
    return DEFAULT_TEST_CONFIG;
  }
  try {
    const jsonString = fs.readFileSync(testConfigPath.fsPath, 'utf-8');
    const errors: ParseError[] = [];
    const parsed = parseJsonc(jsonString, errors) as TestConfig;
    if (errors.length > 0) {
      log.error('Error parsing config file', errors);
      return DEFAULT_TEST_CONFIG;
    }
    return {
      ...parsed,
      testCasesToExclude: parsed.testCasesToExclude ?? DEFAULT_TEST_CONFIG.testCasesToExclude,
      resultFormat: parsed.resultFormat ?? DEFAULT_TEST_CONFIG.resultFormat,
      flatResultsInSubfolder: parsed.flatResultsInSubfolder ?? DEFAULT_TEST_CONFIG.flatResultsInSubfolder,
    };
  } catch (error) {
    log.error('Error reading config file', error);
    return { ...DEFAULT_TEST_CONFIG };
  }
}

export async function waitForTestCasesLoaded(
  library: CqlLibrary,
  project: CqlProject,
  showProgress: boolean,
): Promise<void> {
  if (library.testCaseLoadState === 'loaded') return;

  const waitPromise = new Promise<void>(resolve => {
    const handler = (loaded: CqlLibrary) => {
      if (loaded === library) {
        project.off(CqlProjectEvents.LIBRARY_TESTCASES_LOADED, handler);
        resolve();
      }
    };
    project.on(CqlProjectEvents.LIBRARY_TESTCASES_LOADED, handler);
    if (library.testCaseLoadState === 'not-loaded') {
      project.loadTestCasesForLibrary(library).catch(() => {});
    }
  });

  if (showProgress) {
    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: `Loading ${library.name}\u2026`,
        cancellable: false,
      },
      () => waitPromise,
    );
  } else {
    await waitPromise;
  }
}
