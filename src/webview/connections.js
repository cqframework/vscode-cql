// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
/** @typedef {import("../connectionManager").Connection} Connection */
(function () {
  const $connectionsList = document.querySelector('.connections-list');
  if (!$connectionsList) {
    throw new Error('Missing required element.');
  }

  const vscode = acquireVsCodeApi();

  document.querySelector('.add-connection-button')?.addEventListener('click', () => {
    addConnection();
  });

  // Handle messages sent from the extension to the webview
  window.addEventListener('message', event => {
    const message = event.data; // The json data that the extension sent
    switch (message.type) {
      case 'Connections.refreshConnections': {
        refreshConnections();
        break;
      }
      case 'Connections.createConnectionsView': {
        createConnectionsView(message.connections, message.currentConnection);
        break;
      }
    }
  });

  /**
   * @param {Connection[] | undefined} connections
   * @param {Connection | undefined} currentConnection
   */
  function updateConnectionList(connections, currentConnection) {
    if (!$connectionsList || connections === undefined) {
      return;
    }
    $connectionsList.textContent = '';
    for (let key in connections) {
      let connection = connections[key];
      let connectionName = connection['name'];
      let connectionEndpoint = connection['endpoint'];
      let div = document.createElement('div');
      div.className = connectionName;

      AddLabels(connectionName, connectionEndpoint, div);
      if (connectionName !== 'Local') {
        AddDeleteButton(connectionName, div);
        AddUpdateButton(connectionName, div);
      }
      AddConnectionButton(connectionName, currentConnection, div);
      $connectionsList.appendChild(div);
    }
  }

  /**
   *
   * @param {string} connectionName
   * @param {string} connectionEndpoint
   * @param {HTMLElement} div
   */
  function AddLabels(connectionName, connectionEndpoint, div) {
    let connectionNameLabel = document.createElement('h3');
    connectionNameLabel.className = 'ConnectionNameLabel';
    connectionNameLabel.innerHTML = 'Connection: ' + connectionName;

    let connectionURLLabel = document.createElement('label');
    connectionURLLabel.className = 'ConnectionURLLabel';
    connectionURLLabel.innerHTML = connectionEndpoint;

    div.appendChild(connectionNameLabel);
    div.appendChild(document.createElement('br'));
    div.appendChild(connectionURLLabel);
    div.appendChild(document.createElement('br'));
    div.appendChild(document.createElement('br'));
  }

  /**
   * @param {string} connectionName
   * @param {HTMLElement} div
   */
  function AddDeleteButton(connectionName, div) {
    let deleteButton = document.createElement('button');
    deleteButton.className = 'DeleteButton';
    deleteButton.id = 'Delete-' + connectionName;
    deleteButton.innerHTML = 'Delete';

    deleteButton.onclick = function () {
      deleteConnection(connectionName);
    };
    div.appendChild(deleteButton);

    div.appendChild(document.createElement('br'));
    div.appendChild(document.createElement('br'));
  }

  /**
   * @param {string} connectionName
   * @param {HTMLElement} div
   */
  function AddUpdateButton(connectionName, div) {
    let updateButton = document.createElement('button');
    updateButton.className = 'UpdateButton';
    updateButton.id = 'Update-' + connectionName;
    updateButton.innerHTML = 'Update';

    updateButton.onclick = function () {
      updateConnection(connectionName);
    };
    div.appendChild(updateButton);

    div.appendChild(document.createElement('br'));
    div.appendChild(document.createElement('br'));
  }

  /**
   * @param {string} connectionName
   * @param {Connection | undefined} currentConnection
   * @param {HTMLElement} div
   */
  function AddConnectionButton(connectionName, currentConnection, div) {
    let connectButton = document.createElement('button');
    connectButton.className = 'ConnectButton';
    connectButton.id = 'Connect-' + connectionName;
    connectButton.innerHTML = 'Connect';

    if (currentConnection !== undefined) {
      if (connectionName === currentConnection['name']) {
        connectButton.innerHTML = 'Connected';
      }
    }

    connectButton.onclick = function () {
      connect(connectionName);
    };
    div.appendChild(connectButton);
    div.appendChild(document.createElement('br'));
    div.appendChild(document.createElement('br'));
  }

  function addConnection() {
    vscode.postMessage({ type: 'Connections.AddConnectionPanel' });
  }

  /**
   * @param {string} connectionName
   */
  function deleteConnection(connectionName) {
    vscode.postMessage({ type: 'Connections.deleteConnection', data: connectionName });
  }

  /**
   * @param {string} oldConnectionName
   */
  function updateConnection(oldConnectionName) {
    vscode.postMessage({ type: 'Connections.EditConnectionPanel', data: oldConnectionName });
  }

  /**
   * @param {string} connectionName
   */
  function connect(connectionName) {
    vscode.postMessage({ type: 'Connections.connect', data: connectionName });
  }

  function refreshConnections() {
    vscode.postMessage({ type: 'Connections.refreshConnections' });
  }

  /**
   * @param {Connection[]} connections
   * @param {Connection} currentConnection
   */
  function createConnectionsView(connections, currentConnection) {
    updateConnectionList(connections, currentConnection);
  }
})();
