// Telas do painel: seções do design system e a tela do componente capturado.

import { animationsList, identity } from '../lib/exporters.js';
import { parseCubicBezier } from '../lib/util.js';
import { copyText, h, svgDataUrl, svgIcon } from './dom.js';

export const SECTIONS = [
  ['overview', 'Visão geral'], ['colors', 'Cores'], ['type', 'Tipografia'], ['layout', 'Layout'], ['effects', 'Efeitos'],
  ['motion', 'Movimento'], ['components', 'Componentes'], ['assets', 'Assets'], ['export', 'Exportar'],
];

const ROLE_PT = {
  background: 'Fundo', foreground: 'Texto', primary: 'Primária', accent: 'Destaque', surface: 'Superfície', muted: 'Texto 2', border: 'Borda',
};
const SOURCE_PT = { google: 'Google Fonts', adobe: 'Adobe Fonts', self: 'auto-hospedada', system: 'sistema', figma: 'Figma', unknown: '?' };

const section = (title, ...children) => h('section', { class: 'block' }, title ? h('h3', { text: title }) : null, ...children);
const empty = (text) => h('p', { class: 'empty', text });
const chip = (text, cls = '') => h('span', { class: `chip ${cls}`, text });
const count = (n) => h('span', { class: 'count', text: `${n}×` });

function copyable(el, value, label) {
  el.classList.add('copyable');
  el.title = `Copiar ${value}`;
  el.tabIndex = 0;
  const go = () => copyText(value, label || `Copiado: ${value.length > 40 ? `${value.slice(0, 40)}…` : value}`);
  el.addEventListener('click', go);
  el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go()));
  return el;
}

function swatch(c) {
  const tile = h(
    'div',
    { class: 'swatch' },
    h('div', { class: 'swatch-color checker' }, h('div', { style: { background: c.value } })),
    h('div', { class: 'swatch-meta' }, h('strong', { text: c.name }), h('code', { text: c.value }), c.original ? h('small', { text: c.original }) : null),
  );
  return copyable(tile, c.value);
}

