/**
 * The following definitions are constants for the messaging used by this extensions webviews
 * Messages implemented by this extension are prefixed either with "connections" or "connection" varying on which webview they associate with (The SideBar or Panel)
 * Messages defined by this extension are internal to the inner workings of its webviews and are not currently exposed publicly to the extension context
 */
export namespace Messages {
  /* SIDEBAR MESSAGING */

  /**
   * Create or Display SideBar Content of Connection Manager
   */
  export const CONNECTION_INITIALIZE_SIDEBAR = 'Connections.createConnectionsView';

  /**
   * Create or Display a new Connection Panel for Adding a new Connection
   */
  export const CONNECTION_ADD_PANEL = 'Connections.AddConnectionPanel';

  /**
   * Delete a Connection
   */
  export const CONNECTION_DELETE = 'Connections.deleteConnection';

  /**
   * Set a Connection as the Current Connection
   */
  export const CONNECTION_CONNECT = 'Connections.connect';

  /**
   * Create or Display a new Connection Panel for Editing an existing Connection
   */
  export const CONNECTION_EDIT_PANEL = 'Connections.EditConnectionPanel';

  /**
   * Refresh the SideBar WebView content with the current list of connections
   */
  export const CONNECTION_REFRESH = 'Connections.refreshConnections';

  /* PANEL MESSAGING */
  /**
   * Initialize Initial WebView of Panel
   */
  export const CONNECTION_INITIALIZE_PANEL = 'Connection.InitializeView';
  /**
   * Disposes of current Connection Panel
   */
  export const CONNECTION_CANCEL = 'Connection.cancel';
  /**
   * Add a Connection
   */
  export const CONNECTION_ADD = 'Connection.add';
  /**
   * Edit a Connection
   */
  export const CONNECTION_EDIT = 'Connection.edit';
}
