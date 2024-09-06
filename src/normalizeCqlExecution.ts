import { Uri, window } from 'vscode';
import { buildParameters } from './buildParameters';
import { executeCQL } from './executeCql';

/**
 * Normalizes the execution of CQL operations based on the type of operation ('file' or 'expression').
 *
 * This function serves as a **Gatekeeper** by validating the workspace environment and **Normalizing** the data
 * required for execution. It takes VS Code-specific details, determines the type of operation to be executed
 * (such as [$cql](https://build.fhir.org/ig/HL7/cql-ig/OperationDefinition-cql-cql.html), [$evaluate-measure](https://hl7.org/fhir/R4/measure-operation-evaluate-measure.html), [$apply](https://hl7.org/fhir/R4/plandefinition-operation-apply.html) for PlanDefinitions, or [$evaluate](https://build.fhir.org/ig/HL7/cql-ig/OperationDefinition-cql-library-evaluate.html) for Libraries), and standardizes
 * this data into strings or URIs. These are then passed on to {@link buildParameters} for the construction of the
 * necessary execution parameters, which are finally handed off to {@link executeCQL} to perform the execution.
 *
 * **Purpose:**
 *
 * - **Gatekeeper**: Validates the current state, ensuring the correct file type (CQL) and operation type (file or expression).
 * - **Normalizer**: Takes workspace-specific details and standardizes them into a format suitable for execution.
 * - **Executor**: Delegates the actual execution to the appropriate functions after normalizing the input data.
 *
 * **Quick Examples:**
 *
 * - **Executing a Full CQL File**:
 *   ```typescript
 *   const uri = URI.parse("file:///Users/developer/vscode-project/input/cql/my-library.cql");
 *   await normalizeCqlExecution(uri, 'file');
 *   // Executes the entire CQL file specified by the URI.
 *   ```
 *
 * - **Executing a Single CQL Expression**:
 *   ```typescript
 *   const uri = URI.parse("file:///Users/developer/vscode-project/input/cql/my-library.cql");
 *   await normalizeCqlExecution(uri, 'expression');
 *   // Executes a single expression based on the current cursor position in the active editor.
 *   ```
 *
 * **Dependencies:**
 *
 * - **Active Text Editor**: The function depends on the active text editor being open with the CQL file.
 * - **CQL File Requirement**: The function currently only supports CQL files. In the future, support for Measure, PlanDefinition, and Questionnaire files may be added.
 * - **Helper Functions**:
 *   - **`{@link buildParameters}(uri, expression)`**: Collects all parameters required for execution.
 *   - **`{@link executeCQL}(operationArgs)`**: Handles the actual execution of the CQL.
 *
 * **Considerations and Limitations:**
 *
 * - **Expression Execution**:
 *   - The function relies on the presence of a valid CQL `define` statement on the current cursor line when executing a single expression.
 *   - If no valid definition is found, an error message is displayed, and execution is halted.
 *
 * - **File Type Limitation**:
 *   - Currently limited to `.cql` files. Future enhancements may include support for [Measure](https://hl7.org/fhir/R4/measure.html), [PlanDefinition](https://hl7.org/fhir/R4/plandefinition.html), and [Questionnaire](https://hl7.org/fhir/R4/questionnaire.html) files.
 *
 * **Future Enhancements:**
 *
 * - **Measurement Period**: Incorporate support for Measure files.
 * - **PlanDefinition and Questionnaire Support**: Expand the function to handle these additional FHIR resources.
 * - **Flexible Contexts**: Enable the function to handle more complex execution contexts beyond CQL, such as PlanDefinitions or other FHIR artifacts.
 *
 * **Error Handling**:
 *
 * - **No Active Editor**: Displays a message if no active text editor is found.
 * - **Invalid File Type**: Displays a message if the current file is not a CQL file.
 * - **Missing Definition**: Displays an error if no valid CQL definition is found on the selected line during expression execution.
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
