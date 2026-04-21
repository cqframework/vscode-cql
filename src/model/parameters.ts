export type ParameterSource = 'config-global' | 'config-library' | 'config-test-case' | 'default';

export interface ParameterEntry {
  name: string;
  type: string;
  value: string;
  /** Populated on output only — indicates which config tier supplied this parameter. Absent on raw config.json entries. */
  source?: ParameterSource;
}

/**
 * A library-scoped parameter block in config.jsonc.
 * `version` is optional — when present, parameters only apply to the library at that exact version.
 * `parameters` are library-scoped overrides; `testCases` are per-patient overrides.
 */
export interface LibraryParameterBlock {
  library: string;
  version?: string;
  parameters?: ParameterEntry[];
  testCases?: Record<string, ParameterEntry[]>;
}

/**
 * A single entry in the top-level `parameters` array of config.jsonc.
 * Discriminated by the presence of `library`: entries without it are global-scoped.
 */
export type ParameterConfigEntry = ParameterEntry | LibraryParameterBlock;

/**
 * The flat `parameters` array from config.jsonc. Entries without a `library` field are
 * global-scoped; entries with a `library` field are library-scoped blocks.
 */
export type CqlParametersConfig = ParameterConfigEntry[];

/**
 * Used in result files — combines config-supplied parameters
 * (source: config-*) and CQL-declared defaults (source: default) into a single list.
 * `type` is absent for default parameters — the CQL type is not returned by the engine.
 */
export interface ResultParameterEntry {
  name: string;
  type?: string;
  value: string;
  source: ParameterSource;
}
