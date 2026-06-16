import fs from 'node:fs';
import { expect } from 'chai';
import * as vscode from 'vscode';
import { Uri, workspace } from 'vscode';
import { CqlLibrary, CqlTestCase } from '../../../model/cqlProject';
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

  test('constructor sorts test cases alphabetically', () => {
    const freshLib = new CqlLibrary(
      Uri.joinPath(
        workspace.workspaceFolders![0].uri,
        'input/cql/SimpleMeasure.cql',
      ),
    );
    freshLib.testCaseLoadState = 'loaded';
    // Add test cases in reverse alphabetical order
    freshLib.addTestCase(
      new CqlTestCase(
        Uri.joinPath(
          workspace.workspaceFolders![0].uri,
          'input/tests/Measure/SimpleMeasure/3333',
        ),
      ),
    );
    freshLib.addTestCase(
      new CqlTestCase(
        Uri.joinPath(
          workspace.workspaceFolders![0].uri,
          'input/tests/Measure/SimpleMeasure/1111',
        ),
      ),
    );
    freshLib.addTestCase(
      new CqlTestCase(
        Uri.joinPath(
          workspace.workspaceFolders![0].uri,
          'input/tests/Measure/SimpleMeasure/2222',
        ),
      ),
    );

    const item = new CqlLibraryRootTreeItem(
      freshLib,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    expect(getTestCaseNames(item)).to.deep.equal(['1111', '2222', '3333']);
  });

  test('rebuildTestCases preserves alphabetical order', () => {
    const freshLib = new CqlLibrary(
      Uri.joinPath(
        workspace.workspaceFolders![0].uri,
        'input/cql/SimpleMeasure.cql',
      ),
    );
    freshLib.testCaseLoadState = 'loaded';
    // Add test cases in reverse alphabetical order
    freshLib.addTestCase(
      new CqlTestCase(
        Uri.joinPath(
          workspace.workspaceFolders![0].uri,
          'input/tests/Measure/SimpleMeasure/3333',
        ),
      ),
    );
    freshLib.addTestCase(
      new CqlTestCase(
        Uri.joinPath(
          workspace.workspaceFolders![0].uri,
          'input/tests/Measure/SimpleMeasure/1111',
        ),
      ),
    );
    freshLib.addTestCase(
      new CqlTestCase(
        Uri.joinPath(
          workspace.workspaceFolders![0].uri,
          'input/tests/Measure/SimpleMeasure/2222',
        ),
      ),
    );

    const item = new CqlLibraryRootTreeItem(
      freshLib,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    // Rebuild with same filter
    item.rebuildTestCases('');
    expect(getTestCaseNames(item)).to.deep.equal(['1111', '2222', '3333']);
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

suite('CqlLibraryRootTreeItem — CMS-numbered test case sorting', () => {
  let lib: CqlLibrary;
  const cmsDirs: string[] = [];

  setup(() => {
    const wsRoot = workspace.workspaceFolders![0].uri;
    const libUri = Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql');
    lib = new CqlLibrary(libUri);
    lib.testCaseLoadState = 'loaded';
  });

  teardown(() => {
    for (const dir of cmsDirs) {
      try { fs.rmdirSync(dir); } catch { /* ok */ }
    }
    cmsDirs.length = 0;
  });

  function createTestCase(name: string): CqlTestCase {
    const wsRoot = workspace.workspaceFolders![0].uri;
    const dir = Uri.joinPath(wsRoot, `input/tests/Measure/SimpleMeasure/${name}`).fsPath;
    fs.mkdirSync(dir, { recursive: true });
    cmsDirs.push(dir);
    return new CqlTestCase(Uri.file(dir));
  }

  function getTestCaseNames(item: CqlLibraryRootTreeItem): string[] {
    const root = item.children.find(c => c instanceof CqlTestCaseRootTreeItem) as
      | CqlTestCaseRootTreeItem
      | undefined;
    if (!root) return [];
    return root.children
      .filter((c): c is CqlTestCaseTreeItem => c instanceof CqlTestCaseTreeItem)
      .map(c => c.cqlTestCase.name);
  }

  test('constructor sorts CMS-named test cases by numeric measure number', () => {
    const tcCMS22 = createTestCase('CMS22FHIRPCSBPScreeningFollowUp');
    const tcCMS2 = createTestCase('CMS2FHIRPCSDepScreenAndFollowUp');
    const tcCMS129 = createTestCase('CMS129FHIRProstCaBoneScanUse');
    // Add in reverse numeric order
    lib.addTestCase(tcCMS129);
    lib.addTestCase(tcCMS22);
    lib.addTestCase(tcCMS2);

    const item = new CqlLibraryRootTreeItem(lib, vscode.TreeItemCollapsibleState.Collapsed);
    expect(getTestCaseNames(item)).to.deep.equal([
      'CMS2FHIRPCSDepScreenAndFollowUp',
      'CMS22FHIRPCSBPScreeningFollowUp',
      'CMS129FHIRProstCaBoneScanUse',
    ]);
  });

  test('constructor sorts non-CMS (< CMS alphabetically), then CMS by number, then non-CMS (> CMS alphabetically)', () => {
    const tcCMS22 = createTestCase('CMS22FHIRPCSBPScreeningFollowUp');
    const tcAlpha = createTestCase('AHAOverall');
    const tcCMS2 = createTestCase('CMS2FHIRPCSDepScreenAndFollowUp');
    const tcBeta = createTestCase('Antibiotic');
    lib.addTestCase(tcBeta);
    lib.addTestCase(tcCMS22);
    lib.addTestCase(tcAlpha);
    lib.addTestCase(tcCMS2);

    const item = new CqlLibraryRootTreeItem(lib, vscode.TreeItemCollapsibleState.Collapsed);
    expect(getTestCaseNames(item)).to.deep.equal([
      'AHAOverall',
      'Antibiotic',
      'CMS2FHIRPCSDepScreenAndFollowUp',
      'CMS22FHIRPCSBPScreeningFollowUp',
    ]);
  });

  test('constructor handles CMSFHIR prefix in numeric measure order', () => {
    const tcCMSFHIR529 = createTestCase('CMSFHIR529HybirdHospitalWidReadmission');
    const tcCMS2 = createTestCase('CMS2FHIRPCSDepScreenAndFollowUp');
    lib.addTestCase(tcCMSFHIR529);
    lib.addTestCase(tcCMS2);

    const item = new CqlLibraryRootTreeItem(lib, vscode.TreeItemCollapsibleState.Collapsed);
    expect(getTestCaseNames(item)).to.deep.equal([
      'CMS2FHIRPCSDepScreenAndFollowUp',
      'CMSFHIR529HybirdHospitalWidReadmission',
    ]);
  });

  test('non-CMS names before CMS alphabetically come first, CMS by number in middle, non-CMS after CMS alphabetically come last', () => {
    const tcCMS = createTestCase('CMS2FHIRSimple');
    const tcZebra = createTestCase('Zebra');
    const tcAlpha = createTestCase('Alpha');
    lib.addTestCase(tcZebra);
    lib.addTestCase(tcCMS);
    lib.addTestCase(tcAlpha);

    const item = new CqlLibraryRootTreeItem(lib, vscode.TreeItemCollapsibleState.Collapsed);
    expect(getTestCaseNames(item)).to.deep.equal([
      'Alpha',
      'CMS2FHIRSimple',
      'Zebra',
    ]);
  });

  test('rebuildTestCases preserves CMS-numbered sort order', () => {
    const tcCMS22 = createTestCase('CMS22FHIRPCSBPScreeningFollowUp');
    const tcCMS2 = createTestCase('CMS2FHIRPCSDepScreenAndFollowUp');
    lib.addTestCase(tcCMS22);
    lib.addTestCase(tcCMS2);

    const item = new CqlLibraryRootTreeItem(lib, vscode.TreeItemCollapsibleState.Collapsed);
    expect(getTestCaseNames(item)).to.deep.equal([
      'CMS2FHIRPCSDepScreenAndFollowUp',
      'CMS22FHIRPCSBPScreeningFollowUp',
    ]);

    item.rebuildTestCases('');
    expect(getTestCaseNames(item)).to.deep.equal([
      'CMS2FHIRPCSDepScreenAndFollowUp',
      'CMS22FHIRPCSBPScreeningFollowUp',
    ]);
  });
});
