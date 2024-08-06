// @ts-nocheck

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
  const vscode = acquireVsCodeApi();

  const oldState = vscode.getState() || { values: [] };

  /** @type {Array<{ value: string }>} */
  let values = oldState.values;

  updateConnectionList(values);

  document.querySelector('.add-connection-button').addEventListener('click', () => {
    addConnection();
  });

  document.querySelector('.delete-connection-button').addEventListener('click', () => {
    deleteConnection();
  });

  // Handle messages sent from the extension to the webview
  window.addEventListener('message', event => {
    const message = event.data; // The json data that the extension sent
    switch (message.type) {
      case 'addConnection': {
        addConnection();
        break;
      }
      case 'clearConnections': {
        values = [];
        updateConnectionList(values);
        break;
      }
      case 'deleteConnection': {
        deleteConnection();
        break;
      }
    }
  });

  /**
   * @param {Array<{ value: string }>} values
   */
  function updateConnectionList(values) {
    const ul = document.querySelector('.connections-list');
    ul.textContent = '';
    // Update the saved state
    //vscode.setState({ values: values });
  }

  function addConnection() {
    vscode.postMessage({ type: 'connections.addConnectionPanel' });
  }

  function deleteConnection() {
    vscode.postMessage({ type: 'connections.deleteConnection' });
  }
})();
