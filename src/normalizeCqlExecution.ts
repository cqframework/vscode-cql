import { Uri, window } from 'vscode';
import { buildParameters } from './buildParameters';
import { executeCQL } from './executeCql';

export async function normalizeCqlExecution(uri: Uri, mode: 'expression' | 'file') {
  // Needs a distinction between CQL file and single line
  const isCqlFile = window.activeTextEditor!.document.fileName.endsWith('.cql');

  if (isCqlFile && mode === 'file') {
    // should normalize data
    let operationArgs = buildParameters(uri);
    executeCQL(operationArgs);
  } else {
    window.showInformationMessage('Only execution of whole CQL files is currently supported.');
  }
}
