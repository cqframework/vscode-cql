import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';
import { ConnectionManager } from '../connectionManager';
import { Messages } from './messages';
import { ConnectionsViewProvider } from './sideBar';

export type DeletePanelMode = 'Uninitialized' | 'Delete' | 'ClearAll';

export class DeletePanel {
  /**
   * Track the current delete panel. Only allow a single panel to exist at a time.
   */
  private static currentPanel: DeletePanel | undefined;
  private static viewType = 'Uninitialized';
  private static _extContext: ExtensionContext;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _sidebar: ConnectionsViewProvider | undefined;
  private _oldConnectionName?: string;

  public static getPanel(): DeletePanel | undefined {
    return DeletePanel.currentPanel;
  }

  public static getContext(): ExtensionContext {
    return this._extContext;
  }

  public static setContext(ec: ExtensionContext) {
    this._extContext = ec;
  }

  public static getViewType(): string {
    return this.viewType;
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    sideBar: ConnectionsViewProvider,
    mode: DeletePanelMode,
    oldConnectionName?: string,
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (DeletePanel.currentPanel) {
      DeletePanel.currentPanel.dispose();
    }

    let panel: vscode.WebviewPanel = vscode.window.createWebviewPanel(
      DeletePanel.viewType,
      'Delete Connection',
      column || vscode.ViewColumn.One,
      getWebviewOptions(extensionUri),
    );

    DeletePanel.currentPanel = new DeletePanel(panel, extensionUri, mode, oldConnectionName);
    DeletePanel.currentPanel._sidebar = sideBar;

    let oldConnection =
      ConnectionManager.getManager().getAllConnections()[oldConnectionName as string];

    DeletePanel.currentPanel._panel.webview.postMessage({
      type: Messages.CONNECTION_INITIALIZE_PANEL,
      connection: oldConnection,
    });
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    mode: DeletePanelMode,
    oldConnectionName?: string,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._oldConnectionName = oldConnectionName;

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
          let oldConnection =
            ConnectionManager.getManager().getAllConnections()[this._oldConnectionName as string];

          DeletePanel.currentPanel?._panel.webview.postMessage({
            type: Messages.CONNECTION_INITIALIZE_PANEL,
            connection: oldConnection,
          });
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
          case Messages.CONNECTION_DELETE: {
            if (message.mode === 'Delete') {
              this._sidebar?.DeleteConnection(message.oldConnectionName);
            } else {
              this._sidebar?.ClearConnections();
            }
            this.dispose();
            break;
          }
        }
      },
      null,
      this._disposables,
    );
  }

  public dispose() {
    DeletePanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  _update(mode: DeletePanelMode) {
    const webview = this._panel.webview;

    if (mode === 'Delete') {
      this._panel.title = 'Delete Connection';
      this._panel.webview.html = this._getHtmlForWebview(webview, 'Delete');
    } else if (mode === 'ClearAll') {
      this._panel.title = 'Clear All Connections';
      this._panel.webview.html = this._getHtmlForWebview(webview, 'ClearAll');
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview, mode: DeletePanelMode) {
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src/webview', 'reset.css'),
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src/webview', 'vscode.css'),
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src/webview', 'main.css'),
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src/webview/deletePanel.js'),
    );

    return `<!DOCTYPE html>
          <html lang="en" data-mode="${mode}">
  			<head>
  				<meta charset="UTF-8">

                <meta name="viewport" content="width=device-width, initial-scale=1.0">

                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <link href="${styleMainUri}" rel="stylesheet">

  				<title>FHIR Server Connection</title>
            </head>
            <body>
                <label class="delete-confirmation-label"></label>
                <div>
                  <button class="cancel-button">Cancel</button>
                  <button class="delete-confirmation-button">Yes, Delete</button>
                </div>

                <script src="${scriptUri}"></script>
            </body>
          </html>`;
  }
}

function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    // Enable javascript in the webview
    enableScripts: true,

    // And restrict the webview to only loading content from our extension's `src/webview` directory.
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'src/webview')],
  };
}
