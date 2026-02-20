import { commands, ExtensionContext, Uri, window, workspace } from 'vscode';
import { getElm } from '../cql-service/cqlService.getElm';
import * as log from '../log-services/logger';
import { Commands } from './commands';

export function register(context: ExtensionContext): void {
  context.subscriptions.push(
    commands.registerCommand(Commands.VIEW_ELM_COMMAND_XML, async (uri: Uri) => {
      viewElm(uri, 'xml');
    }),
    commands.registerCommand(Commands.VIEW_ELM_COMMAND_JSON, async (uri: Uri) => {
      viewElm(uri, 'json');
    }),
  );
}

export async function viewElm(cqlFileUri: Uri, elmType: 'xml' | 'json' = 'xml') {
  try {
    log.debug(`attempting to get ELM from [${cqlFileUri}] as ${elmType}`);
    const elm: string = await getElm(cqlFileUri, elmType);
    workspace
      .openTextDocument({ language: elmType, content: elm })
      .then(t => window.showTextDocument(t));
  } catch (error) {
    window.showErrorMessage(`Error while converting ${cqlFileUri.fsPath} to ELM. err: ${error}`);
  }
}
