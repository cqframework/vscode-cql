import { expect } from 'chai';
import { Uri, workspace } from 'vscode';
import { CqlTestCaseResourceTreeItem } from '../../../cql-explorer/cqlProjectTreeDataProvider';

suite('CqlTestCaseResourceTreeItem', () => {
  const wsRoot = () => workspace.workspaceFolders![0].uri;

  function makeItem(dir: string, fileName: string): CqlTestCaseResourceTreeItem {
    const uri = Uri.joinPath(
      wsRoot(),
      `input/tests/measure/SimpleMeasure/${dir}/${fileName}`,
    );
    return new CqlTestCaseResourceTreeItem({ name: fileName, uri });
  }

  test('contextValue is always cql-testcase-resource', () => {
    const matching = makeItem('1111', 'Encounter-03632d2d-cfe9-4ed8-85b0-a2fdb2575de0.json');
    expect(matching.contextValue).to.equal('cql-testcase-resource');

    // Previously flagged as mismatch — now same contextValue (check deferred)
    const mismatch = makeItem('1111', 'Encounter-mismatch.json');
    expect(mismatch.contextValue).to.equal('cql-testcase-resource');
  });

  test('tooltip is always undefined', () => {
    const item = makeItem('1111', 'Encounter-03632d2d-cfe9-4ed8-85b0-a2fdb2575de0.json');
    expect(item.tooltip).to.be.undefined;
  });
});
