import path from 'node:path';
import * as vscode from 'vscode';
import { logger } from '../extensionLogger';
import {
  CqlLibrary,
  CqlLibraryEvents,
  CqlProject,
  CqlProjectEvents,
  CqlTestCase,
  CqlTestCaseResource,
} from './cqlProject';
import { DeviationKind } from './igLayoutDetector';

export class CqlTestCaseResourceTreeItem extends vscode.TreeItem {
  constructor(public readonly resource: CqlTestCaseResource) {
    super(resource.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'cql-testcase-resource';
    this.iconPath = vscode.ThemeIcon.File;
    this.command = {
      title: 'Open',
      command: 'vscode.open',
      tooltip: 'open cql library file',
      arguments: [resource.uri],
    };
  }
}

export class CqlTestCaseTreeItem extends vscode.TreeItem {
  private readonly _children: vscode.TreeItem[] = [];

  constructor(public readonly cqlTestCase: CqlTestCase) {
    super(cqlTestCase.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'cql-testcase';
    this.iconPath = new vscode.ThemeIcon('person');

    if (cqlTestCase.description) {
      this.description = cqlTestCase.description;
      this.tooltip = cqlTestCase.description;
    }

    cqlTestCase.resources.sort((a, b) => a.name.localeCompare(b.name));
    cqlTestCase.resources.forEach((cqlTestCaseResource: CqlTestCaseResource) => {
      this.addTestCaseResource(cqlTestCaseResource);
    });
  }

  public addTestCaseResource(cqlTestCaseResource: CqlTestCaseResource) {
    this._children.push(new CqlTestCaseResourceTreeItem(cqlTestCaseResource));
  }

  public clearChildren(): void {
    this._children.length = 0;
  }

  public get children(): vscode.TreeItem[] {
    return [...this._children];
  }
}

export class CqlTestCaseRootTreeItem extends vscode.TreeItem {
  private readonly _children: vscode.TreeItem[] = [];

  constructor(
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly cqlLibrary: CqlLibrary,
    public readonly activeFilter: string = '',
  ) {
    super('Test Cases', collapsibleState);
    const baseContext = activeFilter ? 'cql-testcase-root-filtered' : 'cql-testcase-root';
    this.contextValue = baseContext;
    this.iconPath = new vscode.ThemeIcon('beaker');
    if (activeFilter) {
      this.description = activeFilter;
    }
  }

  public addTestCase(cqlTestCase: CqlTestCase) {
    const filter = this.activeFilter.toLowerCase();
    if (filter) {
      const matchesName = cqlTestCase.name.toLowerCase().includes(filter);
      const matchesDescription = cqlTestCase.description?.toLowerCase().includes(filter) ?? false;
      if (!matchesName && !matchesDescription) {
        return;
      }
    }
    this._children.push(new CqlTestCaseTreeItem(cqlTestCase));
  }

  public resetChildren(): void {
    this._children.length = 0;
    this.cqlLibrary.TestCases.sort((a, b) => a.name.localeCompare(b.name));
    this.cqlLibrary.TestCases.forEach(tc => this.addTestCase(tc));
  }

  public get children(): vscode.TreeItem[] {
    return [...this._children];
  }
}

export class CqlLibraryTreeItem extends vscode.TreeItem {
  constructor(public readonly cqlLibrary: CqlLibrary) {
    super(cqlLibrary.fileName, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'cql-library';
    this.iconPath = new vscode.ThemeIcon('file-code');
    this.command = {
      title: 'Open',
      command: 'vscode.open',
      tooltip: 'open cql library file',
      arguments: [cqlLibrary.uri],
    };
  }
}

export class CqlTestCasesLoadingTreeItem extends vscode.TreeItem {
  constructor() {
    super('Loading test cases\u2026', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('loading~spin');
    this.contextValue = 'cql-testcases-loading';
  }
}

export class CqlResultsRootTreeItem extends vscode.TreeItem {
  private readonly _children: vscode.TreeItem[] = [];

