// Dados brutos de uma página (content/extract.js) → modelo de design system com nomes e escalas.
// O mesmo modelo sai de lib/figma.js; exportadores e painel só conhecem este formato.

import { colorName, contrast, isChromatic, isNeutral, oklch, over, parseColor, toHex } from './color.js';
import {
  easingName, familyStack, firstFamily, guessFamilyKind, isSystemFamily, parseCubicBezier, parseTimeMs, prettyFamily,
  fetchableUrl, round, slugify, splitTopLevel, uniqueNamer,
} from './util.js';

const RADIUS_NAMES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
const SHADOW_NAMES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'];
const BREAKPOINT_NAMES = ['sm', 'md', 'lg', 'xl', '2xl', '3xl'];
const LIB_KINDS = new Set(['motion', 'ui', 'lib', 'framework', 'builder']);

export function emptyModel(source) {
  return {
    version: 1,
    source,
    colors: [],
    semantic: {},
    gradients: [],
    variables: { light: [], dark: [], collections: [] },
    fonts: [],
    typeScale: [],
    spacing: { base: null, scale: [] },
    radii: [],
    shadows: [],
    textShadows: [],
    effects: [],
    borders: [],
    breakpoints: [],
    containers: [],
    motion: { durations: [], easings: [], transitions: [], animations: [], keyframes: [], reveals: [], running: [], springs: [], presets: [] },
    components: { buttons: [], inputs: [], cards: [], links: [], figma: [] },
    assets: { images: [], svgs: [], fonts: [], lottie: [], videos: [], rive: [], models: [], frames: [], icons: [], figmaImages: [] },
    stack: [],
    notes: [],
    stats: {},
  };
}

