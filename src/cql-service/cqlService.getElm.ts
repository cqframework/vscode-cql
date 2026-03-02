import { Uri } from 'vscode';
import { Commands } from '../commands/commands';
import { sendRequest } from '../cql-language-server/cqlLanguageClient';

export async function getElm(cqlFileUri: Uri, elmType: 'xml' | 'json'): Promise<string> {
  return await sendRequest(Commands.VIEW_ELM, [cqlFileUri.toString(), elmType]);
}