// ------------------------------------------------------------------ visão geral
function overview(model, ctx) {
  const s = model.source;
  const stats = s.kind === 'figma'
    ? `${model.stats.nodes?.toLocaleString('pt-BR')} camadas · ${model.stats.pages} páginas · ${model.stats.frames} frames · ${model.stats.styles} estilos`
    : `${model.stats.elements?.styled?.toLocaleString('pt-BR')} de ${model.stats.elements?.total?.toLocaleString('pt-BR')} elementos · ${model.stats.sheets} folhas de estilo · ${((model.stats.ms?.total || 0) / 1000).toFixed(1)} s`;
  return [
    section(null, h('p', { class: 'identity', text: `${identity(model).replace(/\*\*|`/g, '')}.` }), h('p', { class: 'muted small', text: stats })),
    model.stack.length ? section('Stack detectada', h('div', { class: 'chips' }, model.stack.map((x) => chip(`${x.name}${x.version ? ` ${x.version}` : ''}`, x.kind)))) : null,
    model.notes.length ? section('Atenção', h('ul', { class: 'notes' }, model.notes.map((n) => h('li', { text: n })))) : null,
    ctx.screenshot ? section('Captura da tela', h('img', { class: 'shot', src: ctx.screenshot, alt: 'Captura da página' })) : null,
    section(
      'Resumo',
      h('div', { class: 'kpis' }, [
        ['Cores', model.colors.length], ['Estilos de texto', model.typeScale.length], ['Animações', animationsList(model).length + (model.motion.reveals?.length || 0)],
        ['Imagens', model.assets.images.length + (model.assets.figmaImages?.length || 0)], ['SVG / ícones', model.assets.svgs.length + (model.assets.icons?.length || 0)],
        ['Componentes', model.components.buttons.length + model.components.inputs.length + model.components.cards.length + (model.components.figma?.length || 0)],
      ].map(([k, v]) => h('div', { class: 'kpi' }, h('strong', { text: String(v) }), h('span', { text: k })))),
    ),
  ];
}

// ------------------------------------------------------------------ cores
function colors(model) {
  const roles = Object.entries(model.semantic);
  const v = model.variables;
  return [
    roles.length
      ? section('Papéis', h('div', { class: 'roles' }, roles.map(([role, hex]) => copyable(
        h('div', { class: 'role' }, h('div', { class: 'role-color', style: { background: hex } }), h('strong', { text: ROLE_PT[role] || role }), h('code', { text: hex })),
        hex,
      ))))
      : null,
    section(`Paleta (${model.colors.length})`, model.colors.length ? h('div', { class: 'swatches' }, model.colors.map(swatch)) : empty('Nenhuma cor encontrada.')),
    model.gradients.length
      ? section('Gradientes', h('div', { class: 'gradients' }, model.gradients.map((g) => copyable(h('div', { class: 'gradient' }, h('div', { class: 'gradient-strip', style: { background: g.value } }), h('code', { text: g.name })), g.value))))
      : null,
    v.collections?.length
      ? section('Variáveis do Figma', ...v.collections.map((c) => h('details', { class: 'vars' },
        h('summary', { text: `${c.name} · ${c.variables.length} variáveis · modos: ${c.modes.join(', ')}` }),
        h('table', {}, h('tbody', {}, c.variables.slice(0, 300).map((x) => h('tr', {},
          h('td', {}, h('code', { text: x.name })),
          ...c.modes.map((md) => {
            const val = x.values[md];
            const text = val && typeof val === 'object' ? `→ ${val.alias}` : String(val ?? '');
            return h('td', {}, x.type === 'COLOR' && typeof val === 'string' ? h('span', { class: 'dot', style: { background: val } }) : null, h('span', { text }));
          }),
        )))))))
      : v.light.length
        ? section(`Variáveis CSS do site (${v.light.length}${v.dark.length ? ` + ${v.dark.length} no tema escuro` : ''})`, h('details', { class: 'vars' },
          h('summary', { text: 'Ver variáveis' }),
          h('table', {}, h('tbody', {}, v.light.slice(0, 400).map((x) => {
            const dark = v.dark.find((d) => d.name === x.name);
            return h('tr', {},
              h('td', {}, h('code', { text: x.name })),
              h('td', {}, x.color ? h('span', { class: 'dot', style: { background: x.color } }) : null, h('span', { text: x.value })),
              h('td', {}, dark ? h('span', { text: dark.value }) : null));
          })))))
        : null,
  ];
}

// ------------------------------------------------------------------ tipografia
function typography(model, ctx) {
  const fam = (family) => ctx.fontAlias(family);
  return [
    section('Famílias', model.fonts.length ? h('div', { class: 'fonts' }, model.fonts.map((f) => h('div', { class: 'font' },
      h('div', { class: 'font-name', style: { 'font-family': fam(f.family) }, text: f.family }),
      h('div', { class: 'chips' }, f.role ? chip(f.role, 'role') : null, chip(SOURCE_PT[f.source] || f.source), chip(`pesos ${f.weights.join(', ') || '—'}`)),
    ))) : empty('Nenhuma fonte encontrada.')),
    model.fonts.googleUrl ? section(null, copyable(h('p', { class: 'small link-like', text: `Copiar <link> do Google Fonts${model.fonts.googleGuess ? ' (tentativa)' : ''}` }), `<link href="${model.fonts.googleUrl}" rel="stylesheet">`)) : null,
    section('Escala', model.typeScale.length ? h('div', { class: 'scale' }, model.typeScale.map((t) => {
      const css = `font-family: ${t.family}; font-size: ${t.size}px; font-weight: ${t.weight}; line-height: ${t.lineHeight};${t.letterSpacing !== 'normal' ? ` letter-spacing: ${t.letterSpacing};` : ''}${t.transform ? ` text-transform: ${t.transform};` : ''}`;
      return copyable(h('div', { class: 'type-row' },
        h('div', {
          class: 'type-sample',
          style: {
            'font-family': fam(t.family), 'font-size': `${Math.min(t.size, 52)}px`, 'font-weight': String(t.weight), 'line-height': t.lineHeight === 'normal' ? 'normal' : t.lineHeight,
            'letter-spacing': t.letterSpacing, 'text-transform': t.transform || 'none', 'font-style': t.italic ? 'italic' : 'normal',
          },
          text: t.sample || 'Decalque o design',
        }),
        h('div', { class: 'type-meta' }, h('strong', { text: t.name }), h('span', { text: `${t.family} · ${t.size}px · ${t.weight} · ${t.lineHeight}${t.letterSpacing !== 'normal' ? ` · ${t.letterSpacing}` : ''}` })),
      ), css, `CSS de .text-${t.name} copiado`);
    })) : empty('Sem texto suficiente para montar a escala.')),
  ];
}

// ------------------------------------------------------------------ layout
function layout(model) {
  const sp = model.spacing;
  const max = Math.max(...sp.scale.map((s) => s.px), 1);
  return [
    section(`Espaçamento${sp.base ? ` · grade de ${sp.base}px` : ''}`, sp.scale.length ? h('div', { class: 'bars' }, sp.scale.map((s) => copyable(h('div', { class: 'bar-row' },
      h('code', { text: `space-${s.name}` }),
      h('div', { class: 'bar', style: { width: `${Math.max(4, (s.px / max) * 100)}%` } }),
      h('span', { text: `${s.px}px` }), count(s.count),
    ), `${s.px}px`))) : empty('Sem dados de espaçamento.')),
    section('Raios', model.radii.length ? h('div', { class: 'radii' }, model.radii.map((r) => copyable(h('div', { class: 'radius' },
      h('div', { class: 'radius-box', style: { 'border-radius': r.name === 'full' ? '9999px' : r.value } }),
      h('strong', { text: r.name }), h('code', { text: r.value }),
    ), r.value))) : empty('Cantos retos — nenhum raio encontrado.')),
    model.breakpoints.length ? section('Breakpoints', h('div', { class: 'bars' }, model.breakpoints.map((b) => h('div', { class: 'bar-row' },
      h('code', { text: b.name }), h('div', { class: 'bar alt', style: { width: `${(b.px / Math.max(...model.breakpoints.map((x) => x.px))) * 100}%` } }), h('span', { text: `${b.px}px` }), count(b.count),
    )))) : null,
    model.containers.length ? section('Largura de conteúdo', h('div', { class: 'chips' }, model.containers.map((c) => chip(`${c.px}px · ${c.count}×`)))) : null,
  ];
}

// ------------------------------------------------------------------ efeitos
function effects(model) {
  return [
    section('Sombras', model.shadows.length ? h('div', { class: 'shadows' }, model.shadows.map((s) => copyable(h('div', { class: 'shadow' },
      h('div', { class: 'shadow-box', style: { 'box-shadow': s.value } }), h('strong', { text: s.name }), h('code', { text: s.value }),
    ), s.value))) : empty('Sem sombras.')),
    model.textShadows.length ? section('Sombras de texto', h('div', { class: 'chips' }, model.textShadows.map((s) => copyable(chip(s.value), s.value)))) : null,
    model.effects.length ? section('Desfoques e filtros', h('div', { class: 'list' }, model.effects.map((e) => copyable(h('div', { class: 'row' },
      h('span', { class: 'glass', style: { [e.kind === 'backdrop' ? 'backdrop-filter' : 'filter']: e.value } }),
      h('code', { text: `${e.kind === 'backdrop' ? 'backdrop-filter' : 'filter'}: ${e.value}` }), e.count ? count(e.count) : null,
    ), e.value)))) : null,
    model.borders.length ? section('Bordas', h('div', { class: 'chips' }, model.borders.map((b) => chip(`${b.value} · ${b.count}×`)))) : null,
    model.gradients.length ? section('Gradientes', h('div', { class: 'gradients' }, model.gradients.map((g) => copyable(h('div', { class: 'gradient' }, h('div', { class: 'gradient-strip', style: { background: g.value } }), h('code', { text: g.name })), g.value)))) : null,
  ];
}

// ------------------------------------------------------------------ movimento
function curve(value) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '-4 -14 48 68');
  svg.setAttribute('class', 'curve');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const bz = parseCubicBezier(value);
  let d = '';
  if (bz) d = `M0 40 C ${bz[0] * 40} ${40 - bz[1] * 40} ${bz[2] * 40} ${40 - bz[3] * 40} 40 0`;
  else {
    const m = /^linear\((.*)\)$/.exec(value || '');
    if (m) {
      const pts = m[1].split(',').map((p) => parseFloat(p));
      d = pts.map((p, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * 40).toFixed(2)} ${(40 - p * 40).toFixed(2)}`).join(' ');
    } else d = 'M0 40 L40 0';
  }
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

