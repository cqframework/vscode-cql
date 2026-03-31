import * as assert from 'assert';
import * as vscode from 'vscode';

suite('log file commands', () => {
  suiteSetup(async function() {
    this.timeout(60000);
    const ext = vscode.extensions.getExtension('cqframework.cql');
    if (!ext?.isActive) {
      await ext?.activate();
    }
  });

  // The client logger is initialised during activation and writes a log file to
  // storageUri/logs/ immediately, so the command should succeed and return true.
  test('cql.open.client-log opens the log file created during activation', async () => {
    const result = await vscode.commands.executeCommand('cql.open.client-log');
    assert.strictEqual(result, true, 'command should open the client log file created on activation');
  });

  // cql.open.server-log requires the language server to have run (writes
  // storageUri/cql_ls_ws/.metadata/.log). In the test environment the server
  // never starts, so the log file does not exist. window.showWarningMessage
  // blocks until dismissed in a headed session, making this untestable here.
  // Presence of the command in the palette is already verified by commands.test.ts.

  // cql.open.logs delegates to both client and server log commands; the server
  // log half will show a blocking warning notification in a headless run, so we
  // don't test it here either.
});
