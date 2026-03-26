import { expect } from 'chai';
import { Uri, workspace } from 'vscode';
import { CqlTestCase } from '../../../cql-explorer/cqlProject';

suite('CqlTestCase', () => {
  function makeTestCase(): CqlTestCase {
    const uri = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/tests/measure/SimpleMeasure/1111',
    );
    return new CqlTestCase(uri);
  }

  test('name is derived from the directory basename', () => {
    const tc = makeTestCase();
    expect(tc.name).to.equal('1111');
  });
});