  constructor(resultUris: vscode.Uri[]) {
    super('Results', vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'cql-results-root';
    this.iconPath = new vscode.ThemeIcon('output');

    for (const uri of resultUris) {
      const leaf = new vscode.TreeItem(
        path.basename(uri.fsPath),
        vscode.TreeItemCollapsibleState.None,
      );
      leaf.iconPath = new vscode.ThemeIcon('file-text');
      leaf.contextValue = 'cql-result';
      leaf.command = { command: 'vscode.open', title: 'Open', arguments: [uri] };
      this._children.push(leaf);
    }
  }

  public get children(): vscode.TreeItem[] {
    return [...this._children];
  }
}

export class CqlLibraryRootTreeItem extends vscode.TreeItem {
  private readonly _children: vscode.TreeItem[] = [];
  private _cqlTestCaseRootTreeItem: CqlTestCaseRootTreeItem | undefined;
  public readonly cqlLibraryTreeItem: CqlLibraryTreeItem;
  public readonly cqlLibrary: CqlLibrary;

  constructor(
    cqlLibrary: CqlLibrary,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    private testCaseFilter: string = '',
    showDeviationWarnings: boolean = false,
  ) {
    super(cqlLibrary.name, collapsibleState);
    this.cqlLibrary = cqlLibrary;
    this.contextValue = 'cql-library-root';

    // Use warning icon if layout deviations were detected and warnings are enabled
    if (showDeviationWarnings && cqlLibrary.deviations.size > 0) {
      this.iconPath = new vscode.ThemeIcon(
        'warning',
        new vscode.ThemeColor('list.warningForeground'),
      );
      this.tooltip = buildLibraryDeviationTooltip(cqlLibrary);
    } else {
      this.iconPath = new vscode.ThemeIcon('symbol-file');
    }

    this.cqlLibraryTreeItem = new CqlLibraryTreeItem(cqlLibrary);
    this._children.push(this.cqlLibraryTreeItem);

    cqlLibrary.TestCases.sort((a, b) => a.name.localeCompare(b.name));
    cqlLibrary.TestCases.forEach(tc => this.addTestCase(tc));

    if (cqlLibrary.resultUris.length > 0) {
      this._children.push(new CqlResultsRootTreeItem(cqlLibrary.resultUris));
    }
  }

  public addTestCase(cqlTestCase: CqlTestCase) {
    if (this._cqlTestCaseRootTreeItem === undefined) {
      this._cqlTestCaseRootTreeItem = new CqlTestCaseRootTreeItem(
        vscode.TreeItemCollapsibleState.Collapsed,
        this.cqlLibrary,
        this.testCaseFilter,
      );
      this._children.push(this._cqlTestCaseRootTreeItem);
    }
    this._cqlTestCaseRootTreeItem.addTestCase(cqlTestCase);
  }

  public updateDeviationIcon(showDeviationWarnings: boolean): void {
    if (showDeviationWarnings && this.cqlLibrary.deviations.size > 0) {
      this.iconPath = new vscode.ThemeIcon(
        'warning',
        new vscode.ThemeColor('list.warningForeground'),
      );
      this.tooltip = buildLibraryDeviationTooltip(this.cqlLibrary);
    } else {
      this.iconPath = new vscode.ThemeIcon('symbol-file');
      this.tooltip = undefined;
    }
  }

  public rebuildTestCases(testCaseFilter: string): void {
    this.testCaseFilter = testCaseFilter;
    for (let i = this._children.length - 1; i >= 0; i--) {
      if (
        this._children[i] instanceof CqlTestCaseRootTreeItem ||
        this._children[i] instanceof CqlResultsRootTreeItem
      ) {
        this._children.splice(i, 1);
      }
    }
    this._cqlTestCaseRootTreeItem = undefined;

    this.cqlLibrary.TestCases.sort((a, b) => a.name.localeCompare(b.name));
    this.cqlLibrary.TestCases.forEach(tc => this.addTestCase(tc));

    if (this.cqlLibrary.resultUris.length > 0) {
      this._children.push(new CqlResultsRootTreeItem(this.cqlLibrary.resultUris));
    }
  }

