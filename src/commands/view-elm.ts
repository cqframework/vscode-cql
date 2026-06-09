import {
  commands,
  ExtensionContext,
  Range,
  TextDocument,
  Uri,
  window,
  workspace,
} from 'vscode';
import { getElm } from '../cql-service/cqlService.getElm';
import * as log from '../log-services/logger';
import { Commands } from './commands';
import { formatJson } from '../utils/astIndex';
import { AstSplitSessionManager } from '../views/astSplitSession';

const openAstDocs = new Map<string, TextDocument>();

export function register(context: ExtensionContext): void {
  context.subscriptions.push(
    commands.registerCommand(Commands.VIEW_ELM_COMMAND_XML, async (uri: Uri) => {
      viewElm(uri, 'xml');
    }),
    commands.registerCommand(Commands.VIEW_ELM_COMMAND_JSON, async (uri: Uri) => {
      viewElm(uri, 'json');
    }),
    commands.registerCommand(Commands.VIEW_ELM_COMMAND_AST, async (uri: Uri) => {
      viewElm(uri, 'ast');
    }),
    commands.registerCommand(Commands.VIEW_ELM_COMMAND_AST_SPLIT, async (uri: Uri) => {
      await AstSplitSessionManager.createOrUpdateSession(uri);
    }),
    workspace.onDidCloseTextDocument(doc => {
      for (const [key, tracked] of openAstDocs) {
        if (tracked === doc) {
          openAstDocs.delete(key);
          break;
        }
      }
    }),
  );
}

export async function viewElm(
  cqlFileUri: Uri,
  elmType: 'xml' | 'json' | 'ast' = 'xml',
  elmFetcher: (uri: Uri, type: 'xml' | 'json' | 'ast') => Promise<string> = getElm,
) {
  try {
    log.debug(`attempting to get ELM from [${cqlFileUri}] as ${elmType}`);
    const elm: string = await elmFetcher(cqlFileUri, elmType);
    const languageId = elmType === 'ast' ? 'ast' : elmType;
    const formatted = elmType === 'json' ? formatJson(elm) : elm;
    if (elmType === 'ast') {
      const uriKey = cqlFileUri.toString();
      const existing = openAstDocs.get(uriKey);
      let reused = false;
      if (existing && !existing.isClosed) {
        try {
          const editor = await window.showTextDocument(existing);
          const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
          reused = await editor.edit(edit =>
            edit.replace(new Range(0, 0, lastLine.lineNumber, lastLine.text.length), formatted),
          ) ?? false;
          if (!reused) {
            openAstDocs.delete(uriKey);
          }
        } catch {
          openAstDocs.delete(uriKey);
        }
      }
      if (!reused) {
        const doc = await workspace.openTextDocument({ language: 'ast', content: formatted });
        openAstDocs.set(uriKey, doc);
        await window.showTextDocument(doc);
      }
      return;
    }
    const doc = await workspace.openTextDocument({ language: languageId, content: formatted });
    await window.showTextDocument(doc);
    if (elmType === 'xml') {
      await commands.executeCommand('editor.action.formatDocument');
    }
  } catch (error) {
    window.showErrorMessage(`Error while converting ${cqlFileUri.fsPath} to ELM. err: ${error}`);
  }
}
