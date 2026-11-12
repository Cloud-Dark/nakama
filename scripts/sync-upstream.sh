#!/bin/sh
# Brings upstream (ahmadrosid/nakama) changes into this deployment without
# touching your own edits: it merges, so a file you changed keeps your version
# unless upstream changed the same lines, which is reported as a conflict for
# you to resolve. It never pushes and never restarts the running service.
#
#   scripts/sync-upstream.sh            # merge upstream/main
#   scripts/sync-upstream.sh v0.4.80    # merge one release tag instead
#
# After a successful sync, rebuild and restart yourself:
#   export PATH=/home/syahdan/.bunlocal/bin:$PATH
#   export BUN_INSTALL_CACHE_DIR=/home/syahdan/.bunlocal/cache
#   bun install --ignore-scripts && bun run build
set -eu

BRANCH=local-main
TARGET=${1:-upstream/main}

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree has uncommitted changes. Commit or stash them first:" >&2
  git status --short >&2
  exit 1
fi

current=$(git rev-parse --abbrev-ref HEAD)

if [ "$current" != "$BRANCH" ]; then
  echo "Switch to $BRANCH first (you are on $current)." >&2
  exit 1
fi

echo "Fetching upstream..."
git fetch --no-tags upstream main
git fetch --tags upstream

# A safety net: this ref points at the pre-merge commit, so a bad sync is one
# command away from being undone.
git update-ref refs/nakama/before-sync "$(git rev-parse HEAD)"

echo "Merging $TARGET into $BRANCH..."

if git merge --no-edit "$TARGET"; then
  echo
  echo "Sync done. Your own files were kept; upstream changes were merged in."
  echo "Undo it with: git reset --hard refs/nakama/before-sync"
  echo
  echo "Now rebuild:"
  echo "  export PATH=/home/syahdan/.bunlocal/bin:\$PATH"
  echo "  export BUN_INSTALL_CACHE_DIR=/home/syahdan/.bunlocal/cache"
  echo "  bun install --ignore-scripts && bun run build"
  exit 0
fi

echo
echo "Upstream changed the same lines as you did, in the files listed above."
echo "Resolve each one, then: git add <file> && git commit"
echo "Or walk away from this sync: git merge --abort"
exit 1
