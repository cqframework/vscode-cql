import { expect } from 'chai';
import { Uri, workspace } from 'vscode';
import { CqlTestCase } from '../../../cql-explorer/cqlProject';
import { CqlTestCaseTreeItem } from '../../../cql-explorer/cqlProjectTreeDataProvider';

suite('CqlTestCaseTreeItem', () => {
  function makeTestCase(subdir: string): CqlTestCase {
    const uri = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      `input/tests/measure/SimpleMeasure/${subdir}`,
    );
    return new CqlTestCase(uri);
  }

  test('label is the test case UUID (directory name)', () => {
    const tc = makeTestCase('1111');
    const item = new CqlTestCaseTreeItem(tc);
    expect(item.label).to.equal('1111');
  });

  test('description and tooltip are undefined when CqlTestCase has no description', () => {
    const tc = makeTestCase('2222');
    const item = new CqlTestCaseTreeItem(tc);
    expect(item.description).to.be.undefined;
    expect(item.tooltip).to.be.undefined;
  });

  test('sets description and tooltip when CqlTestCase has description', () => {
    const tc = makeTestCase('1111');
    tc.description = 'Patient is in IPP';
    const item = new CqlTestCaseTreeItem(tc);
    expect(item.description).to.equal('Patient is in IPP');
    expect(item.tooltip).to.equal('Patient is in IPP');
  });
});
