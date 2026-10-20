#!/usr/bin/env bash
# Downloads the OFL-licensed fonts the video uses (Noto Sans SC, Oswald,
# Rajdhani, Orbitron) from the npm registry into ./fonts.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p fonts .fontpkgs
cd .fontpkgs
npm pack @expo-google-fonts/noto-sans-sc @expo-google-fonts/oswald \
         @expo-google-fonts/rajdhani @expo-google-fonts/orbitron >/dev/null
for f in *.tgz; do
  d="${f%.tgz}"
  mkdir -p "$d"
  tar xzf "$f" -C "$d" --strip-components=1
done
for name in NotoSansSC_900Black NotoSansSC_700Bold NotoSansSC_500Medium NotoSansSC_400Regular \
            Oswald_400Regular Oswald_600SemiBold Oswald_700Bold \
            Rajdhani_500Medium Rajdhani_600SemiBold Rajdhani_700Bold \
            Orbitron_700Bold Orbitron_900Black; do
  find . -name "$name.ttf" -exec cp {} ../fonts/ \;
done
cd ..
rm -rf .fontpkgs
ls fonts
