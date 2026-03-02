import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureExists } from '../../../utils/file-utils';

suite('ensureExists()', () => {
  let testDir: string;

  setup(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-test-'));
  });

  teardown(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('should create the directory if it does not exist', () => {
    const testPath = path.join(testDir, 'new-folder');

    ensureExists(testPath);

    expect(fs.existsSync(testPath)).to.be.true;
  });

  test('should not throw an error if the directory already exists', () => {
    const testPath = path.join(testDir, 'existing-folder');
    fs.mkdirSync(testPath);

    expect(() => ensureExists(testPath)).to.not.throw();
    expect(fs.existsSync(testPath)).to.be.true;
  });
});
