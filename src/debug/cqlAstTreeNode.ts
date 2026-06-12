import { AstLoc } from '../utils/astIndex';

export interface CqlAstNode {
  id: string;
  label: string;
  description: string;
  loc?: AstLoc;
  localId?: string;
  children: CqlAstNode[];
}

export interface CqlAstIndex {
  nodeById: Map<string, CqlAstNode>;
  localIdToNodeId: Map<string, string>;
  locatorToNodeId: Map<string, string>;
  cqlLineToNodeIds: Map<number, string[]>;
}

const LOC_IN_META_REGEX = /loc=(\d+):(\d+)(?:-(\d+):(\d+))?/;
const ID_IN_META_REGEX = /id=(\d+)/;

function getDepth(line: string): number {
  const idx = line.indexOf('\u2500\u2500');
  if (idx === -1) return 0;
  return Math.floor(idx / 2) + 1;
}

function extractLabel(line: string): string {
  return line
    .replace(/^[ \u2502\u251C\u2514]*\u2500\u2500\s*/, '')
    .replace(/\s*\[.*?\]\s*$/, '')
    .trim();
}

function parseMetadata(line: string): { loc?: AstLoc; localId?: string } {
  const metaMatch = line.match(/\[(.*?)\]/);
  if (!metaMatch) return {};

  const meta = metaMatch[1];
  const locMatch = meta.match(LOC_IN_META_REGEX);
  const idMatch = meta.match(ID_IN_META_REGEX);

  let loc: AstLoc | undefined;
  if (locMatch) {
    loc = {
      startLine: parseInt(locMatch[1], 10),
      startCol: parseInt(locMatch[2], 10),
      endLine: locMatch[3] ? parseInt(locMatch[3], 10) : parseInt(locMatch[1], 10),
      endCol: locMatch[4] ? parseInt(locMatch[4], 10) : parseInt(locMatch[2], 10),
    };
  }

  return {
    loc,
    localId: idMatch ? idMatch[1] : undefined,
  };
}

function computeStableId(localId: string | undefined, path: number[]): string {
  if (localId) return `lid:${localId}`;
  return `path:${path.join('/')}`;
}

function assignPathIds(nodes: CqlAstNode[], prefix: number[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const path = [...prefix, i];
    nodes[i].id = computeStableId(nodes[i].localId, path);
    assignPathIds(nodes[i].children, path);
  }
}

function buildLocatorKey(
  line: number, col: number, endLine: number, endCol: number,
): string {
  return `${line}:${col}-${endLine}:${endCol}`;
}

function indexNode(
  node: CqlAstNode,
  nodeById: Map<string, CqlAstNode>,
  localIdToNodeId: Map<string, string>,
  locatorToNodeId: Map<string, string>,
  cqlLineToNodeIds: Map<number, string[]>,
): void {
  nodeById.set(node.id, node);

  if (node.localId) {
    localIdToNodeId.set(node.localId, node.id);
  }

  if (node.loc) {
    const key = buildLocatorKey(
      node.loc.startLine, node.loc.startCol,
      node.loc.endLine, node.loc.endCol,
    );
    locatorToNodeId.set(key, node.id);

    for (let line = node.loc.startLine; line <= node.loc.endLine; line++) {
      const cqlIndex = line - 1;
      const existing = cqlLineToNodeIds.get(cqlIndex) ?? [];
      existing.push(node.id);
      cqlLineToNodeIds.set(cqlIndex, existing);
    }
  }

  for (const child of node.children) {
    indexNode(child, nodeById, localIdToNodeId, locatorToNodeId, cqlLineToNodeIds);
  }
}

export function buildNodeIndex(roots: CqlAstNode[]): CqlAstIndex {
  const nodeById = new Map<string, CqlAstNode>();
  const localIdToNodeId = new Map<string, string>();
  const locatorToNodeId = new Map<string, string>();
  const cqlLineToNodeIds = new Map<number, string[]>();

  for (const root of roots) {
    indexNode(root, nodeById, localIdToNodeId, locatorToNodeId, cqlLineToNodeIds);
  }

  return { nodeById, localIdToNodeId, locatorToNodeId, cqlLineToNodeIds };
}

export function buildParentMap(roots: CqlAstNode[]): Map<string, CqlAstNode> {
  const map = new Map<string, CqlAstNode>();
  function walk(nodes: CqlAstNode[], parent?: CqlAstNode) {
    for (const node of nodes) {
      if (parent) map.set(node.id, parent);
      walk(node.children, node);
    }
  }
  walk(roots);
  return map;
}

export function parseAstToTree(astContent: string): { roots: CqlAstNode[]; index: CqlAstIndex } {
  const lines = astContent.split('\n');
  if (lines.length === 0) return { roots: [], index: buildNodeIndex([]) };

  const roots: CqlAstNode[] = [];
  const stack: { node: CqlAstNode; depth: number }[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const depth = getDepth(line);
    const label = extractLabel(line);
    const { loc, localId } = parseMetadata(line);

    const node: CqlAstNode = {
      id: '',
      label,
      description: loc
        ? `${loc.startLine}:${loc.startCol}-${loc.endLine}:${loc.endCol}`
        : '',
      loc,
      localId,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ node, depth });
  }

  assignPathIds(roots, []);
  const index = buildNodeIndex(roots);

  return { roots, index };
}
