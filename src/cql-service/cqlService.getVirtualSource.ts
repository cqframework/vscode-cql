import { Uri } from 'vscode';
import { Commands } from '../commands/commands';
import { sendRequest } from '../cql-language-server/cqlLanguageClient';

export async function getVirtualSource(uri: Uri): Promise<string | null> {
  const content = await sendRequest(Commands.VIRTUAL_SOURCE, [uri.toString()]);
  return content ?? null;
}
