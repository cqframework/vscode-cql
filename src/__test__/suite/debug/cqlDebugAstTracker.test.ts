import { expect } from 'chai';
import * as sinon from 'sinon';
import { CqlDebugAstTrackerFactory } from '../../../debug/cqlDebugAstTracker';
import { normalizeSpan } from '../../../debug/types';
import * as controllerModule from '../../../debug/cqlAstDebugViewController';

suite('CqlDebugAstTracker', () => {
  let sandbox: sinon.SinonSandbox;
  let factory: CqlDebugAstTrackerFactory;
  let controllerStub: { onFrameStopped: sinon.SinonStub };
  let getControllerInstanceStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    factory = new CqlDebugAstTrackerFactory();
    controllerStub = {
      onFrameStopped: sandbox.stub().resolves(undefined),
    };
    getControllerInstanceStub = sandbox.stub(controllerModule, 'getControllerInstance').returns(controllerStub as any);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('stopped event triggers stackTrace and controller call with frame', async () => {
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
    expect(controllerStub.onFrameStopped.calledOnce).to.be.true;
    const frameArg = controllerStub.onFrameStopped.firstCall.args[0];
    expect(frameArg.line).to.equal(7);
    expect(frameArg.source).to.be.undefined;
  });

  test('passes full frame to controller (instructionPointerReference, source path)', async () => {
    const sessionMock = {
      customRequest: sandbox.stub().resolves({
        stackFrames: [{
          line: 5, column: 3, endLine: 8, endColumn: 10,
          instructionPointerReference: '208',
          source: { path: '/test/file.cql' },
        }],
      }),
    } as any;

    const tracker = factory.createDebugAdapterTracker(sessionMock);

    await tracker.onDidSendMessage!({
      type: 'event',
      event: 'stopped',
      body: { threadId: 1 },
    });

    expect(controllerStub.onFrameStopped.calledOnce).to.be.true;
    const frameArg = controllerStub.onFrameStopped.firstCall.args[0];
    expect(frameArg.line).to.equal(5);
    expect(frameArg.column).to.equal(3);
    expect(frameArg.endLine).to.equal(8);
    expect(frameArg.endColumn).to.equal(10);
    expect(frameArg.instructionPointerReference).to.equal('208');
    expect(frameArg.source.path).to.equal('/test/file.cql');
  });

  test('piggy-backs on stackTrace response from UI-issued request', () => {
    const sessionMock = {} as any;
    const tracker = factory.createDebugAdapterTracker(sessionMock);

    tracker.onDidSendMessage!({
      type: 'response',
      command: 'stackTrace',
      success: true,
      body: { stackFrames: [{ line: 4 }] },
    });

    expect(controllerStub.onFrameStopped.calledOnce).to.be.true;
    expect(controllerStub.onFrameStopped.firstCall.args[0].line).to.equal(4);
  });

  test('no controller: tracker swallows without throwing', async () => {
    // Re-stub from setup to return undefined instead of the controllerStub
    getControllerInstanceStub.returns(undefined);

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
  });

  test('stopped event without threadId: does not call customRequest', async () => {
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
    expect(controllerStub.onFrameStopped.called).to.be.false;
  });

  test('customRequest rejection is caught silently', async () => {
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
  });
});

suite('normalizeSpan', () => {
  test('defaults endLine to line when endLine omitted', () => {
    const result = normalizeSpan({ line: 7, column: 3 });
    expect(result).to.deep.equal({ line: 7, column: 3, endLine: 7, endColumn: 3 });
  });

  test('defaults endColumn to column when endColumn omitted', () => {
    const result = normalizeSpan({ line: 7, column: 3, endLine: 7 });
    expect(result).to.deep.equal({ line: 7, column: 3, endLine: 7, endColumn: 3 });
  });

  test('defaults column to 1 when omitted', () => {
    const result = normalizeSpan({ line: 7 });
    expect(result).to.deep.equal({ line: 7, column: 1, endLine: 7, endColumn: 1 });
  });

  test('preserves explicit end coordinates', () => {
    const result = normalizeSpan({ line: 5, column: 3, endLine: 8, endColumn: 12 });
    expect(result).to.deep.equal({ line: 5, column: 3, endLine: 8, endColumn: 12 });
  });

  test('preserves localId when instructionPointerReference is present', () => {
    const result = normalizeSpan({ line: 5, column: 3, endLine: 8, endColumn: 12, instructionPointerReference: '42' });
    expect(result).to.deep.equal({ line: 5, column: 3, endLine: 8, endColumn: 12, localId: '42' });
  });

  test('omits localId when instructionPointerReference is absent', () => {
    const result = normalizeSpan({ line: 7, column: 5, endLine: 7, endColumn: 10 });
    expect(result).to.not.have.property('localId');
  });
});
