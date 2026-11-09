import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  formatProgressMessage,
  partialPath,
  progressStep,
  safeRemove,
} from '../../../java-support/javaServiceInstaller';

const MB = 1024 * 1024;

suite('progressStep()', () => {
  test('increments of a chunked download sum to exactly 100', () => {
    const total = 219 * MB;
    const chunk = 64 * 1024;
    let bytes = 0;
    let lastPct = 0;
    let sum = 0;
    while (bytes < total) {
      bytes = Math.min(total, bytes + chunk);
      const step = progressStep(bytes, total, lastPct);
      lastPct = step.pct;
      sum += step.increment;
    }
    expect(sum).to.equal(100);
    expect(lastPct).to.equal(100);
  });

  test('increment is 0 when the percent has not changed', () => {
    expect(progressStep(1000, 100 * MB, 0)).to.deep.equal({ pct: 0, increment: 0 });
    expect(progressStep(50 * MB, 100 * MB, 50)).to.deep.equal({ pct: 50, increment: 0 });
  });

  test('returns the delta since lastPct', () => {
    expect(progressStep(30 * MB, 100 * MB, 10)).to.deep.equal({ pct: 30, increment: 20 });
  });

  test('increment is 0 and pct is unchanged when total is undefined or 0', () => {
    expect(progressStep(5 * MB, undefined, 7)).to.deep.equal({ pct: 7, increment: 0 });
    expect(progressStep(5 * MB, 0, 7)).to.deep.equal({ pct: 7, increment: 0 });
  });

  test('pct is capped at 100', () => {
    expect(progressStep(150 * MB, 100 * MB, 90)).to.deep.equal({ pct: 100, increment: 10 });
  });
});

suite('formatProgressMessage()', () => {
  test('shows MB and percent when the total is known', () => {
    const total = Math.round(219.3 * MB);
    const soFar = Math.round(54.2 * MB);
    expect(formatProgressMessage(soFar, total)).to.equal('Downloading 54.2 / 219.3 MB (24%)');
  });

  test('shows only MB when the total is unknown', () => {
    expect(formatProgressMessage(Math.round(54.2 * MB))).to.equal('Downloading 54.2 MB');
    expect(formatProgressMessage(Math.round(54.2 * MB), 0)).to.equal('Downloading 54.2 MB');
  });
});

suite('partialPath()', () => {
  // Platform           | input                                                    | output
  // -------------------|----------------------------------------------------------|--------------
  // macOS/Linux        | /ext/dist/java-support/jars/cql-ls-server-5.0.0.jar      | ….jar.part
  // Windows backslash  | C:\ext\dist\java-support\jars\cql-ls-server-5.0.0.jar    | ….jar.part
  // Windows forward    | C:/ext/dist/java-support/jars/cql-ls-server-5.0.0.jar    | ….jar.part
  const cases = [
    '/ext/dist/java-support/jars/cql-ls-server-5.0.0.jar',
    'C:\\ext\\dist\\java-support\\jars\\cql-ls-server-5.0.0.jar',
    'C:/ext/dist/java-support/jars/cql-ls-server-5.0.0.jar',
  ];
  for (const jar of cases) {
    test(`appends .part to ${jar}`, () => {
      expect(partialPath(jar)).to.equal(`${jar}.part`);
    });
  }
});

suite('safeRemove()', () => {
  let dir: string;

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-remove-'));
  });

  teardown(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('deletes an existing file', () => {
    const file = path.join(dir, 'x.jar.part');
    fs.writeFileSync(file, 'data');
    safeRemove(file);
    expect(fs.existsSync(file)).to.equal(false);
  });

  test('does nothing when the file does not exist', () => {
    expect(() => safeRemove(path.join(dir, 'no-such-file.jar.part'))).to.not.throw();
  });

  test('swallows a delete failure instead of throwing', () => {
    // unlinkSync on a directory fails (EPERM/EISDIR), like EPERM/EBUSY on a locked Windows file.
    const notRemovable = path.join(dir, 'a-directory');
    fs.mkdirSync(notRemovable);
    expect(() => safeRemove(notRemovable)).to.not.throw();
    expect(fs.existsSync(notRemovable)).to.equal(true);
  });
});
