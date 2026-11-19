#!/bin/sh
# Chromium's sandbox needs unprivileged user namespaces; several distros disable them with AppArmor.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
chrome=${STROBE_CHROME:-}
if [ -z "$chrome" ]; then
  chrome=$(cd "$root" && node --input-type=module -e "
    import { chromium } from '@playwright/test'
    process.stdout.write(chromium.executablePath())
  ")
fi
if [ ! -x "$chrome" ]; then
  chrome=$(ls -d "${HOME}"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome 2>/dev/null | sort -V | tail -n 1 || true)
fi
if [ -z "$chrome" ] || [ ! -x "$chrome" ]; then
  echo "strobe-browser: no Chromium found; set STROBE_CHROME to its executable" >&2
  exit 127
fi

if ! unshare -Ur true 2>/dev/null; then
  set -- --no-sandbox "$@"
fi

exec "$chrome" "$@"
