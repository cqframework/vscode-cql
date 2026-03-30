# CQL Integration Testing & Development Environment

This directory contains tooling for end-to-end integration testing and a containerized development environment for the `vscode-cql` extension and `cql-language-server`.

## Prerequisites

- **Docker Desktop** (v20+) — [Install](https://docs.docker.com/get-docker/)
- **VS Code** (v1.75+) — [Install](https://code.visualstudio.com/)
- **Dev Containers extension** — Install from VS Code: `ms-vscode-remote.remote-containers`
- **Repository layout** — Both repos must be cloned as siblings:
  ```
  your-workspace/
  ├── vscode-cql/              # this repo
  └── cql-language-server/     # https://github.com/cqframework/cql-language-server
  ```

For running integration tests locally (without Docker), you also need:
- **Java 17+** (e.g., [Eclipse Temurin](https://adoptium.net/))
- **Node.js 20+**
- **Maven 3.9+** (or use `./mvnw` from the language server repo)

---

## Dev Container

The dev container gives you a full VS Code window on your machine with Java 17, Node.js 20, and Maven pre-installed. Both repos are mounted so local edits are reflected immediately.

### Starting the Dev Container

1. Open the `vscode-cql` folder in VS Code
2. `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
3. Select **Dev Containers: Reopen in Container**
4. Wait for the container to build (first time takes a few minutes — subsequent opens are fast)

On first open, the `postCreateCommand` automatically:
- Installs npm dependencies (`npm ci`)
- Builds the language server JAR from `cql-language-server`

### Development Workflow

Once inside the dev container:

**Watch both projects for changes:**
- `Cmd+Shift+P` → **Tasks: Run Task** → **Watch All (Extension + Language Server)**
- Or from the terminal: `.devcontainer/watch-all.sh`

This starts two watchers:
- `[ext]` — TypeScript recompiles instantly on save via `tsc -watch`
- `[ls]` — Language server JAR rebuilds when Kotlin/Java sources change (polls every 3s)

**Rebuild language server only:**
- `Cmd+Shift+P` → **Tasks: Run Task** → **Rebuild Language Server**
- Or from the terminal: `.devcontainer/rebuild-ls.sh`

**After any rebuild**, reload the extension host to pick up changes:
- `Cmd+Shift+P` → **Developer: Reload Window**

**Launch the extension in debug mode:**
- Press `F5` or use the **Run Extension** launch configuration
- This opens a new VS Code window with the CQL extension loaded
- The language server starts in debug mode on port 1044

**Attach Java debugger to the language server:**
- Port 1044 is forwarded from the container automatically
- Attach a remote Java debugger to `localhost:1044`

### Available Tasks

| Task | Description |
|------|-------------|
| `npm: watch` (default build) | Watch TypeScript sources |
| `Rebuild Language Server` | One-shot JAR rebuild + relink |
| `Rebuild Language Server (watch)` | Background watcher for Java/Kotlin changes |
| `Watch All (Extension + Language Server)` | Combined watcher for both projects |

---

## Integration Tests

Integration tests exercise the full pipeline: VS Code extension → LSP communication → language server → CQL compiler. They run against a real language server JAR, not mocks.

### What the Tests Cover

- Language server startup and lifecycle
- CQL diagnostics on valid and invalid files
- ELM translation (JSON and XML)
- Compiler options validation (verifies `cql-options.json` is applied)
- Multi-file compilation (exercises library cache behavior)

### Running via Docker

```bash
cd integration-tests
docker compose up --build
```

This builds a clean container, compiles the language server from source, installs the extension, and runs the test suite. Maven and npm caches are persisted across runs via Docker volumes.

### Running Locally

```bash
./integration-tests/run-local.sh
```

Or skip rebuilding the language server if the JAR is already up to date:

```bash
./integration-tests/run-local.sh --skip-build
```

On Linux, `xvfb-run` is used automatically for headless display. On macOS, tests run natively.

### Test Workspace

The integration test workspace is at `integration-tests/test-workspace/` and contains:

- `input/cql/IntegrationTest.cql` — CQL library with FHIRHelpers include
- `input/cql/IntegrationTestTwo.cql` — Second library (exercises cache sharing)
- `input/cql/cql-options.json` — Compiler options (enables annotations, result types)
- `input/tests/` — FHIR test data for execution

### Relationship to Unit Tests

Unit tests (`npm test`) and integration tests are separate:

- **Unit tests** run without a language server. They mock server responses and test the extension logic in isolation. Configured in `.vscode-test.js`.
- **Integration tests** require a real language server JAR. They test the full end-to-end pipeline. Configured in `integration-tests/.vscode-test.integration.js`.

The default `.vscode-test.js` excludes the `integration/` directory so `npm test` never accidentally runs integration tests.
