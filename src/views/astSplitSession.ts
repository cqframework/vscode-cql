import {
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
import { getElm } from '../cql-service/cqlService.getElm';
import * as log from '../log-services/logger';
import {
  AstLineIndex,
  buildAstLineIndex,
  findNearestForwardLoc,
  sortAstBySourceOrder,
} from '../utils/astIndex';

export class SplitViewSession {
  private cqlUri: Uri;
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
  private fetcher: (uri: Uri, type: 'ast') => Promise<string>;

  private constructor(
    cqlUri: Uri,
    cqlEditor: TextEditor,
    astEditor: TextEditor,
    lineIndex: AstLineIndex,
    astDecoration: TextEditorDecorationType,
    cqlLineDecoration: TextEditorDecorationType,
    cqlSpanDecoration: TextEditorDecorationType,
    fetcher: (uri: Uri, type: 'ast') => Promise<string>,
  ) {
    this.cqlUri = cqlUri;
    this.cqlEditor = cqlEditor;
    this.astEditor = astEditor;
    this.lineIndex = lineIndex;
    this.astDecoration = astDecoration;
    this.cqlLineDecoration = cqlLineDecoration;
    this.cqlSpanDecoration = cqlSpanDecoration;
    this.fetcher = fetcher;
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
      cqlUri, cqlEditor, astEditor, lineIndex,
      astDecoration, cqlLineDecoration, cqlSpanDecoration,
      fetcher,
    );

    session.setupSyncListeners();

    return session;
  }

  // ─── Lifecycle ───

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.teardownListeners();
    this.cqlLineDecoration.dispose();
    this.cqlSpanDecoration.dispose();
    this.astDecoration.dispose();
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
      if (saved.uri.toString() !== this.cqlUri.toString()) return;
      if (this.disposed) return;
      try {
        const newAst = await this.fetcher(this.cqlUri, 'ast');
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
    this.closeListener?.dispose();
    this.docSaveListener?.dispose();
  }

  private async replaceDocumentContent(editor: TextEditor, content: string): Promise<boolean> {
    const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
    const ok = (await editor.edit(edit =>
      edit.replace(new Range(0, 0, lastLine.lineNumber, lastLine.text.length), content),
    )) ?? false;
    log.debug('replaceDocumentContent: success={} uri={} ({} lines replaced)',
      ok, editor.document.uri.toString(), content.split('\n').length);
    return ok;
  }

}

export class AstSplitSessionManager {
  private static activeSession: SplitViewSession | undefined;

  static async createOrUpdateSession(
    cqlUri: Uri,
    fetcher?: (uri: Uri, type: 'ast') => Promise<string>,
  ): Promise<void> {
    AstSplitSessionManager.activeSession?.dispose();
    AstSplitSessionManager.activeSession = await SplitViewSession.create(cqlUri, fetcher);
  }

  static clearSession(): void {
    AstSplitSessionManager.activeSession = undefined;
  }
}
