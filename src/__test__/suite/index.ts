import pkg from 'glob';
import Mocha from 'mocha';
import * as path from 'node:path';
const { glob } = pkg;

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 50000,
  });

  const testsRoot = path.resolve(__dirname, '..');

  // 1. Get the files (using sync for simplicity or wrap glob in a promise)
  const files = glob.sync('**/**.test.js', { cwd: testsRoot });

  // 2. Load files sequentially to avoid the ESM race condition
  for (const f of files) {
    const fullPath = path.resolve(testsRoot, f);

    // Using dynamic import ensures ESM modules like Chai 5+
    // are handled correctly by the Node loader before Mocha runs
    await import(fullPath);

    mocha.addFile(fullPath);
  }

  // 3. Run the mocha test
  return new Promise((resolve, reject) => {
    try {
      mocha.run(failures => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      console.error(err);
      reject(err);
    }
  });
}
