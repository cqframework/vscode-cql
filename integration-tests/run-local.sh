#!/usr/bin/env bash
set -euo pipefail

# Run integration tests locally (without Docker).
#
# Prerequisites:
#   - Java 17+
#   - Node.js 20+
#   - Maven (or use the mvnw wrapper in cql-language-server)
#
# Usage:
#   ./integration-tests/run-local.sh
#   ./integration-tests/run-local.sh --skip-build   # skip rebuilding the LS JAR

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LS_DIR="$(cd "${EXT_DIR}/../cql-language-server" && pwd 2>/dev/null || echo "")"

SKIP_BUILD=false
for arg in "$@"; do
    case "$arg" in
        --skip-build) SKIP_BUILD=true ;;
    esac
done

if [ -z "${LS_DIR}" ] || [ ! -f "${LS_DIR}/pom.xml" ]; then
    echo "ERROR: cql-language-server not found at ${EXT_DIR}/../cql-language-server"
    echo "       Clone it as a sibling directory to vscode-cql."
    exit 1
fi

echo "============================================"
echo " CQL Integration Tests (local)"
echo "============================================"
echo "  Extension:       ${EXT_DIR}"
echo "  Language Server:  ${LS_DIR}"

# ------------------------------------------------------------------
# 1. Build the language server JAR (unless --skip-build)
# ------------------------------------------------------------------
if [ "${SKIP_BUILD}" = false ]; then
    echo ""
    echo "[1/4] Building cql-language-server..."
    cd "${LS_DIR}"

    MVN_CMD="mvn"
    if [ -f "./mvnw" ]; then
        MVN_CMD="./mvnw"
    fi

    LS_VERSION=$(${MVN_CMD} help:evaluate -Dexpression=project.version -q -DforceStdout 2>/dev/null)
    echo "  Language server version: ${LS_VERSION}"

    ${MVN_CMD} --batch-mode -no-transfer-progress package -DskipTests -pl ls/service -am
else
    echo ""
    echo "[1/4] Skipping language server build (--skip-build)"
    cd "${LS_DIR}"
    MVN_CMD="mvn"
    if [ -f "./mvnw" ]; then
        MVN_CMD="./mvnw"
    fi
    LS_VERSION=$(${MVN_CMD} help:evaluate -Dexpression=project.version -q -DforceStdout 2>/dev/null)
fi

JAR_PATH="${LS_DIR}/ls/service/target/cql-ls-service-${LS_VERSION}.jar"
if [ ! -f "${JAR_PATH}" ]; then
    echo "ERROR: JAR not found at ${JAR_PATH}"
    echo "       Run without --skip-build to build it."
    exit 1
fi
echo "  JAR: ${JAR_PATH}"

# ------------------------------------------------------------------
# 2. Symlink the JAR into the extension
# ------------------------------------------------------------------
echo ""
echo "[2/4] Linking language server JAR..."
cd "${EXT_DIR}"

EXPECTED_VERSION=$(node -e "
  const pkg = require('./package.json');
  const coords = pkg.javaDependencies['cql-language-server'];
  console.log(coords.version);
")
EXPECTED_JAR="cql-ls-service-${EXPECTED_VERSION}.jar"
JAR_DIR="${EXT_DIR}/dist/jars"

mkdir -p "${JAR_DIR}"
rm -f "${JAR_DIR}/${EXPECTED_JAR}"
ln -s "${JAR_PATH}" "${JAR_DIR}/${EXPECTED_JAR}"

if [ "${LS_VERSION}" != "${EXPECTED_VERSION}" ]; then
    echo "  WARNING: Version mismatch - LS is ${LS_VERSION}, extension expects ${EXPECTED_VERSION}"
fi
echo "  Linked: ${EXPECTED_JAR}"

# ------------------------------------------------------------------
# 3. Install and compile
# ------------------------------------------------------------------
echo ""
echo "[3/4] Building extension..."
cd "${EXT_DIR}"
npm ci
npm run compile
# Compile integration tests (excluded from main tsconfig)
npx tsc -p "${SCRIPT_DIR}/tsconfig.json"

# ------------------------------------------------------------------
# 4. Run integration tests
# ------------------------------------------------------------------
echo ""
echo "[4/4] Running integration tests..."

# vscode-test resolves package.json relative to the config file,
# so copy the config to the project root before running
cp "${SCRIPT_DIR}/.vscode-test.integration.js" "${EXT_DIR}/.vscode-test.integration.js"
INT_CONFIG="${EXT_DIR}/.vscode-test.integration.js"

cleanup() { rm -f "${INT_CONFIG}"; }
trap cleanup EXIT

# Use xvfb on Linux for headless display
if command -v xvfb-run &>/dev/null; then
    xvfb-run -a npx vscode-test --config "${INT_CONFIG}"
else
    npx vscode-test --config "${INT_CONFIG}"
fi

echo ""
echo "============================================"
echo " Integration tests complete"
echo "============================================"
