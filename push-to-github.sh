#!/bin/bash
# Push to GitHub using a token. Run: GITHUB_TOKEN=your_ghp_token ./push-to-github.sh
cd "$(dirname "$0")"
if [ -z "$GITHUB_TOKEN" ]; then
  echo "No GITHUB_TOKEN set. Create a token at https://github.com/settings/tokens (repo scope), then run:"
  echo "  GITHUB_TOKEN=ghp_your_token_here ./push-to-github.sh"
  exit 1
fi
git remote set-url origin "https://AldousHeaf:${GITHUB_TOKEN}@github.com/AldousHeaf/1540.Schedule.git"
git push -u origin main
git remote set-url origin "https://github.com/AldousHeaf/1540.Schedule.git"
echo "Done."
