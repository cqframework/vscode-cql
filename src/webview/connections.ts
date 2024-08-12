// TODO Update implementation to use javadocs
// @ts-nocheck

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
  const vscode = acquireVsCodeApi();

  document.querySelector('.add-connection-button')?.addEventListener('click', () => {
    addConnection();
  });

  // Handle messages sent from the extension to the webview
  window.addEventListener('message', event => {
    const message = event.data; // The json data that the extension sent
    switch (message.type) {
      // TODO Update implementation to use javadocs
      case 'cql.connections.clearConnections': {
        updateConnectionList(undefined, undefined);
        break;
      }
      // TODO Update implementation to use javadocs
      case 'Connections.refreshConnections': {
        refreshConnections();
        break;
      }
      // TODO Update implementation to use javadocs
      case 'Connections.createConnectionsView': {
        createConnectionsView(message.connections, message.currentConnection);
        break;
      }
    }
  });

  function updateConnectionList(connections, currentConnection) {
    const connectionsList = document.querySelector('.connections-list');
    connectionsList.textContent = '';
    if (Object.keys(connections).length === 0) {
      connectionsList.textContent = 'You have no saved connections. Add one below.';
    }
    if (!connectionsList || connections === undefined) {
      return;
    }
    for (let key in connections) {
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
      connectionsList.appendChild(div);
    }
  }

  function addConnection() {
    vscode.postMessage({ type: 'Connections.AddConnectionPanel' });
  }

  function deleteConnection(connectionName) {
    vscode.postMessage({ type: 'Connections.deleteConnection', data: connectionName });
  }

  function updateConnection(oldConnectionName) {
    vscode.postMessage({ type: 'Connections.EditConnectionPanel', data: oldConnectionName });
  }

  function connect(connectionName) {
    vscode.postMessage({ type: 'Connections.connect', data: connectionName });
  }

  function refreshConnections() {
    vscode.postMessage({ type: 'Connections.refreshConnections' });
  }

  function createConnectionsView(connections, currentConnection) {
    console.log('Connections is ' + connections);
    updateConnectionList(connections, currentConnection);
  }
})();
