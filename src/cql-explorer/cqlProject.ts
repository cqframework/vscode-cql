/**
 * cqlProject.ts file holds the models which represents a complete cql project.
 * Separating the models from the CQL Explorer UI components allows for different views
 * to use the same model and avoid duplicating 'business' logic across multiple views.
 */
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import path from 'node:path';
import { FileSystemWatcher, RelativePattern, Uri, workspace } from 'vscode';
import { logger } from '../extensionLogger';
import { fileExists, isDirectory } from '../helpers/fileHelper';
import { extractTestCaseDescription } from '../model/testCase';
import { ObservableProperty } from '../shared/ObservableProperty';
import { RobustEmitter } from '../shared/RobustEmitter';
import { DeviationKind, detectIgProjects, findTestCasesFolder } from './igLayoutDetector';

export class CqlTestCaseResult {}

export type TestCaseLoadState = 'not-loaded' | 'loading' | 'loaded';

export interface CqlTestCaseResource {
  readonly name: string;
  readonly uri: Uri;
}

export class CqlTestCase extends RobustEmitter {
  private readonly _resources: Array<CqlTestCaseResource> = [];
  public readonly name: string;
  public readonly uri: Uri;
  public description: string | undefined;

  constructor(uri: Uri) {
    super();
    if (!isDirectory(uri.fsPath))
      throw new Error(`Cql Test Case uri [${uri.fsPath}] should be a directory.`);
    this.uri = uri;
    this.name = path.basename(uri.fsPath);
  }

  public addResource(uri: Uri) {
    this._resources.push({ name: path.basename(uri.fsPath), uri });
  }

  public removeResource(uri: Uri): void {
    const idx = this._resources.findIndex(r => r.uri.fsPath === uri.fsPath);
    if (idx !== -1) this._resources.splice(idx, 1);
  }

  public clearResources(): void {
    this._resources.length = 0;
  }

  public get resources(): Array<CqlTestCaseResource> {
    return Array.from(this._resources);
  }
}

export enum CqlLibraryEvents {
  DELETED = 'deleted',
  TESTCASE_ADDED = 'testcase-added',
  TESTCASE_REMOVED = 'testcase-removed',
  RESULT_CHANGED = 'result-changed',
  TESTCASE_RESOURCES_CHANGED = 'testcase-resources-changed',
  TESTCASE_DESCRIPTION_CHANGED = 'testcase-description-changed',
}

export class CqlLibrary extends RobustEmitter {
  static readonly FILE_EXT = 'cql';
  static readonly Events = CqlLibraryEvents;

  private readonly testCases: Array<CqlTestCase> = [];
  private _resultUris: Uri[] = [];
  public readonly name: string;
  public readonly visible: ObservableProperty<boolean>;
  public readonly uri: Uri;
  /** Deviations from the standard test case layout convention detected for this library. */
  public readonly deviations: Set<DeviationKind> = new Set();
  /** The unrecognized resource-type dir name (populated when UNKNOWN_RESOURCE_TYPE is present). */
  public resourceTypeDir: string | undefined;
  /** Tracks whether test cases have been loaded for this library. */
  public testCaseLoadState: TestCaseLoadState = 'not-loaded';

  constructor(uri: Uri, visible: boolean = true) {
    super();
    this.uri = uri;
    this.name = path.basename(uri.fsPath, path.extname(uri.fsPath));
    this.visible = new ObservableProperty(visible);
  }

  public addDeviations(kinds: DeviationKind[]): void {
    for (const kind of kinds) {
      this.deviations.add(kind);
    }
  }

  get resultUris(): Uri[] {
    return [...this._resultUris];
  }

  addResult(uri: Uri): void {
    if (!this._resultUris.some(u => u.fsPath === uri.fsPath)) {
      this._resultUris.push(uri);
    }
    this.emit(CqlLibraryEvents.RESULT_CHANGED);
  }

  removeResult(uri: Uri): void {
    this._resultUris = this._resultUris.filter(u => u.fsPath !== uri.fsPath);
    this.emit(CqlLibraryEvents.RESULT_CHANGED);
  }

  clearResults(): void {
    this._resultUris = [];
    this.emit(CqlLibraryEvents.RESULT_CHANGED);
  }

  public delete() {
    logger.debug(`delete event triggered for ${this.name}`);
    this.emit(CqlLibrary.Events.DELETED);
  }

