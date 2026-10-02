// Declarações CSS computadas → classes do Tailwind (v4; valores arbitrários também valem no v3.3+).
// Tudo que não tem utilitário direto vira propriedade arbitrária [prop:valor], então nada se perde.

import { parseColor, toHex } from './color.js';
import { round, splitTopLevel } from './util.js';

// espaços viram "_" dentro de [] (regra do Tailwind); "_" literal vira "\_"
// aspas duplas viram simples para não quebrar className="…" no JSX
export const arb = (v) => String(v).trim().replace(/_/g, '\\_').replace(/"/g, "'").replace(/\s*,\s*/g, ',').replace(/\s+/g, '_');

const pxNum = (v) => {
  const m = /^(-?[\d.]+)px$/.exec(String(v).trim());
  return m ? parseFloat(m[1]) : null;
};

// 16px → "4" — só números que existem na escala padrão do v3 e do v4; o resto vira [16.5px]
const SCALE = new Set([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96]);
function scale(v) {
  if (v === 'auto') return 'auto';
  const n = pxNum(v);
  if (n === 1) return 'px';
  if (n != null && n >= 0 && SCALE.has(n / 4)) return String(n / 4);
  return `[${arb(v)}]`;
}

function withNeg(prefix, v) {
  const n = pxNum(v);
  if (n != null && n < 0) {
    const s = scale(`${-n}px`);
    return s.startsWith('[') ? `${prefix}-[${arb(v)}]` : `-${prefix}-${s}`;
  }
  return `${prefix}-${scale(v)}`;
}

function colorValue(v) {
  const c = parseColor(v);
  if (c) {
    if (c.a === 0) return 'transparent';
    return `[${toHex(c)}]`;
  }
  if (/^(currentcolor|inherit)$/i.test(v)) return 'current';
  return `[${arb(v)}]`;
}

const FONT_WEIGHT = { 100: 'thin', 200: 'extralight', 300: 'light', 400: 'normal', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black' };
const ALIGN = { 'flex-start': 'start', start: 'start', center: 'center', 'flex-end': 'end', end: 'end', baseline: 'baseline', stretch: 'stretch' };
const JUSTIFY = { ...ALIGN, 'space-between': 'between', 'space-around': 'around', 'space-evenly': 'evenly', normal: 'normal' };

// Reordena "rgba(...) 0px 1px 2px 0px" → "0px 1px 2px 0px rgba(...)" (forma que o Tailwind entende).
function shadowValue(v) {
  return splitTopLevel(v)
    .map((layer) => {
      const m = /(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)|#[0-9a-f]{3,8}\b/i.exec(layer);
      if (!m) return layer.trim();
      const c = parseColor(m[0]);
      const color = c ? toHex(c) : m[0];
      return `${layer.replace(m[0], '').trim()} ${color}`.trim();
    })
    .join(',');
}

const SIDES = ['top', 'right', 'bottom', 'left'];

// Agrupa padding/margin/radius/border de 4 lados em p-4 / px-2 py-1 / pt-3…
function boxClasses(map, prop, prefix, sidePrefix, fmt) {
  const v = SIDES.map((s) => map.get(`${prop}-${s}`));
  if (v.every((x) => x == null)) return [];
  const [t, r, b, l] = v;
  for (const s of SIDES) map.delete(`${prop}-${s}`);
  if (v.every((x) => x != null) && t === r && r === b && b === l) return [fmt(prefix, t)];
  const out = [];
  if (t != null && b != null && t === b && r != null && l != null && r === l) return [fmt(`${prefix}y`, t), fmt(`${prefix}x`, r)];
  const names = sidePrefix;
  [t, r, b, l].forEach((x, i) => {
    if (x != null) out.push(fmt(`${prefix}${names[i]}`, x));
  });
  return out;
}

function radiusClasses(map) {
  const keys = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];
  const v = keys.map((k) => map.get(k));
  if (v.every((x) => x == null)) return [];
  keys.forEach((k) => map.delete(k));
  const fmt = (p, x) => {
    const first = String(x).split(' ')[0];
    const n = pxNum(first);
    if (first.endsWith('%') ? parseFloat(first) >= 50 : n != null && n >= 999) return `${p}-full`;
    return `${p}-[${arb(first)}]`;
  };
  if (v.every((x) => x != null && x === v[0])) return [fmt('rounded', v[0])];
  const names = ['rounded-tl', 'rounded-tr', 'rounded-br', 'rounded-bl'];
  return v.map((x, i) => (x != null ? fmt(names[i], x) : null)).filter(Boolean);
}

function borderClasses(map) {
  const out = [];
  const w = SIDES.map((s) => map.get(`border-${s}-width`));
  const st = SIDES.map((s) => map.get(`border-${s}-style`));
  const c = SIDES.map((s) => map.get(`border-${s}-color`));
  for (const s of SIDES) ['width', 'style', 'color'].forEach((k) => map.delete(`border-${s}-${k}`));
  const same = (arr) => arr.every((x) => x != null && x === arr[0]);
  const wcls = (p, x) => {
    const n = pxNum(x);
    if (n === 1) return p;
    if ([0, 2, 4, 8].includes(n)) return `${p}-${n}`;
    return `${p}-[${arb(x)}]`;
  };
  const sideP = ['border-t', 'border-r', 'border-b', 'border-l'];
  if (same(w)) out.push(wcls('border', w[0]));
  else w.forEach((x, i) => x != null && out.push(wcls(sideP[i], x)));
  const styles = st.filter((x) => x && x !== 'solid' && x !== 'none');
  if (styles.length) out.push(/^(dashed|dotted|double|hidden)$/.test(styles[0]) ? `border-${styles[0]}` : `[border-style:${arb(styles[0])}]`);
  if (same(c)) out.push(`border-${colorValue(c[0])}`);
  else c.forEach((x, i) => x != null && out.push(`${sideP[i]}-${colorValue(x)}`));
  return out;
}

function gridCols(v, prefix) {
  if (!v || v === 'none') return null;
  const tracks = v.split(/\s+(?![^(]*\))/);
  if (tracks.length > 1 && tracks.every((t) => t === tracks[0]) && /px$/.test(tracks[0])) return `${prefix}-${tracks.length}`;
  return `${prefix}-[${arb(v)}]`;
}

// decls: [[prop, valor]] → string de classes (sem prefixo de estado)
export function declsToClasses(decls) {
  const map = new Map(decls);
  const out = [];
  out.push(...boxClasses(map, 'padding', 'p', ['t', 'r', 'b', 'l'], (p, v) => `${p}-${scale(v)}`));
  out.push(...boxClasses(map, 'margin', 'm', ['t', 'r', 'b', 'l'], (p, v) => (v === 'auto' ? `${p}-auto` : withNeg(p, v))));
  out.push(...radiusClasses(map));
  out.push(...borderClasses(map));
  const rg = map.get('row-gap');
  const cg = map.get('column-gap');
  map.delete('row-gap');
  map.delete('column-gap');
  if (rg && cg && rg === cg && rg !== 'normal') out.push(`gap-${scale(rg)}`);
  else {
    if (rg && rg !== 'normal') out.push(`gap-y-${scale(rg)}`);
    if (cg && cg !== 'normal') out.push(`gap-x-${scale(cg)}`);
  }
  const ox = map.get('overflow-x');
  const oy = map.get('overflow-y');
  map.delete('overflow-x');
  map.delete('overflow-y');
  if (ox && ox === oy) out.push(`overflow-${ox}`);
  else {
    if (ox) out.push(`overflow-x-${ox}`);
    if (oy) out.push(`overflow-y-${oy}`);
  }

  for (const [p, v] of map) {
    const cls = single(p, v);
    if (cls) out.push(cls);
  }
  return out.filter(Boolean);
}

const COLOR_PROPS = /^(color|background-color|border-(top|right|bottom|left)-color|text-decoration-color|outline-color)$/;

function single(p, v) {
  // var(): sem saber o tipo, o Tailwind adivinha errado (text-[var(--x)] vira cor); propriedade arbitrária é explícita
  if (/var\(/.test(v) && !COLOR_PROPS.test(p)) return `[${p}:${arb(v)}]`;
  switch (p) {
    case 'display':
      return v === 'none' ? 'hidden' : /^(block|inline-block|inline|flex|inline-flex|grid|inline-grid|contents|table|table-row|table-cell|flow-root|list-item)$/.test(v) ? v : `[display:${arb(v)}]`;
    case 'position':
      return v;
    case 'top':
    case 'right':
    case 'bottom':
    case 'left':
      return v === 'auto' ? null : withNeg(p, v);
    case 'z-index':
      return /^-?\d+$/.test(v) ? ([0, 10, 20, 30, 40, 50].includes(+v) ? `z-${v}` : `z-[${v}]`) : null;
    case 'width':
      return `w-${scale(v)}`;
    case 'height':
      return `h-${scale(v)}`;
    case 'min-width':
      return v === 'auto' ? null : `min-w-${scale(v)}`;
    case 'min-height':
      return v === 'auto' ? null : `min-h-${scale(v)}`;
    case 'max-width':
      return v === 'none' ? null : v === '100%' ? 'max-w-full' : `max-w-[${arb(v)}]`;
    case 'max-height':
      return v === 'none' ? null : `max-h-[${arb(v)}]`;
    case 'box-sizing':
      return v === 'content-box' ? 'box-content' : null; // border-box é o padrão do preflight
    case 'flex-direction':
      return { row: 'flex-row', column: 'flex-col', 'row-reverse': 'flex-row-reverse', 'column-reverse': 'flex-col-reverse' }[v];
    case 'flex-wrap':
      return { wrap: 'flex-wrap', nowrap: 'flex-nowrap', 'wrap-reverse': 'flex-wrap-reverse' }[v];
    case 'justify-content':
      return JUSTIFY[v] ? `justify-${JUSTIFY[v]}` : `[justify-content:${arb(v)}]`;
    case 'align-items':
      return ALIGN[v] ? `items-${ALIGN[v]}` : v === 'normal' ? null : `[align-items:${arb(v)}]`;
    case 'align-self':
      return ALIGN[v] ? `self-${ALIGN[v]}` : v === 'auto' ? null : `[align-self:${arb(v)}]`;
    case 'align-content':
      return JUSTIFY[v] ? `content-${JUSTIFY[v]}` : null;
    case 'justify-items':
      return ALIGN[v] ? `justify-items-${ALIGN[v]}` : null;
    case 'justify-self':
      return ALIGN[v] ? `justify-self-${ALIGN[v]}` : null;
    case 'flex-grow':
      return v === '1' ? 'grow' : v === '0' ? 'grow-0' : `grow-[${v}]`;
    case 'flex-shrink':
      return v === '0' ? 'shrink-0' : v === '1' ? 'shrink' : `shrink-[${v}]`;
    case 'flex-basis':
      return v === 'auto' ? null : `basis-[${arb(v)}]`;
    case 'order':
      return `order-[${v}]`;
    case 'grid-template-columns':
      return gridCols(v, 'grid-cols');
    case 'grid-template-rows':
      return gridCols(v, 'grid-rows');
    case 'grid-column-start':
    case 'grid-column-end':
    case 'grid-row-start':
    case 'grid-row-end': {
      const m = /^span (\d+)$/.exec(v);
      const base = p.startsWith('grid-column') ? 'col' : 'row';
      if (m && p.endsWith('-start')) return `${base}-span-${m[1]}`;
      return `[${p}:${arb(v)}]`;
    }
    case 'color':
      return `text-${colorValue(v)}`;
    case 'background-color':
      return `bg-${colorValue(v)}`;
    case 'background-image':
      return v === 'none' ? null : `bg-[${arb(v)}]`;
    case 'background-size':
      return v === 'cover' ? 'bg-cover' : v === 'contain' ? 'bg-contain' : `[background-size:${arb(v)}]`;
    case 'background-position':
      return /^(50% 50%|center)$/.test(v) ? 'bg-center' : `[background-position:${arb(v)}]`;
    case 'background-repeat':
      return v === 'no-repeat' ? 'bg-no-repeat' : v === 'repeat' ? null : `[background-repeat:${arb(v)}]`;
    case 'background-clip':
    case '-webkit-background-clip':
      return v === 'text' ? 'bg-clip-text' : `[background-clip:${arb(v)}]`;
    case 'font-family':
      return `[font-family:${arb(v)}]`;
    case 'font-size':
      return `text-[${arb(v)}]`;
    case 'font-weight':
      return FONT_WEIGHT[v] ? `font-${FONT_WEIGHT[v]}` : `font-[${v}]`;
    case 'font-style':
      return v === 'italic' ? 'italic' : v === 'normal' ? 'not-italic' : null;
    case 'line-height': {
      const n = pxNum(v);
      return v === 'normal' ? '[line-height:normal]' : n != null ? `leading-[${round(n, 2)}px]` : `leading-[${arb(v)}]`;
    }
    case 'letter-spacing':
      return v === 'normal' ? null : `tracking-[${arb(v)}]`;
    case 'text-align':
      return { left: 'text-left', center: 'text-center', right: 'text-right', justify: 'text-justify', end: 'text-end' }[v] || null;
    case 'text-transform':
      return { uppercase: 'uppercase', lowercase: 'lowercase', capitalize: 'capitalize', none: 'normal-case' }[v];
    case 'text-decoration-line':
      return { underline: 'underline', 'line-through': 'line-through', overline: 'overline', none: 'no-underline' }[v] || `[text-decoration-line:${arb(v)}]`;
    case 'text-decoration-color':
      return `decoration-${colorValue(v)}`;
    case 'text-underline-offset':
      return `underline-offset-[${arb(v)}]`;
    case 'white-space':
      return { nowrap: 'whitespace-nowrap', pre: 'whitespace-pre', 'pre-wrap': 'whitespace-pre-wrap', 'pre-line': 'whitespace-pre-line', normal: 'whitespace-normal', 'break-spaces': 'whitespace-break-spaces' }[v] || null;
    case 'text-overflow':
      return v === 'ellipsis' ? 'text-ellipsis' : v === 'clip' ? 'text-clip' : null;
    case 'word-break':
      return v === 'break-all' ? 'break-all' : v === 'keep-all' ? 'break-keep' : null;
    case 'text-wrap':
      return { balance: 'text-balance', pretty: 'text-pretty', nowrap: 'text-nowrap', wrap: 'text-wrap' }[v] || null;
    case 'opacity': {
      const n = Math.round(parseFloat(v) * 100);
      return Number.isFinite(n) ? (n % 5 === 0 ? `opacity-${n}` : `opacity-[${v}]`) : null;
    }
    case 'box-shadow':
      return v === 'none' ? 'shadow-none' : `shadow-[${arb(shadowValue(v))}]`;
    case 'cursor':
      return `cursor-${/^[a-z-]+$/.test(v) ? v : `[${arb(v)}]`}`;
    case 'pointer-events':
      return v === 'none' ? 'pointer-events-none' : 'pointer-events-auto';
    case 'user-select':
      return { none: 'select-none', text: 'select-text', all: 'select-all', auto: 'select-auto' }[v];
    case 'visibility':
      return v === 'hidden' ? 'invisible' : v === 'collapse' ? 'collapse' : 'visible';
    case 'object-fit':
      return `object-${v}`;
    case 'aspect-ratio':
      // "auto 1200 / 630" é o navegador derivando de width/height do <img>, que já vão como atributos
      return /^auto/.test(v) ? null : `aspect-[${arb(String(v).replace(/\s*\/\s*/, '/'))}]`;
    case 'mix-blend-mode':
      return `mix-blend-${v}`;
    case 'backdrop-filter': {
      const m = /^blur\(([\d.]+px)\)$/.exec(v);
      return m ? `backdrop-blur-[${m[1]}]` : `[backdrop-filter:${arb(v)}]`;
    }
    case 'filter': {
      const m = /^blur\(([\d.]+px)\)$/.exec(v);
      return m ? `blur-[${m[1]}]` : `[filter:${arb(v)}]`;
    }
    case 'list-style-type':
      return { none: 'list-none', disc: 'list-disc', decimal: 'list-decimal' }[v] || `[list-style-type:${arb(v)}]`;
    case 'transition-property':
      return v === 'all' ? 'transition-all' : `transition-[${arb(v)}]`;
    case 'transition-duration':
      return `duration-[${arb(v)}]`;
    case 'transition-timing-function':
      return v === 'ease' ? null : { linear: 'ease-linear', 'ease-in': 'ease-in', 'ease-out': 'ease-out', 'ease-in-out': 'ease-in-out' }[v] || `ease-[${arb(v)}]`;
    case 'transition-delay':
      return v === '0s' ? null : `delay-[${arb(v)}]`;
    case 'content':
      return `content-[${arb(v.replace(/^"(.*)"$/, "'$1'"))}]`;
    default:
      return `[${p}:${arb(v)}]`;
  }
}

// Junta as propriedades de animação numa classe animate-[...] só.
export function animationClass(decls) {
  const get = (k) => (decls.find(([p]) => p === k) || [])[1];
  const name = get('animation-name');
  if (!name || name === 'none') return { cls: null, rest: decls };
  const parts = [name, get('animation-duration'), get('animation-timing-function'), get('animation-delay'), get('animation-iteration-count'), get('animation-direction'), get('animation-fill-mode')].filter((x) => x && x !== '0s' && x !== 'normal' && x !== 'none' && x !== '1');
  return { cls: `animate-[${arb(parts.join(' '))}]`, rest: decls.filter(([p]) => !p.startsWith('animation-')) };
}

// Nome e valor vêm da página — inclusive do texto de regras :hover, onde attr(), var() e nomes de custom property
// com escape carregam aspas. A classe vai dentro de className="…": aspa dupla ali fecharia o atributo e injetaria
// JSX no componente que o usuário cola no projeto. Nenhuma classe sai com aspa dupla nem espaço.
const inert = (c) => c.replace(/"/g, "'").replace(/\s+/g, '_');

export function toClassList(decls, prefix = '') {
  const { cls, rest } = animationClass(decls);
  const list = declsToClasses(rest);
  if (cls) list.push(cls);
  return list.map((c) => inert(`${prefix}${c}`));
}
