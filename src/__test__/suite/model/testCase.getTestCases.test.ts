import { expect } from 'chai';
import { Uri, workspace } from 'vscode';
import { getTestCases } from '../../../model/testCase';

suite('testCase.getTestCases()', () => {
  test('returns empty array when testPath does not exist', () => {
    const result = getTestCases(Uri.file('/nonexistent/path'), 'SomeMeasure', []);
    expect(result).to.deep.equal([]);
  });

  test('discovers test case folders for a matching library', () => {
    const testPath = Uri.joinPath(workspace.workspaceFolders![0].uri, 'input/tests/Measure');
    const result = getTestCases(testPath, 'SimpleMeasure', []);
    const names = result.map(tc => tc.name).sort();
    expect(names).to.include('1111');
    expect(names).to.include('2222');
  });

  test('returns empty array when no library matches', () => {
    const testPath = Uri.joinPath(workspace.workspaceFolders![0].uri, 'input/tests/Measure');
    const result = getTestCases(testPath, 'NoSuchLib', []);
    expect(result).to.have.lengthOf(0);
  });

  test('excludes test cases listed in testCasesToExclude', () => {
    const testPath = Uri.joinPath(workspace.workspaceFolders![0].uri, 'input/tests/Measure');
    const result = getTestCases(testPath, 'SimpleMeasure', ['1111']);
    const names = result.map(tc => tc.name);
    expect(names).not.to.include('1111');
    expect(names).to.include('2222');
  });

  test('each test case has a path', () => {
    const testPath = Uri.joinPath(workspace.workspaceFolders![0].uri, 'input/tests/Measure');
    const result = getTestCases(testPath, 'SimpleMeasure', []);
    for (const tc of result) {
      expect(tc.path).to.not.be.undefined;
    }
  });

});
