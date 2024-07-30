// TODO: Reference a library instead for GUID generation?
export type GUID = string & { isGuid: true };
export function guid(guid: string): GUID {
  return guid as GUID;
}

export function generateGUID(): string {
  const timestamp = new Date().getTime();
  const randomNum = Math.floor(Math.random() * 1000000);
  return `${timestamp}-${randomNum}`;
}

export interface Context {
  id: GUID;
  resourceID: string;
  resourceType: string;
  resourceDisplay?: string;
}

export interface Connection {
  id: GUID;
  url: URL;
  active: boolean;
  context: Context[];
}

export class ConnectionManager {
  private connections: Connection[];

  constructor() {
    this.connections = [];
  }

  public getAllConnections(): Connection[] {
    return this.connections;
  }

  public getCurrentConnection(): Connection | undefined {
    let activeConnections = this.getAllConnections().filter(x => x.active);
    if (activeConnections[0] === undefined) return undefined;
    else return this.getAllConnections().filter(x => x.active)[0];
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
        .indexOf(guid(connection.id)),
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
