#!/usr/bin/env bash
# deploy.sh — build and deploy to GitHub Pages (root-level assets workflow)
# Usage:
#   bash deploy.sh             (relative paths, default)
#   bash deploy.sh /rv-simulator/   (absolute base for subdir deploy)
set -euo pipefail

BASE="${1:-./}"

echo "=== [1/5] Clean old build ==="
rm -rf dist assets

echo "=== [2/5] Build (base=${BASE}) ==="
BASE_URL="$BASE" npm run build

echo "=== [3/5] Copy assets to root ==="
mkdir -p assets
cp dist/assets/*.js  assets/
cp dist/assets/*.css assets/

JS=$(basename dist/assets/*.js)
CSS=$(basename dist/assets/*.css)
echo "    JS : $JS"
echo "    CSS: $CSS"

echo "=== [4/5] Patch index.html ==="
# Save dev-mode index.html to restore after push
ORIG_INDEX=$(cat index.html)

sed -i \
  "s|<script type=\"module\" src=\"/src/main.jsx\"></script>|<script type=\"module\" crossorigin src=\"./assets/${JS}\"></script>\n  <link rel=\"stylesheet\" crossorigin href=\"./assets/${CSS}\">|" \
  index.html

echo "=== [5/5] Commit and push ==="
MSG="${DEPLOY_MSG:-deploy: ${JS}}"
git add index.html assets/ src/
git commit -m "$MSG"
git push origin main

echo "=== Restore dev-mode index.html (local only, not committed) ==="
printf '%s' "$ORIG_INDEX" > index.html

echo ""
echo "Done. GitHub Pages and Vercel will redeploy automatically."
echo "Local index.html restored to dev mode — 'npx vite' ready."