  public addTestCase(testCase: CqlTestCase) {
    this.testCases.push(testCase);
    this.emit(CqlLibrary.Events.TESTCASE_ADDED);
  }

  public removeTestCase(testCase: CqlTestCase) {
    const index = this.testCases.indexOf(testCase);
    if (index !== -1) {
      this.testCases.splice(index, 1);
      this.emit(CqlLibrary.Events.TESTCASE_REMOVED, testCase);
    }
  }

  public get TestCases(): Array<CqlTestCase> {
    return Array.from(this.testCases);
  }

  public get fileName(): string {
    return path.basename(this.uri.fsPath);
  }
}

export enum CqlProjectEvents {
  LIBRARY_ADDED = 'library-added',
  LIBRARY_REMOVED = 'library-removed',
  REFRESH = 'refresh',
  LOADED = 'loaded',
  LIBRARY_TESTCASES_LOADED = 'library-testcases-loaded',
  SCAN_COMPLETE = 'scan-complete',
}

export class CqlProject extends EventEmitter {
  private static _instances: CqlProject[] | undefined;
  static readonly Events = CqlProjectEvents;

  public readonly igRoot: string;
  public readonly name: string;
  public readonly projectDeviations: Set<DeviationKind>;

  private _scanGeneration: number = 0;
  private _loadStart = Date.now();
  private readonly _libraries: Map<string, CqlLibrary> = new Map();
  private readonly libraryFolder: string;
  private readonly libraryFolderWatcher: FileSystemWatcher;
  private readonly resultFolder: string;
  private readonly testFolder: string;
  private testFolderWatcher: FileSystemWatcher | undefined;
  private testCaseResourceWatcher: FileSystemWatcher | undefined;
  private resultFolderWatcher: FileSystemWatcher | undefined;
  private individualResultFolderWatcher: FileSystemWatcher | undefined;

  public static getInstances(): CqlProject[] {
    if (!CqlProject._instances) {
      const folders = workspace.workspaceFolders;
      if (!folders || folders.length === 0) return [];
      const workspaceRoot = folders[0].uri.fsPath;
      CqlProject._instances = detectIgProjects(workspaceRoot).map(
        info => new CqlProject(info.root, info.deviations),
      );
      // Fallback: if no IG projects detected, treat workspace root as single project
      if (CqlProject._instances.length === 0) {
        CqlProject._instances = [new CqlProject(workspaceRoot, [])];
      }
    }
    return CqlProject._instances;
  }

  /** @deprecated Use getInstances()[0] for single-project workspaces. */
  public static getInstance(): CqlProject {
    return CqlProject.getInstances()[0];
  }

  public static resetInstances(): void {
    CqlProject._instances = undefined;
  }

  constructor(igRoot: string, projectDeviations: DeviationKind[] = []) {
    super();
    this.igRoot = igRoot;
    this.name = path.basename(igRoot);
    this.projectDeviations = new Set(projectDeviations);

    this.libraryFolder = path.join(igRoot, 'input', 'cql');
    this.testFolder = path.join(igRoot, 'input', 'tests');
    this.resultFolder = path.join(igRoot, 'input', 'tests', 'results');

    this.loadLibraries().catch(e => logger.error('Failed to load libraries', e));

    this.libraryFolderWatcher = workspace.createFileSystemWatcher(
      new RelativePattern(this.libraryFolder, `*.${CqlLibrary.FILE_EXT}`),
    );
    this.configureLibraryWatcher();
  }

  private configureLibraryWatcher() {
    this.libraryFolderWatcher.onDidCreate(async (uri: Uri) => {
      logger.debug(`library ${uri.fsPath} creation detected`);
      await this.createLibraryShell(uri);
      const lib = this._libraries.get(uri.fsPath);
      if (lib) await this.loadTestCasesForLibrary(lib);
      logger.debug(`library instance ${uri.fsPath} created`);
    });
    this.libraryFolderWatcher.onDidDelete((uri: Uri) => {
      logger.debug(`library ${uri.fsPath} deletion detected`);
      this.removeLibrary(uri);
      logger.debug(`library instance ${uri.fsPath} deleted`);
    });
  }

