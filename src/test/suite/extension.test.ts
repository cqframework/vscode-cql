import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('CQL Code Suggestions', () => {
  test('Should provide code suggestions after typing "log" in a .cql file', async () => {
    vscode.window.showInformationMessage('Start vscode-cql extension tests.');
    // Open a .cql file
    const doc = await vscode.workspace.openTextDocument({
      language: 'cql', // Specify the language ID for .cql files
      content: '', // Start with an empty document
    });
    await vscode.window.showTextDocument(doc);

    // Simulate typing "log" into the document
    await vscode.commands.executeCommand('type', { text: 'log' });

    // Trigger IntelliSense (e.g., by typing a space after "log")
    const suggestions = await vscode.commands.executeCommand(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(0, 3) // Position cursor after "log"
    );

    // Assert that suggestions have been provided
    assert.ok(suggestions);

    // @ts-ignore
    assert.ok(suggestions.items.length > 0);

    // List all suggestions and their details
    // @ts-ignore
    suggestions.items.forEach((item, index) => {
      console.log(`Suggestion ${index + 1}:`);
      console.log(`Label: ${item.label}`);
      console.log(`Kind: ${item.kind}`);
      console.log(`Insert Text: ${item.insertText}`);
      console.log(`Detail: ${item.detail}`);
      console.log('---');
    });
  });
});
