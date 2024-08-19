(function () {
  const vscode = acquireVsCodeApi();

  const mode = document.querySelector('html')?.dataset?.['mode'];
  if (mode !== 'add' && mode !== 'edit') {
    throw new Error('Invalid mode.');
  }

  const $cancelButton = document.querySelector('.cancel-button');
  const $testConnectionButton = document.querySelector('.test-connection-button');
  const $connectionName = /** @type {HTMLInputElement} */ (
    document.getElementById('connectionName')
  );
  const $connectionURL = /** @type {HTMLInputElement} */ (document.getElementById('connectionURL'));
  const $connectionContext = /** @type {HTMLInputElement} */ (
    document.getElementById('connectionContext')
  );
  const $testConnectionResult = document.querySelector('.test-connection-result');

  if (
    !(
      $cancelButton &&
      $testConnectionButton &&
      $connectionName &&
      $connectionURL &&
      $connectionContext &&
      $testConnectionResult
    )
  ) {
    throw new Error('Missing required element.');
  }

  if (mode === 'add') {
    const $addConnectionButton = document.querySelector('.add-connection-button');
    if (!$addConnectionButton) {
      throw new Error('Missing required element.');
    }

    $addConnectionButton.addEventListener('click', () => {
      vscode.postMessage({
        type: 'Connection.add',
        name: $connectionName?.value,
        url: $connectionURL?.value,
        context: $connectionContext?.value,
      });
    });

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
      const message = event.data; // The json data that the extension sent
      switch (message.type) {
      }
    });
  } else if (mode === 'edit') {
    const $editConnectionButton = document.querySelector('.edit-connection-button');
    if (!$editConnectionButton) {
      throw new Error('Missing required element.');
    }

    $editConnectionButton.addEventListener('click', () => {
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
  }

  $cancelButton.addEventListener('click', () => {
    vscode.postMessage({
      type: 'Connection.cancel',
    });
  });

  $testConnectionButton.addEventListener('click', async () => {
    const url = $connectionURL.value;
    try {
      const result = await fetch(url + '/metadata');
      if (result.ok) {
        const json = await result.json();
        $testConnectionResult.innerText = `Connection successful! Server is running FHIR version ${json['fhirVersion']}.`;
      } else {
        $testConnectionResult.innerText = 'Connection failed.';
      }
    } catch (e) {
      $testConnectionResult.innerText = 'Connection failed.';
    }
  });
})();
