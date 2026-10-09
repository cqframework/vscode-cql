import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { CqlAstDebugViewController, activateController, sourcePathToUri } from '../../../debug/cqlAstDebugViewController';
import * as fetchModule from '../../../debug/debugAstFetcher';

const SAMPLE_AST = `Library: One (version unspecified) [id=0]
├── translator: CQL-to-ELM ?
├── schema: urn:hl7-org:elm r1
├── using: System (urn:hl7-org:elm-types:r1)
└── define: "One" returns System.Integer [id=208, loc=3:1-4:5]
  └── Literal: 1 [id=209, loc=4:5]`;

suite('CqlAstDebugViewController', () => {
  let sandbox: sinon.SinonSandbox;
  let context: vscode.ExtensionContext;
  let mockTreeView: { reveal: sinon.SinonStub; onDidChangeVisibility: sinon.SinonStub; dispose: sinon.SinonSpy };
  let mockDecoration: { dispose: sinon.SinonSpy };

  setup(() => {
    sandbox = sinon.createSandbox();
    mockTreeView = {
      reveal: sandbox.stub(),
      onDidChangeVisibility: sandbox.stub().returns({ dispose: sandbox.spy() }),
      dispose: sandbox.spy(),
    };
    mockDecoration = { dispose: sandbox.spy() };

    sandbox.stub(vscode.window, 'createTreeView').returns(mockTreeView as any);
    sandbox.stub(vscode.window, 'createTextEditorDecorationType').returns(mockDecoration as any);
    sandbox.stub(vscode.commands, 'registerCommand').returns({ dispose: sandbox.spy() });
    sandbox.stub(vscode.commands, 'executeCommand').resolves(undefined);
    sandbox.stub(vscode.debug, 'onDidStartDebugSession').returns({ dispose: sandbox.spy() });
    sandbox.stub(vscode.debug, 'onDidTerminateDebugSession').returns({ dispose: sandbox.spy() });
    sandbox.stub(vscode.debug, 'activeDebugSession').get(() => undefined);
    sandbox.stub(vscode.window, 'visibleTextEditors').get(() => []);

    context = { subscriptions: [] } as any;
  });

  teardown(() => {
    sandbox.restore();
  });

  test('activateController returns a controller instance', () => {
    const controller = activateController(context);
    expect(controller).to.be.instanceOf(CqlAstDebugViewController);
    controller.dispose();
  });

  test('onFrameStopped with same library reveals node and applies decoration', async () => {
    const fetchStub = sandbox.stub(fetchModule, 'fetchAstViaDap').resolves(SAMPLE_AST);
    const mockEditor = {
      setDecorations: sandbox.stub(),
      revealRange: sandbox.stub(),
      selection: {},
      document: { uri: { fsPath: '/test/file.cql' } },
    };
    sandbox.stub(vscode.window, 'visibleTextEditors').get(() => [mockEditor] as any);
    sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockEditor.document as any);
    sandbox.stub(vscode.window, 'showTextDocument').resolves(mockEditor as any);

    const controller = activateController(context);

    await controller.onFrameStopped({
      line: 3,
      column: 1,
      endLine: 4,
      endColumn: 5,
      source: { path: '/test/file.cql' },
    }, {} as any);

    // Should fetch AST once (first call)
    expect(fetchStub.calledOnce).to.be.true;

    // Should reveal the matching node
    expect(mockTreeView.reveal.calledOnce).to.be.true;
    const revealedNode = mockTreeView.reveal.firstCall.args[0];
    expect(revealedNode.id).to.equal('lid:208');

    // Should apply CQL decorations
    expect(mockEditor.setDecorations.called).to.be.true;

    controller.dispose();
  });

  test('onFrameStopped with different library swaps to new AST', async () => {
    const fetchStub = sandbox.stub(fetchModule, 'fetchAstViaDap').resolves(SAMPLE_AST);
    const mockEditor = {
      setDecorations: sandbox.stub(),
      revealRange: sandbox.stub(),
      selection: {},
      document: { uri: { fsPath: '/test/file.cql' } },
    };
    sandbox.stub(vscode.window, 'visibleTextEditors').get(() => [mockEditor] as any);
    sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockEditor.document as any);
    sandbox.stub(vscode.window, 'showTextDocument').resolves(mockEditor as any);

    const controller = activateController(context);

    // First frame on library A
    await controller.onFrameStopped({
      line: 3,
      column: 1,
      endLine: 4,
      endColumn: 5,
      source: { path: '/test/file.cql' },
    }, {} as any);

    expect(fetchStub.calledOnce).to.be.true;

    // Second frame on library B — should fetch again
    await controller.onFrameStopped({
      line: 3,
      column: 1,
      endLine: 4,
      endColumn: 5,
      source: { path: '/test/other.cql' },
    }, {} as any);

    expect(fetchStub.calledTwice).to.be.true;

    controller.dispose();
  });

  test('session end clears state', async () => {
    sandbox.stub(fetchModule, 'fetchAstViaDap').resolves(SAMPLE_AST);
    const mockEditor = {
      setDecorations: sandbox.stub(),
      revealRange: sandbox.stub(),
      selection: {},
      document: { uri: { fsPath: '/test/file.cql' } },
    };
    sandbox.stub(vscode.window, 'visibleTextEditors').get(() => [mockEditor] as any);

    const controller = activateController(context);

    // Trigger the onDidTerminateDebugSession callback manually
    const terminateCallbacks = (vscode.debug.onDidTerminateDebugSession as sinon.SinonStub).getCalls()
      .map(c => c.args[0]);
    for (const cb of terminateCallbacks) {
      cb({ type: 'cql' } as any);
    }

    // After session end, decorations should be cleared
    expect(mockEditor.setDecorations.called).to.be.true;

    controller.dispose();
  });

  test('non-CQL source path is ignored', async () => {
    const fetchStub = sandbox.stub(fetchModule, 'fetchAstViaDap').resolves(SAMPLE_AST);
    const controller = activateController(context);

    await controller.onFrameStopped({
      line: 3,
      column: 1,
      source: { path: '/test/file.java' },
    }, {} as any);

    expect(fetchStub.called).to.be.false;
    controller.dispose();
  });

  test('frame with no path or sourceReference is ignored', async () => {
    const fetchStub = sandbox.stub(fetchModule, 'fetchAstViaDap').resolves(SAMPLE_AST);
    const controller = activateController(context);

    await controller.onFrameStopped({
      line: 3,
      column: 1,
      source: {},
    }, {} as any);

    expect(fetchStub.called).to.be.false;
    controller.dispose();
  });

  test('cql-virtual path frame fetches AST with cql-virtual URI', async () => {
    const fetchStub = sandbox.stub(fetchModule, 'fetchAstViaDap').resolves(SAMPLE_AST);
    const controller = activateController(context);

    await controller.onFrameStopped({
      line: 3,
      column: 1,
      endLine: 4,
      endColumn: 5,
      source: { path: 'cql-virtual:///FHIRHelpers-4.0.1.cql' },
    }, {} as any);

    expect(fetchStub.calledOnce).to.be.true;
    // VS Code's Uri drops the empty authority when serialized (cql-virtual:/...), so compare
    // components; the language server normalizes both forms.
    const fetchedUri = fetchStub.firstCall.args[0] as vscode.Uri;
    expect(fetchedUri.scheme).to.equal('cql-virtual');
    expect(fetchedUri.path).to.equal('/FHIRHelpers-4.0.1.cql');

    expect(mockTreeView.reveal.calledOnce).to.be.true;

    controller.dispose();
  });

  test('virtual frame opens the cql-virtual document, not a file', async () => {
    sandbox.stub(fetchModule, 'fetchAstViaDap').resolves(SAMPLE_AST);
    const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves({} as any);
    sandbox.stub(vscode.window, 'showTextDocument').resolves({ setDecorations: sandbox.stub(), revealRange: sandbox.stub(), selection: null } as any);
    const controller = activateController(context);

    await controller.onFrameStopped({
      line: 3,
      column: 1,
      endLine: 4,
      endColumn: 5,
      source: { path: 'cql-virtual:///FHIRHelpers-4.0.1.cql' },
    }, {} as any);

    expect(openTextDocumentStub.calledOnce).to.be.true;
    const openedUri = openTextDocumentStub.firstCall.args[0] as unknown as vscode.Uri;
    expect(openedUri.scheme).to.equal('cql-virtual');
    controller.dispose();
  });

  test('dispose cleans up all resources', () => {
    const controller = activateController(context);
    controller.dispose();

    const treeCalls = (mockTreeView.dispose as sinon.SinonSpy).callCount;
    const decorCalls = (mockDecoration.dispose as sinon.SinonSpy).callCount;
    expect(treeCalls).to.equal(1);
    expect(decorCalls).to.be.at.least(1);
  });
});

// | Source.path                  | Uri scheme  |
// | ---------------------------- | ----------- |
// | /a/b/Lib.cql                 | file        |
// | C:\a\b\Lib.cql               | file        |
// | C:/a/b/Lib.cql               | file        |
// | cql-virtual:///Lib-1.0.0.cql | cql-virtual |
suite('sourcePathToUri', () => {
  test('posix path is a file URI', () => {
    const uri = sourcePathToUri('/a/b/Lib.cql');
    expect(uri.scheme).to.equal('file');
    expect(uri.path).to.equal('/a/b/Lib.cql');
  });

  test('Windows backslash path is a file URI, not a "C" scheme', () => {
    expect(sourcePathToUri('C:\\a\\b\\Lib.cql').scheme).to.equal('file');
  });

  test('Windows forward-slash path is a file URI, not a "C" scheme', () => {
    expect(sourcePathToUri('C:/a/b/Lib.cql').scheme).to.equal('file');
  });

  test('cql-virtual URI is parsed as a URI', () => {
    const uri = sourcePathToUri('cql-virtual:///Lib-1.0.0.cql');
    expect(uri.scheme).to.equal('cql-virtual');
    expect(uri.path).to.equal('/Lib-1.0.0.cql');
  });
});
