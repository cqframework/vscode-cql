// TODO Update implementation to use javadocs

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
  const vscode = acquireVsCodeApi();

  document.querySelector('.cancel-button').addEventListener('click', () => {
    Cancel();
  });

  document.querySelector('.test-connection-button').addEventListener('click', () => {
    TestConnection();
  });

  document.querySelector('.add-connection-button').addEventListener('click', () => {
    addConnection();
  });

  // Handle messages sent from the extension to the webview
  window.addEventListener('message', event => {
    const message = event.data; // The json data that the extension sent
    switch (message.type) {
    }
  });

  function Cancel() {
    vscode.postMessage({
      // TODO Update implementation to use javadocs
      type: 'Connection.cancel',
    });
  }

  function TestConnection() {
    // TODO Update implementation to use javadocs
    vscode.postMessage({ type: 'Connection.testConnection' });
  }

  function addConnection() {
    vscode.postMessage({
      // TODO Update implementation to use javadocs
      type: 'Connection.add',
      name: document.getElementById('connectionName').value,
      url: document.getElementById('connectionURL').value,
      context: document.getElementById('connectionContext').value,
    });
  }
})();
