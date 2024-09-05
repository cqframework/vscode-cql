import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';
import { Connection, ConnectionManager } from '../connectionManager';
import { Storage } from '../storage';
import { ConnectionPanel, ConnectionPanelMode } from './ConnectionPanel';
import { DeletePanel, DeletePanelMode } from './deletePanel';
import { Messages } from './messages';

export class ConnectionsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'connectionManager.connectionsView';

  private static _extContext: ExtensionContext;
  private _view?: vscode.WebviewView;
  private static connectionPanel?: ConnectionPanel | undefined;
  private static deleteConfirmationPanel?: DeletePanel | undefined;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public getConnectionPanel() {
    return ConnectionsViewProvider.connectionPanel;
  }

  public setConnectionPanel(panel: ConnectionPanel | undefined) {
    ConnectionsViewProvider.connectionPanel = panel;
  }

  public getDeleteConfirmationPanel() {
    return ConnectionsViewProvider.deleteConfirmationPanel;
  }

  public setDeleteConfirmationPanel(panel: DeletePanel | undefined) {
    ConnectionsViewProvider.deleteConfirmationPanel = panel;
  }

  public getView() {
    return this._view;
  }

  public static getContext(): ExtensionContext {
    return this._extContext;
  }

  public static setContext(ec: ExtensionContext) {
    this._extContext = ec;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.onDidChangeVisibility(async data => {
      if (this.getView()?.visible) {
        this.refreshConnections();
      }
    });

    webviewView.webview.onDidReceiveMessage(async data => {
      switch (data.type) {
        case Messages.CONNECTION_ADD_PANEL: {
          let mode: ConnectionPanelMode = 'Add';
          ConnectionPanel.createOrShow(this._extensionUri, this, mode);
          this.setConnectionPanel(ConnectionPanel.getPanel());
          break;
        }
        case Messages.CONNECTION_DELETE_PANEL: {
          let mode: DeletePanelMode = 'Delete';
          DeletePanel.createOrShow(this._extensionUri, this, mode, data.data);
          break;
        }
        case Messages.CONNECTION_CONNECT: {
          let currentConnection = ConnectionManager.getManager().getCurrentConnection();
          if (currentConnection?.name === data.data) {
            ConnectionManager.getManager().setCurrentConnection('Local');
          } else {
            ConnectionManager.getManager().setCurrentConnection(data.data);
          }

          ConnectionsViewProvider.getContext().globalState.update(
            Storage.STORAGE_CURRENT_CONNECTION,
            ConnectionManager.getManager().getCurrentConnection(),
          );
          this.refreshConnections();
          break;
        }
        case Messages.CONNECTION_EDIT_PANEL: {
          let mode: ConnectionPanelMode = 'Edit';
          ConnectionPanel.createOrShow(this._extensionUri, this, mode, data.data);
          this.setConnectionPanel(ConnectionPanel.getPanel());
          break;
        }
        case Messages.CONNECTION_REFRESH: {
          this.refreshConnections();
          break;
        }
      }
    });

    // Initialize view
    this.refreshConnections();
  }

  public DeleteConnection(connectionName: string) {
    ConnectionManager.getManager().deleteConnection(connectionName);
    ConnectionsViewProvider.getContext().globalState.update(
      Storage.STORAGE_CONNECTIONS,
      ConnectionManager.getManager().getAllConnections(),
    );
    if (ConnectionManager.getManager().getCurrentConnection()?.name === connectionName) {
      ConnectionManager.getManager().setCurrentConnection('Local');
    }

    if (
      ConnectionPanel.getViewType() === 'Edit' &&
      this.getConnectionPanel()?.getOldConnectionName() === connectionName
    ) {
      this.getConnectionPanel()?.dispose();
    }

    this.refreshConnections();
  }

  public AddConnectionPanel() {
    let mode: ConnectionPanelMode = 'Add';
    ConnectionPanel.createOrShow(this._extensionUri, this, mode);
    this.setConnectionPanel(ConnectionPanel.getPanel());
  }

  public EditConnectionPanel() {
    vscode.window.showInputBox().then(input => {
      if (input !== undefined) {
        let mode: ConnectionPanelMode = 'Edit';
        ConnectionPanel.createOrShow(this._extensionUri, this, mode, input);
        this.setConnectionPanel(ConnectionPanel.getPanel());
      }
    });
  }

  public DeleteConnectionPanel() {
    vscode.window.showInputBox().then(input => {
      if (input !== undefined) {
        let mode: DeletePanelMode = 'Delete';
        DeletePanel.createOrShow(this._extensionUri, this, mode, input);
        this.setDeleteConfirmationPanel(DeletePanel.getPanel());
      }
    });
  }

  public ClearConnectionsPanel() {
    let mode: DeletePanelMode = 'ClearAll';
    DeletePanel.createOrShow(this._extensionUri, this, mode);
  }

  public ClearConnections() {
    if (this._view) {
      for (let connection in ConnectionManager.getManager().getAllConnections()) {
        ConnectionManager.getManager().deleteConnection(connection);
      }
      ConnectionsViewProvider.getContext().globalState.update(
        Storage.STORAGE_CONNECTIONS,
        ConnectionManager.getManager().getAllConnections(),
      );
      this.getConnectionPanel()?.dispose();
      this.refreshConnections();
    }
  }

  public ExportConnections() {
    let connections = ConnectionManager.getManager().getAllConnections();
    let currentConnection = ConnectionManager.getManager().getCurrentConnection();

    let serializedExportData = JSON.stringify({
      connections: connections,
      currentConnection: currentConnection,
    });

    const fileName = 'connections-collection.json';
    const wsEdit = new vscode.WorkspaceEdit();
    const wsPath = (vscode.workspace.workspaceFolders as vscode.WorkspaceFolder[])[0].uri.fsPath;
    const filePath = path.join(wsPath, fileName);
    fs.writeFileSync(filePath, serializedExportData), 'utf8';
    const openPath = vscode.Uri.file(filePath);

    vscode.workspace.openTextDocument(openPath).then(doc => {
      vscode.window.showTextDocument(doc);
    });
  }

  public ImportConnections() {
    try {
      vscode.window.showOpenDialog().then(doc => {
        if (doc !== undefined) {
          const data = fs.readFileSync(doc[0].path, { encoding: 'utf8' });

          let serializedImportData = JSON.parse(data);
          let connections: Record<string, Connection> = serializedImportData['connections'];
          let currentConnection: Connection = serializedImportData['currentConnection'];

          for (let connection in ConnectionManager.getManager().getAllConnections()) {
            ConnectionManager.getManager().deleteConnection(connection);
          }

          ConnectionManager.getManager().deleteConnection(
            ConnectionManager.getManager().getCurrentConnection()?.name as string,
          );

          for (let connection in connections) {
            ConnectionManager.getManager().upsertConnection(connections[connection]);
          }

          ConnectionManager.getManager().setCurrentConnection(currentConnection.name);
        }

        ConnectionsViewProvider.getContext().globalState.update(
          Storage.STORAGE_CONNECTIONS,
          ConnectionManager.getManager().getAllConnections(),
        );

        ConnectionsViewProvider.getContext().globalState.update(
          Storage.STORAGE_CURRENT_CONNECTION,
          ConnectionManager.getManager().getCurrentConnection(),
        );

        this.refreshConnections();
      });
    } catch (e) {
      console.log(e);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src/webview', 'connections.js'),
    );

    // Do the same for the stylesheet.
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src/webview', 'reset.css'),
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src/webview', 'vscode.css'),
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src/webview', 'main.css'),
    );

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">

        <!--
          Use a content security policy to only allow loading styles from our extension directory,
          and only allow scripts that have a specific nonce.
          (See the 'webview-sample' extension sample for img-src content security policy examples)
        -->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        <link href="${styleResetUri}" rel="stylesheet">
        <link href="${styleVSCodeUri}" rel="stylesheet">
        <link href="${styleMainUri}" rel="stylesheet">

        <title>FHIR Connections</title>
      </head>
      <body>
        <div class="connections-list"></div><br/><br/>

        <button class="add-connection-button">Add Connection</button>

        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }

  private refreshConnections() {
    let localConnection: Connection = {
      name: 'Local',
      endpoint: 'Local Connection',
      contexts: {},
    };
    ConnectionManager.getManager().upsertConnection(localConnection);
    ConnectionsViewProvider.getContext().globalState.update(
      Storage.STORAGE_CONNECTIONS,
      ConnectionManager.getManager().getAllConnections(),
    );

    // only connection is local
    if (Object.keys(ConnectionManager.getManager().getAllConnections()).length === 1) {
      ConnectionManager.getManager().setCurrentConnection('Local');
      ConnectionsViewProvider.getContext().globalState.update(
        Storage.STORAGE_CURRENT_CONNECTION,
        ConnectionManager.getManager().getCurrentConnection(),
      );
    }

    this._view?.webview.postMessage({
      type: Messages.CONNECTION_INITIALIZE_SIDEBAR,
      connections: ConnectionManager.getManager().getAllConnections(),
      currentConnection: ConnectionManager.getManager().getCurrentConnection(),
    });
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
