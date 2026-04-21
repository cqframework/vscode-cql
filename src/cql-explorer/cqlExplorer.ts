import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { executeCQLFile } from '../commands/execute-cql';
import { viewElm } from '../commands/view-elm';
import { logger } from '../extensionLogger';
import {
  CqlLibraryRootTreeItem,
  CqlLibraryTreeItem,
  CqlProjectRootTreeItem,
  CqlProjectTreeDataProvider,
  CqlTestCaseResourceTreeItem,
  CqlTestCaseRootTreeItem,
  CqlTestCaseTreeItem,
} from './cqlProjectTreeDataProvider';
import { CqlProject, CqlTestCase } from './cqlProject';
import { DeviationKind } from './igLayoutDetector';
import { cloneTestCase } from './testCaseCloner';
import {
  copyResources,
  deleteResources,
  deleteTestCase,
  enhancedCopyResources,
  enhancedMoveResources,
  moveResources,
} from './testCaseResourceOps';

export interface CqlNode {
  resource: vscode.Uri;
  isDirectory: boolean;
}

function appendDiagnostic(
  collection: vscode.DiagnosticCollection,
  uri: vscode.Uri,
  severity: vscode.DiagnosticSeverity,
  message: string,
): void {
  const existing = collection.get(uri) ?? [];
  const diag = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), message, severity);
  collection.set(uri, [...existing, diag]);
}

export class CqlExplorer {
  private readonly cqlProjects: CqlProject[];
  private readonly cqlLibraryTreeProvider: CqlProjectTreeDataProvider;
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('CQL Explorer');
  private treeView!: vscode.TreeView<vscode.TreeItem>;
  private hideEmpty: boolean = false;
  private nameFilter: string = '';
  private sortDescending: boolean = false;
  private showLayoutWarnings: boolean = false;
  private clipboard: { uris: vscode.Uri[]; operation: 'copy' | 'cut' } | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.cqlProjects = CqlProject.getInstances();

    this.cqlLibraryTreeProvider = new CqlProjectTreeDataProvider(this.cqlProjects);
    context.subscriptions.push(this.diagnostics);

