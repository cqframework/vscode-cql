import { ExtensionContext, window, workspace, commands, Uri } from "vscode";
import { Commands } from "./commands";
import { prepareExecutable } from "./languageServerStarter";
import {
	LanguageClientOptions,
	MessageType,
	ConfigurationRequest,
	ConfigurationParams,
} from "vscode-languageclient";
import {
	LanguageClient,
	ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";
import {
	ProgressReportNotification,
	ActionableNotification,
	ExecuteClientCommandRequest,
} from "./protocol";
import { RequirementsData } from "./requirements";
import { statusBar } from "./statusBar";
import { logger } from "./log";
import { ClientStatus } from "./extension.api";
import { executeCQLFile } from "./executeCql";

const extensionName = "Language Support for CQL";

export class CqlLanguageClient {
	private languageClient: LanguageClient | undefined;
	private status: ClientStatus = ClientStatus.Uninitialized;

	public async initialize(
		context: ExtensionContext,
		requirements: RequirementsData,
		clientOptions: LanguageClientOptions,
		workspacePath: string
	): Promise<void> {
		if (this.status !== ClientStatus.Uninitialized) {
			return;
		}

		const serverOptions = prepareExecutable(
			requirements,
			context,
			workspacePath
		);
		// Create the language client and start the client.
		this.languageClient = new LanguageClient(
			"cql",
			extensionName,
			serverOptions,
			clientOptions
		);

		this.languageClient.onReady().then(() => {
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

			this.languageClient!.onNotification(
				ProgressReportNotification.type,
				(_progress) => {
					// TODO: Support for long-running tasks
				}
			);

			this.languageClient!.onNotification(
				ActionableNotification.type,
				(notification) => {
					const titles = notification.commands!.map((a) => a.title);
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

					show(notification.message, ...titles).then(
						(selection: string | undefined) => {
							for (const action of notification.commands!) {
								if (action.title === selection) {
									const args: any[] = action.arguments
										? action.arguments
										: [];
									commands.executeCommand(
										action.command,
										...args
									);
									break;
								}
							}

							return null;
						}
					);
				}
			);

			this.languageClient!.onRequest(
				ExecuteClientCommandRequest.type,
				(params) => {
					return commands.executeCommand(
						params.command,
						...params.arguments!
					);
				}
			);

			this.languageClient!.onRequest(
				ConfigurationRequest.type,
				(_params: ConfigurationParams) => {
					// TODO: This is a request for workspace configuration. In the context of the IG
					// this ought to be the cql-options file at least.

					return null;
				}
			);

			// TODO: Set this once we have the initialization signal from the LS.
			statusBar.setReady();
		});

		this.registerCommands(context);
		this.status = ClientStatus.Initialized;
	}

	private registerCommands(context: ExtensionContext): void {
		context.subscriptions.push(
			commands.registerCommand(Commands.OPEN_OUTPUT, () =>
				this.languageClient!.outputChannel.show()
			)
		);

		context.subscriptions.push(
			commands.registerCommand(
				Commands.VIEW_ELM_COMMAND,
				async (uri: Uri) => {
					const xml: string = await (<any>(
						commands.executeCommand(
							Commands.EXECUTE_WORKSPACE_COMMAND,
							Commands.VIEW_ELM,
							uri.toString()
						)
					));
					workspace
						.openTextDocument({ language: "xml", content: xml })
						.then((t) => window.showTextDocument(t));
				}
			)
		);

		context.subscriptions.push(
			commands.registerCommand(
				Commands.EXECUTE_CQL_COMMAND,
				async (uri: Uri) => {
					await executeCQLFile(uri);
				}
			)
		);
	}

	public start(): void {
		if (this.languageClient && this.status === ClientStatus.Initialized) {
			this.languageClient.start();
			this.status = ClientStatus.Starting;
		}
	}

	public stop() {
		if (this.languageClient) {
			this.languageClient.stop();
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
		logger.verbose(message);
	});
}
