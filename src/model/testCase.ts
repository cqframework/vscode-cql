import { glob } from 'glob';
import * as fs from 'node:fs';
import path from 'node:path';
import { Uri } from 'vscode';

export interface TestCase {
  name?: string;
  path?: Uri;
  description?: string;
}

export interface TestCaseExclusion {
  library: string;
  testCase: string;
  reason: string;
}

/**
 * Get the test cases to execute
 * @param testPath the root path to look for test cases
 * @returns a list of test cases to execute
 */
export function getTestCases(
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
      testCases.push({
        name: c,
        path: Uri.file(path.join(dir, c)),
        description: getMeasureReportDescription(Uri.file(path.join(dir, c))),
      });
    }
  }

  return testCases;
}

const TEST_CASE_DESCRIPTION_URL =
  'http://hl7.org/fhir/us/cqfmeasures/StructureDefinition/cqfm-testCaseDescription';

export function getMeasureReportDescription(testCaseFolderPath: Uri): string | undefined {
  if (!fs.existsSync(testCaseFolderPath.fsPath)) {
    return undefined;
  }

  const measureReportFile = fs
    .readdirSync(testCaseFolderPath.fsPath)
    .find(f => f.startsWith('MeasureReport'));

  if (!measureReportFile) {
    return undefined;
  }

  const content = fs.readFileSync(path.join(testCaseFolderPath.fsPath, measureReportFile), 'utf-8');
  const report = JSON.parse(content);

  const extension = (
    report.extension as { url: string; valueMarkdown?: string }[] | undefined
  )?.find(e => e.url === TEST_CASE_DESCRIPTION_URL);

  return extension?.valueMarkdown;
}
