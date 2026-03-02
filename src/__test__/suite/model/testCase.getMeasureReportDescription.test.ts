import { expect } from 'chai';
import { Uri, workspace } from 'vscode';
import { getMeasureReportDescription } from '../../../model/testCase';

suite('testCase.getMeasureReportDescription tests', () => {
  test('should return undefined when directory does not exist', () => {
    const folder = '/tests/measure/library-example/1234';
    expect(getMeasureReportDescription(Uri.file(folder))).to.equal(undefined);
  });

  test('should return undefined when directory exist but there is no measure report', () => {
    const testCaseFolder = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/tests/measure/SimpleMeasure/2222',
    );
    expect(getMeasureReportDescription(testCaseFolder)).to.equal(undefined);
  });

  test('should return description', () => {
    const testCaseFolder = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/tests/measure/SimpleMeasure/1111',
    );
    expect(getMeasureReportDescription(testCaseFolder)).to.equal('SimpleMeasure');
  });
});
