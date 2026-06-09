import * as path from 'path';
import {
  commands,
  debug,
  DecorationOptions,
  OverviewRulerLane,
  Position,
  Range,
  Selection,
  TextEditor,
  TextEditorDecorationType,
  TextEditorRevealType,
  ThemeColor,
  Uri,
  ViewColumn,
  window,
  workspace,
} from 'vscode';
import { ActiveSplitDebugHook, CqlSpan } from '../debug/types';
import { getElm } from '../cql-service/cqlService.getElm';
import * as log from '../log-services/logger';
import {
  AstLineIndex,
  buildAstLineIndex,
  buildLocatorKey,
  findNearestForwardLoc,
  sortAstBySourceOrder,
} from '../utils/astIndex';

export class SplitViewSession implements ActiveSplitDebugHook {
  private cqlUri: Uri;
  private currentCqlUri: Uri;
  private astEditor: TextEditor;
  private cqlEditor: TextEditor;
  private lineIndex: AstLineIndex;
  private astDecoration: TextEditorDecorationType;
  private cqlLineDecoration: TextEditorDecorationType;
  private cqlSpanDecoration: TextEditorDecorationType;
  private lastCqlRevealTime = 0;
  private lastAstRevealTime = 0;
  private disposed = false;
  private visibleRangesListener!: { dispose(): void };
  private selectionListener!: { dispose(): void };
  private closeListener!: { dispose(): void };
  private docSaveListener!: { dispose(): void };

  private constructor(
    cqlUri: Uri,
    currentCqlUri: Uri,
    cqlEditor: TextEditor,
    astEditor: TextEditor,
    lineIndex: AstLineIndex,
    astDecoration: TextEditorDecorationType,
    cqlLineDecoration: TextEditorDecorationType,
    cqlSpanDecoration: TextEditorDecorationType,
  ) {
    this.cqlUri = cqlUri;
    this.currentCqlUri = currentCqlUri;
    this.cqlEditor = cqlEditor;
    this.astEditor = astEditor;
    this.lineIndex = lineIndex;
    this.astDecoration = astDecoration;
    this.cqlLineDecoration = cqlLineDecoration;
    this.cqlSpanDecoration = cqlSpanDecoration;
  }

  static async create(
    cqlUri: Uri,
    fetcher: (uri: Uri, type: 'ast') => Promise<string> = getElm,
  ): Promise<SplitViewSession> {
    const astContent = await fetcher(cqlUri, 'ast');
    const sortedAst = sortAstBySourceOrder(astContent);
    const lineIndex = buildAstLineIndex(sortedAst);

    const cqlEditor = await window.showTextDocument(
      await workspace.openTextDocument(cqlUri), ViewColumn.One,
    );

    const astDoc = await workspace.openTextDocument({ language: 'ast', content: sortedAst });
    const astEditor = await window.showTextDocument(astDoc, ViewColumn.Two);

    const astDecoration = window.createTextEditorDecorationType({
      backgroundColor: new ThemeColor('editor.stackFrameHighlightBackground'),
      overviewRulerColor: new ThemeColor('editorError.foreground'),
      overviewRulerLane: OverviewRulerLane.Left,
      isWholeLine: true,
    });
    const cqlLineDecoration = window.createTextEditorDecorationType({
      backgroundColor: new ThemeColor('editor.findMatchHighlightBackground'),
      overviewRulerColor: new ThemeColor('editor.findMatchHighlightBackground'),
      overviewRulerLane: OverviewRulerLane.Center,
      isWholeLine: true,
    });
    const cqlSpanDecoration = window.createTextEditorDecorationType({
      backgroundColor: new ThemeColor('editor.findMatchBackground'),
      border: '1px solid',
      borderColor: new ThemeColor('editor.findMatchBorder'),
      overviewRulerColor: new ThemeColor('editor.findMatchBackground'),
      overviewRulerLane: OverviewRulerLane.Center,
      isWholeLine: false,
    });

    const session = new SplitViewSession(
      cqlUri, cqlUri, cqlEditor, astEditor, lineIndex,
      astDecoration, cqlLineDecoration, cqlSpanDecoration,
    );

    session.setupSyncListeners();
    session.catchUpToDebugger();

    return session;
  }

  // ─── ActiveSplitDebugHook implementation ───

  highlightCqlSpan(span: CqlSpan): void {
    this.lastAstRevealTime = performance.now();
    this.syncCqlToAstBySpan(span);
  }

  noteExternalReveal(): void {
    this.lastAstRevealTime = performance.now();
  }

