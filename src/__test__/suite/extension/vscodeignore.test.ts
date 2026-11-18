import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../..');

function ignoreRules(file: string): string[] {
  return fs
    .readFileSync(path.join(repoRoot, file), 'utf-8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));
}

suite('VSIX ignore files', () => {
  // tsc compiles src/__test__ to dist/__test__ (rootDir "src", outDir "dist").
  for (const file of ['.vscodeignore', '.vscodeignore.local']) {
    test(`${file} excludes the compiled unit tests (dist/__test__)`, () => {
      expect(ignoreRules(file)).to.include('dist/__test__/');
    });
  }
});
