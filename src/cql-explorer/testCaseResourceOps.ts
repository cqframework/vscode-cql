import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { extractResourceId, replaceIds } from './idReplacer';

/**
 * Delete one or more resource files.
 */
export async function deleteResources(uris: vscode.Uri[]): Promise<void> {
  for (const uri of uris) {
    await fs.promises.unlink(uri.fsPath);
  }
}

/**
 * Delete an entire test case directory and all its contents.
 */
export async function deleteTestCase(dirUri: vscode.Uri): Promise<void> {
  fs.rmSync(dirUri.fsPath, { recursive: true, force: true });
}

/**
 * Standard copy: copy files as-is into destDir.
 * Throws if any destination file already exists.
 */
export async function copyResources(uris: vscode.Uri[], destDir: vscode.Uri): Promise<void> {
  checkConflicts(uris, destDir);
  for (const uri of uris) {
    const destFile = path.join(destDir.fsPath, path.basename(uri.fsPath));
    await fs.promises.copyFile(uri.fsPath, destFile);
  }
}

/**
 * Standard move: copy files as-is into destDir, then delete sources.
 * Throws if any destination file already exists.
 */
export async function moveResources(uris: vscode.Uri[], destDir: vscode.Uri): Promise<void> {
  await copyResources(uris, destDir);
  for (const uri of uris) {
    await fs.promises.unlink(uri.fsPath);
  }
}

/**
 * Enhanced copy: rewrite patient UUID and resource IDs, then write to destDir.
 *
 * - Source patient UUID  → destination patient UUID (directory basename)
 * - Each other resource ID in the batch → fresh UUID
 *
 * This ensures intra-batch cross-references remain consistent and all filenames
 * are unique in the destination directory.
 */
export async function enhancedCopyResources(
  uris: vscode.Uri[],
  destDir: vscode.Uri,
): Promise<void> {
  const sortedEntries = buildEnhancedIdMap(uris, destDir);
  for (const uri of uris) {
    const content = await fs.promises.readFile(uri.fsPath, 'utf8');
    const newContent = replaceIds(content, sortedEntries);
    const newName = replaceIds(path.basename(uri.fsPath), sortedEntries);
    await fs.promises.writeFile(path.join(destDir.fsPath, newName), newContent, 'utf8');
  }
}

/**
 * Enhanced move: enhanced copy, then delete sources.
 */
export async function enhancedMoveResources(
  uris: vscode.Uri[],
  destDir: vscode.Uri,
): Promise<void> {
  await enhancedCopyResources(uris, destDir);
  for (const uri of uris) {
    await fs.promises.unlink(uri.fsPath);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function checkConflicts(uris: vscode.Uri[], destDir: vscode.Uri): void {
  for (const uri of uris) {
    const destFile = path.join(destDir.fsPath, path.basename(uri.fsPath));
    if (fs.existsSync(destFile)) {
      throw new Error(
        `Destination already has file "${path.basename(uri.fsPath)}". Remove it first or use enhanced paste.`,
      );
    }
  }
}

function buildEnhancedIdMap(
  uris: vscode.Uri[],
  destDir: vscode.Uri,
): [string, string][] {
  const destPatientId = path.basename(destDir.fsPath);
  const idMap = new Map<string, string>();

  for (const uri of uris) {
    const srcPatientId = path.basename(path.dirname(uri.fsPath));
    if (srcPatientId !== destPatientId && !idMap.has(srcPatientId)) {
      idMap.set(srcPatientId, destPatientId);
    }
    const id = extractResourceId(path.basename(uri.fsPath));
    if (id && !idMap.has(id)) {
      idMap.set(id, randomUUID());
    }
  }

  return [...idMap.entries()].sort((a, b) => b[0].length - a[0].length);
}
