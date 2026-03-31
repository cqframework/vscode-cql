import { glob } from 'glob';
import * as fs from 'node:fs';
import path from 'node:path';
import removeMarkdown from 'markdown-to-text';
import { Uri } from 'vscode';
import { toGlobPath } from '../helpers/fileHelper';
import * as log from '../log-services/logger';

export interface TestCase {
  name?: string;
  path?: Uri;
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
    .sync(`${toGlobPath(testPath.fsPath)}/**/${libraryName}`)
    .filter(d => fs.statSync(d).isDirectory());
  for (let dir of directories) {
    let cases = fs
      .readdirSync(dir)
      .filter(d => fs.statSync(path.join(dir, d)).isDirectory() && !testCasesToExclude.includes(d));
    for (let c of cases) {
      testCases.push({
        name: c,
        path: Uri.file(path.join(dir, c)),
      });
    }
  }

  return testCases;
}

export interface MeasureReportPopulation {
  groupId: string;
  display: string;
  expected: number;
  code: string;
}

export interface MeasureReportData {
  patientId?: string;
  populations?: MeasureReportPopulation[];
  description?: string;
}

/**
 * Read a MeasureReport from the given test case folder and return structured data
 * including the subject patient ID and expected population counts per group.
 *
 * Returns `undefined` if the directory does not exist or contains no MeasureReport file.
 */
export function getMeasureReportData(testCaseFolderPath: Uri): MeasureReportData | undefined {
  try {
    if (!fs.existsSync(testCaseFolderPath.fsPath)) {
      return undefined;
    }

    const measureReportFile = fs
      .readdirSync(testCaseFolderPath.fsPath)
      .find(f => f.startsWith('MeasureReport'));

    if (!measureReportFile) {
      return undefined;
    }

    const content = fs.readFileSync(
      path.join(testCaseFolderPath.fsPath, measureReportFile),
      'utf-8',
    );
    const report = JSON.parse(content) as Record<string, unknown>;

    return {
      patientId: extractPatientId(report),
      populations: extractPopulations(report),
      description: extractTestCaseDescription(report),
    };
  } catch (error) {
    log.error('Error while attempting to getMeasureReportData', error);
    return undefined;
  }
}

export function sanitizeDescription(raw: string): string {
  const stripped = removeMarkdown(raw);
  return stripped
    .replace(/[\r\n\x00-\x1F\x7F]/g, ' ')
    .replace(/  +/g, ' ')
    .trim()
    .replace(/^"+|"+$/g, '')
    .trim();
}

const DESCRIPTION_URL =
  'http://hl7.org/fhir/us/cqfmeasures/StructureDefinition/cqfm-testCaseDescription';

export function extractTestCaseDescription(
  report: Record<string, unknown>,
): string | undefined {
  const extensions = report['extension'] as Array<Record<string, unknown>> | undefined;
  const ext = extensions?.find(e => e['url'] === DESCRIPTION_URL);
  const raw = ext?.['valueMarkdown'] as string | undefined;
  return raw ? sanitizeDescription(raw) : undefined;
}

function extractPatientId(report: Record<string, unknown>): string | undefined {
  const contained = report['contained'] as Array<Record<string, unknown>> | undefined;
  const params = contained?.find(r => r['resourceType'] === 'Parameters');
  const parameter = params?.['parameter'] as Array<Record<string, unknown>> | undefined;
  const subject = parameter?.find(p => p['name'] === 'subject');
  return subject?.['valueString'] as string | undefined;
}

function extractPopulations(
  report: Record<string, unknown>,
): MeasureReportPopulation[] | undefined {
  const groups = report['group'] as Array<Record<string, unknown>> | undefined;
  if (!groups) {
    return undefined;
  }

  return groups.flatMap(group => {
    const groupId = group['id'] as string;
    const pops = group['population'] as Array<Record<string, unknown>> | undefined;
    if (!pops) return [];
    return pops.map(pop => {
      const coding = (
        (pop['code'] as Record<string, unknown> | undefined)?.['coding'] as
          | Array<Record<string, unknown>>
          | undefined
      )?.[0];
      return {
        groupId,
        display: (coding?.['display'] as string) ?? '',
        expected: (pop['count'] as number) ?? 0,
        code: (coding?.['code'] as string) ?? '',
      };
    });
  });
}

