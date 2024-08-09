import { Uri, window } from 'vscode';
import { buildParameters } from './buildParameters';
import { executeCQL } from './executeCql';

export async function normalizeCqlExecution(uri: Uri, type: string) {
  const isCqlFile = window.activeTextEditor!.document.fileName.endsWith('.cql');
  let operationArgs;
  if (isCqlFile && type === "file") {
    operationArgs = buildParameters(uri, undefined);
  } else if (isCqlFile && type === "expression") {
    let cursorPosition = window.activeTextEditor!.selection.active;
    // For now using parsing the definition here, but ideally should be communicating with the Language Server
    // Could try something like https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_selectionRange after grabbing the start and end positions of a selection
    // https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_signatureHelp *Definition Signature???*
    const definitionStatementRegex = new RegExp('(?<=\\bdefine\\s*"\\s*)([^"]+)(?="\\s*:)');
    let line = window.activeTextEditor!.document.lineAt(cursorPosition).text;
    // duplicating for some reason, but for now only a single definition anyways
    let definitionMatch = line.match(definitionStatementRegex);
    if (definitionMatch && definitionMatch.length) {
        if (definitionMatch?.length == 1) {
            operationArgs = buildParameters(uri, definitionMatch.at(0));
        } else if (definitionMatch?.length > 1) {
            window.showInformationMessage('Multiple definitions found on a single line, for single line execution please separate define statements by line.');
            operationArgs = buildParameters(uri, definitionMatch.at(0));
        } else {
            window.showInformationMessage('No definition found on selected line, for single line execution please select a definition to execute');
            return;
        }
    } else {
        window.showErrorMessage('Null return on selected line, for single line execution please select a definition to execute');
        return;
    }
  } else {
    window.showInformationMessage('Only execution of whole CQL files is currently supported.');
    return;
  }
  executeCQL(operationArgs);
}
