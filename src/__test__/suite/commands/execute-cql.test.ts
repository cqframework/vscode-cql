import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Uri } from 'vscode';
import {
  formatResponse,
  getExcludedTestCases,
  getFhirVersion,
  getLibraries,
  loadTestConfig,
  resolveTestConfigPath,
  TestCaseResult,
  writeIndividualResultFiles,
} from '../../../commands/execute-cql';
import { ExecuteCqlResponse } from '../../../cql-service/cqlService.executeCql';
import { CqlParametersConfig } from '../../../model/parameters';
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

suite('getFhirVersion() — QICore / USCore', () => {
  test('returns R4 for QICore 6.x', () => {
    expect(getFhirVersion("using QICore version '6.0.0'")).to.equal('R4');
  });

  test('returns R4 for QICore 4.x', () => {
    expect(getFhirVersion("using QICore version '4.1.1'")).to.equal('R4');
  });

  test('returns DSTU3 for QICore 3.x', () => {
    expect(getFhirVersion("using QICore version '3.3.0'")).to.equal('DSTU3');
  });

  test('handles quoted QICore keyword', () => {
    expect(getFhirVersion('using "QICore" version \'6.0.0\'')).to.equal('R4');
  });

  test('returns R4 for USCore', () => {
    expect(getFhirVersion("using USCore version '6.1.0'")).to.equal('R4');
  });

  test('handles quoted USCore keyword', () => {
    expect(getFhirVersion('using "USCore" version \'6.1.0\'')).to.equal('R4');
  });

  test('prefers FHIR declaration over QICore when both present', () => {
    const content = "using FHIR version '4.0.1'\nusing QICore version '6.0.0'";
    expect(getFhirVersion(content)).to.equal('R4');
  });

  test('extracts QICore from multi-line CQL content', () => {
    const content = `library AHAOverall version '1.0.000'\n\nusing QICore version '6.0.0'\nusing USCore version '6.1.0'`;
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

  test('returns undefined parameters when config has no parameters field', () => {
    const config = { testCasesToExclude: [] };
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    const result = loadTestConfig(Uri.file(configPath));
    expect(result.parameters).to.be.undefined;
  });

  test('returns parsed parameters when config includes parameters field', () => {
    const config = {
      testCasesToExclude: [],
      parameters: [
        { name: 'Measurement Period', type: 'Interval<DateTime>', value: 'Interval[@2024-01-01, @2024-12-31]' },
      ],
    };
    const configPath = path.join(tmpDir, 'config.jsonc');
    fs.writeFileSync(configPath, JSON.stringify(config));
    const result = loadTestConfig(Uri.file(configPath));
    expect(result.parameters).to.have.length(1);
    expect((result.parameters![0] as { name: string }).name).to.equal('Measurement Period');
  });

  test('returns undefined resultFormat when config has no resultFormat field', () => {
    const config = { testCasesToExclude: [] };
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    const result = loadTestConfig(Uri.file(configPath));
    expect(result.resultFormat).to.be.undefined;
  });

  test('returns individual resultFormat when config specifies individual', () => {
    const config = { testCasesToExclude: [], resultFormat: 'individual' };
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    const result = loadTestConfig(Uri.file(configPath));
    expect(result.resultFormat).to.equal('individual');
  });

  test('returns flat resultFormat when config specifies flat', () => {
    const config = { testCasesToExclude: [], resultFormat: 'flat' };
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    const result = loadTestConfig(Uri.file(configPath));
    expect(result.resultFormat).to.equal('flat');
  });

  test('strips JSONC comments when parsing', () => {
    const jsonc = `{
      // this is a comment
      "testCasesToExclude": [],
      "parameters": [
        /* block comment */
        { "name": "Measurement Period", "type": "Interval<DateTime>", "value": "Interval[@2024-01-01, @2024-12-31]" }
      ]
    }`;
    const configPath = path.join(tmpDir, 'config.jsonc');
    fs.writeFileSync(configPath, jsonc);
    const result = loadTestConfig(Uri.file(configPath));
    expect(result.parameters).to.have.length(1);
  });
});

suite('resolveTestConfigPath()', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-test-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns config.jsonc when both config.jsonc and config.json exist', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.jsonc'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '{}');
    const result = resolveTestConfigPath(Uri.file(tmpDir));
    expect(result.fsPath.endsWith('config.jsonc')).to.be.true;
  });

  test('returns config.jsonc when only config.jsonc exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.jsonc'), '{}');
    const result = resolveTestConfigPath(Uri.file(tmpDir));
    expect(result.fsPath.endsWith('config.jsonc')).to.be.true;
  });

  test('falls back to config.json when config.jsonc does not exist', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '{}');
    const result = resolveTestConfigPath(Uri.file(tmpDir));
    expect(result.fsPath.endsWith('config.json')).to.be.true;
  });

  test('returns config.json when neither file exists', () => {
    const result = resolveTestConfigPath(Uri.file(tmpDir));
    expect(result.fsPath.endsWith('config.json')).to.be.true;
  });
});

