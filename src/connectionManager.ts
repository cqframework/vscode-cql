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
  private connections: Record<string, Connection>;
  private currentConnection?: Connection;

  constructor() {
    this.connections = {};
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
