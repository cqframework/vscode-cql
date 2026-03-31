import { expect } from 'chai';
import * as path from 'path';
import * as vscode from 'vscode';
import { Uri, workspace } from 'vscode';
import { CqlLibrary, CqlProject, CqlTestCase } from '../../../cql-explorer/cqlProject';
import {
  CqlLibraryRootTreeItem,
  CqlLibraryTreeItem,
  CqlProjectRootTreeItem,
  CqlProjectTreeDataProvider,
  CqlTestCaseRootTreeItem,
  CqlTestCaseTreeItem,
  buildTree,
} from '../../../cql-explorer/cqlProjectTreeDataProvider';
import { DeviationKind } from '../../../cql-explorer/igLayoutDetector';

suite('CqlProjectTreeDataProvider.nodeId()', () => {
  // Expected nodeId values per platform:
  // | Item type               | Platform   | Example output                                        |
  // |-------------------------|------------|-------------------------------------------------------|
  // | CqlLibraryRootTreeItem  | macOS/Linux| /workspace/input/cql/SimpleMeasure.cql                |
  // | CqlLibraryRootTreeItem  | Windows    | C:\workspace\input\cql\SimpleMeasure.cql              |
  // | CqlTestCaseRootTreeItem | macOS/Linux| /workspace/input/cql/SimpleMeasure.cql/testcases      |
  // | CqlTestCaseRootTreeItem | Windows    | C:\workspace\input\cql\SimpleMeasure.cql\testcases    |
  // | CqlTestCaseTreeItem     | macOS/Linux| /workspace/input/tests/measure/SimpleMeasure/1111     |
  // | CqlTestCaseTreeItem     | Windows    | C:\workspace\input\tests\measure\SimpleMeasure\1111   |
  // | CqlLibraryTreeItem      | any        | undefined (leaf node)                                 |

  let lib: CqlLibrary;
  let tc: CqlTestCase;

  setup(() => {
    const wsRoot = workspace.workspaceFolders![0].uri;
    lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    tc = new CqlTestCase(Uri.joinPath(wsRoot, 'input/tests/measure/SimpleMeasure/1111'));
  });

  test('CqlLibraryRootTreeItem ID equals library fsPath', () => {
    const item = new CqlLibraryRootTreeItem(lib, vscode.TreeItemCollapsibleState.Collapsed);
    const id = CqlProjectTreeDataProvider.nodeId(item);
    expect(id).to.equal(lib.uri.fsPath);
  });

  test('CqlTestCaseRootTreeItem ID is library fsPath joined with testcases', () => {
    const item = new CqlTestCaseRootTreeItem(vscode.TreeItemCollapsibleState.Collapsed, lib);
    const id = CqlProjectTreeDataProvider.nodeId(item);
    expect(id).to.equal(path.join(lib.uri.fsPath, 'testcases'));
  });

  test('CqlTestCaseRootTreeItem ID contains no double-slash', () => {
    const item = new CqlTestCaseRootTreeItem(vscode.TreeItemCollapsibleState.Collapsed, lib);
    const id = CqlProjectTreeDataProvider.nodeId(item)!;
    expect(id).to.not.include('//');
    expect(id).to.not.include('\\\\');
  });

  test('CqlTestCaseTreeItem ID equals test-case fsPath', () => {
    const item = new CqlTestCaseTreeItem(tc);
    const id = CqlProjectTreeDataProvider.nodeId(item);
    expect(id).to.equal(tc.uri.fsPath);
  });

  test('CqlLibraryTreeItem returns undefined (leaf node)', () => {
    const leaf = new CqlLibraryTreeItem(lib);
    expect(CqlProjectTreeDataProvider.nodeId(leaf)).to.be.undefined;
  });

  test('library and its testcase-root IDs are distinct', () => {
    const libItem = new CqlLibraryRootTreeItem(lib, vscode.TreeItemCollapsibleState.Collapsed);
    const rootItem = new CqlTestCaseRootTreeItem(vscode.TreeItemCollapsibleState.Collapsed, lib);
    expect(CqlProjectTreeDataProvider.nodeId(libItem)).to.not.equal(
      CqlProjectTreeDataProvider.nodeId(rootItem),
    );
  });
});

