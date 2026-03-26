import { expect } from 'chai';
import * as vscode from 'vscode';

const EXPECTED_COMMANDS = [
  // Active editor commands
  'cql.editor.execute',
  'cql.editor.execute.select-test-cases',
  'cql.editor.view-elm.xml',
  'cql.editor.view-elm.json',
  // Global commands
  'cql.execute.select-libraries',
  'cql.open.server-log',
  'cql.open.client-log',
  'cql.open.logs',
  // Explorer view-level commands
  'cql.explorer.refresh',
  'cql.explorer.expand-all',
  'cql.explorer.hide-empty',
  'cql.explorer.show-all',
  'cql.explorer.filter-by-name',
  'cql.explorer.clear-name-filter',
  'cql.explorer.sort-asc',
  'cql.explorer.sort-desc',
  'cql.explorer.show-layout-warnings',
  'cql.explorer.hide-layout-warnings',
  // Explorer library node commands
  'cql.explorer.library.execute-all',
  'cql.explorer.library.execute',
  'cql.explorer.library.elm.json',
  'cql.explorer.library.elm.xml',
  // Explorer test case node commands
  'cql.explorer.test-case.execute',
  'cql.explorer.test-case.open-resources',
  'cql.explorer.test-case.clone',
  'cql.explorer.test-case.paste',
  'cql.explorer.test-case.paste-enhanced',
  'cql.explorer.test-case.delete',
  'cql.explorer.test-case.execute-select',
  'cql.explorer.test-case.execute-all',
  'cql.explorer.test-case.filter',
  'cql.explorer.test-case.clear-filter',
  // Explorer resource node commands
  'cql.explorer.resource.fix-references',
  'cql.explorer.resource.rename',
  'cql.explorer.resource.copy',
  'cql.explorer.resource.cut',
  'cql.explorer.resource.delete',
];

suite('CQL command registration', () => {
  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('cqframework.cql');
    if (!ext?.isActive) {
      await ext?.activate();
    }
  });

  test('all CQL commands are registered', async () => {
    const all = await vscode.commands.getCommands(true);
    for (const cmd of EXPECTED_COMMANDS) {
      expect(all, `command "${cmd}" should be registered`).to.include(cmd);
    }
  });

  test('no unexpected cql.* commands are registered', async () => {
    const all = await vscode.commands.getCommands(true);
    const registered = all.filter(c => c.startsWith('cql.'));
    for (const cmd of registered) {
      expect(EXPECTED_COMMANDS, `unexpected command "${cmd}" is registered`).to.include(cmd);
    }
  });
});
