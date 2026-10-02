// Modelo → arquivos do kit: tokens.css, Tailwind v4/v3, W3C DTCG, animations.css, reveal.js e DESIGN.md.

import { contrast, isChromatic, isDark, parseColor, srgbComponents, toHex } from './color.js';
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

function revealClass(r) {
  const name = `reveal-${r.pattern}`;
  const d = r.durationMs > 50 && r.durationMs < 4000 ? r.durationMs : 700;
  const e = r.easing && r.easing !== 'ease' ? r.easing : 'cubic-bezier(0.16, 1, 0.3, 1)';
  const dx = round((r.from.tx || 0) - (r.to.tx || 0), 1);
  const dy = round((r.from.ty || 0) - (r.to.ty || 0), 1);
  const from = [`opacity: ${round(r.from.opacity, 2)}`];
  const to = [`opacity: ${round(r.to.opacity, 2)}`];
  const props = ['opacity'];
  if (dx || dy) {
    from.push(`translate: ${dx}px ${dy}px`);
    to.push('translate: 0 0');
    props.push('translate');
  }
  if (Math.abs((r.from.sx || 1) - (r.to.sx || 1)) > 0.01) {
    from.push(`scale: ${round(r.from.sx / (r.to.sx || 1), 3)}`);
    to.push('scale: 1');
    props.push('scale');
  }
  if (r.from.blur > 0) {
    from.push(`filter: blur(${r.from.blur}px)`);
    to.push('filter: none');
    props.push('filter');
  }
  return lines([
    `/* ${cmt(`${r.count} elemento(s), disparo: ${r.trigger}${r.examples?.length ? ` · ex.: ${r.examples[0]}` : ''}`, 160)} */`,
    `.${name} { ${from.join('; ')}; transition: ${props.map((p) => `${p} ${d}ms ${e}`).join(', ')}; }`,
    `.${name}.is-visible { ${to.join('; ')}; }`,
  ]);
}

export function toAnimationsCSS(model) {
  const list = animationsList(model);
  const unused = model.motion.keyframes.filter((k) => !k.used && !k.animation).slice(0, 30);
  const reveals = [];
  const seen = new Set();
  for (const r of model.motion.reveals || []) {
    if (seen.has(r.pattern)) continue;
    seen.add(r.pattern);
    reveals.push(revealClass(r));
  }
  if (!list.length && !unused.length && !reveals.length) return null;
  return lines([
    header(model, 'animações'),
    '',
    list.length ? '/* ---- Animações em uso (use .animate-<nome>) ---- */' : null,
    ...list.flatMap((a) => [`/* origem: ${a.source === 'js' ? 'Web Animations API (JS)' : a.source === 'figma' ? 'Figma Motion' : 'CSS'} */`, a.css, `.animate-${a.name} { animation: ${a.shorthand}; }`, '']),
    unused.length ? '/* ---- @keyframes definidos no CSS mas não vistos em uso nesta captura ---- */' : null,
    ...unused.map((k) => k.css),
    reveals.length ? '\n/* ---- Reveals ao rolar a página (dispare com reveal.js) ---- */' : null,
    ...reveals,
    reveals.length || list.length
      ? '\n@media (prefers-reduced-motion: reduce) {\n  [class*="animate-"], [class*="reveal-"] { animation: none !important; transition: none !important; opacity: 1 !important; translate: none !important; scale: none !important; filter: none !important; }\n}'
      : null,
    '',
  ]);
}

export function revealScript() {
  return lines([
    '// Decalque — adiciona .is-visible aos elementos com classe reveal-* quando entram na tela.',
    "const io = new IntersectionObserver((entries) => {",
    '  for (const entry of entries) {',
    '    if (!entry.isIntersecting) continue;',
    "    entry.target.classList.add('is-visible');",
    '    io.unobserve(entry.target);',
    '  }',
    "}, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });",
    '',
    "document.querySelectorAll('[class*=\"reveal-\"]').forEach((el) => io.observe(el));",
    '',
  ]);
}

