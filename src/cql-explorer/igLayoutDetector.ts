/**
 * Detects IG (Implementation Guide) project layout within a workspace
 * and locates test case folders using permissive discovery logic.
 *
 * The standard convention for test case layout is:
 *   input/tests/{ResourceType}/{ArtifactName}/{uuid}/
 *
 * Real-world projects use two common alternative layouts:
 *  1. Flat layout (MADIE/PAS): input/tests/{ArtifactName}/{uuid}/
 *  2. Unrecognized resource type dir (old extension): input/tests/measure/{ArtifactName}/{uuid}/
 *
 * This module finds test cases regardless of layout and reports deviations from the convention.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** FHIR resource type directory names recognized as following the standard convention. */
export const KNOWN_RESOURCE_TYPES = new Set([
  'Library',
  'Measure',
  'PlanDefinition',
  'Questionnaire',
  'ActivityDefinition',
]);

export enum DeviationKind {
  /** Test cases found directly under input/tests/{name}/ (no resource-type level). */
  MISSING_RESOURCE_TYPE = 'missing-resource-type',
  /** Test cases found under input/tests/{unrecognized-type}/{name}/. */
  UNKNOWN_RESOURCE_TYPE = 'unknown-resource-type',
  /** This IG project is a sub-project inside a multi-project workspace. */
  MULTI_PROJECT_WORKSPACE = 'multi-project-workspace',
}

export interface IgProjectInfo {
  /** Absolute path to the IG project root. */
  root: string;
  deviations: DeviationKind[];
}

export interface TestFolderResult {
  /** Absolute path to the {LibraryName}/ dir, or null if not found. */
  folder: string | null;
  deviations: DeviationKind[];
  /** The unrecognized resource-type dir name if UNKNOWN_RESOURCE_TYPE is present. */
  resourceTypeDir?: string;
}

/** Returns true if the directory looks like an IG project root. */
function isIgRoot(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, 'ig.ini')) ||
    fs.existsSync(path.join(dir, 'input', 'cql'))
  );
}

/**
 * Detect IG projects within the given workspace root.
 *
 * - If the workspace root itself is an IG project → single project, no deviation.
 * - Otherwise scan immediate subdirectories for IG roots → multi-project, each
 *   sub-project gets the MULTI_PROJECT_WORKSPACE deviation.
 * - Returns [] if no IG projects are found.
 */
export function detectIgProjects(workspaceRoot: string): IgProjectInfo[] {
  if (isIgRoot(workspaceRoot)) {
    return [{ root: workspaceRoot, deviations: [] }];
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const subProjects: IgProjectInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subDir = path.join(workspaceRoot, entry.name);
    if (isIgRoot(subDir)) {
      subProjects.push({ root: subDir, deviations: [DeviationKind.MULTI_PROJECT_WORKSPACE] });
    }
  }
  return subProjects;
}

/**
 * Locate the test cases folder for a given library name within an IG project.
 *
 * Discovery order (first match wins):
 *  1. input/tests/{KnownResourceType}/{libraryName}/ — standard convention, no deviation.
 *  2. input/tests/{libraryName}/ — flat layout, MISSING_RESOURCE_TYPE deviation.
 *  3. input/tests/{anyOtherDir}/{libraryName}/ — unknown type dir, UNKNOWN_RESOURCE_TYPE deviation.
 *
 * Returns { folder: null } if no matching directory is found.
 *
 * All directory-name comparisons are case-sensitive so that `measure/` (old extension
 * convention) and `Measure/` (standard PascalCase FHIR resource type name) are treated as distinct.
 */
export function findTestCasesFolder(
  igRoot: string,
  libraryName: string,
  typeDirEntries?: fs.Dirent[],
): TestFolderResult {
  const testsDir = path.join(igRoot, 'input', 'tests');

  // Read the actual entries in input/tests/ to enable case-sensitive matching.
  let resolvedEntries: fs.Dirent[];
  if (typeDirEntries !== undefined) {
    resolvedEntries = typeDirEntries;
  } else {
    try {
      resolvedEntries = fs.readdirSync(testsDir, { withFileTypes: true });
    } catch {
      return { folder: null, deviations: [] };
    }
  }

  const typeDirs = resolvedEntries.filter(e => e.isDirectory());

  // Step 1: compliant layout — exact-case match against known resource type dir names.
  for (const entry of typeDirs) {
    if (!KNOWN_RESOURCE_TYPES.has(entry.name)) continue;
    const candidate = path.join(testsDir, entry.name, libraryName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return { folder: candidate, deviations: [] };
    }
  }

  // Step 2: flat layout — library name directly under input/tests/
  const flatEntry = typeDirs.find(e => e.name === libraryName);
  if (flatEntry) {
    return {
      folder: path.join(testsDir, libraryName),
      deviations: [DeviationKind.MISSING_RESOURCE_TYPE],
    };
  }

  // Step 3: unknown resource type dir — any other immediate subdir of input/tests/
  for (const entry of typeDirs) {
    if (KNOWN_RESOURCE_TYPES.has(entry.name)) continue;
    if (entry.name === libraryName) continue; // already handled as flat layout
    const candidate = path.join(testsDir, entry.name, libraryName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return {
        folder: candidate,
        deviations: [DeviationKind.UNKNOWN_RESOURCE_TYPE],
        resourceTypeDir: entry.name,
      };
    }
  }

  return { folder: null, deviations: [] };
}
