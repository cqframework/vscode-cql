import { Uri, window } from 'vscode';
import { buildParameters } from './buildParameters';
import { executeCQL } from './executeCql';

export async function normalizeCqlExecution(uri: Uri, type: 'file' | 'expression') {
  const isCqlFile = window.activeTextEditor!.document.fileName.endsWith('.cql');
  let operationArgs;
  if (isCqlFile && type === 'file') {
    operationArgs = buildParameters(uri, undefined);
  } else if (isCqlFile && type === 'expression') {
    let cursorPosition = window.activeTextEditor!.selection.active;
    let line = window.activeTextEditor!.document.lineAt(cursorPosition).text;

    let definitionName = '';
    const defineIndex = line.indexOf('define');
    if (defineIndex !== -1) {
      const startIndex = line.indexOf('"', defineIndex) + 1;
      let endIndex = startIndex;
      while (endIndex < line.length) {
        if (line[endIndex] === '"' && line[endIndex - 1] !== '\\') {
          break;
        }
        endIndex++;
      }
      if (startIndex !== -1 && endIndex !== -1) {
        definitionName = line.substring(startIndex, endIndex);
        definitionName = definitionName.replace(/\\"/g, '"');
      }
    }
    if (!definitionName) {
      window.showErrorMessage(
        'No definition found on the selected line. For single line execution, please select a line containing a definition.',
      );
      return;
    }
    operationArgs = buildParameters(uri, definitionName);
  } else {
    window.showInformationMessage('Internal error.');
    return;
  }
  executeCQL(operationArgs);
}
