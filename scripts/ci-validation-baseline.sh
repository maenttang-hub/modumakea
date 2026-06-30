#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[validation-baseline] TypeScript baseline"
echo "[validation-baseline] Next route type generation"
npx next typegen
npx tsc --noEmit

echo "[validation-baseline] Core reliability suite"
node --test --experimental-strip-types --import ./tests/register-alias-loader.mjs \
  tests/virtual-circuit-e2e.test.ts \
  tests/validation-regression-scenarios.test.ts \
  tests/datasheet-rules.test.ts \
  tests/drc-engine.test.ts \
  tests/circuit-netlist.test.ts \
  tests/real-board-netlist-validation.test.ts \
  tests/kicad-public-fixtures.test.ts
