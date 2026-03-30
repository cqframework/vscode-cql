#!/usr/bin/env bash
set -euo pipefail

# Rebuild the language server JAR and relink it into the extension.
# Run from anywhere inside the dev container.
#
# Usage:
#   ./rebuild-ls.sh          # one-shot rebuild
#   ./rebuild-ls.sh --watch  # rebuild on source changes

LS_DIR="/workspace/cql-language-server"
EXT_DIR="/workspace/vscode-cql"

rebuild() {
    echo ""
    echo "--- Rebuilding cql-language-server ---"
    cd "${LS_DIR}"

    LS_VERSION=$(./mvnw help:evaluate -Dexpression=project.version -q -DforceStdout 2>/dev/null)
    ./mvnw --batch-mode -no-transfer-progress package -DskipTests -pl ls/service -am

    JAR_PATH="${LS_DIR}/ls/service/target/cql-ls-service-${LS_VERSION}.jar"
    if [ ! -f "${JAR_PATH}" ]; then
        echo "ERROR: JAR not found at ${JAR_PATH}"
        return 1
    fi

    # Relink into the extension
    cd "${EXT_DIR}"
    EXPECTED_VERSION=$(node -e "
      const pkg = require('./package.json');
      console.log(pkg.javaDependencies['cql-language-server'].version);
    ")
    JAR_DIR="${EXT_DIR}/dist/jars"
    mkdir -p "${JAR_DIR}"
    rm -f "${JAR_DIR}/cql-ls-service-${EXPECTED_VERSION}.jar"
    ln -s "${JAR_PATH}" "${JAR_DIR}/cql-ls-service-${EXPECTED_VERSION}.jar"

    echo "--- Done. Reload the extension host to pick up changes. ---"
    echo ""
}

# One-shot rebuild
rebuild

# Watch mode: poll for source changes and rebuild
if [ "${1:-}" = "--watch" ]; then
    echo "Watching for changes in ${LS_DIR}/ls/ and ${LS_DIR}/core/ ..."
    echo "(Press Ctrl+C to stop)"
    echo ""

    LAST_HASH=""
    while true; do
        CURRENT_HASH=$(find "${LS_DIR}/core/src" "${LS_DIR}/ls/server/src" "${LS_DIR}/ls/service/src" \
            -name '*.kt' -o -name '*.java' 2>/dev/null | sort | xargs cat 2>/dev/null | md5sum)

        if [ "${CURRENT_HASH}" != "${LAST_HASH}" ] && [ -n "${LAST_HASH}" ]; then
            echo "[$(date +%H:%M:%S)] Source change detected, rebuilding..."
            rebuild || echo "Build failed, waiting for next change..."
        fi

        LAST_HASH="${CURRENT_HASH}"
        sleep 3
    done
fi
