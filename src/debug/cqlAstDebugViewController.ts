import {
  commands,
  debug,
  DecorationOptions,
  Disposable,
  ExtensionContext,
  Position,
  Range,
  Selection,
  TextEditorRevealType,
  ThemeColor,
  ThemeIcon,
  Uri,
  window,
  workspace,
} from 'vscode';
import { CqlSpan, normalizeSpan } from './types';
import { CqlAstNode, CqlAstIndex, parseAstToTree } from './cqlAstTreeNode';
import { CqlAstTreeDataProvider } from './cqlAstTreeDataProvider';
import { fetchAstViaDap } from './debugAstFetcher';
import { hasFullCoordinates } from '../utils/astIndex';
import * as log from '../log-services/logger';

let _instance: CqlAstDebugViewController | undefined;

export function getControllerInstance(): CqlAstDebugViewController | undefined {
  return _instance;
}

export function activateController(context: ExtensionContext): CqlAstDebugViewController {
  _instance?.dispose();
  _instance = new CqlAstDebugViewController(context);
  return _instance;
}

interface DapFrame {
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  instructionPointerReference?: string;
  source?: { path?: string };
}

export class CqlAstDebugViewController implements Disposable {
  private provider: CqlAstTreeDataProvider;
  private treeView: ReturnType<typeof window.createTreeView<CqlAstNode>>;
  private lineDecoration: ReturnType<typeof window.createTextEditorDecorationType>;
  private spanDecoration: ReturnType<typeof window.createTextEditorDecorationType>;
  private cqlIndex: CqlAstIndex;
  private activeCqlPath: string | undefined;
  private activeNodeId: string | undefined;
  private disposables: Disposable[] = [];

  constructor(context: ExtensionContext) {
    this.provider = new CqlAstTreeDataProvider();
    this.cqlIndex = { nodeById: new Map(), localIdToNodeId: new Map(), locatorToNodeId: new Map(), cqlLineToNodeIds: new Map() };
    this.activeCqlPath = undefined;
    this.activeNodeId = undefined;

    this.treeView = window.createTreeView('cql.debug.ast', {
      treeDataProvider: this.provider,
      showCollapseAll: true,
      canSelectMany: false,
    });

    this.lineDecoration = window.createTextEditorDecorationType({
      backgroundColor: new ThemeColor('editor.findMatchHighlightBackground'),
      isWholeLine: true,
    });

    this.spanDecoration = window.createTextEditorDecorationType({
      backgroundColor: new ThemeColor('editor.findMatchBackground'),
      border: '1px solid',
      borderColor: new ThemeColor('editor.findMatchBorder'),
    });

    const revealCmd = commands.registerCommand('cql.debug.ast.reveal-cql', this.onRevealCql, this);
    context.subscriptions.push(revealCmd);
    this.disposables.push(revealCmd);

    this.disposables.push(
      this.treeView.onDidChangeVisibility(e => {
        if (e.visible) this.onViewVisible();
      }),
    );

    const startSession = debug.onDidStartDebugSession(s => {
      if (s.type !== 'cql') return;
      commands.executeCommand('setContext', 'cql.debug.active', true);
      this.provider.setLoading();
    });
    context.subscriptions.push(startSession);
    this.disposables.push(startSession);

    const endSession = debug.onDidTerminateDebugSession(s => {
      if (s.type !== 'cql') return;
      this.onSessionEnd();
    });
    context.subscriptions.push(endSession);
    this.disposables.push(endSession);

    this.maybeAttachToExistingSession();
  }

  async onFrameStopped(
    frame: DapFrame,
    _session: import('vscode').DebugSession,
  ): Promise<void> {
    const span = normalizeSpan(frame);
    const sourcePath = frame.source?.path;

    if (!sourcePath || !sourcePath.toLowerCase().endsWith('.cql')) {
      log.debug('cqlAstVC: non-CQL source path={}', sourcePath);
      return;
    }

    if (sourcePath !== this.activeCqlPath) {
      try {
        await this.loadAst(sourcePath);
        this.activeCqlPath = sourcePath;
      } catch (e) {
        log.debug('cqlAstVC: loadAst failed for {} err={}', sourcePath, e);
        this.provider.setEmpty(`Could not load AST for ${sourcePath}`);
        return;
      }
    }

    this.resolveAndReveal(span);
    await this.applyCqlDecoration(span);
  }

  dispose(): void {
    this.treeView.dispose();
    this.lineDecoration.dispose();
    this.spanDecoration.dispose();
    for (const d of this.disposables) {
      try { d.dispose(); } catch { /* noop */ }
    }
    this.provider.setEmpty();
  }

  private async loadAst(cqlPath: string): Promise<void> {
    const uri = Uri.file(cqlPath);
    log.debug('cqlAstVC: fetching AST for {}', cqlPath);
    const astContent = await fetchAstViaDap(uri, 'ast');
    const { roots, index } = parseAstToTree(astContent);
    this.cqlIndex = index;
    this.provider.setData(roots);
    log.debug('cqlAstVC: AST loaded with {} root nodes', roots.length);
  }

  private resolveAndReveal(span: CqlSpan): void {
    const nodeId = this.resolveSpanToNodeId(span);
    if (!nodeId) {
      log.debug('cqlAstVC: no nodeId resolved for span={}', span);
      return;
    }

    const node = this.cqlIndex.nodeById.get(nodeId);
    if (!node) {
      log.debug('cqlAstVC: node not found for id={}', nodeId);
      return;
    }

    this.activeNodeId = nodeId;
    this.provider.setActiveNodeId(nodeId);
    try {
      this.treeView.reveal(node, { expand: true, select: true, focus: false });
    } catch (e) {
      log.debug('cqlAstVC: reveal failed for id={} err={}', nodeId, e);
    }
  }