let motionSheet = null;
function playKeyframes(box, a, i) {
  if (!motionSheet) {
    motionSheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, motionSheet];
  }
  const name = `dq-preview-${i}`;
  const css = a.css.replace(/@keyframes\s+("[^"]*"|'[^']*'|[^\s{]+)/, `@keyframes ${name}`);
  if (!/^@keyframes\s/.test(css.trim())) return;
  try {
    motionSheet.insertRule(css, motionSheet.cssRules.length);
  } catch {
    return;
  }
  box.style.animation = 'none';
  void box.offsetWidth;
  const shorthand = a.shorthand.replace(a.name, name).replace(/\binfinite\b/, '2');
  box.style.animation = shorthand;
}

function playReveal(box, r) {
  const d = r.durationMs > 50 && r.durationMs < 4000 ? r.durationMs : 700;
  const e = r.easing && r.easing !== 'ease' ? r.easing : 'cubic-bezier(0.16, 1, 0.3, 1)';
  box.style.transition = 'none';
  box.style.opacity = String(r.from.opacity);
  box.style.translate = `${(r.from.tx - r.to.tx) / 2}px ${(r.from.ty - r.to.ty) / 2}px`;
  box.style.scale = String(r.from.sx / (r.to.sx || 1));
  box.style.filter = r.from.blur ? `blur(${r.from.blur}px)` : 'none';
  void box.offsetWidth;
  box.style.transition = `all ${d}ms ${e}`;
  box.style.opacity = String(r.to.opacity);
  box.style.translate = '0 0';
  box.style.scale = '1';
  box.style.filter = 'none';
}

