import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Uri } from 'vscode';
import { buildRequest } from '../../../cql-service/cqlService.executeCql';
import { CqlParametersConfig } from '../../../model/parameters';
import { TestCase } from '../../../model/testCase';

suite('buildRequest()', () => {
  const cqlUri = Uri.file('/project/input/cql/MyLib.cql');
  const terminologyUri = Uri.file('/no/such/terminology');
  const rootUri = Uri.file('/project');
  const noOptsUri = Uri.file('/no/such/opts.json');

  test('sets fhirVersion from supplied argument', () => {
    const req = buildRequest(cqlUri, [], terminologyUri, 'R4', noOptsUri, rootUri);
    expect(req.fhirVersion).to.equal('R4');
  });

  test('sets rootDir from supplied URI', () => {
    const req = buildRequest(cqlUri, [], terminologyUri, 'R4', noOptsUri, rootUri);
    expect(req.rootDir).to.equal(rootUri.toString());
  });

  test('sets optionsPath to null when file does not exist', () => {
    const req = buildRequest(cqlUri, [], terminologyUri, 'R4', noOptsUri, rootUri);
    expect(req.optionsPath).to.be.null;
  });

  test('sets optionsPath when file exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-test-'));
    try {
      const optsPath = path.join(tmpDir, 'cql-options.json');
      fs.writeFileSync(optsPath, '{}');
      const req = buildRequest(cqlUri, [], terminologyUri, 'R4', Uri.file(optsPath), rootUri);
      expect(req.optionsPath).to.not.be.null;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('produces one LibraryRequest per test case', () => {
    const testCases: TestCase[] = [{ name: 'patient1' }, { name: 'patient2' }];
    const req = buildRequest(cqlUri, testCases, terminologyUri, 'R4', noOptsUri, rootUri);
    expect(req.libraries).to.have.length(2);
  });

  test('library name is derived from cql filename', () => {
    const req = buildRequest(cqlUri, [{}], terminologyUri, 'R4', noOptsUri, rootUri);
    expect(req.libraries[0].libraryName).to.equal('MyLib');
  });

  test('library URI points to parent directory of cql file', () => {
    const req = buildRequest(cqlUri, [{}], terminologyUri, 'R4', noOptsUri, rootUri);
    expect(req.libraries[0].libraryUri).to.include('input/cql');
  });

  test('sets context from test case name when no contextValue override', () => {
    const testCases: TestCase[] = [{ name: 'patient-abc' }];
    const req = buildRequest(cqlUri, testCases, terminologyUri, 'R4', noOptsUri, rootUri);
    expect(req.libraries[0].context?.contextName).to.equal('Patient');
    expect(req.libraries[0].context?.contextValue).to.equal('patient-abc');
  });

  test('overrides context with contextValue argument when provided', () => {
    const testCases: TestCase[] = [{ name: 'patient-abc' }];
    const req = buildRequest(cqlUri, testCases, terminologyUri, 'R4', noOptsUri, rootUri, 'override-id');
    expect(req.libraries[0].context?.contextValue).to.equal('override-id');
  });

  test('sets context to null when no name and no contextValue', () => {
    const req = buildRequest(cqlUri, [{}], terminologyUri, 'R4', noOptsUri, rootUri);
    expect(req.libraries[0].context).to.be.null;
  });

  test('sets model from test case path when present', () => {
    const testCases: TestCase[] = [{ name: 'p1', path: Uri.file('/project/input/tests/MyLib/p1') }];
    const req = buildRequest(cqlUri, testCases, terminologyUri, 'R4', noOptsUri, rootUri);
    expect(req.libraries[0].model?.modelName).to.equal('FHIR');
    expect(req.libraries[0].model?.modelUri).to.include('p1');
  });

  test('sets model to null when test case has no path', () => {
    const req = buildRequest(cqlUri, [{ name: 'p1' }], terminologyUri, 'R4', noOptsUri, rootUri);
    expect(req.libraries[0].model).to.be.null;
  });

  test('sets terminologyUri to null when file does not exist', () => {
    const req = buildRequest(cqlUri, [{}], terminologyUri, 'R4', noOptsUri, rootUri);
    expect(req.libraries[0].terminologyUri).to.be.null;
  });

  test('sets terminologyUri when file exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-test-'));
    try {
      const termPath = Uri.file(tmpDir);
      const req = buildRequest(cqlUri, [{}], termPath, 'R4', noOptsUri, rootUri);
      expect(req.libraries[0].terminologyUri).to.not.be.null;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('sends empty parameters array when no parametersConfig is provided', () => {
    const req = buildRequest(cqlUri, [{ name: 'p1' }], terminologyUri, 'R4', noOptsUri, rootUri);
    expect(req.libraries[0].parameters).to.deep.equal([]);
  });

  test('sends resolved parameters when parametersConfig is provided', () => {
    const config: CqlParametersConfig = [
      { name: 'Measurement Period', type: 'Interval<DateTime>', value: 'Interval[@2024-01-01, @2024-12-31]' },
    ];
    const req = buildRequest(cqlUri, [{ name: 'p1' }], terminologyUri, 'R4', noOptsUri, rootUri, undefined, config, '1.0.000');
    expect(req.libraries[0].parameters).to.have.length(1);
    expect(req.libraries[0].parameters[0].parameterName).to.equal('Measurement Period');
    expect(req.libraries[0].parameters[0].parameterType).to.equal('Interval<DateTime>');
    expect(req.libraries[0].parameters[0].parameterValue).to.equal('Interval[@2024-01-01, @2024-12-31]');
  });

  test('test case overrides global parameter value in sent request', () => {
    const config: CqlParametersConfig = [
      { name: 'Product Line', type: 'String', value: 'HMO' },
      { library: 'MyLib', testCases: { p1: [{ name: 'Product Line', type: 'String', value: 'Medicaid' }] } },
    ];
    const req = buildRequest(cqlUri, [{ name: 'p1' }], terminologyUri, 'R4', noOptsUri, rootUri, undefined, config, '1.0.000');
    expect(req.libraries[0].parameters[0].parameterValue).to.equal('Medicaid');
  });
});
