#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"
NODE=${VEXA127_NODE:-node}
"$NODE" tools/preflight.mjs
exec "$NODE" src/main.mjs serve "$@"
