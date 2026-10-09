import { expect } from 'chai';
import * as sinon from 'sinon';
import { Uri } from 'vscode';
import { Commands } from '../../../commands/commands';
import * as clientModule from '../../../cql-language-server/cqlLanguageClient';
import { getVirtualSource } from '../../../cql-service/cqlService.getVirtualSource';
import * as sourceModule from '../../../cql-service/cqlService.getVirtualSource';
import { CqlVirtualSourceContentProvider } from '../../../cql-service/cqlVirtualSourceContentProvider';

suite('getVirtualSource()', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('sends the virtualSource command with the uri string', async () => {
    const sendStub = sandbox.stub(clientModule, 'sendRequest').resolves('library FHIRHelpers version \'1.0.000\'');
    const uri = Uri.parse('cql-virtual:///FHIRHelpers-1.0.000.cql');

    const result = await getVirtualSource(uri);

    expect(sendStub.calledOnce).to.be.true;
    expect(sendStub.firstCall.args[0]).to.equal(Commands.VIRTUAL_SOURCE);
    expect(sendStub.firstCall.args[1]).to.deep.equal([uri.toString()]);
    expect(result).to.equal('library FHIRHelpers version \'1.0.000\'');
  });

  test('returns null when the language server resolves null', async () => {
    sandbox.stub(clientModule, 'sendRequest').resolves(null);

    const result = await getVirtualSource(Uri.parse('cql-virtual://NO-SUCH-LIB'));

    expect(result).to.be.null;
  });
});

suite('CqlVirtualSourceContentProvider', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('serves content resolved for the requested uri', async () => {
    sandbox.stub(sourceModule, 'getVirtualSource').resolves('library FHIRHelpers version \'1.0.000\'');
    const provider = new CqlVirtualSourceContentProvider();

    const content = await provider.provideTextDocumentContent(Uri.parse('cql-virtual:///FHIRHelpers-1.0.000.cql'));

    expect(content).to.equal('library FHIRHelpers version \'1.0.000\'');
  });

  test('returns empty string when no content is resolved', async () => {
    sandbox.stub(sourceModule, 'getVirtualSource').resolves(null);
    const provider = new CqlVirtualSourceContentProvider();

    const content = await provider.provideTextDocumentContent(Uri.parse('cql-virtual://NO-SUCH-LIB'));

    expect(content).to.equal('');
  });

  test('returns empty string when resolution throws', async () => {
    sandbox.stub(sourceModule, 'getVirtualSource').rejects(new Error('boom'));
    const provider = new CqlVirtualSourceContentProvider();

    const content = await provider.provideTextDocumentContent(Uri.parse('cql-virtual://NO-SUCH-LIB'));

    expect(content).to.equal('');
  });
});