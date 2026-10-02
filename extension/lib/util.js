// Utilidades puras compartilhadas pelo painel e pelos testes (sem DOM, sem chrome.*).

export const round = (n, d = 2) => {
  const f = 10 ** d;
  return Math.round(Number(n) * f) / f;
};

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function slugify(input, max = 48) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

// Gera nomes únicos: "primary", "primary-2", "primary-3"…
export function uniqueNamer(reserved = []) {
  const used = new Set(reserved);
  return (base) => {
    const root = base || 'item';
    let name = root;
    for (let i = 2; used.has(name); i++) name = `${root}-${i}`;
    used.add(name);
    return name;
  };
}

// Divide "a, b(c, d), 'e,f'" nas vírgulas de nível zero (respeita parênteses, colchetes e aspas).
export function splitTopLevel(str, sep = ',') {
  const out = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (const ch of String(str ?? '')) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === sep && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parseTimeMs(value) {
  const m = /^(-?[\d.]+)(ms|s)$/.exec(String(value ?? '').trim());
  if (!m) return 0;
  return round(parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1), 0);
}

export const px = (value) => {
  const m = /^(-?[\d.]+)px$/.exec(String(value ?? '').trim());
  return m ? parseFloat(m[1]) : null;
};

// Ordena entradas {count} e corta.
export function top(list, n, minCount = 1) {
  return [...list].filter((e) => (e.count ?? 0) >= minCount).sort((a, b) => b.count - a.count).slice(0, n);
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'pagina';
  }
}

// localhost, IPs privados e de link-local (inclusive IPv4 dentro de IPv6, como o parser de URL serializa).
// ponytail: nome que só resolve para IP privado no DNS (router.lan) passa — barrar exigiria resolver o nome.
export function isPrivateHost(host) {
  let h = String(host || '').replace(/^\[|\]$/g, '').toLowerCase();
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (mapped) {
    const [hi, lo] = [parseInt(mapped[1], 16), parseInt(mapped[2], 16)];
    h = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '0.0.0.0') return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
  }
  return h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h);
}

// URL que a extensão pode buscar a pedido de uma página: só http(s), e rede local só quando a própria página
// também é local (site em desenvolvimento). A extensão tem host_permissions e passa por cima das proteções que
// o navegador aplica à página — sem esta regra, um <img data-src="file:///…"> punha um arquivo do disco no kit.
// Devolve o href normalizado, ou null. Quem busca confere também res.url: num redirecionamento para a rede local
// o pedido já saiu, mas a resposta é descartada.
// ponytail: o pedido redirecionado sai mesmo assim; impedir exigiria seguir cada redirecionamento à mão.
export function fetchableUrl(url, pageUrl) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  let pageHost = '';
  try {
    pageHost = new URL(pageUrl).hostname;
  } catch {
    /* sem URL da página: trata como pública */
  }
  return isPrivateHost(u.hostname) && !isPrivateHost(pageHost) ? null : u.href;
}

export function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}

export function firstFamily(stack) {
  const first = splitTopLevel(stack)[0] || '';
  return first.replace(/^["']|["']$/g, '').trim();
}

// next/font gera nomes como "__Inter_d65c78"; o nome de verdade é "Inter".
export function prettyFamily(family) {
  const m = /^__(.+?)_[0-9a-f]{5,8}$/i.exec(family);
  return (m ? m[1].replace(/_/g, ' ') : family).trim();
}

const GENERIC = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif',
  'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong', '-apple-system', 'blinkmacsystemfont',
]);
const SYSTEM = new Set([
  'arial', 'helvetica', 'helvetica neue', 'segoe ui', 'roboto', 'times new roman', 'times', 'georgia',
  'verdana', 'tahoma', 'courier new', 'courier', 'menlo', 'monaco', 'consolas', 'sf pro', 'sf pro text',
  'sf pro display', 'sf mono', 'apple color emoji', 'segoe ui emoji', 'noto color emoji', 'liberation mono',
  'ubuntu', 'cantarell', 'oxygen', 'trebuchet ms', 'lucida grande', 'dejavu sans', 'noto sans',
]);

export function isGenericFamily(f) {
  return GENERIC.has(String(f).toLowerCase());
}

export function isSystemFamily(f) {
  const k = String(f).toLowerCase();
  return GENERIC.has(k) || SYSTEM.has(k);
}

// String CSS entre aspas simples: escapa \ e ', e quebras de linha viram \A (CSS não aceita newline cru em string).
export function cssString(s) {
  return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n\f]+/g, '\\A ')}'`;
}

