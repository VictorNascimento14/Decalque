// Componente capturado (árvore + regras) → HTML/CSS autônomo e React + Tailwind.
// Mesma entrada para a pinça na web (content/capture.js) e para a seleção do Figma (content/figma-main.js).

import { camel, cmt, escapeHtml, slugify } from './util.js';
import { toClassList } from './tailwind.js';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function walk(node, fn) {
  if (!node) return;
  fn(node);
  for (const c of node.children || []) walk(c, fn);
}

// Nós com o mesmo bloco de CSS (e sem estados/pseudo próprios) dividem uma classe.
function assignClasses(cap) {
  const special = new Set([...(cap.pseudo || []).map((p) => p.cls), ...(cap.states || []).flatMap((s) => [s.cls, s.ownerCls]).filter(Boolean)]);
  const byKey = new Map();
  const rename = new Map();
  walk(cap.tree, (n) => {
    if (n.t !== 'el' || !n.cls) return;
    if (special.has(n.cls)) {
      rename.set(n.cls, n.cls);
      return;
    }
    const key = JSON.stringify(n.decls || []);
    if (!byKey.has(key)) byKey.set(key, n.cls);
    rename.set(n.cls, byKey.get(key));
  });
  return rename;
}

function borderBoxShare(cap) {
  let total = 0;
  let bb = 0;
  walk(cap.tree, (n) => {
    if (n.t !== 'el' || !n.cls) return;
    total++;
    if ((n.decls || []).some(([p, v]) => p === 'box-sizing' && v === 'border-box')) bb++;
  });
  return total ? bb / total : 0;
}

const declLines = (decls, pad = '  ') => decls.map(([p, v]) => `${pad}${p}: ${v};`).join('\n');

export function renderCSS(cap) {
  const rename = assignClasses(cap);
  const global = borderBoxShare(cap) >= 0.5;
  const out = [];
  if (global) out.push('*, *::before, *::after { box-sizing: border-box; }');
  const done = new Set();
  walk(cap.tree, (n) => {
    if (n.t !== 'el' || !n.cls) return;
    const cls = rename.get(n.cls) || n.cls;
    if (done.has(cls)) return;
    done.add(cls);
    let decls = n.decls || [];
    if (global) {
      const hasBox = decls.some(([p]) => p === 'box-sizing');
      decls = decls.filter(([p, v]) => !(p === 'box-sizing' && v === 'border-box'));
      // <button>, <input>… já nascem border-box no navegador
      if (!hasBox && n.ns !== 'svg' && !/^(button|input|select|textarea|meter|progress)$/.test(n.tag)) decls = [...decls, ['box-sizing', 'content-box']];
    }
    if (decls.length) out.push(`.${cls} {\n${declLines(decls)}\n}`);
  });
  for (const p of cap.pseudo || []) out.push(`.${p.cls}::${p.pseudo} {\n${declLines(p.decls)}\n}`);
  for (const s of cap.states || []) {
    const sel = s.ownerCls ? `.${s.ownerCls}:${s.state} .${s.cls}` : `.${s.cls}:${s.state}`;
    out.push(`${sel} {\n${declLines(s.decls)}\n}`);
  }
  return out.join('\n\n');
}

const UNSAFE_URL = /^(javascript|vbscript):/i;
// Atributos que podem executar código ou que não são nomes válidos não saem no código gerado:
// - on* e URL javascript:/vbscript: — comparada sem espaço, tab nem quebra de linha, que o parser de URL descarta
//   ("java\tscript:" executa), item por item nas listas de <animate values="a;b">;
// - attributeName="href" de <set>/<animate>, que troca o href do link por javascript: depois que ele passou aqui.
export function safeAttr(name, value) {
  if (/^on/i.test(name) || !/^[A-Za-z_][\w:.-]*$/.test(name)) return false;
  const v = String(value).replace(/[\u0000-\u0020]/g, '');
  if (/^(href|xlink:href|src|action|formaction|to|from|by|values)$/i.test(name) && v.split(';').some((x) => UNSAFE_URL.test(x))) return false;
  if (/^attributename$/i.test(name) && /^(xlink:)?href$/i.test(v)) return false;
  return true;
}

function htmlAttrs(node, cls) {
  const parts = [];
  if (cls) parts.push(`class="${cls}"`);
  for (const [k, v] of Object.entries(node.attrs || {})) {
    if (!safeAttr(k, v)) continue;
    if (v === '' && /^(autoplay|muted|loop|playsinline|controls|disabled|checked|readonly|reversed|selected)$/.test(k)) parts.push(k);
    else parts.push(`${k}="${escapeHtml(v)}"`);
  }
  return parts.length ? ` ${parts.join(' ')}` : '';
}

