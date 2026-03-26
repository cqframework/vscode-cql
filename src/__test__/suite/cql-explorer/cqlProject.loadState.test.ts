import { expect } from 'chai';
import * as vscode from 'vscode';
import { Uri, workspace } from 'vscode';
import { CqlLibrary, CqlProject } from '../../../cql-explorer/cqlProject';
import { CqlTestCasesLoadingTreeItem } from '../../../cql-explorer/cqlProjectTreeDataProvider';

suite('CqlLibrary — initial load state', () => {
  test('CqlLibrary starts as not-loaded', () => {
    const wsRoot = workspace.workspaceFolders![0].uri;
    const lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
    expect(lib.testCaseLoadState).to.equal('not-loaded');
  });
});

suite('CqlProject.loadTestCasesForLibrary', () => {
  let project: CqlProject;
  let lib: CqlLibrary;

  setup(() => {
    const wsRoot = workspace.workspaceFolders![0].uri;
    project = new CqlProject(wsRoot.fsPath, []);
    lib = new CqlLibrary(Uri.joinPath(wsRoot, 'input/cql/SimpleMeasure.cql'));
  });

  test('transitions from not-loaded to loaded', async () => {
    expect(lib.testCaseLoadState).to.equal('not-loaded');
    await project.loadTestCasesForLibrary(lib, []);
    expect(lib.testCaseLoadState).to.equal('loaded');
  });

  test('emits LIBRARY_TESTCASES_LOADED event after load completes', async () => {
    let emittedLibrary: CqlLibrary | undefined;
    project.on(CqlProject.Events.LIBRARY_TESTCASES_LOADED, (l: CqlLibrary) => {
      emittedLibrary = l;
    });
    await project.loadTestCasesForLibrary(lib, []);
    expect(emittedLibrary).to.equal(lib);
  });

  test('is idempotent — second call when already loaded is a no-op', async () => {
    await project.loadTestCasesForLibrary(lib, []);
    expect(lib.testCaseLoadState).to.equal('loaded');

    let eventCount = 0;
    project.on(CqlProject.Events.LIBRARY_TESTCASES_LOADED, () => {
      eventCount++;
    });
    await project.loadTestCasesForLibrary(lib, []);
    expect(lib.testCaseLoadState).to.equal('loaded');
    expect(eventCount).to.equal(0);
  });
});

suite('CqlTestCasesLoadingTreeItem', () => {
  test('has spinner icon', () => {
    const item = new CqlTestCasesLoadingTreeItem();
    const icon = item.iconPath as vscode.ThemeIcon;
    expect(icon.id).to.equal('loading~spin');
  });

  test('has correct label and context value', () => {
    const item = new CqlTestCasesLoadingTreeItem();
    expect(item.label).to.equal('Loading test cases\u2026');
    expect(item.contextValue).to.equal('cql-testcases-loading');
  });
});