suite('buildTree per-library filter', () => {
  let simpleMeasureLib: CqlLibrary;
  let anotherMeasureLib: CqlLibrary;
  let tc1111: CqlTestCase;
  let tc2222: CqlTestCase;
  let tc3333: CqlTestCase;
  let tc4444: CqlTestCase;
  let fakeProject: CqlProject;

  setup(() => {
    const wsRoot = workspace.workspaceFolders![0].uri;

    simpleMeasureLib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    tc1111 = new CqlTestCase(Uri.joinPath(wsRoot, 'input/tests/measure/SimpleMeasure/1111'));
    tc2222 = new CqlTestCase(Uri.joinPath(wsRoot, 'input/tests/measure/SimpleMeasure/2222'));
    simpleMeasureLib.addTestCase(tc1111);
    simpleMeasureLib.addTestCase(tc2222);

    anotherMeasureLib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/AnotherMeasure.cql'));
    tc3333 = new CqlTestCase(Uri.joinPath(wsRoot, 'input/tests/measure/AnotherMeasure/3333'));
    tc4444 = new CqlTestCase(Uri.joinPath(wsRoot, 'input/tests/measure/AnotherMeasure/4444'));
    anotherMeasureLib.addTestCase(tc3333);
    anotherMeasureLib.addTestCase(tc4444);

    fakeProject = { Libraries: [simpleMeasureLib, anotherMeasureLib] } as unknown as CqlProject;
  });

  function getTestCaseRootItem(
    rootItem: CqlLibraryRootTreeItem,
  ): CqlTestCaseRootTreeItem | undefined {
    return rootItem.children.find(c => c instanceof CqlTestCaseRootTreeItem) as
      | CqlTestCaseRootTreeItem
      | undefined;
  }

  test('empty filter map shows all test cases for all libraries', () => {
    const items = buildTree(fakeProject, false, '', false, new Map());

    const simpleMeasure = items.find(i => i.label === 'SimpleMeasure') as CqlLibraryRootTreeItem | undefined;
    const anotherMeasure = items.find(i => i.label === 'AnotherMeasure') as CqlLibraryRootTreeItem | undefined;
    expect(simpleMeasure).to.exist;
    expect(anotherMeasure).to.exist;

    expect(getTestCaseRootItem(simpleMeasure!)?.children.length).to.equal(2);
    expect(getTestCaseRootItem(anotherMeasure!)?.children.length).to.equal(2);
  });

  test('testCaseFilter for one library does not affect another library', () => {
    const filters = new Map([[simpleMeasureLib.uri.fsPath, 'zzznomatch']]);
    const items = buildTree(fakeProject, false, '', false, filters);

    const simpleMeasure = items.find(i => i.label === 'SimpleMeasure') as CqlLibraryRootTreeItem | undefined;
    const anotherMeasure = items.find(i => i.label === 'AnotherMeasure') as CqlLibraryRootTreeItem | undefined;
    expect(simpleMeasure).to.exist;
    expect(anotherMeasure).to.exist;

    // SimpleMeasure filtered to zero — root item won't be created at all
    const simpleMeasureRoot = getTestCaseRootItem(simpleMeasure!);
    expect(simpleMeasureRoot?.children.length ?? 0).to.equal(0);

    // AnotherMeasure unaffected
    expect(getTestCaseRootItem(anotherMeasure!)?.children.length).to.equal(2);
  });
});