suite('formatResponse()', () => {
  test('formats single test case as Name=value with no header', () => {
    const response: ExecuteCqlResponse = {
      results: [
        {
          libraryName: 'MyLib',
          expressions: [
            { name: 'Initial Population', value: '[Encounter(id=abc)]' },
            { name: 'Numerator', value: '[]' },
          ],
        },
      ],
      logs: [],
    };
    const output = formatResponse(response);
    expect(output).to.equal('Initial Population=[Encounter(id=abc)]\nNumerator=[]');
  });

  test('separates multiple test cases with a blank line', () => {
    const response: ExecuteCqlResponse = {
      results: [
        {
          libraryName: 'MyLib',
          expressions: [{ name: 'Initial Population', value: '[Encounter(id=a)]' }],
        },
        {
          libraryName: 'MyLib',
          expressions: [{ name: 'Initial Population', value: '[Encounter(id=b)]' }],
        },
      ],
      logs: [],
    };
    const output = formatResponse(response);
    expect(output).to.equal(
      'Initial Population=[Encounter(id=a)]\n\nInitial Population=[Encounter(id=b)]',
    );
  });

  test('appends Evaluation logs section with blank line when logs are present', () => {
    const response: ExecuteCqlResponse = {
      results: [
        {
          libraryName: 'MyLib',
          expressions: [{ name: 'Numerator', value: '[]' }],
        },
      ],
      logs: ['INFO some log message', 'WARN another message'],
    };
    const output = formatResponse(response);
    expect(output).to.equal(
      'Numerator=[]\n\nEvaluation logs:\nINFO some log message\nWARN another message',
    );
  });

  test('omits Evaluation logs section when logs are empty', () => {
    const response: ExecuteCqlResponse = {
      results: [
        { libraryName: 'MyLib', expressions: [{ name: 'Numerator', value: '[]' }] },
      ],
      logs: [],
    };
    const output = formatResponse(response);
    expect(output).to.not.include('Evaluation logs');
  });

  test('returns empty string for response with no results', () => {
    const response: ExecuteCqlResponse = { results: [], logs: [] };
    expect(formatResponse(response)).to.equal('');
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

suite('writeIndividualResultFiles()', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-test-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function readResult(libraryName: string, patientId: string): TestCaseResult {
    const filePath = path.join(tmpDir, libraryName, `TestCaseResult-${patientId}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TestCaseResult;
  }

  test('writes one JSON file per test case', () => {
    const response: ExecuteCqlResponse = {
      results: [
        { libraryName: 'MyLib', expressions: [{ name: 'IPP', value: '[Encounter(id=a)]' }] },
        { libraryName: 'MyLib', expressions: [{ name: 'IPP', value: '[]' }] },
      ],
      logs: [],
    };
    const testCases = [
      { name: 'patient-1', path: undefined },
      { name: 'patient-2', path: undefined },
    ];

    writeIndividualResultFiles('MyLib', undefined, testCases, response, Uri.file(tmpDir), Date.now());

    expect(fs.existsSync(path.join(tmpDir, 'MyLib', 'TestCaseResult-patient-1.json'))).to.be.true;
    expect(fs.existsSync(path.join(tmpDir, 'MyLib', 'TestCaseResult-patient-2.json'))).to.be.true;
  });

  test('separates errors from results', () => {
    const response: ExecuteCqlResponse = {
      results: [
        {
          libraryName: 'MyLib',
          expressions: [
            { name: 'IPP', value: '[]' },
            { name: 'Error', value: 'Something went wrong' },
          ],
        },
      ],
      logs: [],
    };

    writeIndividualResultFiles('MyLib', undefined, [{ name: 'p1' }], response, Uri.file(tmpDir), Date.now());

    const result = readResult('MyLib', 'p1');
    expect(result.results).to.deep.equal([{ name: 'IPP', value: '[]' }]);
    expect(result.errors).to.deep.equal(['Something went wrong']);
  });

  test('includes libraryName, testCaseName, and executedAt', () => {
    const executedAt = new Date('2026-04-07T12:00:00.000Z').getTime();
    const response: ExecuteCqlResponse = {
      results: [{ libraryName: 'MyLib', expressions: [{ name: 'IPP', value: '[]' }] }],
      logs: [],
    };

    writeIndividualResultFiles('MyLib', undefined, [{ name: 'p1' }], response, Uri.file(tmpDir), executedAt);

    const result = readResult('MyLib', 'p1');
    expect(result.libraryName).to.equal('MyLib');
    expect(result.testCaseName).to.equal('p1');
    expect(result.executedAt).to.equal('2026-04-07T12:00:00.000Z');
  });

  test('uses no-context as patientId when testCase name is undefined', () => {
    const response: ExecuteCqlResponse = {
      results: [{ libraryName: 'MyLib', expressions: [{ name: 'IPP', value: 'null' }] }],
      logs: [],
    };

    writeIndividualResultFiles('MyLib', undefined, [{}], response, Uri.file(tmpDir), Date.now());

    expect(fs.existsSync(path.join(tmpDir, 'MyLib', 'TestCaseResult-no-context.json'))).to.be.true;
    const result = readResult('MyLib', 'no-context');
    expect(result.testCaseName).to.be.null;
  });

  test('default parameters are appended to parameters with source=default', () => {
    const response: ExecuteCqlResponse = {
      results: [
        {
          libraryName: 'MyLib',
          expressions: [{ name: 'IPP', value: '[]' }],
          usedDefaultParameters: [{ name: 'Measurement Period', value: 'Interval[2023-01-01, 2024-01-01)', source: 'default' }],
        },
      ],
      logs: [],
    };
    writeIndividualResultFiles('MyLib', undefined, [{ name: 'p1' }], response, Uri.file(tmpDir), Date.now());
    const result = readResult('MyLib', 'p1');
    expect(result.parameters).to.have.length(1);
    expect(result.parameters[0]).to.deep.equal({ name: 'Measurement Period', value: 'Interval[2023-01-01, 2024-01-01)', source: 'default' });
  });

  test('parameters is empty when no config and no defaults', () => {
    const response: ExecuteCqlResponse = {
      results: [{ libraryName: 'MyLib', expressions: [{ name: 'IPP', value: '[]' }] }],
      logs: [],
    };
    writeIndividualResultFiles('MyLib', undefined, [{ name: 'p1' }], response, Uri.file(tmpDir), Date.now());
    const result = readResult('MyLib', 'p1');
    expect(result.parameters).to.deep.equal([]);
  });

  test('config params appear before defaults and both have correct source', () => {
    const parametersConfig: CqlParametersConfig = [
      { name: 'Measurement Period', type: 'Interval<DateTime>', value: 'Interval[@2024-01-01, @2024-12-31]' },
      { library: 'MyLib', parameters: [{ name: 'Product Line', type: 'String', value: 'HMO' }] },
    ];
    const response: ExecuteCqlResponse = {
      results: [{
        libraryName: 'MyLib',
        expressions: [{ name: 'IPP', value: '[]' }],
        usedDefaultParameters: [{ name: 'Some Default', value: '42', source: 'default' }],
      }],
      logs: [],
    };
    writeIndividualResultFiles('MyLib', undefined, [{ name: 'p1' }], response, Uri.file(tmpDir), Date.now(), parametersConfig);
    const result = readResult('MyLib', 'p1');
    expect(result.parameters).to.have.length(3);
    const mp = result.parameters.find((p: { name: string }) => p.name === 'Measurement Period');
    const pl = result.parameters.find((p: { name: string }) => p.name === 'Product Line');
    const sd = result.parameters.find((p: { name: string }) => p.name === 'Some Default');
    expect(mp?.source).to.equal('config-global');
    expect(pl?.source).to.equal('config-library');
    expect(sd?.source).to.equal('default');
  });

  test('test-case-level override reflected in combined parameters', () => {
    const patientId = 'patient-uuid-abc';
    const parametersConfig: CqlParametersConfig = [
      { name: 'Product Line', type: 'String', value: 'HMO' },
      { library: 'MyLib', testCases: { [patientId]: [{ name: 'Product Line', type: 'String', value: 'Medicaid' }] } },
    ];
    const response: ExecuteCqlResponse = {
      results: [{ libraryName: 'MyLib', expressions: [{ name: 'IPP', value: '[]' }] }],
      logs: [],
    };
    writeIndividualResultFiles('MyLib', undefined, [{ name: patientId }], response, Uri.file(tmpDir), Date.now(), parametersConfig);
    const result = readResult('MyLib', patientId);
    const productLine = result.parameters.find((p: { name: string }) => p.name === 'Product Line');
    expect(productLine?.value).to.equal('Medicaid');
    expect(productLine?.source).to.equal('config-test-case');
  });

  test('overwrites existing file on re-run', () => {
    const response1: ExecuteCqlResponse = {
      results: [{ libraryName: 'MyLib', expressions: [{ name: 'IPP', value: '[Encounter(id=a)]' }] }],
      logs: [],
    };
    const response2: ExecuteCqlResponse = {
      results: [{ libraryName: 'MyLib', expressions: [{ name: 'IPP', value: '[]' }] }],
      logs: [],
    };
    const testCases = [{ name: 'p1' }];

    writeIndividualResultFiles('MyLib', undefined, testCases, response1, Uri.file(tmpDir), Date.now());
    writeIndividualResultFiles('MyLib', undefined, testCases, response2, Uri.file(tmpDir), Date.now());

    const result = readResult('MyLib', 'p1');
    expect(result.results[0].value).to.equal('[]');
  });
});
