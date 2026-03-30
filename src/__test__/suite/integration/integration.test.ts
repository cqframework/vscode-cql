import * as assert from 'assert';
import * as vscode from 'vscode';
import { Commands } from '../../../commands/commands';
import {
  cqlLanguageClientInstance,
  sendRequest,
} from '../../../cql-language-server/cqlLanguageClient';
import { ClientStatus } from '../../../extension.api';

/**
 * Integration tests that exercise the full VS Code extension + language server
 * pipeline. These require a real cql-language-server JAR to be present in
 * dist/jars/. They are skipped when the language server is not available.
 *
 * Run via: docker-compose -f integration-tests/docker-compose.yml up --build
 */

const TIMEOUT_MS = 120_000; // language server startup + compilation can be slow

function skipIfNoServer(): boolean {
  const status = cqlLanguageClientInstance.getClientStatus();
  if (status !== ClientStatus.Started) {
    console.log(`Skipping integration test: language server status is ${ClientStatus[status]}`);
    return true;
  }
  return false;
}

async function waitForServer(timeoutMs: number = 60_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cqlLanguageClientInstance.getClientStatus() === ClientStatus.Started) {
      return true;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

suite('integration: language server lifecycle', function () {
  this.timeout(TIMEOUT_MS);

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('cqframework.cql');
    if (!ext?.isActive) {
      await ext?.activate();
    }
  });

  test('language server should start successfully', async () => {
    const ready = await waitForServer();
    if (!ready) {
      // Not a failure - just means JAR isn't available (unit test environment)
      console.log('Language server not available, skipping integration tests');
      return;
    }
    assert.strictEqual(
      cqlLanguageClientInstance.getClientStatus(),
      ClientStatus.Started,
    );
  });
});