  private configureTestFolderWatcher() {
    this.testFolderWatcher!.onDidCreate((uri: Uri) => {
      if (isDirectory(uri.fsPath) && !uri.fsPath.startsWith(this.resultFolder + path.sep)) {
        this.refresh();
      }
    });
    this.testFolderWatcher!.onDidDelete((uri: Uri) => {
      if (!path.extname(uri.fsPath) && !uri.fsPath.startsWith(this.resultFolder + path.sep)) {
        this.refresh(); // no extension → directory
      }
    });
    // onDidChange intentionally omitted — resource-level changes are handled by testCaseResourceWatcher
  }

  private configureResultFolderWatcher() {
    this.resultFolderWatcher!.onDidCreate((uri: Uri) => {
      const name = path.basename(uri.fsPath, path.extname(uri.fsPath));
      this.findLibraryByName(name)?.addResult(uri);
    });
    this.resultFolderWatcher!.onDidDelete((uri: Uri) => {
      const name = path.basename(uri.fsPath, path.extname(uri.fsPath));
      this.findLibraryByName(name)?.removeResult(uri);
    });
    this.resultFolderWatcher!.onDidChange((uri: Uri) => {
      const name = path.basename(uri.fsPath, path.extname(uri.fsPath));
      this.findLibraryByName(name)?.addResult(uri);
    });
  }

  private configureIndividualResultFolderWatcher() {
    this.individualResultFolderWatcher!.onDidCreate((uri: Uri) => {
      this.findLibraryFromResultUri(uri)?.addResult(uri);
    });
    this.individualResultFolderWatcher!.onDidDelete((uri: Uri) => {
      this.findLibraryFromResultUri(uri)?.removeResult(uri);
    });
    this.individualResultFolderWatcher!.onDidChange((uri: Uri) => {
      this.findLibraryFromResultUri(uri)?.addResult(uri);
    });
  }

  private findLibraryFromResultUri(uri: Uri): CqlLibrary | undefined {
    const dirName = path.basename(path.dirname(uri.fsPath));
    return this.findLibraryByName(dirName);
  }

  private configureTestCaseResourceWatcher() {
    this.testCaseResourceWatcher!.onDidCreate(async (uri: Uri) => {
      const testCaseDir = path.dirname(uri.fsPath);
      const found = this.findTestCaseByDir(testCaseDir);
      if (found) {
        found.testCase.addResource(uri);
        found.library.emit(CqlLibraryEvents.TESTCASE_RESOURCES_CHANGED, found.testCase);
      } else {
        this.refresh();
      }
    });

    this.testCaseResourceWatcher!.onDidDelete(async (uri: Uri) => {
      const testCaseDir = path.dirname(uri.fsPath);
      const found = this.findTestCaseByDir(testCaseDir);
      if (found) {
        found.testCase.removeResource(uri);
        found.library.emit(CqlLibraryEvents.TESTCASE_RESOURCES_CHANGED, found.testCase);
      } else {
        this.refresh();
      }
    });

    this.testCaseResourceWatcher!.onDidChange(async (uri: Uri) => {
      const testCaseDir = path.dirname(uri.fsPath);
      const found = this.findTestCaseByDir(testCaseDir);
      if (found) {
        found.library.emit(CqlLibraryEvents.TESTCASE_RESOURCES_CHANGED, found.testCase);
        if (path.basename(uri.fsPath).startsWith('MeasureReport')) {
          try {
            const content = await fs.promises.readFile(uri.fsPath, 'utf-8');
            found.testCase.description = content.includes('cqfm-testCaseDescription')
              ? extractTestCaseDescription(JSON.parse(content) as Record<string, unknown>)
              : undefined;
          } catch {
            found.testCase.description = undefined;
          }
          found.library.emit(
            CqlLibraryEvents.TESTCASE_DESCRIPTION_CHANGED,
            found.testCase,
          );
        }
      }
    });
  }

  private findLibraryByName(name: string): CqlLibrary | undefined {
    return Array.from(this._libraries.values()).find(lib => lib.name === name);
  }

  private findTestCaseByDir(
    dir: string,
  ): { library: CqlLibrary; testCase: CqlTestCase } | undefined {
    for (const lib of this._libraries.values()) {
      const tc = lib.TestCases.find(tc => tc.uri.fsPath === dir);
      if (tc) {
        return { library: lib, testCase: tc };
      }
    }
    return undefined;
  }