export function renderHTML(cap, { indent = true } = {}) {
  const rename = assignClasses(cap);
  const nl = indent ? '\n' : '';
  const render = (n, depth) => {
    const pad = indent ? '  '.repeat(depth) : '';
    if (n.t === 'text') return `${pad}${escapeHtml(n.v)}`;
    const cls = n.cls ? rename.get(n.cls) || n.cls : null;
    const open = `<${n.tag}${htmlAttrs(n, cls)}>`;
    if (/^(script|style|iframe|object|embed|foreignobject)$/i.test(n.tag) && n.ns === 'svg') return '';
    if (VOID.has(n.tag) && n.ns !== 'svg') return `${pad}${open}`;
    const kids = n.children || [];
    if (!kids.length) return `${pad}${open}</${n.tag}>`;
    if (kids.length === 1 && kids[0].t === 'text' && kids[0].v.length < 80) return `${pad}${open}${escapeHtml(kids[0].v)}</${n.tag}>`;
    return `${pad}${open}${nl}${kids.map((k) => render(k, depth + 1)).join(nl)}${nl}${pad}</${n.tag}>`;
  };
  return render(cap.tree, 0);
}

function googleLink(cap) {
  const fams = cap.fontFamilies || [];
  if (!fams.length) return '';
  // o nome vem do arquivo (Figma) ou da página: codificado na URL, e a URL escapada no atributo
  const q = fams.map((f) => `family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@${[...new Set(f.weights.map((w) => Math.round(+w / 100) * 100 || 400))].sort().join(';')}`).join('&');
  return `<link rel="stylesheet" href="${escapeHtml(`https://fonts.googleapis.com/css2?${q}&display=swap`)}">`;
}

function rootVarsCss(cap) {
  const vars = Object.entries(cap.rootVars || {});
  return vars.length ? `:root {\n${vars.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}` : '';
}

export function globalCss(cap) {
  return [...(cap.fontFaces || []), rootVarsCss(cap), ...(cap.keyframes || [])].filter(Boolean).join('\n\n');
}

