import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExtensionContext, OutputChannel, ViewColumn, commands, window, workspace } from 'vscode';
import {
  CancellationToken,
  CloseAction,
  ErrorAction,
  ErrorHandler,
  ExecuteCommandParams,
  ExecuteCommandRequest,
  LanguageClientOptions,
  Message,
  RevealOutputChannelOn,
} from 'vscode-languageclient';
import { Commands } from './commands';
import { CqlLanguageClient } from './cqlLanguageClient';
import { ClientStatus } from './extension.api';
import { initializeLogFile, logger } from './log';
import * as requirements from './requirements';
import { statusBar } from './statusBar';
import glob = require('glob');

const cqlLanguageClient: CqlLanguageClient = new CqlLanguageClient();
const extensionName = 'Language Support for CQL';
let clientLogFile: string;

export class ClientErrorHandler implements ErrorHandler {
  private restarts: number[];

  constructor(private name: string) {
    this.restarts = [];
  }

  public error(_error: Error, _message: Message, count: number): ErrorAction {
    if (count && count <= 3) {
      logger.error(
        `${this.name} server encountered error: ${_message}, ${_error && _error.toString()}`,
      );
      return ErrorAction.Continue;
    }

    logger.error(
      `${this.name} server encountered error and will shut down: ${_message}, ${
        _error && _error.toString()
      }`,
    );
    return ErrorAction.Shutdown;
  }

  public closed(): CloseAction {
    this.restarts.push(Date.now());
    if (this.restarts.length < 5) {
      logger.error(`The ${this.name} server crashed and will restart.`);
      return CloseAction.Restart;
    } else {
      const diff = this.restarts[this.restarts.length - 1] - this.restarts[0];
      if (diff <= 3 * 60 * 1000) {
        const message = `The ${this.name} server crashed 5 times in the last 3 minutes. The server will not be restarted.`;
        logger.error(message);
        const action = 'Show logs';
        window.showErrorMessage(message, action).then(selection => {
          if (selection === action) {
            commands.executeCommand(Commands.OPEN_LOGS);
          }
        });
        return CloseAction.DoNotRestart;
      }

      logger.error(`The ${this.name} server crashed and will restart.`);
      this.restarts.shift();
      return CloseAction.Restart;
    }
  }
}

export class OutputInfoCollector implements OutputChannel {
  private channel: OutputChannel;

  constructor(public name: string) {
    this.channel = window.createOutputChannel(this.name);
  }
  replace(value: string): void {
    this.clear();
    this.append(value);
  }

  append(value: string): void {
    logger.info(value);
    this.channel.append(value);
  }

  appendLine(value: string): void {
    logger.info(value);
    this.channel.appendLine(value);
  }

  clear(): void {
    this.channel.clear();
  }

  show(preserveFocus?: boolean): void;
  show(column?: ViewColumn, preserveFocus?: boolean): void;
  show(_column?: any, preserveFocus?: any) {
    this.channel.show(preserveFocus);
  }

  hide(): void {
    this.channel.hide();
  }

  dispose(): void {
    this.channel.dispose();
  }
}

