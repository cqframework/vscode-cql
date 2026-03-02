import { LogOutputChannel, Uri } from 'vscode';
import { MultiTransportLogger } from './multi-transport-logger';

let _logger: MultiTransportLogger;
let _logFilePath: Uri | undefined = undefined;

/**
 * Initializes Winston logger that integrates with VS Code's native logging.
 * @param extensionPath The base path for log file storage.
 * @param channelName The name visible in the VS Code Output dropdown.
 */
export function initialize(logFilePath: Uri, name: string): LogOutputChannel {
  if (!_logger) {
    _logFilePath = logFilePath;
    _logger = new MultiTransportLogger(name, logFilePath);
  }
  return _logger;
}

export function getLogFileDetails(): { directory: string; baseName: string } {
  return _logger.getLogFileDetails();
}

export function debug(message: string, ...args: any[]): void {
  _logger?.debug(message, args);
}

export function error(
  message: string,
  error: Error | unknown | undefined = undefined,
  ...args: any[]
) {
  if (!error) {
    _logger?.error(message, args);
  } else if (error instanceof Error) {
    _logger?.error(`${message} err: ${error.message}`, args);
  } else {
    _logger?.error(`${message} err: An unknown error occurred`, args);
  }
}

export function info(message: string, ...args: any[]): void {
  _logger?.info(message, args);
}

export function warn(message: string, ...args: any[]): void {
  _logger?.warn(message, args);
}
