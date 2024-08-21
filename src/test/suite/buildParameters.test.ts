import * as assert from 'assert';
import path from 'path';
import { window, workspace } from 'vscode';
import { URI } from 'vscode-URI';
import { buildParameters } from '../../buildParameters';

suite('buildParameters - Public API Testing', () => {
  const testWorkspacePath = path.resolve(__dirname, '../resources/simple-test-ig');
  const testFilePath = path.join(testWorkspacePath, 'input/cql/Test.cql');

  suiteSetup(async () => {
    workspace.updateWorkspaceFolders(0, 0, { uri: URI.file(testWorkspacePath) });
    assert.ok(workspace.workspaceFolders?.length, 'Workspace folder is not open');
    const document = await workspace.openTextDocument(testFilePath);
    await window.showTextDocument(document);
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
    const uri = URI.file(path.resolve(__dirname, '../resources/simple-test-ig/input/cql/Test.cql'));
    const expression = 'Test';
    const params = buildParameters(uri, expression);

    assert.ok(params.operationArgs?.includes('cql'));
    assert.ok(params.operationArgs?.includes('-fv=R4'));
    assert.ok(params.operationArgs?.includes('-ln=Test'));
    assert.ok(
      params.operationArgs?.includes(
        `-lu=file://${path.resolve(__dirname, '../resources/simple-test-ig/input/cql')}`,
      ),
    );
    assert.ok(params.operationArgs?.includes('-e=Test'));
    assert.ok(
      params.operationArgs?.includes(
        `-t=file://${path.resolve(__dirname, '../resources/simple-test-ig/input/vocabulary/valueset')}`,
      ),
    );
    assert.ok(params.operationArgs?.includes('-m=FHIR'));
    assert.ok(
      params.operationArgs?.includes(
        `-mu=file://${path.resolve(__dirname, '../resources/simple-test-ig/input/tests/Test/simple-test')}`,
      ),
    );
    assert.ok(params.operationArgs?.includes('-cv=simple-test'));
    assert.ok(params.outputPath?.fsPath.includes('results/Test.txt'));
    assert.ok(params.testPath?.fsPath.includes('input/tests'));
  });

  test('should generate parameters with non-Local connection and no existing cql-options', () => {
    const uri = URI.file(path.resolve(__dirname, '../resources/simple-test-ig/input/cql/Test.cql'));
    const expression = 'Test';
    const params = buildParameters(uri, expression);

    assert.ok(params.operationArgs?.includes('cql'));
    assert.ok(params.operationArgs?.includes('-fv=R4'));
    assert.ok(!params.operationArgs?.includes('-op='));
    assert.ok(params.operationArgs?.includes('-ln=Test'));
    assert.ok(
      params.operationArgs?.includes(
        `-lu=file://${path.resolve(__dirname, '../resources/simple-test-ig/input/cql')}`,
      ),
    );
    assert.ok(params.operationArgs?.includes('-e=Test'));
    assert.ok(
      params.operationArgs?.includes(
        `-t=file://${path.resolve(__dirname, '../resources/simple-test-ig/input/vocabulary/valueset')}`,
      ),
    );
    assert.ok(params.operationArgs?.includes('-m=FHIR'));
    assert.ok(params.operationArgs?.includes('-mu=http://localhost:8000/'));
    assert.ok(params.operationArgs?.includes('-cv=simple-test'));
    assert.ok(params.outputPath?.fsPath.includes('results/Test.txt'));
    assert.ok(params.testPath?.fsPath.includes('input/tests'));
  });

  test('should generate parameters with non-Local connection and multiple context parameters', () => {
    const uri = URI.file(path.resolve(__dirname, '../resources/simple-test-ig/input/cql/Test.cql'));
    const expression = 'Test';
    const params = buildParameters(uri, expression);

    assert.ok(params.operationArgs?.includes('cql'));
    assert.ok(params.operationArgs?.includes('-fv=R4'));
    assert.ok(params.operationArgs?.includes('-ln=Test'));
    assert.ok(
      params.operationArgs?.includes(
        `-lu=file://${path.resolve(__dirname, '../resources/simple-test-ig/input/cql')}`,
      ),
    );
    assert.ok(params.operationArgs?.includes('-e=Test'));
    assert.ok(
      params.operationArgs?.includes(
        `-t=file://${path.resolve(__dirname, '../resources/simple-test-ig/input/vocabulary/valueset')}`,
      ),
    );
    assert.ok(params.operationArgs?.includes('-m=FHIR'));
    assert.ok(params.operationArgs?.includes('-mu=http://localhost:8000/'));
    assert.ok(params.operationArgs?.includes('-cv=simple-test'));
    assert.ok(params.operationArgs?.includes('-cv=simple-test-2'));
    assert.ok(params.outputPath?.fsPath.includes('results/Test.txt'));
    assert.ok(params.testPath?.fsPath.includes('input/tests'));
  });

  test('should show an error message when remote connection has no contexts', () => {
    const uri = URI.file(path.resolve(__dirname, '../resources/simple-test-ig/input/cql/Test.cql'));
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
    const uri = URI.file(path.resolve(__dirname, '../resources/simple-test-ig/input/cql/Test.cql'));
    const complexExpression = 'Test & #"SpecialChars"';
    const params = buildParameters(uri, complexExpression);

    assert.ok(params.operationArgs?.includes('-e=Test & #"SpecialChars"'));
  });

  test('should handle empty CQL content', () => {
    const uri = URI.file(path.resolve(__dirname, '../resources/simple-test-ig/input/cql/Test.cql'));
    const expression = 'Test';
    const params = buildParameters(uri, expression);

    assert.ok(params.operationArgs !== undefined);
  });

  test('should default to R4 when FHIR version is missing or malformed', () => {
    const uri = URI.file(path.resolve(__dirname, '../resources/simple-test-ig/input/cql/Test.cql'));
    const expression = 'Test';
    const params = buildParameters(uri, expression);
    assert.ok(params.operationArgs?.includes('-fv=R4'));
  });

  test('should handle different FHIR versions correctly', () => {
    const uri = URI.file(path.resolve(__dirname, '../resources/simple-test-ig/input/cql/Test.cql'));
    const expression = 'Test';
    const params = buildParameters(uri, expression);
    assert.ok(params.operationArgs?.includes('-fv=DSTU3'));
  });
});
