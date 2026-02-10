const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig({
  label: 'Tests (Empty Folder)',
  files: 'dist/__test__/**/*.test.js',
  launchArgs: ['tests/empty', '--new-window', '--disable-extensions'],
});
