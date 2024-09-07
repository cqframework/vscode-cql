import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Activation Test', () => {
  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('cqframework.cql'));
  });

  test('Extension should be active', async function () {
    this.timeout(0);
    const extension = vscode.extensions.getExtension('cqframework.cql');
    if (!extension?.isActive) {
      await extension?.activate();
    }
    assert.ok(extension && extension.isActive);
  });
});
