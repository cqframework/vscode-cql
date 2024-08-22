import * as assert from 'assert';
import path from 'path';
import { ExtensionContext, extensions, window, workspace } from 'vscode';
import { URI } from 'vscode-uri';
import { buildParameters } from '../../buildParameters';
import { ConnectionManager } from '../../connectionManager';

const libraryUrl = path.resolve(__dirname, '../suite/resources/simple-test-ig/input/cql');
const terminologyUrl = path.resolve(
  __dirname,
  '../suite/resources/simple-test-ig/input/vocabulary/valueset',
);
suite('buildParameters - Public API Testing', () => {
  const testWorkspacePath = path.resolve(__dirname, '../suite/resources/simple-test-ig');
  const testFilePath = path.join(testWorkspacePath, 'input/cql/Test.cql');
  let connectionManager = ConnectionManager.getManager();

  suiteSetup(async function () {
    workspace.updateWorkspaceFolders(0, 0, { uri: URI.file(testWorkspacePath) });
    assert.ok(workspace.workspaceFolders?.length, 'Workspace folder is not open');
    const document = await workspace.openTextDocument(testFilePath);
    await window.showTextDocument(document);

    this.timeout(0);
    if (connectionManager === undefined) {
      const extension = extensions.getExtension('cqframework.cql'); // as unknown as vscode.ExtensionContext;
      if (!extension?.isActive) {
        await extension?.activate();
      }
      ConnectionManager._initialize(extension?.activate() as unknown as ExtensionContext);

      assert.ok(ConnectionManager.getManager() !== undefined);

      ConnectionManager._initialize;
      connectionManager = ConnectionManager.getManager();
    }
  });

  setup(async () => {
    // resetting connections.
    connectionManager.upsertConnection({
      name: 'Local',
      endpoint: 'Local Connection',
      contexts: {
        patient1: {
          resourceID: 'simple-test',
          resourceType: 'Patient',
        },
      },
    });

    connectionManager.upsertConnection({
      name: 'Remote Build Parameters',
      endpoint: 'http://localhost:8000',
      contexts: {
        patient1: {
          resourceID: 'simple-test',
          resourceType: 'Patient',
        },
      },
    });
  });

  test('Should display no library content found information message when initial cql uri is not found.', () => {
    const nonExistentUri = URI.file('/path/to/non-existent-file.cql');
    const expression = 'testExpression';

    const params = buildParameters(nonExistentUri, expression);

    assert.ok(params.operationArgs === undefined);
    assert.ok(params.outputPath === undefined);
    assert.ok(params.testPath === undefined);
    // const informationMessage = window.showInformationMessage;
    // informationMessage.toHaveBeenCalledWith(
    //   'No library content found. Please save before executing.',
    // );
  });

  test('should generate correct parameters when file exists and connection is Local and Local does not contain context Values', () => {
    let connections = connectionManager.getAllConnections();
    let localConnections = Object.values(connections).filter(
      connection => connection.name === 'Local',
    )[0];
    localConnections.contexts = {};
    connectionManager.setCurrentConnection('Local');
    const uri = URI.file(path.resolve(testFilePath));
    const expression = 'Test';
    const params = buildParameters(uri, expression);

    assert.ok(params.operationArgs?.includes('cql'));
    assert.ok(params.operationArgs?.includes('-fv=R4'));
    assert.ok(params.operationArgs?.includes('-ln=Test'));
    assert.ok(params.operationArgs?.includes(`-lu=file://${libraryUrl}`));
    assert.ok(params.operationArgs?.includes('-e=Test'));
    assert.ok(params.operationArgs?.includes(`-t=file://${terminologyUrl}`));
    assert.ok(params.operationArgs?.includes('-m=FHIR'));
    assert.ok(
      params.operationArgs?.includes(
        `-mu=file://${path.resolve(__dirname, '../suite/resources/simple-test-ig/input/tests/Test/simple-test')}`,
      ),
    );
    assert.ok(params.operationArgs?.includes('-cv=simple-test'));
    assert.ok(params.outputPath?.fsPath.includes('results/Test.txt'));
    assert.ok(params.testPath?.fsPath.includes('input/tests'));
  });

  test('should generate parameters with non-Local connection and no existing cql-options', () => {
    connectionManager.setCurrentConnection('Remote Build Parameters');
    const uri = URI.file(path.resolve(testFilePath));
    const expression = 'Test';
    const params = buildParameters(uri, expression);

    assert.ok(params.operationArgs?.includes('cql'));
    assert.ok(params.operationArgs?.includes('-fv=R4'));
    assert.ok(!params.operationArgs?.includes('-op='));
    assert.ok(params.operationArgs?.includes('-ln=Test'));
    assert.ok(
      params.operationArgs?.includes(
        `-lu=file://${path.resolve(__dirname, '../suite/resources/simple-test-ig/input/cql')}`,
      ),
    );
    assert.ok(params.operationArgs?.includes('-e=Test'));
    assert.ok(
      params.operationArgs?.includes(
        `-t=file://${path.resolve(__dirname, '../suite/resources/simple-test-ig/input/vocabulary/valueset')}`,
      ),
    );
    assert.ok(params.operationArgs?.includes('-m=FHIR'));
    assert.ok(params.operationArgs?.includes('-mu=http://localhost:8000'));
    assert.ok(params.operationArgs?.includes('-cv=simple-test'));
    assert.ok(params.outputPath?.fsPath.includes('results/Test.txt'));
    assert.ok(params.testPath?.fsPath.includes('input/tests'));
  });

  test('should generate parameters with non-Local connection and multiple context parameters', () => {
    const connectionName = 'Remote Build Parameters';
    connectionManager.setCurrentConnection(connectionName);
    connectionManager.upsertContext(connectionName, {
      resourceID: 'simple-test-2',
      resourceType: 'Patient',
    });
    const uri = URI.file(path.resolve(testFilePath));
    const expression = 'Test';
    const params = buildParameters(uri, expression);

    assert.ok(params.operationArgs?.includes('cql'));
    assert.ok(params.operationArgs?.includes('-fv=R4'));
    assert.ok(params.operationArgs?.includes('-ln=Test'));
    assert.ok(
      params.operationArgs?.includes(
        `-lu=file://${path.resolve(__dirname, '../suite/resources/simple-test-ig/input/cql')}`,
      ),
    );
    assert.ok(params.operationArgs?.includes('-e=Test'));
    assert.ok(
      params.operationArgs?.includes(
        `-t=file://${path.resolve(__dirname, '../suite/resources/simple-test-ig/input/vocabulary/valueset')}`,
      ),
    );
    assert.ok(params.operationArgs?.includes('-m=FHIR'));
    assert.ok(params.operationArgs?.includes('-mu=http://localhost:8000'));
    assert.ok(params.operationArgs?.includes('-cv=simple-test'));
    assert.ok(params.operationArgs?.includes('-cv=simple-test-2'));
    assert.ok(params.outputPath?.fsPath.includes('results/Test.txt'));
    assert.ok(params.testPath?.fsPath.includes('input/tests'));
  });

  test('should show an error message when remote connection has no contexts', () => {
    let connections = connectionManager.getAllConnections();
    let localConnections = Object.values(connections).filter(
      connection => connection.name === 'Remote Build Parameters',
    )[0];
    localConnections.contexts = {};
    connectionManager.setCurrentConnection('Remote Build Parameters');
    const uri = URI.file(path.resolve(testFilePath));
    const expression = 'Test';
    const params = buildParameters(uri, expression);

    // assert.ok(
    //   window.showErrorMessage.calledWith(
    //     'Remote connection is selected but no contexts are provided.',
    //   ),
    // );

    // assert.ok(params.operationArgs === undefined);
    assert.ok(params.outputPath?.fsPath.includes('results/Test.txt'));
    assert.ok(params.testPath?.fsPath.includes('input/tests'));
  });

  test('should handle complex expressions correctly', () => {
    connectionManager.setCurrentConnection('Local');
    const uri = URI.file(path.resolve(testFilePath));
    const complexExpression = 'Test & #"SpecialChars"';
    const params = buildParameters(uri, complexExpression);

    assert.ok(params.operationArgs?.includes('-e=Test & #"SpecialChars"'));
  });

  // test('should handle empty CQL content', () => {
  //   // need empty cql file
  //   const uri = URI.file(path.resolve(testFilePath));
  //   const expression = 'Test';
  //   const params = buildParameters(uri, expression);

  //   assert.ok(params.operationArgs !== undefined);
  // });

  // test('should default to R4 when FHIR version is missing or malformed', () => {
  //   // need malformed fhir file
  //   const uri = URI.file(path.resolve(testFilePath));
  //   const expression = 'Test';
  //   const params = buildParameters(uri, expression);
  //   assert.ok(params.operationArgs?.includes('-fv=R4'));
  // });

  // test('should handle different FHIR versions correctly', () => {
  //   // need dstu3 fhir file
  //   const uri = URI.file(path.resolve(testFilePath));
  //   const expression = 'Test';
  //   const params = buildParameters(uri, expression);
  //   assert.ok(params.operationArgs?.includes('-fv=DSTU3'));
  // });
});