suite('buildTree — multi-project and deviations', () => {
  const wsRoot = workspace.workspaceFolders![0].uri;

  function makeLib(name: string): CqlLibrary {
    return new CqlLibrary(Uri.joinPath(wsRoot, `input/cql/${name}.cql`));
  }

  function fakeProject(name: string, libs: CqlLibrary[], deviations: DeviationKind[] = []): CqlProject {
    return {
      igRoot: `/fake/${name}`,
      name,
      projectDeviations: new Set(deviations),
      Libraries: libs,
    } as unknown as CqlProject;
  }

  test('single-project buildTree returns CqlLibraryRootTreeItem[] (no project wrapper)', () => {
    const lib = makeLib('SimpleMeasure');
    const project = fakeProject('MyProject', [lib]);
    const items = buildTree([project]);
    expect(items).to.have.length(1);
    expect(items[0]).to.be.instanceOf(CqlLibraryRootTreeItem);
  });

  test('multi-project buildTree returns CqlProjectRootTreeItem[]', () => {
    const lib1 = makeLib('LibA');
    const lib2 = makeLib('LibB');
    const p1 = fakeProject('ProjectA', [lib1]);
    const p2 = fakeProject('ProjectB', [lib2]);
    const items = buildTree([p1, p2]);
    expect(items).to.have.length(2);
    expect(items[0]).to.be.instanceOf(CqlProjectRootTreeItem);
    expect(items[1]).to.be.instanceOf(CqlProjectRootTreeItem);
  });

  test('multi-project project root contains library items as children', () => {
    const lib = makeLib('MyLib');
    const project = fakeProject('MyProject', [lib], [DeviationKind.MULTI_PROJECT_WORKSPACE]);
    const items = buildTree([project, fakeProject('Other', [])]);
    const projRoot = items[0] as CqlProjectRootTreeItem;
    expect(projRoot.children).to.have.length(1);
    expect(projRoot.children[0]).to.be.instanceOf(CqlLibraryRootTreeItem);
  });

  // showDeviationWarnings = false (default) — warnings suppressed
  test('library with deviation uses symbol-file icon when warnings are off (default)', () => {
    const lib = makeLib('MyLib');
    lib.addDeviations([DeviationKind.MISSING_RESOURCE_TYPE]);
    const project = fakeProject('MyProject', [lib]);
    const items = buildTree([project]); // default: showDeviationWarnings = false
    const libRoot = items[0] as CqlLibraryRootTreeItem;
    const icon = libRoot.iconPath as vscode.ThemeIcon;
    expect(icon.id).to.equal('symbol-file');
  });

  test('project with deviation uses symbol-package icon when warnings are off (default)', () => {
    const lib = makeLib('SomeLib');
    const p1 = fakeProject('P1', [lib], [DeviationKind.MULTI_PROJECT_WORKSPACE]);
    const p2 = fakeProject('P2', []);
    const items = buildTree([p1, p2]); // default: showDeviationWarnings = false
    const projRoot = items[0] as CqlProjectRootTreeItem;
    const icon = projRoot.iconPath as vscode.ThemeIcon;
    expect(icon.id).to.equal('symbol-package');
  });

  // showDeviationWarnings = true — warnings shown
  test('library with MISSING_RESOURCE_TYPE deviation uses warning icon when warnings are on', () => {
    const lib = makeLib('MyLib');
    lib.addDeviations([DeviationKind.MISSING_RESOURCE_TYPE]);
    const project = fakeProject('MyProject', [lib]);
    const items = buildTree([project], false, '', false, new Map(), true);
    const libRoot = items[0] as CqlLibraryRootTreeItem;
    const icon = libRoot.iconPath as vscode.ThemeIcon;
    expect(icon.id).to.equal('warning');
  });

  test('library without deviations uses symbol-file icon even when warnings are on', () => {
    const lib = makeLib('CleanLib');
    const project = fakeProject('MyProject', [lib]);
    const items = buildTree([project], false, '', false, new Map(), true);
    const libRoot = items[0] as CqlLibraryRootTreeItem;
    const icon = libRoot.iconPath as vscode.ThemeIcon;
    expect(icon.id).to.equal('symbol-file');
  });

  test('project with MULTI_PROJECT_WORKSPACE deviation uses warning icon when warnings are on', () => {
    const lib = makeLib('SomeLib');
    const p1 = fakeProject('P1', [lib], [DeviationKind.MULTI_PROJECT_WORKSPACE]);
    const p2 = fakeProject('P2', []);
    const items = buildTree([p1, p2], false, '', false, new Map(), true);
    const projRoot = items[0] as CqlProjectRootTreeItem;
    const icon = projRoot.iconPath as vscode.ThemeIcon;
    expect(icon.id).to.equal('warning');
  });

  test('project without deviations uses symbol-package icon even when warnings are on', () => {
    const lib = makeLib('SomeLib');
    const p1 = fakeProject('P1', [lib]);
    const p2 = fakeProject('P2', []);
    const items = buildTree([p1, p2], false, '', false, new Map(), true);
    const projRoot = items[0] as CqlProjectRootTreeItem;
    const icon = projRoot.iconPath as vscode.ThemeIcon;
    expect(icon.id).to.equal('symbol-package');
  });
});

suite('CqlProjectTreeDataProvider.nodeId() — CqlProjectRootTreeItem', () => {
  test('CqlProjectRootTreeItem ID equals igRoot', () => {
    const wsRoot = workspace.workspaceFolders![0].uri;
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/Lib.cql'));
    const fakeProj = {
      igRoot: '/workspace/MyProject',
      name: 'MyProject',
      projectDeviations: new Set<DeviationKind>(),
      Libraries: [lib],
    } as unknown as CqlProject;
    const item = new CqlProjectRootTreeItem(fakeProj);
    expect(CqlProjectTreeDataProvider.nodeId(item)).to.equal('/workspace/MyProject');
  });
});
