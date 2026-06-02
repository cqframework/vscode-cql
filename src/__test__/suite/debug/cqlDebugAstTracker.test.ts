import { expect } from 'chai';
import * as sinon from 'sinon';
import { CqlDebugAstTrackerFactory } from '../../../debug/cqlDebugAstTracker';
import * as viewElm from '../../../commands/view-elm';

suite('CqlDebugAstTracker', () => {
  let sandbox: sinon.SinonSandbox;
  let factory: CqlDebugAstTrackerFactory;
  let hookSpy: { highlightCqlSpan: sinon.SinonSpy; noteExternalReveal: sinon.SinonSpy };
  let getActiveSplitDebugHookStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    factory = new CqlDebugAstTrackerFactory();
    hookSpy = {
      highlightCqlSpan: sandbox.spy(),
      noteExternalReveal: sandbox.spy(),
    };
    getActiveSplitDebugHookStub = sandbox.stub(viewElm, 'getActiveSplitDebugHook');
  });

  teardown(() => {
    sandbox.restore();
  });

  test('stopped event triggers stackTrace and hook call with 1-indexed span', async () => {
    getActiveSplitDebugHookStub.returns(hookSpy);

    const sessionMock = {
      customRequest: sandbox.stub().resolves({ stackFrames: [{ line: 7 }] }),
    } as any;

    const tracker = factory.createDebugAdapterTracker(sessionMock);

    await tracker.onDidSendMessage!({
      type: 'event',
      event: 'stopped',
      body: { threadId: 1 },
    });

    expect(sessionMock.customRequest.calledOnce).to.be.true;
    expect(sessionMock.customRequest.firstCall.args[0]).to.equal('stackTrace');
    expect(sessionMock.customRequest.firstCall.args[1]).to.deep.equal({
      threadId: 1,
      startFrame: 0,
      levels: 1,
    });
    expect(hookSpy.highlightCqlSpan.calledOnce).to.be.true;
    expect(hookSpy.highlightCqlSpan.firstCall.args[0]).to.deep.equal({
      line: 7,
      column: 1,
      endLine: 7,
      endColumn: 1,
    });
  });

  test('piggy-backs on stackTrace response from UI-issued request', () => {
    getActiveSplitDebugHookStub.returns(hookSpy);

    const sessionMock = {} as any;
    const tracker = factory.createDebugAdapterTracker(sessionMock);

    tracker.onDidSendMessage!({
      type: 'response',
      command: 'stackTrace',
      success: true,
      body: { stackFrames: [{ line: 4 }] },
    });

    expect(hookSpy.highlightCqlSpan.calledOnce).to.be.true;
    expect(hookSpy.highlightCqlSpan.firstCall.args[0]).to.deep.equal({
      line: 4,
      column: 1,
      endLine: 4,
      endColumn: 1,
    });
  });

  test('no active split view: tracker swallows without throwing', async () => {
    getActiveSplitDebugHookStub.returns(undefined);

    const sessionMock = {
      customRequest: sandbox.stub().resolves({ stackFrames: [{ line: 7 }] }),
    } as any;

    const tracker = factory.createDebugAdapterTracker(sessionMock);

    await tracker.onDidSendMessage!({
      type: 'event',
      event: 'stopped',
      body: { threadId: 1 },
    });

    expect(sessionMock.customRequest.calledOnce).to.be.true;
    // No error should be thrown
  });

  test('stopped event without threadId: does not call customRequest', async () => {
    getActiveSplitDebugHookStub.returns(hookSpy);

    const sessionMock = {
      customRequest: sandbox.stub(),
    } as any;

    const tracker = factory.createDebugAdapterTracker(sessionMock);

    await tracker.onDidSendMessage!({
      type: 'event',
      event: 'stopped',
      body: {},
    });

    expect(sessionMock.customRequest.called).to.be.false;
    expect(hookSpy.highlightCqlSpan.called).to.be.false;
  });

  test('customRequest rejection is caught silently', async () => {
    getActiveSplitDebugHookStub.returns(hookSpy);

    const sessionMock = {
      customRequest: sandbox.stub().rejects(new Error('session ended')),
    } as any;

    const tracker = factory.createDebugAdapterTracker(sessionMock);

    await tracker.onDidSendMessage!({
      type: 'event',
      event: 'stopped',
      body: { threadId: 1 },
    });

    expect(sessionMock.customRequest.calledOnce).to.be.true;
    // Should not throw
  });
});
