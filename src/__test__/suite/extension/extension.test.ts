import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('extension activation tests', () => {
  test('extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('cqframework.cql'));
  });

  test('extension should be active', async () => {
    const extension = vscode.extensions.getExtension('cqframework.cql');
    if (!extension?.isActive) {
      await extension?.activate();
    }
    assert.ok(extension && extension.isActive);
  });
});
