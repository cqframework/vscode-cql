import { expect } from 'chai';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Uri } from 'vscode';
import { loadTestConfig } from '../../../helpers/cqlHelpers';

suite('ConfigEditorWebview — save round-trip', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-test-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writes and reads back TestConfig correctly', () => {
    const configPath = path.join(tmpDir, 'config.json');
    const config = {
      testCasesToExclude: [
        { library: 'CMS122', testCase: '1234-abcd', reason: 'Flaky' },
        { library: 'CMS130', testCase: '5678-efgh', reason: 'WIP' },
      ],
      resultFormat: 'individual' as const,
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const result = loadTestConfig(Uri.file(configPath));

    expect(result.testCasesToExclude).to.have.length(2);
    expect(result.testCasesToExclude[0].library).to.equal('CMS122');
    expect(result.testCasesToExclude[0].testCase).to.equal('1234-abcd');
    expect(result.testCasesToExclude[0].reason).to.equal('Flaky');
    expect(result.testCasesToExclude[1].library).to.equal('CMS130');
    expect(result.testCasesToExclude[1].testCase).to.equal('5678-efgh');
    expect(result.testCasesToExclude[1].reason).to.equal('WIP');
    expect(result.resultFormat).to.equal('individual');
  });

  test('writes flat result format and reads it back', () => {
    const configPath = path.join(tmpDir, 'config.json');
    const config = {
      testCasesToExclude: [],
      resultFormat: 'flat',
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const result = loadTestConfig(Uri.file(configPath));

    expect(result.testCasesToExclude).to.deep.equal([]);
    expect(result.resultFormat).to.equal('flat');
  });

  test('writes to .jsonc path and reads back (comments stripped on write)', () => {
    const configPath = path.join(tmpDir, 'config.jsonc');
    const config = {
      testCasesToExclude: [
        { library: 'CMS130', testCase: 'aaaa-bbbb', reason: 'Test' },
      ],
      resultFormat: 'flat',
    };

    // Simulate what the webview save does: write clean JSON to .jsonc path
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const result = loadTestConfig(Uri.file(configPath));

    expect(result.testCasesToExclude).to.have.length(1);
    expect(result.testCasesToExclude[0].library).to.equal('CMS130');
    expect(result.resultFormat).to.equal('flat');
  });

  test('saved JSON is valid', () => {
    const configPath = path.join(tmpDir, 'config.json');
    const config = {
      testCasesToExclude: [],
      resultFormat: 'flat',
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const raw = fs.readFileSync(configPath, 'utf-8');

    expect(() => JSON.parse(raw)).to.not.throw();
    const parsed = JSON.parse(raw);
    expect(parsed).to.deep.equal(config);
  });

  test('loadTestConfig returns defaults when config file does not exist', () => {
    const configPath = path.join(tmpDir, 'nonexistent', 'config.json');
    const result = loadTestConfig(Uri.file(configPath));

    expect(result.testCasesToExclude).to.deep.equal([]);
    expect(result.resultFormat).to.equal('flat');
  });

  test('preserves empty testCasesToExclude array', () => {
    const configPath = path.join(tmpDir, 'config.json');
    const config = { testCasesToExclude: [], resultFormat: 'flat' };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const result = loadTestConfig(Uri.file(configPath));

    expect(result.testCasesToExclude).to.be.an('array').that.is.empty;
  });

  test('writes and reads back global parameters', () => {
    const configPath = path.join(tmpDir, 'config.json');
    const config = {
      testCasesToExclude: [],
      resultFormat: 'flat' as const,
      parameters: [
        { name: 'Measurement Period', type: 'Interval<DateTime>', value: 'Interval[@2024-01-01, @2025-01-01)' },
        { name: 'Threshold', type: 'Integer', value: '42' },
      ],
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const result = loadTestConfig(Uri.file(configPath));

    expect(result.parameters).to.have.length(2);
    const p0 = result.parameters![0];
    expect(p0).to.not.have.property('library');
    expect((p0 as { name: string }).name).to.equal('Measurement Period');
    expect((p0 as { type: string }).type).to.equal('Interval<DateTime>');
    expect((p0 as { value: string }).value).to.equal('Interval[@2024-01-01, @2025-01-01)');
    const p1 = result.parameters![1] as { name: string; type: string; value: string };
    expect(p1.name).to.equal('Threshold');
    expect(p1.type).to.equal('Integer');
    expect(p1.value).to.equal('42');
  });

  test('writes and reads back library blocks with parameters', () => {
    const configPath = path.join(tmpDir, 'config.json');
    const config = {
      testCasesToExclude: [],
      resultFormat: 'flat' as const,
      parameters: [
        {
          library: 'CMS122',
          version: '2.1.0',
          parameters: [
            { name: 'Threshold', type: 'Decimal', value: '10.5' },
          ],
        },
        {
          library: 'CMS130',
          parameters: [
            { name: 'Rate', type: 'Quantity', value: '100.0 \'mg/dL\'' },
          ],
        },
      ],
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const result = loadTestConfig(Uri.file(configPath));

    expect(result.parameters).to.have.length(2);
    const b0 = result.parameters![0] as { library: string; version?: string; parameters?: any[] };
    expect(b0.library).to.equal('CMS122');
    expect(b0.version).to.equal('2.1.0');
    expect(b0.parameters).to.have.length(1);
    expect(b0.parameters![0].name).to.equal('Threshold');
    expect(b0.parameters![0].value).to.equal('10.5');

    const b1 = result.parameters![1] as { library: string; version?: string; parameters?: any[] };
    expect(b1.library).to.equal('CMS130');
    expect(b1.version).to.be.undefined;
    expect(b1.parameters).to.have.length(1);
    expect(b1.parameters![0].name).to.equal('Rate');
  });

  test('writes and reads back library block with test case overrides', () => {
    const configPath = path.join(tmpDir, 'config.json');
    const config = {
      testCasesToExclude: [],
      resultFormat: 'flat' as const,
      parameters: [
        {
          library: 'CMS122',
          parameters: [
            { name: 'Threshold', type: 'Integer', value: '50' },
          ],
          testCases: {
            'patient-1234': [
              { name: 'Threshold', type: 'Integer', value: '75' },
            ],
            'patient-5678': [
              { name: 'Threshold', type: 'Integer', value: '25' },
              { name: 'Rate', type: 'Decimal', value: '1.5' },
            ],
          },
        },
      ],
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const result = loadTestConfig(Uri.file(configPath));

    const block = result.parameters![0] as any;
    expect(block.library).to.equal('CMS122');
    expect(block.testCases).to.have.all.keys('patient-1234', 'patient-5678');
    expect(block.testCases['patient-1234']).to.have.length(1);
    expect(block.testCases['patient-1234'][0].value).to.equal('75');
    expect(block.testCases['patient-5678']).to.have.length(2);
    expect(block.testCases['patient-5678'][1].name).to.equal('Rate');
  });

  test('parameters is undefined when config has no parameters field', () => {
    const configPath = path.join(tmpDir, 'config.json');
    const config = { testCasesToExclude: [], resultFormat: 'flat' };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const result = loadTestConfig(Uri.file(configPath));

    expect(result.parameters).to.be.undefined;
  });
});
