#!/bin/sh
# Copy the shared source into each app. Edit src/ here, never the copies.
set -e
here=$(cd "$(dirname "$0")" && pwd)
for dest in \
  "$here/../ankra-website/src/components/ankra-orb" \
  "$here/../portal/src/implementations/elements/ankra-orb"
do
  mkdir -p "$dest"
  for f in "$here"/src/*.ts "$here"/src/*.tsx; do
    name=$(basename "$f")
    {
      if head -1 "$f" | grep -q "^'use client'"; then
        head -1 "$f"; echo
        echo "// Synced from ankra-orb/src/$name by ankra-orb/sync.sh. Edit the source, not this copy."
        tail -n +2 "$f"
      else
        echo "// Synced from ankra-orb/src/$name by ankra-orb/sync.sh. Edit the source, not this copy."
        echo
        cat "$f"
      fi
    } > "$dest/$name"
  done
  echo "synced → $dest"
done
