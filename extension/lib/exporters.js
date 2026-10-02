// Modelo → arquivos do kit: tokens.css, Tailwind v4/v3 e W3C DTCG.

import { parseColor, srgbComponents, toHex } from './color.js';
import { cmt, cssString, round, slugify, splitTopLevel } from './util.js';

const date = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

function header(model, what) {
  const s = model.source;
  const from = s.kind === 'figma' ? `arquivo do Figma "${cmt(s.title, 120)}"` : `${cmt(s.title, 120)} (${cmt(s.url, 300)})`;
  return `/* Decalque — ${what}\n   Origem: ${from}\n   Capturado em ${date(s.capturedAt)}${s.viewport ? ` · viewport ${s.viewport.width}×${s.viewport.height}` : ''} */`;
}

const lines = (arr) => arr.filter((l) => l != null).join('\n');

// Paleta + aliases para papéis que caíram numa cor já nomeada por outro papel (ex.: borda = texto secundário).
export function colorTokens(model) {
  const names = new Set(model.colors.map((c) => c.name));
  const aliases = Object.entries(model.semantic)
    .filter(([role]) => !names.has(role))
    .map(([role, value]) => {
      const target = model.colors.find((c) => c.value === value);
      return { name: role, value, role, alias: target ? target.name : null };
    });
  return [...model.colors, ...aliases];
}

export function fontRole(f, i) {
  return f.role || (i === 0 ? 'sans' : slugify(f.family) || `font-${i + 1}`);
}

function fontTokens(model) {
  const seen = new Set();
  return model.fonts
    .map((f, i) => ({ name: fontRole(f, i), stack: f.stack, family: f.family }))
    .filter((f) => !seen.has(f.name) && seen.add(f.name));
}

function lineHeightValue(lh) {
  return lh === 'normal' || lh == null ? 'normal' : lh;
}

function familyFor(model, t) {
  const tokens = fontTokens(model);
  const hit = tokens.find((f) => f.family === t.family);
  return hit ? `var(--font-${hit.name})` : cssString(t.family);
}

function fontFaceRules(model, pathFor) {
  const out = [];
  for (const f of model.fonts) {
    if (f.source !== 'self') continue;
    for (const file of f.files) {
      const local = pathFor ? pathFor(file.url) : null;
      out.push(lines([
        '@font-face {',
        `  font-family: ${cssString(f.family)};`,
        `  src: url(${JSON.stringify(local ? `./${local}` : file.url)})${file.format ? ` format(${JSON.stringify(file.format)})` : ''};`,
        `  font-weight: ${file.weight};`,
        `  font-style: ${file.style};`,
        '  font-display: swap;',
        file.unicodeRange && !file.latin ? `  unicode-range: ${file.unicodeRange};` : null,
        '}',
      ]));
    }
  }
  return out;
}

function fontImport(model) {
  if (!model.fonts.googleUrl) return null;
  const guess = model.fonts.googleGuess ? ' /* tentativa: confira se as famílias existem no Google Fonts */' : '';
  return `@import url(${JSON.stringify(model.fonts.googleUrl)});${guess}`;
}

