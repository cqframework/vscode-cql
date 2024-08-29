import * as net from 'net';
import * as path from 'path';
import { ExtensionContext } from 'vscode';
import {
  Executable,
  ExecutableOptions,
  StreamInfo,
  TransportKind,
} from 'vscode-languageclient/node';
import { logger } from './log';
import { RequirementsData } from './requirements';

declare const v8debug: any;
const DEBUG = typeof v8debug === 'object' || startedInDebugMode();

export interface TransportExecutable extends Executable {
  transport: TransportKind;
}

/**
 * Prepares the executable command to start the CQL language server.
 * @param {RequirementsData} requirements - The requirements for the CQL language server, including the Java home and server JAR paths.
 * @param {ExtensionContext} context - The VS Code extension context.
 * @param {string} workspacePath - The path to the workspace directory.
 * @returns {TransportExecutable} The executable configuration, including the command, arguments, and transport method.
 */
export function prepareExecutable(
  requirements: RequirementsData,
  context: ExtensionContext,
  workspacePath: string,
): TransportExecutable {
  const executable: TransportExecutable = Object.create(null);
  const options: ExecutableOptions = Object.create(null);
  options.env = Object.assign(process.env);
  executable.options = options;
  executable.command = path.resolve(requirements.java_requirements.java_home + '/bin/java');
  executable.args = prepareParams(requirements, context, workspacePath);
  logger.info(`Starting CQL server with: ${executable.command} ${executable.args.join(' ')}`);

  executable.transport = TransportKind.stdio;

  return executable;
}

/**
 * Waits for the server connection on the specified port.
 * @param {string} port - The port number to listen on for the server connection.
 * @returns {Thenable<StreamInfo>} A promise that resolves with the StreamInfo when the connection is established.
 */
export function awaitServerConnection(port: string): Thenable<StreamInfo> {
  const addr = parseInt(port);
  return new Promise((res, rej) => {
    const server = net.createServer(stream => {
      server.close();
      logger.info('CQL LS connection established on port ' + addr);
      res({ reader: stream, writer: stream });
    });
    server.on('error', rej);
    server.listen(addr, () => {
      server.removeListener('error', rej);
      logger.info('Awaiting CQL LS connection on port ' + addr);
    });
    return server;
  });
}

/**
 * Prepares the command-line arguments to start the CQL language server.
 * @param {RequirementsData} requirements - The requirements for the CQL language server, including the Java home and server JAR paths.
 * @param {ExtensionContext} context - The VS Code extension context.
 * @param {string} workspacePath - The path to the workspace directory.
 * @returns {string[]} An array of command-line arguments for starting the CQL language server.
 */
function prepareParams(
  requirements: RequirementsData,
  context: ExtensionContext,
  workspacePath: string,
): string[] {
  const params: string[] = [];
  if (DEBUG) {
    const port = 1044;
    params.push('-Dlog.level=ALL');
    params.push(`-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=${port},quiet=y`);
    // suspend=y is the default. Use this form if you need to debug the server startup code:
    //  params.push('-agentlib:jdwp=transport=dt_socket,server=y,address=1044');
  }

  params.push('-jar');
  params.push(path.resolve(requirements.cql_ls_info.cql_ls_jar));

  // TODO: Add support to the language server to support using the workspace.
  params.push('-workspace');
  params.push(workspacePath);

  return params;
}

/**
 * Determines if the process was started in debug mode.
 * @returns {boolean} `true` if the process was started in debug mode, `false` otherwise.
 */
function startedInDebugMode(): boolean {
  const args = (process as any).execArgv as string[];
  return hasDebugFlag(args);
}

/**
 * Checks if the provided arguments contain debug flags.
 * @param {string[]} args - The command-line arguments to check.
 * @returns {boolean} `true` if the arguments contain debug flags, `false` otherwise.
 */
export function hasDebugFlag(args: string[]): boolean {
  if (args) {
    // See https://nodejs.org/en/docs/guides/debugging-getting-started/
    return args.some(arg => /^--inspect/.test(arg) || /^--debug/.test(arg));
  }
  return false;
}
