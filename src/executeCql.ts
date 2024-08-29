import * as fs from 'fs';
import { Position, TextEditor, Uri, commands, window, workspace } from 'vscode';
import { EvaluationParameters } from './buildParameters';
import { Commands } from './commands';

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

/**
 * Executes CQL (Clinical Quality Language) based on the provided evaluation parameters.
 * Outputs results to a text document specified by the evaluation parameters.
 * @param {EvaluationParameters} evaluationParams - The parameters required for executing CQL.
 */
export async function executeCQL({ operationArgs, testPath, outputPath }: EvaluationParameters) {
  let cqlMessage = '';
  let terminologyMessage = '';
  let testMessage = `Test cases:\n`;
  let foundTest = false;
  const contextValues: string[] = [];

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

  if (!foundTest) {
    testMessage = `No data found at path ${testPath!}. Evaluation may fail if data is required.`;
  }

  const textDocument = await workspace.openTextDocument(outputPath!);
  const textEditor = await window.showTextDocument(textDocument);

  await insertLineAtEnd(textEditor, `${cqlMessage}`);
  await insertLineAtEnd(textEditor, `${terminologyMessage}`);
  await insertLineAtEnd(textEditor, `${testMessage}`);

  const startExecution = Date.now();
  const result: string | undefined = await commands.executeCommand(
    Commands.EXECUTE_WORKSPACE_COMMAND,
    Commands.EXECUTE_CQL,
    ...operationArgs!,
  );
  const endExecution = Date.now();

  const expression = operationArgs?.find(arg => arg.startsWith('-e='))?.replace('-e=', '');
  await insertLineAtEnd(textEditor, attemptInterleave(expression, contextValues, result || ''));

  await insertLineAtEnd(
    textEditor,
    `elapsed: ${((endExecution - startExecution) / 1000).toString()} seconds`,
  );
}

/**
 * Attempts to interleave test case names with result expressions for better readability.
 * Returns the result unmodified if unable to interleave.
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
