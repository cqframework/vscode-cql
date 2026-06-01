import * as vscode from 'vscode';

type Granularity = 'cql' | 'ast';
const sessionGranularity = new WeakMap<vscode.DebugSession, Granularity>();

let statusItem: vscode.StatusBarItem | undefined;

export function activateStepGranularityToggle(context: vscode.ExtensionContext) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusItem.command = 'cql.debug.toggle-step-granularity';
  context.subscriptions.push(statusItem);

  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((s) => {
      if (s.type !== 'cql') return;
      const initial: Granularity = (s.configuration.stepGranularity as Granularity) ?? 'cql';
      sessionGranularity.set(s, initial);
      refresh(s);
    }),
    vscode.debug.onDidTerminateDebugSession(() => refresh(vscode.debug.activeDebugSession)),
    vscode.debug.onDidChangeActiveDebugSession((s) => refresh(s)),
    vscode.commands.registerCommand('cql.debug.toggle-step-granularity', async () => {
      const s = vscode.debug.activeDebugSession;
      if (!s || s.type !== 'cql') return;
      const current = sessionGranularity.get(s) ?? 'cql';
      const next: Granularity = current === 'cql' ? 'ast' : 'cql';
      await s.customRequest('setStepGranularity', { granularity: next });
      sessionGranularity.set(s, next);
      refresh(s);
    }),
  );
}

function refresh(s: vscode.DebugSession | undefined) {
  if (!statusItem) return;
  if (!s || s.type !== 'cql') { statusItem.hide(); return; }
  const g = sessionGranularity.get(s) ?? 'cql';
  statusItem.text = `Step: ${g.toUpperCase()}`;
  statusItem.tooltip = 'Click to toggle CQL ↔ AST stepping';
  statusItem.show();
}