  public get children(): vscode.TreeItem[] {
    return [...this._children];
  }
}

/** Project root node shown only in multi-project workspaces. */
export class CqlProjectRootTreeItem extends vscode.TreeItem {
  private readonly _children: vscode.TreeItem[] = [];

  constructor(public readonly cqlProject: CqlProject, showDeviationWarnings: boolean = false) {
    super(cqlProject.name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'cql-project-root';
    const hasDeviations =
      cqlProject.projectDeviations.size > 0 ||
      cqlProject.Libraries.some(l => l.deviations.size > 0);
    if (showDeviationWarnings && hasDeviations) {
      this.iconPath = new vscode.ThemeIcon(
        'warning',
        new vscode.ThemeColor('list.warningForeground'),
      );
      this.tooltip = buildProjectDeviationTooltip(cqlProject);
    } else {
      this.iconPath = new vscode.ThemeIcon('symbol-package');
    }
  }

  public addLibraryItem(item: CqlLibraryRootTreeItem): void {
    this._children.push(item);
  }

  public removeLibraryItem(item: CqlLibraryRootTreeItem): void {
    const index = this._children.indexOf(item);
    if (index !== -1) this._children.splice(index, 1);
  }

  public get children(): vscode.TreeItem[] {
    return [...this._children];
  }
}

function buildLibraryDeviationTooltip(cqlLibrary: CqlLibrary): string {
  const lines: string[] = [];
  for (const kind of cqlLibrary.deviations) {
    switch (kind) {
      case DeviationKind.MISSING_RESOURCE_TYPE:
        lines.push(
          `Test cases are in input/tests/${cqlLibrary.name}/ — ` +
            `standard convention uses input/tests/{ResourceType}/${cqlLibrary.name}/`,
        );
        break;
      case DeviationKind.UNKNOWN_RESOURCE_TYPE:
        lines.push(
          `Test cases are under input/tests/${cqlLibrary.resourceTypeDir}/ — ` +
            `'${cqlLibrary.resourceTypeDir}' is not a recognized FHIR resource type name`,
        );
        break;
      default:
        break;
    }
  }
  return lines.join('\n');
}

function buildProjectDeviationTooltip(cqlProject: CqlProject): string {
  const lines: string[] = [];
  if (cqlProject.projectDeviations.has(DeviationKind.MULTI_PROJECT_WORKSPACE)) {
    lines.push(
      `Sub-project inside a multi-project workspace — standard convention uses one IG project per workspace root`,
    );
  }
  return lines.join('\n');
}

export class CqlProjectTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private rootItems: vscode.TreeItem[] = [];
  private hideEmpty: boolean = false;
  private nameFilter: string = '';
  private sortDescending: boolean = false;
  private showDeviationWarnings: boolean = false;
  private testCaseFilters: Map<string, string> = new Map();
  private expandedIds: Set<string> = new Set();

  /**
   * Returns a stable string ID for expandable tree items, used to preserve
   * expand state across full tree rebuilds.  Returns undefined for leaf nodes.
   */
  public static nodeId(item: vscode.TreeItem): string | undefined {
    if (item instanceof CqlProjectRootTreeItem) {
      return item.cqlProject.igRoot;
    }
    if (item instanceof CqlLibraryRootTreeItem) {
      return item.cqlLibraryTreeItem.cqlLibrary.uri.fsPath;
    }
    if (item instanceof CqlTestCaseRootTreeItem) {
      return path.join(item.cqlLibrary.uri.fsPath, 'testcases');
    }
    if (item instanceof CqlTestCaseTreeItem) {
      return item.cqlTestCase.uri.fsPath;
    }
    return undefined;
  }

