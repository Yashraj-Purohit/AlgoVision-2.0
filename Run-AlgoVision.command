#!/bin/sh
# Run from Finder on macOS or: sh Run-AlgoVision.command
cd -- "$(dirname -- "$0")" || exit 1
# The application backend requires Node; Python static serving cannot run API routes.
AV_NODE="$(command -v node 2>/dev/null)"
if [ -n "$AV_NODE" ] && "$AV_NODE" --version >/dev/null 2>&1; then
  exec "$AV_NODE" server.mjs
fi
AV_BUNDLED_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [ -x "$AV_BUNDLED_NODE" ]; then
  exec "$AV_BUNDLED_NODE" server.mjs
fi
echo 'Node.js 20+ is required. Install Node, then run npm start in this folder.'
exit 1
