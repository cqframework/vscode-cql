import { expect } from 'chai';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DeviationKind, detectIgProjects, findTestCasesFolder } from '../../../cql-explorer/igLayoutDetector';

// Helper: create a directory and any missing parents
function mkdir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

suite('detectIgProjects()', () => {
  let testDir: string;

  setup(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-ig-test-'));
  });

  teardown(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('single project detected via input/cql/', () => {
    mkdir(path.join(testDir, 'input', 'cql'));
    const projects = detectIgProjects(testDir);
    expect(projects).to.have.length(1);
    expect(projects[0].root).to.equal(testDir);
    expect(projects[0].deviations).to.be.empty;
  });

  test('single project detected via ig.ini', () => {
    fs.writeFileSync(path.join(testDir, 'ig.ini'), '[IG]\nig=input/ImplementationGuide.json\n');
    const projects = detectIgProjects(testDir);
    expect(projects).to.have.length(1);
    expect(projects[0].root).to.equal(testDir);
    expect(projects[0].deviations).to.be.empty;
  });

  test('multi-project: two sub-directories each with input/cql/', () => {
    mkdir(path.join(testDir, 'A', 'input', 'cql'));
    mkdir(path.join(testDir, 'B', 'input', 'cql'));
    const projects = detectIgProjects(testDir);
    expect(projects).to.have.length(2);
    const roots = projects.map(p => p.root).sort();
    expect(roots).to.deep.equal(
      [path.join(testDir, 'A'), path.join(testDir, 'B')].sort(),
    );
    for (const p of projects) {
      expect(p.deviations).to.include(DeviationKind.MULTI_PROJECT_WORKSPACE);
    }
  });

  test('multi-project: one sub-dir with input/cql/, one with ig.ini', () => {
    mkdir(path.join(testDir, 'A', 'input', 'cql'));
    fs.mkdirSync(path.join(testDir, 'B'));
    fs.writeFileSync(path.join(testDir, 'B', 'ig.ini'), '[IG]\n');
    const projects = detectIgProjects(testDir);
    expect(projects).to.have.length(2);
    for (const p of projects) {
      expect(p.deviations).to.include(DeviationKind.MULTI_PROJECT_WORKSPACE);
    }
  });

  test('empty workspace returns empty array', () => {
    const projects = detectIgProjects(testDir);
    expect(projects).to.be.empty;
  });

  test('workspace root with ig.ini is treated as single project (sub-dirs ignored)', () => {
    fs.writeFileSync(path.join(testDir, 'ig.ini'), '[IG]\n');
    mkdir(path.join(testDir, 'sub', 'input', 'cql'));
    const projects = detectIgProjects(testDir);
    expect(projects).to.have.length(1);
    expect(projects[0].root).to.equal(testDir);
    expect(projects[0].deviations).to.be.empty;
  });
});

