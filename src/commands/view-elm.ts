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

export async function viewElm(
  cqlFileUri: Uri,
  elmType: 'xml' | 'json' = 'xml',
  elmFetcher: (uri: Uri, type: 'xml' | 'json') => Promise<string> = getElm,
) {
  try {
    log.debug(`attempting to get ELM from [${cqlFileUri}] as ${elmType}`);
    const elm: string = await elmFetcher(cqlFileUri, elmType);
    const doc = await workspace.openTextDocument({ language: elmType, content: elm });
    await window.showTextDocument(doc);
  } catch (error) {
    window.showErrorMessage(`Error while converting ${cqlFileUri.fsPath} to ELM. err: ${error}`);
  }
}
