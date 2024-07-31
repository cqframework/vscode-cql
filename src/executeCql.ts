import { Position, TextEditor, Uri, commands, window, workspace } from 'vscode';
import { Commands } from './commands';

import * as fs from 'fs';
import { EvaluationParameters } from './buildParameters';

async function insertLineAtEnd(textEditor: TextEditor, text: string) {
  const document = textEditor.document;
  await textEditor.edit(editBuilder => {
    editBuilder.insert(new Position(textEditor.document.lineCount, 0), text + '\n');
  });
}

export async function executeCQL({ operationArgs, testPath, outputPath }: EvaluationParameters) {
  let cqlMessage = '';
  let terminologyMessage = '';
  let testMessage = `Test cases:\n`;
  let foundTest = false;
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
      testMessage += ` - ${operationArgs![i].substring(4)} \n`;
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

  await insertLineAtEnd(textEditor, result!);
  await insertLineAtEnd(
    textEditor,
    `elapsed: ${((endExecution - startExecution) / 1000).toString()} seconds`,
  );
}
