// Cores: parse, hex, OKLCH, nome por matiz/claridade e contraste WCAG. Puro (sem DOM).

import { round, clamp } from './util.js';

const hex2 = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');

function channel(v) {
  return v.endsWith('%') ? (parseFloat(v) / 100) * 255 : parseFloat(v);
}

function alpha(v) {
  if (v == null || v === '') return 1;
  const a = v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
  return Number.isFinite(a) ? round(clamp(a, 0, 1), 3) : 1;
}

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

// Aceita hex, rgb()/rgba(), hsl()/hsla(), canais HSL soltos ("222 47% 11%", padrão shadcn) e transparent.
export function parseColor(input) {
  if (input == null) return null;
  if (typeof input === 'object' && 'r' in input) return input;
  const s = String(input).trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (s === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? round(n(6) / 255, 3) : 1 };
  }
  m = /^rgba?\(\s*([-\d.]+%?)[\s,]+([-\d.]+%?)[\s,]+([-\d.]+%?)(?:\s*[,/]\s*([-\d.]+%?))?\s*\)$/.exec(s);
  if (m) return { r: channel(m[1]), g: channel(m[2]), b: channel(m[3]), a: alpha(m[4]) };
  m = /^(?:hsla?\(\s*)?([-\d.]+)(?:deg)?[\s,]+([-\d.]+)%[\s,]+([-\d.]+)%(?:\s*[,/]\s*([-\d.]+%?))?\s*\)?$/.exec(s);
  if (m && (s.startsWith('hsl') || !s.includes('('))) {
    const [r, g, b] = hslToRgb(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    return { r, g, b, a: alpha(m[4]) };
  }
  return null;
}

export function toHex(c) {
  const { r, g, b, a = 1 } = parseColor(c) || { r: 0, g: 0, b: 0 };
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 1 ? hex2(a * 255) : ''}`;
}

export function oklch(c) {
  const { r, g, b } = parseColor(c) || { r: 0, g: 0, b: 0 };
  const lin = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: Math.hypot(A, B), h: H };
}

// Matiz OKLCH das cores 500 do Tailwind v4 — dá nomes que o dev já conhece.
const HUES = [
  ['rose', 16], ['red', 25], ['orange', 47], ['amber', 70], ['yellow', 86], ['lime', 131], ['green', 150],
  ['emerald', 163], ['teal', 183], ['cyan', 215], ['sky', 237], ['blue', 259], ['indigo', 277],
  ['violet', 293], ['purple', 304], ['fuchsia', 322], ['pink', 354],
];
// Pontos médios entre as claridades OKLCH das paletas do Tailwind v4 (cromáticas e neutras diferem nos escuros).
const SHADES = [
  [0.951, 50], [0.907, 100], [0.845, 200], [0.758, 300], [0.665, 400], [0.585, 500], [0.517, 600],
  [0.456, 700], [0.4, 800], [0.33, 900], [0, 950],
];
const GRAY_SHADES = [
  [0.976, 50], [0.947, 100], [0.9, 200], [0.79, 300], [0.629, 400], [0.498, 500], [0.41, 600],
  [0.325, 700], [0.244, 800], [0.17, 900], [0, 950],
];

export const isNeutral = (c) => oklch(c).c < 0.05;
export const isChromatic = (c) => oklch(c).c >= 0.06;

export function hueName(c) {
  const { c: chroma, h } = oklch(c);
  if (chroma < 0.05) return 'gray';
  let best = HUES[0][0];
  let bestD = Infinity;
  for (const [name, center] of HUES) {
    const d = Math.min(Math.abs(h - center), 360 - Math.abs(h - center));
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

export function colorName(c) {
  const col = parseColor(c);
  if (!col) return 'color';
  const { l, c: chroma } = oklch(col);
  let base;
  if (chroma < 0.02 && l >= 0.995) base = 'white';
  else if (chroma < 0.02 && l <= 0.02) base = 'black';
  else {
    const hue = hueName(col);
    base = `${hue}-${(hue === 'gray' ? GRAY_SHADES : SHADES).find(([min]) => l >= min)[1]}`;
  }
  const a = col.a ?? 1;
  return a < 1 ? `${base}-a${Math.round(a * 100)}` : base;
}

function luminance(c) {
  const { r, g, b } = parseColor(c);
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return round((l1 + 0.05) / (l2 + 0.05), 2);
}

// cor translúcida composta sobre um fundo opaco
export function over(fg, bg) {
  const f = parseColor(fg);
  const b = parseColor(bg);
  const a = f.a ?? 1;
  return { r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a), a: 1 };
}

export function isDark(c) {
  return oklch(c).l < 0.5;
}

// Componentes sRGB 0–1, usados no formato W3C DTCG.
export function srgbComponents(c) {
  const { r, g, b } = parseColor(c);
  return [round(r / 255, 4), round(g / 255, 4), round(b / 255, 4)];
}
