import * as vscode from 'vscode';
import { getActiveSplitDebugHook } from '../commands/view-elm';

let lastStoppedThreadId: number | undefined;

export class CqlDebugAstTrackerFactory implements vscode.DebugAdapterTrackerFactory {
  createDebugAdapterTracker(session: vscode.DebugSession): vscode.DebugAdapterTracker {
    return {
      onDidSendMessage: async (message: any) => {
        if (!message || typeof message !== 'object') return;

        if (message.type === 'event' && message.event === 'stopped') {
          lastStoppedThreadId = message.body?.threadId;
          await syncFromStackTrace(session, lastStoppedThreadId);
          return;
        }

        if (
          message.type === 'response' &&
          message.command === 'stackTrace' &&
          message.success &&
          Array.isArray(message.body?.stackFrames) &&
          message.body.stackFrames.length > 0
        ) {
          applyTopFrame(message.body.stackFrames[0]);
        }
      },
    };
  }
}

async function syncFromStackTrace(
  session: vscode.DebugSession,
  threadId: number | undefined,
): Promise<void> {
  if (threadId === undefined) return;
  try {
    const resp = await session.customRequest('stackTrace', {
      threadId,
      startFrame: 0,
      levels: 1,
    });
    const top = resp?.stackFrames?.[0];
    if (top) applyTopFrame(top);
  } catch {
    // Session may have ended between stopped event and our request.
  }
}

function applyTopFrame(frame: { line?: number }): void {
  const hook = getActiveSplitDebugHook();
  if (!hook) return;
  if (typeof frame.line !== 'number') return;
  hook.highlightCqlLine(frame.line - 1);
}
