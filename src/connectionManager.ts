import { ExtensionContext } from 'vscode';

export interface Context {
  resourceID: string;
  resourceType: string;
  resourceDisplay?: string;
}

export interface Connection {
  name: string;
  url: URL;
  contexts: Record<string, Context>;
}

export class ConnectionManager {
  public static connectionManager: ConnectionManager;
  private connections: Record<string, Connection>;
  private currentConnection?: Connection;
  private static _extContext: ExtensionContext;

  private constructor() {
    this.connections = {};
  }

  public static _initialize(ec: ExtensionContext) {
    ConnectionManager.connectionManager = new ConnectionManager();
    ConnectionManager.connectionManager.connections = {};
    this._extContext = ec;

    if (this._extContext.globalState.get('ConnectionManager.connections') != undefined) {
      this.connectionManager.connections = this._extContext.globalState.get(
        'ConnectionManager.connections',
      ) as Record<string, Connection>;
    }

    if (this._extContext.globalState.get('ConnectionManager.currentConnection') != undefined) {
      ConnectionManager.connectionManager.currentConnection = this._extContext.globalState.get(
        'ConnectionManager.currentConnection',
      );
    }
  }

  public getAllConnections(): Record<string, Connection> {
    return ConnectionManager.connectionManager.connections;
  }

  public getCurrentConnection(): Connection | undefined {
    return ConnectionManager.connectionManager.currentConnection;
  }

  public setCurrentConnection(name: string) {
    ConnectionManager.connectionManager.currentConnection =
      ConnectionManager.connectionManager.connections[name];
  }

  // TODO
  public testConnection(name: string): void {}

  public upsertConnection(connection: Connection): void {
    ConnectionManager.connectionManager.connections[connection.name] = connection;
  }

  public deleteConnection(name: string): void {
    delete ConnectionManager.connectionManager.connections[name];
  }

  public getCurrentContexts(): Record<string, Context> | undefined {
    return ConnectionManager.connectionManager.getCurrentConnection()?.contexts;
  }

  public upsertContext(connectionName: string, context: Context): void {
    ConnectionManager.connectionManager.connections[connectionName].contexts[
      context.resourceType + '/' + context.resourceID
    ] = context;
  }

  public deleteContext(connectionName: string, contextID: string): void {
    delete ConnectionManager.connectionManager.connections[connectionName].contexts[contextID];
  }
}
