import { Uri, window } from 'vscode';
import { buildParameters } from './buildParameters';
import { executeCQL } from './executeCql';

/**
 * Normalizes the execution of CQL based on the type of operation ('file' or 'expression').
 *
 * @param {Uri} uri - The URI of the file or resource.
 * @param {'file' | 'expression'} type - The type of operation: 'file' for full file execution, 'expression' for single expression execution.
 * @returns {Promise<void>} A promise that resolves when the execution is complete.
 */
export async function normalizeCqlExecution(uri: Uri, type: 'file' | 'expression'): Promise<void> {
  const editor = window.activeTextEditor;
  if (!editor) {
    window.showInformationMessage('No active text editor found.');
    return;
  }

  const isCqlFile = editor.document.fileName.endsWith('.cql');
  if (!isCqlFile) {
    window.showInformationMessage('File is not a CQL file, must run execute on a CQL file.');
    return;
  }

  let operationArgs;
  if (type === 'file') {
    operationArgs = buildParameters(uri, undefined);
  } else if (type === 'expression') {
    // Process the CQL expression based on the cursor position
    let cursorPosition = editor.selection.active;
    let line = editor.document.lineAt(cursorPosition).text;

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
      if (startIndex !== -1 && endIndex > startIndex) {
        definitionName = line.substring(startIndex, endIndex).replace(/\\"/g, '"');
      }
    }

    if (!definitionName || definitionName === '') {
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
