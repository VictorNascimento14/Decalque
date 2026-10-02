// Figma → modelo de design system. Duas entradas com o mesmo formato:
//  • plugin: content/figma-main.js exporta as páginas como JSON_REST_V1 e roda o scan na própria aba;
//  • REST:   este módulo baixa o arquivo com o token do usuário e roda o mesmo scan aqui.
// Requer lib/figma-scan.js carregado antes (globalThis.DecalqueFigmaScan).

import { buildPalette, buildTypeScale, emptyModel, motionScales, radiusScale, shadowScale, spacingScale } from './model.js';
import { cssString, familyStack, guessFamilyKind, isSystemFamily, round, slugify, springToLinear, uniqueNamer } from './util.js';

const scanLib = () => globalThis.DecalqueFigmaScan;

export function parseFigmaUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)figma\.com$/.test(u.hostname)) return null;
  const m = /^\/(design|file|proto|board|slides|make|site)\/([A-Za-z0-9]+)(?:\/[^/]*)?(?:\/branch\/([A-Za-z0-9]+))?/.exec(u.pathname);
  const branch = /\/branch\/([A-Za-z0-9]+)/.exec(u.pathname);
  if (!m) return { kind: 'other', key: null };
  return { kind: m[1], key: (branch && branch[1]) || m[2], fileKey: m[2], nodeId: u.searchParams.get('node-id') };
}

// ---------------------------------------------------------------- API REST
const API = 'https://api.figma.com/v1';

async function api(path, token) {
  const res = await fetch(API + path, { headers: { 'X-Figma-Token': token } });
  if (res.status === 403) throw new Error('O token não tem acesso a este arquivo (403). Gere um token com o escopo "file_content:read".');
  if (res.status === 404) throw new Error('A API do Figma não encontrou o arquivo (404).');
  if (res.status === 429) {
    const retry = res.headers.get('retry-after');
    throw new Error(`Limite da API do Figma atingido (429)${retry ? `; tente de novo em ${retry}s` : ''}. Assentos View/Collab têm poucas chamadas por mês.`);
  }
  if (!res.ok) throw new Error(`A API do Figma respondeu ${res.status}.`);
  return res.json();
}

export async function fetchFileViaRest(key, token) {
  const file = await api(`/files/${key}`, token);
  return {
    via: 'rest',
    file: { name: file.name, key, lastModified: file.lastModified, thumbnailUrl: file.thumbnailUrl, pageCount: (file.document.children || []).length },
    scan: scanLib().scanFile(file),
    localStyles: [],
    variables: null,
    motion: null,
    failures: [],
  };
}

export async function restRenderUrls(key, token, ids, { format = 'png', scale = 1 } = {}) {
  const out = {};
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const q = `ids=${encodeURIComponent(chunk.join(','))}&format=${format}${format === 'png' ? `&scale=${scale}` : ''}`;
    const r = await api(`/images/${key}?${q}`, token);
    Object.assign(out, r.images || {});
  }
  return out;
}

export async function restImageFills(key, token) {
  const r = await api(`/files/${key}/images`, token);
  return (r.meta && r.meta.images) || {};
}

// ---------------------------------------------------------------- nomes
// "Green/Green 60" → "green-60"; "Heading/H1 Bold" → "heading-h1-bold"
export function tokenName(styleName) {
  const parts = String(styleName || '').split('/').map((p) => slugify(p)).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const prev = out[out.length - 1];
    if (prev && p.startsWith(`${prev}-`)) out[out.length - 1] = p;
    else if (p !== prev) out.push(p);
  }
  return out.join('-') || 'token';
}

