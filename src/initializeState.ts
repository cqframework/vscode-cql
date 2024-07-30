import { Uri, window } from "vscode";
import { buildParameters } from "./buildParameters";
import { executeCQL } from "./executeCql";

export async function initializeState(uri: Uri) {

    // Needs a distinction between CQL file and single line
    const isCqlFile = window.activeTextEditor!.document.fileName.includes(".cql");

    if (isCqlFile) {
        // should normalize data
        let operationArgs = buildParameters(uri)
        executeCQL(operationArgs)
    } else {
        window.showInformationMessage('As of now we only support Cql File Execution and execution needs to run a .cql file.');
    }
    
}

