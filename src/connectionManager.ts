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

  public setCurrentConnection(id: string) {
    this.currentConnection = this.connections[id];
  }

  // TODO
  public testConnection(id: string): void {}

  public upsertConnection(connection: Connection): void {
    this.connections[connection.name] = connection;
  }

  public deleteConnection(id: string): void {
    delete this.connections[id];
  }

  public getCurrentContexts(): Record<string, Context> | undefined {
    return this.getCurrentConnection()?.contexts;
  }

  public upsertContext(connectionID: string, contextID: string, context: Context): void {
    this.connections[connectionID].contexts[contextID] = context;
  }

  // TODO
  public deleteContext(connection: Connection | undefined, context: Context): void {}
}
