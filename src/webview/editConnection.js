// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.

(function () {
  const vscode = acquireVsCodeApi();
  const oldState = /** @type {{ oldConnectionName: string} | undefined} */ vscode.getState();

  document.querySelector('.cancel-button').addEventListener('click', () => {
    Cancel();
  });

  document.querySelector('.test-connection-button').addEventListener('click', () => {
    TestConnection();
  });

  document.querySelector('.edit-connection-button').addEventListener('click', () => {
    editConnection();
  });

  // Handle messages sent from the extension to the webview
  window.addEventListener('message', event => {
    const message = event.data; // The json data that the extension sent
    switch (message.type) {
      // TODO Update implementation to use javadocs
      case 'Connection.InitializeView': {
        InitializeView(message.connection);
        break;
      }
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

  function editConnection() {
    const oldState = vscode.getState() || { oldConnectionName: '' };
    vscode.postMessage({
      // TODO Update implementation to use javadocs
      type: 'Connection.edit',
      name: document.getElementById('connectionName').value,
      url: document.getElementById('connectionURL').value,
      context: document.getElementById('connectionContext').value,
      oldConnectionName: oldState.oldConnectionName,
    });
  }

  function InitializeView(connection) {
    let connectionName = connection['name'];
    let connectionURL = connection['url'];
    let connectionContexts = '';

    for (key in connection['contexts']) {
      connectionContexts += connection['contexts'][key]['resourceID'] + ', ';
    }
    connectionContexts = connectionContexts.trim().replace(/,+$/, '');

    let name = document.getElementById('connectionName');
    name.value = connectionName;
    let url = document.getElementById('connectionURL');
    url.value = connectionURL;
    let contexts = document.getElementById('connectionContext');
    contexts.value = connectionContexts;

    vscode.setState({ oldConnectionName: connectionName });
  }
})();
