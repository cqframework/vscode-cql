import { expect } from 'chai';
import { Uri, workspace } from 'vscode';
import { getTestCases } from '../../../model/testCase';

suite('testCase.getTestCases()', () => {
  test('returns empty array when testPath does not exist', () => {
    const result = getTestCases(Uri.file('/nonexistent/path'), 'SomeMeasure', []);
    expect(result).to.deep.equal([]);
  });

  test('discovers test case folders for a matching library', () => {
    const testPath = Uri.joinPath(workspace.workspaceFolders![0].uri, 'input/tests/measure');
    const result = getTestCases(testPath, 'SimpleMeasure', []);
    const names = result.map(tc => tc.name).sort();
    expect(names).to.include('1111');
    expect(names).to.include('2222');
  });

  test('returns empty array when no library matches', () => {
    const testPath = Uri.joinPath(workspace.workspaceFolders![0].uri, 'input/tests/measure');
    const result = getTestCases(testPath, 'NoSuchLib', []);
    expect(result).to.have.lengthOf(0);
  });

  test('excludes test cases listed in testCasesToExclude', () => {
    const testPath = Uri.joinPath(workspace.workspaceFolders![0].uri, 'input/tests/measure');
    const result = getTestCases(testPath, 'SimpleMeasure', ['1111']);
    const names = result.map(tc => tc.name);
    expect(names).not.to.include('1111');
    expect(names).to.include('2222');
  });

  test('each test case has a path', () => {
    const testPath = Uri.joinPath(workspace.workspaceFolders![0].uri, 'input/tests/measure');
    const result = getTestCases(testPath, 'SimpleMeasure', []);
    for (const tc of result) {
      expect(tc.path).to.not.be.undefined;
    }
  });

  test('reads description from MeasureReport when present', () => {
    const testPath = Uri.joinPath(workspace.workspaceFolders![0].uri, 'input/tests/measure');
    const result = getTestCases(testPath, 'SimpleMeasure', []);
    const tc1111 = result.find(tc => tc.name === '1111');
    expect(tc1111?.description).to.equal('SimpleMeasure');
  });

  test('description is undefined when no MeasureReport present', () => {
    const testPath = Uri.joinPath(workspace.workspaceFolders![0].uri, 'input/tests/measure');
    const result = getTestCases(testPath, 'SimpleMeasure', []);
    const tc2222 = result.find(tc => tc.name === '2222');
    expect(tc2222?.description).to.be.undefined;
  });
});
