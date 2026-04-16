import { expect } from 'chai';
import * as vscode from 'vscode';
import { Uri, workspace } from 'vscode';
import { CqlLibrary, CqlTestCase } from '../../../cql-explorer/cqlProject';
import {
  CqlLibraryRootTreeItem,
  CqlResultsRootTreeItem,
  CqlTestCaseRootTreeItem,
  CqlTestCaseTreeItem,
} from '../../../cql-explorer/cqlProjectTreeDataProvider';

suite('CqlLibraryRootTreeItem.rebuildTestCases', () => {
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

    lib.testCaseLoadState = 'loaded';
    lib.addTestCase(tc1111);
    lib.addTestCase(tc2222);
  });

  function getTestCaseRootItem(item: CqlLibraryRootTreeItem): CqlTestCaseRootTreeItem | undefined {
    return item.children.find(c => c instanceof CqlTestCaseRootTreeItem) as
      | CqlTestCaseRootTreeItem
      | undefined;
  }

  function getTestCaseNames(item: CqlLibraryRootTreeItem): string[] {
    const root = getTestCaseRootItem(item);
    if (!root) return [];
    return root.children
      .filter((c): c is CqlTestCaseTreeItem => c instanceof CqlTestCaseTreeItem)
      .map(c => c.cqlTestCase.name);
  }

  test('no filter — all test cases shown after rebuildTestCases', () => {
    const item = new CqlLibraryRootTreeItem(
      lib,
      vscode.TreeItemCollapsibleState.Collapsed,
      '',
    );
    item.rebuildTestCases('');
    expect(getTestCaseNames(item)).to.have.members(['1111', '2222']);
  });

  test('rebuildTestCases applies the new filter — matching case shown', () => {
    const item = new CqlLibraryRootTreeItem(
      lib,
      vscode.TreeItemCollapsibleState.Collapsed,
      '',
    );
    item.rebuildTestCases('1111');
    expect(getTestCaseNames(item)).to.deep.equal(['1111']);
  });

  test('rebuildTestCases applies the new filter — non-matching case hidden', () => {
    const item = new CqlLibraryRootTreeItem(
      lib,
      vscode.TreeItemCollapsibleState.Collapsed,
      '',
    );
    item.rebuildTestCases('zzznomatch');
    expect(getTestCaseNames(item)).to.be.empty;
  });

  test('rebuildTestCases with empty filter after a prior filter shows all cases', () => {
    const item = new CqlLibraryRootTreeItem(
      lib,
      vscode.TreeItemCollapsibleState.Collapsed,
      '1111',
    );
    // Initially only 1111 visible
    expect(getTestCaseNames(item)).to.deep.equal(['1111']);

    // Clearing the filter shows both
    item.rebuildTestCases('');
    expect(getTestCaseNames(item)).to.have.members(['1111', '2222']);
  });

  test('rebuildTestCases adds Results node when result is added', () => {
    const item = new CqlLibraryRootTreeItem(lib, vscode.TreeItemCollapsibleState.Collapsed);
    // Initially no result
    expect(item.children.some(c => c instanceof CqlResultsRootTreeItem)).to.be.false;

    lib.addResult(Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/tests/results/SimpleMeasure.txt',
    ));
    item.rebuildTestCases('');
    expect(item.children.some(c => c instanceof CqlResultsRootTreeItem)).to.be.true;
  });

  test('rebuildTestCases removes Results node when results are cleared', () => {
    lib.addResult(Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/tests/results/SimpleMeasure.txt',
    ));
    const item = new CqlLibraryRootTreeItem(lib, vscode.TreeItemCollapsibleState.Collapsed);
    expect(item.children.some(c => c instanceof CqlResultsRootTreeItem)).to.be.true;

    lib.clearResults();
    item.rebuildTestCases('');
    expect(item.children.some(c => c instanceof CqlResultsRootTreeItem)).to.be.false;
  });
});
