#!/usr/bin/env bash
# deploy.sh — build and deploy to GitHub Pages (root-level assets workflow)
#
# Deploys whatever is committed on main. It does NOT stage test/, docs/ or
# package.json — in the release flow the merge from dev brings those; if you
# edited them on main, commit them yourself first.
#
# Usage:
#   bash deploy.sh                  (relative paths, default)
#   bash deploy.sh /rv-simulator/   (absolute base for subdir deploy)
set -euo pipefail

BASE="${1:-./}"

echo "=== [0/7] Preflight ==="

# 1. Must be on main. `git push origin main` below pushes the main ref no
#    matter where HEAD is, so running this from dev would commit the build
#    onto dev and then push a stale main.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "    ABORT: on branch '${BRANCH}', deploy only runs from 'main'." >&2
  echo "           Release flow: git checkout main && git merge dev --no-ff" >&2
  exit 1
fi

# 2. No uncommitted work in the paths this script stages. Without this an
#    unfinished edit in src/ is swept into the deploy commit and shipped.
DIRTY=$(git status --porcelain -- src/ README.md CLAUDE.md)
if [ -n "$DIRTY" ]; then
  echo "    ABORT: uncommitted changes in paths deploy.sh stages:" >&2
  echo "$DIRTY" >&2
  echo "           Commit them first — deploy ships what is committed." >&2
  exit 1
fi

# 3. Not behind origin/main. Fail here rather than after the commit is made.
git fetch --quiet origin main
BEHIND=$(git rev-list --count HEAD..origin/main)
if [ "$BEHIND" -gt 0 ]; then
  echo "    ABORT: main is ${BEHIND} commit(s) behind origin/main. Pull first." >&2
  exit 1
fi

# 4. The smoke suite must pass. This is the mechanism behind "main is always
#    stable" - a red suite cannot reach players, whatever the process. There is
#    deliberately no override: a failing check means fix it or remove it.
echo "    running smoke suite..."
strip_ansi() { sed 's/\x1b\[[0-9;]*m//g'; }
if ! SMOKE=$(node test/smoke.mjs 2>&1); then
  # Match only real failure rows, not check names that happen to contain
  # "failed" (data_inspection_failed, etc). Rows are "  FAIL <name>".
  echo "$SMOKE" | strip_ansi | grep -E "^ +FAIL |passed, [0-9]+ failed" >&2 || true
  echo "    ABORT: smoke suite is red, refusing to deploy." >&2
  echo "           Full output: node test/smoke.mjs" >&2
  exit 1
fi
echo "    $(echo "$SMOKE" | strip_ansi | tail -1)"

# 5. Warn (do not abort) when this version is already tagged - the signature of
#    a forgotten `npm run bump`. Re-deploying a botched release is legitimate.
VERSION=$(node -p "require('./package.json').version")
if git rev-parse -q --verify "refs/tags/v${VERSION}" >/dev/null; then
  echo "    WARN: v${VERSION} is already tagged. Forgot 'npm run bump'?"
  echo "          Continuing - re-deploying the same version is allowed."
fi

echo "    on main, tree clean, up to date with origin, tests green"

echo "=== [1/7] Clean old build ==="
rm -rf dist assets

echo "=== [2/7] Build (base=${BASE}) ==="
BASE_URL="$BASE" npm run build

echo "=== [3/7] Copy assets to root ==="
mkdir -p assets
cp dist/assets/*.js  assets/
cp dist/assets/*.css assets/

JS=$(basename dist/assets/*.js)
CSS=$(basename dist/assets/*.css)
echo "    JS : $JS"
echo "    CSS: $CSS"

echo "=== [4/7] Patch index.html ==="
# Save dev-mode index.html and restore it on ANY exit path. Without the trap a
# failed build, commit or push leaves index.html stuck in production mode and
# the next `npx vite` serves a stale bundle instead of src/.
ORIG_INDEX=$(cat index.html)
restore_index() { printf '%s' "$ORIG_INDEX" > index.html; }
trap restore_index EXIT

sed -i \
  "s|<script type=\"module\" src=\"/src/main.jsx\"></script>|<script type=\"module\" crossorigin src=\"./assets/${JS}\"></script>\n  <link rel=\"stylesheet\" crossorigin href=\"./assets/${CSS}\">|" \
  index.html

echo "=== [5/7] Commit and push ==="
MSG="${DEPLOY_MSG:-deploy: ${JS}}"
git add index.html assets/ src/ README.md CLAUDE.md
git commit -m "$MSG"
git push origin main

echo "=== [6/7] Restore dev-mode index.html (local only, not committed) ==="
# handled by the EXIT trap

echo ""
echo "Done. GitHub Pages and Vercel will redeploy automatically."
echo "Local index.html restored to dev mode — 'npx vite' ready."
echo ""
echo "Next, in order:"
echo "    git tag v${VERSION} && git push origin v${VERSION}"
echo "    git checkout -- index.html                  # see note below"
echo "    git checkout dev && git merge main && git push origin dev"
echo "    node scripts/dev-index.mjs                  # back to dev mode"
echo ""
echo "The index.html dance is needed because the dev-mode restore above is an"
echo "uncommitted change to a file this deploy just rewrote on main, so git"
echo "refuses to switch branches. Discarding it is safe - dev-index.mjs"
echo "regenerates it exactly."
echo ""
echo "The merge back into dev is not optional — this deploy just put a commit"
echo "on main that dev does not have. Skipping it is how dev-v12.0.0 died."
