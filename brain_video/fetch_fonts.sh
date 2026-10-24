#!/usr/bin/env bash
# Download the fonts used by render.py (all SIL Open Font License) from Google Fonts as TTF.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p fonts
for fam in "Noto+Sans+SC:wght@400" "Noto+Sans+SC:wght@500" "Noto+Sans+SC:wght@700" "Noto+Sans+SC:wght@900" \
           "Orbitron:wght@500" "Orbitron:wght@700" "Orbitron:wght@900" \
           "Exo+2:wght@400" "Exo+2:wght@500" "Exo+2:wght@600" "Exo+2:wght@700"; do
  name=$(echo "$fam" | sed 's/[+:@;]/_/g')
  # an old user agent makes the CSS API hand out plain TTF files
  url=$(curl -s -A "Mozilla/4.0" "https://fonts.googleapis.com/css2?family=$fam" | grep -oE "https://[^)]+" | head -1)
  curl -s -o "fonts/$name.ttf" "$url"
  echo "fonts/$name.ttf"
done
