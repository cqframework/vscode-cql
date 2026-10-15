import path from 'node:path';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Uri, workspace } from 'vscode';
import { CqlLibrary, CqlProject } from '../../../model/cqlProject';
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

suite('CqlProject.loadResults', () => {
  test('resolves without error when results folder does not exist', async () => {
    const wsRoot = workspace.workspaceFolders![0].uri;
    const project = new CqlProject(wsRoot.fsPath, []);
    // loadResults is private; call via cast. The results folder won't exist in
    // the test workspace, so the inner readdir catch fires and we return early.
    // Before the fix this returned without logging; after the fix the finally
    // block always logs. Either way the promise must resolve, not reject.
    await (project as any).loadResults();
  });
});

suite('CqlProject testCaseResourceWatcher — results folder guard', () => {
  type Handler = (uri: Uri) => Promise<void> | void;
  interface FakeWatcher {
    create?: Handler;
    delete?: Handler;
    change?: Handler;
  }

  let project: CqlProject;
  let refresh: sinon.SinonStub;
  let watcher: FakeWatcher;
  let wsRoot: string;

  setup(() => {
    wsRoot = workspace.workspaceFolders![0].uri.fsPath;
    project = new CqlProject(wsRoot, []);
    refresh = sinon.stub(project, 'refresh');

    // Capture the handlers the project registers instead of using a real FS watcher.
    watcher = {};
    const fake = {
      onDidCreate: (h: Handler) => { watcher.create = h; },
      onDidDelete: (h: Handler) => { watcher.delete = h; },
      onDidChange: (h: Handler) => { watcher.change = h; },
    };
    const p = project as unknown as {
      testCaseResourceWatcher: unknown;
      configureTestCaseResourceWatcher: () => void;
    };
    p.testCaseResourceWatcher = fake;
    p.configureTestCaseResourceWatcher();
  });

  teardown(() => sinon.restore());

  const resultFile = () =>
    Uri.file(
      path.join(wsRoot, 'input', 'tests', 'results', 'SimpleMeasure', 'TestCaseResult-1111.json'),
    );

  test('create of a TestCaseResult JSON does not trigger a full refresh', async () => {
    await watcher.create!(resultFile());
    expect(refresh.called).to.be.false;
  });

  test('delete of a TestCaseResult JSON does not trigger a full refresh', async () => {
    await watcher.delete!(resultFile());
    expect(refresh.called).to.be.false;
  });

  test('change of a TestCaseResult JSON does not trigger a full refresh', async () => {
    await watcher.change!(resultFile());
    expect(refresh.called).to.be.false;
  });

  test('control: unknown test-case JSON outside results still triggers refresh', async () => {
    const uri = Uri.file(
      path.join(wsRoot, 'input', 'tests', 'Measure', 'Unknown', 'new-tc', 'Patient-1.json'),
    );
    await watcher.create!(uri);
    expect(refresh.calledOnce).to.be.true;
  });

  test('control: sibling dir with "results" prefix is not treated as results folder', async () => {
    const uri = Uri.file(
      path.join(wsRoot, 'input', 'tests', 'results-old', 'Lib', 'TestCaseResult-1.json'),
    );
    await watcher.create!(uri);
    expect(refresh.calledOnce).to.be.true;
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
