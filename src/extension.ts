/**
 * This is a stub description for now.
 */
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
import { ConnectionManager } from './connectionManager';
import { CqlLanguageClient } from './cqlLanguageClient';
import { ClientStatus } from './extension.api';
import { initializeLogFile, logger } from './log';
import * as requirements from './requirements';
import { statusBar } from './statusBar';
import { ConnectionPanel } from './webview/ConnectionPanel';
import { ConnectionsViewProvider } from './webview/sideBar';
import glob = require('glob');

const cqlLanguageClient: CqlLanguageClient = new CqlLanguageClient();
const extensionName = 'Language Support for CQL';
let clientLogFile: string;

/**
 * Handles errors encountered by the language client and manages client restarts.
 */
export class ClientErrorHandler implements ErrorHandler {
  private restarts: number[];

  /**
   * Creates an instance of ClientErrorHandler.
   * @param {string} name - The name of the server.
   */
  constructor(private name: string) {
    this.restarts = [];
  }

  /**
   * Handles errors encountered by the client.
   * @param {Error} _error - The error object.
   * @param {Message} _message - The error message.
   * @param {number} count - The error count.
   * @returns {ErrorAction} - The action to be taken.
   */
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

  /**
   * Handles client closure events and determines whether to restart the client.
   * @returns {CloseAction} - The action to be taken on closure.
   */
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

/**
 * A wrapper around the VS Code OutputChannel that logs messages to a file.
 */
export class OutputInfoCollector implements OutputChannel {
  private channel: OutputChannel;

  /**
   * Creates an instance of OutputInfoCollector.
   * @param {string} name - The name of the output channel.
   */
  constructor(public name: string) {
    this.channel = window.createOutputChannel(this.name);
  }

  /**
   * Replaces the current content of the output channel with the given value.
   * @param {string} value - The string to replace the content with.
   */
  replace(value: string): void {
    this.clear();
    this.append(value);
  }

  /**
   * Appends the given string to the output channel.
   * @param {string} value - The string to append.
   */
  append(value: string): void {
    logger.info(value);
    this.channel.append(value);
  }

  /**
   * Appends the given string as a new line to the output channel.
   * @param {string} value - The string to append as a new line.
   */
  appendLine(value: string): void {
    logger.info(value);
    this.channel.appendLine(value);
  }

  /**
   * Clears the content of the output channel.
   */
  clear(): void {
    this.channel.clear();
  }

  /**
   * Shows the output channel.
   * @param {boolean} [preserveFocus] - Whether to preserve focus on the current editor.
   */
  show(preserveFocus?: boolean): void;
  show(column?: ViewColumn, preserveFocus?: boolean): void;
  show(_column?: any, preserveFocus?: any) {
    this.channel.show(preserveFocus);
  }

  /**
   * Hides the output channel.
   */
  hide(): void {
    this.channel.hide();
  }

  /**
   * Disposes of the output channel.
   */
  dispose(): void {
    this.channel.dispose();
  }
}

/**
 * Activates the extension and initializes the language client and related services.
 * @param {ExtensionContext} context - The VS Code extension context.
 * @returns {Promise<void>} A promise that resolves when the activation is complete.
 */
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
      // Show error message if requirements resolution fails
      window.showErrorMessage(error.message, error.label).then(selection => {
        if (error.label && error.label === selection && error.command) {
          commands.executeCommand(error.command, error.commandParam);
        }
      });
      throw error; // rethrow to disrupt the chain.
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

        // Initialize the Connection Manager
        ConnectionManager._initialize(context);

        // Initialize the views and panels
        const connectionsProvider = new ConnectionsViewProvider(context.extensionUri);
        ConnectionsViewProvider.setContext(context);
        ConnectionPanel.setContext(context);

        // Register commands here to make them available even when the language client fails
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

        context.subscriptions.push(
          commands.registerCommand(Commands.CONNECTIONS_IMPORT, () =>
            connectionsProvider.ImportConnections(),
          ),
        );

        context.subscriptions.push(
          commands.registerCommand(Commands.CONNECTIONS_EXPORT, () =>
            connectionsProvider.ExportConnections(),
          ),
        );