function motion(model) {
  const mo = model.motion;
  const anims = animationsList(model);
  const libs = model.stack.filter((s) => s.kind === 'motion');
  return [
    mo.durations.length || mo.easings.length
      ? section('Durações e curvas',
        h('div', { class: 'chips' }, mo.durations.map((d) => copyable(chip(`${d.ms}ms · ${d.count}×`), `${d.ms}ms`))),
        h('div', { class: 'easings' }, mo.easings.map((e) => copyable(h('div', { class: 'easing' }, curve(e.value), h('strong', { text: e.name }), h('code', { text: e.value.length > 46 ? `${e.value.slice(0, 46)}…` : e.value })), e.value))))
      : null,
    mo.springs?.length
      ? section('Molas (protótipo do Figma)', h('div', { class: 'list' }, mo.springs.map((s) => copyable(h('div', { class: 'row' },
        h('strong', { text: s.name }), h('code', { text: `stiffness ${s.stiffness} · damping ${s.damping} · mass ${s.mass}` }),
      ), `{ type: "spring", stiffness: ${s.stiffness}, damping: ${s.damping}, mass: ${s.mass} }`, 'Config de mola (Framer Motion) copiada'))))
      : null,
    section(`Animações (${anims.length})`, anims.length ? h('div', { class: 'anims' }, anims.map((a, i) => {
      const box = h('div', { class: 'anim-box' });
      return h('div', { class: 'anim' },
        h('div', { class: 'anim-stage' }, box),
        h('div', { class: 'anim-meta' },
          h('strong', { text: a.name }),
          h('code', { text: a.shorthand }),
          h('span', { class: 'muted small', text: a.source === 'js' ? 'Web Animations API (JS)' : a.source === 'figma' ? 'Figma Motion' : 'CSS @keyframes' })),
        h('div', { class: 'anim-actions' },
          h('button', { class: 'icon-btn', title: 'Tocar', onclick: () => playKeyframes(box, a, i) }, svgIcon('play')),
          h('button', { class: 'icon-btn', title: 'Copiar CSS', onclick: () => copyText(`${a.css}\n\n.animate-${a.name} { animation: ${a.shorthand}; }`, 'CSS da animação copiado') }, svgIcon('copy'))));
    })) : empty('Nenhuma animação rodando nem @keyframes em uso. Ative “Rolar a página” para pegar as que disparam com a rolagem.')),
    mo.reveals?.length
      ? section('Reveals ao rolar', h('div', { class: 'anims' }, mo.reveals.map((r) => {
        const box = h('div', { class: 'anim-box' });
        return h('div', { class: 'anim' },
          h('div', { class: 'anim-stage' }, box),
          h('div', { class: 'anim-meta' },
            h('strong', { text: `reveal-${r.pattern}` }),
            h('code', { text: `${r.durationMs || '?'}ms · ${r.easing || 'ease'}` }),
            h('span', { class: 'muted small', text: `${r.count} elemento(s) · ${r.trigger}` })),
          h('div', { class: 'anim-actions' }, h('button', { class: 'icon-btn', title: 'Tocar', onclick: () => playReveal(box, r) }, svgIcon('play'))));
      })))
      : null,
    mo.transitions.length
      ? section('Transições mais usadas', h('div', { class: 'list' }, mo.transitions.slice(0, 10).map((t) => copyable(h('div', { class: 'row' },
        h('code', { text: `${t.property} ${t.durationMs}ms ${t.easing.length > 40 ? `${t.easing.slice(0, 40)}…` : t.easing}` }), count(t.count),
      ), `transition: ${t.property} ${t.durationMs}ms ${t.easing};`))))
      : null,
    mo.presets?.length ? section('Estilos de animação do Figma', h('div', { class: 'chips' }, mo.presets.slice(0, 30).map((p) => chip(p.name)))) : null,
    libs.length ? section('Bibliotecas de animação', h('div', { class: 'chips' }, libs.map((l) => chip(`${l.name}${l.version ? ` ${l.version}` : ''}`, 'motion'))), h('p', { class: 'muted small', text: 'Animações feitas por essas libs só aparecem aqui se estavam rodando durante a captura ou na varredura com rolagem.' })) : null,
  ];
}

