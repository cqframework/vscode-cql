/**
 * This is a stub description for now.
 */
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
 * Manages multiple FHIR data connections and their associated contexts for CQL evaluations.
 *
 * The **Connection Manager** allows for managing multiple data connections, but only one connection can be active at a time.
 * It currently supports FHIR server connections and local file system connections. It provides full CRUD capabilities and
 * ensures that connections and contexts persist across sessions using VS Code's global state storage.
 *
 *
 * **Quick Example:**
 *
 * - **Creating a New Connection**:
 *   ```typescript
 *   const connection: Connection = {
 *     name: "Local Connection",
 *     endpoint: "file:///Users/username/test-dir",
 *     contexts: {
 *       "Patient/123": {
 *         resourceID: "123",
 *         resourceType: "Patient",
 *         resourceDisplay: "John Doe"
 *       }
 *     }
 *   };
 *   ConnectionManager.getManager().upsertConnection(connection);
 *   ```
 *
 *
 * - **Setting the Active Connection**:
 *   ```typescript
 *   ConnectionManager.getManager().setCurrentConnection("Local Connection");
 *   ```
 *
 * **Key Operations:**
 *
 * - **Read**: Retrieve all stored connections and their associated contexts.
 * - **Upsert**: Add or update connections and contexts.
 * - **Delete**: Remove connections and contexts.
 *
 * **Further Examples:**
 *
 * - **Retrieving the Current Active Connection**:
 *   ```typescript
 *   const currentConnection = ConnectionManager.getManager().getCurrentConnection();
 *   console.log(currentConnection);
 *   ```
 *
 * - **Deleting a Connection**:
 *   ```typescript
 *   ConnectionManager.getManager().deleteConnection("Remote Connection");
 *   ```
 *
 * **CRUD Operations:**
 *
 * - **Create or Update a Connection**:
 *   Use `upsertConnection` to add a new connection or update an existing one.
 *   ```typescript
 *   ConnectionManager.getManager().upsertConnection(connection);
 *   ```
 *
 * - **Read Connections**:
 *   Retrieve all connections or get the current active connection.
 *   ```typescript
 *   const allConnections = ConnectionManager.getManager().getAllConnections();
 *   const currentConnection = ConnectionManager.getManager().getCurrentConnection();
 *   ```
 *
 * - **Delete a Connection**:
 *   Remove a connection by name.
 *   ```typescript
 *   ConnectionManager.getManager().deleteConnection("Local Connection");
 *   ```
 *
 * - **Set the Current Active Connection**:
 *   Choose which connection will be the active one for CQL evaluations.
 *   ```typescript
 *   ConnectionManager.getManager().setCurrentConnection("Remote Connection");
 *   ```
 *
 * **Context Management**:
 *
 * - **Adding or Updating a Context**:
 *   Add or update a context within a specific connection. Contexts represent specific resources used in CQL evaluations (e.g., Patients).
 *   ```typescript
 *   const patientContext: Context = { resourceID: "123", resourceType: "Patient", resourceDisplay: "John Doe" };
 *   ConnectionManager.getManager().upsertContext("Local Connection", patientContext);
 *   ```
 *
 * - **Retrieving Contexts for the Current Connection**:
 *   ```typescript
 *   const contexts = ConnectionManager.getManager().getCurrentContexts();
 *   console.log(contexts);
 *   ```
 *
 * - **Deleting a Context**:
 *   ```typescript
 *   ConnectionManager.getManager().deleteContext("Local Connection", "Patient/123");
 *   ```
 *
 * **Important Notes:**
 *
 * - **Context Parameters**:
 *   Contexts represent specific resource types such as Patients, Encounters, or Organizations. Each connection may have multiple contexts,
 *   but currently, only "Patient" is supported. Future updates will expand this to include other resource types.
 *
 * - **Single Active Connection**:
 *   Only one connection can be active at a time. Switching between connections is managed by the `setCurrentConnection` method.
 *
 * **Considerations and Limitations:**
 *
 * - **FHIR-Only**: The connection manager is currently limited to managing FHIR-based data connections.
 * - **Single Active Connection**: Only one connection may be active at a time for CQL evaluations.
 * - **Context Limitations**: Only the "Patient" context parameter is currently supported. Other contexts like "Encounters" or "Organizations"
 *   are expected to be supported in future updates.
 *
 * **Future Enhancements:**
 *
 * - **Additional Context Support**: Expand support to include other context types, such as Encounters and Organizations.
 * - **Terminology Repositories**: Add support for managing connections to external terminology repositories.
 * - **Artifact Repositories**: Include support for managing repositories of CQL artifacts (e.g., Libraries, PlanDefinitions, Measures).
 * - **Multiple Active Connections**: Enable the possibility of managing and utilizing multiple active connections for more complex workflows.
 *
 * @param {ExtensionContext} ec - The extension context used to initialize the ConnectionManager.
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