// ---------------------------------------------------------------- cores
// Papéis semânticos: fundo (maior área), texto (mais caracteres), primária (cromática em elementos clicáveis).
export function buildPalette(raw, pageBackground) {
  const entries = raw.map((c) => ({ ...c, col: parseColor(c.css || c.hex) })).filter((c) => c.col && (c.col.a ?? 1) > 0);
  const opaque = entries.filter((c) => (c.col.a ?? 1) >= 0.99);
  const sortBy = (list, fn) => [...list].sort((a, b) => fn(b) - fn(a));
  const hexOf = (c) => toHex(c.col);
  const semantic = {};

  // fundo: o da página; sem ele, a cor opaca de maior área
  const bg = pageBackground ? parseColor(pageBackground) : sortBy(opaque.filter((c) => (c.area || 0) > 0), (c) => c.area)[0]?.col;
  if (bg) semantic.background = toHex(bg);

  // texto: entre as mais usadas, a de maior contraste com o fundo é a principal; a seguinte, a secundária
  const charsOf = (c) => c.chars || c.text || 0;
  const texts = sortBy(opaque.filter((c) => charsOf(c) > 0), charsOf);
  const main = texts.filter((c) => charsOf(c) >= charsOf(texts[0] || {}) * 0.15).slice(0, 4);
  if (main.length) {
    const fg = bg ? sortBy(main, (c) => contrast(c.col, bg))[0] : main[0];
    semantic.foreground = hexOf(fg);
    // secundário legível: menos contraste que o principal, mas não some no fundo (texto de botão claro em fundo escuro não conta)
    const muted = texts.find((c) => hexOf(c) !== semantic.foreground && isNeutral(c.col) && (!bg || (contrast(c.col, bg) < contrast(fg.col, bg) && contrast(c.col, bg) >= 2.5)));
    if (muted) semantic.muted = hexOf(muted);
  }

  // superfície: fundo neutro próximo da claridade do fundo (cards, seções); pode ser translúcido
  if (bg) {
    const L = oklch(bg).l;
    const near = (c) => {
      const d = Math.abs(oklch(over(c.col, bg)).l - L);
      return d > 0.004 && d < 0.25;
    };
    const surface = sortBy(entries.filter((c) => (c.bg || c.fill) > 0 && hexOf(c) !== semantic.background && isNeutral(c.col) && near(c)), (c) => c.area || c.bg || c.fill || 0)[0];
    if (surface) semantic.surface = hexOf(surface);
  }

  // borda: a mais usada (costuma ser translúcida)
  const border = sortBy(entries.filter((c) => (c.border || c.stroke) > 0 && (!bg || contrast(over(c.col, bg), bg) > 1.02)), (c) => c.border || c.stroke)[0];
  if (border) semantic.border = hexOf(border);

  // primária: a cor de ação. Botões neutros (ex.: pretos) valem quando dominam os cromáticos.
  const score = (c) => (c.ibg || 0) * 6 + (c.link || 0) * 3 + (c.itext || 0) * 2 + (c.bg || c.fill || 0) + (c.text || 0) + (c.border || c.stroke || 0) + (c.gradient || 0);
  const chroma = sortBy(opaque.filter((c) => isChromatic(c.col) && score(c) > 0), score);
  // o fundo de botão mais usado manda (mesmo neutro, como o preto da Vercel); sem botões, a cromática mais forte
  const cta = sortBy(opaque.filter((c) => (c.ibg || 0) > 0 && (!bg || contrast(c.col, bg) >= 1.5)), (c) => c.ibg)[0];
  const best = chroma[0];
  if (cta && cta.ibg >= 2) semantic.primary = hexOf(cta);
  else if (best) semantic.primary = hexOf(best);
  const primaryCol = semantic.primary ? parseColor(semantic.primary) : null;
  const accent = chroma.find((c) => hexOf(c) !== semantic.primary && (!primaryCol || !isChromatic(primaryCol) || Math.abs(oklch(c.col).h - oklch(primaryCol).h) > 25));
  if (accent) semantic.accent = hexOf(accent);

  // uma cor ganha no máximo um nome de papel, pela prioridade abaixo; os outros papéis viram aliases na exportação
  const roleOf = new Map();
  for (const role of ['background', 'foreground', 'primary', 'accent', 'muted', 'surface', 'border']) {
    if (semantic[role] && !roleOf.has(semantic[role])) roleOf.set(semantic[role], role);
  }
  const name = uniqueNamer();
  const ranked = [...entries].sort((a, b) => b.count - a.count);
  const keep = ranked.slice(0, 28);
  for (const hex of Object.values(semantic)) {
    if (!keep.some((c) => toHex(c.col) === hex)) {
      const found = ranked.find((c) => toHex(c.col) === hex);
      keep.push(found || { css: hex, hex, col: parseColor(hex), count: 0 });
    }
  }
  const colors = keep.map((c) => {
    const hex = toHex(c.col);
    const role = roleOf.get(hex) || null;
    const roles = ['text', 'bg', 'fill', 'border', 'stroke', 'shadow', 'gradient'].filter((r) => (c[r] || 0) > 0);
    return {
      name: name(role || colorName(c.col)),
      value: hex,
      hex: hex.slice(0, 7),
      alpha: c.col.a ?? 1,
      original: c.original || null,
      count: c.count || 0,
      role: role || null,
      roles,
      usedOn: c.names || [],
    };
  });
  colors.sort((a, b) => (b.role ? 1 : 0) - (a.role ? 1 : 0) || b.count - a.count);
  return { colors, semantic };
}

// ---------------------------------------------------------------- tipografia
function lineHeightOf(lh, size) {
  if (!lh || lh === 'normal') return 'normal';
  const px = /^([\d.]+)px$/.exec(lh);
  if (px && size) return String(round(parseFloat(px[1]) / size, 3));
  return lh;
}

function letterSpacingOf(ls, size) {
  if (!ls || ls === 'normal' || parseFloat(ls) === 0) return 'normal';
  const px = /^(-?[\d.]+)px$/.exec(ls);
  return px && size ? `${round(parseFloat(px[1]) / size, 3)}em` : ls;
}