  public setExpanded(id: string, expanded: boolean): void {
    if (expanded) {
      this.expandedIds.add(id);
    } else {
      this.expandedIds.delete(id);
    }
  }

  /** Walk rebuilt tree items and restore Expanded state before firing. */
  private restoreExpandState(items: vscode.TreeItem[]): void {
    for (const item of items) {
      const id = CqlProjectTreeDataProvider.nodeId(item);
      if (id && this.expandedIds.has(id)) {
        item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
      }
      if (
        item instanceof CqlProjectRootTreeItem ||
        item instanceof CqlLibraryRootTreeItem ||
        item instanceof CqlTestCaseRootTreeItem ||
        item instanceof CqlTestCaseTreeItem
      ) {
        this.restoreExpandState(item.children);
      }
    }
  }

  private readonly _onDidChangeTreeData: vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  > = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private readonly cqlProjects: CqlProject[];

  constructor(cqlProjects: CqlProject | CqlProject[]) {
    this.cqlProjects = Array.isArray(cqlProjects) ? cqlProjects : [cqlProjects];
    this.setupEventHandlers();
    this.rebuild();
  }

  private rebuild(): void {
    this.rootItems = buildTree(
      this.cqlProjects,
      this.hideEmpty,
      this.nameFilter,
      this.sortDescending,
      this.testCaseFilters,
      this.showDeviationWarnings,
    );
    this.restoreExpandState(this.rootItems);
    this.refresh();
  }

  public setHideEmpty(value: boolean): void {
    this.hideEmpty = value;
    this.rebuild();
  }

  public setNameFilter(value: string): void {
    this.nameFilter = value;
    this.rebuild();
  }

  public setSortDescending(value: boolean): void {
    this.sortDescending = value;
    this.rebuild();
  }

  public setShowDeviationWarnings(value: boolean): void {
    this.showDeviationWarnings = value;
    this.rebuild();
  }

  public setTestCaseFilter(libraryFsPath: string, filter: string): void {
    if (filter === '') {
      this.testCaseFilters.delete(libraryFsPath);
    } else {
      this.testCaseFilters.set(libraryFsPath, filter);
    }
    this.rebuild();
  }

  private findCqlTestCaseTreeItem(testCaseFsPath: string): CqlTestCaseTreeItem | undefined {
    for (const root of this.rootItems) {
      const libRoots =
        root instanceof CqlProjectRootTreeItem
          ? root.children.filter(c => c instanceof CqlLibraryRootTreeItem)
          : [root];
      for (const libRoot of libRoots) {
        for (const child of (libRoot as CqlLibraryRootTreeItem).children) {
          if (child instanceof CqlTestCaseRootTreeItem) {
            for (const tcItem of child.children) {
              if (
                tcItem instanceof CqlTestCaseTreeItem &&
                tcItem.cqlTestCase.uri.fsPath === testCaseFsPath
              ) {
                return tcItem;
              }
            }
          }
        }
      }
    }
    return undefined;
  }

  private subscribeLibraryEvents(lib: CqlLibrary) {
    lib.on(CqlLibraryEvents.RESULT_CHANGED, () => {
      const item = this.findLibraryRootItem(lib);
      if (item) {
        item.rebuildTestCases(this.testCaseFilters.get(lib.uri.fsPath) ?? '');
        this._onDidChangeTreeData.fire(item);
      } else {
        this._onDidChangeTreeData.fire();
      }
    });
    lib.on(CqlLibraryEvents.TESTCASE_RESOURCES_CHANGED, (testCase: CqlTestCase) => {
      const tcItem = this.findCqlTestCaseTreeItem(testCase.uri.fsPath);
      if (tcItem) {
        tcItem.clearChildren();
        testCase.resources
          .sort((a, b) => a.name.localeCompare(b.name))
          .forEach(r => tcItem.addTestCaseResource(r));
        this._onDidChangeTreeData.fire(tcItem);
      } else {
        this._onDidChangeTreeData.fire();
      }
    });
    lib.on(CqlLibraryEvents.TESTCASE_DESCRIPTION_CHANGED, (testCase: CqlTestCase) => {
      const tcItem = this.findCqlTestCaseTreeItem(testCase.uri.fsPath);
      if (tcItem) {
        tcItem.description = testCase.description;
        tcItem.tooltip = testCase.description;
        this._onDidChangeTreeData.fire(tcItem);
      }
    });
  }

