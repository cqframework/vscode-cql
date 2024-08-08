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

export class ConnectionManager {
  private static connectionManager: ConnectionManager;
  private connections: Record<string, Connection>;
  private currentConnection?: Connection;
  private static _extContext: ExtensionContext;

  private constructor() {
    this.connections = {};
  }

  public static getManager() {
    return ConnectionManager.connectionManager;
  }

  public static _initialize(ec: ExtensionContext) {
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

  public getAllConnections(): Record<string, Connection> {
    return this.connections;
  }

  public getCurrentConnection(): Connection | undefined {
    return this.currentConnection;
  }

  public setCurrentConnection(name: string) {
    this.currentConnection = this.connections[name];
  }

  // TODO
  public testConnection(name: string): void {}

  public upsertConnection(connection: Connection): void {
    this.connections[connection.name] = connection;
  }

  public deleteConnection(name: string): void {
    delete this.connections[name];
  }

  public getCurrentContexts(): Record<string, Context> | undefined {
    return this.getCurrentConnection()?.contexts;
  }

  public upsertContext(connectionName: string, context: Context): void {
    this.connections[connectionName].contexts[context.resourceType + '/' + context.resourceID] =
      context;
  }

  public deleteContext(connectionName: string, contextID: string): void {
    delete this.connections[connectionName].contexts[contextID];
  }
}