const WEIGHT_NAMES = { 100: 'thin', 200: 'extralight', 300: 'light', 400: 'regular', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black' };
const SIZE_NAMES = [[12, 'xs'], [14, 'sm'], [16, 'base'], [18, 'lg'], [20, 'xl'], [24, '2xl'], [30, '3xl'], [36, '4xl'], [48, '5xl'], [60, '6xl'], [72, '7xl'], [96, '8xl'], [128, '9xl']];

export function buildTypeScale(styles, familyRoles) {
  // styles: [{ family, size, weight, lineHeight, letterSpacing, transform, chars, count, tags, sample, name? }]
  const name = uniqueNamer();
  // mesma família + tamanho + peso = um estilo só (soma o uso, fica com os atributos do mais usado)
  const groups = new Map();
  const use = (x) => x.chars || x.count || 0;
  for (const s of styles) {
    const key = `${s.family}|${round(s.size, 1)}|${s.weight}|${s.name || ''}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { best: s, chars: s.chars || 0, count: s.count || 0, tags: { ...(s.tags || {}) } });
      continue;
    }
    if (use(s) > use(g.best)) g.best = s;
    g.chars += s.chars || 0;
    g.count += s.count || 0;
    for (const [t, n] of Object.entries(s.tags || {})) g.tags[t] = (g.tags[t] || 0) + n;
  }
  const top = [...groups.values()]
    .map((g) => ({ ...g.best, chars: g.chars, count: g.count, tags: g.tags }))
    .sort((a, b) => use(b) - use(a))
    .slice(0, 14);
  const dominantTag = (s) => Object.entries(s.tags || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const named = new Map();
  for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    const hit = top.filter((s) => dominantTag(s) === tag).sort((a, b) => (b.chars || 0) - (a.chars || 0))[0];
    if (hit && !named.has(hit)) named.set(hit, tag);
  }
  const body = top.filter((s) => !named.has(s) && s.size >= 13 && s.size <= 20 && !/^h[1-6]$/.test(dominantTag(s)))[0];
  if (body) named.set(body, 'body');
  const bodySize = body ? body.size : 16;
  const btn = top.find((s) => !named.has(s) && dominantTag(s) === 'button');
  if (btn) named.set(btn, 'button');
  const overline = top.find((s) => !named.has(s) && s.transform === 'uppercase' && s.size < bodySize);
  if (overline) named.set(overline, 'overline');
  const small = top.filter((s) => !named.has(s) && s.size < bodySize).sort((a, b) => b.size - a.size)[0];
  if (small) named.set(small, 'small');

  // nomes livres: text-sm; se o balde já tem outro tamanho, text-13; se é o mesmo tamanho, text-13-semibold.
  // Fontes de papel próprio ganham prefixo (mono-sm, heading-sm).
  const taken = new Map();
  for (const [s, n] of named) taken.set(n, s.size);
  return top
    .map((s) => {
      const family = prettyFamily(firstFamily(s.family || ''));
      let label = s.name || named.get(s);
      if (!label) {
        const role = familyRoles.get(family) || (guessFamilyKind(family) === 'mono' ? 'mono' : null);
        const prefix = role === 'mono' ? 'mono-' : role === 'heading' ? 'heading-' : '';
        const bucket = SIZE_NAMES.reduce((best, [px, n]) => (Math.abs(px - s.size) < Math.abs(best[0] - s.size) ? [px, n] : best), [16, 'base'])[1];
        const px = Math.round(s.size);
        const weightName = WEIGHT_NAMES[Math.round((s.weight || 400) / 100) * 100] || s.weight;
        const options = [`${prefix}${bucket}`, `${prefix}${px}`, `${prefix}${px}-${weightName}`];
        label = options.find((o) => !taken.has(o)) || options[2];
        taken.set(label, s.size);
      }
      return {
        name: name(slugify(label) || 'text'),
        family,
        familyRole: familyRoles.get(family) || null,
        size: round(s.size, 2),
        weight: s.weight || 400,
        lineHeight: lineHeightOf(s.lineHeight, s.size),
        letterSpacing: letterSpacingOf(s.letterSpacing, s.size),
        transform: s.transform && s.transform !== 'none' ? s.transform : null,
        italic: s.style === 'italic' || !!s.italic,
        count: Math.round(s.count || 0),
        sample: s.sample || '',
        tags: s.tags || {},
      };
    })
    .sort((a, b) => b.size - a.size);
}

function fontSource(family, fontFaces, imports) {
  const faces = fontFaces.filter((f) => prettyFamily(f.family).toLowerCase() === family.toLowerCase());
  const urls = faces.flatMap((f) => f.sources.map((s) => s.url));
  const named = (u) => {
    try {
      return decodeURIComponent(u).replace(/\+/g, ' ').toLowerCase().includes(family.toLowerCase());
    } catch {
      return false;
    }
  };
  if (urls.some((u) => /fonts\.gstatic\.com/.test(u)) || imports.some((u) => /fonts\.googleapis\.com/.test(u) && named(u))) return 'google';
  if (urls.some((u) => /use\.typekit\.net|typekit/.test(u)) || imports.some((u) => /typekit/.test(u))) return 'adobe';
  if (faces.length) return 'self';
  return isSystemFamily(family) ? 'system' : 'unknown';
}

// Escolhe um arquivo por (peso, estilo): prefere woff2 e o subconjunto latino.
function fontFiles(family, fontFaces) {
  const out = new Map();
  const want = prettyFamily(family).toLowerCase();
  for (const f of fontFaces) {
    if (prettyFamily(f.family).toLowerCase() !== want) continue;
    const key = `${f.weight}|${f.style}`;
    const src = [...f.sources].sort((a, b) => (b.format === 'woff2') - (a.format === 'woff2'))[0];
    if (!src || src.url.startsWith('data:')) continue;
    const latin = !f.unicodeRange || /U\+0000-00FF|U\+0-FF/i.test(f.unicodeRange);
    const prev = out.get(key);
    if (!prev || (latin && !prev.latin)) out.set(key, { url: src.url, format: src.format, weight: f.weight, style: f.style, unicodeRange: f.unicodeRange, latin, family });
  }
  return [...out.values()];
}

export function googleFontsUrl(fonts) {
  const fams = fonts.filter((f) => f.source === 'google');
  if (!fams.length) return null;
  const q = fams
    .map((f) => {
      const ws = [...new Set(f.weights.map((w) => Math.round(w / 100) * 100).filter((w) => w >= 100 && w <= 900))].sort((a, b) => a - b);
      const name = encodeURIComponent(f.family).replace(/%20/g, '+');
      return ws.length ? `family=${name}:wght@${ws.join(';')}` : `family=${name}`;
    })
    .join('&');
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

// ---------------------------------------------------------------- escalas
export function spacingScale(entries) {
  // entries: [{ px, count }]
  const merged = new Map();
  for (const e of entries) {
    const px = round(e.px, 1);
    if (!(px > 0)) continue;
    merged.set(px, (merged.get(px) || 0) + e.count);
  }
  const all = [...merged].map(([px, count]) => ({ px, count }));
  const total = all.reduce((s, e) => s + e.count, 0) || 1;
  const share = (n) => all.filter((e) => e.px % n === 0).reduce((s, e) => s + e.count, 0) / total;
  const base = share(8) >= 0.75 ? 8 : share(4) >= 0.7 ? 4 : null;
  const minCount = Math.max(2, Math.round(total * 0.004));
  const scale = all
    .filter((e) => e.count >= minCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 16)
    .sort((a, b) => a.px - b.px)
    .map((e) => ({ name: e.px % 4 === 0 ? String(e.px / 4) : `${String(e.px).replace('.', '_')}px`, px: e.px, count: e.count }));
  return { base, scale };
}

const toPx = (v) => {
  const m = /^([\d.]+)px$/.exec(String(v).trim());
  return m ? parseFloat(m[1]) : null;
};

export function radiusScale(entries) {
  const out = [];
  const regular = [];
  let full = 0;
  for (const e of entries) {
    const px = typeof e.px === 'number' ? e.px : toPx(e.value);
    if (String(e.value).endsWith('%') || (px != null && px >= 999)) full += e.count;
    else if (px != null && px > 0) regular.push({ px: round(px, 1), count: e.count });
  }
  const merged = new Map();
  for (const r of regular) merged.set(r.px, (merged.get(r.px) || 0) + r.count);
  const list = [...merged].map(([px, count]) => ({ px, count })).sort((a, b) => b.count - a.count).slice(0, 7).sort((a, b) => a.px - b.px);
  // 1 raio → md; 2 → sm, md; 3 → sm, md, lg; 4+ começa em xs
  const offset = list.length === 1 ? 2 : list.length <= 3 ? 1 : 0;
  list.forEach((r, i) => out.push({ name: RADIUS_NAMES[Math.min(RADIUS_NAMES.length - 1, i + offset)], value: `${r.px}px`, px: r.px, count: r.count }));
  if (full) out.push({ name: 'full', value: '9999px', px: 9999, count: full });
  return out;
}

function shadowWeight(css) {
  let max = 0;
  for (const layer of splitTopLevel(css)) {
    const nums = (layer.replace(/(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)|#[0-9a-f]{3,8}/gi, '').match(/-?[\d.]+px/g) || []).map(parseFloat);
    const blur = nums[2] || 0;
    max = Math.max(max, blur + Math.abs(nums[1] || 0));
  }
  return max;
}

export function shadowScale(entries) {
  const list = entries.filter((e) => e.css || e.value).slice(0, 7).map((e) => ({ value: e.css || e.value, count: e.count, w: shadowWeight(e.css || e.value) }));
  list.sort((a, b) => a.w - b.w);
  return list.map((s, i) => ({ name: SHADOW_NAMES[Math.min(SHADOW_NAMES.length - 1, i + (list.length <= 4 ? 1 : 0))], value: s.value, count: s.count }));
}

const roundness = (px) => (px % 16 === 0 ? 3 : px % 8 === 0 || px % 10 === 0 ? 2 : px % 4 === 0 ? 1 : 0);

export function breakpointScale(entries) {
  const merged = [];
  for (const e of [...entries].sort((a, b) => a.px - b.px)) {
    const last = merged[merged.length - 1];
    if (last && e.px - last.px <= 2) {
      if (roundness(e.px) > roundness(last.px) || (roundness(e.px) === roundness(last.px) && e.count > last.count)) last.px = e.px;
      last.count += e.count;
    } else merged.push({ ...e });
  }
  const top = merged.sort((a, b) => b.count - a.count).slice(0, 6).sort((a, b) => a.px - b.px);
  return top.map((b, i) => ({ name: BREAKPOINT_NAMES[i], px: b.px, count: b.count }));
}

// durações viram nomes numéricos, como no Tailwind (duration-150)
export function durationName(ms) {
  return String(Math.round(ms));
}

export function motionScales(transitions, animations) {
  const durations = new Map();
  const easings = new Map();
  for (const t of [...transitions, ...animations]) {
    const ms = t.durationMs;
    if (ms > 0) durations.set(ms, (durations.get(ms) || 0) + (t.count || 1));
    if (t.easing) easings.set(t.easing, (easings.get(t.easing) || 0) + (t.count || 1));
  }
  const dn = uniqueNamer();
  const en = uniqueNamer();
  return {
    durations: [...durations]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .sort((a, b) => a[0] - b[0])
      .map(([ms, count]) => ({ name: dn(durationName(ms)), ms, count })),
    easings: [...easings]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, count]) => ({ name: en(easingName(value) || 'custom'), value, bezier: parseCubicBezier(value), count })),
  };
}

// ---------------------------------------------------------------- modelo da web
export function buildWebModel(raw, extras = {}) {
  const m = emptyModel({
    kind: 'web',
    url: raw.meta.url,
    title: raw.meta.title,
    description: raw.meta.description,
    capturedAt: new Date().toISOString(),
    viewport: raw.meta.viewport,
    colorScheme: raw.meta.colorScheme,
    themeColor: raw.meta.themeColor,
    lang: raw.meta.lang,
  });

  // cores: as usadas + as das variáveis do site (às vezes definidas e pouco usadas no viewport atual)
  const { colors, semantic } = buildPalette(raw.colors, raw.meta.pageBackground);
  m.colors = colors;
  m.semantic = semantic;
  m.gradients = raw.gradients.slice(0, 12).map((g, i) => ({ name: `gradient-${i + 1}`, value: g.css, count: g.count }));

  // variáveis do próprio site (os nomes que o autor escolheu)
  const vars = raw.variables || [];
  const used = vars.filter((v) => v.used || v.scope === 'dark');
  const pick = (scope) =>
    used
      .filter((v) => v.scope === scope && v.type !== 'empty')
      .slice(0, 400)
      .map((v) => ({ name: v.name, value: v.resolved, raw: v.value, type: v.type, color: v.color ? v.color.css : null, channels: v.channels || null }));
  m.variables.light = pick('root');
  m.variables.dark = pick('dark');

  // fontes
  const familyRoles = new Map();
  const families = raw.families
    .map((f) => ({ ...f, pretty: prettyFamily(f.family) }))
    .filter((f) => f.pretty && !/fallback/i.test(f.pretty));
  const headingTags = (f) => ['h1', 'h2', 'h3'].reduce((s, t) => s + (f.tags[t] || 0), 0);
  const byChars = [...families].sort((a, b) => b.chars - a.chars);
  const bodyFam = byChars[0];
  const headFam = [...families].sort((a, b) => headingTags(b) - headingTags(a))[0];
  const monoFam = families.find((f) => (f.tags.code || 0) > 0 && guessFamilyKind(f.pretty, f.stack) === 'mono');
  if (bodyFam) familyRoles.set(bodyFam.pretty, 'sans');
  if (headFam && headingTags(headFam) > 0 && headFam !== bodyFam) familyRoles.set(headFam.pretty, 'heading');
  if (monoFam && !familyRoles.has(monoFam.pretty)) familyRoles.set(monoFam.pretty, 'mono');
  const imports = raw.meta.sheets.imports || [];
  m.fonts = families.slice(0, 6).map((f) => {
    const role = familyRoles.get(f.pretty) || null;
    const kind = role === 'mono' ? 'mono' : guessFamilyKind(f.pretty, f.stack);
    const source = fontSource(f.pretty, raw.fontFaces, imports);
    return {
      family: f.pretty,
      cssFamily: f.family,
      role: role || (kind === 'mono' ? 'mono' : null),
      kind,
      stack: familyStack(f.pretty, kind),
      weights: Object.keys(f.weights).map(Number).sort((a, b) => a - b),
      italic: !!f.italic,
      count: f.count,
      source,
      files: source === 'self' || source === 'google' ? fontFiles(f.family, raw.fontFaces) : [],
    };
  });
  m.fonts.googleUrl = googleFontsUrl(m.fonts);

  m.typeScale = buildTypeScale(raw.typography, familyRoles);

  const sp = [...raw.spacing.padding, ...raw.spacing.margin, ...raw.spacing.gap].map((e) => ({ px: e.px, count: e.count }));
  m.spacing = spacingScale(sp);
  m.spacing.gaps = raw.spacing.gap.slice(0, 8);
  m.radii = radiusScale(raw.radii.map((r) => ({ value: r.value, count: r.count })));
  m.shadows = shadowScale(raw.shadows.map((s) => ({ css: s.value, count: s.count })));
  m.textShadows = raw.textShadows.slice(0, 4).map((s, i) => ({ name: `text-${i + 1}`, value: s.value, count: s.count }));
  m.effects = [
    ...raw.backdrops.slice(0, 4).map((b) => ({ kind: 'backdrop', value: b.value, count: b.count })),
    ...raw.filters.slice(0, 4).map((b) => ({ kind: 'filter', value: b.value, count: b.count })),
  ];
  m.borders = raw.borders.slice(0, 6).map((b) => ({ value: b.value, count: b.count }));
  m.breakpoints = breakpointScale(raw.breakpoints);
  m.containers = raw.maxWidths.filter((c) => c.px >= 640).slice(0, 4).map((c) => ({ px: c.px, count: c.count }));

  // movimento
  const scan = extras.scan || null;
  const kfMap = new Map(raw.keyframes.map((k) => [k.name, k.css]));
  const usedAnim = new Set(raw.animations.map((a) => a.name));
  for (const r of [...raw.running, ...(scan?.running || [])]) if (r.kind === 'css' && r.name) usedAnim.add(r.name);
  const { durations, easings } = motionScales(raw.transitions, raw.animations);
  m.motion.durations = durations;
  m.motion.easings = easings;
  m.motion.transitions = raw.transitions.slice(0, 20);
  m.motion.animations = raw.animations.slice(0, 30).map((a) => ({ ...a, css: kfMap.get(a.name) || null }));
  m.motion.keyframes = raw.keyframes
    .map((k) => ({ name: k.name, css: k.css, used: usedAnim.has(k.name) }))
    .sort((a, b) => b.used - a.used)
    .slice(0, 80);
  const waapi = [...raw.running, ...(scan?.running || [])].filter((r) => r.kind === 'waapi' && r.keyframes?.length && r.duration > 0);
  const seen = new Set();
  m.motion.running = waapi
    .filter((r) => {
      // animações escalonadas (mesmos valores, offsets diferentes) contam uma vez só
      const values = r.keyframes.map((f) => Object.entries(f).filter(([k]) => k !== 'offset' && k !== 'easing'));
      const k = JSON.stringify([values, r.duration, r.easing]);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 24)
    .map((r, i) => ({ ...r, name: `js-${slugify(r.target || 'anim').slice(0, 24) || 'anim'}-${i + 1}` }));
  m.motion.reveals = scan?.reveals || [];
  m.motion.properties = raw.properties || [];

  // botões: primeiro os da cor primária, depois preenchidos, com borda e o resto
  const rank = (b) => {
    const bg = parseColor(b.css.background);
    if (bg && semantic.primary && toHex({ ...bg, a: 1 }) === semantic.primary) return 3;
    if (bg && bg.a > 0) return 2;
    return b.css.border && b.css.border !== 'none' ? 1 : 0;
  };
  m.components.buttons = [...raw.components.buttons].sort((a, b) => rank(b) - rank(a) || b.count - a.count);
  m.components.inputs = raw.components.inputs;
  m.components.cards = raw.components.cards;
  m.components.links = raw.components.links;

  // Asset da rede local listado por um site público fica fora (miniatura no painel, kit, @font-face): a mesma
  // regra de fetchableUrl. De página local (site em desenvolvimento) entra; data: e blob: são da própria página.
  const allowed = (u) => typeof u === 'string' && (/^(data|blob):/.test(u) || fetchableUrl(u, raw.meta.url) != null);
  for (const f of m.fonts) f.files = (f.files || []).filter((x) => allowed(x.url));
  m.assets.images = raw.assets.images.filter((x) => allowed(x.url));
  m.assets.svgs = raw.assets.svgs;
  m.assets.videos = raw.assets.videos.filter((x) => allowed(x.url));
  m.assets.lottie = raw.assets.lottie.filter(allowed);
  m.assets.rive = (raw.assets.rive || []).filter(allowed);
  m.assets.models = (raw.assets.models || []).filter(allowed);
  m.assets.fonts = m.fonts.flatMap((f) => (f.source === 'self' ? f.files : []));

  // mainLibs vêm do mundo MAIN, onde a página controla os globais (até String e Array): nome e versão só com
  // caracteres de nome/versão — uma quebra de linha numa versão viraria uma seção nova no DESIGN.md.
  const stack = [...raw.stack];
  for (const lib of (Array.isArray(extras.mainLibs) ? extras.mainLibs : []).slice(0, 40)) {
    const name = lib && typeof lib.name === 'string' ? lib.name.replace(/[^\w .+-]/g, '').slice(0, 40).trim() : '';
    if (!name) continue;
    const version = (lib.version != null && String(lib.version).replace(/[^\w.+-]/g, '').slice(0, 32)) || null;
    const hit = stack.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (hit) hit.version = version || hit.version;
    else stack.push({ name, version, kind: LIB_KINDS.has(lib.kind) ? lib.kind : 'lib', evidence: 'objeto global na página' });
  }
  m.stack = stack;

  if (raw.meta.sheets.blocked.length) m.notes.push(`${raw.meta.sheets.blocked.length} folha(s) de estilo não puderam ser lidas — variáveis e @keyframes delas ficaram de fora.`);
  if (raw.meta.counts.stride > 1) m.notes.push(`Página grande: estilos amostrados (1 a cada ${raw.meta.counts.stride} elementos).`);
  if (m.fonts.some((f) => f.source === 'adobe')) m.notes.push('Fontes da Adobe Fonts exigem licença/kit próprio — o kit traz só os nomes.');
  if (m.fonts.some((f) => f.source === 'self')) m.notes.push('Fontes auto-hospedadas foram baixadas; confira a licença antes de publicar.');
  if (semantic.foreground && semantic.background) {
    const c = contrast(semantic.foreground, semantic.background);
    m.stats.contrast = c;
    if (c < 4.5) m.notes.push(`Contraste texto/fundo de ${c}:1 — abaixo do AA (4,5:1).`);
  }
  m.stats = { ...m.stats, elements: raw.meta.counts, ms: raw.meta.ms, sheets: raw.meta.sheets.total };
  return m;
}
