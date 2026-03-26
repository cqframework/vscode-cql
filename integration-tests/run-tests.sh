#!/usr/bin/env bash
set -euo pipefail

# Integration test runner for vscode-cql + cql-language-server
#
# Expects two volumes mounted:
#   /workspace/cql-language-server  - the language server repo
#   /workspace/vscode-cql           - the VS Code extension repo

LS_DIR="/workspace/cql-language-server"
EXT_DIR="/workspace/vscode-cql"
INT_DIR="${EXT_DIR}/integration-tests"

echo "============================================"
echo " CQL Integration Tests"
echo "============================================"

# ------------------------------------------------------------------
# 1. Build the language server JAR
# ------------------------------------------------------------------
echo ""
echo "[1/4] Building cql-language-server..."
cd "${LS_DIR}"

LS_VERSION=$(mvn help:evaluate -Dexpression=project.version -q -DforceStdout 2>/dev/null)
echo "  Language server version: ${LS_VERSION}"

mvn --batch-mode -no-transfer-progress package -DskipTests -pl ls/service -am
JAR_PATH="${LS_DIR}/ls/service/target/cql-ls-service-${LS_VERSION}.jar"

if [ ! -f "${JAR_PATH}" ]; then
    echo "ERROR: JAR not found at ${JAR_PATH}"
    exit 1
fi
echo "  JAR built: ${JAR_PATH}"

# ------------------------------------------------------------------
# 2. Symlink the JAR into the extension
# ------------------------------------------------------------------
echo ""
echo "[2/4] Linking language server JAR into extension..."
cd "${EXT_DIR}"

# Read the expected version from package.json
EXPECTED_VERSION=$(node -e "
  const pkg = require('./package.json');
  const coords = pkg.javaDependencies['cql-language-server'];
  console.log(coords.version);
")
EXPECTED_JAR="cql-ls-service-${EXPECTED_VERSION}.jar"
JAR_DIR="${EXT_DIR}/dist/jars"

mkdir -p "${JAR_DIR}"

# Remove any existing JAR or symlink
rm -f "${JAR_DIR}/${EXPECTED_JAR}"

if [ "${LS_VERSION}" = "${EXPECTED_VERSION}" ]; then
    ln -s "${JAR_PATH}" "${JAR_DIR}/${EXPECTED_JAR}"
    echo "  Linked: ${EXPECTED_JAR} -> ${JAR_PATH}"
else
    echo "  WARNING: Version mismatch - LS is ${LS_VERSION}, extension expects ${EXPECTED_VERSION}"
    echo "  Linking anyway with expected filename..."
    ln -s "${JAR_PATH}" "${JAR_DIR}/${EXPECTED_JAR}"
    echo "  Linked: ${EXPECTED_JAR} -> ${JAR_PATH}"
fi

# ------------------------------------------------------------------
# 3. Install extension dependencies and compile
# ------------------------------------------------------------------
echo ""
echo "[3/4] Building vscode-cql extension..."
cd "${EXT_DIR}"
npm ci
npm run compile

# ------------------------------------------------------------------
# 4. Run tests
# ------------------------------------------------------------------
echo ""
echo "[4/4] Running integration tests..."

# vscode-test resolves package.json relative to the config file,
# so copy the config to the project root before running
cd "${EXT_DIR}"
cp "${INT_DIR}/.vscode-test.integration.js" "${EXT_DIR}/.vscode-test.integration.js"

xvfb-run -a npx vscode-test \
    --config ".vscode-test.integration.js" \
    --coverage \
    --coverage-reporter text \
    --coverage-reporter json-summary

rm -f "${EXT_DIR}/.vscode-test.integration.js"

echo ""
echo "============================================"
echo " Integration tests complete"
echo "============================================"
