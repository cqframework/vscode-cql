import { expect } from 'chai';
import { TextDocument, Uri, commands, window, workspace } from 'vscode';
import { viewElm } from '../../../commands/view-elm';

const MOCK_JSON_ELM = JSON.stringify({
  library: {
    annotation: [],
    identifier: { id: 'SimpleMeasure', version: '1.0.0' },
    schemaIdentifier: { id: 'urn:hl7-org:elm', version: 'r1' },
    usings: {},
    statements: {},
  },
});

const MOCK_XML_ELM = `<?xml version="1.0" encoding="UTF-8"?>
<library xmlns="urn:hl7-org:elm:r1">
  <identifier id="SimpleMeasure" version="1.0.0"/>
</library>`;

suite('viewElm()', () => {
  let openedDocs: TextDocument[] = [];

  setup(() => {
    openedDocs = [];
  });

  teardown(async () => {
    // Close all documents opened during the test
    await commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('opens a JSON document containing the returned ELM', async () => {
    const cqlUri = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/cql/SimpleMeasure.cql',
    );

    await viewElm(cqlUri, 'json', async () => MOCK_JSON_ELM);

    const editor = window.activeTextEditor;
    expect(editor, 'expected an active text editor after viewElm').to.not.be.undefined;
    expect(editor!.document.languageId).to.equal('json');
    expect(editor!.document.getText()).to.equal(JSON.stringify(JSON.parse(MOCK_JSON_ELM), null, 2));
  });

  test('opens an XML document containing the returned ELM', async () => {
    const cqlUri = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/cql/SimpleMeasure.cql',
    );

    await viewElm(cqlUri, 'xml', async () => MOCK_XML_ELM);

    const editor = window.activeTextEditor;
    expect(editor, 'expected an active text editor after viewElm').to.not.be.undefined;
    expect(editor!.document.languageId).to.equal('xml');
    expect(editor!.document.getText()).to.equal(MOCK_XML_ELM);
  });

  test('defaults to XML when no type is specified', async () => {
    const cqlUri = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/cql/SimpleMeasure.cql',
    );

    await viewElm(cqlUri, undefined as any, async () => MOCK_XML_ELM);

    const editor = window.activeTextEditor;
    expect(editor!.document.languageId).to.equal('xml');
  });

  test('does not throw when the fetcher rejects (shows error instead)', async () => {
    const cqlUri = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/cql/SimpleMeasure.cql',
    );
    const failingFetcher = async (_uri: Uri, _type: 'xml' | 'json'): Promise<string> => {
      throw new Error('language server unavailable');
    };

    // viewElm catches errors internally and routes to showErrorMessage — must not re-throw
    await viewElm(cqlUri, 'json', failingFetcher);
    // If we reach here the error was handled gracefully
  });

  test('passes the correct elmType to the fetcher', async () => {
    const cqlUri = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/cql/SimpleMeasure.cql',
    );

    let capturedType: string | undefined;
    const capturingFetcher = async (_uri: Uri, type: 'xml' | 'json'): Promise<string> => {
      capturedType = type;
      return MOCK_JSON_ELM;
    };

    await viewElm(cqlUri, 'json', capturingFetcher);
    expect(capturedType).to.equal('json');

    await viewElm(cqlUri, 'xml', capturingFetcher);
    expect(capturedType).to.equal('xml');
  });

  test('passes the cql file URI to the fetcher', async () => {
    const cqlUri = Uri.joinPath(
      workspace.workspaceFolders![0].uri,
      'input/cql/SimpleMeasure.cql',
    );

    let capturedUri: Uri | undefined;
    const capturingFetcher = async (uri: Uri, _type: 'xml' | 'json'): Promise<string> => {
      capturedUri = uri;
      return MOCK_JSON_ELM;
    };

    await viewElm(cqlUri, 'json', capturingFetcher);
    expect(capturedUri?.fsPath).to.equal(cqlUri.fsPath);
  });
});
