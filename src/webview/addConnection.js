// TODO Update implementation to use javadocs

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
  const $cancelButton = document.querySelector('.cancel-button');
  const $testConnectionButton = document.querySelector('.test-connection-button');
  const $addConnectionButton = document.querySelector('.add-connection-button');
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
      $addConnectionButton &&
      $connectionName &&
      $connectionURL &&
      $connectionContext
    )
  ) {
    throw new Error('Missing required element.');
  }

  const vscode = acquireVsCodeApi();

  $cancelButton.addEventListener('click', () => {
    Cancel();
  });

  $testConnectionButton.addEventListener('click', () => {
    TestConnection();
  });

  $addConnectionButton.addEventListener('click', () => {
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

  const addConnection = () => {
    vscode.postMessage({
      // TODO Update implementation to use javadocs
      type: 'Connection.add',
      name: $connectionName?.value,
      url: $connectionURL?.value,
      context: $connectionContext?.value,
    });
  };
})();