    vscode.commands.executeCommand('setContext', 'cql.hideEmptyLibraries', false);
    vscode.commands.executeCommand('setContext', 'cql.nameFilterActive', false);
    vscode.commands.executeCommand('setContext', 'cql.sortDescending', false);
    vscode.commands.executeCommand('setContext', 'cql.hasResourceClipboard', false);
    vscode.commands.executeCommand('setContext', 'cql.showLayoutWarnings', false);
    this.setupCqlLibraryTreeProvider(context);
  }

  private updateTreeViewDescription(): void {
    const parts: string[] = [];
    if (this.hideEmpty) {
      parts.push('has test cases');
    }
    if (this.nameFilter !== '') {
      parts.push(`"${this.nameFilter}"`);
    }
    if (this.sortDescending) {
      parts.push('Z → A');
    }
    this.treeView.description = parts.length > 0 ? parts.join(' · ') : undefined;
  }

  private setupCqlLibraryTreeProvider(context: vscode.ExtensionContext) {
    this.treeView = vscode.window.createTreeView('cql-libraries', {
      treeDataProvider: this.cqlLibraryTreeProvider,
      canSelectMany: true,
    });

    this.treeView.onDidExpandElement(e => {
      const id = CqlProjectTreeDataProvider.nodeId(e.element);
      if (id) {
        this.cqlLibraryTreeProvider.setExpanded(id, true);
      }
    });
    this.treeView.onDidCollapseElement(e => {
      const id = CqlProjectTreeDataProvider.nodeId(e.element);
      if (id) {
        this.cqlLibraryTreeProvider.setExpanded(id, false);
      }
    });

    context.subscriptions.push(
      // execute all visible libraries
      vscode.commands.registerCommand('cql.explorer.library.execute-all', async () => {
        logger.debug(`Command cql.explorer.library.execute-all selected`);
        const filter = this.nameFilter.toLowerCase();
        const libs = this.cqlProjects
          .flatMap(p => p.Libraries)
          .filter(l => filter === '' || l.name.toLowerCase().includes(filter));
        if (libs.length === 0) {
          return;
        }
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Execute CQL',
            cancellable: true,
          },
          async (progress, token) => {
            for (let i = 0; i < libs.length; i++) {
              if (token.isCancellationRequested) {
                break;
              }
              const lib = libs[i];
              progress.report({ message: `${lib.name} (${i + 1} of ${libs.length})` });
              await executeCQLFile(lib.uri, undefined, false);
            }
          },
        );
      }),

      // execute all test cases for a library
      vscode.commands.registerCommand(
        'cql.explorer.library.execute',
        (item: CqlLibraryTreeItem) => {
          logger.debug(`Command cql.explorer.library.execute selected for item: ${item.label}`);
          executeCQLFile(item.cqlLibrary.uri);
        },
      ),

      // view ELM as JSON
      vscode.commands.registerCommand(
        'cql.explorer.library.elm.json',
        async (item: CqlLibraryTreeItem) => {
          logger.debug(`Command cql.explorer.library.elm.json selected for item: ${item.label}`);
          await viewElm(item.cqlLibrary.uri, 'json');
        },
      ),

      // view ELM as XML
      vscode.commands.registerCommand(
        'cql.explorer.library.elm.xml',
        async (item: CqlLibraryTreeItem) => {
          logger.debug(`Command cql.explorer.library.elm.xml selected for item: ${item.label}`);
          await viewElm(item.cqlLibrary.uri, 'xml');
        },
      ),

      // execute a single test case
      vscode.commands.registerCommand(
        'cql.explorer.test-case.execute',
        async (item: CqlTestCaseTreeItem) => {
          logger.debug(
            `Command cql.explorer.test-case.execute selected for item: ${item.label}`,
          );
          const library = this.cqlProjects
            .flatMap(p => p.Libraries)
            .find(lib => lib.TestCases.some(tc => tc.uri.fsPath === item.cqlTestCase.uri.fsPath));
          if (!library) {
            vscode.window.showErrorMessage('Unable to find parent library.');
            return;
          }
          await executeCQLFile(library.uri, [
            { name: item.cqlTestCase.name, path: item.cqlTestCase.uri },
          ]);
        },
      ),

      // open all resource files for a test case
      vscode.commands.registerCommand(
        'cql.explorer.test-case.open-resources',
        async (item: CqlTestCaseTreeItem) => {
          logger.debug(
            `Command cql.explorer.test-case.open-resources selected for item: ${item.label}`,
          );
          for (const resource of item.cqlTestCase.resources) {
            const doc = await vscode.workspace.openTextDocument(resource.uri);
            await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
          }
          await this.treeView.reveal(item, { select: true, focus: true, expand: true });
        },
      ),

      // clone a test case (create an independent copy with fresh UUIDs)
      vscode.commands.registerCommand(
        'cql.explorer.test-case.clone',
        async (item: CqlTestCaseTreeItem) => {
          logger.debug(`Command cql.explorer.test-case.clone selected for item: ${item.label}`);
          try {
            const destUri = await cloneTestCase(item.cqlTestCase.uri);
            // Find the parent library by name (library name = test cases folder name)
            const libraryName = path.basename(path.dirname(item.cqlTestCase.uri.fsPath));
            const library = this.cqlProjects
              .flatMap(p => p.Libraries)
              .find(lib => lib.name === libraryName);
            if (!library) {
              this.cqlProjects.forEach(p => p.refresh());
              return;
            }
            // Build new CqlTestCase, load resources, add to model
            const newTestCase = new CqlTestCase(destUri);
            const entries = fs.readdirSync(destUri.fsPath, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isFile()) {
                newTestCase.addResource(
                  vscode.Uri.file(path.join(destUri.fsPath, entry.name)),
                );
              }
            }
            library.addTestCase(newTestCase);
            // Targeted tree update — refresh only the Test Cases node for this library
            const testCaseRootItem = this.findTestCaseRootTreeItem(library.uri.fsPath);
            if (!testCaseRootItem) {
              this.cqlProjects.forEach(p => p.refresh());
              return;
            }
            testCaseRootItem.resetChildren();
            this.cqlLibraryTreeProvider.refreshItem(testCaseRootItem);
            // Focus and expand the new test case node
            const newTreeItem = testCaseRootItem.children.find(
              c => c instanceof CqlTestCaseTreeItem && c.cqlTestCase === newTestCase,
            ) as CqlTestCaseTreeItem | undefined;
            if (newTreeItem) {
              await this.treeView.reveal(newTreeItem, {
                select: true,
                focus: true,
                expand: true,
              });
            }
          } catch (err) {
            vscode.window.showErrorMessage(
              `Failed to clone test case: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      ),

      // copy resource(s) to clipboard
      vscode.commands.registerCommand(
        'cql.explorer.resource.copy',
        (item: CqlTestCaseResourceTreeItem, all?: CqlTestCaseResourceTreeItem[]) => {
          logger.debug(`Command cql.explorer.resource.copy selected for item: ${item.label}`);
          this.setClipboard({ uris: this.resourceUrisFrom(item, all), operation: 'copy' });
        },
      ),

      // cut resource(s) to clipboard
      vscode.commands.registerCommand(
        'cql.explorer.resource.cut',
        (item: CqlTestCaseResourceTreeItem, all?: CqlTestCaseResourceTreeItem[]) => {
          logger.debug(`Command cql.explorer.resource.cut selected for item: ${item.label}`);
          this.setClipboard({ uris: this.resourceUrisFrom(item, all), operation: 'cut' });
        },
      ),

      // delete resource(s) with confirmation
      vscode.commands.registerCommand(
        'cql.explorer.resource.delete',
        async (item: CqlTestCaseResourceTreeItem, all?: CqlTestCaseResourceTreeItem[]) => {
          logger.debug(`Command cql.explorer.resource.delete selected for item: ${item.label}`);
          const uris = this.resourceUrisFrom(item, all);
          const names = uris.map(u => path.basename(u.fsPath)).join(', ');
          const answer = await vscode.window.showWarningMessage(
            `Delete ${names}?`,
            { modal: true },
            'Delete',
          );
          if (answer !== 'Delete') {
            return;
          }
          try {
            await deleteResources(uris);
            // Tree update is handled automatically: the file watcher fires onDidDelete
            // for each removed file, calling removeResource and emitting
            // TESTCASE_RESOURCES_CHANGED to rebuild the tree item children.
          } catch (err) {
            vscode.window.showErrorMessage(
              `Failed to delete: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      ),

      // rename a resource file
      vscode.commands.registerCommand(
        'cql.explorer.resource.rename',
        async (item: CqlTestCaseResourceTreeItem) => {
          logger.debug(`Command cql.explorer.resource.rename selected for item: ${item.label}`);
          const oldName = item.resource.name;
          const newName = await vscode.window.showInputBox({
            prompt: 'Enter new file name',
            value: oldName,
            validateInput: value => {
              if (!value || value.trim() === '') return 'File name cannot be empty';
              if (value.includes('/') || value.includes('\\'))
                return 'File name cannot contain path separators';
              return null;
            },
          });
          if (newName === undefined || newName === oldName) return;
          const oldPath = item.resource.uri.fsPath;
          const newPath = path.join(path.dirname(oldPath), newName);
          try {
            await fs.promises.rename(oldPath, newPath);
            // Tree update is handled automatically: the file watcher fires onDidDelete
            // (removes old entry from model) and onDidCreate (adds new entry), each
            // emitting TESTCASE_RESOURCES_CHANGED which rebuilds the tree item children.
          } catch (err) {
            vscode.window.showErrorMessage(
              `Failed to rename: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      ),

      // fix patient reference mismatches in a resource file
      vscode.commands.registerCommand(
        'cql.explorer.resource.fix-references',
        async (item: CqlTestCaseResourceTreeItem) => {
          logger.debug(
            `Command cql.explorer.resource.fix-references selected for item: ${item.label}`,
          );
          const expectedId = path.basename(path.dirname(item.resource.uri.fsPath));
          try {
            const raw = await fs.promises.readFile(item.resource.uri.fsPath, 'utf8');
            const json = JSON.parse(raw) as Record<string, unknown>;

            let fixed = false;
            const subject = json['subject'] as Record<string, string> | undefined;
            if (subject?.['reference']?.startsWith('Patient/')) {
              logger.info(
                `Fixing subject.reference in ${item.resource.uri.fsPath}: ` +
                  `${subject['reference']} → Patient/${expectedId}`,
              );
              subject['reference'] = `Patient/${expectedId}`;
              fixed = true;
            }
            const patient = json['patient'] as Record<string, string> | undefined;
            if (patient?.['reference']?.startsWith('Patient/')) {
              logger.info(
                `Fixing patient.reference in ${item.resource.uri.fsPath}: ` +
                  `${patient['reference']} → Patient/${expectedId}`,
              );
              patient['reference'] = `Patient/${expectedId}`;
              fixed = true;
            }

            if (!fixed) {
              logger.warn(
                `fixReferences: no patient reference field found in ${item.resource.uri.fsPath}`,
              );
              return;
            }

            await fs.promises.writeFile(
              item.resource.uri.fsPath,
              JSON.stringify(json, null, 2),
            );
            // Re-validation is automatic: testCaseResourceWatcher.onDidChange fires
            // TESTCASE_RESOURCES_CHANGED, which rebuilds CqlTestCaseResourceTreeItem children.
          } catch (err) {
            vscode.window.showErrorMessage(
              `Failed to fix references: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      ),

      // standard paste (no ID rewriting)
      vscode.commands.registerCommand(
        'cql.explorer.test-case.paste',
        async (item: CqlTestCaseTreeItem) => {
          logger.debug(`Command cql.explorer.test-case.paste selected for item: ${item.label}`);
          if (!this.clipboard) {
            vscode.window.showInformationMessage(
              'Nothing to paste. Copy or cut a resource first.',
            );
            return;
          }
          try {
            const { uris, operation } = this.clipboard;
            if (operation === 'cut') {
              await moveResources(uris, item.cqlTestCase.uri);
              this.setClipboard(null);
            } else {
              await copyResources(uris, item.cqlTestCase.uri);
            }
            // Tree updates are handled automatically: the file watcher fires onDidCreate
            // (adds to destination model) and onDidDelete for cut (removes from source
            // model), each emitting TESTCASE_RESOURCES_CHANGED to rebuild tree children.
          } catch (err) {
            vscode.window.showErrorMessage(
              `Failed to paste: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      ),

      // enhanced paste (rewrites patient UUID + resource IDs)
      vscode.commands.registerCommand(
        'cql.explorer.test-case.paste-enhanced',
        async (item: CqlTestCaseTreeItem) => {
          logger.debug(
            `Command cql.explorer.test-case.paste-enhanced selected for item: ${item.label}`,
          );
          if (!this.clipboard) {
            vscode.window.showInformationMessage(
              'Nothing to paste. Copy or cut a resource first.',
            );
            return;
          }
          try {
            const { uris, operation } = this.clipboard;
            if (operation === 'cut') {
              await enhancedMoveResources(uris, item.cqlTestCase.uri);
              this.setClipboard(null);
            } else {
              await enhancedCopyResources(uris, item.cqlTestCase.uri);
            }
            // Tree updates are handled automatically: the file watcher fires onDidCreate
            // (adds to destination model) and onDidDelete for cut (removes from source
            // model), each emitting TESTCASE_RESOURCES_CHANGED to rebuild tree children.
          } catch (err) {
            vscode.window.showErrorMessage(
              `Failed to paste (enhanced): ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      ),

      // delete entire test case directory with confirmation
      vscode.commands.registerCommand(
        'cql.explorer.test-case.delete',
        async (item: CqlTestCaseTreeItem) => {
          logger.debug(`Command cql.explorer.test-case.delete selected for item: ${item.label}`);
          const name = item.cqlTestCase.name;
          const answer = await vscode.window.showWarningMessage(
            `Delete test case "${name}" and all its resources?`,
            { modal: true },
            'Delete',
          );
          if (answer !== 'Delete') {
            return;
          }
          try {
            await deleteTestCase(item.cqlTestCase.uri);
            // Targeted update: remove from model, refresh only the Test Cases node
            const libraryName = path.basename(path.dirname(item.cqlTestCase.uri.fsPath));
            const library = this.cqlProjects
              .flatMap(p => p.Libraries)
              .find(lib => lib.name === libraryName);
            if (!library) {
              this.cqlProjects.forEach(p => p.refresh());
              return;
            }
            library.removeTestCase(item.cqlTestCase);
            const testCaseRootItem = this.findTestCaseRootTreeItem(library.uri.fsPath);
            if (!testCaseRootItem) {
              this.cqlProjects.forEach(p => p.refresh());
              return;
            }
            testCaseRootItem.resetChildren();
            this.cqlLibraryTreeProvider.refreshItem(testCaseRootItem);
          } catch (err) {
            vscode.window.showErrorMessage(
              `Failed to delete test case: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      ),

      // Explorer Refresh
      vscode.commands.registerCommand('cql.explorer.refresh', () =>
        this.cqlProjects.forEach(p => p.refresh()),
      ),

      // Expand all libraries and their children
      vscode.commands.registerCommand('cql.explorer.expand-all', async () => {
        for (const item of this.cqlLibraryTreeProvider.getRootItems()) {
          await this.treeView.reveal(item, { expand: 3 });
        }
      }),

      // Hide libraries with no test cases
      vscode.commands.registerCommand('cql.explorer.hide-empty', () => {
        this.hideEmpty = true;
        this.cqlLibraryTreeProvider.setHideEmpty(true);
        vscode.commands.executeCommand('setContext', 'cql.hideEmptyLibraries', true);
        this.updateTreeViewDescription();
      }),

      // Show all libraries
      vscode.commands.registerCommand('cql.explorer.show-all', () => {
        this.hideEmpty = false;
        this.cqlLibraryTreeProvider.setHideEmpty(false);
        vscode.commands.executeCommand('setContext', 'cql.hideEmptyLibraries', false);
        this.updateTreeViewDescription();
      }),

      // Filter by library name
      vscode.commands.registerCommand('cql.explorer.filter-by-name', async () => {
        const input = await vscode.window.showInputBox({
          prompt: 'Filter libraries by name',
          placeHolder: 'e.g. CervicalCancer',
          value: this.nameFilter,
        });
        if (input === undefined) {
          return;
        }
        this.nameFilter = input;
        this.cqlLibraryTreeProvider.setNameFilter(input);
        vscode.commands.executeCommand('setContext', 'cql.nameFilterActive', input !== '');
        this.updateTreeViewDescription();
      }),

      // Clear name filter
      vscode.commands.registerCommand('cql.explorer.clear-name-filter', () => {
        this.nameFilter = '';
        this.cqlLibraryTreeProvider.setNameFilter('');
        vscode.commands.executeCommand('setContext', 'cql.nameFilterActive', false);
        this.updateTreeViewDescription();
      }),

      // Sort A → Z
      vscode.commands.registerCommand('cql.explorer.sort-asc', () => {
        this.sortDescending = false;
        this.cqlLibraryTreeProvider.setSortDescending(false);
        vscode.commands.executeCommand('setContext', 'cql.sortDescending', false);
        this.updateTreeViewDescription();
      }),

      // Sort Z → A
      vscode.commands.registerCommand('cql.explorer.sort-desc', () => {
        this.sortDescending = true;
        this.cqlLibraryTreeProvider.setSortDescending(true);
        vscode.commands.executeCommand('setContext', 'cql.sortDescending', true);
        this.updateTreeViewDescription();
      }),

      // Enable layout deviation warnings (icons + Problems panel)
      vscode.commands.registerCommand('cql.explorer.show-layout-warnings', () => {
        this.showLayoutWarnings = true;
        this.cqlLibraryTreeProvider.setShowDeviationWarnings(true);
        vscode.commands.executeCommand('setContext', 'cql.showLayoutWarnings', true);
        this.publishDiagnostics();
      }),

      // Disable layout deviation warnings
      vscode.commands.registerCommand('cql.explorer.hide-layout-warnings', () => {
        this.showLayoutWarnings = false;
        this.cqlLibraryTreeProvider.setShowDeviationWarnings(false);
        vscode.commands.executeCommand('setContext', 'cql.showLayoutWarnings', false);
        this.diagnostics.clear();
      }),

      // Select a subset of (filtered) test cases and execute them
      vscode.commands.registerCommand(
        'cql.explorer.test-case.execute-select',
        async (item: CqlTestCaseRootTreeItem) => {
          logger.debug(`Command cql.explorer.test-case.execute-select selected`);
          const testCases = item.children
            .filter((c): c is CqlTestCaseTreeItem => c instanceof CqlTestCaseTreeItem)
            .map(c => ({ label: c.cqlTestCase.name, testCase: c.cqlTestCase }));
          if (testCases.length === 0) {
            vscode.window.showInformationMessage('No test cases match the current filter.');
            return;
          }
          const picks = await vscode.window.showQuickPick(testCases, {
            canPickMany: true,
            placeHolder: 'Select test cases to execute',
            title: `Execute Test Cases — ${item.cqlLibrary.fileName}`,
          });
          if (!picks || picks.length === 0) {
            return;
          }
          await executeCQLFile(
            item.cqlLibrary.uri,
            picks.map(p => ({ name: p.testCase.name, path: p.testCase.uri })),
          );
        },
      ),

      // Execute all visible (filtered) test cases for a library
      vscode.commands.registerCommand(
        'cql.explorer.test-case.execute-all',
        async (item: CqlTestCaseRootTreeItem) => {
          logger.debug(`Command cql.explorer.test-case.execute-all selected`);
          const testCases = item.children
            .filter((c): c is CqlTestCaseTreeItem => c instanceof CqlTestCaseTreeItem)
            .map(c => ({ name: c.cqlTestCase.name, path: c.cqlTestCase.uri }));
          if (testCases.length === 0) {
            vscode.window.showInformationMessage('No test cases match the current filter.');
            return;
          }
          await executeCQLFile(item.cqlLibrary.uri, testCases);
        },
      ),

      // Filter test cases within a library
      vscode.commands.registerCommand(
        'cql.explorer.test-case.filter',
        async (item: CqlTestCaseRootTreeItem) => {
          logger.debug(`Command cql.explorer.test-case.filter selected`);
          const input = await vscode.window.showInputBox({
            prompt: 'Filter test cases by name or description',
            placeHolder: 'e.g. cancer',
            value: item.activeFilter,
          });
          if (input === undefined) {
            return;
          }
          this.cqlLibraryTreeProvider.setTestCaseFilter(item.cqlLibrary.uri.fsPath, input);
        },
      ),

      // Clear per-library test case filter
      vscode.commands.registerCommand(
        'cql.explorer.test-case.clear-filter',
        (item: CqlTestCaseRootTreeItem) => {
          logger.debug(`Command cql.explorer.test-case.clear-filter selected`);
          this.cqlLibraryTreeProvider.setTestCaseFilter(item.cqlLibrary.uri.fsPath, '');
        },
      ),
    );
  }

  /**
   * Reload a test case's resource list from disk and sync its tree item children,
   * then fire a targeted tree update on just that item (no full rebuild, no flash).
   */
  private reloadTestCaseTreeItem(item: CqlTestCaseTreeItem): void {
    item.cqlTestCase.clearResources();
    const entries = fs.readdirSync(item.cqlTestCase.uri.fsPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        item.cqlTestCase.addResource(
          vscode.Uri.file(path.join(item.cqlTestCase.uri.fsPath, entry.name)),
        );
      }
    }
    item.clearChildren();
    item.cqlTestCase.resources
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(r => item.addTestCaseResource(r));
  }

  /** Find the CqlTestCaseRootTreeItem for the library at the given fsPath. */
  private findTestCaseRootTreeItem(libraryFsPath: string): CqlTestCaseRootTreeItem | undefined {
    for (const root of this.cqlLibraryTreeProvider.getRootItems()) {
      const libRoots =
        root instanceof CqlLibraryRootTreeItem
          ? [root]
          : root instanceof CqlProjectRootTreeItem
            ? root.children.filter((c): c is CqlLibraryRootTreeItem => c instanceof CqlLibraryRootTreeItem)
            : [];
      for (const libRootItem of libRoots) {
        const libRoot = libRootItem as CqlLibraryRootTreeItem;
        if (libRoot.cqlLibraryTreeItem.cqlLibrary.uri.fsPath === libraryFsPath) {
          for (const child of libRoot.children) {
            if (child instanceof CqlTestCaseRootTreeItem) {
              return child;
            }
          }
        }
      }
    }
    return undefined;
  }

  /** Find the CqlTestCaseTreeItem whose test case directory matches the given path. */
  private findTestCaseTreeItem(testCaseDirPath: string): CqlTestCaseTreeItem | undefined {
    for (const root of this.cqlLibraryTreeProvider.getRootItems()) {
      const libRoots =
        root instanceof CqlLibraryRootTreeItem
          ? [root]
          : root instanceof CqlProjectRootTreeItem
            ? root.children.filter((c): c is CqlLibraryRootTreeItem => c instanceof CqlLibraryRootTreeItem)
            : [];
      for (const libRootItem of libRoots) {
        for (const child of (libRootItem as CqlLibraryRootTreeItem).children) {
          if (child instanceof CqlTestCaseRootTreeItem) {
            for (const tcItem of child.children) {
              if (
                tcItem instanceof CqlTestCaseTreeItem &&
                tcItem.cqlTestCase.uri.fsPath === testCaseDirPath
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

  /** Publish layout deviation diagnostics to the VS Code Problems panel. */
  private publishDiagnostics(): void {
    this.diagnostics.clear();
    for (const project of this.cqlProjects) {
      if (project.projectDeviations.has(DeviationKind.MULTI_PROJECT_WORKSPACE)) {
        const igIniPath = path.join(project.igRoot, 'ig.ini');
        const anchor = fs.existsSync(igIniPath)
          ? vscode.Uri.file(igIniPath)
          : vscode.Uri.file(project.igRoot);
        appendDiagnostic(
          this.diagnostics,
          anchor,
          vscode.DiagnosticSeverity.Warning,
          `Project '${project.name}' is a sub-project inside a multi-project workspace. ` +
            `Standard convention uses one IG project per workspace root.`,
        );
      }
      for (const lib of project.Libraries) {
        for (const kind of lib.deviations) {
          if (kind === DeviationKind.MISSING_RESOURCE_TYPE) {
            appendDiagnostic(
              this.diagnostics,
              lib.uri,
              vscode.DiagnosticSeverity.Warning,
              `Test cases for '${lib.name}' are in 'input/tests/${lib.name}/'. ` +
                `Standard convention uses 'input/tests/{ResourceType}/${lib.name}/' ` +
                `(e.g. Library, Measure, PlanDefinition).`,
            );
          } else if (kind === DeviationKind.UNKNOWN_RESOURCE_TYPE) {
            appendDiagnostic(
              this.diagnostics,
              lib.uri,
              vscode.DiagnosticSeverity.Warning,
              `Test cases for '${lib.name}' are under 'input/tests/${lib.resourceTypeDir}/'. ` +
                `'${lib.resourceTypeDir}' is not a recognized FHIR resource type name. ` +
                `Standard convention uses one of: Library, Measure, PlanDefinition, Questionnaire, ActivityDefinition.`,
            );
          }
        }
      }
    }
  }

  private setClipboard(value: { uris: vscode.Uri[]; operation: 'copy' | 'cut' } | null): void {
    this.clipboard = value;
    vscode.commands.executeCommand('setContext', 'cql.hasResourceClipboard', value !== null);
  }

  private resourceUrisFrom(
    item: CqlTestCaseResourceTreeItem,
    all?: CqlTestCaseResourceTreeItem[],
  ): vscode.Uri[] {
    const items = all && all.length > 0 ? all : [item];
    return items
      .filter((i): i is CqlTestCaseResourceTreeItem => i instanceof CqlTestCaseResourceTreeItem)
      .map(i => i.resource.uri);
  }

}
