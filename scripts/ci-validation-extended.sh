#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

bash ./scripts/ci-validation-baseline.sh

echo "[validation-extended] Integration and serialization suite"
node --test --experimental-strip-types --import ./tests/register-alias-loader.mjs \
  tests/kicad-import.test.ts \
  tests/kicad-public-fixtures.test.ts \
  tests/kicad-real-projects.test.ts \
  tests/build-integrated-validation-json.test.ts \
  tests/validation-snapshot.test.ts \
  tests/datasheet-review-payload.test.ts \
  tests/project-serialization.test.ts \
  tests/kicad-mapper.test.ts
