import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { extractResourceId, replaceIds } from './idReplacer';

/**
 * Clone a test case directory. Every resource ID (directory name, filenames, and
 * JSON content) is replaced with a fresh UUID so the clone is independent of the source.
 *
 * @param srcUri  URI of the source test case directory (the patient UUID directory).
 * @returns       URI of the newly created destination directory.
 */
export async function cloneTestCase(srcUri: vscode.Uri): Promise<vscode.Uri> {
  const srcDir = srcUri.fsPath;
  const parentDir = path.dirname(srcDir);
  const oldTestCaseId = path.basename(srcDir);

  // Build ID map: old UUID → new UUID
  const idMap = new Map<string, string>();
  idMap.set(oldTestCaseId, randomUUID());

  const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const id = extractResourceId(entry.name);
    if (id && !idMap.has(id)) {
      idMap.set(id, randomUUID());
    }
  }

  // Sort longest-first to prevent short IDs from corrupting longer ones
  const sortedEntries = [...idMap.entries()].sort((a, b) => b[0].length - a[0].length);

  const newTestCaseId = idMap.get(oldTestCaseId)!;
  const destDir = path.join(parentDir, newTestCaseId);
  await fs.promises.mkdir(destDir);

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const srcFile = path.join(srcDir, entry.name);
    const content = await fs.promises.readFile(srcFile, 'utf8');
    const newContent = replaceIds(content, sortedEntries);
    const newName = replaceIds(entry.name, sortedEntries);
    await fs.promises.writeFile(path.join(destDir, newName), newContent, 'utf8');
  }

  return vscode.Uri.file(destDir);
}