  private setupEventHandlers() {
    for (const project of this.cqlProjects) {
      this.setupProjectEventHandlers(project);
    }
  }

  private setupProjectEventHandlers(project: CqlProject) {
    // Subscribe to events for all already-loaded libraries
    project.Libraries.forEach(lib => this.subscribeLibraryEvents(lib));

    // Add Library Event
    project.on(CqlProject.Events.LIBRARY_ADDED, (cqlLibrary: CqlLibrary) => {
      logger.debug('cql library add event triggered');
      const nameMatch =
        this.nameFilter === '' ||
        cqlLibrary.name.toLowerCase().includes(this.nameFilter.toLowerCase());
      if (
        (!this.hideEmpty ||
          cqlLibrary.testCaseLoadState !== 'loaded' ||
          cqlLibrary.TestCases.length > 0) &&
        nameMatch
      ) {
        if (this.cqlProjects.length === 1) {
          // Single-project: add library root item directly
          this.rootItems.push(
            new CqlLibraryRootTreeItem(
              cqlLibrary,
              vscode.TreeItemCollapsibleState.Collapsed,
              this.testCaseFilters.get(cqlLibrary.uri.fsPath) ?? '',
              this.showDeviationWarnings,
            ),
          );
        } else {
          // Multi-project: find or create project root item, add library under it
          let projRoot = this.rootItems.find(
            r => r instanceof CqlProjectRootTreeItem && r.cqlProject === project,
          ) as CqlProjectRootTreeItem | undefined;
          if (!projRoot) {
            projRoot = new CqlProjectRootTreeItem(project, this.showDeviationWarnings);
            this.rootItems.push(projRoot);
          }
          projRoot.addLibraryItem(
            new CqlLibraryRootTreeItem(
              cqlLibrary,
              vscode.TreeItemCollapsibleState.Collapsed,
              this.testCaseFilters.get(cqlLibrary.uri.fsPath) ?? '',
              this.showDeviationWarnings,
            ),
          );
        }
      }
      this.subscribeLibraryEvents(cqlLibrary);
      this.refresh();
    });

    // Remove Library Event
    project.on(CqlProject.Events.LIBRARY_REMOVED, (cqlLibrary: CqlLibrary) => {
      logger.debug(`cql library removed event triggered on ${cqlLibrary.name}`);
      if (this.cqlProjects.length === 1) {
        const index = this.rootItems.findIndex(
          item =>
            item instanceof CqlLibraryRootTreeItem &&
            item.cqlLibraryTreeItem.cqlLibrary === cqlLibrary,
        );
        if (index === -1) {
          logger.warn(`unable to find cql library ${cqlLibrary.name}`);
        } else {
          this.rootItems.splice(index, 1);
        }
      } else {
        const projRoot = this.rootItems.find(
          r => r instanceof CqlProjectRootTreeItem && r.cqlProject === project,
        ) as CqlProjectRootTreeItem | undefined;
        if (projRoot) {
          const libItem = projRoot.children.find(
            item =>
              item instanceof CqlLibraryRootTreeItem &&
              item.cqlLibraryTreeItem.cqlLibrary === cqlLibrary,
          ) as CqlLibraryRootTreeItem | undefined;
          if (libItem) {
            projRoot.removeLibraryItem(libItem);
          }
        }
      }
      cqlLibrary.removeAllListeners();
      logger.info(`cql library ${cqlLibrary.name} removed`);
      this.refresh();
    });

    // Project Refresh Event — full rebuild with sort/filter
    project.on(CqlProject.Events.REFRESH, () => {
      this.rebuild();
      logger.info('tree refreshed');
    });

    // Loaded Event — sort in-place (avoids discarding existing items and the async re-render gap)
    project.on(CqlProjectEvents.LOADED, () => {
      if (this.sortDescending) {
        this.sortRootItemsInPlace();
      }
      this.refresh();
    });

    // Library test cases loaded — update only the affected library node
    project.on(CqlProject.Events.LIBRARY_TESTCASES_LOADED, (cqlLibrary: CqlLibrary) => {
      const item = this.findLibraryRootItem(cqlLibrary);
      if (item) {
        item.rebuildTestCases(
          this.testCaseFilters.get(cqlLibrary.uri.fsPath) ?? '',
        );
        this._onDidChangeTreeData.fire(item);
      } else {
        this._onDidChangeTreeData.fire();
      }
    });

    // Scan complete — targeted update (hideEmpty filter + deviation icons); avoids full rebuild
    project.on(CqlProject.Events.SCAN_COMPLETE, () => {
      this.applyPostScanUpdates();
    });
  }

