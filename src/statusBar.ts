
import { StatusBarItem, window, StatusBarAlignment } from "vscode";
import { Disposable } from "vscode-languageclient";

class StatusBar implements Disposable {
	private statusBarItem: StatusBarItem;

	constructor() {
		this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, Number.MIN_VALUE);
	}

	public showStatusBar(): void {
		this.statusBarItem.text = StatusIcon.Busy;
		this.statusBarItem.tooltip = "";
		this.statusBarItem.show();
	}

	public updateText(text: string): void {
		this.statusBarItem.text = text;
	}

	public setBusy(): void {
		this.statusBarItem.text = StatusIcon.Busy;
	}

	public setError(): void {
		this.statusBarItem.text = StatusIcon.Error;
	}

	public setReady(): void {
		this.statusBarItem.text = StatusIcon.Ready;
	}

	public updateTooltip(tooltip: string): void {
		this.statusBarItem.tooltip = tooltip;
	}

	public dispose(): void {
		this.statusBarItem.dispose();
	}
}

enum StatusIcon {
	Busy = "$(sync~spin) CQL",
	Ready = "$(check) CQL",
	Error = "$(error) CQL"
}

export const statusBar: StatusBar = new StatusBar();