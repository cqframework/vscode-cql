import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { toGlobPath } from '../../../helpers/fileHelper';
import { ensureExists } from '../../../utils/file-utils';

suite('toGlobPath()', () => {
  // Expected output per platform:
  // | Platform              | Input                       | Output                      |
  // |-----------------------|-----------------------------|------------------------------|
  // | macOS / Linux         | /path/to/file               | /path/to/file                |
  // | Windows backslash     | C:\path\to\file             | C:/path/to/file              |
  // | Windows forward slash | C:/path/to/file             | C:/path/to/file              |

  test('macOS/Linux path is returned unchanged', () => {
    expect(toGlobPath('/path/to/file.cql')).to.equal('/path/to/file.cql');
  });

  test('Windows backslash path is converted to forward slashes', () => {
    expect(toGlobPath('C:\\Users\\test\\project')).to.equal('C:/Users/test/project');
  });

  test('Windows forward-slash path is returned unchanged', () => {
    expect(toGlobPath('C:/Users/test/project')).to.equal('C:/Users/test/project');
  });

  test('deeply nested Windows path is fully converted', () => {
    expect(toGlobPath('C:\\a\\b\\c\\d\\lib.cql')).to.equal('C:/a/b/c/d/lib.cql');
  });

  test('mixed separators in one path are all normalised', () => {
    expect(toGlobPath('C:/a\\b/c\\d')).to.equal('C:/a/b/c/d');
  });
});

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
