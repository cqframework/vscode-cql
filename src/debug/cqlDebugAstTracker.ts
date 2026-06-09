import * as vscode from 'vscode';
import * as log from '../log-services/logger';
import { AstSplitSessionManager } from '../views/astSplitSession';

let lastStoppedThreadId: number | undefined;
let activeCqlPath: string | undefined;

export class CqlDebugAstTrackerFactory implements vscode.DebugAdapterTrackerFactory {
  createDebugAdapterTracker(session: vscode.DebugSession): vscode.DebugAdapterTracker {
    return {
      onDidSendMessage: async (message: any) => {
        if (!message || typeof message !== 'object') return;

        if (message.type === 'event' && message.event === 'terminated') {
          log.debug('DAP terminated event received');
          activeCqlPath = undefined;
          return;
        }
        if (message.type === 'event' && message.event === 'exited') {
          log.debug('DAP exited event received', { exitCode: message.body?.exitCode });
          activeCqlPath = undefined;
          return;
        }

        if (message.type === 'event' && message.event === 'stopped') {
          lastStoppedThreadId = message.body?.threadId;
          await syncFromStackTrace(session, lastStoppedThreadId);
          log.debug('DAP stopped event received');
          return;
        }

        if (
          message.type === 'response' &&
          message.command === 'stackTrace' &&
          message.success &&
          Array.isArray(message.body?.stackFrames) &&
          message.body.stackFrames.length > 0
        ) {
          await applyTopFrame(message.body.stackFrames[0], session);
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
    if (top) await applyTopFrame(top, session);
  } catch {
    // Session may have ended between stopped event and our request.
  }
}

async function applyTopFrame(
  frame: {
    line?: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
    instructionPointerReference?: string;
    source?: { path?: string };
  },
  session: vscode.DebugSession,
): Promise<void> {
  const hook = AstSplitSessionManager.getActiveSession();
  if (!hook) return;
  if (typeof frame.line !== 'number') return;

  const sourcePath = frame.source?.path;
  if (sourcePath && !sourcePath.toLowerCase().endsWith('.cql')) return;

  if (sourcePath && sourcePath !== activeCqlPath) {
    const swapped = await hook.swapLibrary(sourcePath);
    if (!swapped) return; // swap failed — don't highlight stale content
    activeCqlPath = sourcePath;
  }

  hook.highlightCqlSpan({
    line: frame.line,
    column: frame.column ?? 1,
    endLine: frame.endLine ?? frame.line,
    endColumn: frame.endColumn ?? frame.column ?? 1,
    ...(frame.instructionPointerReference ? { localId: frame.instructionPointerReference } : {}),
  });
}
