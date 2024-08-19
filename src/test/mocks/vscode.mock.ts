/*
import { Uri as vscodeUri, WorkspaceConfiguration, WorkspaceFolder } from 'vscode';

export const Uri = {
  file: jest.fn((path: string): vscodeUri => {
    return {
      fsPath: path,
    } as vscodeUri;
  }),
  parse: jest.fn((path: string): vscodeUri => {
    return {
      fsPath: path,
    } as vscodeUri;
  }),
};

export const window = {
  createOutputChannel: jest.fn(),
  showQuickPick: jest.fn(),
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  createTerminal: jest.fn(),
  activeTextEditor: {
    document: {
      getText: jest.fn(),
    },
  },
};

export const workspace = {
  getWorkspaceFolder: jest.fn((uri: vscodeUri): WorkspaceFolder | undefined => {
    return {
      uri: Uri.file('./src/vscode-cql/src/test/suite/resources/simple-test-ig'),
      name: 'simple-test-ig',
      index: 0,
    } as WorkspaceFolder;
  }),
  getConfiguration: jest.fn((): WorkspaceConfiguration => {
    return {
      get: jest.fn(),
      has: jest.fn(),
      inspect: jest.fn(),
      update: jest.fn(),
    } as unknown as WorkspaceConfiguration;
  }),
};

export const env = {
  clipboard: {
    readText: jest.fn(),
    writeText: jest.fn(),
  },
};

export const commands = {
  executeCommand: jest.fn(),
};

export default {
  Uri,
  window,
  workspace,
  env,
  commands,
};
*/
