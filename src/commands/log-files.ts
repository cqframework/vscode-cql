import { glob } from 'glob';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { commands, ExtensionContext, Uri, ViewColumn, window, workspace } from 'vscode';
import { Commands } from '../commands/commands';
import * as log from '../log-services/logger';

export function register(context: ExtensionContext, storageUri: Uri): void {
  const workspacePath = path.resolve(storageUri.fsPath + '/cql_ls_ws');

  context.subscriptions.push(
    commands.registerCommand(Commands.OPEN_SERVER_LOG, (column: ViewColumn) =>
      openServerLogFile(workspacePath, column),
    ),
    commands.registerCommand(Commands.OPEN_CLIENT_LOG, (column: ViewColumn) =>
      openClientLogFile(column),
    ),
    commands.registerCommand(Commands.OPEN_LOGS, () => openLogs()),
  );
}

async function openClientLogFile(column: ViewColumn = ViewColumn.Active): Promise<boolean> {
  const logFileDetails = log.getLogFileDetails();
  if (!logFileDetails) {
    const message = 'Could not open CQL extension log file. Log file path has not been configured.';
    log.warn(message);
    window.showWarningMessage(message);
    return false;
  }

  let logFile = '';
  try {
    const files = await glob(`${logFileDetails.baseName}.*`, {
      cwd: logFileDetails.directory,
      posix: true,
    });

    if (files && files.length > 0) {
      files.sort();
      const newestFile = files[files.length - 1];
      logFile = path.resolve(logFileDetails.directory, newestFile.toString());
    }
  } catch (error) {
    log.error('Glob error while looking for client logs:', error);
  }

  return await openLogFile(logFile, 'Could not open CQL extension log file', column);
}

async function openLogs() {
  await commands.executeCommand(Commands.OPEN_CLIENT_LOG, ViewColumn.One);
  await commands.executeCommand(Commands.OPEN_SERVER_LOG, ViewColumn.Two);
}

function openLogFile(
  logFile: string,
  openingFailureWarning: string,
  column: ViewColumn = ViewColumn.Active,
): Thenable<boolean> {
  if (!fs.existsSync(logFile)) {
    log.warn(openingFailureWarning);
    return window.showWarningMessage(openingFailureWarning).then(() => false);
  }

  return workspace
    .openTextDocument(logFile)
    .then(
      doc => {
        if (!doc) {
          return false;
        }
        return window.showTextDocument(doc, column).then(editor => !!editor);
      },
      () => false,
    )
    .then(didOpen => {
      if (!didOpen) {
        window.showWarningMessage(openingFailureWarning);
      }
      return didOpen;
    });
}

function openServerLogFile(
  workspacePath: string,
  column: ViewColumn = ViewColumn.Active,
): Thenable<boolean> {
  const serverLogFile = path.join(workspacePath, '.metadata', '.log');
  return openLogFile(serverLogFile, 'Could not open CQL Language Server log file', column);
}
