import * as fs from 'fs';
import { Position, TextEditor, Uri, commands, window, workspace } from 'vscode';
import { EvaluationParameters } from './buildParameters';
import { Commands } from './commands';

/**
 * Executes Clinical Quality Language (CQL) operations based on the provided parameters.
 *
 * This function manages the execution of CQL commands by sending operation parameters to the CQL Language Server
 * and capturing the results in a text file. The output includes messages that describe the execution environment
 * (CQL file location, terminology, test cases, and context values), along with the results for each context.
 *
 * **Quick Example:**
 *
 * - **Executing CQL with Parameters**:
 *   ```typescript
 *   const evaluationParams: EvaluationParameters = {
 *     operationArgs: ['-lu=/path/to/cql', '-t=/path/to/terminology', '-mu=/path/to/test'],
 *     outputPath: Uri.parse("file:///path/to/output.txt"),
 *     testPath: Uri.parse("file:///path/to/test")
 *   };
 *
 *   await executeCQL(evaluationParams);
 *   // Outputs the execution result to the specified output file.
 *   ```
 *
 * **Purpose:**
 *
 * - **CQL Execution**: Interacts with the CQL Language Server to execute a CQL library or expression.
 * - **Results Logging**: Manages and formats the execution output into a text file, displaying key context-related data and results.
 * - **Timing**: Logs the elapsed time of the execution for performance analysis.
 *
 * **Execution Breakdown:**
 *
 * 1. **CQL Message**: Captures the CQL file's location using the `-lu=` argument.
 * 2. **Terminology Message**: Captures terminology data location using the `-t=` argument.
 * 3. **Test Data and Contexts**: Logs the test cases and context values found in the provided data.
 *
 * **Example Output in the Resulting Text File:**
 *
 * ```
 * CQL: path/to/cql
 * Terminology: /path/to/terminology
 * Test cases:
 * path/to/test - 123
 * path/to/test - 456
 *
 * Patient 123:
 * ... [execution result] ...
 * Patient 456:
 * ... [execution result] ...
 * elapsed: 3.45 seconds
 * ```
 *
 * **Functionality:**
 *
 * - Executes the CQL using `Commands.EXECUTE_WORKSPACE_COMMAND` and `Commands.EXECUTE_CQL`.
 * - Inserts important messages and results into the output text file.
 * - Interleaves context-related information with the results, enhancing readability.
 *
 * **Future Enhancements:**
 *
 * - Improve result formatting for better readability (e.g., JSON or other structured formats).
 * - Add support for more complex result handling, such as different output file formats (e.g., CSV, XML).
 *
 * **Considerations:**
 *
 * - **Context-Related Execution**: The function supports multiple contexts and interleaves their corresponding results.
 * - **File Output**: Currently, results are only saved in a text file format.
 *
 * @param {EvaluationParameters} evaluationParams - The parameters required for executing CQL. See {@link EvaluationParameters}.
 */
export async function executeCQL({ operationArgs, testPath, outputPath }: EvaluationParameters) {
  let cqlMessage = '';
  let terminologyMessage = '';
  let testMessage = `Test cases:\n`;
  let foundTest = false;
  const contextValues: string[] = [];

  // Loop through the operation arguments to build messages and find test data
  for (let i = 0; i < operationArgs?.length!; i++) {
    if (operationArgs![i].startsWith('-lu=')) {
      cqlMessage = `CQL: ${operationArgs![i].substring(4)}`;
    } else if (operationArgs![i].startsWith('-t=')) {
      let terminologyUri = Uri.parse(operationArgs![i].substring(3));
      terminologyMessage = fs.existsSync(terminologyUri.fsPath)
        ? `Terminology: ${operationArgs![i].substring(3)}`
        : `No terminology found at ${operationArgs![i].substring(3)}. Evaluation may fail if terminology is required.`;
    } else if (operationArgs![i].startsWith('-mu=')) {
      foundTest = true;
      testMessage += `${operationArgs![i].substring(4)}`;
    } else if (operationArgs![i].startsWith('-cv=')) {
      foundTest = true;
      const contextValue = operationArgs![i].substring(4);
      testMessage += ` - ${contextValue} \n`;
      contextValues.push(contextValue);
    }
  }

  // Handle the case when no test data is found
  if (!foundTest) {
    testMessage = `No data found at path ${testPath!}. Evaluation may fail if data is required.`;
  }

  // Open the output file and start inserting information
  const textDocument = await workspace.openTextDocument(outputPath!);
  const textEditor = await window.showTextDocument(textDocument);

  await insertLineAtEnd(textEditor, `${cqlMessage}`);
  await insertLineAtEnd(textEditor, `${terminologyMessage}`);
  await insertLineAtEnd(textEditor, `${testMessage}`);

  // Start timing the execution
  const startExecution = Date.now();
  const result: string | undefined = await commands.executeCommand(
    Commands.EXECUTE_WORKSPACE_COMMAND,
    Commands.EXECUTE_CQL,
    ...operationArgs!,
  );
  const endExecution = Date.now();

  // Interleave results with context
  const expression = operationArgs?.find(arg => arg.startsWith('-e='))?.replace('-e=', '');
  await insertLineAtEnd(textEditor, attemptInterleave(expression, contextValues, result || ''));

  // Log the execution time
  await insertLineAtEnd(
    textEditor,
    `elapsed: ${((endExecution - startExecution) / 1000).toString()} seconds`,
  );
}

/**
 * Attempts to interleave test case names with result expressions for better readability.
 * Returns the result unmodified if unable to interleave.
 *
 * **Example of Interleaving Output**:
 *
 * ```
 * Patient: 123
 * ExpressionResult: ...
 * Patient: 456
 * ExpressionResult: ...
 * ```
 *
 * @param {string | undefined} expression - The CQL expression being evaluated.
 * @param {string[]} contextValues - The context values to interleave with the results.
 * @param {string} result - The result string to be interleaved.
 * @returns {string} The interleaved result string, or the original result if interleaving fails.
 */
const attemptInterleave = (
  expression: string | undefined,
  contextValues: string[],
  result: string,
): string => {
  if (!expression) {
    return result;
  }

  const resultLines = result.split('\n');
  if (resultLines.length < contextValues.length) {
    return result;
  }

  try {
    return contextValues
      .map((val, i) => {
        const resultLine = resultLines[i * 2];
        if (!resultLine?.startsWith(expression)) {
          console.log(`Line ${i} is ${resultLines[i]}`);
          throw new Error();
        }

        return `${val}:\n${resultLine}\n`;
      })
      .join('\n');
  } catch (e) {
    return result;
  }
};

/**
 * Inserts a line of text at the end of the document in the given text editor.
 * @param {TextEditor} textEditor - The text editor where the text should be inserted.
 * @param {string} text - The text to insert.
 */
async function insertLineAtEnd(textEditor: TextEditor, text: string) {
  const document = textEditor.document;
  await textEditor.edit(editBuilder => {
    editBuilder.insert(new Position(textEditor.document.lineCount, 0), text + '\n');
  });
}
