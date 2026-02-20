import * as path from 'path';
import { commands, ExtensionContext, Uri, window } from 'vscode';
import {
  CloseAction,
  ErrorAction,
  ErrorHandler,
  LanguageClientOptions,
  Message,
  RevealOutputChannelOn,
} from 'vscode-languageclient';
import { Commands } from './commands/commands';
import { register as registerExecuteCql } from './commands/execute-cql';
import { register as registerLogCommands } from './commands/log-files';
import { register as registerViewElmCommand } from './commands/view-elm';
import { cqlLanguageClientInstance } from './cql-language-server/cqlLanguageClient';
import { ClientStatus } from './extension.api';
import * as requirements from './java-support/requirements';
import * as log from './log-services/logger';
import { statusBar } from './statusBar';

export const EXTENSION_NAME = 'Language Support for CQL';

export class ClientErrorHandler implements ErrorHandler {
  private restarts: number[];

  constructor(private name: string) {
    this.restarts = [];
  }

  public error(_error: Error, _message: Message, count: number): ErrorAction {
    if (count && count <= 3) {
      log.error(`${this.name} server encountered error: ${_message}`, _error);
      return ErrorAction.Continue;
    }

    log.error(`${this.name} server encountered error and will shut down: ${_message}`, _error);
    return ErrorAction.Shutdown;
  }

  public closed(): CloseAction {
    this.restarts.push(Date.now());
    if (this.restarts.length < 5) {
      log.error(`The ${this.name} server crashed and will restart.`);
      return CloseAction.Restart;
    } else {
      const diff = this.restarts[this.restarts.length - 1] - this.restarts[0];
      if (diff <= 3 * 60 * 1000) {
        const message = `The ${this.name} server crashed 5 times in the last 3 minutes. The server will not be restarted.`;
        log.error(message);
        const action = 'Show logs';
        window.showErrorMessage(message, action).then(selection => {
          if (selection === action) {
            commands.executeCommand(Commands.OPEN_LOGS);
          }
        });
        return CloseAction.DoNotRestart;
      }

      log.error(`The ${this.name} server crashed and will restart.`);
      this.restarts.shift();
      return CloseAction.Restart;
    }
  }
}

function getStorageUri(context: ExtensionContext): Uri {
  const workspaceStorageUri = context.storageUri;
  if (workspaceStorageUri) {
    return workspaceStorageUri;
  } else {
    throw new Error(
      'No workspace storage URI available (e.g., when running an untitled workspace)',
    );
  }
}

export function activate(context: ExtensionContext): Promise<void> {
  const storageUri = getStorageUri(context);
  const outputChannel = log.initialize(Uri.joinPath(storageUri, 'logs'), EXTENSION_NAME);

  return requirements
    .resolveRequirements(context)
    .catch(error => {
      //log.error(error.message);
      window.showErrorMessage(error.message, error.label).then(selection => {
        if (error.label && error.label === selection && error.command) {
          commands.executeCommand(error.command, error.commandParam);
        }
      });
      // rethrow to disrupt the chain.
      throw error;
    })
    .then(async requirements => {
      //log.info('extension activated');
      const workspacePath = path.resolve(storageUri.fsPath + '/cql_ls_ws');

      // Options to control the language client
      const clientOptions: LanguageClientOptions = {
        // Register the server for CQL
        documentSelector: [
          { scheme: 'file', language: 'cql' },
          { scheme: 'untitled', language: 'cql' },
        ],
        revealOutputChannelOn: RevealOutputChannelOn.Warn, // TODO: The Debug output should be handled a different way.
        errorHandler: new ClientErrorHandler(EXTENSION_NAME),
        initializationFailedHandler: error => {
          const message = `Failed to initialize ${EXTENSION_NAME} due to ${error && error.toString()}`;
          //log.error(message);
          window.showErrorMessage(message, error.label);
          return true;
        },
        outputChannel: outputChannel,
        outputChannelName: EXTENSION_NAME,
      };

      registerExecuteCql(context);
      registerLogCommands(context, storageUri);
      registerViewElmCommand(context);
      context.subscriptions.push(statusBar);

      await startServer(context, requirements, clientOptions, workspacePath);
    });
}

async function startServer(
  context: ExtensionContext,
  requirements: requirements.RequirementsData,
  clientOptions: LanguageClientOptions,
  workspacePath: string,
): Promise<void> {
  if (cqlLanguageClientInstance.getClientStatus() !== ClientStatus.Uninitialized) {
    return;
  }

  try {
    await cqlLanguageClientInstance.initialize(context, requirements, clientOptions, workspacePath);
    await cqlLanguageClientInstance.start();
    statusBar.showStatusBar();
  } catch (error) {
    log.error(`Failed to start server: ${error}`);
  }
}

export async function deactivate(): Promise<void> {
  log.info('extension deactivated');
  if (!cqlLanguageClientInstance) {
    return undefined;
  }
  return cqlLanguageClientInstance.stop();
}