// ------------------------------------------------------------------ componentes
const STYLE_KEYS = ['background', 'color', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius', 'padding', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'box-shadow', 'height', 'backdrop-filter', 'text-decoration', 'text-underline-offset'];

function applyCss(el, css) {
  for (const k of STYLE_KEYS) {
    const v = css[k];
    if (!v || (v === 'none' && k !== 'border' && k !== 'text-decoration')) continue;
    el.style.setProperty(k === 'text-decoration' ? 'text-decoration-line' : k, v);
  }
}

function cssText(selector, css, states) {
  const body = (o) => Object.entries(o).filter(([, v]) => v && v !== 'none' && v !== 'normal').map(([k, v]) => `  ${k}: ${v};`).join('\n');
  return [`${selector} {\n${body(css)}\n}`, ...Object.entries(states || {}).map(([s, d]) => `${selector}:${s} {\n${body(d)}\n}`)].join('\n\n');
}

function componentPreview(kind, c, i, ctx) {
  const tag = kind === 'inputs' ? 'input' : kind === 'links' ? 'a' : kind === 'buttons' ? 'button' : 'div';
  const el = h(tag, { class: `preview-${kind}` });
  if (tag === 'input') el.placeholder = c.sample || 'Digite aqui…';
  else el.textContent = kind === 'cards' ? 'Card' : c.sample || 'Exemplo';
  applyCss(el, c.css);
  if (c.css['font-family']) el.style.fontFamily = ctx.fontAlias(c.css['font-family']);
  const hover = c.states?.hover;
  if (hover) {
    const before = {};
    el.addEventListener('mouseenter', () => {
      for (const [k, v] of Object.entries(hover)) {
        before[k] = el.style.getPropertyValue(k);
        el.style.setProperty(k, v);
      }
    });
    el.addEventListener('mouseleave', () => {
      for (const k of Object.keys(hover)) el.style.setProperty(k, before[k] || '');
    });
  }
  const name = `${kind.slice(0, -1)}-${i + 1}`;
  return h('div', { class: 'component' },
    h('div', { class: 'component-stage', style: { background: ctx.background || 'transparent' } }, el),
    h('div', { class: 'component-meta' },
      h('span', { class: 'muted small', text: `${c.count}× · ${c.example || ''}${hover ? ' · passe o mouse' : ''}` }),
      h('button', { class: 'icon-btn', title: 'Copiar CSS', onclick: () => copyText(cssText(`.${name}`, c.css, c.states), 'CSS do componente copiado') }, svgIcon('copy'))));
}

function components(model, ctx) {
  const c = model.components;
  const groups = [['buttons', 'Botões'], ['inputs', 'Campos'], ['cards', 'Cards'], ['links', 'Links']].filter(([k]) => c[k]?.length);
  const out = groups.map(([k, title]) => section(title, h('div', { class: 'components' }, c[k].map((x, i) => componentPreview(k, x, i, { ...ctx, background: model.semantic.background })))));
  if (c.figma?.length) {
    out.push(section(`Componentes do Figma (${c.figma.length})`, h('div', { class: 'list' }, c.figma.slice(0, 200).map((x) => h('div', { class: 'row' },
      h('strong', { text: x.name }), h('span', { class: 'muted small', text: `${x.variants ? `${x.variants} variantes · ` : ''}${x.width}×${x.height} · ${x.page}` }),
    )))));
  }
  if (!out.length) out.push(empty('Nenhum componente recorrente identificado. Use “Capturar componente” para copiar um elemento específico.'));
  out.push(section(null, h('p', { class: 'muted small', text: 'Quer um elemento exato? Use a pinça: “Capturar componente” gera HTML/CSS e React + Tailwind do que você clicar.' })));
  return out;
}

// ------------------------------------------------------------------ assets
function assets(model) {
  const a = model.assets;
  const imgs = a.images.filter((i) => i.kind !== 'favicon');
  return [
    section('Inventário', h('div', { class: 'kpis' }, [
      ['Imagens', a.images.length], ['SVGs', a.svgs.length], ['Fontes', a.fonts.length], ['Lottie', a.lottie.length], ['Vídeos', a.videos.length],
      ...(model.source.kind === 'figma' ? [['Frames', a.frames.length], ['Ícones', a.icons.length], ['Imagens (Figma)', a.figmaImages.length]] : []),
    ].filter(([, v]) => v).map(([k, v]) => h('div', { class: 'kpi' }, h('strong', { text: String(v) }), h('span', { text: k }))))),
    imgs.length ? section(`Imagens (${imgs.length})`, h('div', { class: 'thumbs' }, imgs.slice(0, 90).map((i) => h('a', { class: 'thumb', href: i.url, target: '_blank', rel: 'noreferrer', title: `${i.url}\n${i.w ? `${i.w}×${i.h} · ` : ''}${i.kind}` },
      h('img', { src: i.url, loading: 'lazy', referrerpolicy: 'no-referrer', alt: i.alt || '' })))), imgs.length > 90 ? h('p', { class: 'muted small', text: `… e mais ${imgs.length - 90} no kit.` }) : null) : null,
    a.svgs.length ? section(`SVGs e ícones (${a.svgs.length})`, h('div', { class: 'icons' }, a.svgs.slice(0, 160).map((s) => copyable(h('div', { class: 'icon-tile', title: s.name },
      h('img', { src: svgDataUrl(s.markup), alt: s.name, loading: 'lazy' })), s.markup, `SVG “${s.name}” copiado`)))) : null,
    a.fonts.length ? section('Arquivos de fonte', h('div', { class: 'list' }, a.fonts.map((f) => h('div', { class: 'row' }, h('strong', { text: `${f.family} ${f.weight} ${f.style}` }), h('code', { text: (f.url.split('/').pop() || '').slice(0, 50) }))))) : null,
    a.lottie.length ? section('Lottie', h('div', { class: 'list' }, a.lottie.map((u) => h('a', { class: 'row', href: u, target: '_blank', rel: 'noreferrer', text: u })))) : null,
    a.videos.length ? section('Vídeos', h('div', { class: 'list' }, a.videos.map((v) => h('a', { class: 'row', href: v.url, target: '_blank', rel: 'noreferrer', text: v.url })))) : null,
    a.frames?.length ? section(`Frames do Figma (${a.frames.length})`, h('div', { class: 'list' }, a.frames.slice(0, 120).map((f) => h('div', { class: 'row' }, h('strong', { text: f.name }), h('span', { class: 'muted small', text: `${f.page} · ${f.width}×${f.height}` }))))) : null,
  ];
}

// ------------------------------------------------------------------ exportar
const FILE_INFO = {
  'DESIGN.md': 'Guia completo (para você e para agentes de IA)',
  'tokens.css': 'Variáveis CSS + classes de texto',
  'tailwind.theme.css': 'Tema para Tailwind v4 (@theme)',
  'tailwind.config.js': 'Config para Tailwind v3',
  'tokens.json': 'W3C Design Tokens (DTCG 2025.10)',
  'animations.css': '@keyframes, classes animate-* e reveals',
  'site-variables.css': 'Variáveis originais (nomes do autor)',
};

function exporter(model, ctx) {
  const isFig = model.source.kind === 'figma';
  const o = ctx.opts;
  const opt = (key, label, extra) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!o[key], onchange: (e) => ctx.setOpt(key, e.target.checked) }), h('span', { text: label }), extra || null);
  const select = (key, label, options) => h('label', { class: 'select' }, h('span', { text: label }), h('select', { onchange: (e) => ctx.setOpt(key, isNaN(+e.target.value) ? e.target.value : +e.target.value) }, options.map(([v, t]) => h('option', { value: String(v), selected: String(o[key]) === String(v) }, t))));
  return [
    section('Kit completo',
      h('p', { class: 'muted small', text: 'Um .zip com DESIGN.md, tokens (CSS, Tailwind v4/v3, DTCG), animações e os assets baixados.' }),
      isFig
        ? h('div', { class: 'options' },
          select('frames', 'Frames em PNG', [['current', 'Só da página atual'], ['all', 'Todas as páginas'], ['none', 'Não exportar']]),
          select('scale', 'Escala', [[0.5, '0,5×'], [1, '1×'], [2, '2×']]),
          opt('icons', `Ícones em SVG (${model.assets.icons.length})`),
          opt('images', `Imagens originais (${model.assets.figmaImages.length})`),
          (model.motion.timelines || []).length ? opt('videos', `Animações em vídeo WebM (${model.motion.timelines.length})`) : null)
        : h('div', { class: 'options' }, model.assets.videos.length ? opt('includeVideos', `Incluir vídeos (${model.assets.videos.length})`) : null),
      h('button', { class: 'primary wide', onclick: ctx.downloadKit, disabled: !!ctx.busy }, svgIcon('download'), 'Baixar kit (.zip)')),
    section('Arquivos', h('div', { class: 'files' }, Object.entries(ctx.files()).filter(([, v]) => v).map(([name, text]) => h('div', { class: 'file' },
      h('div', {}, h('strong', { text: name }), h('span', { class: 'muted small', text: FILE_INFO[name] || '' })),
      h('div', { class: 'file-actions' },
        h('button', { class: 'icon-btn', title: `Copiar ${name}`, onclick: () => copyText(text, `${name} copiado`) }, svgIcon('copy')),
        h('button', { class: 'icon-btn', title: `Baixar ${name}`, onclick: () => ctx.downloadText(name, text) }, svgIcon('download'))))))),
  ];
}

