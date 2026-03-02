/**
 * These are constants for the commands used by or implemented by this extension
 * Commands that are defined by the vscode api are named accordingly,
 * Commands implemented  defined by this extension are prefixed "cql"
 */
export namespace Commands {
  /**
   * Open Browser
   */
  export const OPEN_BROWSER = 'vscode.open';

  /**
   * Execute Workspace Command
   */
  export const EXECUTE_WORKSPACE_COMMAND = 'cql.execute.workspaceCommand';

  /**
   * Open CQL Language Server Log file
   */
  export const OPEN_SERVER_LOG = 'cql.open.serverLog';

  /**
   * Open CQL client Log file
   */
  export const OPEN_CLIENT_LOG = 'cql.open.clientLog';

  /**
   * Open CQL log files side by side
   */
  export const OPEN_LOGS = 'cql.open.logs';

  /*
   * Show Output
   */
  export const OPEN_OUTPUT = 'cql.open.output';

  /*
   * View ELM for CQL
   */
  // TODO: Shorten the command, the whole namespace isn't needed.
  export const VIEW_ELM_COMMAND_XML = 'cql.action.viewElm.xml';
  export const VIEW_ELM_COMMAND_JSON = 'cql.action.viewElm.json';
  export const VIEW_ELM = 'org.opencds.cqf.cql.ls.viewElm';

  /*
   * Execute CQL
   * TODO: Deprecate once full debugging support exists
   */
  export const EXECUTE_CQL_COMMAND = 'cql.action.executeCql';
  export const EXECUTE_CQL = 'org.opencds.cqf.cql.ls.plugin.debug.startDebugSession';

  export const EXECUTE_CQL_COMMAND_SELECT_LIBRARIES = 'cql.action.executeCql.selectLibraries';
  export const EXECUTE_CQL_COMMAND_SELECT_TEST_CASES = 'cql.action.executeCql.selectTestCases';

  /*
   * Open settings.json
   */
  export const OPEN_JSON_SETTINGS = 'workbench.action.openSettingsJson';
}