// Texto vindo da página dentro de comentário /* */ ou //: sem "*/" e sem quebra de linha (senão vira código).
export function cmt(s, max = 200) {
  return String(s ?? '')
    .replace(/\*\//g, '* /')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .slice(0, max);
}

// Pilha de fallback razoável para uma família.
export function familyStack(family, kind = 'sans') {
  const fallback = {
    sans: 'ui-sans-serif, system-ui, sans-serif',
    serif: 'ui-serif, Georgia, serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  }[kind] || 'sans-serif';
  if (!family || isGenericFamily(family)) return fallback;
  return `${cssString(family)}, ${fallback}`;
}

export function guessFamilyKind(family, stack = '') {
  const s = `${family} ${stack}`.toLowerCase();
  if (/mono|code|courier|consol|menlo/.test(s)) return 'mono';
  if (/(^|[\s,'"])serif|georgia|times|garamond|playfair|merriweather|lora|baskerville|didot|bodoni|fraunces|crimson|caslon/.test(s) && !/sans/.test(s)) return 'serif';
  return 'sans';
}

// Nomes conhecidos de curvas (easings.net + Material).
const NAMED_CURVES = [
  ['standard', [0.4, 0, 0.2, 1]],
  ['emphasized', [0.2, 0, 0, 1]],
  ['out-quad', [0.5, 1, 0.89, 1]],
  ['out-cubic', [0.33, 1, 0.68, 1]],
  ['out-quart', [0.25, 1, 0.5, 1]],
  ['out-quint', [0.22, 1, 0.36, 1]],
  ['out-expo', [0.16, 1, 0.3, 1]],
  ['out-circ', [0, 0.55, 0.45, 1]],
  ['out-back', [0.34, 1.56, 0.64, 1]],
  ['in-out-quad', [0.45, 0, 0.55, 1]],
  ['in-out-cubic', [0.65, 0, 0.35, 1]],
  ['in-out-quart', [0.76, 0, 0.24, 1]],
  ['in-out-quint', [0.83, 0, 0.17, 1]],
  ['in-out-expo', [0.87, 0, 0.13, 1]],
  ['in-out-circ', [0.85, 0, 0.15, 1]],
  ['in-out-back', [0.68, -0.6, 0.32, 1.6]],
  ['in-cubic', [0.32, 0, 0.67, 0]],
  ['in-expo', [0.7, 0, 0.84, 0]],
  ['in-back', [0.36, 0, 0.66, -0.56]],
];

export const KEYWORD_CURVES = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  linear: [0, 0, 1, 1],
};

export function parseCubicBezier(value) {
  const v = String(value ?? '').trim();
  if (KEYWORD_CURVES[v]) return KEYWORD_CURVES[v];
  const m = /^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/.exec(v);
  return m ? m.slice(1, 5).map(Number) : null;
}

const KEYWORD_NAMES = { ease: 'default', 'ease-in': 'in', 'ease-out': 'out', 'ease-in-out': 'in-out', linear: 'linear' };

export function easingName(value) {
  const v = String(value ?? '').trim();
  if (KEYWORD_NAMES[v]) return KEYWORD_NAMES[v];
  if (/^steps\(/.test(v) || v === 'step-start' || v === 'step-end') return 'steps';
  if (/^linear\(/.test(v)) return 'spring';
  const bz = parseCubicBezier(v);
  if (!bz) return null;
  for (const [name, ref] of NAMED_CURVES) {
    if (ref.every((n, i) => Math.abs(n - bz[i]) < 0.02)) return name;
  }
  // curva desconhecida: nome pelo formato
  const [x1, y1, x2, y2] = bz;
  if (y1 > 1.02 || y2 > 1.02 || y1 < -0.02 || y2 < -0.02) return 'overshoot';
  if (x1 >= 0.25 && y1 <= 0.2 && x2 <= 0.75 && y2 >= 0.8) return 'in-out';
  if (y1 >= x1 * 1.5 && y2 >= 0.9) return 'out';
  if (y2 <= x2 * 0.7) return 'in';
  return 'custom';
}

// Mola amortecida → função CSS linear() com amostras, mais a duração até assentar.
export function springToLinear({ mass = 1, stiffness = 100, damping = 10, initialVelocity = 0 } = {}) {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const v0 = -initialVelocity;
  const x = (t) => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0 + v0) / wd) * Math.sin(wd * t));
    }
    if (zeta === 1) return 1 - Math.exp(-w0 * t) * (1 + (w0 + v0) * t);
    const r = Math.sqrt(zeta * zeta - 1);
    const s1 = -w0 * (zeta - r);
    const s2 = -w0 * (zeta + r);
    // x(0) = 0 e x'(0) = velocidade inicial
    const c2 = (initialVelocity + s1) / (s2 - s1);
    const c1 = -1 - c2;
    return 1 + c1 * Math.exp(s1 * t) + c2 * Math.exp(s2 * t);
  };
  // tempo até ficar a menos de 0,1% do alvo (com teto de 3 s)
  let settle = 3;
  for (let t = 0.05; t <= 3; t += 0.01) {
    let calm = true;
    for (let k = t; k <= Math.min(3, t + 0.3); k += 0.02) {
      if (Math.abs(x(k) - 1) > 0.001) {
        calm = false;
        break;
      }
    }
    if (calm) {
      settle = t;
      break;
    }
  }
  const N = 32;
  const points = [];
  for (let i = 0; i <= N; i++) points.push(round(i === N ? 1 : x((settle * i) / N), 4));
  return { css: `linear(${points.join(', ')})`, durationMs: Math.round(settle * 1000) };
}

export function kebab(prop) {
  if (prop === 'cssFloat') return 'float';
  if (prop === 'cssOffset') return 'offset';
  if (prop.startsWith('--')) return prop;
  return prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

export function camel(prop) {
  return prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
