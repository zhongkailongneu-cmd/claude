// Loyel 2025 gradient-blue palette: the only colours used in the video
// (plus pure white for text on the darkest tones).
export const P = {
  c10: "#F4F7FB",
  c20: "#E8EEF6",
  c30: "#CCDBEB",
  c40: "#9FBDDA",
  c50: "#6C9AC4",
  c60: "#497DAE",
  c70: "#376392",
  c80: "#2E5076",
  c90: "#2B4868",
  c100: "#263B54",
  white: "#FFFFFF",
};

const cache = new Map();
export function rgba(hex, a) {
  let rgb = cache.get(hex);
  if (!rgb) {
    const n = parseInt(hex.slice(1), 16);
    rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    cache.set(hex, rgb);
  }
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
