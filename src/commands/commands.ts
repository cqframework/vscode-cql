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
  export const OPEN_SERVER_LOG = 'cql.open.server-log';

  /**
   * Open CQL client Log file
   */
  export const OPEN_CLIENT_LOG = 'cql.open.client-log';

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
  export const VIEW_ELM_COMMAND_XML = 'cql.editor.view-elm.xml';
  export const VIEW_ELM_COMMAND_JSON = 'cql.editor.view-elm.json';
  export const VIEW_ELM = 'org.opencds.cqf.cql.ls.viewElm';

  /*
   * Execute CQL
   * TODO: Deprecate once full debugging support exists
   */
  export const EXECUTE_CQL_COMMAND = 'cql.editor.execute';
  export const EXECUTE_CQL = 'org.opencds.cqf.cql.ls.plugin.debug.startDebugSession';

  export const EXECUTE_CQL_COMMAND_SELECT_LIBRARIES = 'cql.execute.select-libraries';
  export const EXECUTE_CQL_COMMAND_SELECT_TEST_CASES = 'cql.editor.execute.select-test-cases';

  /*
   * Open settings.json
   */
  export const OPEN_JSON_SETTINGS = 'workbench.action.openSettingsJson';
}
