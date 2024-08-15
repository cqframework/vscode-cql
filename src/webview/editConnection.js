// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.

(function () {
  const vscode = acquireVsCodeApi();
  const oldState = /** @type {{ oldConnectionName: string} | undefined} */ vscode.getState();

  const $cancelButton = document.querySelector('.cancel-button');
  const $testConnectionButton = document.querySelector('.test-connection-button');
  const $editConnectionButton = document.querySelector('.edit-connection-button');
  const $connectionName = /** @type {HTMLInputElement} */ (
    document.getElementById('connectionName')
  );
  const $connectionURL = /** @type {HTMLInputElement} */ (document.getElementById('connectionURL'));
  const $connectionContext = /** @type {HTMLInputElement} */ (
    document.getElementById('connectionContext')
  );

  if (
    !(
      $cancelButton &&
      $testConnectionButton &&
      $editConnectionButton &&
      $connectionName &&
      $connectionURL &&
      $connectionContext
    )
  ) {
    throw new Error('Missing required element.');
  }

  $cancelButton.addEventListener('click', () => {
    Cancel();
  });

  $testConnectionButton.addEventListener('click', () => {
    TestConnection();
  });

  $editConnectionButton.addEventListener('click', () => {
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
      type: 'Connection.cancel',
    });
  }

  function TestConnection() {
    vscode.postMessage({ type: 'Connection.testConnection' });
  }

  function editConnection() {
    const oldState = /** @type {{ oldConnectionName: string }} */ (vscode.getState()) || {
      oldConnectionName: '',
    };
    vscode.postMessage({
      type: 'Connection.edit',
      name: $connectionName.value,
      url: $connectionURL.value,
      context: $connectionContext.value,
      oldConnectionName: oldState.oldConnectionName,
    });
  }

  /**
   * @param {import("../connectionManager").Connection} connection
   */
  function InitializeView(connection) {
    let connectionName = connection['name'];
    let connectionEndpoint = connection['endpoint'];
    let connectionContexts = '';

    for (let key in connection['contexts']) {
      connectionContexts += connection['contexts'][key]['resourceID'] + ', ';
    }
    connectionContexts = connectionContexts.trim().replace(/,+$/, '');

    $connectionName.value = connectionName;
    $connectionURL.value = connectionEndpoint;
    $connectionContext.value = connectionContexts;

    vscode.setState({ oldConnectionName: connectionName });
  }
})();
