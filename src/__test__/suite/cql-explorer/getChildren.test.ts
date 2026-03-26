import { expect } from 'chai';
import * as vscode from 'vscode';
import { Uri, workspace } from 'vscode';
import { CqlLibrary, CqlProject, CqlTestCase } from '../../../cql-explorer/cqlProject';
import {
  CqlLibraryRootTreeItem,
  CqlProjectRootTreeItem,
  CqlProjectTreeDataProvider,
  CqlTestCasesLoadingTreeItem,
} from '../../../cql-explorer/cqlProjectTreeDataProvider';
import { DeviationKind } from '../../../cql-explorer/igLayoutDetector';

function fakeProject(name: string, libs: CqlLibrary[]): CqlProject {
  return {
    igRoot: `/fake/${name}`,
    name,
    projectDeviations: new Set<DeviationKind>(),
    Libraries: libs,
    on: () => {},
    loadTestCasesForLibrary: () => Promise.resolve(),
  } as unknown as CqlProject;
}

suite('CqlProjectTreeDataProvider.getChildren — synchronous return', () => {
  const wsRoot = workspace.workspaceFolders![0].uri;

  test('getChildren returns a plain array, not a Promise', () => {
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    const provider = new CqlProjectTreeDataProvider(fakeProject('P', [lib]));
    const result = provider.getChildren();
    expect(result instanceof Promise).to.be.false;
    expect(Array.isArray(result)).to.be.true;
  });

  test('getChildren with no element returns rootItems', () => {
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    const provider = new CqlProjectTreeDataProvider(fakeProject('P', [lib]));
    const result = provider.getChildren();
    expect(result).to.deep.equal(provider.getRootItems());
  });

  test('getChildren on not-loaded library returns [cqlLibraryTreeItem, CqlTestCasesLoadingTreeItem]', () => {
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    expect(lib.testCaseLoadState).to.equal('not-loaded');
    const provider = new CqlProjectTreeDataProvider(fakeProject('P', [lib]));
    const [libRootItem] = provider.getRootItems() as CqlLibraryRootTreeItem[];
    const children = provider.getChildren(libRootItem);
    expect(children).to.have.length(2);
    expect(children[0]).to.equal(libRootItem.cqlLibraryTreeItem);
    expect(children[1]).to.be.instanceOf(CqlTestCasesLoadingTreeItem);
  });

  test('getChildren on loaded library returns element.children (no spinner)', () => {
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    (lib as unknown as { testCaseLoadState: string }).testCaseLoadState = 'loaded';
    const provider = new CqlProjectTreeDataProvider(fakeProject('P', [lib]));
    const [libRootItem] = provider.getRootItems() as CqlLibraryRootTreeItem[];
    const children = provider.getChildren(libRootItem);
    expect(children).to.deep.equal(libRootItem.children);
    const hasSpinner = children.some(c => c instanceof CqlTestCasesLoadingTreeItem);
    expect(hasSpinner).to.be.false;
  });
});

suite('CqlProjectTreeDataProvider.applyPostScanUpdates', () => {
  const wsRoot = workspace.workspaceFolders![0].uri;

  test('with hideEmpty removes 0-testcase loaded libraries', () => {
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    const provider = new CqlProjectTreeDataProvider(fakeProject('P', [lib]));

    // Manually configure state: hideEmpty on, library loaded with no test cases
    (provider as unknown as { hideEmpty: boolean }).hideEmpty = true;
    (lib as unknown as { testCaseLoadState: string }).testCaseLoadState = 'loaded';

    expect(provider.getRootItems()).to.have.length(1);
    (provider as unknown as { applyPostScanUpdates: () => void }).applyPostScanUpdates();
    expect(provider.getRootItems()).to.have.length(0);
  });

  test('with hideEmpty retains not-loaded libraries (load state unknown)', () => {
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    const provider = new CqlProjectTreeDataProvider(fakeProject('P', [lib]));

    (provider as unknown as { hideEmpty: boolean }).hideEmpty = true;
    // lib remains 'not-loaded' — should be kept
    (provider as unknown as { applyPostScanUpdates: () => void }).applyPostScanUpdates();
    expect(provider.getRootItems()).to.have.length(1);
  });

  test('with showDeviationWarnings updates icon on library with deviations', () => {
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    lib.addDeviations([DeviationKind.MISSING_RESOURCE_TYPE]);
    const provider = new CqlProjectTreeDataProvider(fakeProject('P', [lib]));

    const [libRootItem] = provider.getRootItems() as CqlLibraryRootTreeItem[];
    // Initially no deviation warnings → symbol-file
    expect((libRootItem.iconPath as vscode.ThemeIcon).id).to.equal('symbol-file');

    (provider as unknown as { showDeviationWarnings: boolean }).showDeviationWarnings = true;
    (provider as unknown as { applyPostScanUpdates: () => void }).applyPostScanUpdates();

    expect((libRootItem.iconPath as vscode.ThemeIcon).id).to.equal('warning');
  });
});