  private resolveSpanToNodeId(span: CqlSpan): string | undefined {
    if (span.localId) {
      const id = this.cqlIndex.localIdToNodeId.get(span.localId);
      if (id) {
        log.debug('cqlAstVC: resolved via localId={} -> id={}', span.localId, id);
        return id;
      }
    }

    if (hasFullCoordinates(span)) {
      const key = `${span.line}:${span.column}-${span.endLine}:${span.endColumn}`;
      const id = this.cqlIndex.locatorToNodeId.get(key);
      if (id) {
        log.debug('cqlAstVC: resolved via locator key={} -> id={}', key, id);
        return id;
      }
    }

    const ids = this.cqlIndex.cqlLineToNodeIds.get(span.line - 1);
    if (ids && ids.length > 0) {
      log.debug('cqlAstVC: resolved via cqlLine={} -> id={}', span.line - 1, ids[0]);
      return ids[0];
    }

    log.debug('cqlAstVC: no resolution for span={}', span);
    return undefined;
  }

  private async applyCqlDecoration(span: CqlSpan): Promise<void> {
    const cqlPath = this.activeCqlPath;
    if (!cqlPath) return;

    let editor = window.visibleTextEditors.find(
      e => e.document.uri.fsPath === cqlPath,
    );

    if (!editor) {
      try {
        const doc = await workspace.openTextDocument(Uri.file(cqlPath));
        editor = await window.showTextDocument(doc, { preserveFocus: true, preview: false });
      } catch (e) {
        log.debug('cqlAstVC: could not open CQL editor for {} err={}', cqlPath, e);
        return;
      }
    }

    const start = new Position(span.line - 1, span.column - 1);
    const end = new Position(span.endLine - 1, span.endColumn);
    const vsRange = new Range(start, end);

    editor.setDecorations(this.lineDecoration, [
      new Range(span.line - 1, 0, span.endLine - 1, 0),
    ]);
    editor.setDecorations(this.spanDecoration, [
      { range: vsRange } as DecorationOptions,
    ]);
    editor.revealRange(vsRange, TextEditorRevealType.InCenterIfOutsideViewport);
    editor.selection = new Selection(start, end);
  }

  private clearCqlDecoration(): void {
    for (const editor of window.visibleTextEditors) {
      editor.setDecorations(this.lineDecoration, []);
      editor.setDecorations(this.spanDecoration, []);
    }
  }

  private async onRevealCql(node: CqlAstNode): Promise<void> {
    if (!node.loc) {
      log.debug('cqlAstVC: onRevealCql: node has no loc id={}', node.id);
      return;
    }

    const cqlPath = this.activeCqlPath;
    if (!cqlPath) {
      log.debug('cqlAstVC: onRevealCql: no activeCqlPath');
      return;
    }

    let editor = window.visibleTextEditors.find(
      e => e.document.uri.fsPath === cqlPath,
    );

    if (!editor) {
      try {
        const doc = await workspace.openTextDocument(Uri.file(cqlPath));
        editor = await window.showTextDocument(doc, { preserveFocus: true, preview: false });
      } catch (e) {
        log.debug('cqlAstVC: onRevealCql: could not open editor err={}', e);
        return;
      }
    }

    const start = new Position(node.loc.startLine - 1, node.loc.startCol - 1);
    const end = new Position(node.loc.endLine - 1, node.loc.endCol);
    const vsRange = new Range(start, end);

    editor.setDecorations(this.lineDecoration, [
      new Range(node.loc.startLine - 1, 0, node.loc.endLine - 1, 0),
    ]);
    editor.setDecorations(this.spanDecoration, [
      { range: vsRange } as DecorationOptions,
    ]);
    editor.revealRange(vsRange, TextEditorRevealType.InCenterIfOutsideViewport);
    editor.selection = new Selection(start, end);

    this.provider.setActiveNodeId(node.id);
    this.activeNodeId = node.id;
  }

  private onViewVisible(): void {
    if (this.activeNodeId && this.provider.roots.length > 0) {
      const node = this.cqlIndex.nodeById.get(this.activeNodeId);
      if (node) {
        try {
          this.treeView.reveal(node, { expand: true, select: true, focus: false });
        } catch (e) {
          log.debug('cqlAstVC: onViewVisible reveal failed err={}', e);
        }
      }
    }
  }

  private onSessionEnd(): void {
    commands.executeCommand('setContext', 'cql.debug.active', false);
    this.activeCqlPath = undefined;
    this.activeNodeId = undefined;
    this.cqlIndex = { nodeById: new Map(), localIdToNodeId: new Map(), locatorToNodeId: new Map(), cqlLineToNodeIds: new Map() };
    this.provider.setEmpty();
    this.clearCqlDecoration();
  }

  private async maybeAttachToExistingSession(): Promise<void> {
    const session = debug.activeDebugSession;
    if (!session || session.type !== 'cql') {
      return;
    }

    commands.executeCommand('setContext', 'cql.debug.active', true);
    this.provider.setLoading();

    try {
      const resp = await session.customRequest('stackTrace', {
        threadId: 1,
        startFrame: 0,
        levels: 1,
      });
      const top = resp?.stackFrames?.[0];
      if (top && typeof top.line === 'number') {
        log.debug('cqlAstVC: mid-session attach: detected frame at line={}', top.line);
        await this.onFrameStopped(top, session);
      } else {
        this.provider.setEmpty('No active frame');
      }
    } catch (e) {
      log.debug('cqlAstVC: mid-session attach: stackTrace failed err={}', e);
      this.provider.setEmpty('Debug session active but no frame available');
    }
  }
}
