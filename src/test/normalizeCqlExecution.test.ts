import * as assert from 'assert';
import path from 'path';
import * as sinon from 'sinon';
import { window } from 'vscode';
import { URI } from 'vscode-uri';
import * as buildParametersModule from '../buildParameters';
import * as executeCQLModule from '../executeCql';
import { normalizeCqlExecution } from '../normalizeCqlExecution';

suite('normalizeCqlExecution tests', () => {
  let stubShowErrorMessage: sinon.SinonStub;
  let stubShowInformationMessage: sinon.SinonStub;
  let stubBuildParameters: sinon.SinonStub;
  let stubExecuteCQL: sinon.SinonStub;
  let stubActiveTextEditor: sinon.SinonStub;
  const testWorkspacePath = path.resolve(__dirname, '../resources/simple-test-ig');
  const testFilePath = path.join(testWorkspacePath, 'input/cql/Test.cql');
  const testFileUri = URI.file(testFilePath);

  suiteSetup(() => {
    stubShowErrorMessage = sinon.stub(window, 'showErrorMessage');
    stubShowInformationMessage = sinon.stub(window, 'showInformationMessage');
    stubBuildParameters = sinon.stub(buildParametersModule, 'buildParameters');
    stubExecuteCQL = sinon.stub(executeCQLModule, 'executeCQL');

    stubActiveTextEditor = sinon.stub(window, 'activeTextEditor').get(() => ({
      document: {
        fileName: 'test.cql',
        lineAt: sinon.stub().returns({ text: 'define "testDefinition": true' }),
      },
      selection: {
        active: {
          line: 0,
          character: 0,
        },
      },
    }));
  });

  setup(() => {
    stubShowErrorMessage.resetHistory();
    stubShowInformationMessage.resetHistory();
    stubBuildParameters.resetHistory();
    stubExecuteCQL.resetHistory();
  });

  suiteTeardown(() => {
    stubShowErrorMessage.restore();
    stubShowInformationMessage.restore();
    stubBuildParameters.restore();
    stubExecuteCQL.restore();
    stubActiveTextEditor.restore();
  });

  test('It should call buildParameters and executeCQL when type is file', async () => {
    await normalizeCqlExecution(testFileUri, 'file');
    assert.ok(stubBuildParameters.calledOnceWith(testFileUri, undefined));
    assert.ok(stubExecuteCQL.calledOnce);
    assert.ok(stubShowErrorMessage.notCalled);
    assert.ok(stubShowInformationMessage.notCalled);
  });

  test('It should call buildParameters and executeCQL when type is expression and line contains define', async () => {
    stubActiveTextEditor.get(() => ({
      document: {
        fileName: 'test.cql',
        lineAt: sinon.stub().returns({ text: 'define "Test": true' }),
      },
      selection: {
        active: {
          line: 0,
          character: 0,
        },
      },
    }));
    await normalizeCqlExecution(testFileUri, 'expression');
    assert.ok(stubBuildParameters.calledOnceWith(testFileUri, 'Test'));
    assert.ok(stubExecuteCQL.calledOnce);
    assert.ok(stubShowErrorMessage.notCalled);
    assert.ok(stubShowInformationMessage.notCalled);
  });

  test('It should show an error message when no define is found on the selected line', async () => {
    stubActiveTextEditor.get(() => ({
      document: {
        fileName: 'test.cql',
        lineAt: sinon.stub().returns({ text: 'invalid line content' }),
      },
      selection: {
        active: {
          line: 0,
          character: 0,
        },
      },
    }));
    await normalizeCqlExecution(testFileUri, 'expression');
    assert.ok(stubBuildParameters.notCalled);
    assert.ok(stubExecuteCQL.notCalled);
    assert.ok(stubShowErrorMessage.calledOnce);
  });

  test('It should show an information message for unsupported cases', async () => {
    stubActiveTextEditor.get(() => ({
      document: {
        fileName: 'test.txt',
        lineAt: sinon.stub().returns({ text: '' }),
      },
      selection: {
        active: {
          line: 0,
          character: 0,
        },
      },
    }));
    await normalizeCqlExecution(testFileUri, 'expression');
    assert.ok(stubBuildParameters.notCalled);
    assert.ok(stubExecuteCQL.notCalled);
    assert.ok(stubShowInformationMessage.calledOnce);
  });
});