suite('CqlLibraryRootTreeItem.updateDeviationIcon', () => {
  const wsRoot = workspace.workspaceFolders![0].uri;

  test('warnings on + deviations → warning icon with tooltip', () => {
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    lib.addDeviations([DeviationKind.MISSING_RESOURCE_TYPE]);
    const item = new CqlLibraryRootTreeItem(lib, vscode.TreeItemCollapsibleState.Collapsed);

    item.updateDeviationIcon(true);

    expect((item.iconPath as vscode.ThemeIcon).id).to.equal('warning');
    expect(item.tooltip).to.be.a('string').and.not.empty;
  });

  test('warnings off → symbol-file icon and no tooltip', () => {
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    lib.addDeviations([DeviationKind.MISSING_RESOURCE_TYPE]);
    const item = new CqlLibraryRootTreeItem(
      lib,
      vscode.TreeItemCollapsibleState.Collapsed,
      '',
      true, // start with warnings on
    );
    expect((item.iconPath as vscode.ThemeIcon).id).to.equal('warning');

    item.updateDeviationIcon(false);

    expect((item.iconPath as vscode.ThemeIcon).id).to.equal('symbol-file');
    expect(item.tooltip).to.be.undefined;
  });

  test('warnings on + no deviations → symbol-file icon', () => {
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    // No deviations added
    const item = new CqlLibraryRootTreeItem(lib, vscode.TreeItemCollapsibleState.Collapsed);

    item.updateDeviationIcon(true);

    expect((item.iconPath as vscode.ThemeIcon).id).to.equal('symbol-file');
  });
});

suite('CqlProjectRootTreeItem.removeLibraryItem', () => {
  const wsRoot = workspace.workspaceFolders![0].uri;

  test('removeLibraryItem removes the correct child from backing array', () => {
    const libA = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/LibA.cql'));
    const libB = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/LibB.cql'));
    const proj = fakeProject('P', [libA, libB]);
    const projRoot = new CqlProjectRootTreeItem(proj);

    const itemA = new CqlLibraryRootTreeItem(libA, vscode.TreeItemCollapsibleState.Collapsed);
    const itemB = new CqlLibraryRootTreeItem(libB, vscode.TreeItemCollapsibleState.Collapsed);
    projRoot.addLibraryItem(itemA);
    projRoot.addLibraryItem(itemB);
    expect(projRoot.children).to.have.length(2);

    projRoot.removeLibraryItem(itemA);

    expect(projRoot.children).to.have.length(1);
    expect(projRoot.children[0]).to.equal(itemB);
  });

  test('removeLibraryItem is a no-op when item is not a child', () => {
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/LibA.cql'));
    const proj = fakeProject('P', [lib]);
    const projRoot = new CqlProjectRootTreeItem(proj);
    const item = new CqlLibraryRootTreeItem(lib, vscode.TreeItemCollapsibleState.Collapsed);
    projRoot.addLibraryItem(item);

    const unrelated = new CqlLibraryRootTreeItem(lib, vscode.TreeItemCollapsibleState.Collapsed);
    projRoot.removeLibraryItem(unrelated); // not added — should not throw or mutate

    expect(projRoot.children).to.have.length(1);
  });
});

suite('CqlProjectTreeDataProvider.sortRootItemsInPlace', () => {
  const wsRoot = workspace.workspaceFolders![0].uri;

  test('descending sort reverses alphabetical order (single project)', () => {
    const libA = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/Apple.cql'));
    const libB = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/Banana.cql'));
    const libC = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/Cherry.cql'));
    // Libraries in ascending order; provider will build them ascending
    const provider = new CqlProjectTreeDataProvider(fakeProject('P', [libA, libB, libC]));

    const ascending = provider.getRootItems().map(i => i.label as string);
    expect(ascending).to.deep.equal(['Apple', 'Banana', 'Cherry']);

    (provider as unknown as { sortDescending: boolean }).sortDescending = true;
    (provider as unknown as { sortRootItemsInPlace: () => void }).sortRootItemsInPlace();

    const descending = provider.getRootItems().map(i => i.label as string);
    expect(descending).to.deep.equal(['Cherry', 'Banana', 'Apple']);
  });

  test('ascending sort (default) leaves alphabetical order unchanged (single project)', () => {
    const libA = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/Apple.cql'));
    const libB = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/Banana.cql'));
    const provider = new CqlProjectTreeDataProvider(fakeProject('P', [libA, libB]));

    (provider as unknown as { sortRootItemsInPlace: () => void }).sortRootItemsInPlace();

    const order = provider.getRootItems().map(i => i.label as string);
    expect(order).to.deep.equal(['Apple', 'Banana']);
  });
});

suite('CqlProjectTreeDataProvider — LIBRARY_REMOVED bug fix (multi-project)', () => {
  const wsRoot = workspace.workspaceFolders![0].uri;

  test('removeLibraryItem mutates the backing array, not a shallow copy', () => {
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/MyLib.cql'));
    const proj = fakeProject('P', [lib]);
    const projRoot = new CqlProjectRootTreeItem(proj);
    const item = new CqlLibraryRootTreeItem(lib, vscode.TreeItemCollapsibleState.Collapsed);
    projRoot.addLibraryItem(item);

    // Calling children returns a shallow copy; but removeLibraryItem must affect backing array
    const copy = projRoot.children; // shallow copy
    expect(copy).to.have.length(1);

    projRoot.removeLibraryItem(item);

    // Backing array updated — new call to children reflects removal
    expect(projRoot.children).to.have.length(0);
    // Old shallow copy is unaffected (proving it was a copy)
    expect(copy).to.have.length(1);
  });
});
