import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

interface PackageJson {
  contributes: {
    commands: Array<{ command: string; title: string }>;
    menus: { 'editor/context': Array<{ command: string; when: string }> };
  };
}

const pkg: PackageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../package.json'), 'utf-8')
);

const CONTEXT_MENU_COMMANDS = [
  'cql.action.executeCql',
  'cql.action.executeCql.selectTestCases',
  'cql.action.viewElm.xml',
  'cql.action.viewElm.json',
];

const EXPECTED_WHEN = 'editorLangId == cql && cql.languageServerReady';

suite('package.json contributions', () => {
  test('all expected commands are declared in contributes.commands', () => {
    const ids = pkg.contributes.commands.map(c => c.command);
    for (const cmd of [
      'cql.open.serverLog',
      'cql.open.clientLog',
      'cql.open.logs',
      'cql.action.viewElm.xml',
      'cql.action.viewElm.json',
      'cql.action.executeCql',
      'cql.action.executeCql.selectLibraries',
      'cql.action.executeCql.selectTestCases',
    ]) {
      expect(ids, `"${cmd}" should be declared in contributes.commands`).to.include(cmd);
    }
  });

  test('context menu commands have correct when clause', () => {
    const menuItems = pkg.contributes.menus['editor/context'];
    for (const cmd of CONTEXT_MENU_COMMANDS) {
      const item = menuItems.find(m => m.command === cmd);
      expect(item, `"${cmd}" should appear in editor/context menu`).to.exist;
      expect(item!.when, `"${cmd}" when clause`).to.equal(EXPECTED_WHEN);
    }
  });

  test('all CQL context menu entries require editorLangId == cql', () => {
    const menuItems = pkg.contributes.menus['editor/context'];
    for (const item of menuItems) {
      if (item.command.startsWith('cql.')) {
        expect(
          item.when,
          `"${item.command}" should require editorLangId == cql to prevent appearing on non-CQL files`
        ).to.include('editorLangId == cql');
      }
    }
  });

  test('all CQL context menu entries require cql.languageServerReady', () => {
    const menuItems = pkg.contributes.menus['editor/context'];
    for (const item of menuItems) {
      if (item.command.startsWith('cql.')) {
        expect(
          item.when,
          `"${item.command}" should require cql.languageServerReady to prevent appearing before server is ready`
        ).to.include('cql.languageServerReady');
      }
    }
  });
});
