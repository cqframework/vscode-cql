import {
  commands,
  debug,
  DecorationOptions,
  ExtensionContext,
  OverviewRulerLane,
  Position,
  Range,
  Selection,
  TextDocument,
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
import { Commands } from './commands';

const LOC_REGEX = /\[.*?loc=(\d+):(\d+)(?:-(\d+):(\d+))?\]/;

export function buildLocatorKey(
  line: number, col: number, endLine: number, endCol: number,
): string {
  return `${line}:${col}-${endLine}:${endCol}`;
}

export interface CqlSpan {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

let activeSplitSession:
  | { dispose: () => void; astEditor: TextEditor; cqlUri: string }
  | undefined;

export interface ActiveSplitDebugHook {
  highlightCqlSpan(span: CqlSpan): void;
  noteExternalReveal(): void;
}

let activeSplitDebugHook: ActiveSplitDebugHook | undefined;

export function getActiveSplitDebugHook(): ActiveSplitDebugHook | undefined {
  return activeSplitDebugHook;
}

const openAstDocs = new Map<string, TextDocument>();

export interface AstLoc {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface AstLineIndex {
  astToCqlLoc: Map<number, AstLoc>;
  cqlToAstLines: Map<number, number[]>;
  locatorToAstLines: Map<string, number[]>;
}

export function register(context: ExtensionContext): void {
  context.subscriptions.push(
    commands.registerCommand(Commands.VIEW_ELM_COMMAND_XML, async (uri: Uri) => {
      viewElm(uri, 'xml');
    }),
    commands.registerCommand(Commands.VIEW_ELM_COMMAND_JSON, async (uri: Uri) => {
      viewElm(uri, 'json');
    }),
    commands.registerCommand(Commands.VIEW_ELM_COMMAND_AST, async (uri: Uri) => {
      viewElm(uri, 'ast');
    }),
    commands.registerCommand(Commands.VIEW_ELM_COMMAND_AST_SPLIT, async (uri: Uri) => {
      await viewElmSplit(uri);
    }),
    workspace.onDidCloseTextDocument(doc => {
      for (const [key, tracked] of openAstDocs) {
        if (tracked === doc) {
          openAstDocs.delete(key);
          break;
        }
      }
    }),
  );
}

export async function viewElm(
  cqlFileUri: Uri,
  elmType: 'xml' | 'json' | 'ast' = 'xml',
  elmFetcher: (uri: Uri, type: 'xml' | 'json' | 'ast') => Promise<string> = getElm,
) {
  try {
    log.debug(`attempting to get ELM from [${cqlFileUri}] as ${elmType}`);
    const elm: string = await elmFetcher(cqlFileUri, elmType);
    const languageId = elmType === 'ast' ? 'ast' : elmType;
    const formatted = elmType === 'json' ? formatJson(elm) : elm;
    if (elmType === 'ast') {
      const uriKey = cqlFileUri.toString();
      const existing = openAstDocs.get(uriKey);
      let reused = false;
      if (existing && !existing.isClosed) {
        try {
          const editor = await window.showTextDocument(existing);
          reused = await replaceDocumentContent(editor, formatted);
          if (!reused) {
            openAstDocs.delete(uriKey);
          }
        } catch {
          openAstDocs.delete(uriKey);
        }
      }
      if (!reused) {
        const doc = await workspace.openTextDocument({ language: 'ast', content: formatted });
        openAstDocs.set(uriKey, doc);
        await window.showTextDocument(doc);
      }
      return;
    }
    const doc = await workspace.openTextDocument({ language: languageId, content: formatted });
    await window.showTextDocument(doc);
    if (elmType === 'xml') {
      await commands.executeCommand('editor.action.formatDocument');
    }
  } catch (error) {
    window.showErrorMessage(`Error while converting ${cqlFileUri.fsPath} to ELM. err: ${error}`);
  }
}

export function buildAstLineIndex(astContent: string): AstLineIndex {
  const astToCqlLoc = new Map<number, AstLoc>();
  const cqlToAstLines = new Map<number, number[]>();
  const locatorToAstLines = new Map<string, number[]>();

  const lines = astContent.split('\n');
  for (let astLine = 0; astLine < lines.length; astLine++) {
    const match = lines[astLine].match(LOC_REGEX);
    if (!match) continue;

    const loc: AstLoc = {
      startLine: parseInt(match[1], 10),
      startCol: parseInt(match[2], 10),
      endLine: match[3] ? parseInt(match[3], 10) : parseInt(match[1], 10),
      endCol: match[4] ? parseInt(match[4], 10) : parseInt(match[2], 10),
    };

    astToCqlLoc.set(astLine, loc);

    for (let cqlLine = loc.startLine; cqlLine <= loc.endLine; cqlLine++) {
      const cqlIndex = cqlLine - 1;
      const existing = cqlToAstLines.get(cqlIndex) ?? [];
      existing.push(astLine);
      cqlToAstLines.set(cqlIndex, existing);
    }

    const locKey = buildLocatorKey(loc.startLine, loc.startCol, loc.endLine, loc.endCol);
    const existing2 = locatorToAstLines.get(locKey) ?? [];
    existing2.push(astLine);
    locatorToAstLines.set(locKey, existing2);
  }

  return { astToCqlLoc, cqlToAstLines, locatorToAstLines };
}

export function sortAstBySourceOrder(astContent: string): string {
  const lines = astContent.split('\n');
  if (lines.length <= 1) return astContent;

  const rootLine = lines[0];

  interface AstSegment {
    lines: string[];
    cqlLine: number;
  }

  const segments: AstSegment[] = [];
  let current: string[] = [];

  function commitSegment(segLines: string[]) {
    const first = segLines[0];
    const m = first.match(LOC_REGEX);
    segments.push({
      lines: segLines,
      cqlLine: m ? parseInt(m[1], 10) : -1,
    });
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const isTopLevel = /^[├└]──/.test(line);
    if (isTopLevel && current.length > 0) {
      commitSegment(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) commitSegment(current);

  const sortableSegs = segments.filter(s => s.cqlLine > 0);
  const otherSegs = segments.filter(s => s.cqlLine <= 0);
  sortableSegs.sort((a, b) => a.cqlLine - b.cqlLine);
  const ordered = [...otherSegs, ...sortableSegs];

  const result: string[] = [rootLine];
  for (let i = 0; i < ordered.length; i++) {
    const connector = i === ordered.length - 1 ? '└──' : '├──';
    ordered[i].lines.forEach((l, idx) => {
      result.push(idx === 0 ? l.replace(/^[├└]──/, connector) : l);
    });
  }

  return result.join('\n');
}

function findNearestForwardLoc(
  lineIndex: AstLineIndex,
  astLine: number,
): AstLoc | undefined {
  const exact = lineIndex.astToCqlLoc.get(astLine);
  if (exact) return exact;

  const sortedLines = [...lineIndex.astToCqlLoc.keys()].sort((a, b) => a - b);
  const next = sortedLines.find(l => l > astLine);
  return next !== undefined ? lineIndex.astToCqlLoc.get(next) : undefined;
}

async function replaceDocumentContent(editor: TextEditor, content: string): Promise<boolean> {
  const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
  return editor.edit(edit =>
    edit.replace(new Range(0, 0, lastLine.lineNumber, lastLine.text.length), content),
  );
}

export function applyAstHighlight(
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

export function syncCqlToAstBySpan(
  span: CqlSpan,
  lineIndex: AstLineIndex,
  astEditor: TextEditor,
  astDecoration: TextEditorDecorationType,
): void {
  const key = buildLocatorKey(span.line, span.column, span.endLine, span.endColumn);
  let astLines = lineIndex.locatorToAstLines.get(key);
  if (!astLines || astLines.length === 0) {
    astLines = lineIndex.cqlToAstLines.get(span.line - 1);
  }
  if (!astLines || astLines.length === 0) {
    astEditor.setDecorations(astDecoration, []);
    return;
  }
  applyAstHighlight(astLines, astEditor, astDecoration);
}

async function viewElmSplit(cqlFileUri: Uri): Promise<void> {
  const prevAstEditor = activeSplitSession?.astEditor;
  const prevCqlUri = activeSplitSession?.cqlUri;
  activeSplitSession?.dispose();
  activeSplitSession = undefined;

  try {
    const cqlDoc = await workspace.openTextDocument(cqlFileUri);
    const astContent = await getElm(cqlFileUri, 'ast');
    const sortedAst = sortAstBySourceOrder(astContent);
    let lineIndex = buildAstLineIndex(sortedAst);

    const cqlEditor = await window.showTextDocument(cqlDoc, ViewColumn.One);
    const canReuse = prevAstEditor !== undefined && prevCqlUri === cqlFileUri.toString() && !prevAstEditor.document.isClosed;
    const reuseOk = canReuse
      ? await replaceDocumentContent(prevAstEditor!, sortedAst).catch(() => false)
      : false;
    let astEditor: TextEditor;
    if (reuseOk) {
      astEditor = prevAstEditor!;
      await window.showTextDocument(astEditor.document, ViewColumn.Two);
    } else {
      const astDoc = await workspace.openTextDocument({ language: 'ast', content: sortedAst });
      astEditor = await window.showTextDocument(astDoc, ViewColumn.Two);
    }

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

    let lastCqlRevealTime = 0;
    let lastAstRevealTime = 0;
    let disposed = false;

    function disposeSession(): void {
      if (disposed) return;
      disposed = true;
      visibleRangesListener.dispose();
      selectionListener.dispose();
      closeListener.dispose();
      docSaveListener.dispose();
      cqlLineDecoration.dispose();
      cqlSpanDecoration.dispose();
      astDecoration.dispose();
      activeSplitDebugHook = undefined;
    }

    function syncCqlToAst(cqlLine?: number): void {
      const effectiveLine = cqlLine ?? cqlEditor.visibleRanges[0]?.start.line;
      if (effectiveLine === undefined) return;

      const astLines = lineIndex.cqlToAstLines.get(effectiveLine);
      if (!astLines || astLines.length === 0) {
        astEditor.setDecorations(astDecoration, []);
        return;
      }
      applyAstHighlight(astLines, astEditor, astDecoration);
    }

    function syncAstToCql(astLine?: number): void {
      const effectiveLine = astLine ?? astEditor.visibleRanges[0]?.start.line;
      if (effectiveLine === undefined) return;

      const loc = findNearestForwardLoc(lineIndex, effectiveLine);
      if (!loc) {
        cqlEditor.setDecorations(cqlLineDecoration, []);
        cqlEditor.setDecorations(cqlSpanDecoration, []);
        return;
      }

      const start = new Position(loc.startLine - 1, loc.startCol - 1);
      const end = new Position(loc.endLine - 1, loc.endCol);
      const vsRange = new Range(start, end);

      const cqlVisibleRanges = cqlEditor.visibleRanges;
      if (cqlVisibleRanges.length > 0) {
        const cqlTop = cqlVisibleRanges[0].start.line;
        const cqlBottom = cqlVisibleRanges[cqlVisibleRanges.length - 1].end.line;
        if (start.line >= cqlTop && end.line <= cqlBottom) {
          cqlEditor.selection = new Selection(start, end);
          cqlEditor.setDecorations(cqlLineDecoration, [new Range(loc.startLine - 1, 0, loc.endLine - 1, 0)]);
          cqlEditor.setDecorations(cqlSpanDecoration, [{ range: vsRange } as DecorationOptions]);
          return;
        }
      }

      cqlEditor.revealRange(vsRange, TextEditorRevealType.InCenterIfOutsideViewport);
      cqlEditor.selection = new Selection(start, end);
      cqlEditor.setDecorations(cqlLineDecoration, [new Range(loc.startLine - 1, 0, loc.endLine - 1, 0)]);
      cqlEditor.setDecorations(cqlSpanDecoration, [{ range: vsRange } as DecorationOptions]);
    }

    const visibleRangesListener = window.onDidChangeTextEditorVisibleRanges(e => {
      const now = performance.now();
      if (e.textEditor === cqlEditor) {
        if (now - lastAstRevealTime < 100) return;
        lastCqlRevealTime = now;
        syncCqlToAst();
      } else if (e.textEditor === astEditor) {
        if (now - lastCqlRevealTime < 100) return;
        lastAstRevealTime = now;
        syncAstToCql();
      }
    });

    const selectionListener = window.onDidChangeTextEditorSelection(e => {
      const now = performance.now();
      if (e.textEditor === cqlEditor) {
        if (now - lastAstRevealTime < 100) return;
        lastCqlRevealTime = now;
        syncCqlToAst(e.selections[0].active.line);
      } else if (e.textEditor === astEditor) {
        if (now - lastCqlRevealTime < 100) return;
        lastAstRevealTime = now;
        syncAstToCql(e.selections[0].active.line);
      }
    });

    const docSaveListener = workspace.onDidSaveTextDocument(async saved => {
      if (saved.uri.toString() !== cqlFileUri.toString()) return;
      if (disposed) return;
      try {
        const newAst = await getElm(cqlFileUri, 'ast');
        const newSorted = sortAstBySourceOrder(newAst);
        lineIndex = buildAstLineIndex(newSorted);
        await replaceDocumentContent(astEditor, newSorted);
      } catch (error) {
        log.debug(`Failed to refresh AST after save: ${error}`);
      }
    });

    const closeListener = window.onDidChangeVisibleTextEditors(editors => {
      if (!editors.includes(cqlEditor) || !editors.includes(astEditor)) {
        if (disposed) return;
        disposeSession();
      }
    });

    activeSplitDebugHook = {
      highlightCqlSpan(span: CqlSpan) {
        lastAstRevealTime = performance.now();
        syncCqlToAstBySpan(span, lineIndex, astEditor, astDecoration);
      },
      noteExternalReveal() {
        lastAstRevealTime = performance.now();
      },
    };

    activeSplitSession = { dispose: disposeSession, astEditor, cqlUri: cqlFileUri.toString() };

    // Catch up if debugger is already paused when split view opens
    (async () => {
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
              activeSplitDebugHook?.highlightCqlSpan({
                line: top.line,
                column: top.column ?? 1,
                endLine: top.endLine ?? top.line,
                endColumn: top.endColumn ?? top.column ?? 1,
              });
              return;
            }
          } catch { /* try next thread */ }
        }
      } catch { /* session ended */ }
    })();
  } catch (error) {
    window.showErrorMessage(
      `Error opening CQL/AST split view for ${cqlFileUri.fsPath}. err: ${error}`,
    );
  }
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
