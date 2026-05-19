import { commands, ExtensionContext, ProgressLocation, Uri, window } from 'vscode';
import { Utils } from 'vscode-uri';
import { Commands } from '../commands/commands';
import { CqlProjectEvents } from '../model/cqlProject';
import { CqlSolution } from '../model/cqlSolution';
import { getCqlPaths, getLibraries } from '../helpers/cqlHelpers';
import { executeCQLFile } from './execute-cql-file';
import * as log from '../log-services/logger';

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

      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: 'Executing CQL Libraries',
          cancellable: true,
        },
        async (progress, token) => {
          const total = selected.length;
          const batchStart = Date.now();
          let completed = 0;
          for (let i = 0; i < total; i++) {
            if (token.isCancellationRequested) {
              break;
            }
            const item = selected[i];
            progress.report({
              message: `(${i + 1}/${total}) ${item.label}`,
              increment: (1 / total) * 100,
            });
            const libStart = Date.now();
            try {
              await executeCQLFile(item.uri, undefined, false, undefined, false);
              log.info(`[PERF] ${item.label}: ${((Date.now() - libStart) / 1000).toFixed(1)}s`);
              completed++;
            } catch (e) {
              log.error(`Error executing CQL for ${item.label}`, e);
              window.showErrorMessage(
                `Failed to execute ${item.label}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          const batchElapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
          log.info(`[PERF] selectLibraries total (${total} libraries): ${batchElapsed}s`);
          const msg =
            completed === total
              ? `CQL execution complete — ${total} ${total === 1 ? 'library' : 'libraries'} (${batchElapsed}s)`
              : `CQL execution cancelled — ${completed}/${total} libraries (${batchElapsed}s)`;
          window.showInformationMessage(msg);
        },
      );
    });
  }
}
