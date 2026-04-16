# Change Log

## v0.9.3

Date: 2026-04-15

### Execute CQL — RPC refactor

Rewrites Execute CQL to use the language server's JSON-RPC command instead of the
previous CLI argument array approach.

* Sends a structured `ExecuteCqlRequest` (library name, model URI, context, parameters)
* Receives structured `ExecuteCqlResponse` with typed expression results and server logs
* Removes CLI argument construction (`CliCommand`, picocli dependency)

### Execute CQL — optimization and result formats

* **Individual result files** (default) — writes
  `input/tests/results/{LibraryName}/TestCaseResult-{patientId}.json` per test case; opens the
  file automatically when a single test case is selected
* **Flat format** — set `"resultFormat": "flat"` in `config.json` to write a single
  `input/tests/results/{LibraryName}.txt` per library (previous behavior)
* **User-defined parameters** — add a `"parameters"` block to `config.json` to pass typed
  parameter overrides to the CQL engine; per-test-case overrides supported via `testCases` map
* **Select test cases** — new command `cql.editor.execute.select-test-cases` opens a quick-pick
  to run a subset of test cases for a library
* **Select libraries** — `cql.execute.select-libraries` runs multiple libraries in sequence with
  a progress notification showing per-library timing
* **CQL Explorer result nodes** — result files appear as child nodes under each test case in the
  CQL Explorer tree; a dual watcher monitors both the test directory and results directory
* `config.json` schema registered — enables IntelliSense for `resultFormat`, `parameters`,
  and `testCasesToExclude` in VS Code

### Bug fixes

* Fixed "file is newer" conflict when executing CQL in flat format with the output file
  already open in VS Code — the output file is no longer truncated on disk before opening;
  stale in-memory content is cleared via an in-memory edit instead

## v0.9.2 (prerelease)

Date: 2026-03-31

### CQL Explorer

Adds a new **CQL Explorer** tree view for managing CQL libraries and MADIE test cases.

* **Library tree** — browse all CQL libraries in the workspace alongside their FHIR test case directories
* **Expand / collapse all** — expand or collapse the entire tree with a single toolbar button
* **Execute all test cases** — run all test cases for a library or for the entire workspace from the toolbar or context menu
* **Test case cloning** — clone an existing test case with fresh patient and resource UUIDs auto-generated
* **Resource operations** — copy, cut, paste, rename, and delete individual FHIR resources within a test case; paste rewrites all patient ID references to match the target test case
* **Fix references** — auto-correct patient UUID mismatches across resources in a test case
* **Filtering** — filter libraries by name (hide empty libraries, show only matching names) and filter test cases within a library by name or description; active filters are shown in the tree view description
* **Sorting** — sort libraries ascending or descending by name
* **Layout warnings** — detects non-standard test case directory structures and reports them in the Problems panel
* **Expansion state persistence** — remembers which libraries and test cases are expanded across tree rebuilds

## v0.9.1 (prerelease)

Date: 2026-03-30

* bump to v0.9.1
* Upgrade to CQL-LS v4.4.1

## v0.9.0 (prerelease)

Date: 2025-03-27

This is the pre-release version of v0.10

## v0.8.0

Date: 2025-03-27

* Added more unit tests, and UI tests

## 0.7.12 Release

* Fixed Windows path issues with model library paths, test case paths, and select libraries paths affecting CQL execution

## 0.7.11 Release

* Added support for viewing ELM as JSON
* Added support for selective CQL execution from the context menu
* Added quick-pick test case selector with saved selections across sessions
* CQL commands are now only available once the language server is ready

## 0.7.10 Release

* Update to CQL Language Server 4.1.2
* Added support for excluding individual test cases from execution
* Updated README with setup instructions for asdf and other shell version managers

## 0.7.9 Release

* Update to CQL Language Server 4.0.0

## 0.7.5 Release

* Update to CQL Language Server 3.4.0

## 0.7.4 Release

* Update to CQL Language Server 3.3.1
  * This requires Java 17
* Update to check for Java 17 pre-requisites
* Various bug fixes for CQL evaluation

## 0.7.3 Release

* Update to CQL Language Server 3.2.1
  * Fixes for external IGs

## 0.7.1 Release

* Update to CQL Language Server 3.1.0
  * Fixes for paths on Windows

## 0.7.0 Release

* Update to CQL Language Server 3.0.0
  * Includes new CQL language features such as aggregate clauses and new compiler warning messages
* Preview Snippets functionality for common CQL patterns

## 0.6.0 Release

* Update to CQL Language Server 2.0.0
  * Support for loading CQL libraries via NPM
  * Various bug fixes for CQL Translator, Engine, and Evaluator

## 0.2.0 Release

* Fixed library resolution in multi-root CQL projects (known issue: all CQL projects included in a multi-root project must use the same version of FHIRHelpers. Multiple versions of FHIRHelpers in a multi-root CQL project will result in errors and is not currently supported)
* Fixed URI handling issues on Windows
  * These changes fixed numerous bugs on Windows, such as the return type hover, the error highlighting, the execute ELM functionality

## 0.1.7 * Prerelease

* Size reductions in plugin

## 0.1.6 * Prerelease

* Update to cql-language server 1.5.8
  * Multi-root workspace support
  * Performance enhancements

## 0.1.5

* Update to cql-language server 1.5.7

## 0.1.4

* Update to cql-language server 1.5.6

## 0.1.3

* Update to cql-language server 1.5.4
  * fixes for CQL 1.5
  * fixes for duplicate problems
  * fixes for no error highlighting on certain CQL files
  * fixes for null pointer exceptions in output

## 0.1.2

* Add support for cql-options.json file in the cql directory
* Updated dependencies
  * cql-translator 1.5.6
  * cql-evaluator 1.4.1

## 0.1.1

* Fixes for test discovery found in review

## 0.1.0

* Initial preview release
* Supports syntax highlighting, error highlighting, viewing ELM, and local execution
* Feature parity with [Atom CQL plugin](https://github.com/cqframework/atom_cql_support)