  async swapLibrary(newCqlPath: string): Promise<boolean> {
    const newCqlUri = Uri.file(newCqlPath);

    let newAst: string;
    try {
      newAst = await getElm(newCqlUri, 'ast');
    } catch (error) {
      log.debug(`swapLibrary: getElm failed for ${newCqlPath}: ${error}`);
      window.showWarningMessage(
        `CQL debugger: could not load AST for ${path.basename(newCqlPath)}`,
      );
      return false;
    }

    const newSorted = sortAstBySourceOrder(newAst);
    this.lineIndex = buildAstLineIndex(newSorted);
    await this.replaceDocumentContent(this.astEditor, newSorted);

    const newCqlDoc = await workspace.openTextDocument(newCqlUri);
    const newCqlEditor = await window.showTextDocument(
      newCqlDoc,
      { viewColumn: this.cqlEditor.viewColumn, preserveFocus: true, preview: false },
    );

    this.teardownListeners();
    this.cqlEditor = newCqlEditor;
    this.currentCqlUri = newCqlUri;
    this.setupSyncListeners();

    return true;
  }

  // ─── Lifecycle ───

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.teardownListeners();
    this.closeListener.dispose();
    this.docSaveListener.dispose();
    this.cqlLineDecoration.dispose();
    this.cqlSpanDecoration.dispose();
    this.astDecoration.dispose();
    AstSplitSessionManager.clearSession();
  }

  // ─── Private sync helpers ───

  private syncCqlToAst(cqlLine?: number): void {
    const effectiveLine = cqlLine ?? this.cqlEditor.visibleRanges[0]?.start.line;
    if (effectiveLine === undefined) return;

    const astLines = this.lineIndex.cqlToAstLines.get(effectiveLine);
    if (!astLines || astLines.length === 0) {
      this.astEditor.setDecorations(this.astDecoration, []);
      return;
    }
    this.applyAstHighlight(astLines, this.astEditor, this.astDecoration);
  }

  private syncAstToCql(astLine?: number): void {
    const effectiveLine = astLine ?? this.astEditor.visibleRanges[0]?.start.line;
    if (effectiveLine === undefined) return;

    const loc = findNearestForwardLoc(this.lineIndex, effectiveLine);

    if (!loc) {
      this.cqlEditor.setDecorations(this.cqlLineDecoration, []);
      this.cqlEditor.setDecorations(this.cqlSpanDecoration, []);
      return;
    }

    const start = new Position(loc.startLine - 1, loc.startCol - 1);
    const end = new Position(loc.endLine - 1, loc.endCol);
    const vsRange = new Range(start, end);

    const cqlVisibleRanges = this.cqlEditor.visibleRanges;
    if (cqlVisibleRanges.length > 0) {
      const cqlTop = cqlVisibleRanges[0].start.line;
      const cqlBottom = cqlVisibleRanges[cqlVisibleRanges.length - 1].end.line;
      if (start.line >= cqlTop && end.line <= cqlBottom) {
        this.cqlEditor.selection = new Selection(start, end);
        this.cqlEditor.setDecorations(this.cqlLineDecoration, [new Range(loc.startLine - 1, 0, loc.endLine - 1, 0)]);
        this.cqlEditor.setDecorations(this.cqlSpanDecoration, [{ range: vsRange } as DecorationOptions]);
        return;
      }
    }

    this.cqlEditor.revealRange(vsRange, TextEditorRevealType.InCenterIfOutsideViewport);
    this.cqlEditor.selection = new Selection(start, end);
    this.cqlEditor.setDecorations(this.cqlLineDecoration, [new Range(loc.startLine - 1, 0, loc.endLine - 1, 0)]);
    this.cqlEditor.setDecorations(this.cqlSpanDecoration, [{ range: vsRange } as DecorationOptions]);
  }

  private applyAstHighlight(
    astLines: number[],
    astEditor: TextEditor,
    astDecoration: TextEditorDecorationType,
  ): void {
    if (astLines.length === 0) {
      astEditor.setDecorations(astDecoration, []);
      return;
    }

    const targetAstLine = Math.min(...astLines);
    const endAstLine = Math.max(...astLines);

    const astVisibleRanges = astEditor.visibleRanges;
    if (astVisibleRanges.length > 0) {
      const astTop = astVisibleRanges[0].start.line;
      const astBottom = astVisibleRanges[astVisibleRanges.length - 1].end.line;
      if (targetAstLine >= astTop && targetAstLine <= astBottom) {
        astEditor.setDecorations(
          astDecoration,
          astLines.map(l => new Range(l, 0, l, 0)),
        );
        return;
      }
    }

    astEditor.revealRange(
      new Range(targetAstLine, 0, endAstLine, 0),
      TextEditorRevealType.InCenterIfOutsideViewport,
    );
    astEditor.setDecorations(
      astDecoration,
      astLines.map(l => new Range(l, 0, l, 0)),
    );
  }

  private syncCqlToAstBySpan(span: CqlSpan): void {
    let astLines: number[] | undefined;

    if (span.localId) {
      astLines = this.lineIndex.localIdToAstLines.get(span.localId);
    }
    if (!astLines || astLines.length === 0) {
      const key = buildLocatorKey(span.line, span.column, span.endLine, span.endColumn);
      astLines = this.lineIndex.locatorToAstLines.get(key);
    }
    if (!astLines || astLines.length === 0) {
      astLines = this.lineIndex.cqlToAstLines.get(span.line - 1);
    }
    if (!astLines || astLines.length === 0) {
      this.astEditor.setDecorations(this.astDecoration, []);
      return;
    }
    this.applyAstHighlight(astLines, this.astEditor, this.astDecoration);
  }

  // ─── Private lifecycle helpers ───

  private setupSyncListeners(): void {
    this.visibleRangesListener = window.onDidChangeTextEditorVisibleRanges(e => {
      const now = performance.now();
      if (e.textEditor === this.cqlEditor) {
        if (now - this.lastAstRevealTime < 100) return;
        this.lastCqlRevealTime = now;
        this.syncCqlToAst();
      } else if (e.textEditor === this.astEditor) {
        if (now - this.lastCqlRevealTime < 100) return;
        this.lastAstRevealTime = now;
        this.syncAstToCql();
      }
    });

    this.selectionListener = window.onDidChangeTextEditorSelection(e => {
      const now = performance.now();
      if (e.textEditor === this.cqlEditor) {
        if (now - this.lastAstRevealTime < 100) return;
        this.lastCqlRevealTime = now;
        this.syncCqlToAst(e.selections[0].active.line);
      } else if (e.textEditor === this.astEditor) {
        if (now - this.lastCqlRevealTime < 100) return;
        this.lastAstRevealTime = now;
        this.syncAstToCql(e.selections[0].active.line);
      }
    });

    this.docSaveListener = workspace.onDidSaveTextDocument(async saved => {
      if (saved.uri.toString() !== this.currentCqlUri.toString()) return;
      if (this.disposed) return;
      try {
        const newAst = await getElm(this.currentCqlUri, 'ast');
        const newSorted = sortAstBySourceOrder(newAst);
        this.lineIndex = buildAstLineIndex(newSorted);
        await this.replaceDocumentContent(this.astEditor, newSorted);
      } catch (error) {
        log.debug(`Failed to refresh AST after save: ${error}`);
      }
    });

    this.closeListener = window.onDidChangeVisibleTextEditors(editors => {
      if (!editors.includes(this.cqlEditor) || !editors.includes(this.astEditor)) {
        if (this.disposed) return;
        this.dispose();
      }
    });
  }

  private teardownListeners(): void {
    this.visibleRangesListener?.dispose();
    this.selectionListener?.dispose();
  }

  private async replaceDocumentContent(editor: TextEditor, content: string): Promise<boolean> {
    const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
    return (await editor.edit(edit =>
      edit.replace(new Range(0, 0, lastLine.lineNumber, lastLine.text.length), content),
    )) ?? false;
  }

  private async catchUpToDebugger(): Promise<void> {
    const session = debug.activeDebugSession;
    if (!session || session.type !== 'cql') return;
    try {
      const threadsResp = await session.customRequest('threads');
      const threads: any[] = threadsResp?.threads ?? [];
      for (const thread of threads) {
        if (thread.id === undefined) continue;
        try {
          const resp = await session.customRequest('stackTrace', {
            threadId: thread.id,
            startFrame: 0,
            levels: 1,
          });
          const top = resp?.stackFrames?.[0];
          if (top && typeof top.line === 'number') {
            this.highlightCqlSpan({
              line: top.line,
              column: top.column ?? 1,
              endLine: top.endLine ?? top.line,
              endColumn: top.endColumn ?? top.column ?? 1,
              ...(top.instructionPointerReference ? { localId: top.instructionPointerReference } : {}),
            });
            return;
          }
        } catch { /* try next thread */ }
      }
    } catch { /* session ended */ }
  }
}

export class AstSplitSessionManager {
  private static activeSession: SplitViewSession | undefined;

  static getActiveSession(): ActiveSplitDebugHook | undefined {
    return AstSplitSessionManager.activeSession;
  }

  static async createOrUpdateSession(cqlUri: Uri): Promise<ActiveSplitDebugHook> {
    AstSplitSessionManager.activeSession?.dispose();
    const session = await SplitViewSession.create(cqlUri);
    AstSplitSessionManager.activeSession = session;
    return session;
  }

  static clearSession(): void {
    AstSplitSessionManager.activeSession = undefined;
  }
}
