/**
 * CqlSolution is the top-level domain model for a CQL authoring workspace.
 *
 * A solution is a logical container for one or more CqlProjects, analogous
 * to a .NET solution (.sln) file. It is independent of VS Code's workspace
 * folder concept — the workspace is used only for initial project discovery
 * inside getCurrent(), and nowhere else in the extension.
 *
 * Today the solution is runtime-only (no file on disk). A future
 * `cql-solution.json` could explicitly list project paths; the factory
 * would read it when present and fall back to auto-discovery when absent.
 */
import * as path from 'node:path';
import { Uri, workspace } from 'vscode';
import { logger } from '../extensionLogger';
import { detectIgProjects } from './igLayoutDetector';
import { CqlProject } from './cqlProject';

export class CqlSolution {
  private static _current: CqlSolution | undefined;

  /** All projects in this solution, in discovery order. */
  public readonly projects: ReadonlyArray<CqlProject>;

  private constructor(projects: CqlProject[]) {
    this.projects = Object.freeze([...projects]);
  }

  /**
   * Returns the current CqlSolution, creating it on first call.
   *
   * This is the single place in the extension that reads
   * workspace.workspaceFolders. All other code works with CqlSolution
   * and CqlProject objects directly.
   */
  public static getCurrent(): CqlSolution {
    if (!CqlSolution._current) {
      const folders = workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        return (CqlSolution._current = new CqlSolution([]));
      }
      const workspaceRoot = folders[0].uri.fsPath;
      let projects = detectIgProjects(workspaceRoot).map(
        info => new CqlProject(info.root, info.deviations),
      );
      if (projects.length === 0) {
        projects = [new CqlProject(workspaceRoot, [])];
      }
      CqlSolution._current = new CqlSolution(projects);
      logger.info(`solution: loading (${projects.length} project${projects.length === 1 ? '' : 's'})`);
    }
    return CqlSolution._current;
  }

  /**
   * Dispose the current solution, allowing the next getCurrent() call to
   * re-discover projects. Call this when the workspace changes.
   */
  public static reset(): void {
    CqlSolution._current = undefined;
  }

  /**
   * Returns the project that owns the given URI, or undefined if no project
   * claims it. A project owns a URI when the URI's fsPath is equal to or
   * starts with the project's igRoot.
   */
  public findProjectForUri(uri: Uri): CqlProject | undefined {
    return this.projects.find(
      p => uri.fsPath === p.igRoot || uri.fsPath.startsWith(p.igRoot + path.sep),
    );
  }
}
