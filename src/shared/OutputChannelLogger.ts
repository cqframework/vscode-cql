import * as vscode from 'vscode';

export class OutputChannelLogger {
  public readonly channel: vscode.LogOutputChannel;

  constructor(channelName: string) {
    this.channel = vscode.window.createOutputChannel(channelName, { log: true });
  }

  public log(message: string): void {
    this.channel.appendLine(message);
  }

  public debug(message: string): void {
    this.channel.debug(message);
  }

  public error(message: string, error: unknown) {
    if (error instanceof Error) {
      this.channel.error(`${message} err: ${error.message}`);
    } else {
      this.channel.error('An unknown error occurred');
    }
  }

  public info(message: string): void {
    this.channel.info(message);
  }

  public warn(message: string): void {
    this.channel.warn(message);
  }

  public dispose(): void {
    this.channel.dispose();
  }
}
