const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig({
  label: 'Tests (Empty Folder)',
  files: 'dist/__test__/**/*.test.js',
  workspaceFolder: './src/__test__/resources/test-workspace',
  launchArgs: [
    'tests/empty',
    '--new-window',
    '--disable-extensions',
    '--disable-updates',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
  ],
});
