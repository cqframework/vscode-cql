import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deleteDirectory, getFiles, getTimestamp, isDirectory } from '../../../utils/file-utils';

suite('deleteDirectory()', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-test-'));
  });

  teardown(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('does nothing when directory does not exist', () => {
    const missing = path.join(tmpDir, 'nonexistent');
    expect(() => deleteDirectory(missing)).to.not.throw();
  });

  test('removes an empty directory', () => {
    const dir = path.join(tmpDir, 'empty');
    fs.mkdirSync(dir);
    deleteDirectory(dir);
    expect(fs.existsSync(dir)).to.be.false;
  });

  test('removes a directory containing files', () => {
    const dir = path.join(tmpDir, 'populated');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'hello');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'world');
    deleteDirectory(dir);
    expect(fs.existsSync(dir)).to.be.false;
  });

  test('removes nested subdirectories', () => {
    const dir = path.join(tmpDir, 'nested');
    const sub = path.join(dir, 'sub');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'deep.txt'), 'deep');
    deleteDirectory(dir);
    expect(fs.existsSync(dir)).to.be.false;
  });
});

suite('getFiles()', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-test-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('throws when directory does not exist', () => {
    const missing = path.join(tmpDir, 'nonexistent');
    expect(() => getFiles(missing, undefined)).to.throw();
  });

  test('throws when path is a file, not a directory', () => {
    const file = path.join(tmpDir, 'file.txt');
    fs.writeFileSync(file, '');
    expect(() => getFiles(file, undefined)).to.throw();
  });

  test('returns all files when no extension filter', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.cql'), '');
    fs.writeFileSync(path.join(tmpDir, 'b.json'), '');
    const result = getFiles(tmpDir, undefined);
    expect(result.sort()).to.deep.equal(['a.cql', 'b.json']);
  });

  test('filters by extension', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.cql'), '');
    fs.writeFileSync(path.join(tmpDir, 'b.json'), '');
    fs.writeFileSync(path.join(tmpDir, 'c.cql'), '');
    const result = getFiles(tmpDir, '.cql');
    expect(result.sort()).to.deep.equal(['a.cql', 'c.cql']);
  });

  test('extension filter is case-insensitive', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.CQL'), '');
    const result = getFiles(tmpDir, '.cql');
    expect(result).to.deep.equal(['a.CQL']);
  });

  test('returns empty array for empty directory', () => {
    const result = getFiles(tmpDir, undefined);
    expect(result).to.deep.equal([]);
  });
});

suite('getTimestamp()', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-test-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns -1 for non-existent file', () => {
    const result = getTimestamp(path.join(tmpDir, 'missing.txt'));
    expect(result).to.equal(-1);
  });

  test('returns a positive number for an existing file', () => {
    const file = path.join(tmpDir, 'real.txt');
    fs.writeFileSync(file, 'content');
    const result = getTimestamp(file);
    expect(result).to.be.greaterThan(0);
  });
});

suite('isDirectory()', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-cql-test-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns true for a directory', () => {
    expect(isDirectory(tmpDir)).to.be.true;
  });

  test('returns false for a file', () => {
    const file = path.join(tmpDir, 'file.txt');
    fs.writeFileSync(file, '');
    expect(isDirectory(file)).to.be.false;
  });

  test('returns false for a missing path', () => {
    expect(isDirectory(path.join(tmpDir, 'nonexistent'))).to.be.false;
  });
});