        context.subscriptions.push(
          commands.registerCommand(Commands.CONNECTIONS_CLEAR, () =>
            connectionsProvider.ClearConnectionsPanel(),
          ),
        );

        context.subscriptions.push(
          commands.registerCommand(Commands.CONNECTION_ADD_PANEL, () =>
            connectionsProvider.AddConnectionPanel(),
          ),
        );

        context.subscriptions.push(
          commands.registerCommand(Commands.CONNECTION_EDIT_PANEL, () =>
            connectionsProvider.EditConnectionPanel(),
          ),
        );

        context.subscriptions.push(
          commands.registerCommand(Commands.CONNECTION_DELETE_PANEL, () =>
            connectionsProvider.DeleteConnectionPanel(),
          ),
        );

        context.subscriptions.push();

        context.subscriptions.push(commands.registerCommand(Commands.OPEN_LOGS, () => openLogs()));

        context.subscriptions.push(statusBar);

        context.subscriptions.push(
          window.registerWebviewViewProvider(ConnectionsViewProvider.viewType, connectionsProvider),
        );

        await startServer(context, requirements, clientOptions, workspacePath);
        resolve();
      });
    });
}

/**
 * Starts the CQL language server.
 * @param {ExtensionContext} context - The VS Code extension context.
 * @param {requirements.RequirementsData} requirements - The requirements data for starting the server.
 * @param {LanguageClientOptions} clientOptions - The language client options.
 * @param {string} workspacePath - The path to the workspace directory.
 */
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

/**
 * Deactivates the extension and stops the language client.
 */
export function deactivate(): void {
  cqlLanguageClient.stop();
}

/**
 * Opens the CQL Language Server log file in the VS Code editor.
 * @param {string} workspacePath - The path to the workspace directory.
 * @param {ViewColumn} [column=ViewColumn.Active] - The view column in which to open the log file.
 * @returns {Thenable<boolean>} A promise that resolves to true if the log file was opened successfully.
 */
function openServerLogFile(
  workspacePath: string,
  column: ViewColumn = ViewColumn.Active,
): Thenable<boolean> {
  const serverLogFile = path.join(workspacePath, '.metadata', '.log');
  return openLogFile(serverLogFile, 'Could not open CQL Language Server log file', column);
}

/**
 * Opens the client log file in the VS Code editor.
 * @param {string} logFile - The path to the client log file.
 * @param {ViewColumn} [column=ViewColumn.Active] - The view column in which to open the log file.
 * @returns {Thenable<boolean>} A promise that resolves to true if the log file was opened successfully.
 */
function openClientLogFile(
  logFile: string,
  column: ViewColumn = ViewColumn.Active,
): Thenable<boolean> {
  return new Promise(resolve => {
    const filename = path.basename(logFile);
    const dirname = path.dirname(logFile);

    // Find out the newest log file
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

/**
 * Opens both the client and server log files in the VS Code editor.
 */
async function openLogs() {
  await commands.executeCommand(Commands.OPEN_CLIENT_LOG, ViewColumn.One);
  await commands.executeCommand(Commands.OPEN_SERVER_LOG, ViewColumn.Two);
}

/**
 * Opens a log file in the VS Code editor.
 * @param {string} logFile - The path to the log file.
 * @param {string} openingFailureWarning - The warning message to show if the log file cannot be opened.
 * @param {ViewColumn} [column=ViewColumn.Active] - The view column in which to open the log file.
 * @returns {Thenable<boolean>} A promise that resolves to true if the log file was opened successfully.
 */
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

/**
 * Generates a temporary workspace path.
 * @returns {string} The path to the temporary workspace.
 */
function getTempWorkspace(): string {
  return path.resolve(os.tmpdir(), 'vscodesws_' + makeRandomHexString(5));
}

/**
 * Generates a random hexadecimal string of the given length.
 * @param {number} length - The length of the hexadecimal string to generate.
 * @returns {string} A random hexadecimal string.
 */
function makeRandomHexString(length: number): string {
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
