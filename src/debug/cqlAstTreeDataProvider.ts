import {
  EventEmitter,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  ThemeIcon,
  ThemeColor,
  window,
} from 'vscode';
import { CqlAstNode, buildParentMap } from './cqlAstTreeNode';

export type ViewState = 'loading' | 'empty' | 'data';
const PLACEHOLDER_LOADING = '__loading__';
const PLACEHOLDER_EMPTY = '__empty__';

export class CqlAstTreeDataProvider implements TreeDataProvider<CqlAstNode> {
  private _roots: CqlAstNode[] = [];
  private _activeNodeId: string | undefined;
  private _parentMap = new Map<string, CqlAstNode>();
  private _viewState: ViewState = 'empty';
  private _emptyMessage: string = 'No active frame';
  private _onDidChangeTreeData = new EventEmitter<CqlAstNode | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  get roots(): CqlAstNode[] { return this._roots; }
  get activeNodeId(): string | undefined { return this._activeNodeId; }

  setData(roots: CqlAstNode[]): void {
    this._roots = roots;
    this._viewState = roots.length > 0 ? 'data' : 'empty';
    this._parentMap = buildParentMap(roots);
    this._onDidChangeTreeData.fire(undefined);
  }

  setActiveNodeId(id: string | undefined): void {
    this._activeNodeId = id;
    this._onDidChangeTreeData.fire(undefined);
  }

  setLoading(): void {
    this._roots = [];
    this._activeNodeId = undefined;
    this._viewState = 'loading';
    this._parentMap.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  setEmpty(message?: string): void {
    this._roots = [];
    this._activeNodeId = undefined;
    this._viewState = 'empty';
    this._emptyMessage = message ?? 'No active frame';
    this._parentMap.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  getChildren(element?: CqlAstNode): CqlAstNode[] {
    if (!element) {
      if (this._viewState === 'loading') {
        return [this.makePlaceholder(PLACEHOLDER_LOADING, 'Loading AST...')];
      }
      if (this._viewState === 'empty' || this._roots.length === 0) {
        return [this.makePlaceholder(PLACEHOLDER_EMPTY, this._emptyMessage)];
      }
      return this._roots;
    }
    if (element.id === PLACEHOLDER_LOADING || element.id === PLACEHOLDER_EMPTY) {
      return [];
    }
    return element.children;
  }

  getParent(element: CqlAstNode): CqlAstNode | undefined {
    return this._parentMap.get(element.id);
  }

  getTreeItem(element: CqlAstNode): TreeItem {
    const isPlaceholder = element.id === PLACEHOLDER_LOADING || element.id === PLACEHOLDER_EMPTY;
    if (isPlaceholder) {
      const item = new TreeItem(element.label, TreeItemCollapsibleState.None);
      item.id = element.id;
      item.description = '';
      if (element.id === PLACEHOLDER_LOADING) {
        item.iconPath = new ThemeIcon('loading~spin');
      }
      return item;
    }

    const isActive = element.id === this._activeNodeId;
    const item = new TreeItem(
      element.label,
      element.children.length > 0
        ? TreeItemCollapsibleState.Collapsed
        : TreeItemCollapsibleState.None,
    );
    item.id = element.id;
    item.description = element.description;

    if (isActive) {
      item.iconPath = new ThemeIcon(
        'debug-stackframe',
        new ThemeColor('debugIcon.breakpointForeground'),
      );
    }

    item.command = {
      command: 'cql.debug.ast.reveal-cql',
      title: 'Reveal in CQL Editor',
      arguments: [element],
    };

    return item;
  }

  private makePlaceholder(id: string, label: string): CqlAstNode {
    return { id, label, description: '', children: [] };
  }
}
