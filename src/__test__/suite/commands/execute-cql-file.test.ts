import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Uri } from 'vscode';
import {
  formatResponse,
  TestCaseResult,
  writeIndividualResultFiles,
} from '../../../commands/execute-cql-file';
import { ExecuteCqlResponse } from '../../../cql-service/cqlService.executeCql';
import { CqlParametersConfig } from '../../../model/parameters';

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

  test('omits version header entirely when versions is undefined', () => {
    const response: ExecuteCqlResponse = {
      results: [{ libraryName: 'MyLib', expressions: [{ name: 'IPP', value: '[Encounter]' }] }],
      logs: [],
    };
    const output = formatResponse(response);
    expect(output).to.equal('IPP=[Encounter]');
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

  test('includes versions in JSON output when present in response', () => {
    const response: ExecuteCqlResponse = {
      results: [{ libraryName: 'MyLib', expressions: [{ name: 'IPP', value: '[]' }] }],
      logs: [],
      versions: {
        translator: '4.9.0',
        engine: '4.9.0',
        clinicalReasoning: '4.7.0',
        languageServer: '4.8.0',
      },
    };
    writeIndividualResultFiles('MyLib', undefined, [{ name: 'p1' }], response, Uri.file(tmpDir), Date.now());
    const result = readResult('MyLib', 'p1');
    expect(result.versions).to.deep.equal({
      translator: '4.9.0',
      engine: '4.9.0',
      clinicalReasoning: '4.7.0',
      languageServer: '4.8.0',
    });
  });

  test('omits versions from JSON output when not present in response', () => {
    const response: ExecuteCqlResponse = {
      results: [{ libraryName: 'MyLib', expressions: [{ name: 'IPP', value: '[]' }] }],
      logs: [],
    };
    writeIndividualResultFiles('MyLib', undefined, [{ name: 'p1' }], response, Uri.file(tmpDir), Date.now());
    const result = readResult('MyLib', 'p1');
    expect(result.versions).to.be.undefined;
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
