import { commands, ExtensionContext, Uri, window, workspace } from 'vscode';
import {
  ConfigurationParams,
  ConfigurationRequest,
  LanguageClientOptions,
  MessageType,
} from 'vscode-languageclient';
import { LanguageClient } from 'vscode-languageclient/node';
import { Commands } from './commands';
import { ClientStatus } from './extension.api';
import { prepareExecutable } from './languageServerStarter';
import { logger } from './log';
import { normalizeCqlExecution } from './normalizeCqlExecution';
import {
  ActionableNotification,
  ExecuteClientCommandRequest,
  ProgressReportNotification,
} from './protocol';
import { RequirementsData } from './requirements';
import { statusBar } from './statusBar';

const extensionName = 'Language Support for CQL';

/**
 * Represents a CQL language client, responsible for managing the interaction between the extension and the CQL language server.
 */
export class CqlLanguageClient {
  private languageClient: LanguageClient | undefined;
  private status: ClientStatus = ClientStatus.Uninitialized;

  /**
   * Initializes the CQL language client.
   * @param {ExtensionContext} context - The VS Code extension context.
   * @param {RequirementsData} requirements - The requirements for starting the language server.
   * @param {LanguageClientOptions} clientOptions - The options for configuring the language client.
   * @param {string} workspacePath - The path of the workspace in which the client operates.
   * @returns {Promise<void>} A promise that resolves when initialization is complete.
   */
  public async initialize(
    context: ExtensionContext,
    requirements: RequirementsData,
    clientOptions: LanguageClientOptions,
    workspacePath: string,
  ): Promise<void> {
    if (this.status !== ClientStatus.Uninitialized) {
      return;
    }

    const serverOptions = prepareExecutable(requirements, context, workspacePath);
    this.languageClient = new LanguageClient('cql', extensionName, serverOptions, clientOptions);

    this.languageClient.onReady().then(() => {
      this.status = ClientStatus.Started;

      this.languageClient!.onNotification(ProgressReportNotification.type, _progress => {
        // TODO: Support for long-running tasks
      });

      this.languageClient!.onNotification(ActionableNotification.type, notification => {
        const titles = notification.commands!.map(a => a.title);
        let show = null;
        switch (notification.severity) {
          case MessageType.Log:
            logNotification(notification.message);
            break;
          case MessageType.Info:
            show = window.showInformationMessage;
            break;
          case MessageType.Warning:
            show = window.showWarningMessage;
            break;
          case MessageType.Error:
            show = window.showErrorMessage;
            break;
        }
        if (!show) {
          return;
        }

        show(notification.message, ...titles).then((selection: string | undefined) => {
          for (const action of notification.commands!) {
            if (action.title === selection) {
              const args: any[] = action.arguments ? action.arguments : [];
              commands.executeCommand(action.command, ...args);
              break;
            }
          }

          return null;
        });
      });

      this.languageClient!.onRequest(ExecuteClientCommandRequest.type, params => {
        return commands.executeCommand(params.command, ...params.arguments!);
      });

      this.languageClient!.onRequest(ConfigurationRequest.type, (_params: ConfigurationParams) => {
        // TODO: This is a request for workspace configuration. In the context of the IG
        // this ought to be the cql-options file at least.

        return null;
      });

      statusBar.setReady();
    });

    this.registerCommands(context);
    this.status = ClientStatus.Initialized;
  }

  /**
   * Registers commands for the extension.
   * @param {ExtensionContext} context - The VS Code extension context.
   */
  private registerCommands(context: ExtensionContext): void {
    context.subscriptions.push(
      commands.registerCommand(Commands.OPEN_OUTPUT, () =>
        this.languageClient!.outputChannel.show(),
      ),
    );

    context.subscriptions.push(
      commands.registerCommand(Commands.VIEW_ELM_COMMAND, async (uri: Uri) => {
        const xml: string = await (<any>(
          commands.executeCommand(
            Commands.EXECUTE_WORKSPACE_COMMAND,
            Commands.VIEW_ELM,
            uri.toString(),
          )
        ));
        workspace
          .openTextDocument({ language: 'xml', content: xml })
          .then(t => window.showTextDocument(t));
      }),
    );

    context.subscriptions.push(
      commands.registerCommand(Commands.EXECUTE_CQL_FILE_COMMAND, async (uri: Uri) => {
        await normalizeCqlExecution(uri, 'file');
      }),
    );

    context.subscriptions.push(
      commands.registerCommand(Commands.EXECUTE_CQL_EXPRESSION_COMMAND, async (uri: Uri) => {
        await normalizeCqlExecution(uri, 'expression');
      }),
    );
  }

  /**
   * Starts the CQL language client.
   */
  public start(): void {
    if (this.languageClient && this.status === ClientStatus.Initialized) {
      this.languageClient.start();
      this.status = ClientStatus.Starting;
    }
  }

  /**
   * Stops the CQL language client.
   */
  public stop(): void {
    if (this.languageClient) {
      this.languageClient.stop();
      this.status = ClientStatus.Stopping;
    }
  }

  /**
   * Gets the language client instance.
   * @returns {LanguageClient} The language client instance.
   */
  public getClient(): LanguageClient {
    return this.languageClient!;
  }

  /**
   * Gets the current status of the language client.
   * @returns {ClientStatus} The current status of the language client.
   */
  public getClientStatus(): ClientStatus {
    return this.status;
  }
}

/**
 * Logs a notification message.
 * @param {string} message - The message to log.
 * @returns {Promise<void>} A promise that resolves when the log operation is complete.
 */
function logNotification(message: string): Promise<void> {
  return new Promise(() => {
    logger.verbose(message);
  });
}
