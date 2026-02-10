import { glob } from 'glob'; // Use named import for glob v10
import Mocha from 'mocha';
import * as path from 'path';

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    timeout: 50000,
  });

  const testsRoot = path.resolve(__dirname, '..');

  try {
    // glob v10 returns a Promise<string[]> when no callback is provided
    const files = await glob('**/*.test.js', { cwd: testsRoot });

    // Add files to the test suite
    files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

    return new Promise((resolve, reject) => {
      try {
        // Run the mocha test
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
  } catch (err) {
    // Catch errors from the glob search
    throw err;
  }
}