import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Commands } from '../../../commands/commands';
import * as viewElm from '../../../commands/view-elm';
import { activateStepGranularityToggle } from '../../../debug/stepGranularityToggle';

suite('stepGranularityToggle', () => {
  let sandbox: sinon.SinonSandbox;
  let context: vscode.ExtensionContext;
  let statusBarItemStub: { show: sinon.SinonSpy; hide: sinon.SinonSpy; command: string | undefined; text: string; tooltip: string | undefined };

  setup(() => {
    sandbox = sinon.createSandbox();
    statusBarItemStub = {
      show: sandbox.spy(),
      hide: sandbox.spy(),
      command: undefined,
      text: '',
      tooltip: undefined,
    };
    context = {
      subscriptions: [],
    } as any;
    sandbox.stub(vscode.window, 'createStatusBarItem').returns(statusBarItemStub as any);
    sandbox.stub(vscode.commands, 'registerCommand').callsFake((command, handler) => {
      context.subscriptions.push({ command, execute: handler } as any);
      return { dispose: sandbox.spy() };
    });
  });

  teardown(() => {
    sandbox.restore();
  });

  test('toggle alternates cql and ast and emits customRequest', async () => {
    const sessionMock = {
      type: 'cql',
      configuration: { stepGranularity: 'cql' },
      customRequest: sandbox.stub().resolves(undefined),
    } as any;

    sandbox.stub(vscode.debug, 'onDidStartDebugSession').callsFake((callback: (e: vscode.DebugSession) => void) => {
      callback(sessionMock);
      return { dispose: sandbox.spy() };
    });
    sandbox.stub(vscode.debug, 'activeDebugSession').get(() => sessionMock);

    activateStepGranularityToggle(context);

    const toggleCommand = context.subscriptions.find(
      (sub: any) => sub.command === 'cql.debug.toggle-step-granularity' && typeof sub.execute === 'function',
    );
    expect(toggleCommand).to.exist;

    await (toggleCommand as any).execute();

    expect(sessionMock.customRequest.calledOnce).to.be.true;
    expect(sessionMock.customRequest.firstCall.args[0]).to.equal('setStepGranularity');
    expect(sessionMock.customRequest.firstCall.args[1]).to.deep.equal({ granularity: 'ast' });
  });

  test('status bar hidden when no cql session is active', () => {
    sandbox.stub(vscode.debug, 'onDidChangeActiveDebugSession').callsFake((callback: (e: vscode.DebugSession | undefined) => void) => {
      callback(undefined);
      return { dispose: sandbox.spy() };
    });
    sandbox.stub(vscode.debug, 'onDidTerminateDebugSession').callsFake((callback: (e: vscode.DebugSession) => void) => {
      return { dispose: sandbox.spy() };
    });

    activateStepGranularityToggle(context);

    expect(statusBarItemStub.hide.called).to.be.true;
  });

  test('opens split view when toggling to ast with no active split session', async () => {
    sandbox.stub(viewElm, 'getActiveSplitDebugHook').returns(undefined);
    sandbox.stub(vscode.window, 'visibleTextEditors').get(() => [
      { document: { uri: { fsPath: '/test/file.cql' } } } as any,
    ]);
    const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves(undefined);

    const sessionMock = {
      type: 'cql',
      configuration: { stepGranularity: 'cql' },
      customRequest: sandbox.stub().resolves(undefined),
    } as any;

    sandbox.stub(vscode.debug, 'onDidStartDebugSession').callsFake((callback: (e: vscode.DebugSession) => void) => {
      callback(sessionMock);
      return { dispose: sandbox.spy() };
    });
    sandbox.stub(vscode.debug, 'activeDebugSession').get(() => sessionMock);

    activateStepGranularityToggle(context);

    const toggleCommand = context.subscriptions.find(
      (sub: any) => sub.command === 'cql.debug.toggle-step-granularity' && typeof sub.execute === 'function',
    );
    expect(toggleCommand).to.exist;

    await (toggleCommand as any).execute();

    expect(executeCommandStub.calledOnce).to.be.true;
    expect(executeCommandStub.firstCall.args[0]).to.equal(Commands.VIEW_ELM_COMMAND_AST_SPLIT);
    expect(executeCommandStub.firstCall.args[1].fsPath).to.equal('/test/file.cql');
  });

  test('does not open split view when toggling to ast if split session already active', async () => {
    sandbox.stub(viewElm, 'getActiveSplitDebugHook').returns({
      highlightCqlLine: sandbox.spy(),
      noteExternalReveal: sandbox.spy(),
    });
    const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves(undefined);

    const sessionMock = {
      type: 'cql',
      configuration: { stepGranularity: 'cql' },
      customRequest: sandbox.stub().resolves(undefined),
    } as any;

    sandbox.stub(vscode.debug, 'onDidStartDebugSession').callsFake((callback: (e: vscode.DebugSession) => void) => {
      callback(sessionMock);
      return { dispose: sandbox.spy() };
    });
    sandbox.stub(vscode.debug, 'activeDebugSession').get(() => sessionMock);

    activateStepGranularityToggle(context);

    const toggleCommand = context.subscriptions.find(
      (sub: any) => sub.command === 'cql.debug.toggle-step-granularity' && typeof sub.execute === 'function',
    );
    expect(toggleCommand).to.exist;

    await (toggleCommand as any).execute();

    expect(executeCommandStub.called).to.be.false;
  });
});