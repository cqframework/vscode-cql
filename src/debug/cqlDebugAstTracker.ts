import * as vscode from 'vscode';
import * as log from '../log-services/logger';
import { getControllerInstance } from './cqlAstDebugViewController';

let lastStoppedThreadId: number | undefined;

export class CqlDebugAstTrackerFactory implements vscode.DebugAdapterTrackerFactory {
  createDebugAdapterTracker(session: vscode.DebugSession): vscode.DebugAdapterTracker {
    return {
      onDidSendMessage: async (message: any) => {
        if (!message || typeof message !== 'object') return;

        if (message.type === 'event' && message.event === 'terminated') {
          log.debug('DAP terminated event received');
          return;
        }
        if (message.type === 'event' && message.event === 'exited') {
          log.debug('DAP exited event received', { exitCode: message.body?.exitCode });
          return;
        }

        if (message.type === 'event' && message.event === 'stopped') {
          lastStoppedThreadId = message.body?.threadId;
          log.debug('DAP stopped event received threadId={}', lastStoppedThreadId);
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
    log.debug('syncFromStackTrace: threadId={} topFrame={}', threadId, top ? {
      line: top.line, column: top.column, source: top.source?.path, localId: top.instructionPointerReference,
    } : null);
    if (top) await applyTopFrame(top, session);
  } catch (e) {
    log.debug('syncFromStackTrace: error threadId={} err={}', threadId, e);
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
  const controller = getControllerInstance();
  if (!controller) {
    log.debug('applyTopFrame: no controller instance');
    return;
  }
  if (typeof frame.line !== 'number') {
    log.debug('applyTopFrame: no line in frame');
    return;
  }

  const sourcePath = frame.source?.path;
  if (sourcePath && !sourcePath.toLowerCase().endsWith('.cql')) {
    log.debug('applyTopFrame: non-CQL source path={}', sourcePath);
    return;
  }

  log.debug('applyTopFrame: sourcePath={} line={}', sourcePath, frame.line);
  await controller.onFrameStopped(frame, session);
}