  private sortRootItemsInPlace(): void {
    if (this.cqlProjects.length === 1) {
      (this.rootItems as CqlLibraryRootTreeItem[]).sort((a, b) =>
        this.sortDescending
          ? b.cqlLibrary.name.localeCompare(a.cqlLibrary.name)
          : a.cqlLibrary.name.localeCompare(b.cqlLibrary.name),
      );
    } else {
      // Multi-project: full rebuild is acceptable (rare case)
      this.rootItems = buildTree(
        this.cqlProjects,
        this.hideEmpty,
        this.nameFilter,
        this.sortDescending,
        this.testCaseFilters,
        this.showDeviationWarnings,
      );
      this.restoreExpandState(this.rootItems);
    }
  }

  private applyPostScanUpdates(): void {
    let changed = false;

    if (this.hideEmpty) {
      const before = this.rootItems.length;
      this.rootItems = this.rootItems.filter(item => {
        if (item instanceof CqlLibraryRootTreeItem) {
          return (
            item.cqlLibrary.testCaseLoadState !== 'loaded' ||
            item.cqlLibrary.TestCases.length > 0
          );
        }
        return true;
      });
      if (this.rootItems.length !== before) changed = true;
    }

    if (this.showDeviationWarnings) {
      for (const item of this.rootItems) {
        if (item instanceof CqlLibraryRootTreeItem) {
          item.updateDeviationIcon(true);
          changed = true;
        }
      }
    }

    if (changed) {
      this.refresh();
    }
  }

  private findLibraryRootItem(library: CqlLibrary): CqlLibraryRootTreeItem | undefined {
    for (const root of this.rootItems) {
      if (
        root instanceof CqlLibraryRootTreeItem &&
        root.cqlLibraryTreeItem.cqlLibrary === library
      ) {
        return root;
      }
      if (root instanceof CqlProjectRootTreeItem) {
        for (const child of root.children) {
          if (
            child instanceof CqlLibraryRootTreeItem &&
            child.cqlLibraryTreeItem.cqlLibrary === library
          ) {
            return child;
          }
        }
      }
    }
    return undefined;
  }

  private triggerTestCaseLoad(library: CqlLibrary): void {
    const project = this.cqlProjects.find(p => p.Libraries.includes(library));
    if (project) {
      logger.info(`[perf] ${library.name}: on-demand load triggered`);
      project.loadTestCasesForLibrary(library).catch(e =>
        logger.error('Failed to load test cases on demand', e)
      );
    }
  }