const CASE = { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize' };

function mergeStyles(local, fromTree) {
  const byName = new Map();
  for (const s of fromTree || []) byName.set(`${s.type}|${s.name}`, s);
  for (const s of local || []) byName.set(`${s.type}|${s.name}`, s); // os locais (valores completos) vencem
  return [...byName.values()];
}

// ---------------------------------------------------------------- Figma Motion → @keyframes
const MOTION_PROPS = {
  OPACITY: 'opacity', TRANSLATION_X: 'tx', TRANSLATION_Y: 'ty', TRANSLATION_XY: 'txy', ROTATION: 'rot',
  SCALE_X: 'sx', SCALE_Y: 'sy', SCALE_XY: 'sxy', WIDTH: 'width', HEIGHT: 'height', CORNER_RADIUS: 'radius',
};

function kfValue(v) {
  if (!v) return null;
  if (v.type === 'FLOAT') return v.value;
  if (v.type === 'VECTOR') return { x: v.value.x, y: v.value.y };
  return null;
}

function applyOp(op, base, v) {
  if (v == null) return base;
  if (op === 'OFFSET' && base != null) return typeof v === 'object' ? { x: (base.x || 0) + v.x, y: (base.y || 0) + v.y } : base + v;
  if (op === 'SCALE' && base != null) return typeof v === 'object' ? { x: (base.x ?? 1) * v.x, y: (base.y ?? 1) * v.y } : base * v;
  return v;
}

function lerp(a, b, k) {
  if (typeof a === 'object' && typeof b === 'object') return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  return a + (b - a) * k;
}

function sampleTrack(kfs, t) {
  if (t <= kfs[0].t) return kfs[0].v;
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 1; i < kfs.length; i++) {
    if (t <= kfs[i].t) {
      const a = kfs[i - 1];
      const b = kfs[i];
      return lerp(a.v, b.v, (t - a.t) / (b.t - a.t || 1));
    }
  }
  return last.v;
}

export function motionEasingCss(e) {
  if (!e || !e.type) return null;
  const info = scanLib().easingOf(e);
  if (info.spring) return springToLinear(info.spring).css;
  if (info.bounce != null) return springToLinear({ mass: 1, stiffness: 170, damping: Math.max(4, 26 * (1 - info.bounce)) }).css;
  return info.css || null;
}

function framesToCss(vals) {
  const out = [];
  if (vals.opacity != null) out.push(`opacity: ${round(vals.opacity, 3)}`);
  const tx = vals.txy ? vals.txy.x : vals.tx;
  const ty = vals.txy ? vals.txy.y : vals.ty;
  if (tx != null || ty != null) out.push(`translate: ${round(tx || 0, 2)}px ${round(ty || 0, 2)}px`);
  if (vals.rot != null) out.push(`rotate: ${round(-vals.rot, 2)}deg`); // Figma gira no sentido anti-horário
  const sx = vals.sxy ? vals.sxy.x : vals.sx;
  const sy = vals.sxy ? vals.sxy.y : vals.sy;
  if (sx != null || sy != null) out.push(`scale: ${round(sx ?? 1, 3)} ${round(sy ?? sx ?? 1, 3)}`);
  if (vals.width != null) out.push(`width: ${round(vals.width, 1)}px`);
  if (vals.height != null) out.push(`height: ${round(vals.height, 1)}px`);
  if (vals.radius != null) out.push(`border-radius: ${round(vals.radius, 1)}px`);
  return out;
}

export function motionToKeyframes(timeline) {
  const out = [];
  const name = uniqueNamer();
  for (const node of timeline.nodes || []) {
    const anim = node.animations;
    if (!anim) continue;
    const tracks = [];
    let duration = 0;
    for (const [field, binding] of Object.entries(anim)) {
      const prop = MOTION_PROPS[field];
      if (!prop || !binding || !Array.isArray(binding.tracks)) continue;
      duration = Math.max(duration, binding.timelineDuration || 0);
      const base = kfValue(binding.baseValue);
      for (const track of binding.tracks) {
        const kfs = (track.keyframes || [])
          .map((k) => ({ t: k.timelinePosition, v: applyOp(track.keyframeOperation, base, kfValue(k.value)), easing: k.easing }))
          .filter((k) => k.v != null && Number.isFinite(k.t))
          .sort((a, b) => a.t - b.t);
        if (kfs.length) tracks.push({ prop, kfs });
      }
    }
    duration = duration || timeline.duration || 0;
    if (!tracks.length || !(duration > 0)) continue;
    const times = [...new Set([0, duration, ...tracks.flatMap((t) => t.kfs.map((k) => round(k.t, 4)))])].filter((t) => t >= 0 && t <= duration).sort((a, b) => a - b);
    const blocks = times.map((t, i) => {
      const vals = {};
      for (const tr of tracks) vals[tr.prop] = sampleTrack(tr.kfs, t);
      // No CSS a curva do bloco vale para o trecho que começa nele; no Figma ela fica no keyframe de chegada.
      const next = times[i + 1];
      let easing = null;
      if (next != null) {
        for (const tr of tracks) {
          const hit = tr.kfs.find((k) => Math.abs(k.t - next) < 1e-4 && k.easing);
          if (hit) {
            easing = motionEasingCss(hit.easing);
            break;
          }
        }
      }
      const decls = framesToCss(vals);
      if (easing && easing !== 'linear') decls.push(`animation-timing-function: ${easing}`);
      return `  ${round((t / duration) * 100, 2)}% { ${decls.join('; ')}; }`;
    });
    // identificador CSS não pode começar com dígito ("01 Hero" → figma-01-hero…)
    const base = slugify(`${timeline.frame}-${node.name}`).slice(0, 40) || 'motion';
    const n = name(/^[a-z]/.test(base) ? base : `figma-${base}`);
    out.push({
      name: n,
      css: `@keyframes ${n} {\n${blocks.join('\n')}\n}`,
      durationMs: Math.round(duration * 1000),
      node: node.name,
      frame: timeline.frame,
      used: true,
      animation: `${n} ${Math.round(duration * 1000)}ms linear both`,
    });
  }
  return out;
}

