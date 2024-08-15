/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+.tsx?$': ['ts-jest', {}],
  },
  moduleNameMapper: {
    '^vscode$': '/Users/joshuareynolds/Documents/src/vscode-cql/src/test/mocks/vscode.mock.ts',
  },
};
