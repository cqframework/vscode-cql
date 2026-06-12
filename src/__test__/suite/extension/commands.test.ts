import { expect } from 'chai';
import * as vscode from 'vscode';

const EXPECTED_COMMANDS = [
  // Active editor commands
  'cql.editor.execute',
  'cql.editor.execute.select-test-cases',
  'cql.editor.debug-test-case',
  'cql.editor.view-elm.xml',
  'cql.editor.view-elm.json',
  'cql.editor.view-elm.ast',
  'cql.editor.view-elm.ast.split',
  // Debug commands
  'cql.debug.toggle-step-granularity',
  'cql.debug.ast.reveal-cql',
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
  // Explorer project node commands
  'cql.explorer.project.execute-all',
  'cql.explorer.project.execute-select',
  // Explorer library node commands
  'cql.explorer.library.execute-all',
  'cql.explorer.library.execute',
  'cql.explorer.library.elm.json',
  'cql.explorer.library.elm.xml',
  'cql.explorer.library.ast',
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
  'cql.explorer.test-case.debug',
  // Explorer resource node commands
  'cql.explorer.resource.fix-references',
  'cql.explorer.resource.rename',
  'cql.explorer.resource.copy',
  'cql.explorer.resource.cut',
  'cql.explorer.resource.delete',
  // Auto-generated view commands (from contributes.views)
  'cql.debug.ast.open',
  'cql.debug.ast.focus',
  'cql.debug.ast.resetViewLocation',
];

suite('CQL command registration', () => {
  suiteSetup(async function() {
    this.timeout(60000);
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
