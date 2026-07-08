import { commands, ExtensionContext, window } from 'vscode';
import { sendRequest } from '../cql-language-server/cqlLanguageClient';
import { Commands } from './commands';

export function register(context: ExtensionContext): void {
  context.subscriptions.push(
    commands.registerCommand(Commands.REFRESH_IG_DIAGNOSTICS_COMMAND, refreshIgDiagnostics),
  );
}

async function refreshIgDiagnostics(): Promise<void> {
  try {
    await sendRequest(Commands.REFRESH_IG_DIAGNOSTICS, []);
  } catch (error) {
    window.showErrorMessage(`Failed to refresh IG diagnostics: ${error}`);
  }
}