// ---------------------------------------------------------------- tokens.css
export function toCSS(model, opts = {}) {
  const fonts = fontTokens(model);
  const vars = [
    '  /* Cores */',
    ...colorTokens(model).map((c) => `  --color-${c.name}: ${c.alias ? `var(--color-${c.alias})` : c.value};${c.original ? ` /* ${cmt(c.original, 80)} */` : ''}`),
    ...model.gradients.map((g) => `  --${g.name}: ${g.value};`),
    fonts.length ? '\n  /* Tipografia */' : null,
    ...fonts.map((f) => `  --font-${f.name}: ${f.stack};`),
    ...model.typeScale.flatMap((t) => [
      `  --text-${t.name}: ${t.size}px;`,
      `  --leading-${t.name}: ${lineHeightValue(t.lineHeight)};`,
      t.letterSpacing !== 'normal' ? `  --tracking-${t.name}: ${t.letterSpacing};` : null,
      `  --weight-${t.name}: ${t.weight};`,
    ]),
    model.spacing.scale.length ? `\n  /* Espaçamento${model.spacing.base ? ` (grade de ${model.spacing.base}px)` : ''} */` : null,
    ...model.spacing.scale.map((s) => `  --space-${s.name}: ${s.px}px;`),
    model.radii.length ? '\n  /* Raios */' : null,
    ...model.radii.map((r) => `  --radius-${r.name}: ${r.value};`),
    model.shadows.length ? '\n  /* Sombras */' : null,
    ...model.shadows.map((s) => `  --shadow-${s.name}: ${s.value};`),
    ...model.effects.filter((e) => /blur\(/.test(e.value)).slice(0, 3).map((e, i) => `  --${e.kind === 'backdrop' ? 'backdrop' : 'filter'}-${e.name || i + 1}: ${e.value};`),
    model.motion.durations.length || model.motion.easings.length ? '\n  /* Movimento */' : null,
    ...model.motion.durations.map((d) => `  --duration-${d.name}: ${d.ms}ms;`),
    ...model.motion.easings.map((e) => `  --ease-${e.name}: ${e.value};`),
    ...model.containers.slice(0, 2).map((c, i) => `  --container-${i ? 'alt' : 'max'}: ${c.px}px;`),
  ].filter((l) => l != null);

  const textClasses = model.typeScale.map((t) => lines([
    `.text-${t.name} {`,
    `  font-family: ${familyFor(model, t)};`,
    `  font-size: var(--text-${t.name});`,
    `  line-height: var(--leading-${t.name});`,
    `  font-weight: var(--weight-${t.name});`,
    t.letterSpacing !== 'normal' ? `  letter-spacing: var(--tracking-${t.name});` : null,
    t.transform ? `  text-transform: ${t.transform};` : null,
    t.italic ? '  font-style: italic;' : null,
    '}',
  ]));

  const bp = model.breakpoints.length
    ? `/* Breakpoints (variáveis CSS não funcionam em @media — use os números):\n${model.breakpoints.map((b) => `   ${b.name}: ${b.px}px`).join('\n')} */`
    : null;

  return lines([
    header(model, 'tokens de design (CSS custom properties)'),
    '',
    fontImport(model),
    ...fontFaceRules(model, opts.pathFor),
    '',
    ':root {',
    ...vars,
    '}',
    '',
    bp,
    '',
    '/* Estilos de texto prontos */',
    ...textClasses,
    '',
  ]);
}

// Variáveis originais do site (com os nomes que o autor escolheu) em arquivo próprio.
export function toSiteVariablesCSS(model) {
  const { light, dark, collections } = model.variables;
  if (!light.length && !dark.length) return null;
  const block = (sel, list) => (list.length ? lines([`${sel} {`, ...list.map((v) => `  ${v.name}: ${v.value};`), '}']) : null);
  const what = model.source.kind === 'figma' ? 'variáveis do Figma (modo padrão em :root, modo escuro em .dark)' : 'variáveis CSS originais do site';
  const modes = collections && collections.length
    ? `/* Coleções: ${cmt(collections.map((c) => `${c.name} (${c.modes.join(', ')})`).join(' · '), 600)} */`
    : null;
  return lines([header(model, what), modes, '', block(':root', light), '', block('.dark, [data-theme="dark"]', dark), '']);
}

// ---------------------------------------------------------------- Tailwind v4
export function toTailwindV4(model) {
  const fonts = fontTokens(model);
  const kf = animationsList(model);
  const theme = [
    '  /* Cores (as com nome de matiz, ex.: blue-500, substituem as do Tailwind com o mesmo nome) */',
    ...colorTokens(model).map((c) => `  --color-${c.name}: ${c.alias ? `var(--color-${c.alias})` : c.value};`),
    fonts.length ? '\n  /* Fontes */' : null,
    ...fonts.map((f) => `  --font-${f.name}: ${f.stack};`),
    model.typeScale.length ? '\n  /* Escala de texto: use text-h1, text-body… */' : null,
    ...model.typeScale.flatMap((t) => [
      `  --text-${t.name}: ${t.size}px;`,
      `  --text-${t.name}--line-height: ${lineHeightValue(t.lineHeight)};`,
      t.letterSpacing !== 'normal' ? `  --text-${t.name}--letter-spacing: ${t.letterSpacing};` : null,
      `  --text-${t.name}--font-weight: ${t.weight};`,
    ]),
    model.spacing.base === 8 ? '\n  /* Grade de 8px: p-2 = 8px, p-4 = 16px… (a escala padrão do Tailwind já cobre) */' : null,
    model.radii.length ? '\n  /* Raios */' : null,
    ...model.radii.map((r) => `  --radius-${r.name}: ${r.value};`),
    model.shadows.length ? '\n  /* Sombras */' : null,
    ...model.shadows.map((s) => `  --shadow-${s.name}: ${s.value};`),
    ...model.effects
      .filter((e) => e.kind === 'backdrop' && /^blur\(([\d.]+px)\)$/.test(e.value))
      .slice(0, 3)
      .map((e, i) => `  --blur-${e.name || `glass${i ? `-${i + 1}` : ''}`}: ${/^blur\(([\d.]+px)\)$/.exec(e.value)[1]};`),
    model.motion.easings.length ? '\n  /* Curvas de animação: ease-out-expo, ease-standard… */' : null,
    ...model.motion.easings.filter((e) => !['linear', 'default'].includes(e.name)).map((e) => `  --ease-${e.name}: ${e.value};`),
    model.breakpoints.length ? '\n  /* Breakpoints (substituem os padrões com o mesmo nome) */' : null,
    ...model.breakpoints.map((b) => `  --breakpoint-${b.name}: ${b.px}px;`),
    ...model.containers.slice(0, 1).map((c) => `  --container-site: ${c.px}px;`),
    kf.length ? '\n  /* Animações: animate-<nome> */' : null,
    ...kf.map((a) => `  --animate-${a.name}: ${a.shorthand};`),
    ...kf.map((a) => `\n  ${a.css.replace(/\n/g, '\n  ')}`),
  ].filter((l) => l != null);

  const durations = model.motion.durations.length
    ? lines([':root {', '  /* Durações (Tailwind v4 aceita duration-150, duration-300… direto) */', ...model.motion.durations.map((d) => `  --duration-${d.name}: ${d.ms}ms;`), ...model.gradients.map((g) => `  --${g.name}: ${g.value};`), '}'])
    : model.gradients.length
      ? lines([':root {', ...model.gradients.map((g) => `  --${g.name}: ${g.value};`), '}'])
      : null;

  return lines([
    header(model, 'tema para Tailwind CSS v4 (cole no seu CSS principal)'),
    '',
    fontImport(model),
    '@import "tailwindcss";',
    '',
    '@theme {',
    ...theme,
    '}',
    '',
    durations,
    '',
  ]);
}

// ---------------------------------------------------------------- Tailwind v3
const jsKey = (k) => (/^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
function jsObject(obj, indent = 2) {
  const pad = ' '.repeat(indent);
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  if (!entries.length) return '{}';
  return `{\n${entries
    .map(([k, v]) => `${pad}${jsKey(k)}: ${typeof v === 'object' && !Array.isArray(v) ? jsObject(v, indent + 2) : JSON.stringify(v)},`)
    .join('\n')}\n${' '.repeat(indent - 2)}}`;
}

export function parseKeyframes(css) {
  const body = /\{([\s\S]*)\}\s*$/.exec(String(css).trim());
  if (!body) return {};
  const out = {};
  for (const m of body[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = {};
    for (const part of splitTopLevel(m[2], ';')) {
      const i = part.indexOf(':');
      if (i > 0) decls[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    out[m[1].trim()] = decls;
  }
  return out;
}

export function toTailwindV3(model) {
  const fonts = fontTokens(model);
  const kf = animationsList(model);
  const extend = {
    colors: Object.fromEntries(colorTokens(model).map((c) => [c.name, c.value])),
    fontFamily: Object.fromEntries(fonts.map((f) => [f.name, splitTopLevel(f.stack).map((s) => s.replace(/^'|'$/g, ''))])),
    fontSize: Object.fromEntries(
      model.typeScale.map((t) => {
        const extra = { lineHeight: String(lineHeightValue(t.lineHeight)), fontWeight: String(t.weight) };
        if (t.letterSpacing !== 'normal') extra.letterSpacing = t.letterSpacing;
        return [t.name, [`${t.size}px`, extra]];
      }),
    ),
    borderRadius: Object.fromEntries(model.radii.map((r) => [r.name, r.value])),
    boxShadow: Object.fromEntries(model.shadows.map((s) => [s.name, s.value])),
    transitionTimingFunction: Object.fromEntries(model.motion.easings.filter((e) => !['linear', 'default'].includes(e.name)).map((e) => [e.name, e.value])),
    transitionDuration: Object.fromEntries(model.motion.durations.map((d) => [d.name, `${d.ms}ms`])),
    keyframes: Object.fromEntries(kf.map((a) => [a.name, parseKeyframes(a.css)])),
    animation: Object.fromEntries(kf.map((a) => [a.name, a.shorthand])),
    maxWidth: model.containers.length ? { site: `${model.containers[0].px}px` } : undefined,
  };
  for (const k of Object.keys(extend)) if (extend[k] && !Object.keys(extend[k]).length) delete extend[k];
  const theme = { extend };
  if (model.breakpoints.length) theme.screens = Object.fromEntries(model.breakpoints.map((b) => [b.name, `${b.px}px`]));
  return lines([
    header(model, 'tailwind.config.js para Tailwind CSS v3').replace('/*', '/**').replace(/ \*\/$/, '\n * Cores com nome de matiz (ex.: blue-500) sobrepõem as do Tailwind; remova as que não quiser trocar.\n */'),
    model.fonts.googleUrl ? `// Fontes: <link href="${cmt(model.fonts.googleUrl, 600)}" rel="stylesheet">` : null,
    "/** @type {import('tailwindcss').Config} */",
    `module.exports = {\n  content: ['./src/**/*.{html,js,jsx,ts,tsx,vue,svelte}'],\n  theme: ${jsObject(theme, 4)},\n};`,
    '',
  ]);
}

// ---------------------------------------------------------------- W3C DTCG (2025.10)
const dim = (value, unit = 'px') => ({ value: round(value, 3), unit });

function dtcgColor(css) {
  const c = parseColor(css);
  if (!c) return css;
  return { colorSpace: 'srgb', components: srgbComponents(c), alpha: round(c.a ?? 1, 3), hex: toHex({ ...c, a: 1 }) };
}

export function parseShadow(css) {
  return splitTopLevel(css).map((layer) => {
    const colorMatch = /(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)|#[0-9a-f]{3,8}\b/i.exec(layer);
    const rest = colorMatch ? layer.replace(colorMatch[0], ' ') : layer;
    const nums = (rest.match(/-?[\d.]+(?:px)?(?=\s|$)/g) || []).map(parseFloat);
    return {
      color: dtcgColor(colorMatch ? colorMatch[0] : '#000000'),
      offsetX: dim(nums[0] || 0),
      offsetY: dim(nums[1] || 0),
      blur: dim(nums[2] || 0),
      spread: dim(nums[3] || 0),
      inset: /\binset\b/.test(layer),
    };
  });
}

export function toDTCG(model) {
  const fonts = fontTokens(model);
  const t = {
    $description: `Tokens extraídos com Decalque de ${model.source.kind === 'figma' ? `"${model.source.title}" (Figma)` : model.source.url} em ${date(model.source.capturedAt)}.`,
    color: {},
    font: { family: {} },
    typography: {},
    spacing: {},
    radius: {},
    shadow: {},
    duration: {},
    easing: {},
    breakpoint: {},
  };
  for (const c of colorTokens(model)) {
    t.color[c.name] = { $type: 'color', $value: c.alias ? `{color.${c.alias}}` : dtcgColor(c.value) };
    const desc = [c.role && `papel: ${c.role}`, c.styleName && `estilo: ${c.styleName}`, c.original && `original: ${c.original}`].filter(Boolean).join(' · ');
    if (desc) t.color[c.name].$description = desc;
  }
  for (const f of fonts) t.font.family[f.name] = { $type: 'fontFamily', $value: splitTopLevel(f.stack).map((s) => s.replace(/^'|'$/g, '')) };
  for (const s of model.typeScale) {
    const fam = fonts.find((f) => f.family === s.family);
    const value = {
      fontFamily: fam ? `{font.family.${fam.name}}` : [s.family],
      fontSize: dim(s.size),
      fontWeight: s.weight,
    };
    const ls = /^(-?[\d.]+)em$/.exec(s.letterSpacing || '');
    value.letterSpacing = dim(ls ? parseFloat(ls[1]) * s.size : 0);
    if (s.lineHeight && s.lineHeight !== 'normal') value.lineHeight = round(parseFloat(s.lineHeight), 3);
    t.typography[s.name] = { $type: 'typography', $value: value };
  }
  for (const s of model.spacing.scale) t.spacing[s.name] = { $type: 'dimension', $value: dim(s.px) };
  for (const r of model.radii) t.radius[r.name] = { $type: 'dimension', $value: dim(r.px) };
  for (const s of model.shadows) t.shadow[s.name] = { $type: 'shadow', $value: parseShadow(s.value) };
  for (const d of model.motion.durations) t.duration[d.name] = { $type: 'duration', $value: { value: d.ms, unit: 'ms' } };
  for (const e of model.motion.easings) if (e.bezier) t.easing[e.name] = { $type: 'cubicBezier', $value: e.bezier };
  for (const b of model.breakpoints) t.breakpoint[b.name] = { $type: 'dimension', $value: dim(b.px) };
  for (const k of Object.keys(t)) if (k !== '$description' && t[k] && typeof t[k] === 'object' && !Object.keys(t[k]).length) delete t[k];
  if (t.font && !Object.keys(t.font.family).length) delete t.font;
  t.$extensions = {
    'app.decalque': {
      source: model.source,
      semantic: model.semantic,
      gradients: model.gradients,
      motion: { springs: model.motion.springs, keyframes: model.motion.keyframes.filter((k) => k.used).map((k) => k.name) },
    },
  };
  return t;
}

// ---------------------------------------------------------------- animações
function waapiToCss(r) {
  const blocks = r.keyframes.map((f) => {
    // valores vêm do JS da página: propriedades customizadas (texto livre) ficam de fora e {};
    // não podem fechar o bloco
    const decls = Object.entries(f)
      .filter(([k]) => k !== 'offset' && k !== 'easing' && !k.startsWith('--') && /^[a-z-]+$/.test(k))
      .map(([k, v]) => `${k}: ${String(v).replace(/[{};]/g, '')}`);
    if (f.easing) decls.push(`animation-timing-function: ${f.easing}`);
    return `  ${round(f.offset * 100, 2)}% { ${decls.join('; ')}; }`;
  });
  return `@keyframes ${r.name} {\n${blocks.join('\n')}\n}`;
}

// Lista única de animações reaproveitáveis: @keyframes em uso, as vindas de JS e as do Figma Motion.
export function animationsList(model) {
  const out = [];
  const seen = new Set();
  const visual = (css) => /[{;]\s*(?!--)[a-z-]+\s*:/i.test(css.replace(/^@keyframes[^{]*\{/, ''));
  for (const a of model.motion.animations) {
    if (!a.css || seen.has(a.name) || !(a.durationMs > 0) || !visual(a.css)) continue;
    seen.add(a.name);
    const parts = [a.name, `${a.durationMs}ms`, a.easing, a.delayMs ? `${a.delayMs}ms` : null, a.iterations !== '1' ? a.iterations : null, a.direction !== 'normal' ? a.direction : null, a.fillMode !== 'none' ? a.fillMode : null];
    out.push({ name: safeName(a.name), css: renameKeyframes(a.css, a.name, safeName(a.name)), shorthand: parts.filter(Boolean).join(' ').replace(a.name, safeName(a.name)), source: 'css' });
  }
  for (const r of model.motion.running || []) {
    if (!r.keyframes || !r.keyframes.length || seen.has(r.name)) continue;
    seen.add(r.name);
    const parts = [r.name, `${r.duration}ms`, r.easing && r.easing !== 'linear' ? r.easing : null, r.delay ? `${r.delay}ms` : null, r.iterations && r.iterations !== 1 ? r.iterations : null, r.direction && r.direction !== 'normal' ? r.direction : null, r.fill && r.fill !== 'none' && r.fill !== 'auto' ? r.fill : null];
    out.push({ name: r.name, css: waapiToCss(r), shorthand: parts.filter(Boolean).join(' '), source: 'js' });
  }
  for (const k of model.motion.keyframes) {
    if (!k.animation || seen.has(k.name)) continue;
    seen.add(k.name);
    out.push({ name: k.name, css: k.css, shorthand: k.animation, source: 'figma' });
  }
  return out.slice(0, 40);
}

function safeName(name) {
  return /^[a-zA-Z_][\w-]*$/.test(name) ? name : `anim-${slugify(name) || 'x'}`;
}

function renameKeyframes(css, from, to) {
  return from === to ? css : css.replace(/@keyframes\s+("[^"]*"|'[^']*'|[^\s{]+)/, `@keyframes ${to}`);
}
