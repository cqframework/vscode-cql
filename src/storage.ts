/**
 * The following definitions are constants for the data storage used by this extensions Connection Manager
 * Constants implemented by this extension are prefixed with "ConnectionManager" to define the extensions global storage state
 * Constants defined by this extension are internal to the inner workings of its Connection Manager
 */

export namespace Storage {
  /**
   * Global Storage location for all Connections within the extensions context
   */
  export const STORAGE_CONNECTIONS = 'ConnectionManager.connections';

  /**
   * Global Storage location for Current Connection within the extensions context
   */
  export const STORAGE_CURRENT_CONNECTION = 'ConnectionManager.currentConnection';
}