export function renderSection(id, model, ctx) {
  const map = { overview, colors, type: typography, layout, effects, motion, components, assets, export: exporter };
  return (map[id] || overview)(model, ctx).filter(Boolean);
}

// ------------------------------------------------------------------ componente capturado
export function renderComponentView(cap, ctx) {
  const tabs = [['html', 'HTML'], ['css', 'CSS'], ['jsx', 'React + Tailwind']];
  const code = ctx.code[ctx.tab];
  const frame = h('iframe', { class: 'preview', sandbox: '', title: 'Prévia do componente' });
  frame.srcdoc = ctx.previewDoc;
  const isFig = cap.source.kind === 'figma';
  return [
    h('div', { class: 'cap-head' },
      h('button', { class: 'ghost small-btn', onclick: ctx.back }, svgIcon('back'), 'Voltar'),
      h('div', { class: 'cap-title' }, h('strong', { text: cap.root.description || 'Componente' }), h('span', { class: 'muted small', text: `${cap.root.width}×${cap.root.height}px · ${cap.stats.nodes} nós${cap.stats.truncated ? ' (cortado)' : ''}${cap.states?.length ? ` · ${cap.states.length} estados` : ''}` }))),
    h('div', { class: 'preview-wrap' }, frame),
    h('div', { class: 'cap-actions' },
      isFig ? null : h('button', { class: 'ghost small-btn', onclick: ctx.parent, disabled: !!ctx.busy }, svgIcon('up'), 'Pai'),
      h('button', { class: 'ghost small-btn', onclick: ctx.again, disabled: !!ctx.busy }, svgIcon('target'), isFig ? 'Capturar seleção de novo' : 'Capturar outro'),
      h('button', { class: 'ghost small-btn', onclick: ctx.downloadZip }, svgIcon('download'), '.zip')),
    h('div', { class: 'tabs small-tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { role: 'tab', 'aria-selected': String(ctx.tab === id), class: ctx.tab === id ? 'on' : '', onclick: () => ctx.setTab(id) }, label))),
    h('div', { class: 'code-wrap' },
      h('pre', { class: 'code' }, h('code', { text: code })),
      h('div', { class: 'code-actions' },
        h('button', { class: 'primary', onclick: () => copyText(code, 'Código copiado') }, svgIcon('copy'), 'Copiar'),
        h('button', { class: 'ghost', onclick: () => ctx.downloadCode(ctx.tab) }, svgIcon('download'), 'Baixar'))),
  ];
}
