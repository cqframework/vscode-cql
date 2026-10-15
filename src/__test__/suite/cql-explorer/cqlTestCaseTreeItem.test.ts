import { expect } from 'chai';
import { Uri, workspace } from 'vscode';
import { CqlTestCase } from '../../../model/cqlProject';
import {
  CqlTestCaseResultTreeItem,
  CqlTestCaseTreeItem,
} from '../../../cql-explorer/cqlProjectTreeDataProvider';

suite('CqlTestCaseTreeItem', () => {
  function makeTestCase(subdir: string): CqlTestCase {
    const uri = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      `input/tests/Measure/SimpleMeasure/${subdir}`,
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

  suite('test case result leaf', () => {
    const resultUri = () =>
      Uri.joinPath(
        workspace.workspaceFolders![0].uri,
        'input/tests/results/SimpleMeasure/TestCaseResult-1111.json',
      );
    const resourceUri = (name: string) =>
      Uri.joinPath(
        workspace.workspaceFolders![0].uri,
        `input/tests/Measure/SimpleMeasure/1111/${name}`,
      );

    test('no result leaf when no result uri is given', () => {
      const tc = makeTestCase('1111');
      tc.addResource(resourceUri('Patient-1111.json'));
      const item = new CqlTestCaseTreeItem(tc);
      expect(item.children.some(c => c instanceof CqlTestCaseResultTreeItem)).to.be.false;
      expect(item.children).to.have.length(1);
    });

    test('result leaf is pinned first, ahead of sorted resources', () => {
      const tc = makeTestCase('1111');
      tc.addResource(resourceUri('Patient-1111.json'));
      tc.addResource(resourceUri('Encounter-1.json'));
      const item = new CqlTestCaseTreeItem(tc, resultUri());

      const [first, ...rest] = item.children;
      expect(first).to.be.instanceOf(CqlTestCaseResultTreeItem);
      expect(first.label).to.equal('TestCaseResult-1111.json');
      expect(first.contextValue).to.equal('cql-testcase-result');
      expect(first.command?.command).to.equal('vscode.open');
      expect(first.command?.arguments?.[0].fsPath).to.equal(resultUri().fsPath);
      expect(rest.map(r => r.label)).to.deep.equal(['Encounter-1.json', 'Patient-1111.json']);
    });

    test('result leaf contextValue does not match resource menus (/^cql-testcase-resource/)', () => {
      const item = new CqlTestCaseTreeItem(makeTestCase('1111'), resultUri());
      expect(/^cql-testcase-resource/.test(item.children[0].contextValue!)).to.be.false;
    });

    test('setResources keeps the result leaf', () => {
      const tc = makeTestCase('1111');
      const item = new CqlTestCaseTreeItem(tc, resultUri());
      item.setResources([{ name: 'Patient-1111.json', uri: resourceUri('Patient-1111.json') }]);
      expect(item.children[0]).to.be.instanceOf(CqlTestCaseResultTreeItem);
      expect(item.children).to.have.length(2);
    });

    test('setResult adds and removes the leaf', () => {
      const tc = makeTestCase('1111');
      tc.addResource(resourceUri('Patient-1111.json'));
      const item = new CqlTestCaseTreeItem(tc);

      item.setResult(resultUri());
      expect(item.resultUri?.fsPath).to.equal(resultUri().fsPath);
      expect(item.children[0]).to.be.instanceOf(CqlTestCaseResultTreeItem);
      expect(item.children).to.have.length(2);

      item.setResult(undefined);
      expect(item.children.some(c => c instanceof CqlTestCaseResultTreeItem)).to.be.false;
      expect(item.children).to.have.length(1);
    });
  });
});
