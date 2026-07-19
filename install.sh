#!/usr/bin/env sh
# FlowStock installer — downloads the latest release binary for this platform.
set -e
REPO="vul-os/flowstock"
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) echo "unsupported arch: $ARCH"; exit 1 ;;
esac
BIN="flowstock-${OS}-${ARCH}"
URL="https://github.com/${REPO}/releases/latest/download/${BIN}"
echo "Downloading ${URL} ..."
curl -fSL "$URL" -o flowstock
chmod +x flowstock
echo "Installed ./flowstock — run it with:  ./flowstock"
