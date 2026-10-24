#!/usr/bin/env bash
# Install Arc Foundry (arc-forge, arc-cast, arc-anvil) on Linux x86_64.
# Source: https://docs.arc.io/arc/tutorials/install-arc-foundry.md
# Run from any directory. Installs to ~/.local/bin.
set -euo pipefail

ARC_FOUNDRY_RELEASES="https://github.com/circlefin/arc-foundry/releases"
INSTALL_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_DIR"

echo "[arc-foundry] Fetching latest release tag..."
LATEST=$(curl -sL "https://api.github.com/repos/circlefin/arc-foundry/releases/latest" \
  | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\(.*\)".*/\1/')

if [ -z "$LATEST" ]; then
  echo "[arc-foundry] ERROR: Could not determine latest release. Check $ARC_FOUNDRY_RELEASES manually." >&2
  exit 1
fi

echo "[arc-foundry] Latest release: $LATEST"

ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  TARGET="x86_64-unknown-linux-gnu" ;;
  aarch64) TARGET="aarch64-unknown-linux-gnu" ;;
  arm64)   TARGET="aarch64-unknown-linux-gnu" ;;
  *)
    echo "[arc-foundry] ERROR: Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

ARCHIVE="arc-foundry-${LATEST}-${TARGET}.tar.gz"
URL="https://github.com/circlefin/arc-foundry/releases/download/${LATEST}/${ARCHIVE}"

echo "[arc-foundry] Downloading $URL..."
TMP=$(mktemp -d)
curl -sL "$URL" -o "$TMP/$ARCHIVE"

echo "[arc-foundry] Extracting..."
tar -xzf "$TMP/$ARCHIVE" -C "$TMP"

# The archive may use 'forge', 'cast', 'anvil' names — rename to arc-* to avoid
# colliding with any standard Foundry installation already on PATH.
for BIN in forge cast anvil; do
  SRC="$TMP/$BIN"
  DEST="$INSTALL_DIR/arc-$BIN"
  if [ -f "$SRC" ]; then
    mv "$SRC" "$DEST"
    chmod +x "$DEST"
    echo "[arc-foundry] Installed $DEST"
  fi
done

rm -rf "$TMP"

# Add to PATH for current session if not already there
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
  export PATH="$INSTALL_DIR:$PATH"
  echo "[arc-foundry] Added $INSTALL_DIR to PATH for this session"
  echo "[arc-foundry] Add the following to your shell profile to persist:"
  echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
fi

echo "[arc-foundry] Verifying..."
arc-forge --version
arc-cast --version
echo "[arc-foundry] Installation complete."
