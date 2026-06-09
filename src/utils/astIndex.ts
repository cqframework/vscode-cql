const LOC_REGEX = /\[.*?loc=(\d+):(\d+)(?:-(\d+):(\d+))?\]/;
const ID_REGEX = /\[id=(\d+)/;

export function buildLocatorKey(
  line: number, col: number, endLine: number, endCol: number,
): string {
  return `${line}:${col}-${endLine}:${endCol}`;
}

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
  localIdToAstLines: Map<string, number[]>;
}

export function buildAstLineIndex(astContent: string): AstLineIndex {
  const astToCqlLoc = new Map<number, AstLoc>();
  const cqlToAstLines = new Map<number, number[]>();
  const locatorToAstLines = new Map<string, number[]>();
  const localIdToAstLines = new Map<string, number[]>();

  const lines = astContent.split('\n');
  for (let astLine = 0; astLine < lines.length; astLine++) {
    const match = lines[astLine].match(LOC_REGEX);
    if (match) {
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

    const idMatch = lines[astLine].match(ID_REGEX);
    if (idMatch) {
      const id = idMatch[1];
      const existing3 = localIdToAstLines.get(id) ?? [];
      existing3.push(astLine);
      localIdToAstLines.set(id, existing3);
    }
  }

  return { astToCqlLoc, cqlToAstLines, locatorToAstLines, localIdToAstLines };
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

export function findNearestForwardLoc(
  lineIndex: AstLineIndex,
  astLine: number,
): AstLoc | undefined {
  const exact = lineIndex.astToCqlLoc.get(astLine);
  if (exact) return exact;

  const sortedLines = [...lineIndex.astToCqlLoc.keys()].sort((a, b) => a - b);
  const next = sortedLines.find(l => l > astLine);
  return next !== undefined ? lineIndex.astToCqlLoc.get(next) : undefined;
}

export function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
