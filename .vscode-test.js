const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig({
  label: 'Tests (Empty Folder)',
  files: './dist/test/suite/runTests.js',
  launchArgs: ['tests/empty', '--new-window', '--disable-extensions'],
});
