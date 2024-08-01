export interface Context {
  resourceID: string;
  resourceType: string;
  resourceDisplay?: string;
}

export interface Connection {
  id: string;
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

  public addConnection(id: string, connection: Connection): void {
    if (!this.connections.hasOwnProperty(id)) {
      this.connections[id] = connection;
    }
  }

  // TODO
  public testConnection(id: string): void {}

  public upsertConnection(id: string, connection: Connection): void {
    this.connections[id] = connection;
  }

  public deleteConnection(id: string): void {
    delete this.connections[id];
  }

  public getCurrentContexts(): Record<string, Context> | undefined {
    return this.getCurrentConnection()?.contexts;
  }

  public addContext(connectionID: string, contextID: string, context: Context): void {
    if (!this.connections[connectionID].contexts.hasOwnProperty(contextID)) {
      this.connections[connectionID].contexts[contextID] = context;
    }
  }

  public upsertContext(connectionID: string, contextID: string, context: Context): void {
    this.connections[connectionID].contexts[contextID] = context;
  }

  // TODO
  public deleteContext(connection: Connection | undefined, context: Context): void {}
}