  private async loadLibraries(): Promise<void> {
    this._loadStart = Date.now();
    const t0 = Date.now();
    try {
      const entries = await fs.promises.readdir(this.libraryFolder);
      entries.sort((a, b) => a.localeCompare(b));
      for (const libraryPath of entries) {
        await this.createLibraryShell(Uri.file(path.join(this.libraryFolder, libraryPath)));
      }
    } catch (e) {
      console.error('Error loading library data:', e);
    }
    logger.info(`[perf] ${this.name}: library scan: ${this._libraries.size} libraries found in ${Date.now() - t0}ms`);
    this.emit(CqlProject.Events.LOADED);
    // Phase 2 runs in background — not awaited
    this.startBackgroundTestScan().catch(e =>
      logger.error('Failed to scan test cases', e)
    );
  }

  private async createLibraryShell(uri: Uri): Promise<void> {
    if (!uri.fsPath.toLowerCase().endsWith(CqlLibrary.FILE_EXT)) return;
    if (!fileExists(uri.fsPath)) return;
    const cqlLibrary = new CqlLibrary(uri, true);
    this._libraries.set(cqlLibrary.uri.fsPath, cqlLibrary);
    this.emit(CqlProject.Events.LIBRARY_ADDED, cqlLibrary);
  }

  public async loadTestCasesForLibrary(
    library: CqlLibrary,
    typeDirEntries?: fs.Dirent[],
  ): Promise<void> {
    if (library.testCaseLoadState !== 'not-loaded') return;
    library.testCaseLoadState = 'loading';
    const t0 = Date.now();

    if (!typeDirEntries) {
      try {
        typeDirEntries = await fs.promises.readdir(
          path.join(this.igRoot, 'input', 'tests'),
          { withFileTypes: true },
        );
      } catch { /* input/tests may not exist */ }
    }

    const { folder, deviations, resourceTypeDir } = findTestCasesFolder(
      this.igRoot,
      library.name,
      typeDirEntries,
    );
    if (deviations.length > 0) library.addDeviations(deviations);
    if (resourceTypeDir) library.resourceTypeDir = resourceTypeDir;

    if (folder) {
      logger.debug(`found test cases folder ${folder}`);
      try {
        const entries = await fs.promises.readdir(folder, { withFileTypes: true });
        await Promise.allSettled(
          entries.filter(e => e.isDirectory()).map(async (entry) => {
            const fullPath = path.join(folder, entry.name);
            logger.debug(`test case path ${fullPath}`);
            const testCase = new CqlTestCase(Uri.file(fullPath));
            const files = await fs.promises.readdir(fullPath);
            for (const file of files) {
              testCase.addResource(Uri.file(path.join(fullPath, file)));
            }
            const mrFile = files.find(f => f.startsWith('MeasureReport'));
            if (mrFile) {
              try {
                const content = await fs.promises.readFile(
                  path.join(fullPath, mrFile),
                  'utf-8',
                );
                if (content.includes('cqfm-testCaseDescription')) {
                  testCase.description = extractTestCaseDescription(
                    JSON.parse(content) as Record<string, unknown>,
                  );
                }
              } catch {
                // description stays undefined; never fail the test case load
              }
            }
            library.addTestCase(testCase);
          }),
        );
      } catch (error) {
        logger.error(`Error loading test case data from ${folder}`, error);
      }
    } else {
      logger.debug(`did not find test cases folder for library ${library.name}`);
    }

    logger.info(`[perf] ${this.name}: ${library.name}: ${library.TestCases.length} test cases loaded in ${Date.now() - t0}ms${folder ? '' : ' (no test folder)'}`);
    library.testCaseLoadState = 'loaded';
    this.emit(CqlProject.Events.LIBRARY_TESTCASES_LOADED, library);
  }

