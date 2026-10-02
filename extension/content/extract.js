/* Decalque — extração do design de uma página.
   Content script (mundo isolado), injetado sob demanda pelo painel. Expõe window.__decalque.
   Só coleta e normaliza valores; nomes, escalas e exportação ficam no painel (lib/). */
(() => {
  'use strict';
  const VERSION = 3;
  if (window.__decalque && window.__decalque.version === VERSION) return;

  const D = (window.__decalque = { version: VERSION });
  const UI_ATTR = 'data-decalque-ui';
  const SKIP = new Set([
    'script', 'style', 'noscript', 'template', 'meta', 'link', 'head', 'title', 'base', 'iframe', 'object',
    'embed', 'br', 'wbr', 'source', 'track', 'param', 'slot', 'frame', 'frameset',
  ]);

  // ---------------------------------------------------------------- utilidades
  const round = (n, d = 2) => {
    const f = 10 ** d;
    return Math.round(n * f) / f;
  };
  const inc = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const safe = (fn, fallback = null) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  function splitTop(str, sep = ',') {
    const out = [];
    let depth = 0;
    let quote = null;
    let cur = '';
    for (const ch of String(str || '')) {
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

  const timeMs = (v) => {
    const m = /^(-?[\d.]+)(ms|s)$/.exec(String(v || '').trim());
    return m ? Math.round(parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1)) : 0;
  };
  // Só http(s): a URL vem da página, e file:, javascript: e afins não são assets — um file:// listado como imagem
  // ia parar no kit. data: e blob: são tratados à parte por quem chama.
  const absUrl = (u, base) => safe(() => {
    const url = new URL(u, base || document.baseURI);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  });
  const firstFamily = (stack) => (splitTop(stack)[0] || '').replace(/^["']|["']$/g, '').trim();
  const kebab = (p) =>
    p === 'cssFloat' ? 'float' : p === 'cssOffset' ? 'offset' : p.startsWith('--') ? p : p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const classAttr = (el) => (el.getAttribute && el.getAttribute('class')) || '';

  function describe(el) {
    if (!el || !el.localName) return '';
    let s = el.localName;
    if (el.id) s += `#${el.id}`;
    const cls = classAttr(el).split(/\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) s += `.${cls.join('.')}`;
    return s.slice(0, 90);
  }

  function progress(text) {
    try {
      chrome.runtime.sendMessage({ type: 'decalque:progress', text }).catch(() => {});
    } catch {
      /* painel fechado */
    }
  }

  // Content scripts não fazem fetch entre origens (CORS); o service worker faz por nós.
  let fetchBudget = 0;
  async function fetchText(url) {
    // teto por extração: @import encadeado não vira varredura
    if (++fetchBudget > 60) return null;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'decalque:fetch', url });
      return res && typeof res.text === 'string' ? res.text : null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------- cores
  // Valores computados chegam como rgb()/rgba() ou, em cores modernas, oklch()/lab()/color().
  // As modernas passam por um canvas 1×1, que devolve o sRGB exato.
  const colorCache = new Map();
  let ctx2d = null;
  const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

  function parseAlpha(v) {
    if (v == null) return 1;
    v = v.trim();
    const a = v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
    return Number.isFinite(a) ? round(Math.max(0, Math.min(1, a)), 3) : 1;
  }

  function normColor(input) {
    if (!input) return null;
    const str = String(input).trim();
    if (colorCache.has(str)) return colorCache.get(str);
    let out = null;
    const lower = str.toLowerCase();
    const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(lower);
    const hx = /^#([0-9a-f]{3,8})$/.exec(lower);
    if (m) out = { r: +m[1], g: +m[2], b: +m[3], a: parseAlpha(m[4]) };
    else if (hx && [3, 4, 6, 8].includes(hx[1].length)) {
      const h = hx[1].length < 5 ? [...hx[1]].map((c) => c + c).join('') : hx[1];
      const n = (i) => parseInt(h.slice(i, i + 2), 16);
      out = { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? round(n(6) / 255, 3) : 1 };
    } else if (lower === 'transparent') out = { r: 0, g: 0, b: 0, a: 0 };
    else if (/^(#|[a-z-]+\()|^[a-z]+$/.test(lower) && !/^(none|auto|inherit|initial|unset|currentcolor|normal)$/.test(lower)) {
      out = viaCanvas(str);
    }
    if (out) {
      out.hex = `#${hex2(out.r)}${hex2(out.g)}${hex2(out.b)}`;
      out.css = out.a < 1 ? `${out.hex}${hex2(out.a * 255)}` : out.hex;
      if (!/^(rgba?\(|#)/.test(lower)) out.original = str;
    }
    colorCache.set(str, out);
    return out;
  }

  function viaCanvas(str) {
    let body = str;
    let a = 1;
    const fn = /^([a-z-]+)\((.*)\)$/is.exec(str);
    if (fn) {
      const inner = fn[2];
      const slash = inner.lastIndexOf('/');
      if (slash >= 0 && !/\(/.test(inner.slice(slash))) {
        a = parseAlpha(inner.slice(slash + 1));
        body = `${fn[1]}(${inner.slice(0, slash)})`;
      }
    }
    try {
      ctx2d = ctx2d || new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
      ctx2d.fillStyle = '#010203';
      ctx2d.fillStyle = body;
      if (ctx2d.fillStyle === '#010203' && !/^#010203$/i.test(body)) return null; // inválida
      ctx2d.clearRect(0, 0, 1, 1);
      ctx2d.fillRect(0, 0, 1, 1);
      const d = ctx2d.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: round(a * (d[3] / 255), 3) };
    } catch {
      return null;
    }
  }

  function colorsIn(str) {
    const out = [];
    for (const m of String(str).matchAll(/(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi)) out.push(m[0]);
    return out;
  }

  // ---------------------------------------------------------------- folhas de estilo
  async function readSheets(shadowRoots) {
    const out = {
      vars: [], keyframes: new Map(), fontFaces: [], media: new Map(), container: 0, imports: [],
      properties: [], stateRules: [], referenced: new Set(), total: 0, blocked: [],
    };
    const seen = new Set();
    const jobs = [];
    for (const root of [document, ...shadowRoots]) {
      for (const sheet of safe(() => [...root.styleSheets], [])) jobs.push(readSheet(sheet, out, seen, 0));
      for (const sheet of safe(() => [...(root.adoptedStyleSheets || [])], [])) jobs.push(readSheet(sheet, out, seen, 0));
    }
    await Promise.all(jobs);
    return out;
  }

  async function readSheet(sheet, out, seen, depth) {
    if (!sheet || seen.has(sheet)) return;
    seen.add(sheet);
    out.total++;
    const rules = safe(() => sheet.cssRules);
    const mediaText = safe(() => sheet.media && sheet.media.mediaText, '');
    const media = mediaText && mediaText !== 'all' ? [mediaText] : [];
    if (rules) {
      await walkRules(rules, { base: sheet.href || document.baseURI, media, parent: null }, out, seen, depth);
      return;
    }
    if (!sheet.href || seen.has(sheet.href)) return;
    seen.add(sheet.href);
    const text = await fetchText(sheet.href);
    if (text == null) out.blocked.push(sheet.href);
    else await readCssText(text, sheet.href, media, out, seen, depth);
  }

  async function readCssText(text, href, media, out, seen, depth) {
    const sheet = new CSSStyleSheet();
    try {
      sheet.replaceSync(text); // descarta @import (seguimos à mão abaixo)
    } catch {
      out.blocked.push(href);
      return;
    }
    const jobs = [walkRules(sheet.cssRules, { base: href, media, parent: null }, out, seen, depth)];
    for (const m of text.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?\s*([^;]*);/gi)) {
      const url = absUrl(m[1], href);
      if (!url) continue;
      out.imports.push(url);
      if (depth < 3 && !seen.has(url)) {
        seen.add(url);
        out.total++;
        const sub = m[2] && m[2].trim() ? [...media, m[2].trim()] : media;
        jobs.push(fetchText(url).then((t) => (t == null ? out.blocked.push(url) : readCssText(t, url, sub, out, seen, depth + 1))));
      }
    }
    await Promise.all(jobs);
  }

  const STATE_RE = /:(hover|focus-visible|focus-within|focus|active)\b/;

  async function walkRules(rules, ctx, out, seen, depth) {
    const pending = [];
    const visit = (list, c) => {
      for (const rule of list) {
        try {
          if (rule instanceof CSSStyleRule) {
            const selector = c.parent ? nest(rule.selectorText, c.parent) : rule.selectorText;
            styleRule(rule, selector, c, out);
            if (rule.cssRules && rule.cssRules.length) visit(rule.cssRules, { ...c, parent: selector });
          } else if (rule instanceof CSSMediaRule) {
            const cond = rule.conditionText || rule.media.mediaText;
            inc(out.media, cond);
            visit(rule.cssRules, { ...c, media: [...c.media, cond] });
          } else if (rule instanceof CSSImportRule) {
            const url = absUrl(rule.href, c.base);
            if (url) out.imports.push(url);
            const m = safe(() => rule.media.mediaText, '');
            const media = m && m !== 'all' ? [...c.media, m] : c.media;
            const child = safe(() => rule.styleSheet);
            const childRules = child && safe(() => child.cssRules);
            if (childRules) {
              if (!seen.has(child)) {
                seen.add(child);
                out.total++;
                visit(childRules, { base: url || c.base, media, parent: null });
              }
            } else if (url && !seen.has(url) && depth < 3) {
              seen.add(url);
              out.total++;
              pending.push(fetchText(url).then((t) => (t == null ? out.blocked.push(url) : readCssText(t, url, media, out, seen, depth + 1))));
            }
          } else if (rule instanceof CSSFontFaceRule) {
            fontFace(rule, c, out);
          } else if (rule instanceof CSSKeyframesRule) {
            out.keyframes.set(rule.name, rule.cssText);
          } else if (typeof CSSPropertyRule !== 'undefined' && rule instanceof CSSPropertyRule) {
            out.properties.push({ name: rule.name, syntax: rule.syntax, inherits: rule.inherits, initial: rule.initialValue });
          } else if (rule.cssRules) {
            if (typeof CSSContainerRule !== 'undefined' && rule instanceof CSSContainerRule) out.container++;
            visit(rule.cssRules, c); // @supports, @layer, @container, @scope, @starting-style…
          }
        } catch {
          /* regra exótica: segue */
        }
      }
    };
    visit(rules, ctx);
    await Promise.all(pending);
  }

  function nest(selector, parent) {
    return splitTop(selector)
      .map((s) => (s.includes('&') ? s.replace(/&/g, `:is(${parent})`) : `:is(${parent}) ${s}`))
      .join(', ');
  }

  function styleRule(rule, selector, ctx, out) {
    const style = rule.style;
    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      if (prop.startsWith('--') && out.vars.length < 4000) {
        out.vars.push({ name: prop, value: style.getPropertyValue(prop).trim(), selector, media: ctx.media.join(' and ') });
      }
    }
    const text = style.cssText;
    if (text.includes('var(')) for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) out.referenced.add(m[1]);
    if (STATE_RE.test(selector) && out.stateRules.length < 8000) {
      out.stateRules.push({ selector, css: text, media: ctx.media.slice() });
    }
  }

  function fontFace(rule, ctx, out) {
    const s = rule.style;
    const src = s.getPropertyValue('src');
    const sources = [];
    for (const m of src.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)\s*(?:format\(\s*["']?([\w-]+)["']?\s*\))?/g)) {
      const raw = m[2];
      if (raw.startsWith('data:') && raw.length > 1_500_000) continue;
      const url = raw.startsWith('data:') ? raw : absUrl(raw, ctx.base);
      if (!url) continue;
      const ext = (/\.(woff2|woff|ttf|otf|eot)(\?|#|$)/i.exec(url) || [])[1];
      sources.push({ url, format: (m[3] || ext || '').toLowerCase() });
    }
    out.fontFaces.push({
      family: s.getPropertyValue('font-family').trim().replace(/^["']|["']$/g, ''),
      weight: s.getPropertyValue('font-weight').trim() || '400',
      style: s.getPropertyValue('font-style').trim() || 'normal',
      display: s.getPropertyValue('font-display').trim(),
      unicodeRange: s.getPropertyValue('unicode-range').trim(),
      sources,
    });
  }

  // ---------------------------------------------------------------- regras de estado (:hover, :focus…)
  const STATE_NAMES = ['focus-visible', 'focus-within', 'hover', 'focus', 'active'];

  // Percorre um seletor respeitando escapes (\:), aspas e parênteses; fn(ch, i, depth) decide o que fazer.
  function scanSelector(sel, fn) {
    let depth = 0;
    let quote = null;
    for (let i = 0; i < sel.length; i++) {
      const ch = sel[i];
      if (ch === '\\') {
        fn(sel.slice(i, i + 2), i, depth, true);
        i++;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = null;
        fn(ch, i, depth, true);
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      if (ch === '(' || ch === '[') depth++;
      const skip = fn(ch, i, depth, false);
      if (ch === ')' || ch === ']') depth--;
      if (typeof skip === 'number') i += skip;
    }
  }

  // Quebra um seletor em compostos e combinadores de nível zero.
  function compounds(selector) {
    const parts = [];
    let cur = '';
    const push = () => {
      if (cur.trim()) parts.push({ type: 'c', v: cur.trim() });
      cur = '';
    };
    scanSelector(selector, (ch, i, depth, literal) => {
      if (!literal && depth === 0 && (ch === '>' || ch === '+' || ch === '~')) {
        push();
        parts.push({ type: 'k', v: ch });
        return;
      }
      if (!literal && depth === 0 && /\s/.test(ch)) {
        push();
        if (parts.length && parts[parts.length - 1].type === 'c') parts.push({ type: 'k', v: ' ' });
        return;
      }
      cur += ch;
    });
    push();
    while (parts.length && parts[parts.length - 1].type === 'k') parts.pop();
    return parts;
  }

  // Estado de nível zero do composto (ignora "\:hover" de classes escapadas e o que está dentro de :not()).
  function stateOf(compound) {
    let found = null;
    scanSelector(compound, (ch, i, depth, literal) => {
      if (found || literal || depth !== 0 || ch !== ':' || compound[i + 1] === ':') return;
      const name = STATE_NAMES.find((n) => compound.startsWith(n, i + 1) && !/[\w-]/.test(compound[i + 1 + n.length] || ''));
      if (name) found = name;
    });
    return found;
  }

  function stripStates(compound) {
    let out = '';
    scanSelector(compound, (ch, i, depth, literal) => {
      if (!literal && depth === 0 && ch === ':' && compound[i + 1] !== ':') {
        const name = STATE_NAMES.find((n) => compound.startsWith(n, i + 1) && !/[\w-]/.test(compound[i + 1 + n.length] || ''));
        if (name) return name.length; // pula ":hover"
      }
      out += ch;
      return undefined;
    });
    return out || '*';
  }

  // ".card:hover .title" → { state:'hover', target:'.card .title', owner:'.card' (ancestral) }
  function parseState(sel) {
    const parts = compounds(sel.trim());
    if (!parts.length) return null;
    let stateIdx = -1;
    let state = null;
    parts.forEach((p, i) => {
      if (p.type !== 'c' || stateIdx !== -1) return;
      const st = stateOf(p.v);
      if (st) {
        stateIdx = i;
        state = st;
      }
    });
    if (stateIdx === -1) return null;
    const join = (list) => list.map((p) => (p.type === 'c' ? stripStates(p.v) : p.v === ' ' ? ' ' : ` ${p.v} `)).join('').replace(/\s+/g, ' ').trim();
    return { state, target: join(parts), owner: stateIdx === parts.length - 1 ? null : join(parts.slice(0, stateIdx + 1)) };
  }

  const mediaOk = (list) => list.every((m) => safe(() => matchMedia(m).matches, false));

  function declsFromCss(cssText, el) {
    const cs = getComputedStyle(el);
    const out = [];
    for (const part of splitTop(cssText, ';')) {
      const i = part.indexOf(':');
      if (i < 1) continue;
      const prop = part.slice(0, i).trim();
      let value = part.slice(i + 1).trim().replace(/\s*!important$/, '');
      if (prop.startsWith('--')) continue;
      value = resolveVarsWith(value, (name) => cs.getPropertyValue(name).trim());
      // o CSSOM serializa #hex como rgb(); volta para hex como no resto do kit
      value = value.replace(/rgba?\([^)]*\)/g, (m) => {
        const c = normColor(m);
        return c ? c.css : m;
      });
      out.push([prop, value]);
    }
    return out;
  }

  function resolveVarsWith(value, lookup, depth = 0) {
    if (depth > 8 || !value.includes('var(')) return value;
    let out = '';
    let i = 0;
    while (i < value.length) {
      const start = value.indexOf('var(', i);
      if (start < 0) {
        out += value.slice(i);
        break;
      }
      out += value.slice(i, start);
      let depthP = 0;
      let j = start + 3;
      for (; j < value.length; j++) {
        if (value[j] === '(') depthP++;
        else if (value[j] === ')' && --depthP === 0) break;
      }
      const inner = value.slice(start + 4, j);
      const comma = splitTop(inner);
      const name = (comma[0] || '').trim();
      const fallback = inner.includes(',') ? inner.slice(inner.indexOf(',') + 1).trim() : '';
      const got = lookup(name);
      out += got ? resolveVarsWith(got, lookup, depth + 1) : resolveVarsWith(fallback, lookup, depth + 1);
      i = j + 1;
    }
    return out;
  }

  // Declarações de estado que valem para `el` (estado no próprio elemento).
  // Seletores de estado já analisados, uma vez por leitura de CSS (analisar por elemento custava dezenas de segundos
  // em sites com milhares de regras :hover). Regras de @media que não valem agora ficam de fora.
  const QUICK_STATE = /:(hover|focus|active)/;
  function parsedStates(css) {
    if (!css.parsedStates) {
      css.parsedStates = [];
      const mediaCache = new Map();
      for (const r of css.stateRules) {
        if (r.media.length) {
          const key = r.media.join('|');
          if (!mediaCache.has(key)) mediaCache.set(key, mediaOk(r.media));
          if (!mediaCache.get(key)) continue;
        }
        for (const sel of splitTop(r.selector)) {
          if (!QUICK_STATE.test(sel)) continue;
          const p = parseState(sel);
          if (p) css.parsedStates.push({ ...p, css: r.css });
        }
      }
    }
    return css.parsedStates;
  }

  function stateDecls(el, css, wanted = ['hover', 'focus', 'focus-visible', 'active']) {
    const out = {};
    for (const p of parsedStates(css)) {
      if (p.owner || !wanted.includes(p.state)) continue;
      if (!safe(() => el.matches(p.target), false)) continue;
      const map = (out[p.state] = out[p.state] || {});
      for (const [k, v] of declsFromCss(p.css, el)) map[k] = v;
    }
    return out;
  }

  // ---------------------------------------------------------------- SVG
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PAINT = [
    ['fill', 'fill'], ['stroke', 'stroke'], ['strokeWidth', 'stroke-width'], ['fillOpacity', 'fill-opacity'],
    ['strokeOpacity', 'stroke-opacity'], ['opacity', 'opacity'], ['strokeLinecap', 'stroke-linecap'],
    ['strokeLinejoin', 'stroke-linejoin'], ['fillRule', 'fill-rule'],
  ];
  const SVG_DEFAULT = {
    fill: '#000000', stroke: 'none', 'stroke-width': '1px', 'fill-opacity': '1', 'stroke-opacity': '1', opacity: '1',
    'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', 'fill-rule': 'nonzero',
  };
  const SHAPES = /^(svg|g|path|circle|rect|ellipse|polygon|polyline|line|text|tspan|use)$/;

  // SVG autônomo: o CSS da página vira atributo, referências (#sprite, url(#grad)) vêm junto.
  function serializeSvg(svg, cs, rect) {
    const clone = svg.cloneNode(true);
    const rootColor = normColor(cs.color);
    const src = [svg, ...svg.querySelectorAll('*')];
    const dst = [clone, ...clone.querySelectorAll('*')];
    for (let i = 0; i < src.length && i < 2000; i++) {
      const o = src[i];
      const c = dst[i];
      if (!c || !SHAPES.test(o.localName)) continue;
      const s = getComputedStyle(o);
      for (const [js, attr] of PAINT) {
        let v = s[js];
        if (!v) continue;
        if (attr === 'fill' || attr === 'stroke') {
          if (v.startsWith('url(')) continue;
          if (v !== 'none') {
            const col = normColor(v);
            if (!col) continue;
            v = rootColor && col.css === rootColor.css ? 'currentColor' : col.css;
          }
        }
        if (v === SVG_DEFAULT[attr] && !c.hasAttribute(attr)) continue;
        if (o === svg && attr === 'opacity') continue;
        c.setAttribute(attr, v);
      }
      c.removeAttribute('class');
    }
    inlineRefs(clone, svg);
    // o .svg do kit pode ser aberto direto no navegador: nada que execute código vai junto
    for (const bad of clone.querySelectorAll('script,foreignObject,iframe')) bad.remove();
    for (const node of [clone, ...clone.querySelectorAll('*')]) {
      for (const a of [...node.attributes]) {
        // mesma regra do safeAttr (lib/component.js), que este script clássico não importa: URL comparada sem
        // espaço, tab nem quebra de linha (o parser descarta — "java\tscript:" executa), item por item em
        // values="a;b", e nada de <set>/<animate> trocando o href depois do filtro
        const v = a.value.replace(/[\u0000-\u0020]/g, '');
        const urlAttr = /href$/i.test(a.name) || /^(src|to|from|by|values)$/i.test(a.name);
        const unsafeUrl = urlAttr && v.split(';').some((x) => /^(javascript|vbscript):/i.test(x));
        const hrefAnim = /^attributename$/i.test(a.name) && /^(xlink:)?href$/i.test(v);
        if (/^on/i.test(a.name) || unsafeUrl || hrefAnim || !/^[A-Za-z_][\w:.-]*$/.test(a.name)) node.removeAttribute(a.name);
      }
    }
    const w = clone.getAttribute('width');
    const h = clone.getAttribute('height');
    if (!w || /%|auto/.test(w)) clone.setAttribute('width', String(round(rect.width, 1)));
    if (!h || /%|auto/.test(h)) clone.setAttribute('height', String(round(rect.height, 1)));
    if (rootColor) clone.setAttribute('color', rootColor.css);
    clone.removeAttribute('style');
    return new XMLSerializer().serializeToString(clone);
  }

  function inlineRefs(clone, svg) {
    const root = svg.getRootNode();
    const lookup = (id) => safe(() => (root.getElementById ? root.getElementById(id) : null)) || document.getElementById(id);
    let defs = null;
    for (let pass = 0; pass < 4; pass++) {
      const want = new Set();
      for (const el of [clone, ...clone.querySelectorAll('*')]) {
        for (const a of el.attributes) {
          if ((a.name === 'href' || a.name === 'xlink:href') && a.value.startsWith('#')) want.add(a.value.slice(1));
          for (const m of a.value.matchAll(/url\(\s*["']?#([^"')\s]+)["']?\s*\)/g)) want.add(m[1]);
        }
      }
      let added = 0;
      for (const id of want) {
        const q = `[id="${id.replace(/["\\]/g, '\\$&')}"]`;
        if (safe(() => clone.querySelector(q))) continue;
        const ref = lookup(id);
        if (!ref || ref.contains(svg)) continue;
        if (!defs) defs = clone.insertBefore(document.createElementNS(SVG_NS, 'defs'), clone.firstChild);
        defs.appendChild(ref.cloneNode(true));
        added++;
      }
      if (!added) break;
    }
  }

  function slug(s) {
    return String(s || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }

  function svgName(svg) {
    const iconClass = classAttr(svg)
      .split(/\s+/)
      .find((c) => /^(lucide|tabler|bi|fa|ri|ph|heroicon|feather|icon)-./.test(c) && !/^(lucide|icon)$/.test(c));
    const candidates = [
      svg.getAttribute('aria-label'),
      safe(() => svg.querySelector('title').textContent),
      svg.getAttribute('data-icon'),
      iconClass && iconClass.replace(/^(lucide|tabler|bi|fa|ri|ph|heroicon|feather|icon)-/, ''),
      svg.id,
      safe(() => svg.closest('[aria-label]').getAttribute('aria-label')),
      safe(() => svg.closest('a,button').textContent.trim().slice(0, 30)),
    ];
    for (const c of candidates) {
      const s = slug(c);
      if (s) return s;
    }
    return 'svg';
  }

  // ---------------------------------------------------------------- varredura do DOM
  const directText = (el) => {
    let n = 0;
    for (const node of el.childNodes) if (node.nodeType === 3) n += node.nodeValue.trim().length;
    return Math.min(n, 4000);
  };
  const sampleText = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);

  function semanticTag(el, tag) {
    if (/^h[1-6]$/.test(tag)) return tag;
    if (safe(() => el.closest('button,[role=button]'))) return 'button';
    if (tag === 'a' || safe(() => el.closest('a'))) return 'a';
    if (safe(() => el.closest('code,pre,kbd,samp'))) return 'code';
    if (tag === 'label' || safe(() => el.closest('label'))) return 'label';
    if (safe(() => el.closest('nav'))) return 'nav';
    if (tag === 'small') return 'small';
    if (tag === 'li') return 'li';
    if (tag === 'blockquote' || tag === 'q') return 'quote';
    return 'p';
  }

  const INTERACTIVE = 'a[href],button,[role=button],input[type=submit],input[type=button],summary';
  const isInteractive = (el, cs) => safe(() => el.matches(INTERACTIVE), false) || cs.cursor === 'pointer';
  const TEXT_INPUT =
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=range]):not([type=color]):not([type=file]):not([type=image]):not([type=reset]),textarea,select';

  const transparent = (c) => !c || c.a === 0;

  function paintOf(cs) {
    const bgi = cs.backgroundImage;
    if (bgi && bgi !== 'none' && bgi.includes('gradient(')) return bgi;
    const c = normColor(cs.backgroundColor);
    return transparent(c) ? 'transparent' : c.css;
  }

  // { border: '1px solid #ccc' } quando os 4 lados são iguais; senão só os lados que têm borda (border-bottom…)
  function borderOf(cs) {
    const names = ['top', 'right', 'bottom', 'left'];
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => {
      const w = parseFloat(cs[`border${s}Width`]);
      const style = cs[`border${s}Style`];
      if (!(w > 0) || style === 'none' || style === 'hidden') return 'none';
      const c = normColor(cs[`border${s}Color`]);
      return `${round(w, 2)}px ${style} ${c ? c.css : cs[`border${s}Color`]}`;
    });
    if (sides.every((s) => s === sides[0])) return { border: sides[0] };
    const out = {};
    sides.forEach((v, i) => {
      if (v !== 'none') out[`border-${names[i]}`] = v;
    });
    return out;
  }

  const box4 = (cs, prop) => {
    const v = ['Top', 'Right', 'Bottom', 'Left'].map((s) => `${round(parseFloat(cs[`${prop}${s}`]) || 0, 1)}px`);
    if (v.every((x) => x === v[0])) return v[0];
    if (v[0] === v[2] && v[1] === v[3]) return `${v[0]} ${v[1]}`;
    return v.join(' ');
  };

  function transitionOf(cs) {
    if (!cs.transitionDuration || cs.transitionDuration === '0s') return 'none';
    const props = splitTop(cs.transitionProperty);
    const durs = splitTop(cs.transitionDuration);
    const eases = splitTop(cs.transitionTimingFunction);
    return props
      .map((p, i) => `${p} ${durs[i % durs.length]} ${eases[i % eases.length]}`)
      .filter((t) => !/ 0s /.test(` ${t} `))
      .slice(0, 4)
      .join(', ');
  }

  function typeOf(cs) {
    return {
      'font-family': firstFamily(cs.fontFamily),
      'font-size': cs.fontSize,
      'font-weight': cs.fontWeight,
      'line-height': cs.lineHeight,
      'letter-spacing': cs.letterSpacing,
      'text-transform': cs.textTransform,
    };
  }

  function signature(kind, el, cs, rect) {
    const color = normColor(cs.color);
    const sig = {
      background: paintOf(cs),
      color: color ? color.css : cs.color,
      ...borderOf(cs),
      'border-radius': cs.borderTopLeftRadius,
      padding: box4(cs, 'padding'),
      ...typeOf(cs),
      'box-shadow': cs.boxShadow,
      transition: transitionOf(cs),
    };
    if (kind === 'button' || kind === 'input') sig.height = `${Math.round(rect.height)}px`;
    if (kind === 'link') {
      return {
        color: sig.color,
        'text-decoration': cs.textDecorationLine,
        'font-weight': cs.fontWeight,
        'text-underline-offset': cs.textUnderlineOffset,
        transition: sig.transition,
      };
    }
    if (kind === 'card') {
      return {
        background: sig.background, ...borderOf(cs), 'border-radius': sig['border-radius'], padding: sig.padding,
        'box-shadow': sig['box-shadow'], 'backdrop-filter': cs.backdropFilter || 'none', transition: sig.transition,
      };
    }
    if (kind === 'input') {
      const ph = safe(() => normColor(getComputedStyle(el, '::placeholder').color));
      sig['placeholder-color'] = ph ? ph.css : '';
    }
    return sig;
  }

  function addComponent(map, sig, el) {
    const key = JSON.stringify(sig);
    let e = map.get(key);
    if (!e) map.set(key, (e = { css: sig, count: 0, sample: '', example: describe(el), el }));
    e.count++;
    if (!e.sample) e.sample = (el.value || el.placeholder || sampleText(el) || '').slice(0, 40);
  }

  function looksLikeButton(el, cs, rect) {
    if (rect.width > 520 || rect.height > 110 || rect.height < 18) return false;
    if (safe(() => el.matches('button,[role=button],input[type=submit],input[type=button]'), false)) return true;
    // muitos design systems usam altura fixa e só padding lateral (height: 40px; padding: 0 16px)
    const padded = Math.max(parseFloat(cs.paddingLeft) || 0, parseFloat(cs.paddingRight) || 0) >= 8 || parseFloat(cs.paddingTop) >= 3;
    const filled = !transparent(normColor(cs.backgroundColor)) || cs.backgroundImage.includes('gradient(');
    const bordered = ['Top', 'Right', 'Bottom', 'Left'].every((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
    return padded && (filled || bordered) && cs.display !== 'inline';
  }

  function looksLikeCard(el, cs, rect) {
    if (rect.width < 160 || rect.width > 900 || rect.height < 80 || el.children.length < 2) return false;
    if (!(parseFloat(cs.borderTopLeftRadius) > 0)) return false;
    const pad = Math.max(parseFloat(cs.paddingTop) || 0, parseFloat(cs.paddingLeft) || 0);
    if (pad < 8) return false;
    const bg = normColor(cs.backgroundColor);
    const parentBg = el.parentElement ? normColor(getComputedStyle(el.parentElement).backgroundColor) : null;
    const distinctBg = !transparent(bg) && (!parentBg || parentBg.css !== bg.css);
    const bordered = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
    return distinctBg || bordered || cs.boxShadow !== 'none';
  }

  function addColor(S, str, role, weight = 1, extra = null) {
    const c = normColor(str);
    if (transparent(c)) return;
    const key = c.css;
    let e = S.colors.get(key);
    if (!e) {
      S.colors.set(key, (e = {
        hex: c.hex, a: c.a, css: c.css, original: c.original || null, count: 0, text: 0, chars: 0, bg: 0, area: 0,
        border: 0, fill: 0, shadow: 0, gradient: 0, ibg: 0, itext: 0, link: 0,
      }));
    }
    e.count++;
    if (role === 'text') {
      e.text++;
      e.chars += weight;
      if (extra && extra.link) e.link++;
      if (extra && extra.interactive) e.itext++;
    } else if (role === 'bg') {
      e.bg++;
      e.area += (extra && extra.area) || 0;
      if (extra && extra.interactive) e.ibg++;
    } else if (role in e) e[role]++;
  }

  function addImage(S, url, kind, extra = {}) {
    if (!url || url === 'about:blank' || url === location.href) return;
    if (url.startsWith('data:') && (url.length > 3_000_000 || !/^data:image\//.test(url))) return;
    const abs = url.startsWith('data:') || url.startsWith('blob:') ? url : absUrl(url);
    if (!abs) return;
    let e = S.images.get(abs);
    if (!e) S.images.set(abs, (e = { url: abs, kind, count: 0, w: 0, h: 0, alt: '' }));
    e.count++;
    if (extra.w > e.w) e.w = extra.w;
    if (extra.h > e.h) e.h = extra.h;
    if (extra.alt && !e.alt) e.alt = String(extra.alt).slice(0, 120);
  }

  // Parser de srcset da especificação HTML: URL = sequência sem espaço; vírgula só separa fora de parênteses.
  function parseSrcset(set) {
    const out = [];
    const s = String(set || '');
    let i = 0;
    while (i < s.length) {
      while (i < s.length && /[\s,]/.test(s[i])) i++;
      let start = i;
      while (i < s.length && !/\s/.test(s[i])) i++;
      let url = s.slice(start, i);
      let desc = '';
      if (/,+$/.test(url)) url = url.replace(/,+$/, '');
      else {
        start = i;
        let depth = 0;
        while (i < s.length) {
          const ch = s[i];
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          else if (ch === ',' && depth <= 0) break;
          i++;
        }
        desc = s.slice(start, i).trim();
        i++;
      }
      if (url) out.push({ url, desc });
    }
    return out;
  }

  function largestSrcset(srcset) {
    let best = null;
    let bestScore = -1;
    for (const { url, desc } of parseSrcset(srcset)) {
      const score = desc ? parseFloat(desc) * (/x$/.test(desc) ? 1000 : 1) : 1;
      if (score > bestScore) {
        best = url;
        bestScore = score;
      }
    }
    return best;
  }

  const urlsIn = (v) => [...String(v).matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/g)].map((m) => m[2]).filter((u) => !u.startsWith('#'));

  function visitAssets(el, cs, S, sampled) {
    const tag = el.localName;
    if (tag === 'img') {
      // uma imagem = um arquivo: a maior resolução do srcset (ou do <source> que o navegador escolheu)
      let best = null;
      const picture = el.parentElement && el.parentElement.localName === 'picture' ? el.parentElement : null;
      if (picture && el.currentSrc) {
        for (const src of picture.querySelectorAll('source')) {
          const set = src.getAttribute('srcset') || '';
          const urls = parseSrcset(set).map((c) => absUrl(c.url));
          if (urls.includes(el.currentSrc)) best = largestSrcset(set);
        }
      }
      best = best || largestSrcset(el.getAttribute('srcset')) || el.currentSrc || el.src;
      addImage(S, best, 'img', { w: el.naturalWidth, h: el.naturalHeight, alt: el.alt });
      if (!el.currentSrc) {
        for (const a of ['data-src', 'data-lazy-src', 'data-original', 'data-srcset']) {
          const v = el.getAttribute(a);
          if (v) addImage(S, a.endsWith('srcset') ? largestSrcset(v) : v, 'img', { alt: el.alt });
        }
      }
    } else if (tag === 'video') {
      const src = el.currentSrc || el.src || safe(() => el.querySelector('source').src);
      const url = src && !src.startsWith('blob:') ? absUrl(src) : null;
      if (url) S.videos.set(url, { url, poster: (el.poster && absUrl(el.poster)) || '' });
      if (el.poster) addImage(S, el.poster, 'poster');
    } else if (tag === 'input' && el.type === 'image') {
      addImage(S, el.src, 'img');
    } else if (/^(lottie-player|dotlottie-player|dotlottie-wc)$/.test(tag)) {
      const src = el.getAttribute('src');
      const url = src && absUrl(src);
      if (url) S.lottie.add(url);
    }
    const lottieSrc = el.getAttribute('data-animation-path') ||
      (el.getAttribute('data-animation-type') === 'lottie' ? el.getAttribute('data-src') : null);
    const lottieUrl = lottieSrc && absUrl(lottieSrc);
    if (lottieUrl) S.lottie.add(lottieUrl);

    const bgi = cs.backgroundImage;
    if (bgi && bgi !== 'none' && bgi.includes('url(')) {
      for (const u of urlsIn(bgi)) addImage(S, u, 'background');
    }
    const mask = cs.maskImage || cs.webkitMaskImage;
    if (mask && mask !== 'none' && mask.includes('url(')) for (const u of urlsIn(mask)) addImage(S, u, 'mask');
    if (sampled) {
      for (const pseudo of ['::before', '::after']) {
        const p = getComputedStyle(el, pseudo);
        if (!p.content || p.content === 'none' || p.content === 'normal') continue;
        for (const v of [p.backgroundImage, p.content, p.maskImage || p.webkitMaskImage]) {
          if (v && v.includes('url(')) for (const u of urlsIn(v)) addImage(S, u, 'pseudo');
        }
      }
    }
  }

  function visitSvg(svg, cs, S) {
    const rect = svg.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    let i = 0;
    for (const shape of svg.querySelectorAll('path,circle,rect,ellipse,polygon,polyline,line,text')) {
      if (++i > 60) break;
      const s = getComputedStyle(shape);
      if (s.fill && s.fill !== 'none' && !s.fill.startsWith('url(')) addColor(S, s.fill, 'fill');
      if (s.stroke && s.stroke !== 'none' && !s.stroke.startsWith('url(') && parseFloat(s.strokeWidth) > 0) addColor(S, s.stroke, 'fill');
    }
    if (S.svgs.size >= 500) return;
    const markup = safe(() => serializeSvg(svg, cs, rect));
    if (!markup || markup.length > 400_000) return;
    let e = S.svgs.get(markup);
    if (!e) S.svgs.set(markup, (e = { markup, name: svgName(svg), w: round(rect.width, 1), h: round(rect.height, 1), count: 0 }));
    e.count++;
  }

  const ATTR_HINT = /^data-(aos|sal|scroll|framer|radix|slot|headlessui|v-|astro|svelte|reactroot|w-id|wf-|wow|lenis|splitting|motion|rive|lottie|swiper|animate|gsap|state|theme|testid)/;

  function visitStyle(el, cs, S, rect) {
    if (cs.visibility === 'hidden' || cs.display === 'contents') return;
    if (rect.width <= 0 && rect.height <= 0) return;
    S.styled++;
    const tag = el.localName;
    const area = Math.min(rect.width * rect.height, 4e6);
    const interactive = isInteractive(el, cs);
    const buttonish = interactive && looksLikeButton(el, cs, rect);
    inc(S.displays, cs.display);
    const chars = directText(el);

    if (chars) addColor(S, cs.color, 'text', chars, { link: tag === 'a', interactive });
    addColor(S, cs.backgroundColor, 'bg', 1, { area, interactive: buttonish });
    const seenBorder = new Set();
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = parseFloat(cs[`border${side}Width`]);
      const st = cs[`border${side}Style`];
      if (!(w > 0) || st === 'none' || st === 'hidden') continue;
      const key = `${round(w, 2)}px ${st}`;
      if (!seenBorder.has(key)) {
        seenBorder.add(key);
        inc(S.borders, key);
      }
      const col = cs[`border${side}Color`];
      if (!seenBorder.has(col)) {
        seenBorder.add(col);
        addColor(S, col, 'border', 1);
      }
    }
    const bgi = cs.backgroundImage;
    if (bgi && bgi !== 'none' && bgi.includes('gradient(')) {
      for (const g of splitTop(bgi)) {
        if (!g.includes('gradient(')) continue;
        inc(S.gradients, g);
        for (const c of colorsIn(g)) addColor(S, c, 'gradient', 1);
      }
    }

    if (chars) {
      const key = [cs.fontFamily, cs.fontSize, cs.fontWeight, cs.lineHeight, cs.letterSpacing, cs.textTransform, cs.fontStyle].join('|');
      let t = S.typo.get(key);
      if (!t) {
        S.typo.set(key, (t = {
          stack: cs.fontFamily, family: firstFamily(cs.fontFamily), size: parseFloat(cs.fontSize),
          weight: parseInt(cs.fontWeight, 10) || 400, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing,
          transform: cs.textTransform, style: cs.fontStyle, count: 0, chars: 0, tags: {}, sample: '',
        }));
      }
      t.count++;
      t.chars += chars;
      const st = semanticTag(el, tag);
      t.tags[st] = (t.tags[st] || 0) + 1;
      if (t.sample.length < 24) {
        const s = sampleText(el);
        if (s.length > t.sample.length) t.sample = s;
      }
      let f = S.families.get(t.family);
      if (!f) S.families.set(t.family, (f = { family: t.family, stack: cs.fontFamily, count: 0, chars: 0, weights: {}, italic: false, tags: {} }));
      f.count++;
      f.chars += chars;
      f.weights[t.weight] = (f.weights[t.weight] || 0) + chars;
      if (cs.fontStyle === 'italic') f.italic = true;
      f.tags[st] = (f.tags[st] || 0) + 1;
    }

    for (const p of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) {
      const v = round(parseFloat(cs[p]), 1);
      if (v > 0 && v <= 256) inc(S.padding, v);
    }
    for (const p of ['marginTop', 'marginRight', 'marginBottom', 'marginLeft']) {
      const v = Math.abs(round(parseFloat(cs[p]), 1));
      if (v > 0 && v <= 200) inc(S.margin, v);
    }
    if (/flex|grid/.test(cs.display)) {
      for (const p of ['rowGap', 'columnGap']) {
        const v = round(parseFloat(cs[p]), 1);
        if (v > 0 && v <= 256) inc(S.gap, v);
      }
    }

    const radii = new Set([cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius]);
    for (const r of radii) if (r && r !== '0px') inc(S.radii, r.split(' ')[0]);

    if (cs.boxShadow !== 'none') {
      inc(S.shadows, cs.boxShadow);
      for (const c of colorsIn(cs.boxShadow)) addColor(S, c, 'shadow', 1);
    }
    if (cs.textShadow !== 'none') inc(S.textShadows, cs.textShadow);
    if (cs.filter !== 'none') inc(S.filters, cs.filter);
    const bdf = cs.backdropFilter || cs.webkitBackdropFilter;
    if (bdf && bdf !== 'none') inc(S.backdrops, bdf);
    const mw = parseFloat(cs.maxWidth);
    if (mw >= 320 && mw <= 2560) inc(S.maxWidths, Math.round(mw));

    // movimento
    if (cs.transitionDuration && cs.transitionDuration !== '0s') {
      const props = splitTop(cs.transitionProperty);
      const durs = splitTop(cs.transitionDuration);
      const eases = splitTop(cs.transitionTimingFunction);
      const delays = splitTop(cs.transitionDelay);
      props.forEach((p, i) => {
        const d = timeMs(durs[i % durs.length]);
        if (d) inc(S.transitions, [p, d, eases[i % eases.length], timeMs(delays[i % delays.length])].join('|'));
      });
    }
    if (cs.animationName && cs.animationName !== 'none') {
      const names = splitTop(cs.animationName);
      const pick = (v, i) => {
        const arr = splitTop(v || '');
        return arr.length ? arr[i % arr.length] : '';
      };
      names.forEach((n, i) => {
        if (n === 'none') return;
        const key = [
          n, timeMs(pick(cs.animationDuration, i)), pick(cs.animationTimingFunction, i), timeMs(pick(cs.animationDelay, i)),
          pick(cs.animationIterationCount, i), pick(cs.animationDirection, i), pick(cs.animationFillMode, i),
          pick(cs.animationTimeline, i) || 'auto',
        ].join('|');
        let a = S.animations.get(key);
        if (!a) S.animations.set(key, (a = { count: 0, example: describe(el) }));
        a.count++;
      });
    }

    // componentes recorrentes
    if (buttonish) addComponent(S.buttons, signature('button', el, cs, rect), el);
    else if (tag === 'a' && chars) addComponent(S.links, signature('link', el, cs, rect), el);
    if (safe(() => el.matches(TEXT_INPUT), false)) addComponent(S.inputs, signature('input', el, cs, rect), el);
    else if (looksLikeCard(el, cs, rect)) addComponent(S.cards, signature('card', el, cs, rect), el);

    for (const a of el.attributes) {
      const m = ATTR_HINT.exec(a.name);
      if (m) S.attrs.add(m[1]);
    }
    if (S.classes.length < 5000) for (const c of classAttr(el).split(/\s+/)) if (c) S.classes.push(c);
  }

  function walk(limit) {
    const S = {
      colors: new Map(), gradients: new Map(), typo: new Map(), families: new Map(),
      padding: new Map(), margin: new Map(), gap: new Map(), radii: new Map(), shadows: new Map(),
      textShadows: new Map(), filters: new Map(), backdrops: new Map(), borders: new Map(), maxWidths: new Map(),
      displays: new Map(), transitions: new Map(), animations: new Map(),
      buttons: new Map(), inputs: new Map(), cards: new Map(), links: new Map(),
      images: new Map(), svgs: new Map(), videos: new Map(), lottie: new Set(),
      shadowRoots: [], attrs: new Set(), classes: [], visited: 0, styled: 0, total: 0,
    };
    S.total = document.getElementsByTagName('*').length;
    const stride = Math.max(1, Math.ceil(S.total / limit));
    S.stride = stride;
    const stack = [document.documentElement];
    const getRoot = chrome.dom && chrome.dom.openOrClosedShadowRoot ? (el) => chrome.dom.openOrClosedShadowRoot(el) : null;
    let i = 0;
    while (stack.length) {
      const el = stack.pop();
      if (!el || SKIP.has(el.localName) || (el.hasAttribute && el.hasAttribute(UI_ATTR))) continue;
      S.visited++;
      const cs = safe(() => getComputedStyle(el));
      if (!cs || cs.display === 'none') continue;
      const sampled = i++ % stride === 0;
      visitAssets(el, cs, S, sampled);
      if (sampled) visitStyle(el, cs, S, el.getBoundingClientRect());
      if (el.localName === 'svg') {
        visitSvg(el, cs, S);
        continue;
      }
      const kids = el.children;
      for (let k = kids.length - 1; k >= 0; k--) stack.push(kids[k]);
      const sr = el.shadowRoot || (getRoot && el.localName.includes('-') ? safe(() => getRoot(el)) : null);
      if (sr) {
        S.shadowRoots.push(sr);
        for (let k = sr.children.length - 1; k >= 0; k--) stack.push(sr.children[k]);
      }
    }
    return S;
  }

  // ---------------------------------------------------------------- variáveis CSS
  const DARK_SEL = /(\.dark\b|\.dark-mode\b|\.theme-dark\b|\[data-(?:theme|mode|color-scheme|bs-theme|color-mode)=["']?dark|\[class~=["']?dark)/;

  function varScope(selector, media) {
    const sel = selector.toLowerCase().replace(/:not\([^)]*\)/g, '');
    const parts = splitTop(sel);
    const darkMedia = /prefers-color-scheme:\s*dark/.test(media);
    const lightMedia = /prefers-color-scheme:\s*light/.test(media);
    const rootLike = (p) => /^(:root|html|body|:host)(\[[^\]]*\]|:[a-z-]+(\([^)]*\))?|\.[\w-]+)*$/.test(p) || /^(\.dark|\.light|\[data-[\w-]+=["']?[\w-]+["']?\]|\.theme-[\w-]+)$/.test(p);
    const plainMedia = !media || /^(screen|all)?$/.test(media.trim());
    if (parts.some((p) => DARK_SEL.test(p) && (rootLike(p) || /^(html|:root|body)?\s*\.dark$/.test(p)))) return 'dark';
    if (darkMedia && parts.some(rootLike)) return 'dark';
    if (parts.some(rootLike) && (plainMedia || lightMedia)) return 'root';
    return 'other';
  }

  function varType(name, value) {
    const v = value.trim();
    const n = name.toLowerCase();
    if (!v) return { type: 'empty' };
    if (/^-?[\d.]+m?s$/.test(v)) return { type: 'duration' };
    if (/^(cubic-bezier|steps|linear)\(|^(ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)$/.test(v)) return { type: 'easing' };
    if (/^[\d.]+(deg)?\s+[\d.]+%\s+[\d.]+%(\s*\/\s*[\d.]+%?)?$/.test(v)) {
      const c = normColor(`hsl(${v})`);
      if (c) return { type: 'color', color: c, channels: 'hsl' };
    }
    if (/rgb/.test(n) && /^\d{1,3}[\s,]+\d{1,3}[\s,]+\d{1,3}$/.test(v)) {
      const c = normColor(`rgb(${v.replace(/[\s,]+/g, ', ')})`);
      if (c) return { type: 'color', color: c, channels: 'rgb' };
    }
    if (!/^-?[\d.]/.test(v)) {
      const c = normColor(v);
      if (c) return { type: 'color', color: c };
    }
    if (/gradient\(/.test(v)) return { type: 'gradient' };
    if (/shadow/.test(n) && /\d/.test(v)) return { type: 'shadow' };
    if (/(font|family|typeface)/.test(n) && /[a-z]/i.test(v) && !/^-?[\d.]/.test(v)) return { type: 'fontFamily' };
    if (/^-?[\d.]+(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|svh|dvh|lvh)$/.test(v) || /^(clamp|min|max|calc)\(/.test(v)) return { type: 'dimension' };
    if (/^-?[\d.]+$/.test(v)) return { type: 'number' };
    return { type: 'other' };
  }

  function variables(css) {
    const rootMap = new Map();
    const darkMap = new Map();
    const entries = [];
    for (const v of css.vars) {
      if (v.name.startsWith('--tw-')) continue; // internas do Tailwind
      const scope = varScope(v.selector, v.media || '');
      if (scope === 'other') continue;
      (scope === 'dark' ? darkMap : rootMap).set(v.name, v.value);
      entries.push({ ...v, scope });
    }
    const out = new Map();
    const resolve = (val, maps) => resolveVarsWith(val, (name) => {
      for (const m of maps) if (m.has(name)) return m.get(name);
      return '';
    });
    for (const e of entries) {
      const resolved = e.scope === 'dark' ? resolve(e.value, [darkMap, rootMap]) : resolve(e.value, [rootMap]);
      const t = varType(e.name, resolved);
      const key = `${e.scope}|${e.name}`;
      out.set(key, {
        name: e.name, scope: e.scope, value: e.value, resolved, type: t.type,
        color: t.color ? { hex: t.color.hex, a: t.color.a, css: t.color.css } : null, channels: t.channels || null,
        used: css.referenced.has(e.name),
      });
    }
    return [...out.values()].slice(0, 2500);
  }

  // ---------------------------------------------------------------- breakpoints
  function breakpoints(media) {
    const map = new Map();
    const add = (type, num, unit, n) => {
      let v = parseFloat(num) * (unit === 'px' ? 1 : 16);
      if (type === 'max') v = Number.isInteger(v) && (v + 1) % 8 === 0 ? v + 1 : Number.isInteger(v) ? v : Math.ceil(v);
      v = Math.round(v);
      if (v < 240 || v > 3000) return;
      map.set(v, (map.get(v) || 0) + n);
    };
    for (const [cond, n] of media) {
      if (/print/.test(cond) && !/screen/.test(cond)) continue;
      for (const m of cond.matchAll(/\((min|max)-width\s*:\s*([\d.]+)(px|em|rem)\s*\)/g)) add(m[1], m[2], m[3], n);
      for (const m of cond.matchAll(/width\s*(>=|>|<=|<)\s*([\d.]+)(px|em|rem)/g)) add(m[1][0] === '>' ? 'min' : 'max', m[2], m[3], n);
      for (const m of cond.matchAll(/([\d.]+)(px|em|rem)\s*(<=|<|>=|>)\s*width/g)) add(m[3][0] === '<' ? 'min' : 'max', m[1], m[2], n);
    }
    return [...map].map(([px, count]) => ({ px, count })).sort((a, b) => a.px - b.px);
  }

  // ---------------------------------------------------------------- animações em execução
  function runningAnimations() {
    const out = [];
    const list = safe(() => document.getAnimations(), []);
    for (const a of list.slice(0, 400)) {
      try {
        const eff = a.effect;
        const target = eff && eff.target;
        if (target && target.closest && target.closest(`[${UI_ATTR}]`)) continue;
        const t = eff ? eff.getTiming() : {};
        const base = {
          target: target ? describe(target) : null,
          duration: typeof t.duration === 'number' ? Math.round(t.duration) : 0,
          delay: Math.round(t.delay || 0),
          iterations: t.iterations === Infinity ? 'infinite' : t.iterations,
          easing: t.easing,
          direction: t.direction,
          fill: t.fill,
        };
        if (typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation) out.push({ kind: 'css', name: a.animationName, ...base });
        else if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) out.push({ kind: 'transition', property: a.transitionProperty, ...base });
        else {
          const frames = eff && eff.getKeyframes ? eff.getKeyframes() : [];
          out.push({
            kind: 'waapi',
            keyframes: frames.slice(0, 30).map((f) => {
              const o = { offset: round(f.computedOffset != null ? f.computedOffset : f.offset || 0, 4) };
              if (f.easing && f.easing !== 'linear') o.easing = f.easing;
              for (const k of Object.keys(f)) {
                if (!['offset', 'computedOffset', 'easing', 'composite'].includes(k) && f[k] != null) o[kebab(k)] = String(f[k]);
              }
              return o;
            }),
            ...base,
          });
        }
      } catch {
        /* animação já terminou */
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- bibliotecas e stack (sinais do DOM)
  function detectStack(S, css, vars) {
    const found = [];
    const scripts = [...document.scripts].map((s) => s.src).filter(Boolean);
    const html = document.documentElement;
    const has = (sel) => safe(() => !!document.querySelector(sel), false);
    const src = (re) => scripts.find((u) => re.test(u));
    const add = (name, kind, evidence) => found.push({ name, kind, evidence });
    const gen = (safe(() => document.querySelector('meta[name="generator" i]').content, '') || '').toLowerCase();
    const varNames = new Set(css.vars.map((v) => v.name.split('-').slice(0, 3).join('-')));
    const anyVar = (prefix) => css.vars.some((v) => v.name.startsWith(prefix));

    if (has('#__next') || src(/\/_next\//)) add('Next.js', 'framework', '#__next / _next');
    if (has('#__nuxt') || src(/\/_nuxt\//)) add('Nuxt', 'framework', '#__nuxt');
    if (has('#___gatsby')) add('Gatsby', 'framework', '#___gatsby');
    if (src(/\/_app\/immutable\//)) add('SvelteKit', 'framework', '_app/immutable');
    if (has('astro-island') || S.attrs.has('astro')) add('Astro', 'framework', 'astro-island');
    if (S.attrs.has('v-')) add('Vue', 'framework', 'data-v-*');
    if (S.attrs.has('reactroot') || has('[data-reactroot]')) add('React', 'framework', 'data-reactroot');
    if (gen.includes('webflow') || html.hasAttribute('data-wf-site') || S.attrs.has('wf-')) add('Webflow', 'builder', 'data-wf-site');
    if (gen.includes('framer') || S.attrs.has('framer')) add('Framer', 'builder', 'data-framer-*');
    if (gen.includes('wordpress') || src(/wp-content|wp-includes/)) add('WordPress', 'builder', 'wp-content');
    if (gen.includes('wix') || src(/parastorage\.com/)) add('Wix', 'builder', 'parastorage');
    if (gen.includes('squarespace')) add('Squarespace', 'builder', 'meta generator');
    if (src(/cdn\.shopify\.com/)) add('Shopify', 'builder', 'cdn.shopify.com');

    const tw = S.classes.filter((c) => /^(?:[a-z0-9-]+:)*-?(?:p[trblxy]?|m[trblxy]?|w|h|size|min-w|max-w|min-h|text|bg|border|rounded|shadow|gap|space-[xy]|items|justify|font|leading|tracking|z|top|left|right|bottom|inset|opacity|translate|scale|rotate|duration|ease|grid-cols|col-span|flex)-[\w./[\]%#:-]+$/.test(c)).length;
    if (anyVar('--tw-') || (tw > 40 && tw / Math.max(1, S.classes.length) > 0.2)) add('Tailwind CSS', 'css', `${tw} classes utilitárias`);
    if (anyVar('--bs-') || S.classes.some((c) => /^(col-(sm|md|lg|xl)-\d+|btn-primary|container-fluid)$/.test(c))) add('Bootstrap', 'css', '--bs-* / classes');
    if (S.classes.some((c) => /^Mui[A-Z]/.test(c))) add('Material UI', 'css', 'classes Mui*');
    if (anyVar('--chakra-')) add('Chakra UI', 'css', '--chakra-*');
    if (anyVar('--mantine-')) add('Mantine', 'css', '--mantine-*');
    if (S.attrs.has('radix')) add('Radix UI', 'ui', 'data-radix-*');
    if (S.attrs.has('slot') && (varNames.has('--radius') || anyVar('--primary'))) add('shadcn/ui', 'ui', 'data-slot + --primary');
    if (S.attrs.has('headlessui')) add('Headless UI', 'ui', 'data-headlessui-*');

    if (src(/gsap|tweenmax|greensock/i)) add('GSAP', 'motion', 'script gsap');
    if (src(/scrolltrigger/i)) add('ScrollTrigger', 'motion', 'script ScrollTrigger');
    if (S.attrs.has('aos') || src(/\baos(\.min)?\.js/i)) add('AOS', 'motion', 'data-aos');
    if (html.classList.contains('lenis') || src(/lenis/i) || S.attrs.has('lenis')) add('Lenis', 'motion', 'html.lenis');
    if (has('[data-scroll-container]')) add('Locomotive Scroll', 'motion', 'data-scroll-container');
    if (S.lottie.size || has('lottie-player,dotlottie-player,dotlottie-wc') || src(/lottie|bodymovin/i)) add('Lottie', 'motion', 'player/arquivo .json');
    if (has('.swiper,.swiper-container')) add('Swiper', 'ui', '.swiper');
    if (has('.splide')) add('Splide', 'ui', '.splide');
    if (has('.slick-slider')) add('Slick', 'ui', '.slick-slider');
    if (has('.embla,[class*="embla"]')) add('Embla Carousel', 'ui', '.embla');
    if (src(/three(\.module)?(\.min)?\.js|\/three@|three\.core/i)) add('Three.js', 'motion', 'script three');
    if (has('spline-viewer') || src(/splinetool|spline\.design/i)) add('Spline', 'motion', 'spline-viewer');
    if (S.attrs.has('rive') || src(/rive\.?(app|wasm)|@rive-app/i)) add('Rive', 'motion', 'rive');
    if (S.attrs.has('w-id')) add('Webflow Interactions', 'motion', 'data-w-id');
    if (S.classes.some((c) => c.startsWith('animate__'))) add('Animate.css', 'motion', 'animate__*');
    if (S.classes.includes('wow')) add('WOW.js', 'motion', '.wow');
    if (S.attrs.has('sal')) add('Sal.js', 'motion', 'data-sal');
    if (S.attrs.has('splitting')) add('Splitting.js', 'motion', 'data-splitting');

    if (has('svg.lucide,[class*="lucide-"]')) add('Lucide', 'icons', 'svg.lucide');
    if (S.classes.some((c) => /^fa-[a-z]/.test(c))) add('Font Awesome', 'icons', 'fa-*');
    if (has('.material-icons,.material-symbols-outlined,.material-symbols-rounded')) add('Material Symbols', 'icons', '.material-symbols');
    if (has('iconify-icon,.iconify')) add('Iconify', 'icons', 'iconify');
    if (vars.some((v) => v.name === '--radius') && vars.some((v) => v.name === '--ring')) add('Tokens no padrão shadcn', 'css', '--radius/--ring');
    return found;
  }

  function resources(S) {
    const extra = { rive: new Set(), models: new Set(), fontFiles: new Set() };
    for (const e of safe(() => performance.getEntriesByType('resource'), [])) {
      const u = e.name;
      if (/\.lottie(\?|$)/i.test(u) || (/\.json(\?|$)/i.test(u) && /lottie|bodymovin|animation/i.test(u))) S.lottie.add(u);
      else if (/\.riv(\?|$)/i.test(u)) extra.rive.add(u);
      else if (/\.(glb|gltf)(\?|$)/i.test(u)) extra.models.add(u);
      else if (/\.(mp4|webm|mov)(\?|$)/i.test(u) && !S.videos.has(u)) S.videos.set(u, { url: u, poster: '' });
      else if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u)) extra.fontFiles.add(u);
    }
    return extra;
  }

  function metaContent(sel) {
    return safe(() => document.querySelector(sel).getAttribute('content'), '') || '';
  }

  function pageImages(S) {
    for (const l of document.querySelectorAll('link[rel~="icon" i],link[rel="apple-touch-icon" i],link[rel="mask-icon" i]')) {
      if (l.href) addImage(S, l.href, 'favicon');
    }
    for (const sel of ['meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[property="og:image:secure_url"]']) {
      const v = metaContent(sel);
      if (v) addImage(S, v, 'og');
    }
  }

  // ---------------------------------------------------------------- extração principal
  const toList = (map, keyName = 'value') => [...map].map(([k, count]) => ({ [keyName]: k, count })).sort((a, b) => b.count - a.count);

  D.extract = async (opts = {}) => {
    const t0 = performance.now();
    fetchBudget = 0;
    progress('Lendo o DOM…');
    const S = walk(opts.limit || 12000);
    const t1 = performance.now();
    progress('Lendo as folhas de estilo…');
    const css = await readSheets(S.shadowRoots);
    D.css = css; // reaproveitado pela captura de componentes
    const t2 = performance.now();
    pageImages(S);
    const extra = resources(S);
    const vars = variables(css);

    const loaded = new Set();
    for (const f of safe(() => [...document.fonts], [])) {
      if (f.status === 'loaded') loaded.add(`${f.family.replace(/^["']|["']$/g, '')}|${f.weight}|${f.style}`);
    }

    const component = (map, n) =>
      [...map.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, n)
        .map((c) => {
          const states = safe(() => stateDecls(c.el, css), {});
          return { css: c.css, count: c.count, sample: c.sample, example: c.example, states };
        });

    const root = getComputedStyle(document.documentElement);
    const body = document.body ? getComputedStyle(document.body) : root;
    const bgBody = normColor(body.backgroundColor);
    const bgRoot = normColor(root.backgroundColor);
    const pageBg = !transparent(bgBody) ? bgBody : !transparent(bgRoot) ? bgRoot : null;

    const result = {
      meta: {
        url: location.href,
        title: document.title,
        lang: document.documentElement.lang || '',
        description: metaContent('meta[name="description" i]'),
        themeColor: metaContent('meta[name="theme-color" i]'),
        generator: metaContent('meta[name="generator" i]'),
        colorScheme: root.colorScheme || 'normal',
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        rootFontSize: parseFloat(root.fontSize) || 16,
        pageBackground: pageBg ? pageBg.css : null,
        bodyColor: (normColor(body.color) || {}).css || null,
        bodyFont: firstFamily(body.fontFamily),
        counts: { total: S.total, visited: S.visited, styled: S.styled, stride: S.stride },
        sheets: { total: css.total, blocked: css.blocked.slice(0, 50), imports: [...new Set(css.imports)].slice(0, 50) },
        ms: { dom: Math.round(t1 - t0), css: Math.round(t2 - t1) },
      },
      colors: [...S.colors.values()].sort((a, b) => b.count - a.count).slice(0, 400),
      gradients: toList(S.gradients, 'css').slice(0, 60),
      typography: [...S.typo.values()].sort((a, b) => b.chars - a.chars).slice(0, 80),
      families: [...S.families.values()].sort((a, b) => b.chars - a.chars).slice(0, 20),
      fontFaces: css.fontFaces.slice(0, 400).map((f) => ({ ...f, loaded: loaded.has(`${f.family}|${f.weight}|${f.style}`) })),
      fontFiles: [...extra.fontFiles].slice(0, 200),
      spacing: { padding: toList(S.padding, 'px'), margin: toList(S.margin, 'px'), gap: toList(S.gap, 'px') },
      radii: toList(S.radii).slice(0, 40),
      shadows: toList(S.shadows).slice(0, 40),
      textShadows: toList(S.textShadows).slice(0, 20),
      filters: toList(S.filters).slice(0, 20),
      backdrops: toList(S.backdrops).slice(0, 20),
      borders: toList(S.borders).slice(0, 20),
      maxWidths: toList(S.maxWidths, 'px').slice(0, 20),
      displays: toList(S.displays).slice(0, 12),
      breakpoints: breakpoints(css.media),
      containerQueries: css.container,
      variables: vars,
      properties: css.properties.slice(0, 100),
      keyframes: [...css.keyframes].map(([name, text]) => ({ name, css: text })).slice(0, 200),
      transitions: toList(S.transitions, 'key').slice(0, 80).map(({ key, count }) => {
        const [property, durationMs, easing, delayMs] = key.split('|');
        return { property, durationMs: +durationMs, easing, delayMs: +delayMs, count };
      }),
      animations: [...S.animations].map(([key, v]) => {
        const [name, durationMs, easing, delayMs, iterations, direction, fillMode, timeline] = key.split('|');
        return { name, durationMs: +durationMs, easing, delayMs: +delayMs, iterations, direction, fillMode, timeline, count: v.count, example: v.example };
      }).sort((a, b) => b.count - a.count).slice(0, 80),
      running: runningAnimations(),
      components: {
        buttons: component(S.buttons, 6),
        inputs: component(S.inputs, 4),
        cards: component(S.cards, 4),
        links: component(S.links, 4),
      },
      assets: {
        images: [...S.images.values()].slice(0, 1500),
        svgs: [...S.svgs.values()].sort((a, b) => b.count - a.count).slice(0, 500),
        videos: [...S.videos.values()].slice(0, 60),
        lottie: [...S.lottie].filter(Boolean).slice(0, 60),
        rive: [...extra.rive].slice(0, 30),
        models: [...extra.models].slice(0, 30),
      },
      stack: detectStack(S, css, vars),
    };
    result.meta.ms.total = Math.round(performance.now() - t0);
    return result;
  };

  // ---------------------------------------------------------------- varredura com rolagem (reveals)
  function parseTransform(t) {
    const out = { tx: 0, ty: 0, sx: 1, sy: 1, rot: 0 };
    if (!t || t === 'none') return out;
    let m = /^matrix\(([^)]+)\)$/.exec(t);
    if (m) {
      const [a, b, c, d, e, f] = m[1].split(',').map(Number);
      return { tx: e, ty: f, sx: Math.hypot(a, b), sy: Math.hypot(c, d), rot: (Math.atan2(b, a) * 180) / Math.PI };
    }
    m = /^matrix3d\(([^)]+)\)$/.exec(t);
    if (m) {
      const v = m[1].split(',').map(Number);
      return { tx: v[12], ty: v[13], sx: Math.hypot(v[0], v[1]), sy: Math.hypot(v[4], v[5]), rot: (Math.atan2(v[1], v[0]) * 180) / Math.PI };
    }
    return out;
  }

  function motionState(cs) {
    const t = parseTransform(cs.transform);
    if (cs.translate && cs.translate !== 'none') {
      const [x, y] = cs.translate.split(/\s+/).map((v) => parseFloat(v) || 0);
      t.tx += x || 0;
      t.ty += y || 0;
    }
    if (cs.scale && cs.scale !== 'none') {
      const [x, y] = cs.scale.split(/\s+/).map(Number);
      t.sx *= x;
      t.sy *= y == null || Number.isNaN(y) ? x : y;
    }
    if (cs.rotate && cs.rotate !== 'none') t.rot += parseFloat(cs.rotate) || 0;
    const blur = /blur\(([\d.]+)px\)/.exec(cs.filter || '');
    return {
      opacity: round(parseFloat(cs.opacity), 3),
      tx: round(t.tx, 1), ty: round(t.ty, 1), sx: round(t.sx, 3), sy: round(t.sy, 3), rot: round(t.rot, 1),
      blur: blur ? +blur[1] : 0,
      clip: cs.clipPath && cs.clipPath !== 'none' ? cs.clipPath : 'none',
    };
  }

  const looksHidden = (s) =>
    s.opacity < 0.98 || Math.abs(s.tx) > 2 || Math.abs(s.ty) > 2 || Math.abs(s.sx - 1) > 0.01 || s.blur > 0 || s.clip !== 'none' || Math.abs(s.rot) > 1;

  const revealHint = (el) =>
    el.hasAttribute('data-aos') || el.hasAttribute('data-sal') || el.hasAttribute('data-animate') ||
    el.hasAttribute('data-scroll') || /(^|\s)(wow|reveal|aos-|animate__|fade|sr-|in-view)/.test(classAttr(el));

  const revealScore = (s) => s.opacity - Math.abs(s.ty) / 200 - Math.abs(s.tx) / 200 - Math.abs(1 - s.sx) - s.blur / 20;

  function classify(from, to) {
    const dy = from.ty - to.ty;
    const dx = from.tx - to.tx;
    const fade = from.opacity < to.opacity - 0.2;
    if (Math.abs(dy) >= 6 && Math.abs(dy) >= Math.abs(dx)) return `${fade ? 'fade' : 'slide'}-${dy > 0 ? 'up' : 'down'}`;
    if (Math.abs(dx) >= 6) return `${fade ? 'fade' : 'slide'}-${dx > 0 ? 'left' : 'right'}`;
    if (from.sx < to.sx - 0.02) return fade ? 'zoom-in' : 'scale-up';
    if (from.sx > to.sx + 0.02) return fade ? 'zoom-out' : 'scale-down';
    if (from.blur > to.blur) return 'blur-in';
    if (from.clip !== to.clip) return 'clip-reveal';
    if (Math.abs(from.rot - to.rot) >= 3) return 'rotate-in';
    if (fade) return 'fade-in';
    return null;
  }

  function pickScroller() {
    const se = document.scrollingElement || document.documentElement;
    if (se.scrollHeight > innerHeight + 80) return { el: null, max: se.scrollHeight - innerHeight };
    let best = null;
    for (const el of document.querySelectorAll('body *')) {
      if (el.scrollHeight - el.clientHeight < 200 || el.clientHeight < innerHeight * 0.5) continue;
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && (!best || el.scrollHeight > best.scrollHeight)) best = el;
    }
    return best ? { el: best, max: best.scrollHeight - best.clientHeight } : { el: null, max: 0 };
  }

  D.scrollScan = async ({ steps = 24, delay = 260 } = {}) => {
    const scroller = pickScroller();
    const getY = () => (scroller.el ? scroller.el.scrollTop : scrollY);
    const setY = (y) => (scroller.el ? (scroller.el.scrollTop = y) : scrollTo({ top: y, left: scrollX, behavior: 'instant' }));
    const startY = getY();
    const before = new Map();
    const all = document.body ? document.body.getElementsByTagName('*') : [];
    for (let i = 0; i < all.length && before.size < 3000; i++) {
      const el = all[i];
      if (SKIP.has(el.localName) || el.closest(`[${UI_ATTR}]`)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      const s = motionState(cs);
      if (looksHidden(s) || revealHint(el)) before.set(el, s);
    }
    const seen = new Set();
    const best = new Map();
    const touched = new Map();
    const classAdds = new Map();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) seen.add(e.target);
    }, { threshold: 0.05 });
    before.forEach((_, el) => io.observe(el));
    const mo = new MutationObserver((muts) => {
      const now = performance.now();
      for (const m of muts) {
        const el = m.target;
        if (!before.has(el)) continue;
        if (m.attributeName === 'class') {
          const old = new Set((m.oldValue || '').split(/\s+/));
          const added = [...el.classList].filter((c) => !old.has(c));
          if (added.length) classAdds.set(el, added.slice(0, 3));
        } else {
          const r = touched.get(el) || { first: now, last: now, n: 0 };
          r.last = now;
          r.n++;
          touched.set(el, r);
        }
      }
    });
    mo.observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style'] });
    const anims = new Map();
    const grab = () => {
      for (const a of runningAnimations()) {
        const key = JSON.stringify([a.kind, a.name || a.property || '', a.keyframes || '', a.duration, a.easing]);
        if (!anims.has(key)) anims.set(key, a);
      }
    };
    const sample = () => {
      for (const el of seen) {
        const s = motionState(getComputedStyle(el));
        const prev = best.get(el);
        if (!prev || revealScore(s) >= revealScore(prev)) best.set(el, s);
      }
    };
    try {
      grab();
      for (let i = 1; i <= steps; i++) {
        setY((scroller.max * i) / steps);
        progress(`Rolando a página para pegar animações… ${Math.round((i / steps) * 100)}%`);
        await sleep(delay);
        sample();
        grab();
      }
      await sleep(800);
      sample();
      grab();
    } finally {
      io.disconnect();
      mo.disconnect();
      setY(startY);
    }
    const groups = new Map();
    for (const [el, after] of best) {
      const from = before.get(el);
      if (!from) continue;
      const pattern = classify(from, after);
      if (!pattern) continue;
      const cs = getComputedStyle(el);
      if (/infinite/.test(cs.animationIterationCount)) continue;
      const t = touched.get(el);
      // estilo inline mexido o tempo todo sem mudar a opacidade = marquee/parallax, não reveal
      if (t && t.n > 30 && Math.abs(from.opacity - after.opacity) < 0.2) continue;
      const trigger = classAdds.has(el) ? `classe .${classAdds.get(el).join('.')}` : t ? 'JS (estilo inline)' : cs.animationName !== 'none' ? 'animação CSS' : 'CSS';
      const durationMs = t && t.last > t.first
        ? Math.round(t.last - t.first)
        : timeMs(splitTop(cs.transitionDuration)[0]) || timeMs(splitTop(cs.animationDuration)[0]);
      const easing = cs.transitionDuration !== '0s' ? splitTop(cs.transitionTimingFunction)[0] : cs.animationName !== 'none' ? splitTop(cs.animationTimingFunction)[0] : null;
      const fromKey = [Math.round(from.opacity * 10), Math.round(from.ty / 10), Math.round(from.tx / 10), Math.round(from.sx * 20), from.blur > 0].join(',');
      const key = [pattern, fromKey, trigger.split(' ')[0], Math.round((durationMs || 0) / 150)].join('|');
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { pattern, from, to: after, trigger, durationMs, easing, count: 0, examples: [] }));
      g.count++;
      if (g.examples.length < 3) g.examples.push(describe(el));
    }
    return {
      reveals: [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 14),
      running: [...anims.values()].slice(0, 120),
      scrolled: Math.round(scroller.max),
    };
  };

  // usados por content/capture.js
  D.util = { round, splitTop, normColor, describe, safe, parsedStates, declsFromCss, mediaOk, firstFamily, serializeSvg, readSheets, timeMs, parseSrcset, UI_ATTR, SKIP };

  // Busca binária pedida pelo painel quando o fetch da extensão falha (cookies/Referer da própria página).
  D.fetchAsBase64 = async (url) => {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 40 * 1024 * 1024) throw new Error('arquivo grande demais');
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { base64: btoa(bin), type: res.headers.get('content-type') || '' };
  };
})();
