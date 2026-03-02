import { MarkdownString, StatusBarAlignment, StatusBarItem, window } from 'vscode';
import { Disposable } from 'vscode-languageclient';

class StatusBar implements Disposable {
  private statusBarItem: StatusBarItem;

  constructor() {
    this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, Number.MIN_VALUE);
  }

  public showStatusBar(): void {
    this.statusBarItem.text = StatusIcon.Busy;
    this.statusBarItem.tooltip = StatusTooltip.Busy;
    this.statusBarItem.show();
  }

  public updateText(text: string): void {
    this.statusBarItem.text = text;
  }

  public setBusy(): void {
    this.statusBarItem.text = StatusIcon.Busy;
    this.statusBarItem.tooltip = StatusTooltip.Busy;
  }

  public setError(): void {
    this.statusBarItem.text = StatusIcon.Error;
    this.statusBarItem.tooltip = StatusTooltip.Error;
  }

  public setReady(version?: string): void {
    this.statusBarItem.text = StatusIcon.Ready;
    const tooltip = new MarkdownString(StatusTooltip.Ready);
    if (version) {
      tooltip.appendMarkdown(`\n\nVersion: ${version}`);
    }
    this.statusBarItem.tooltip = tooltip;
  }

  public updateTooltip(tooltip: string): void {
    this.statusBarItem.tooltip = tooltip;
  }

  public dispose(): void {
    this.statusBarItem.dispose();
  }
}

enum StatusIcon {
  Busy = '$(sync~spin) CQL',
  Ready = '$(check) CQL',
  Error = '$(error) CQL',
}

enum StatusTooltip {
  Busy = 'Server Busy',
  Ready = 'Server Ready',
  Error = 'Server Error',
}

export const statusBar: StatusBar = new StatusBar();
