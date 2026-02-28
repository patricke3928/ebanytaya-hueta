#!/usr/bin/env bash
set -euo pipefail

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required. Install it first: https://brew.sh"
  exit 1
fi

echo "Installing runtimes for Nexus Core Runner..."
brew install go rust deno

echo "Installing TypeScript runtime (tsx)..."
npm install -g tsx

echo ""
echo "Installed versions:"
python3 --version || true
node --version || true
tsx --version || true
deno --version || true
go version || true
rustc --version || true

echo ""
echo "Done. Restart backend so new PATH/runtime binaries are visible."
