import * as fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { logger } from '../extensionLogger';

export function fileExists(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.F_OK);
    return true;
  } catch (error) {
    logger.error(`error reading ${file}`, error);
    return false;
  }
}

export function isDirectory(directoryPath: string): boolean {
  try {
    return fs.statSync(directoryPath).isDirectory();
  } catch (error) {
    logger.error(`error reading ${directoryPath}`, error);
    return false;
  }
}

/**
 * Recursively searches for a subdirectory with a specific name.
 * @param folderPath The directory to start the search from.
 * @param folderName The name of the folder to find.
 * @returns The full path of the first matching folder found, or null if not found.
 */
/**
 * Converts a filesystem path to a POSIX-style string suitable for use in glob patterns.
 * The `glob` package requires forward slashes in patterns; on Windows, `Uri.fsPath`
 * returns backslashes which would cause glob to produce no results.
 *
 * | Platform              | Input                    | Output                   |
 * |-----------------------|--------------------------|--------------------------|
 * | macOS / Linux         | /path/to/file            | /path/to/file            |
 * | Windows backslash     | C:\path\to\file          | C:/path/to/file          |
 * | Windows forward slash | C:/path/to/file          | C:/path/to/file          |
 */
export function toGlobPath(fsPath: string): string {
  return fsPath.replace(/\\/g, '/');
}

export function findSubFolderByName(folderPath: string, folderName: string): vscode.Uri | null {
  try {
    logger.info(`looking in ${folderPath} for ${folderName}`);
    // Read all entries in the current directory with file types
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      logger.info(`checking ${entry.name} for test cases`);
      const fullPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) {
        // Check if the current directory name matches the target name
        if (entry.name === folderName) {
          return vscode.Uri.file(fullPath); // Found the folder, return its path
        }

        // Recursively search in subdirectories
        const foundPath = findSubFolderByName(fullPath, folderName);
        if (foundPath) {
          return foundPath; // A subdirectory found the folder, return the path
        }
      }
    }
  } catch (error) {
    logger.error(`error reading directory ${folderPath}`, error);
  }

  return null; // Folder not found in this branch
}
