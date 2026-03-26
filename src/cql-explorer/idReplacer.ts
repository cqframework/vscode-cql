/**
 * Replace multiple old IDs with new IDs in a string.
 * Uses split/join instead of String.replace to avoid regex-metacharacter issues
 * with UUID strings containing dots and hyphens.
 *
 * @param text          The string to transform.
 * @param sortedEntries [oldId, newId] pairs sorted longest-first so that short IDs
 *                      cannot corrupt longer ones that share a prefix or suffix.
 */
export function replaceIds(text: string, sortedEntries: [string, string][]): string {
  let result = text;
  for (const [oldId, newId] of sortedEntries) {
    result = result.split(oldId).join(newId);
  }
  return result;
}

/**
 * Extract the resource ID from a filename of the form `{ResourceType}-{id}.json`.
 * Uses the first dash so that multi-segment UUIDs like `6ba7b810-9dad-11d1-...`
 * are captured in full.
 *
 * Returns `null` if the filename contains no dash or no extension.
 */
export function extractResourceId(filename: string): string | null {
  const dashIdx = filename.indexOf('-');
  if (dashIdx === -1) {
    return null;
  }
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx <= dashIdx) {
    return filename.slice(dashIdx + 1);
  }
  return filename.slice(dashIdx + 1, dotIdx);
}
