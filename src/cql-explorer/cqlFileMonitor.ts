import * as vscode from 'vscode';

export class CqlFileMonitor {
  private readonly libraryWatcher: vscode.FileSystemWatcher;
  private readonly testFolderWatcher: vscode.FileSystemWatcher;
  private readonly resultFolderWatcher: vscode.FileSystemWatcher;

  constructor(libraryPath: string, testPath: string, resultPath: string) {
    this.libraryWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(libraryPath, '*.cql'),
    );
    this.libraryWatcher.onDidCreate(async uri => {});
    this.libraryWatcher.onDidDelete(async uri => {});
    this.libraryWatcher.onDidChange(async uri => {});

    this.testFolderWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(testPath, '*'),
    );
    this.testFolderWatcher.onDidCreate(async uri => {});
    this.testFolderWatcher.onDidDelete(async uri => {});
    this.testFolderWatcher.onDidChange(async uri => {});

    this.resultFolderWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(resultPath, '*'),
    );
    this.resultFolderWatcher.onDidCreate(async uri => {});
    this.resultFolderWatcher.onDidDelete(async uri => {});
    this.resultFolderWatcher.onDidChange(async uri => {});
  }
}
