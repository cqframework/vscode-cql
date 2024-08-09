// @ts-nocheck

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
  const vscode = acquireVsCodeApi();

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
      case 'clearConnections': {
        values = [];
        updateConnectionList(values);
        break;
      }
      case 'deleteConnection': {
        deleteConnection();
        break;
      }
      case 'connections.refreshConnections': {
        refreshConnections();
        break;
      }
      case 'connections.createConnectionsView': {
        createConnectionsView(message.connections, message.currentConnection);
        break;
      }
    }
  });

  function updateConnectionList(connections, currentConnection) {
    const connectionsList = document.querySelector('.connections-list');
    connectionsList.textContent = 'You have no saved connections. Add one below.';
    if (connections !== undefined) {
      connectionsList.textContent = '';
      for (key in connections) {
        if (connections.hasOwnProperty(key)) {
          let connection = connections[key];
          let connectionName = connection['name'];
          let connectionURL = connection['url'];

          let div = document.createElement('div');
          div.className = connectionName;
          let connectionNameLabel = document.createElement('h3');
          connectionNameLabel.className = 'ConnectionNameLabel';
          connectionNameLabel.innerHTML = 'Connection: ' + connectionName;

          div.className = connectionURL;
          let connectionURLLabel = document.createElement('label');
          connectionURLLabel.className = 'ConnectionURLLabel';
          connectionURLLabel.innerHTML = connectionURL;

          div.appendChild(connectionNameLabel);
          div.appendChild(document.createElement('br'));
          div.appendChild(connectionURLLabel);
          div.appendChild(document.createElement('br'));
          div.appendChild(document.createElement('br'));

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

          let connectButton = document.createElement('button');
          connectButton.className = 'ConnectButton';
          connectButton.id = 'Connect-' + connectionName;

          if (connectionName === currentConnection['name']) {
            connectButton.innerHTML = 'Connected';
          } else {
            connectButton.innerHTML = 'Connect';
          }

          connectButton.onclick = function () {
            connect(connectionName);
          };
          div.appendChild(connectButton);
          div.appendChild(document.createElement('br'));
          div.appendChild(document.createElement('br'));
          connectionsList.appendChild(div);
        }
      }
    }
  }

  function addConnection() {
    vscode.postMessage({ type: 'connections.ConnectionPanel' });
  }

  function deleteConnection(connectionName) {
    vscode.postMessage({ type: 'connections.deleteConnection', data: connectionName });
  }

  function updateConnection(oldConnectionName) {
    vscode.postMessage({ type: 'connections.updateConnection', data: oldConnectionName });
  }

  function connect(connectionName) {
    vscode.postMessage({ type: 'connections.connect', data: connectionName });
  }

  function refreshConnections() {
    vscode.postMessage({ type: 'connections.refreshConnections' });
  }

  function createConnectionsView(connections, currentConnection) {
    updateConnectionList(connections, currentConnection);
  }
})();
