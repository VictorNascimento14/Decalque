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
  const absUrl = (u, base) => safe(() => new URL(u, base || document.baseURI).href);
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

  // Parser de srcset da especificação HTML: URL = sequência sem espaço; vírgula só separa fora de parênteses.
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
  }

  function walk(limit) {
    const S = {
      colors: new Map(), gradients: new Map(), typo: new Map(), families: new Map(),
      padding: new Map(), margin: new Map(), gap: new Map(), radii: new Map(), shadows: new Map(),
      textShadows: new Map(), filters: new Map(), backdrops: new Map(), borders: new Map(), maxWidths: new Map(),
      displays: new Map(), transitions: new Map(), animations: new Map(),
      buttons: new Map(), inputs: new Map(), cards: new Map(), links: new Map(),
      shadowRoots: [], visited: 0, styled: 0, total: 0,
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
      if (sampled) visitStyle(el, cs, S, el.getBoundingClientRect());
      if (el.localName === 'svg') continue; // o miolo do SVG não tem estilo de página
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

  // ---------------------------------------------------------------- meta tags
  function metaContent(sel) {
    return safe(() => document.querySelector(sel).getAttribute('content'), '') || '';
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
      components: {
        buttons: component(S.buttons, 6),
        inputs: component(S.inputs, 4),
        cards: component(S.cards, 4),
        links: component(S.links, 4),
      },
    };
    result.meta.ms.total = Math.round(performance.now() - t0);
    return result;
  };

})();
