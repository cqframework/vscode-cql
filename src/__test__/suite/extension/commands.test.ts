import { expect } from 'chai';
import * as vscode from 'vscode';

const EXPECTED_COMMANDS = [
  'cql.open.serverLog',
  'cql.open.clientLog',
  'cql.open.logs',
  'cql.action.viewElm.xml',
  'cql.action.viewElm.json',
  'cql.action.executeCql',
  'cql.action.executeCql.selectLibraries',
  'cql.action.executeCql.selectTestCases',
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
