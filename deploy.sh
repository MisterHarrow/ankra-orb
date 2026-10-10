#!/bin/sh
# Build the demo and publish it to the gh-pages branch (served by GitHub Pages).
set -e
here=$(cd "$(dirname "$0")" && pwd)
cd "$here"
npx vite build demo --config demo/vite.config.ts
out="$here/demo/dist"
touch "$out/.nojekyll"
remote=$(git -C "$here" remote get-url origin)
tmp=$(mktemp -d)
cp -R "$out/." "$tmp/"
cd "$tmp"
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy demo from $(git -C "$here" rev-parse --short HEAD)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -q -f "$remote" gh-pages
rm -rf "$tmp"
echo "deployed → gh-pages"
