(function () {
  const vscode = acquireVsCodeApi();

  const mode = document.querySelector('html')?.dataset?.['mode'];
  if (mode !== 'Delete' && mode !== 'ClearAll') {
    throw new Error('Invalid mode.');
  }

  const $cancelButton = document.querySelector('.cancel-button');
  const $confirmationButton = document.querySelector('.delete-confirmation-button');
  const $deleteText = document.querySelector('.delete-confirmation-label');

  if (!($cancelButton && $confirmationButton && $deleteText)) {
    throw new Error('Missing required element.');
  }

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

  /**
   * @param {import("../connectionManager").Connection} connection
   */
  function InitializeView(connection) {
    if (mode === 'Delete') {
      let connectionName = connection['name'];
      vscode.setState({ oldConnectionName: connectionName });
      $deleteText.innerText = 'Are you sure you want to delete connection ' + connectionName + '?';
    } else {
      $deleteText.innerText = 'Are you sure you want to delete all connections?';
    }
  }

  $cancelButton.addEventListener('click', () => {
    vscode.postMessage({
      type: 'Connection.cancel',
    });
  });

  $confirmationButton.addEventListener('click', () => {
    const oldState = /** @type {{ oldConnectionName: string }} */ (vscode.getState()) || {
      oldConnectionName: '',
    };

    vscode.postMessage({
      type: 'Connections.deleteConnection',
      mode: mode,
      oldConnectionName: oldState.oldConnectionName,
    });
  });
})();
