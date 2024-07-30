export interface Context {
  id: string;
  resourceID: string;
  resourceType: string;
  resourceDisplay?: string;
}

export interface Connection {
  id: string;
  url: URL;
  context: Context[];
}

export class ConnectionManager {
  private connections: Connection[];
  private currentConnection?: Connection;

  constructor() {
    this.connections = [];
  }

  public getAllConnections(): Connection[] {
    return this.connections;
  }

  public getCurrentConnection(): Connection | undefined {
    return this.currentConnection;
  }

  public setCurrentConnection(connection: Connection | undefined) {
    this.currentConnection = connection;
  }

  public addConnection(connection: Connection): void {
    this.connections?.push(connection);
  }

  // TODO
  public testConnection(connection: Connection): void {}

  // TODO
  public upsertConnection(connection: Connection): void {}

  // TODO
  public updateConnection(connection: Connection): void {}

  public deleteConnection(connection: Connection): void {
    this.connections.splice(
      this.getAllConnections()
        .map(function (x) {
          return x.id;
        })
        .indexOf(connection.id),
      1,
    );
  }

  public getCurrentContexts(): Context[] | undefined {
    return this.getCurrentConnection()?.context;
  }

  public addContext(connection: Connection | undefined, context: Context): void {
    connection?.context?.push(context);
  }

  // TODO
  public upsertContext(connection: Connection | undefined, context: Context): void {}

  // TODO
  public updateContext(connection: Connection | undefined, context: Context): void {}

  // TODO
  public deleteContext(connection: Connection | undefined, context: Context): void {}
}