// ---------------------------------------------------------------- modelo
function frameRole(name) {
  const n = String(name).toLowerCase();
  if (/mobile|celular|phone|iphone|android/.test(n)) return 'mobile';
  if (/tablet|ipad/.test(n)) return 'tablet';
  if (/laptop|notebook/.test(n)) return 'laptop';
  if (/desktop|web|wide/.test(n)) return 'desktop';
  return null;
}

export function buildFigmaModel(snap, opts = {}) {
  const S = snap.scan;
  const m = emptyModel({
    kind: 'figma',
    via: snap.via,
    url: opts.url || null,
    title: snap.file.name,
    capturedAt: new Date().toISOString(),
    pages: S.pages.map((p) => p.name),
  });
  const styles = mergeStyles(snap.localStyles, S.styles);

  // cores: estilos nomeados primeiro, depois as cores usadas sem estilo
  const { colors: used, semantic } = buildPalette(
    S.colors.map((c) => ({ ...c, chars: c.text, bg: c.fill, border: c.stroke })),
    null,
  );
  m.semantic = semantic;
  const name = uniqueNamer();
  const styled = [];
  const gradients = [];
  for (const s of styles.filter((x) => x.type === 'FILL')) {
    const p = s.value.paints[0];
    if (p.kind === 'solid') {
      styled.push({ name: name(tokenName(s.name)), value: p.css, hex: p.hex, alpha: p.a, count: 0, role: null, roles: [], source: 'style', styleName: s.name, description: s.description });
    } else if (p.kind === 'gradient') {
      gradients.push({ name: `gradient-${tokenName(s.name)}`, value: p.css, count: 0, styleName: s.name });
    }
  }
  const styledHex = new Set(styled.map((c) => c.value.toLowerCase()));
  for (const [role, hex] of Object.entries(semantic)) {
    const hit = styled.find((c) => c.value.toLowerCase() === hex.toLowerCase());
    if (hit && !hit.role) hit.role = role;
  }
  const extra = used.filter((c) => !styledHex.has(c.value.toLowerCase())).map((c) => ({ ...c, name: name(c.name), source: 'used' }));
  m.colors = [...styled, ...extra].slice(0, 60);
  m.gradients = [...gradients, ...S.gradients.slice(0, 8).map((g, i) => ({ name: `gradient-${i + 1}`, value: g.css, count: g.count }))].slice(0, 16);

  // variáveis (só pelo plugin; a API REST exige Enterprise)
  const v = snap.variables;
  if (v && v.collections && v.collections.length) {
    const fmt = (val, type) => {
      if (val == null) return null;
      if (typeof val === 'object' && val.alias) return { alias: val.alias, collection: val.collection || '', external: !!val.external };
      if (typeof val === 'object' && val.color) return val.color.css;
      if (type === 'FLOAT') return typeof val === 'number' ? round(val, 3) : val;
      return val;
    };
    m.variables.collections = v.collections.map((c) => ({
      name: c.name,
      modes: c.modes.map((md) => md.name),
      defaultMode: (c.modes.find((md) => md.id === c.defaultModeId) || c.modes[0] || {}).name,
      variables: v.variables
        .filter((x) => x.collectionId === c.id)
        .map((x) => ({
          name: x.name,
          token: tokenName(`${c.name}/${x.name}`),
          type: x.type,
          description: x.description,
          scopes: x.scopes,
          values: Object.fromEntries(c.modes.map((md) => [md.name, fmt(x.values[md.id], x.type)])),
        })),
    }));
    const flat = (pickMode) =>
      m.variables.collections.flatMap((c) => {
        const mode = pickMode(c);
        if (!mode) return [];
        return c.variables.map((x) => {
          const val = x.values[mode];
          let ref;
          if (val && typeof val === 'object' && val.alias) {
            // mesmo nome que o token de destino recebe: --coleção-variável
            ref = val.external ? `var(--${tokenName(val.alias)}) /* variável de biblioteca externa */` : `var(--${tokenName(`${val.collection}/${val.alias}`)})`;
          } else if (x.type === 'STRING') ref = cssString(val ?? '');
          else ref = val;
          return { name: `--${x.token}`, value: String(ref ?? ''), type: x.type === 'COLOR' ? 'color' : x.type === 'FLOAT' ? 'number' : x.type.toLowerCase() };
        });
      });
    m.variables.light = flat((c) => c.defaultMode);
    m.variables.dark = flat((c) => c.modes.find((md) => /dark|escuro/i.test(md) && md !== c.defaultMode));
  }

  // tipografia: estilos de texto nomeados + os mais usados sem estilo
  const textStyles = styles.filter((s) => s.type === 'TEXT').map((s, i) => ({
    ...s.value.text,
    name: tokenName(s.name),
    transform: CASE[s.value.text.textCase] || null,
    style: s.value.text.italic ? 'italic' : 'normal',
    chars: 1e6 - i,
    count: 0,
    tags: {},
    sample: s.name,
  }));
  const sameText = (a, b) => a.family === b.family && a.size === b.size && a.weight === b.weight;
  const usedText = S.text
    .filter((t) => !textStyles.some((s) => sameText(s, t)))
    .slice(0, 10)
    .map((t) => ({ ...t, transform: CASE[t.textCase] || null, style: t.italic ? 'italic' : 'normal', tags: {} }));
  const fontsUsed = [...S.fonts];
  for (const s of textStyles) if (!fontsUsed.some((f) => f.family === s.family)) fontsUsed.push({ family: s.family, count: 0, weights: { [s.weight]: 1 }, italic: s.italic });
  const bySize = [...textStyles, ...usedText].sort((a, b) => b.size - a.size);
  const headingFamily = bySize[0] && bySize[0].family;
  const bodyFamily = fontsUsed[0] && fontsUsed[0].family;
  const roles = new Map();
  if (bodyFamily) roles.set(bodyFamily, 'sans');
  if (headingFamily && headingFamily !== bodyFamily) roles.set(headingFamily, 'heading');
  m.fonts = fontsUsed.slice(0, 6).map((f) => {
    const kind = guessFamilyKind(f.family);
    return {
      family: f.family,
      role: roles.get(f.family) || (kind === 'mono' ? 'mono' : null),
      kind,
      stack: familyStack(f.family, kind),
      weights: Object.keys(f.weights).map(Number).sort((a, b) => a - b),
      italic: !!f.italic,
      count: Math.round(f.count),
      source: isSystemFamily(f.family) ? 'system' : 'figma',
      files: [],
    };
  });
  const guess = m.fonts.filter((f) => f.source === 'figma');
  m.fonts.googleUrl = guess.length
    ? `https://fonts.googleapis.com/css2?${guess.map((f) => `family=${f.family.replace(/ /g, '+')}:wght@${[...new Set(f.weights)].join(';')}`).join('&')}&display=swap`
    : null;
  m.fonts.googleGuess = true;
  m.typeScale = buildTypeScale([...textStyles, ...usedText], roles);

  m.spacing = spacingScale(S.spacing.map((e) => ({ px: e.px, count: e.count })));
  m.spacing.gaps = S.spacing.filter((e) => e.gap > 0).slice(0, 8).map((e) => ({ px: e.px, count: e.gap }));
  m.radii = radiusScale(S.radii.map((r) => ({ px: r.px, value: `${r.px}px`, count: r.count })));

  const effectStyles = styles.filter((s) => s.type === 'EFFECT');
  const shadowNamer = uniqueNamer();
  const namedShadows = effectStyles.filter((s) => s.value.shadow).map((s) => ({ name: shadowNamer(tokenName(s.name)), value: s.value.shadow, count: 0, styleName: s.name }));
  m.shadows = namedShadows.length ? namedShadows : shadowScale(S.shadows.map((s) => ({ css: s.css, count: s.count })));
  m.effects = [
    ...effectStyles.filter((s) => s.value.blur).map((s) => ({ kind: s.value.blur.kind, value: s.value.blur.css, name: tokenName(s.name), count: 0 })),
    ...S.blurs.slice(0, 6).map((b) => ({ kind: b.kind, value: b.css, count: b.count })),
  ];
  m.borders = S.strokes.slice(0, 5).map((s) => ({ value: `${s.px}px solid`, count: s.count }));

  // larguras de frame → breakpoints de referência
  const widths = new Map();
  for (const f of S.frames) {
    if (f.width < 300 || f.type === 'COMPONENT_SET') continue;
    const w = Math.round(f.width);
    const e = widths.get(w) || { px: w, count: 0, role: null };
    e.count++;
    e.role = e.role || frameRole(f.name);
    widths.set(w, e);
  }
  const bpName = uniqueNamer();
  m.breakpoints = [...widths.values()]
    .filter((w) => w.count >= 2 || w.role)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .sort((a, b) => a.px - b.px)
    .map((w) => ({ name: bpName(w.role || `w${w.px}`), px: w.px, count: w.count, fromFrames: true }));

  // movimento: transições do protótipo + Figma Motion
  const transitions = S.transitions.map((t) => {
    const spring = t.easing.spring ? springToLinear(t.easing.spring) : null;
    return { property: t.type, durationMs: spring && !t.durationMs ? spring.durationMs : t.durationMs, easing: spring ? spring.css : t.easing.css || 'ease', easingName: t.easing.name, triggers: t.triggers, count: t.count, spring: t.easing.spring || null };
  });
  const scales = motionScales(transitions, []);
  m.motion.durations = scales.durations;
  m.motion.easings = scales.easings.map((e) => {
    const t = transitions.find((x) => x.easing === e.value);
    return t && t.spring ? { ...e, name: t.easingName } : e;
  });
  m.motion.transitions = transitions.slice(0, 20);
  m.motion.springs = transitions
    .filter((t) => t.spring)
    .map((t) => ({ name: t.easingName, ...t.spring, linear: t.easing, durationMs: t.durationMs }))
    .filter((s, i, arr) => arr.findIndex((x) => x.name === s.name) === i);
  if (snap.motion) {
    m.motion.presets = snap.motion.presets || [];
    for (const tl of snap.motion.timelines || []) {
      for (const k of motionToKeyframes(tl)) m.motion.keyframes.push(k);
      for (const n of tl.nodes) for (const st of n.styles || []) m.motion.animations.push({ name: st.name, durationMs: Math.round((st.duration || 0) * 1000), easing: '', count: 1, example: `${tl.frame} › ${n.name}`, figmaStyle: true });
    }
    m.motion.timelines = (snap.motion.timelines || []).map((t) => ({ frameId: t.frameId, frame: t.frame, page: t.page, durationMs: Math.round(t.duration * 1000), nodes: t.nodes.length }));
  }

  m.components.figma = S.components.slice(0, 200);
  m.assets.frames = S.frames.filter((f) => f.width > 0 && f.height > 0).slice(0, 200);
  m.assets.icons = S.icons;
  m.assets.figmaImages = S.images.slice(0, 300);
  m.stack = [{ name: 'Figma', kind: 'source', evidence: snap.via === 'plugin' ? 'API de plugins na aba' : 'API REST' }];

  if (snap.via === 'rest') m.notes.push('Lido pela API REST: variáveis do Figma só saem pela API de plugins (ou plano Enterprise).');
  if (S.truncated) m.notes.push(`Arquivo grande: análise parou em ${S.nodes} camadas.`);
  for (const f of snap.failures || []) m.notes.push(`Falha ao exportar ${f}`);
  if (m.fonts.some((f) => f.source === 'figma')) m.notes.push('Fontes do Figma: o link do Google Fonts é uma tentativa — confira se cada família existe lá.');
  m.stats = { nodes: S.nodes, pages: S.pages.length, frames: S.frames.length, styles: styles.length };
  return m;
}
