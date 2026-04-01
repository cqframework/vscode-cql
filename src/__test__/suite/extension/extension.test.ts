import * as assert from 'assert';
import * as vscode from 'vscode';

suite('extension activation tests', () => {
  test('extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('cqframework.cql'));
  });

  test('extension should be active', async function() {
    this.timeout(60000);
    const extension = vscode.extensions.getExtension('cqframework.cql');
    if (!extension?.isActive) {
      await extension?.activate();
    }
    assert.ok(extension && extension.isActive);
  });
});

suite('non-CQL file isolation', () => {
  suiteSetup(async function() {
    this.timeout(60000);
    const ext = vscode.extensions.getExtension('cqframework.cql');
    if (!ext?.isActive) {
      await ext?.activate();
    }
  });

  test('JSON file has languageId "json", not "cql"', async () => {
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(wsFolder, 'workspace folder should be set');
    const jsonUri = vscode.Uri.joinPath(wsFolder.uri, 'input', 'cql', 'cql-options.json');
    const doc = await vscode.workspace.openTextDocument(jsonUri);
    assert.strictEqual(doc.languageId, 'json');
  });

  test('no CQL diagnostics appear on JSON files', async () => {
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(wsFolder, 'workspace folder should be set');
    const jsonUri = vscode.Uri.joinPath(wsFolder.uri, 'input', 'cql', 'cql-options.json');
    await vscode.workspace.openTextDocument(jsonUri);
    // Allow time for any errant diagnostic providers to fire
    await new Promise(r => setTimeout(r, 300));
    const diags = vscode.languages.getDiagnostics(jsonUri);
    const cqlDiags = diags.filter(d => d.source === 'cql');
    assert.strictEqual(cqlDiags.length, 0, 'CQL diagnostics should not appear on JSON files');
  });
});
