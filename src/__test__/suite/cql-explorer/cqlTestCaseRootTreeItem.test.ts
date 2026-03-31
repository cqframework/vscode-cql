import { expect } from 'chai';
import * as vscode from 'vscode';
import { Uri, workspace } from 'vscode';
import { CqlLibrary, CqlTestCase } from '../../../cql-explorer/cqlProject';
import {
  CqlTestCaseRootTreeItem,
} from '../../../cql-explorer/cqlProjectTreeDataProvider';

suite('CqlTestCaseRootTreeItem filtering', () => {
  let lib: CqlLibrary;
  let tc1111: CqlTestCase;
  let tc2222: CqlTestCase;

  setup(() => {
    const libUri = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/cql/SimpleMeasure.cql',
    );
    lib = new CqlLibrary(libUri);

    tc1111 = new CqlTestCase(
      Uri.joinPath(workspace.workspaceFolders![0].uri, 'input/tests/Measure/SimpleMeasure/1111'),
    );

    tc2222 = new CqlTestCase(
      Uri.joinPath(workspace.workspaceFolders![0].uri, 'input/tests/Measure/SimpleMeasure/2222'),
    );
  });

  function makeRoot(filter: string = ''): CqlTestCaseRootTreeItem {
    return new CqlTestCaseRootTreeItem(
      vscode.TreeItemCollapsibleState.Collapsed,
      lib,
      filter,
    );
  }

  test('no filter — all test cases shown', () => {
    const root = makeRoot();
    root.addTestCase(tc1111);
    root.addTestCase(tc2222);
    expect(root.children).to.have.length(2);
  });

  test('filter matches UUID — matching test case shown, non-matching hidden', () => {
    const root = makeRoot('1111');
    root.addTestCase(tc1111);
    root.addTestCase(tc2222);
    expect(root.children).to.have.length(1);
    expect((root.children[0] as any).cqlTestCase.name).to.equal('1111');
  });

  test('filter matches description — matching test case shown, non-matching hidden', () => {
    tc1111.description = 'Patient is in IPP';
    const root = makeRoot('in ipp');
    root.addTestCase(tc1111);
    root.addTestCase(tc2222);
    expect(root.children).to.have.length(1);
    expect((root.children[0] as any).cqlTestCase.name).to.equal('1111');
  });

  test('filter matches neither UUID nor description — no test cases shown', () => {
    const root = makeRoot('zzznomatch');
    root.addTestCase(tc1111);
    root.addTestCase(tc2222);
    expect(root.children).to.have.length(0);
  });

  test('filter is case-insensitive', () => {
    tc1111.description = 'Patient is in IPP';
    const root = makeRoot('PATIENT');
    root.addTestCase(tc1111);
    root.addTestCase(tc2222);
    expect(root.children).to.have.length(1);
  });

  test('test case with no description still matches on UUID', () => {
    const root = makeRoot('1111');
    root.addTestCase(tc1111);  // no description set
    root.addTestCase(tc2222);
    expect(root.children).to.have.length(1);
    expect((root.children[0] as any).cqlTestCase.name).to.equal('1111');
  });

  test('filter matches UUID by name', () => {
    const root = makeRoot('2222');
    root.addTestCase(tc1111);
    root.addTestCase(tc2222);
    expect(root.children).to.have.length(1);
    expect((root.children[0] as any).cqlTestCase.name).to.equal('2222');
  });

  test('contextValue is cql-testcase-root when no filter active', () => {
    const root = makeRoot('');
    expect(root.contextValue).to.equal('cql-testcase-root');
  });

  test('contextValue is cql-testcase-root-filtered when filter is set', () => {
    const root = makeRoot('cancer');
    expect(root.contextValue).to.equal('cql-testcase-root-filtered');
  });

  test('active filter text shown as node description field', () => {
    const root = makeRoot('cancer');
    expect(root.description).to.equal('cancer');
  });
});
