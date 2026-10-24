#!/usr/bin/env bash
# Install the Anatomy skill (wheresryan22/anatomy) for Claude Code on this computer: ~/.claude/skills/anatomy.
# Run from anywhere:  bash scripts/install-anatomy.sh          (latest from GitHub)
#                     bash scripts/install-anatomy.sh --repo   (the copy pinned in this repo's .claude/skills/anatomy)
set -euo pipefail
DEST="${HOME}/.claude/skills/anatomy"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "${HOME}/.claude/skills"
if [ -e "$DEST" ]; then mv "$DEST" "${DEST}.bak-$(date +%Y%m%d%H%M%S)"; echo "existing copy moved aside"; fi
if [ "${1:-}" = "--repo" ]; then
  cp -R "$HERE/.claude/skills/anatomy" "$DEST"
else
  git clone --depth 1 https://github.com/wheresryan22/anatomy "$DEST"
  rm -rf "$DEST/.git"
fi
test -f "$DEST/SKILL.md" && echo "installed: $DEST"
node -e 'const [a]=process.versions.node.split(".").map(Number); if (a<20) { console.log("note: anatomy needs Node 20.10+, found " + process.versions.node); }' 2>/dev/null || echo "note: Node.js 20.10+ is needed for anatomy's build and check scripts"
