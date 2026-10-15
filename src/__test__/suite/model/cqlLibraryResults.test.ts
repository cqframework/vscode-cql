import { expect } from 'chai';
import { Uri, workspace } from 'vscode';
import {
  CqlLibrary,
  CqlLibraryEvents,
  testCaseNameFromResultPath,
} from '../../../model/cqlProject';

/**
 * | Platform        | Input                                                    | Expected  |
 * | --------------- | -------------------------------------------------------- | --------- |
 * | macOS/Linux     | /ig/input/tests/results/Lib/TestCaseResult-abc.json      | abc       |
 * | Windows (\)     | C:\ig\input\tests\results\Lib\TestCaseResult-abc.json    | abc       |
 * | Windows (/)     | C:/ig/input/tests/results/Lib/TestCaseResult-abc.json    | abc       |
 */
suite('testCaseNameFromResultPath', () => {
  test('macOS/Linux path', () => {
    expect(
      testCaseNameFromResultPath('/ig/input/tests/results/Lib/TestCaseResult-abc.json'),
    ).to.equal('abc');
  });

  test('Windows backslash path', () => {
    expect(
      testCaseNameFromResultPath('C:\\ig\\input\\tests\\results\\Lib\\TestCaseResult-abc.json'),
    ).to.equal('abc');
  });

  test('Windows forward-slash path', () => {
    expect(
      testCaseNameFromResultPath('C:/ig/input/tests/results/Lib/TestCaseResult-abc.json'),
    ).to.equal('abc');
  });

  test('bare file name', () => {
    expect(testCaseNameFromResultPath('TestCaseResult-abc.json')).to.equal('abc');
  });

  test('UUID test case name with hyphens is preserved', () => {
    expect(
      testCaseNameFromResultPath(
        '/r/Lib/TestCaseResult-c2d7a953-9bfb-40fc-b115-6f02538de344.json',
      ),
    ).to.equal('c2d7a953-9bfb-40fc-b115-6f02538de344');
  });

  test('legacy .txt result is not a test case result', () => {
    expect(testCaseNameFromResultPath('/ig/input/tests/results/Lib.txt')).to.be.undefined;
    expect(testCaseNameFromResultPath('C:\\ig\\results\\Lib\\Lib.txt')).to.be.undefined;
  });

  test('other JSON files are not test case results', () => {
    expect(testCaseNameFromResultPath('/r/Lib/Other-abc.json')).to.be.undefined;
    expect(testCaseNameFromResultPath('/r/Lib/TestCaseResult-.json')).to.be.undefined;
    expect(testCaseNameFromResultPath('/r/Lib/TestCaseResult-abc.txt')).to.be.undefined;
  });
});

suite('CqlLibrary test case result tracking', () => {
  const wsRoot = workspace.workspaceFolders![0].uri;
  let lib: CqlLibrary;
  let events: number;

  const resultUri = (fileName: string) =>
    Uri.joinPath(wsRoot, 'input/tests/results/SimpleMeasure', fileName);

  setup(() => {
    lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    events = 0;
    lib.on(CqlLibraryEvents.RESULT_CHANGED, () => events++);
  });

  test('addResult of a TestCaseResult JSON makes it available by test case name', () => {
    const uri = resultUri('TestCaseResult-1111.json');
    lib.addResult(uri);
    expect(lib.getTestCaseResultUri('1111')?.fsPath).to.equal(uri.fsPath);
    expect(lib.getTestCaseResultUri('2222')).to.be.undefined;
  });

  test('legacy .txt result is listed but not mapped to a test case', () => {
    lib.addResult(Uri.joinPath(wsRoot, 'input/tests/results/SimpleMeasure.txt'));
    expect(lib.resultUris).to.have.length(1);
    expect(lib.getTestCaseResultUri('SimpleMeasure')).to.be.undefined;
  });

  test('removeResult clears the test case mapping', () => {
    const uri = resultUri('TestCaseResult-1111.json');
    lib.addResult(uri);
    lib.removeResult(uri);
    expect(lib.getTestCaseResultUri('1111')).to.be.undefined;
    expect(lib.resultUris).to.be.empty;
  });

  test('clearResults clears the test case mapping', () => {
    lib.addResult(resultUri('TestCaseResult-1111.json'));
    lib.clearResults();
    expect(lib.getTestCaseResultUri('1111')).to.be.undefined;
  });

  test('addResult emits RESULT_CHANGED for a new uri', () => {
    lib.addResult(resultUri('TestCaseResult-1111.json'));
    expect(events).to.equal(1);
  });

  test('addResult of an already-known uri does not emit (re-run / onDidChange)', () => {
    const uri = resultUri('TestCaseResult-1111.json');
    lib.addResult(uri);
    lib.addResult(uri);
    lib.addResult(uri);
    expect(events).to.equal(1);
    expect(lib.resultUris).to.have.length(1);
  });

  test('removeResult emits only when something was removed', () => {
    const uri = resultUri('TestCaseResult-1111.json');
    lib.removeResult(uri);
    expect(events).to.equal(0);
    lib.addResult(uri);
    lib.removeResult(uri);
    expect(events).to.equal(2);
  });
});
