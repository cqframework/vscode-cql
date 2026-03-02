import { Event, LogLevel, LogOutputChannel, Uri, window } from 'vscode';
import { createLogger, format, Logger as WinstonLogger } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { LogOutputChannelTransport } from 'winston-transport-vscode';

export class MultiTransportLogger implements LogOutputChannel {
  private readonly _outputChannel: LogOutputChannel;
  private readonly _dailyFileTransport: DailyRotateFile;
  private readonly _logger: WinstonLogger;
  private readonly _logFileBaseName: string;
  private readonly _logFileStorageUri: Uri;

  readonly logLevel: LogLevel;
  readonly onDidChangeLogLevel: Event<LogLevel>;
  readonly name: string;

  constructor(name: string, logFileStorageUri: Uri) {
    this._outputChannel = window.createOutputChannel(name, {
      log: true,
    });
    this.logLevel = this._outputChannel.logLevel;
    this.name = name.toLowerCase().replace(' ', '-');
    this.onDidChangeLogLevel = this._outputChannel.onDidChangeLogLevel;

    this._logFileStorageUri = logFileStorageUri;
    this._logFileBaseName = this.name.toLowerCase().replace(/ /g, '-');

    this._dailyFileTransport = new DailyRotateFile({
      filename: `${this._logFileBaseName}.log.%DATE%`,
      datePattern: 'YYYY-MM-DD',
      maxSize: '100k', // 100k max size per file
      maxFiles: '7d', // retain logs of the last two days,
      dirname: this._logFileStorageUri.fsPath,
      extension: '.log',
    });

    this._logger = createLogger({
      level: 'debug', // Default level
      format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.splat(),
        format.json(),
      ),
      transports: [
        new LogOutputChannelTransport({
          outputChannel: this._outputChannel,
        }),
        this._dailyFileTransport,
      ],
    });
  }

  getOuptutChannelName(): string {
    return this._outputChannel.name;
  }

  getLogFileDetails(): { directory: string; baseName: string } {
    return { directory: this._logFileStorageUri.fsPath, baseName: this._logFileBaseName };
  }

  trace(message: string, ...args: any[]): void {
    this._logger.debug(message, args);
  }

  debug(message: string, ...args: any[]): void {
    this._logger.debug(message, args);
  }

  info(message: string, ...args: any[]): void {
    this._logger.info(message, args);
  }

  warn(message: string, ...args: any[]): void {
    this._logger.warn(message, args);
  }

  error(error: string | Error, ...args: any[]): void {
    this._logger.error(error);
  }

  append(value: string): void {
    this.appendLine(value);
  }

  appendLine(value: string): void {
    const lines = value.split('\n');

    lines.forEach(line => {
      if (line) this._logger.info(line);
    });
  }

  replace(value: string): void {
    this._outputChannel.replace(value);
  }

  clear(): void {
    this._outputChannel.clear();
  }

  show(preserveFocus?: unknown): void {
    this._outputChannel.show(preserveFocus as boolean);
  }

  hide(): void {
    this._outputChannel.hide();
  }

  dispose(): void {
    // a Winston Logger doesn't have a dispose function, this is needed for a plain outputchannel
    // let the Winston Logger manage the outputchannel lifecycle
    return;
  }
}
