import { ExtensionContext } from 'vscode';
import { Storage } from './storage';

export interface Context {
  resourceID: string;
  resourceType: string;
  resourceDisplay?: string;
}

export interface Connection {
  name: string;
  endpoint: string;
  contexts: Record<string, Context>;
}

/**
 * Manages connections and their associated contexts.
 */
export class ConnectionManager {
  private static connectionManager: ConnectionManager;
  private connections: Record<string, Connection>;
  private currentConnection?: Connection;
  private static _extContext: ExtensionContext;

  private constructor() {
    this.connections = {};
  }

  /**
   * Retrieves the singleton instance of the ConnectionManager.
   * @returns {ConnectionManager} The instance of the ConnectionManager.
   */
  public static getManager(): ConnectionManager {
    return ConnectionManager.connectionManager;
  }

  /**
   * Initializes the ConnectionManager with the given extension context.
   * @param {ExtensionContext} ec - The extension context used to initialize the ConnectionManager.
   */
  public static _initialize(ec: ExtensionContext): void {
    if (ConnectionManager.connectionManager) {
      return;
    }
    ConnectionManager.connectionManager = new ConnectionManager();
    ConnectionManager.connectionManager.connections = {};
    this._extContext = ec;

    if (this._extContext.globalState.get(Storage.STORAGE_CONNECTIONS) !== undefined) {
      this.connectionManager.connections = this._extContext.globalState.get(
        Storage.STORAGE_CONNECTIONS,
      ) as Record<string, Connection>;
    }

    if (this._extContext.globalState.get(Storage.STORAGE_CURRENT_CONNECTION) !== undefined) {
      ConnectionManager.connectionManager.currentConnection = this._extContext.globalState.get(
        Storage.STORAGE_CURRENT_CONNECTION,
      );
    }
  }

  /**
   * Retrieves all connections managed by the ConnectionManager.
   * @returns {Record<string, Connection>} A record of all connections.
   */
  public getAllConnections(): Record<string, Connection> {
    return this.connections;
  }

  /**
   * Retrieves the current active connection.
   * @returns {Connection | undefined} The current connection, or undefined if none is set.
   */
  public getCurrentConnection(): Connection | undefined {
    return this.currentConnection;
  }

  /**
   * Sets the current active connection by its name.
   * @param {string | undefined} name - The name of the connection to set as current. If undefined, unsets the current connection.
   */
  public setCurrentConnection(name: string | undefined): void {
    if (name === undefined) {
      this.currentConnection = undefined;
    } else {
      this.currentConnection = this.connections[name];
    }
  }

  /**
   * Adds or updates a connection in the ConnectionManager.
   * @param {Connection} connection - The connection to add or update.
   */
  public upsertConnection(connection: Connection): void {
    this.connections[connection.name] = connection;
  }

  /**
   * Deletes a connection from the ConnectionManager by its name.
   * @param {string} name - The name of the connection to delete.
   */
  public deleteConnection(name: string): void {
    delete this.connections[name];
  }

  /**
   * Retrieves the contexts of the current active connection.
   * @returns {Record<string, Context> | undefined} A record of contexts, or undefined if no connection is active.
   */
  public getCurrentContexts(): Record<string, Context> | undefined {
    return this.getCurrentConnection()?.contexts;
  }

  /**
   * Adds or updates a context within a specific connection.
   * @param {string} connectionName - The name of the connection to which the context belongs.
   * @param {Context} context - The context to add or update.
   */
  public upsertContext(connectionName: string, context: Context): void {
    this.connections[connectionName].contexts[context.resourceType + '/' + context.resourceID] =
      context;
  }

  /**
   * Deletes a context from a specific connection.
   * @param {string} connectionName - The name of the connection from which to delete the context.
   * @param {string} contextID - The ID of the context to delete.
   */
  public deleteContext(connectionName: string, contextID: string): void {
    delete this.connections[connectionName].contexts[contextID];
  }
}
