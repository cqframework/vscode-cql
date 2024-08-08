import { Position, Uri, window } from 'vscode';
import { buildParameters } from './buildParameters';
import { executeCQL } from './executeCql';

// Maybe position is range?
export async function normalizeCqlExecution(uri: Uri, position: Position | undefined | null) {
  // Needs a distinction between CQL file and single line
  const isCqlFile = window.activeTextEditor!.document.fileName.endsWith('.cql');
    // should normalize data
  let operationArgs;
  if (isCqlFile && (position === undefined || position === null)) {
    operationArgs = buildParameters(uri, undefined);
  } else if (isCqlFile && position) {
    // if only the uri is passed we may be able to use selection let expression = window.activeTextEditor!.selection
    /* Need to convert into regular expression somehow to match something like this:
        {
        "begin": "\\b(define)\\b",
        "beginCaptures": {
            "1": {
            "name": "keyword.declarations.cql"
            }
        },
        "patterns": [
            {
            "match": "(.+?)",
            "captures": {
                "1": {
                "name": "variable.other.cql"
                }
            }
            }
        ],
        "end": "(:|\\n)"
        }
    */
    let definitionMatch = window.activeTextEditor!.document.lineAt(position).text.match("");
    if (definitionMatch && definitionMatch.length) {
        if (definitionMatch?.length == 1) {
            // TODO: Need to parse out the expression from the define statement
            operationArgs = buildParameters(uri, definitionMatch.at(0));
        } else if (definitionMatch?.length > 1) {
            // Not necessarily a selection just using that word for now
            window.showInformationMessage('Multiple definitions found on a single line, for single line execution please separate define statements by line.');
            return;
        } else {
            // Not necessarily a selection just using that word for now
            window.showInformationMessage('No definition found on selected line, for single line execution please select a definition to execute');
            return;
        }
    }
    // Not necessarily a selection just using that word for now
    window.showInformationMessage('Null return on selected line, for single line execution please select a definition to execute');
    return;
  } else {
    window.showInformationMessage('Only execution of whole CQL files is currently supported.');
    return;
  }
  executeCQL(operationArgs);
}
