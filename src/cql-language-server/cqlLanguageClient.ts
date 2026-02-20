import { commands, ExtensionContext, window } from 'vscode';
import {
  CancellationToken,
  ConfigurationParams,
  ConfigurationRequest,
  ExecuteCommandParams,
  ExecuteCommandRequest,
  LanguageClientOptions,
  MessageType,
  State,
  StateChangeEvent,
} from 'vscode-languageclient';
import { LanguageClient } from 'vscode-languageclient/node';
import { Commands } from '../commands/commands';
import { ClientStatus } from '../extension.api';
import { RequirementsData } from '../java-support/requirements';
import * as log from '../log-services/logger';
import {
  ActionableNotification,
  ExecuteClientCommandRequest,
  ProgressReportNotification,
} from '../protocol';
import { statusBar } from '../statusBar';
import { prepareExecutable } from './languageServerStarter';

export class CqlLanguageClient {
  private languageClient: LanguageClient | undefined;
  private status: ClientStatus = ClientStatus.Uninitialized;
  extensionName = 'Language Support for CQL';

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
    // Create the language client and start the client.
    this.languageClient = new LanguageClient(
      'cql',
      this.extensionName,
      serverOptions,
      clientOptions,
    );

    context.subscriptions.push(
      this.languageClient.onDidChangeState((e: StateChangeEvent) => {
        log.info(
          `CqlLanguageClient's internal LanguageClient state changed from ${State[e.oldState]} to ${State[e.newState]}`,
        );
      }),
    );

    this.languageClient.onReady().then(() => {
      //log.info('language client is ready');
      this.status = ClientStatus.Started;
      // this.languageClient.onNotification(StatusNotification.type, (report) => {
      // 	switch (report.type) {
      // 		case 'ServiceReady':
      // 			break;
      // 		case 'Started':
      // 			this.status = ClientStatus.Started;
      // 			statusBar.setReady();
      // 			break;
      // 		case 'Error':
      // 			this.status = ClientStatus.Error;
      // 			statusBar.setError();
      // 			break;
      // 		case 'Starting':
      // 		case 'Message':
      // 			// message goes to progress report instead
      // 			break;
      // 	}
      // 	statusBar.updateTooltip(report.message);
      // });

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

      // TODO: Set this once we have the initialization signal from the LS.
      statusBar.setReady();
    });

    //this.registerCommands(context);
    this.status = ClientStatus.Initialized;
  }

  private registerCommands(context: ExtensionContext): void {
    context.subscriptions.push(
      commands.registerCommand(Commands.OPEN_OUTPUT, () =>
        this.languageClient!.outputChannel.show(),
      ),
    );
  }

  public async start() {
    if (this.languageClient && this.status === ClientStatus.Initialized) {
      //log.debug('attempting to start language client');
      await this.languageClient.start();
      this.status = ClientStatus.Starting;
    }
  }

  public async stop() {
    if (this.languageClient) {
      //log.debug('attempting to stop language client');
      await this.languageClient.stop();
      this.status = ClientStatus.Stopping;
    }
  }

  public getClient(): LanguageClient {
    return this.languageClient!;
  }

  public getClientStatus(): ClientStatus {
    return this.status;
  }
}

function logNotification(message: string) {
  return new Promise(() => {
    log.info(message);
  });
}

export const cqlLanguageClientInstance: CqlLanguageClient = new CqlLanguageClient();

export async function sendRequest(
  command: string,
  args: any[],
  token: CancellationToken | undefined = undefined,
): Promise<any> {
  const params: ExecuteCommandParams = {
    command,
    arguments: args,
  };
  if (token) {
    return await cqlLanguageClientInstance
      .getClient()
      .sendRequest(ExecuteCommandRequest.type, params, token);
  }
  return await cqlLanguageClientInstance
    .getClient()
    .sendRequest(ExecuteCommandRequest.type, params);
}
