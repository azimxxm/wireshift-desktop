#!/bin/bash
# WireShift installer: downloads the latest release and puts WireShift.app in /Applications.
# Usage: curl -fsSL https://github.com/azimxxm/wireshift-desktop/releases/latest/download/install.sh | bash
set -euo pipefail

REPO="azimxxm/wireshift-desktop"
APP_NAME="WireShift.app"

say() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31mXato:\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "WireShift faqat macOS uchun."
[ "$(uname -m)" = "arm64" ] || fail "WireShift Apple Silicon (M1/M2/M3/M4) Mac'lar uchun. Bu Mac Intel protsessorli."

say "So'nggi versiya qidirilmoqda…"
DMG_URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -o '"browser_download_url": *"[^"]*\.dmg"' | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')
[ -n "$DMG_URL" ] || fail "Reliz topilmadi. Internetni tekshiring."

TMP_DIR=$(mktemp -d)
MOUNT_DIR="$TMP_DIR/mnt"
cleanup() {
  hdiutil detach "$MOUNT_DIR" -quiet 2>/dev/null || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

say "Yuklab olinmoqda: $(basename "$DMG_URL")"
curl -fL --progress-bar "$DMG_URL" -o "$TMP_DIR/WireShift.dmg"

mkdir -p "$MOUNT_DIR"
hdiutil attach "$TMP_DIR/WireShift.dmg" -nobrowse -quiet -mountpoint "$MOUNT_DIR"
[ -d "$MOUNT_DIR/$APP_NAME" ] || fail "DMG ichida $APP_NAME topilmadi."

# /Applications if writable, otherwise ~/Applications (no admin password needed)
DEST="/Applications"
if [ ! -w "$DEST" ]; then
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
fi

# close an older running copy before replacing it
osascript -e 'quit app "WireShift"' >/dev/null 2>&1 || true
sleep 1

say "O'rnatilmoqda: $DEST/$APP_NAME"
rm -rf "${DEST:?}/$APP_NAME"
ditto "$MOUNT_DIR/$APP_NAME" "$DEST/$APP_NAME"
# downloaded with curl, but clear the flag anyway so Gatekeeper does not block the unsigned app
xattr -dr com.apple.quarantine "$DEST/$APP_NAME" 2>/dev/null || true

say "Tayyor! WireShift ochilmoqda."
open "$DEST/$APP_NAME"
