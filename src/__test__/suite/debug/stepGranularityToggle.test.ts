import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
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

  test('focuses AST tree view when toggling to ast', async () => {
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
    expect(executeCommandStub.firstCall.args[0]).to.equal('cql.debug.ast.focus');
  });

  test('non-CQL session does not trigger focus', async () => {
    const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves(undefined);

    const sessionMock = {
      type: 'not-cql',
      configuration: {},
      customRequest: sandbox.stub().resolves(undefined),
    } as any;

    sandbox.stub(vscode.debug, 'onDidStartDebugSession').callsFake((callback: (e: vscode.DebugSession) => void) => {
      return { dispose: sandbox.spy() };
    });
    sandbox.stub(vscode.debug, 'activeDebugSession').get(() => undefined);

    activateStepGranularityToggle(context);

    expect(executeCommandStub.called).to.be.false;
  });
});