// assetUrls: { 'img-x.png': 'data:…' } — usado na prévia, onde caminhos relativos não existem.
export function renderDocument(cap, { assetUrls = null } = {}) {
  const title = cap.root?.description || 'Componente';
  let html = renderHTML(cap);
  let css = renderCSS(cap);
  if (assetUrls) {
    for (const [name, url] of Object.entries(assetUrls)) {
      html = html.split(`assets/${name}`).join(url);
      css = css.split(`assets/${name}`).join(url);
    }
  }
  const origin = cmt(cap.source.kind === 'figma' ? `Figma: ${cap.source.file} › ${cap.source.page}` : cap.source.url, 300);
  // "<" escapado como \3c dentro do <style>: um valor capturado com "</style><script>" não fecha a tag
  const styleText = (t) => t.replace(/</g, '\\3c ');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Decalque</title>
${googleLink(cap)}
<style>
${styleText(`/* Capturado com Decalque · ${origin}${cap.source.viewport ? ` · viewport ${cap.source.viewport.width}px` : ''} */
${globalCss(cap)}

body { margin: 0; padding: 24px; background: ${cap.background || '#ffffff'}; }

${css}`)}
</style>
</head>
<body>
${html}
</body>
</html>
`;
}

// ---------------------------------------------------------------- React + Tailwind
const HTML_ATTR = {
  class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength', srcset: 'srcSet',
  autoplay: 'autoPlay', playsinline: 'playsInline', colspan: 'colSpan', rowspan: 'rowSpan', crossorigin: 'crossOrigin',
  referrerpolicy: 'referrerPolicy', datetime: 'dateTime', checked: 'defaultChecked', value: 'defaultValue',
  contenteditable: 'contentEditable', spellcheck: 'spellCheck', autocomplete: 'autoComplete', inputmode: 'inputMode',
  fetchpriority: 'fetchPriority', allowfullscreen: 'allowFullScreen', frameborder: 'frameBorder', 'xlink:href': 'href',
  'xml:space': 'xmlSpace', 'xmlns:xlink': 'xmlnsXlink', 'xml:lang': 'xmlLang',
};
const BOOL = new Set(['disabled', 'checked', 'readonly', 'autoplay', 'muted', 'loop', 'playsinline', 'controls', 'reversed', 'required', 'multiple', 'hidden', 'allowfullscreen']);

function jsxValue(v) {
  return /["{}\\\n<>]/.test(v) ? `{${JSON.stringify(v)}}` : `"${v}"`;
}

function styleObject(str) {
  const entries = String(str)
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const i = d.indexOf(':');
      if (i < 1) return null;
      const k = d.slice(0, i).trim();
      // a chave vem do style da página: fora de um nome de propriedade simples, vai entre aspas (senão "}} onClick={…}" fechava o objeto)
      return `${/^-?[a-z][a-z0-9-]*$/i.test(k) ? camel(k) : JSON.stringify(k)}: ${JSON.stringify(d.slice(i + 1).trim())}`;
    })
    .filter(Boolean);
  return `{{ ${entries.join(', ')} }}`;
}

function jsxAttrs(node) {
  const out = [];
  for (const [k, v] of Object.entries(node.attrs || {})) {
    if (k === 'class' || k === 'selected' || !safeAttr(k, v)) continue;
    if (k === 'style') {
      out.push(`style=${styleObject(v)}`);
      continue;
    }
    let name = HTML_ATTR[k] || k;
    if (!HTML_ATTR[k] && node.ns === 'svg' && !/^(data|aria)-/.test(k)) name = camel(k.replace(':', '-'));
    if (BOOL.has(k) && (v === '' || v === k || v === 'true')) out.push(name);
    else out.push(`${name}=${jsxValue(String(v))}`);
  }
  return out.length ? ` ${out.join(' ')}` : '';
}

function jsxText(v) {
  if (!v.trim()) return '{" "}';
  if (/^\s|\s$|[{}<>]/.test(v)) return `{${JSON.stringify(v)}}`;
  return v;
}

export function componentName(cap) {
  const base = slugify(cap.root?.description || '') || 'componente';
  const pascal = base
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')
    .replace(/^\d+/, '');
  return pascal || 'Componente';
}

export function renderJSX(cap) {
  const pseudoBy = new Map();
  for (const p of cap.pseudo || []) pseudoBy.set(p.cls, [...(pseudoBy.get(p.cls) || []), p]);
  const stateBy = new Map();
  for (const s of cap.states || []) stateBy.set(s.cls, [...(stateBy.get(s.cls) || []), s]);
  const groups = new Set((cap.states || []).map((s) => s.ownerCls).filter(Boolean));

  const classesFor = (n) => {
    const list = toClassList(n.decls || []);
    if (groups.has(n.cls)) list.unshift(`group/${n.cls}`);
    for (const p of pseudoBy.get(n.cls) || []) list.push(...toClassList(p.decls, `${p.pseudo}:`));
    for (const s of stateBy.get(n.cls) || []) list.push(...toClassList(s.decls, s.ownerCls ? `group-${s.state}/${s.ownerCls}:` : `${s.state}:`));
    return [...new Set(list)].join(' ');
  };

  const render = (n, depth) => {
    const pad = '  '.repeat(depth);
    if (n.t === 'text') return `${pad}${jsxText(n.v)}`;
    if (/^(script|style|iframe|object|embed|foreignobject)$/i.test(n.tag) && n.ns === 'svg') return '';
    const cls = n.cls ? classesFor(n) : '';
    const open = `<${n.tag}${cls ? ` className="${cls}"` : ''}${jsxAttrs(n)}`;
    const kids = n.children || [];
    if (!kids.length || (VOID.has(n.tag) && n.ns !== 'svg')) return `${pad}${open} />`;
    if (kids.length === 1 && kids[0].t === 'text' && kids[0].v.length < 60) return `${pad}${open}>${jsxText(kids[0].v)}</${n.tag}>`;
    return `${pad}${open}>\n${kids.map((k) => render(k, depth + 1)).join('\n')}\n${pad}</${n.tag}>`;
  };

  const name = componentName(cap);
  const origin = cmt(cap.source.kind === 'figma' ? `Figma: ${cap.source.file} › ${cap.source.page}` : cap.source.url, 300);
  const global = globalCss(cap);
  const assets = (cap.assets || []).length ? `\n// Imagens: copie a pasta assets/ do .zip para public/ e ajuste os caminhos se precisar.` : '';
  return `// Capturado com Decalque · ${origin}
// ${cap.root?.width}×${cap.root?.height}px${cap.source.viewport ? ` no viewport de ${cap.source.viewport.width}px` : ''}. Requer Tailwind CSS v4 (ou v3.3+).
// Valores entre [] são os exatos do original.${assets}${global ? '\n// CSS global necessário (fontes/animações/variáveis) no fim do arquivo.' : ''}

export default function ${name}() {
  return (
${render(cap.tree, 2)}
  );
}
${global ? `\n/* Cole no seu CSS global:\n\n${global.replace(/\*\//g, '* /')}\n*/\n` : ''}`;
}
