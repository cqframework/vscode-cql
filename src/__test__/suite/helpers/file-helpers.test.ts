import { expect } from 'chai';
import * as fs from 'fs';
import mock from 'mock-fs';
import { ensureExists } from '../../../helpers/file-helpers';

suite('ensureExists() with mock-fs', () => {
  
  teardown(() => {
    // Crucial: Restore the real file system after every test
    mock.restore();
  });

  test('should create the directory if it does not exist', () => {
    // Setup an empty virtual file system
    mock({});

    const testPath = './new-folder';
    
    ensureExists(testPath);

    // Verify the folder now exists in the virtual FS
    const exists = fs.existsSync(testPath);
    expect(exists).to.be.true;
  });

  test('should not throw an error if the directory already exists', () => {
    // Setup virtual FS with an existing directory
    mock({
      './existing-folder': {} 
    });

    const testPath = './existing-folder';
    
    // This should run without calling mkdirSync again/throwing error
    expect(() => ensureExists(testPath)).to.not.throw();
    expect(fs.existsSync(testPath)).to.be.true;
  });
});