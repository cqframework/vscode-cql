import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Uri } from 'vscode';
import {
  getExcludedTestCases,
  getFhirVersion,
  getLibraries,
  loadTestConfig,
} from '../../../commands/execute-cql';
import { TestCaseExclusion } from '../../../model/testCase';

suite('getFhirVersion()', () => {
  test('returns R4 for FHIR 4.x version', () => {
    expect(getFhirVersion("using FHIR version '4.0.1'")).to.equal('R4');
  });

  test('returns DSTU2 for FHIR 2.x version', () => {
    expect(getFhirVersion("using FHIR version '2.0'")).to.equal('DSTU2');
  });

  test('returns DSTU3 for FHIR 3.x version', () => {
    expect(getFhirVersion("using FHIR version '3.0.2'")).to.equal('DSTU3');
  });

  test('returns R5 for FHIR 5.x version', () => {
    expect(getFhirVersion("using FHIR version '5.0.0'")).to.equal('R5');
  });

  test('returns null when no FHIR version declaration', () => {
    expect(getFhirVersion("library Foo version '1.0'")).to.be.null;
  });

  test('handles quoted FHIR keyword', () => {
    expect(getFhirVersion('using "FHIR" version \'4.0.1\'')).to.equal('R4');
  });

  test('returns null for empty string', () => {
    expect(getFhirVersion('')).to.be.null;
  });

  test('extracts version from multi-line CQL content', () => {
    const content = `library Foo version '1.0'\n\nusing FHIR version '4.0.1'\n\ncontext Patient`;
    expect(getFhirVersion(content)).to.equal('R4');
  });
});

suite('getExcludedTestCases()', () => {
  const exclusions: TestCaseExclusion[] = [
    { library: 'FooLib', testCase: 'TC1', reason: 'bug #1' },
    { library: 'FooLib', testCase: 'TC2', reason: 'bug #2' },
    { library: 'BarLib', testCase: 'TC3', reason: 'bug #3' },
  ];

  test('returns entries matching the library', () => {
    const result = getExcludedTestCases('FooLib', exclusions);
    expect(result.size).to.equal(2);
    expect(result.get('TC1')).to.equal('bug #1');
    expect(result.get('TC2')).to.equal('bug #2');
  });

  test('does not include entries from a different library', () => {
    const result = getExcludedTestCases('FooLib', exclusions);
    expect(result.has('TC3')).to.be.false;
  });

  test('returns empty map when no match', () => {
    const result = getExcludedTestCases('UnknownLib', exclusions);
    expect(result.size).to.equal(0);
  });

  test('returns empty map for empty exclusion list', () => {
    const result = getExcludedTestCases('FooLib', []);
    expect(result.size).to.equal(0);
  });
});

suite('loadTestConfig()', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-test-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty testCasesToExclude when file does not exist', () => {
    const result = loadTestConfig(Uri.file(path.join(tmpDir, 'nonexistent.json')));
    expect(result.testCasesToExclude).to.deep.equal([]);
  });

  test('returns parsed exclusions from valid config file', () => {
    const config = {
      testCasesToExclude: [{ library: 'Lib', testCase: 'TC1', reason: 'reason' }],
    };
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    const result = loadTestConfig(Uri.file(configPath));
    expect(result.testCasesToExclude).to.deep.equal(config.testCasesToExclude);
  });

  test('returns empty testCasesToExclude when JSON is malformed', () => {
    const configPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(configPath, 'NOT VALID JSON {{');
    const result = loadTestConfig(Uri.file(configPath));
    expect(result.testCasesToExclude).to.deep.equal([]);
  });
});

suite('getLibraries()', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-test-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty array when directory does not exist', () => {
    const result = getLibraries(Uri.file(path.join(tmpDir, 'nonexistent')));
    expect(result).to.deep.equal([]);
  });

  test('returns CQL files in the directory', () => {
    fs.writeFileSync(path.join(tmpDir, 'LibA.cql'), '');
    fs.writeFileSync(path.join(tmpDir, 'LibB.cql'), '');
    fs.writeFileSync(path.join(tmpDir, 'options.json'), '');
    const result = getLibraries(Uri.file(tmpDir));
    const names = result.map(u => path.basename(u.fsPath)).sort();
    expect(names).to.deep.equal(['LibA.cql', 'LibB.cql']);
  });

  test('returns CQL files in subdirectories', () => {
    const sub = path.join(tmpDir, 'sub');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'LibC.cql'), '');
    const result = getLibraries(Uri.file(tmpDir));
    const names = result.map(u => path.basename(u.fsPath));
    expect(names).to.include('LibC.cql');
  });

  test('returns only files, not directories', () => {
    fs.writeFileSync(path.join(tmpDir, 'LibA.cql'), '');
    fs.mkdirSync(path.join(tmpDir, 'NotAFile.cql'));
    const result = getLibraries(Uri.file(tmpDir));
    expect(result).to.have.lengthOf(1);
    expect(path.basename(result[0].fsPath)).to.equal('LibA.cql');
  });
});
