import { commands, ProgressLocation, Uri, window } from 'vscode';
import { executeCQLFile } from './execute-cql-file';
import * as log from '../log-services/logger';

export type LibraryExecutor = (uri: Uri) => Promise<void>;

export interface LibraryBatchOptions {
  /**
   * Pause (ms) between libraries — not applied after the last one.
   * `select-libraries` uses 500 to space out its many language server calls.
   */
  delayMs?: number;
  /**
   * Injectable for testing; default calls `executeCQLFile` with `showCompletion = false`
   * so per-library toasts are suppressed and the batch stays the only visible signal.
   */
  execute?: LibraryExecutor;
}

export interface BatchResult {
  /** Number of libraries that completed without error or cancellation. */
  completed: number;
  /** Number of libraries that threw before completing. */
  failed: number;
  /** Names of libraries that threw, in insertion order. */
  failedNames: string[];
  /** True if the user cancelled via the progress notification. */
  cancelled: boolean;
  /** Total elapsed seconds (rounded to 1 decimal). */
  elapsedSeconds: number;
}

const defaultExecutor: LibraryExecutor = uri =>
  executeCQLFile(uri, undefined, false, undefined, false);

const MAX_FAILED_NAMES_IN_SUMMARY = 3;

/**
 * Executes each library in sequence under a single cancellable progress notification.
 * Per-library completion toasts are suppressed so they don't stack on top of (and
 * hide) the cancellable progress notification; a single summary message is shown when
 * the batch ends.
 *
 * Cancellation: checked before each library. A library already in flight will run to
 * completion even after Cancel — this matches the prior behavior.
 *
 * Failures: each `execute` call is wrapped in try/catch. Errors are logged via
 * `log.error` and recorded for the end-of-batch summary; the batch continues.
 */
export async function runLibraryBatch(
  libs: ReadonlyArray<{ name: string; uri: Uri }>,
  title: string,
  options: LibraryBatchOptions = {},
): Promise<BatchResult> {
  const { delayMs, execute = defaultExecutor } = options;

  const result = await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title,
      cancellable: true,
    },
    async (progress, token): Promise<BatchResult> => {
      const batchStart = Date.now();
      let completed = 0;
      const failedNames: string[] = [];

      for (let i = 0; i < libs.length; i++) {
        if (token.isCancellationRequested) {
          break;
        }
        const lib = libs[i];
        progress.report({
          message: `${lib.name} (${i + 1} of ${libs.length})`,
          increment: 100 / libs.length,
        });

        const libStart = Date.now();
        try {
          await execute(lib.uri);
          completed++;
          log.info(
            `[PERF] ${lib.name}: ${((Date.now() - libStart) / 1000).toFixed(1)}s`,
          );
        } catch (e) {
          log.error(`Error executing CQL for ${lib.name}`, e);
          failedNames.push(lib.name);
        }

        if (delayMs !== undefined && delayMs > 0 && i < libs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      const elapsedSeconds = Number(((Date.now() - batchStart) / 1000).toFixed(1));
      log.info(
        `[PERF] batch total (${libs.length} libraries): ${elapsedSeconds.toFixed(1)}s`,
      );

      return {
        completed,
        failed: failedNames.length,
        failedNames,
        // Read after the loop so a Cancel clicked during the last library is still reported.
        cancelled: token.isCancellationRequested,
        elapsedSeconds,
      };
    },
  );

  // Shown after withProgress resolves, and not awaited: a non-modal toast's promise only
  // settles when the user interacts with it, so awaiting it inside the progress task would
  // keep the progress notification (and this function) pending indefinitely.
  showBatchSummary(result, libs.length);
  return result;
}

function showBatchSummary(result: BatchResult, total: number): void {
  const { completed, failed, failedNames, cancelled, elapsedSeconds } = result;
  const elapsed = `(${elapsedSeconds.toFixed(1)}s)`;

  if (failed === 0) {
    // "library" agrees with the leading count, not the trailing total.
    const succeededLabel = total === 1 ? 'library' : 'libraries';
    window.showInformationMessage(
      cancelled
        ? `CQL execution cancelled — ${completed}/${total} libraries ${elapsed}`
        : `CQL execution complete — ${total} ${succeededLabel} ${elapsed}`,
    );
    return;
  }

  // "...1 of 3 libraries failed" — "libraries" agrees with the trailing total.
  const displayed = failedNames.slice(0, MAX_FAILED_NAMES_IN_SUMMARY).join(', ');
  const ellipsis = failedNames.length > MAX_FAILED_NAMES_IN_SUMMARY ? '…' : '';
  const notRun = total - completed - failed;
  const notRunSuffix = notRun > 0 ? `; ${notRun} not run` : '';
  const outcome = cancelled ? 'cancelled' : 'finished';
  void window
    .showWarningMessage(
      `CQL execution ${outcome} — ${failed} of ${total} libraries failed: ${displayed}${ellipsis}${notRunSuffix} ${elapsed}`,
      'Open Logs',
    )
    .then(selection => {
      if (selection === 'Open Logs') {
        void commands.executeCommand('cql.open.logs');
      }
    });
}