  /**
   * Returns the children for the given element or roots if no element is passed.
   */
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem> {
    if (element instanceof CqlProjectRootTreeItem) {
      return undefined;
    }
    if (element instanceof CqlLibraryRootTreeItem) {
      // In multi-project mode, parent is CqlProjectRootTreeItem
      for (const root of this.rootItems) {
        if (root instanceof CqlProjectRootTreeItem) {
          if (root.children.includes(element)) {
            return root;
          }
        }
      }
      return undefined;
    }
    for (const root of this.rootItems) {
      const libRoots =
        root instanceof CqlProjectRootTreeItem
          ? root.children.filter(c => c instanceof CqlLibraryRootTreeItem)
          : root instanceof CqlLibraryRootTreeItem
            ? [root]
            : [];
      for (const libRootItem of libRoots) {
        const libRoot = libRootItem as CqlLibraryRootTreeItem;
        for (const child of libRoot.children) {
          if (child === element) {
            return libRoot;
          }
          if (child instanceof CqlTestCaseRootTreeItem) {
            for (const tcItem of child.children) {
              if (tcItem === element) {
                return child;
              }
              if (tcItem instanceof CqlTestCaseTreeItem) {
                for (const resource of tcItem.children) {
                  if (resource === element) {
                    return tcItem;
                  }
                }
              }
            }
          }
        }
      }
    }
    return undefined;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    // Scenario 1: Requesting Root Items
    if (!element) {
      return this.rootItems;
    }

    if (element instanceof CqlLibraryRootTreeItem) {
      const lib = element.cqlLibraryTreeItem.cqlLibrary;
      if (lib.testCaseLoadState === 'not-loaded') {
        this.triggerTestCaseLoad(lib);
        return [element.cqlLibraryTreeItem, new CqlTestCasesLoadingTreeItem()];
      }
      if (lib.testCaseLoadState === 'loading') {
        return [element.cqlLibraryTreeItem, new CqlTestCasesLoadingTreeItem()];
      }
      return element.children; // 'loaded'
    }

    if (
      element instanceof CqlProjectRootTreeItem ||
      element instanceof CqlTestCaseRootTreeItem ||
      element instanceof CqlTestCaseTreeItem ||
      element instanceof CqlResultsRootTreeItem
    ) {
      return element.children;
    }

    // Default
    return [];
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getRootItems(): vscode.TreeItem[] {
    return [...this.rootItems];
  }

  public refreshItem(item: vscode.TreeItem): void {
    this._onDidChangeTreeData.fire(item);
  }

}

/**
 * Build the tree for a list of CQL projects.
 *
 * - Single project: returns flat list of CqlLibraryRootTreeItem[] (no project wrapper).
 * - Multiple projects: returns CqlProjectRootTreeItem[] each containing library items.
 */
export function buildTree(
  cqlProjects: CqlProject | CqlProject[],
  hideEmpty: boolean = false,
  nameFilter: string = '',
  sortDescending: boolean = false,
  testCaseFilters: Map<string, string> = new Map(),
  showDeviationWarnings: boolean = false,
): vscode.TreeItem[] {
  const projects = Array.isArray(cqlProjects) ? cqlProjects : [cqlProjects];
  const filter = nameFilter.toLowerCase();

  const buildLibraryItems = (project: CqlProject): CqlLibraryRootTreeItem[] =>
    project.Libraries.filter(
      lib =>
        !hideEmpty || lib.testCaseLoadState !== 'loaded' || lib.TestCases.length > 0,
    )
      .filter(lib => filter === '' || lib.name.toLowerCase().includes(filter))
      .sort((a, b) =>
        sortDescending ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
      )
      .map(
        lib =>
          new CqlLibraryRootTreeItem(
            lib,
            vscode.TreeItemCollapsibleState.Collapsed,
            testCaseFilters.get(lib.uri.fsPath) ?? '',
            showDeviationWarnings,
          ),
      );

  if (projects.length === 1) {
    return buildLibraryItems(projects[0]);
  }

  return projects.map(project => {
    const projRoot = new CqlProjectRootTreeItem(project, showDeviationWarnings);
    for (const libItem of buildLibraryItems(project)) {
      projRoot.addLibraryItem(libItem);
    }
    return projRoot;
  });
}