export function activate(context: ExtensionContext): Promise<void> {
  let storagePath = context.storagePath;
  if (!storagePath) {
    storagePath = getTempWorkspace();
  }
  clientLogFile = path.join(storagePath, 'client.log');
  initializeLogFile(clientLogFile);

  return requirements
    .resolveRequirements(context)
    .catch(error => {
      // show error
      window.showErrorMessage(error.message, error.label).then(selection => {
        if (error.label && error.label === selection && error.command) {
          commands.executeCommand(error.command, error.commandParam);
        }
      });
      // rethrow to disrupt the chain.
      throw error;
    })
    .then(async requirements => {
      return new Promise<void>(async resolve => {
        const workspacePath = path.resolve(storagePath + '/cql_ls_ws');
        // Options to control the language client
        const clientOptions: LanguageClientOptions = {
          // Register the server for CQL
          documentSelector: [
            { scheme: 'file', language: 'cql' },
            { scheme: 'untitled', language: 'cql' },
          ],
          revealOutputChannelOn: RevealOutputChannelOn.Warn, // TODO: The Debug output should be handled a different way.
          errorHandler: new ClientErrorHandler(extensionName),
          initializationFailedHandler: error => {
            logger.error(
              `Failed to initialize ${extensionName} due to ${error && error.toString()}`,
            );
            return true;
          },
          outputChannel: new OutputInfoCollector(extensionName),
          outputChannelName: extensionName,
        };

        context.subscriptions.push(
          commands.registerCommand(Commands.EXECUTE_WORKSPACE_COMMAND, (command, ...rest) => {
            let token: CancellationToken | undefined;
            let commandArgs: any[] = rest;
            if (rest && rest.length && CancellationToken.is(rest[rest.length - 1])) {
              token = rest[rest.length - 1];
              commandArgs = rest.slice(0, rest.length - 1);
            }
            const params: ExecuteCommandParams = {
              command,
              arguments: commandArgs,
            };
            if (token) {
              return cqlLanguageClient
                .getClient()
                .sendRequest(ExecuteCommandRequest.type, params, token);
            } else {
              return cqlLanguageClient.getClient().sendRequest(ExecuteCommandRequest.type, params);
            }
          }),
        );

        // Register commands here to make it available even when the language client fails
        context.subscriptions.push(
          commands.registerCommand(Commands.OPEN_SERVER_LOG, (column: ViewColumn) =>
            openServerLogFile(workspacePath, column),
          ),
        );

        context.subscriptions.push(
          commands.registerCommand(Commands.OPEN_CLIENT_LOG, (column: ViewColumn) =>
            openClientLogFile(clientLogFile, column),
          ),
        );

        context.subscriptions.push(commands.registerCommand(Commands.OPEN_LOGS, () => openLogs()));

        context.subscriptions.push(statusBar);

        await startServer(context, requirements, clientOptions, workspacePath);
        resolve();
      });
    });
}

async function startServer(
  context: ExtensionContext,
  requirements: requirements.RequirementsData,
  clientOptions: LanguageClientOptions,
  workspacePath: string,
) {
  if (cqlLanguageClient.getClientStatus() !== ClientStatus.Uninitialized) {
    return;
  }

  await cqlLanguageClient.initialize(context, requirements, clientOptions, workspacePath);
  cqlLanguageClient.start();
  statusBar.showStatusBar();
}

export function deactivate(): void {
  cqlLanguageClient.stop();
}

function openServerLogFile(
  workspacePath: string,
  column: ViewColumn = ViewColumn.Active,
): Thenable<boolean> {
  const serverLogFile = path.join(workspacePath, '.metadata', '.log');
  return openLogFile(serverLogFile, 'Could not open CQL Language Server log file', column);
}

function openClientLogFile(
  logFile: string,
  column: ViewColumn = ViewColumn.Active,
): Thenable<boolean> {
  return new Promise(resolve => {
    const filename = path.basename(logFile);
    const dirname = path.dirname(logFile);

    // find out the newest one
    glob(filename + '.*', { cwd: dirname }, (err, files) => {
      if (!err && files.length > 0) {
        files.sort();
        logFile = path.join(dirname, files[files.length - 1]);
      }

      openLogFile(logFile, 'Could not open CQL extension log file', column).then(result =>
        resolve(result),
      );
    });
  });
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
    return window.showWarningMessage('No log file available').then(() => false);
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

function getTempWorkspace() {
  return path.resolve(os.tmpdir(), 'vscodesws_' + makeRandomHexString(5));
}

function makeRandomHexString(length: number) {
  const chars = [
    '0',
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '6',
    '7',
    '8',
    '9',
    'a',
    'b',
    'c',
    'd',
    'e',
    'f',
  ];
  let result = '';
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(chars.length * Math.random());
    result += chars[idx];
  }
  return result;
}