  private async startBackgroundTestScan(): Promise<void> {
    const generation = this._scanGeneration;
    const t0 = Date.now();

    let typeDirEntries: fs.Dirent[] | undefined;
    try {
      typeDirEntries = await fs.promises.readdir(
        path.join(this.igRoot, 'input', 'tests'),
        { withFileTypes: true },
      );
    } catch { /* input/tests may not exist */ }

    const libraries = Array.from(this._libraries.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    logger.info(`[perf] ${this.name}: background scan started (${libraries.length} libraries)`);

    for (const library of libraries) {
      if (this._scanGeneration !== generation) return; // cancelled by refresh
      if (library.testCaseLoadState === 'not-loaded') {
        await this.loadTestCasesForLibrary(library, typeDirEntries);
      }
    }

    if (this._scanGeneration !== generation) return;

    await this.loadResults();
    this.startTestWatchers();
    const totalTestCases = Array.from(this._libraries.values())
      .reduce((sum, lib) => sum + lib.TestCases.length, 0);
    logger.info(`[perf] ${this.name}: background scan complete: ${libraries.length} libraries, ${totalTestCases} test cases in ${Date.now() - t0}ms`);
    logger.info(
      `[perf] ${this.name}: explorer ready: ${libraries.length} libraries, ` +
      `${totalTestCases} test cases in ${Date.now() - this._loadStart}ms`,
    );
    this.emit(CqlProject.Events.SCAN_COMPLETE);
  }

  private startTestWatchers(): void {
    this.testFolderWatcher = workspace.createFileSystemWatcher(
      new RelativePattern(this.testFolder, '**/*'),
    );
    this.configureTestFolderWatcher();

    this.testCaseResourceWatcher = workspace.createFileSystemWatcher(
      new RelativePattern(this.testFolder, '**/*.json'),
    );
    this.configureTestCaseResourceWatcher();

    this.resultFolderWatcher = workspace.createFileSystemWatcher(
      new RelativePattern(this.resultFolder, '*.txt'),
    );
    this.configureResultFolderWatcher();

    this.individualResultFolderWatcher = workspace.createFileSystemWatcher(
      new RelativePattern(this.resultFolder, '*/TestCaseResult-*.json'),
    );
    this.configureIndividualResultFolderWatcher();
  }

  private disposeTestWatchers(): void {
    this.testFolderWatcher?.dispose();
    this.testFolderWatcher = undefined;
    this.testCaseResourceWatcher?.dispose();
    this.testCaseResourceWatcher = undefined;
    this.resultFolderWatcher?.dispose();
    this.resultFolderWatcher = undefined;
    this.individualResultFolderWatcher?.dispose();
    this.individualResultFolderWatcher = undefined;
  }

  private async loadResults(): Promise<void> {
    const t0 = Date.now();
    let matched = 0;
    try {
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(this.resultFolder, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.txt')) {
          // Flat format: {LibraryName}.txt
          const name = path.basename(entry.name, '.txt');
          const lib = this.findLibraryByName(name);
          if (lib) {
            lib.addResult(Uri.file(path.join(this.resultFolder, entry.name)));
            matched++;
          }
        } else if (entry.isDirectory()) {
          // Individual format: {LibraryName}/TestCaseResult-{patientId}.json
          const lib = this.findLibraryByName(entry.name);
          if (lib) {
            try {
              const subEntries = await fs.promises.readdir(
                path.join(this.resultFolder, entry.name),
                { withFileTypes: true },
              );
              for (const sub of subEntries) {
                if (
                  sub.isFile() &&
                  sub.name.startsWith('TestCaseResult-') &&
                  sub.name.endsWith('.json')
                ) {
                  lib.addResult(
                    Uri.file(path.join(this.resultFolder, entry.name, sub.name)),
                  );
                  matched++;
                }
              }
            } catch {
              // subdir not readable — skip
            }
          }
        }
      }
    } catch (e) {
      logger.error('Error loading result data:', e);
    }
    logger.info(`[perf] ${this.name}: results loaded: ${matched} matched in ${Date.now() - t0}ms`);
  }

  /**
   * remove an existing library, and all related assets
   * @param uri file uri, expecting full path to file
   */
  private removeLibrary(uri: Uri) {
    if (!uri.fsPath.toLowerCase().endsWith(CqlLibrary.FILE_EXT)) {
      logger.warn(`library file [${uri.fsPath}] does not end with ${CqlLibrary.FILE_EXT}`);
      return;
    }
    const cqlLibrary = this._libraries.get(uri.fsPath);
    if (cqlLibrary) {
      this._libraries.delete(uri.fsPath);
      this.emit(CqlProject.Events.LIBRARY_REMOVED, cqlLibrary);
      logger.info(`library instance ${uri.fsPath} removed`);
    } else {
      logger.warn(`library instance ${uri.fsPath} was not found`);
    }
  }

  public get Libraries(): Array<CqlLibrary> {
    return Array.from(this._libraries.values());
  }

  public refresh() {
    logger.info('refresh requested');
    this._scanGeneration++;
    this._libraries.clear();
    this.disposeTestWatchers();
    this.loadLibraries().catch(e => logger.error('Failed to reload libraries', e));
    this.emit(CqlProject.Events.REFRESH);
  }
}