// ---------------------------------------------------------------- DESIGN.md
const md = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function table(head, rows) {
  if (!rows.length) return '';
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(md).join(' | ')} |`)].join('\n');
}

const ROLE_PT = {
  background: 'fundo da página', foreground: 'texto principal', muted: 'texto secundário', surface: 'superfícies/cards',
  border: 'bordas e divisórias', primary: 'ação principal / marca', accent: 'destaque secundário',
};

function buttonLabel(css, primary) {
  if (/gradient\(/.test(css.background || '')) return 'gradiente';
  const bg = parseColor(css.background);
  const hasBorder = css.border && css.border !== 'none';
  if (!bg || bg.a === 0) return hasBorder ? 'contorno' : 'fantasma';
  if (primary && toHex({ ...bg, a: 1 }) === primary) return 'primario';
  if (isChromatic(bg)) return 'colorido';
  return isDark(bg) ? 'escuro' : 'claro';
}

function cssBlock(selector, obj) {
  const entries = Object.entries(obj).filter(([, v]) => v && v !== 'none' && v !== 'normal' && v !== '0px' && v !== 'transparent');
  return entries.length ? `${selector} {\n${entries.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}` : null;
}

export function identity(model) {
  const s = model.semantic;
  const bits = [];
  if (s.background) bits.push(`tema ${isDark(s.background) ? 'escuro' : 'claro'} (fundo \`${s.background}\`)`);
  if (s.primary) bits.push(`cor de ação \`${s.primary}\``);
  const heading = model.fonts.find((f) => f.role === 'heading');
  const body = model.fonts.find((f) => f.role === 'sans') || model.fonts[0];
  if (body) bits.push(heading ? `títulos em **${heading.family}** e texto em **${body.family}**` : `fonte **${body.family}**`);
  const r = [...model.radii].sort((a, b) => b.count - a.count)[0];
  bits.push(r ? (r.name === 'full' ? 'formas em pílula' : `cantos de ${r.value}`) : 'cantos retos');
  bits.push(model.shadows.length ? `${model.shadows.length} nível(is) de sombra` : 'sem sombras');
  const d = [...model.motion.durations].sort((a, b) => b.count - a.count)[0];
  const e = [...model.motion.easings].sort((a, b) => b.count - a.count)[0];
  if (d) bits.push(`movimento de ~${d.ms}ms${e ? ` com \`${e.name}\`` : ''}`);
  return bits.join(' · ');
}

export function toDesignMarkdown(model, ctx = {}) {
  const s = model.source;
  const out = [];
  const files = ctx.files || {};
  const has = (name) => files[name] !== false;
  const title = cmt(s.kind === 'figma' ? `Figma — ${s.title}` : s.title || s.url, 120).replace(/[#<>`]/g, '');
  out.push(`# Design system — ${title}`);
  out.push('');
  out.push(
    `> Extraído com **Decalque** ${s.kind === 'figma' ? `do arquivo do Figma "${s.title}" (via ${s.via === 'plugin' ? 'API de plugins' : 'API REST'})` : `de ${s.url}`} em ${date(s.capturedAt)}${s.viewport ? `, viewport ${s.viewport.width}×${s.viewport.height}` : ''}. ` +
      'Os valores são os efetivamente renderizados; use como referência fiel do visual.',
  );
  out.push('');
  out.push(`**Em uma linha:** ${identity(model)}.`);
  if (model.stack.length) out.push(`\n**Stack detectada:** ${model.stack.map((x) => `${x.name}${x.version ? ` ${x.version}` : ''}`).join(', ')}.`);
  out.push('');

  out.push('## Como aplicar no seu projeto');
  out.push('');
  out.push('1. **CSS puro:** importe `tokens.css` no CSS global. As classes `.text-*` já trazem a tipografia pronta.');
  out.push('2. **Tailwind v4:** cole `tailwind.theme.css` no CSS principal (ele já tem `@import "tailwindcss"` e o `@theme`).');
  out.push('3. **Tailwind v3:** mescle `tailwind.config.js` com o seu.');
  out.push('4. **Outras ferramentas** (Style Dictionary, Tokens Studio): use `tokens.json` (formato W3C DTCG).');
  if (has('animations.css')) out.push(`5. **Animações:** \`animations.css\`${has('reveal.js') ? ' + `reveal.js` (adiciona `.is-visible` aos `.reveal-*` quando entram na tela)' : ''}.`);
  out.push('');
  out.push('Regras para manter o visual:');
  out.push('');
  if (model.semantic.background || model.semantic.primary) {
    out.push(`- Cores só da paleta abaixo. Fundo \`--color-background\`, texto \`--color-foreground\`${model.semantic.primary ? ', ações `--color-primary`' : ''}${model.semantic.border ? ', bordas `--color-border`' : ''}.`);
  }
  if (model.typeScale.length) out.push('- Texto sempre por um estilo da escala tipográfica (sem tamanhos avulsos).');
  if (model.spacing.base) out.push(`- Espaçamentos em múltiplos de **${model.spacing.base}px**.`);
  if (model.radii.length) out.push(`- Raios: ${model.radii.map((r) => `\`${r.name}\` ${r.value}`).join(', ')}.`);
  if (model.motion.durations.length) out.push(`- Movimento: durações ${model.motion.durations.map((d) => `${d.ms}ms`).join(', ')}${model.motion.easings[0] ? `; curva principal \`${model.motion.easings[0].value}\`` : ''}.`);
  out.push('- Logos, fotos e ilustrações de terceiros são de quem fez o original: troque pelos seus antes de publicar.');
  out.push('');
  out.push('<details><summary>Prompt pronto para um agente de IA (Claude Code, Cursor…)</summary>');
  out.push('');
  out.push('```text');
  out.push('Aplique neste projeto o design system descrito em DESIGN.md (pasta do kit Decalque).');
  out.push('Use os tokens de tokens.css (ou tailwind.theme.css se o projeto usa Tailwind v4), a escala');
  out.push('tipográfica, os espaçamentos, raios, sombras e as animações de animations.css. Reproduza os');
  out.push('componentes descritos (botões, inputs, cards) com os mesmos valores. Não invente cores nem');
  out.push('tamanhos fora da escala. Imagens e ícones estão em assets/.');
  out.push('```');
  out.push('');
  out.push('</details>');
  out.push('');

  out.push('## Cores');
  out.push('');
  out.push(table(['Token', 'Valor', 'Papel', 'Onde aparece'], colorTokens(model).map((c) => [
    `\`--color-${c.name}\``,
    `\`${c.value}\`${c.alpha < 1 ? ` (${Math.round(c.alpha * 100)}%)` : ''}${c.original ? ` · \`${c.original}\`` : ''}`,
    c.role ? ROLE_PT[c.role] || c.role : c.styleName ? `estilo "${c.styleName}"` : '',
    c.roles?.length ? c.roles.map((r) => ({ text: 'texto', bg: 'fundo', fill: 'preenchimento', border: 'borda', stroke: 'contorno', shadow: 'sombra', gradient: 'gradiente' })[r] || r).join(', ') : c.usedOn?.join(', ') || '',
  ])));
  if (model.stats.contrast) out.push(`\nContraste texto/fundo: **${model.stats.contrast}:1**${model.stats.contrast >= 7 ? ' (AAA)' : model.stats.contrast >= 4.5 ? ' (AA)' : ' (abaixo do AA)'}.`);
  if (model.gradients.length) {
    out.push('\n### Gradientes\n');
    for (const g of model.gradients) out.push(`- \`--${g.name}\`: \`${g.value}\``);
  }
  const { light, dark, collections } = model.variables;
  if (collections?.length) {
    out.push('\n### Variáveis do Figma\n');
    for (const c of collections) {
      out.push(`**${c.name}** — modos: ${c.modes.join(', ')}\n`);
      out.push(table(['Variável', ...c.modes], c.variables.slice(0, 60).map((v) => [v.name, ...c.modes.map((md) => {
        const val = v.values[md];
        return val && typeof val === 'object' ? `→ ${val.alias}` : String(val ?? '');
      })])));
      if (c.variables.length > 60) out.push(`\n… e mais ${c.variables.length - 60} (todas em \`site-variables.css\`).`);
      out.push('');
    }
  } else if (light.length || dark.length) {
    out.push(`\n### Variáveis CSS do próprio site\n\nO site já tem tokens com nomes próprios (${light.length} no tema padrão${dark.length ? `, ${dark.length} no tema escuro` : ''}). Estão em \`site-variables.css\`. As de cor:\n`);
    const colorVars = light.filter((v) => v.type === 'color').slice(0, 30);
    out.push(table(['Variável', 'Valor', 'Escuro'], colorVars.map((v) => [`\`${v.name}\``, `\`${v.value}\``, dark.find((d) => d.name === v.name)?.value || ''])));
  }
  out.push('');

  out.push('## Tipografia');
  out.push('');
  if (model.fonts.length) {
    out.push(table(['Família', 'Papel', 'Pesos', 'Origem'], model.fonts.map((f) => [
      f.family,
      f.role || '',
      f.weights.join(', '),
      { google: 'Google Fonts', adobe: 'Adobe Fonts (licença)', self: 'auto-hospedada (arquivos no kit)', system: 'fonte do sistema', figma: 'Figma', unknown: '?' }[f.source] || f.source,
    ])));
    if (model.fonts.googleUrl) out.push(`\nGoogle Fonts: \`<link href="${model.fonts.googleUrl}" rel="stylesheet">\`${model.fonts.googleGuess ? ' (tentativa — confirme cada família)' : ''}`);
  }
  out.push('');
  out.push(table(['Estilo', 'Fonte', 'Tamanho', 'Peso', 'Altura de linha', 'Espaçamento', 'Exemplo'], model.typeScale.map((t) => [
    `\`.text-${t.name}\``, t.family, `${t.size}px`, t.weight, t.lineHeight, t.letterSpacing, `${t.transform ? `[${t.transform}] ` : ''}${t.sample}`.slice(0, 50),
  ])));
  out.push('');

  out.push('## Espaçamento, forma e profundidade');
  out.push('');
  if (model.spacing.scale.length) {
    out.push(`Escala de espaçamento${model.spacing.base ? ` (grade de ${model.spacing.base}px)` : ''}: ${model.spacing.scale.map((x) => `${x.px}px`).join(' · ')}`);
    if (model.spacing.gaps?.length) out.push(`\nGaps mais usados em flex/grid: ${model.spacing.gaps.slice(0, 6).map((g) => `${g.px}px`).join(', ')}`);
  }
  if (model.radii.length) out.push(`\nRaios: ${model.radii.map((r) => `\`${r.name}\` = ${r.value} (${r.count}×)`).join(' · ')}`);
  if (model.shadows.length) {
    out.push('\nSombras:\n');
    for (const sh of model.shadows) out.push(`- \`--shadow-${sh.name}\`: \`${sh.value}\``);
  }
  if (model.effects.length) out.push(`\nEfeitos: ${model.effects.map((e) => `${e.kind === 'backdrop' ? 'backdrop-filter' : 'filter'} \`${e.value}\``).join(' · ')}`);
  if (model.borders.length) out.push(`\nBordas: ${model.borders.map((b) => `\`${b.value}\` (${b.count}×)`).join(' · ')}`);
  out.push('');

  if (model.breakpoints.length || model.containers.length) {
    out.push('## Layout');
    out.push('');
    if (model.breakpoints.length) out.push(`Breakpoints${model.breakpoints[0].fromFrames ? ' (larguras dos frames do Figma)' : ''}: ${model.breakpoints.map((b) => `\`${b.name}\` ${b.px}px`).join(' · ')}`);
    if (model.containers.length) out.push(`\nLargura máxima de conteúdo: ${model.containers.map((c) => `${c.px}px`).join(', ')}`);
    out.push('');
  }

  const comps = model.components;
  if (comps.buttons.length || comps.inputs.length || comps.cards.length || comps.links.length) {
    out.push('## Componentes recorrentes');
    out.push('');
    out.push('Valores computados de verdade (não aproximações). Estados vêm das regras `:hover`/`:focus` do CSS do site.');
    out.push('');
    const block = (title, list, prefix, label) => {
      if (!list.length) return;
      out.push(`### ${title}\n`);
      list.forEach((c, i) => {
        const name = `${prefix}-${slugify(label ? label(c.css) : String(i + 1))}${list.length > 1 && label ? `-${i + 1}` : ''}`;
        out.push(`\`${c.count}×\`${c.sample ? ` — ex.: "${md(c.sample)}"` : ''}`);
        out.push('');
        out.push('```css');
        out.push(cssBlock(`.${name}`, c.css));
        for (const [state, decls] of Object.entries(c.states || {})) {
          const block = cssBlock(`.${name}:${state}`, decls);
          if (block) out.push(block);
        }
        out.push('```');
        out.push('');
      });
    };
    block('Botões', comps.buttons, 'btn', (css) => buttonLabel(css, model.semantic.primary));
    block('Campos de formulário', comps.inputs, 'input');
    block('Cards', comps.cards, 'card');
    block('Links', comps.links, 'link');
  }
  if (comps.figma?.length) {
    out.push('## Componentes do Figma');
    out.push('');
    out.push(table(['Componente', 'Variantes', 'Tamanho', 'Página', 'Descrição'], comps.figma.slice(0, 80).map((c) => [c.name, c.variants || '', `${c.width}×${c.height}`, c.page, c.description])));
    out.push('');
  }

  const mo = model.motion;
  if (mo.durations.length || mo.keyframes.length || mo.reveals?.length || mo.running?.length || mo.transitions.length) {
    out.push('## Movimento');
    out.push('');
    if (mo.durations.length) out.push(`Durações: ${mo.durations.map((d) => `${d.ms}ms (${d.count}×)`).join(' · ')} — tokens \`--duration-<ms>\`.`);
    if (mo.easings.length) out.push(`\nCurvas: ${mo.easings.map((e) => `\`${e.name}\` = \`${e.value}\``).join(' · ')}`);
    if (mo.springs?.length) out.push(`\nMolas (Figma): ${mo.springs.map((sp) => `\`${sp.name}\` massa ${sp.mass}, rigidez ${sp.stiffness}, amortecimento ${sp.damping} — Framer Motion: \`{ type: "spring", stiffness: ${sp.stiffness}, damping: ${sp.damping}, mass: ${sp.mass} }\``).join('; ')}`);
    if (mo.transitions.length) {
      out.push('\nTransições mais comuns:\n');
      out.push(table(['Propriedade', 'Duração', 'Curva', 'Uso'], mo.transitions.slice(0, 10).map((t) => [t.property, `${t.durationMs}ms`, t.easing, `${t.count}×${t.triggers?.length ? ` (${t.triggers.join(', ')})` : ''}`])));
    }
    if (mo.reveals?.length) {
      out.push('\n### Reveals ao rolar\n');
      out.push('Detectados rolando a página. Classes prontas em `animations.css` (`.reveal-*` + `reveal.js`).\n');
      out.push(table(['Padrão', 'De → para', 'Duração', 'Disparo', 'Elementos'], mo.reveals.map((r) => [
        `\`reveal-${r.pattern}\``,
        `opacidade ${r.from.opacity}→${r.to.opacity}${r.from.ty !== r.to.ty ? `, y ${round(r.from.ty - r.to.ty, 0)}px→0` : ''}${r.from.tx !== r.to.tx ? `, x ${round(r.from.tx - r.to.tx, 0)}px→0` : ''}${r.from.sx !== r.to.sx ? `, escala ${r.from.sx}→${r.to.sx}` : ''}`,
        r.durationMs ? `${r.durationMs}ms` : '?',
        r.trigger,
        `${r.count}${r.examples?.[0] ? ` (ex.: ${r.examples[0]})` : ''}`,
      ])));
    }
    const list = animationsList(model);
    if (list.length) {
      out.push('\n### Animações\n');
      for (const a of list.slice(0, 12)) {
        out.push(`**${a.name}** — \`animation: ${a.shorthand}\` (${a.source === 'js' ? 'Web Animations API' : a.source === 'figma' ? 'Figma Motion' : 'CSS'})\n`);
        out.push('```css');
        out.push(a.css);
        out.push('```');
        out.push('');
      }
    }
    if (mo.presets?.length) out.push(`\nEstilos de animação disponíveis no Figma: ${mo.presets.slice(0, 20).map((p) => p.name).join(', ')}`);
    const libs = model.stack.filter((x) => x.kind === 'motion');
    if (libs.length) out.push(`\nBibliotecas de animação no site: ${libs.map((l) => `${l.name}${l.version ? ` ${l.version}` : ''}`).join(', ')}. Animações feitas por elas só aparecem aqui se estavam rodando na captura (ou nos reveals).`);
    out.push('');
  }

  const a = model.assets;
  const assetLines = ctx.assetIndex || [];
  if (assetLines.length || a.images.length || a.svgs.length) {
    out.push('## Assets');
    out.push('');
    const counts = [
      a.images.length && `${a.images.length} imagens`, a.svgs.length && `${a.svgs.length} SVGs/ícones`, a.fonts.length && `${a.fonts.length} arquivos de fonte`,
      a.lottie.length && `${a.lottie.length} Lottie`, a.videos.length && `${a.videos.length} vídeos`, a.frames?.length && `${a.frames.length} frames`, a.icons?.length && `${a.icons.length} ícones`,
    ].filter(Boolean);
    out.push(`${counts.join(' · ')}. ${assetLines.length ? 'Arquivos baixados em `assets/` (lista completa em `assets/manifest.json`).' : ''}`);
    if (assetLines.length) {
      out.push('');
      out.push(table(['Arquivo', 'Tipo', 'Origem'], assetLines.slice(0, 40).map((x) => [`\`${x.path}\``, x.kind, x.url ? x.url.slice(0, 80) : x.note || ''])));
      if (assetLines.length > 40) out.push(`\n… e mais ${assetLines.length - 40}.`);
    }
    out.push('');
  }

  if (model.notes.length) {
    out.push('## Observações');
    out.push('');
    for (const n of model.notes) out.push(`- ${n}`);
    if (s.kind === 'web') out.push(`- Valores medidos no viewport de ${s.viewport?.width}px; estilos de outros breakpoints não aparecem nos componentes.`);
    out.push('');
  }
  return out.filter((l) => l !== null && l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
}
