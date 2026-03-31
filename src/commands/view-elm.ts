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
    const formatted = elmType === 'json' ? formatJson(elm) : elm;
    const doc = await workspace.openTextDocument({ language: elmType, content: formatted });
    await window.showTextDocument(doc);
    if (elmType === 'xml') {
      await commands.executeCommand('editor.action.formatDocument');
    }
  } catch (error) {
    window.showErrorMessage(`Error while converting ${cqlFileUri.fsPath} to ELM. err: ${error}`);
  }
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
