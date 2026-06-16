import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { LanguageClient, ExecuteCommandRequest } from 'vscode-languageclient/node';
import { CqlDebugAdapterDescriptorFactory } from '../../../debug/cqlDebugAdapterDescriptorFactory';

suite('CqlDebugAdapterDescriptorFactory', () => {
  let sandbox: sinon.SinonSandbox;
  let clientMock: any;
  let factory: CqlDebugAdapterDescriptorFactory;
  let showErrorMessageStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    clientMock = {
      sendRequest: sandbox.stub(),
    } as any;
    factory = new CqlDebugAdapterDescriptorFactory(clientMock as LanguageClient);
    showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage');
  });

  teardown(() => {
    sandbox.restore();
  });

  test('createDebugAdapterDescriptor returns DebugAdapterServer on success', async () => {
    clientMock.sendRequest.resolves(4711);

    const sessionMock = {} as vscode.DebugSession;
    const result = await factory.createDebugAdapterDescriptor(sessionMock);

    expect(result).to.be.an.instanceOf(vscode.DebugAdapterServer);
    expect((result as vscode.DebugAdapterServer).port).to.equal(4711);
    expect(clientMock.sendRequest.calledOnce).to.be.true;
    expect(clientMock.sendRequest.firstCall.args[0]).to.equal(ExecuteCommandRequest.type);
    expect(clientMock.sendRequest.firstCall.args[1]).to.deep.equal({
      command: 'org.opencds.cqf.cql.debug.startDebugSession',
      arguments: [],
    });
  });

  test('createDebugAdapterDescriptor shows error toast and throws on failure', async () => {
    const error = new Error('Concurrent session active');
    clientMock.sendRequest.rejects(error);

    const sessionMock = {} as vscode.DebugSession;
    let thrownError: any = null;

    try {
      await factory.createDebugAdapterDescriptor(sessionMock);
    } catch (e) {
      thrownError = e;
    }

    expect(thrownError).to.equal(error);
    expect(showErrorMessageStub.calledOnce).to.be.true;
    expect(showErrorMessageStub.firstCall.args[0]).to.equal(
      'CQL debug session failed to start: Concurrent session active',
    );
  });
});