suite('findTestCasesFolder()', () => {
  let testDir: string;

  setup(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-tc-test-'));
  });

  teardown(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('IG Publisher compliant layout: Library/', () => {
    mkdir(path.join(testDir, 'input', 'tests', 'Library', 'FhirHelpers'));
    const result = findTestCasesFolder(testDir, 'FhirHelpers');
    expect(result.folder).to.equal(path.join(testDir, 'input', 'tests', 'Library', 'FhirHelpers'));
    expect(result.deviations).to.be.empty;
  });

  test('IG Publisher compliant layout: Measure/', () => {
    mkdir(path.join(testDir, 'input', 'tests', 'Measure', 'MyMeasure'));
    const result = findTestCasesFolder(testDir, 'MyMeasure');
    expect(result.folder).to.equal(path.join(testDir, 'input', 'tests', 'Measure', 'MyMeasure'));
    expect(result.deviations).to.be.empty;
  });

  test('flat layout returns MISSING_RESOURCE_TYPE', () => {
    mkdir(path.join(testDir, 'input', 'tests', 'FhirHelpers'));
    const result = findTestCasesFolder(testDir, 'FhirHelpers');
    expect(result.folder).to.equal(path.join(testDir, 'input', 'tests', 'FhirHelpers'));
    expect(result.deviations).to.include(DeviationKind.MISSING_RESOURCE_TYPE);
  });

  test('unknown type dir (old measure/ convention) returns UNKNOWN_RESOURCE_TYPE', () => {
    mkdir(path.join(testDir, 'input', 'tests', 'measure', 'FhirHelpers'));
    const result = findTestCasesFolder(testDir, 'FhirHelpers');
    expect(result.folder).to.equal(
      path.join(testDir, 'input', 'tests', 'measure', 'FhirHelpers'),
    );
    expect(result.deviations).to.include(DeviationKind.UNKNOWN_RESOURCE_TYPE);
    expect(result.resourceTypeDir).to.equal('measure');
  });

  test('no test cases found returns null folder', () => {
    mkdir(path.join(testDir, 'input', 'tests'));
    const result = findTestCasesFolder(testDir, 'NoTestLib');
    expect(result.folder).to.be.null;
  });

  test('compliant layout wins over flat when both exist', () => {
    mkdir(path.join(testDir, 'input', 'tests', 'Library', 'FhirHelpers'));
    mkdir(path.join(testDir, 'input', 'tests', 'FhirHelpers'));
    const result = findTestCasesFolder(testDir, 'FhirHelpers');
    expect(result.folder).to.equal(
      path.join(testDir, 'input', 'tests', 'Library', 'FhirHelpers'),
    );
    expect(result.deviations).to.be.empty;
  });

  test('missing input/tests/ directory returns null folder', () => {
    const result = findTestCasesFolder(testDir, 'SomeLib');
    expect(result.folder).to.be.null;
  });

  suite('pre-supplied typeDirEntries', () => {
    test('uses supplied entries instead of reading disk (empty entries → null folder)', () => {
      // Create the directory on disk, but supply empty entries — disk should NOT be read.
      mkdir(path.join(testDir, 'input', 'tests', 'Measure', 'FhirHelpers'));
      // Passing [] means no type dirs are found, so the result must be null.
      const result = findTestCasesFolder(testDir, 'FhirHelpers', []);
      expect(result.folder).to.be.null;
      expect(result.deviations).to.be.empty;
    });

    test('compliant layout found via pre-supplied entries', () => {
      mkdir(path.join(testDir, 'input', 'tests', 'Measure', 'FhirHelpers'));
      const entries = fs.readdirSync(path.join(testDir, 'input', 'tests'), { withFileTypes: true });
      const result = findTestCasesFolder(testDir, 'FhirHelpers', entries);
      expect(result.folder).to.equal(
        path.join(testDir, 'input', 'tests', 'Measure', 'FhirHelpers'),
      );
      expect(result.deviations).to.be.empty;
    });

    test('flat layout found via pre-supplied entries', () => {
      mkdir(path.join(testDir, 'input', 'tests', 'FhirHelpers'));
      const entries = fs.readdirSync(path.join(testDir, 'input', 'tests'), { withFileTypes: true });
      const result = findTestCasesFolder(testDir, 'FhirHelpers', entries);
      expect(result.folder).to.equal(path.join(testDir, 'input', 'tests', 'FhirHelpers'));
      expect(result.deviations).to.include(DeviationKind.MISSING_RESOURCE_TYPE);
    });

    test('unknown resource type dir found via pre-supplied entries', () => {
      mkdir(path.join(testDir, 'input', 'tests', 'measure', 'FhirHelpers'));
      const entries = fs.readdirSync(path.join(testDir, 'input', 'tests'), { withFileTypes: true });
      const result = findTestCasesFolder(testDir, 'FhirHelpers', entries);
      expect(result.folder).to.equal(
        path.join(testDir, 'input', 'tests', 'measure', 'FhirHelpers'),
      );
      expect(result.deviations).to.include(DeviationKind.UNKNOWN_RESOURCE_TYPE);
      expect(result.resourceTypeDir).to.equal('measure');
    });
  });
});
