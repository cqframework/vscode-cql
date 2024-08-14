import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';
import { Connection, ConnectionManager } from '../connectionManager';
import { Storage } from '../storage';
import { ConnectionPanel, PanelMode } from './ConnectionPanel';
import { Messages } from './messages';

export class ConnectionsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'connectionManager.connectionsView';

  private static _extContext: ExtensionContext;
  private _view?: vscode.WebviewView;
  public static currentPanel?: ConnectionPanel | undefined;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public getPanel() {
    return ConnectionsViewProvider.currentPanel;
  }

  public setPanel(panel: ConnectionPanel | undefined) {
    ConnectionsViewProvider.currentPanel = panel;
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
          let mode: PanelMode = 'Add';
          ConnectionPanel.createOrShow(this._extensionUri, this, mode);
          this.setPanel(ConnectionPanel.getPanel());
          break;
        }
        case Messages.CONNECTION_DELETE: {
          ConnectionManager.getManager().deleteConnection(data.data);
          ConnectionsViewProvider.getContext().globalState.update(
            Storage.STORAGE_CONNECTIONS,
            ConnectionManager.getManager().getAllConnections(),
          );
          if (ConnectionManager.getManager().getCurrentConnection()?.name === data.data) {
            ConnectionManager.getManager().setCurrentConnection('Local');
          }

          this.getPanel()?.dispose();
          this.refreshConnections();
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
          let mode: PanelMode = 'Edit';
          ConnectionPanel.createOrShow(this._extensionUri, this, mode, data.data);
          this.setPanel(ConnectionPanel.getPanel());
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

  public ClearConnections() {
    if (this._view) {
      for (let connection in ConnectionManager.getManager().getAllConnections()) {
        ConnectionManager.getManager().deleteConnection(connection);
      }
      ConnectionsViewProvider.getContext().globalState.update(
        Storage.STORAGE_CONNECTIONS,
        ConnectionManager.getManager().getAllConnections(),
      );
      this.getPanel()?.dispose();
      this.refreshConnections();
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src/webview', 'connections.ts'),
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
      url: new URL('http://smilecdr/fhir'),
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
