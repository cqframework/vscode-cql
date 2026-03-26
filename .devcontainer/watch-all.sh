#!/usr/bin/env bash
set -euo pipefail

# Watch both vscode-cql (TypeScript) and cql-language-server (Kotlin/Java)
# for changes. Recompiles automatically on save.
#
# Usage:
#   .devcontainer/watch-all.sh
#
# Press Ctrl+C to stop both watchers.

EXT_DIR="/workspace/vscode-cql"
LS_DIR="/workspace/cql-language-server"

cleanup() {
    echo ""
    echo "Stopping watchers..."
    kill $TS_PID $LS_PID 2>/dev/null || true
    wait $TS_PID $LS_PID 2>/dev/null || true
    echo "Done."
}
trap cleanup EXIT

# --- TypeScript watcher (vscode-cql) ---
echo "[ext] Starting TypeScript watcher..."
cd "${EXT_DIR}"
npx tsc -watch -p ./ 2>&1 | sed 's/^/[ext] /' &
TS_PID=$!

# --- Language Server watcher (cql-language-server) ---
echo "[ls]  Starting Language Server watcher..."
"${EXT_DIR}/.devcontainer/rebuild-ls.sh" --watch 2>&1 | sed 's/^/[ls]  /' &
LS_PID=$!

echo ""
echo "Watching both projects. Reload the extension host after changes."
echo "Press Ctrl+C to stop."
echo ""

wait
