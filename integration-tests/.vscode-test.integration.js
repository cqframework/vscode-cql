const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig({
  label: 'Integration Tests',
  files: 'dist/__test__/**/integration.test.js',
  workspaceFolder: './integration-tests/test-workspace',
  launchArgs: [
    '--new-window',
    '--disable-updates',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
  ],
  mocha: {
    timeout: 120000,
  },
});
