import { commands, ExtensionContext, Uri, window } from 'vscode';
import { Utils } from 'vscode-uri';
import { Commands } from '../commands/commands';
import { CqlProjectEvents } from '../model/cqlProject';
import { CqlSolution } from '../model/cqlSolution';
import { getCqlPaths, getLibraries } from '../helpers/cqlHelpers';
import { runLibraryBatch } from './library-batch';

let _context: ExtensionContext | undefined;

export function register(context: ExtensionContext): void {
  _context = context;

  const solution = CqlSolution.getCurrent();
  commands.executeCommand('setContext', 'cql.solutionLoaded', false);
  const total = solution.projects.length;
  if (total === 0) {
    commands.executeCommand('setContext', 'cql.solutionLoaded', true);
  } else {
    let loadedCount = solution.projects.filter(p => p.libraryShellsLoaded).length;
    if (loadedCount >= total) {
      commands.executeCommand('setContext', 'cql.solutionLoaded', true);
    } else {
      for (const project of solution.projects) {
        if (!project.libraryShellsLoaded) {
          project.once(CqlProjectEvents.LOADED, () => {
            if (++loadedCount >= total) {
              commands.executeCommand('setContext', 'cql.solutionLoaded', true);
            }
          });
        }
      }
    }
  }

  context.subscriptions.push(
    commands.registerCommand(Commands.EXECUTE_CQL_COMMAND_SELECT_LIBRARIES, async () => {
      selectLibraries();
    }),
  );
}

export async function selectLibraries(): Promise<void> {
  const activeUri = window.activeTextEditor?.document.uri;
  const solution = CqlSolution.getCurrent();
  const fallbackProject = solution.projects[0];
  const anchorUri = activeUri
    ? (solution.findProjectForUri(activeUri) ? activeUri : fallbackProject && Uri.file(fallbackProject.igRoot))
    : (fallbackProject && Uri.file(fallbackProject.igRoot));
  if (!anchorUri) {
    window.showErrorMessage('No CQL project found in this workspace.');
    return;
  }
  const cqlPaths = getCqlPaths(anchorUri);
  if (!cqlPaths) {
    window.showErrorMessage('Unable to determine needed CQL Paths.');
    return;
  }

  const libraries = getLibraries(cqlPaths.libraryDirectoryPath);
  const quickPickItems = libraries
    .map(uri => ({ label: Utils.basename(uri), uri }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const quickPick = window.createQuickPick<{ label: string; uri: Uri }>();
  if (quickPickItems.length > 0) {
    quickPick.items = quickPickItems;
    quickPick.canSelectMany = true;

    const stateKey = 'selectLibraries.selections';
    const savedSelections = _context?.workspaceState.get<string[]>(stateKey) ?? [];
    if (savedSelections.length > 0) {
      quickPick.selectedItems = quickPick.items.filter(item =>
        savedSelections.includes(item.label),
      );
    }

    quickPick.show();

    quickPick.onDidAccept(async () => {
      const selected = [...quickPick.selectedItems];
      _context?.workspaceState.update(stateKey, selected.map(item => item.label));
      quickPick.hide();

      if (selected.length === 0) {
        return;
      }

      await runLibraryBatch(
        selected.map(item => ({ name: item.label, uri: item.uri })),
        'Executing CQL Libraries',
        { delayMs: 500 },
      );
    });
  }
}
