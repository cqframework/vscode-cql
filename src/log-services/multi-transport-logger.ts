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
  private _currentBlockLevel: string | undefined;

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
      // Use the transport's own level set so 'trace' is a recognised level name
      // and maps correctly to outputChannel.trace() instead of falling through
      // to appendLine() in the default case.
      levels: LogOutputChannelTransport.config.levels,
      level: MultiTransportLogger.toWinstonLevel(this._outputChannel.logLevel),
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

    this._outputChannel.onDidChangeLogLevel(level => {
      if (level === LogLevel.Off) {
        this._logger.silent = true;
      } else {
        this._logger.silent = false;
        this._logger.level = MultiTransportLogger.toWinstonLevel(level);
      }
    });
  }

  private static toWinstonLevel(level: LogLevel): string {
    switch (level) {
      case LogLevel.Trace:   return 'trace';
      case LogLevel.Debug:   return 'debug';
      case LogLevel.Info:    return 'info';
      case LogLevel.Warning: return 'warn';
      case LogLevel.Error:   return 'error';
      default:               return 'info';
    }
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

    // Logback server stderr pattern:
    // %-4relative [%thread] %-5level %logger{35} %msg %n
    // e.g. "1234 [main] WARN  org.opencds.SomeClass Some message"
    const logbackPattern = /^\d+\s+\[\S+\]\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+/i;

    // vscode-languageclient LSP trace pattern: "[Trace - HH:MM:SS AM] ..."
    // The header and its params body arrive in separate appendLine() calls, so
    // _currentBlockLevel persists the detected level across calls.
    const lspTracePattern = /^\[(Trace|Debug|Info|Warn|Error)\s+-\s+/i;

    // If this call starts with an LSP trace header, update the persisted level.
    for (const line of lines) {
      if (!line.trim()) continue;
      const m = lspTracePattern.exec(line);
      if (m) this._currentBlockLevel = m[1].toUpperCase();
      break;
    }

    const logAtLevel = (level: string | undefined, line: string) => {
      switch (level) {
        case 'TRACE': this._logger.log('trace', line); break;
        case 'DEBUG': this._logger.debug(line); break;
        case 'WARN':  this._logger.warn(line);  break;
        case 'ERROR': this._logger.error(line); break;
        default:      this._logger.info(line);  break;
      }
    };

    lines.forEach(line => {
      if (!line) return;
      const logbackMatch = logbackPattern.exec(line);
      if (logbackMatch) {
        // Server log lines carry their own level — use it directly.
        logAtLevel(logbackMatch[1].toUpperCase(), line);
      } else {
        // LSP trace lines (header + continuation) use the persisted block level.
        logAtLevel(this._currentBlockLevel, line);
      }
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
