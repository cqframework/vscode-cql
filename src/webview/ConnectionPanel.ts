import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';
import { Connection, ConnectionManager } from '../connectionManager';
import { Storage } from '../storage';
import { Messages } from './messages';
import { ConnectionsViewProvider } from './sideBar';

export type PanelMode = 'Uninitialized' | 'Add' | 'Edit';

export class ConnectionPanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: ConnectionPanel | undefined;

  public static viewType = 'Uninitialized';
  private static _extContext: ExtensionContext;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _sidebar: ConnectionsViewProvider | undefined;

  public static getContext(): ExtensionContext {
    return this._extContext;
  }

  public static setContext(ec: ExtensionContext) {
    this._extContext = ec;
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    sideBar: ConnectionsViewProvider,
    mode: PanelMode,
    oldConnectionName?: string,
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (ConnectionPanel.currentPanel) {
      ConnectionPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel.
    let panel: vscode.WebviewPanel;
    if (mode === 'Add') {
      panel = vscode.window.createWebviewPanel(
        ConnectionPanel.viewType,
        'Add Connection',
        column || vscode.ViewColumn.One,
        getWebviewOptions(extensionUri),
      );
      ConnectionPanel.viewType = 'addConnection';
    } else {
      panel = vscode.window.createWebviewPanel(
        ConnectionPanel.viewType,
        'Edit Connection',
        column || vscode.ViewColumn.One,
        getWebviewOptions(extensionUri),
      );
      ConnectionPanel.viewType = 'editConnection';
    }

    ConnectionPanel.currentPanel = new ConnectionPanel(panel, extensionUri, mode);
    ConnectionPanel.currentPanel._sidebar = sideBar;

    let oldConnection =
      ConnectionManager.getManager().getAllConnections()[oldConnectionName as string];

    ConnectionPanel.currentPanel._panel.webview.postMessage({
      type: Messages.CONNECTION_INITIALIZE_PANEL,
      connection: oldConnection,
    });
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, mode: PanelMode) {
    ConnectionPanel.currentPanel = new ConnectionPanel(panel, extensionUri, mode);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, mode: PanelMode) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update(mode);

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Update the content based on view changes
    this._panel.onDidChangeViewState(
      e => {
        if (this._panel.visible) {
          this._update(mode);
        }
      },
      null,
      this._disposables,
    );

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.type) {
          case Messages.CONNECTION_CANCEL: {
            this.dispose();
            break;
          }
          // TODO
          case Messages.CONNECTION_TEST: {
            console.log('Not Implemented');

            break;
          }
          case Messages.CONNECTION_ADD: {
            this.addConnection(message.name, message.url, message.context);
            break;
          }
          case Messages.CONNECTION_EDIT: {
            this.editConnection(
              message.name,
              message.url,
              message.context,
              message.oldConnectionName,
            );
            break;
          }
        }
      },
      null,
      this._disposables,
    );
  }

  public dispose() {
    ConnectionPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  public addConnection(name: string, url: string, context: string) {
    if (name !== '') {
      let aConnection: Connection = {
        name: name,
        url: new URL(url),
        contexts: {},
      };

      ConnectionManager.getManager().upsertConnection(aConnection);

      let contexts = context.split(',');
      for (context in contexts) {
        contexts[context] = contexts[context].trim();
      }
      contexts.forEach(element => {
        ConnectionManager.getManager().upsertContext(name, {
          resourceID: element,
          resourceType: 'Patient',
        });
      });

      ConnectionPanel.getContext().globalState.update(
        Storage.STORAGE_CONNECTIONS,
        ConnectionManager.getManager().getAllConnections(),
      );

      this._sidebar?.getView()?.webview.postMessage({ type: Messages.CONNECTION_REFRESH });
    }

    if (this._panel) {
      this.dispose();
    }
  }

  public editConnection(name: string, url: string, context: string, oldName: string) {
    if (oldName !== name) {
      ConnectionManager.getManager().deleteConnection(oldName);
    }
    this.addConnection(name, url, context);
  }

  _update(mode: PanelMode) {
    const webview = this._panel.webview;

    if (mode === 'Add') {
      this._panel.title = 'Add Connection';
      this._panel.webview.html = this._getHtmlForAddWebview(webview, mode);
    } else if (mode === 'Edit') {
      this._panel.title = 'Edit Connection';
      this._panel.webview.html = this._getHtmlForEditWebview(webview, mode);
    }
  }

  private _getHtmlForAddWebview(webview: vscode.Webview, mode: PanelMode) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src/webview', 'addConnection.ts'),
    );
    return this._getHtmlForWebview(webview, scriptUri, mode);
  }

  private _getHtmlForEditWebview(webview: vscode.Webview, mode: PanelMode) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src/webview', 'editConnection.ts'),
    );
    return this._getHtmlForWebview(webview, scriptUri, mode);
  }

  private _getHtmlForWebview(webview: vscode.Webview, scriptUri: vscode.Uri, mode: PanelMode) {
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src/webview', 'reset.css'),
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src/webview', 'vscode.css'),
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src/webview', 'main.css'),
    );

    let modeText, modeClass;
    if (mode === 'Add') {
      modeText = 'Add';
      modeClass = 'add';
    } else {
      modeText = 'Edit';
      modeClass = 'edit';
    }

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

				<title>FHIR Server Connection</title>
			</head>
			<body>

      <label for="connectionName">Name</label>
      <input type="text" id="connectionName" name="connectionName" placeholder="Enter connection name"><br><br>

      <label for="connectionURL">URL</label>
      <input type="text" id="connectionURL" name="connectionURL" placeholder="Enter server url" value="http://smilecdr/fhir"><br><br>

      <label for="connectionContext">Patient Context</label>
      <input type="text" id="connectionContext" name="connectionContext" placeholder="Enter comma separated Patient IDs"><br><br>


      <button class="cancel-button">Cancel</button>
      <button class="test-connection-button">Test Connection</button>
      <button class="${modeClass}-connection-button">${modeText} Connection</button>
        

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
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

function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    // Enable javascript in the webview
    enableScripts: true,

    // And restrict the webview to only loading content from our extension's `src/webview` directory.
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'src/webview')],
  };
}
