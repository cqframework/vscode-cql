// @ts-nocheck

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
  const vscode = acquireVsCodeApi();

  const oldState = vscode.getState() || { values: [] };

  /** @type {Array<{ value: string }>} */
  let values = oldState.values;

  document.querySelector('.add-connection-button').addEventListener('click', () => {
    addConnection();
  });

  // Handle messages sent from the extension to the webview
  window.addEventListener('message', event => {
    const message = event.data; // The json data that the extension sent
    switch (message.type) {
      case 'addConnection': {
        addConnection();
        break;
      }
    }
  });

  function addConnection() {
    // const exampleRecord =
    vscode.postMessage({ type: 'addConnection.add' });
  }
})();
