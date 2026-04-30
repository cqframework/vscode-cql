import {
  CqlParametersConfig,
  LibraryParameterBlock,
  ParameterEntry,
  ParameterSource,
} from '../model/parameters';

/**
 * Merges three parameter lists with increasing priority: global < library < testCase.
 * When multiple entries share the same name, the highest-priority entry wins (last-write-wins).
 */
export function mergeParameters(
  global: ParameterEntry[],
  libraryParams: ParameterEntry[],
  testCaseParams: ParameterEntry[],
): ParameterEntry[] {
  const merged = new Map<string, ParameterEntry>();
  for (const p of [...global, ...libraryParams, ...testCaseParams]) {
    merged.set(p.name, p);
  }
  return Array.from(merged.values());
}

/**
 * Resolves the effective parameters for a specific library + version + patient by applying
 * the merge priority: global → library → testCase.
 *
 * Library blocks are matched by name. If a block specifies `version`, it only applies when
 * `libraryVersion` matches exactly. Blocks without `version` apply to any version.
 */
export function resolveParameters(
  config: CqlParametersConfig,
  libraryName: string,
  libraryVersion: string | undefined,
  patientId: string | undefined,
): ParameterEntry[] {
  const tag = (entries: ParameterEntry[], source: ParameterSource): ParameterEntry[] =>
    entries.map(p => ({ ...p, source }));

  const global = tag(
    config.filter((e): e is ParameterEntry => !('library' in e)),
    'config-global',
  );

  const matchingBlocks = config
    .filter((e): e is LibraryParameterBlock => 'library' in e)
    .filter(
      b => b.library === libraryName && (b.version == null || b.version === libraryVersion),
    );

  const library = tag(
    matchingBlocks.flatMap(b => b.parameters ?? []),
    'config-library',
  );

  const testCase = patientId
    ? tag(
        matchingBlocks.flatMap(b => b.testCases?.[patientId] ?? []),
        'config-test-case',
      )
    : [];

  return mergeParameters(global, library, testCase);
}