suite('integration: diagnostics', function () {
  this.timeout(TIMEOUT_MS);

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('cqframework.cql');
    if (!ext?.isActive) {
      await ext?.activate();
    }
    await waitForServer();
  });

  test('valid CQL file should produce no error diagnostics', async function () {
    if (skipIfNoServer()) return this.skip();

    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(wsFolder, 'workspace folder should be set');

    const cqlUri = vscode.Uri.joinPath(wsFolder.uri, 'input', 'cql', 'IntegrationTest.cql');
    const doc = await vscode.workspace.openTextDocument(cqlUri);
    await vscode.window.showTextDocument(doc);

    // Wait for diagnostics to arrive from the language server
    const diagnostics = await waitForDiagnostics(cqlUri, 15_000);

    const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no errors, got: ${errors.map(e => e.message).join('; ')}`,
    );
  });

  test('CQL file with syntax error should produce diagnostics', async function () {
    if (skipIfNoServer()) return this.skip();

    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(wsFolder, 'workspace folder should be set');

    // Create a temp CQL file with a syntax error
    const badCqlUri = vscode.Uri.joinPath(wsFolder.uri, 'input', 'cql', 'BadSyntax.cql');
    const badContent = Buffer.from(
      'library BadSyntax version \'1.0.0\'\nusing FHIR version \'4.0.1\'\ndefine "Broken": 1 +\n',
    );
    await vscode.workspace.fs.writeFile(badCqlUri, badContent);

    try {
      const doc = await vscode.workspace.openTextDocument(badCqlUri);
      await vscode.window.showTextDocument(doc);

      const diagnostics = await waitForDiagnostics(badCqlUri, 15_000);
      assert.ok(diagnostics.length > 0, 'Expected at least one diagnostic for syntax error');
    } finally {
      // Clean up
      try {
        await vscode.workspace.fs.delete(badCqlUri);
      } catch {
        // ignore cleanup errors
      }
    }
  });
});

suite('integration: ELM translation', function () {
  this.timeout(TIMEOUT_MS);

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('cqframework.cql');
    if (!ext?.isActive) {
      await ext?.activate();
    }
    await waitForServer();
  });

  test('should translate CQL to ELM JSON', async function () {
    if (skipIfNoServer()) return this.skip();

    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(wsFolder, 'workspace folder should be set');

    const cqlUri = vscode.Uri.joinPath(wsFolder.uri, 'input', 'cql', 'IntegrationTest.cql');
    const result = await sendRequest(Commands.VIEW_ELM, [cqlUri.toString(), 'json']);

    assert.ok(result, 'ELM translation should return a result');
    const elm = JSON.parse(result);
    assert.strictEqual(elm.library?.identifier?.id, 'IntegrationTest');
    assert.strictEqual(elm.library?.identifier?.version, '1.0.0');
  });

  test('should translate CQL to ELM XML', async function () {
    if (skipIfNoServer()) return this.skip();

    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(wsFolder, 'workspace folder should be set');

    const cqlUri = vscode.Uri.joinPath(wsFolder.uri, 'input', 'cql', 'IntegrationTest.cql');
    const result = await sendRequest(Commands.VIEW_ELM, [cqlUri.toString(), 'xml']);

    assert.ok(result, 'ELM XML translation should return a result');
    assert.ok(result.includes('<library'), 'Result should contain XML library element');
    assert.ok(result.includes('IntegrationTest'), 'Result should contain library name');
  });

  test('ELM should include annotations when cql-options.json enables them', async function () {
    if (skipIfNoServer()) return this.skip();

    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(wsFolder, 'workspace folder should be set');

    const cqlUri = vscode.Uri.joinPath(wsFolder.uri, 'input', 'cql', 'IntegrationTest.cql');
    const result = await sendRequest(Commands.VIEW_ELM, [cqlUri.toString(), 'json']);

    assert.ok(result, 'ELM translation should return a result');
    const elm = JSON.parse(result);

    // cql-options.json enables EnableAnnotations - verify they're present
    // If the CompilerOptionsManager stream bug is active, annotations will be missing
    assert.ok(
      elm.library?.annotation,
      'ELM should include annotations (verifies cql-options.json is being read)',
    );
  });

  test('ELM should include result types when cql-options.json enables them', async function () {
    if (skipIfNoServer()) return this.skip();

    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(wsFolder, 'workspace folder should be set');

    const cqlUri = vscode.Uri.joinPath(wsFolder.uri, 'input', 'cql', 'IntegrationTest.cql');
    const result = await sendRequest(Commands.VIEW_ELM, [cqlUri.toString(), 'json']);

    assert.ok(result, 'ELM translation should return a result');
    const elm = JSON.parse(result);

    // cql-options.json enables EnableResultTypes - verify they're present
    const statements = elm.library?.statements?.def;
    assert.ok(statements && statements.length > 0, 'Should have statement definitions');

    const hasResultType = statements.some(
      (s: any) => s.resultTypeName || s.resultTypeSpecifier,
    );
    assert.ok(
      hasResultType,
      'Statements should include result types (verifies cql-options.json EnableResultTypes)',
    );
  });
});

suite('integration: multiple file compilation', function () {
  this.timeout(TIMEOUT_MS);

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('cqframework.cql');
    if (!ext?.isActive) {
      await ext?.activate();
    }
    await waitForServer();
  });

  test('should compile both CQL files without errors', async function () {
    if (skipIfNoServer()) return this.skip();

    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(wsFolder, 'workspace folder should be set');

    const file1 = vscode.Uri.joinPath(wsFolder.uri, 'input', 'cql', 'IntegrationTest.cql');
    const file2 = vscode.Uri.joinPath(wsFolder.uri, 'input', 'cql', 'IntegrationTestTwo.cql');

    // Translate both files - both include FHIRHelpers, exercising cache behavior
    const [result1, result2] = await Promise.all([
      sendRequest(Commands.VIEW_ELM, [file1.toString(), 'json']),
      sendRequest(Commands.VIEW_ELM, [file2.toString(), 'json']),
    ]);

    assert.ok(result1, 'First CQL file should translate');
    assert.ok(result2, 'Second CQL file should translate');

    const elm1 = JSON.parse(result1);
    const elm2 = JSON.parse(result2);
    assert.strictEqual(elm1.library?.identifier?.id, 'IntegrationTest');
    assert.strictEqual(elm2.library?.identifier?.id, 'IntegrationTestTwo');
  });
});

// -- Helpers ------------------------------------------------------------------

async function waitForDiagnostics(
  uri: vscode.Uri,
  timeoutMs: number,
): Promise<vscode.Diagnostic[]> {
  return new Promise((resolve) => {
    const start = Date.now();

    // Check if diagnostics are already available
    const existing = vscode.languages.getDiagnostics(uri);
    if (existing.length > 0) {
      resolve(existing);
      return;
    }

    const disposable = vscode.languages.onDidChangeDiagnostics(e => {
      if (e.uris.some(u => u.toString() === uri.toString())) {
        const diags = vscode.languages.getDiagnostics(uri);
        if (diags.length > 0) {
          disposable.dispose();
          resolve(diags);
        }
      }
    });

    // Timeout - resolve with whatever we have
    setTimeout(() => {
      disposable.dispose();
      resolve(vscode.languages.getDiagnostics(uri));
    }, timeoutMs);
  });
}
