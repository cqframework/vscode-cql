import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Uri } from 'vscode';
import {
  getCqlCommandArgs,
  getExecArgs,
} from '../../../cql-service/cqlService.executeCql';

suite('getCqlCommandArgs()', () => {
  const noOptsUri = Uri.file('/no/such/opts.json');
  const rootUri = Uri.file('/project/root');

  test('first arg is always "cql"', () => {
    const args = getCqlCommandArgs('R4', noOptsUri, rootUri);
    expect(args[0]).to.equal('cql');
  });

  test('includes fhir version flag', () => {
    const args = getCqlCommandArgs('R4', noOptsUri, rootUri);
    expect(args).to.include('-fv=R4');
  });

  test('includes rootDir flag', () => {
    const args = getCqlCommandArgs('R4', noOptsUri, rootUri);
    expect(args.some(a => a.startsWith('-rd='))).to.be.true;
  });

  test('skips options flag when file does not exist', () => {
    const args = getCqlCommandArgs('R4', noOptsUri, rootUri);
    expect(args.some(a => a.startsWith('-op='))).to.be.false;
  });

  test('includes options flag when file exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-test-'));
    try {
      const optsPath = path.join(tmpDir, 'cql-options.json');
      fs.writeFileSync(optsPath, '{}');
      const args = getCqlCommandArgs('R4', Uri.file(optsPath), rootUri);
      expect(args.some(a => a.startsWith('-op='))).to.be.true;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('propagates the supplied fhir version string', () => {
    expect(getCqlCommandArgs('DSTU3', noOptsUri, rootUri)).to.include('-fv=DSTU3');
    expect(getCqlCommandArgs('R5', noOptsUri, rootUri)).to.include('-fv=R5');
  });
});

suite('getExecArgs()', () => {
  const cqlUri = Uri.file('/path/to/MyLib.cql');

  test('includes library name derived from filename', () => {
    const args = getExecArgs(cqlUri);
    expect(args).to.include('-ln=MyLib');
  });

  test('includes library URI flag', () => {
    const args = getExecArgs(cqlUri);
    expect(args.some(a => a.startsWith('-lu='))).to.be.true;
  });

  test('omits model and testCase flags when no testCaseUri', () => {
    const args = getExecArgs(cqlUri);
    expect(args.some(a => a.startsWith('-m='))).to.be.false;
    expect(args.some(a => a.startsWith('-mu='))).to.be.false;
  });

  test('includes model and testCase flags when testCaseUri provided', () => {
    const args = getExecArgs(cqlUri, Uri.file('/path/to/testcase'));
    expect(args).to.include('-m=FHIR');
    expect(args.some(a => a.startsWith('-mu='))).to.be.true;
  });

  test('includes terminology flag when provided', () => {
    const args = getExecArgs(cqlUri, undefined, Uri.file('/vocab/valueset'));
    expect(args.some(a => a.startsWith('-t='))).to.be.true;
  });

  test('omits terminology flag when not provided', () => {
    const args = getExecArgs(cqlUri);
    expect(args.some(a => a.startsWith('-t='))).to.be.false;
  });

  test('includes context flags when contextValue provided', () => {
    const args = getExecArgs(cqlUri, undefined, undefined, 'Patient123');
    expect(args).to.include('-c=Patient');
    expect(args).to.include('-cv=Patient123');
  });

  test('omits context flags when no contextValue', () => {
    const args = getExecArgs(cqlUri);
    expect(args.some(a => a.startsWith('-c='))).to.be.false;
    expect(args.some(a => a.startsWith('-cv='))).to.be.false;
  });

  test('includes measurement period flags when period provided', () => {
    const args = getExecArgs(cqlUri, undefined, undefined, undefined, '2024-01-01/2024-12-31');
    expect(args.some(a => a.startsWith('-p='))).to.be.true;
    expect(args).to.include('-pv=2024-01-01/2024-12-31');
  });

  test('omits measurement period flags when empty string', () => {
    const args = getExecArgs(cqlUri, undefined, undefined, undefined, '');
    expect(args.some(a => a.startsWith('-p='))).to.be.false;
  });

  test('omits measurement period flags when not provided', () => {
    const args = getExecArgs(cqlUri);
    expect(args.some(a => a.startsWith('-p='))).to.be.false;
  });
});
