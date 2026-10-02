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
  const transparent = (c) => !c || c.a === 0;

  function looksLikeButton(el, cs, rect) {
    if (rect.width > 520 || rect.height > 110 || rect.height < 18) return false;
    if (safe(() => el.matches('button,[role=button],input[type=submit],input[type=button]'), false)) return true;
    // muitos design systems usam altura fixa e só padding lateral (height: 40px; padding: 0 16px)
    const padded = Math.max(parseFloat(cs.paddingLeft) || 0, parseFloat(cs.paddingRight) || 0) >= 8 || parseFloat(cs.paddingTop) >= 3;
    const filled = !transparent(normColor(cs.backgroundColor)) || cs.backgroundImage.includes('gradient(');
    const bordered = ['Top', 'Right', 'Bottom', 'Left'].every((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
    return padded && (filled || bordered) && cs.display !== 'inline';
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
  }

  function walk(limit) {
    const S = {
      colors: new Map(), gradients: new Map(), typo: new Map(), families: new Map(),
      padding: new Map(), margin: new Map(), gap: new Map(), radii: new Map(), shadows: new Map(),
      textShadows: new Map(), filters: new Map(), backdrops: new Map(), borders: new Map(), maxWidths: new Map(),
      displays: new Map(), transitions: new Map(), animations: new Map(),
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

  // ---------------------------------------------------------------- meta tags
  function metaContent(sel) {
    return safe(() => document.querySelector(sel).getAttribute('content'), '') || '';
  }

  // ---------------------------------------------------------------- extração principal
  const toList = (map, keyName = 'value') => [...map].map(([k, count]) => ({ [keyName]: k, count })).sort((a, b) => b.count - a.count);

  D.extract = async (opts = {}) => {
    const t0 = performance.now();
    progress('Lendo o DOM…');
    const S = walk(opts.limit || 12000);
    const t1 = performance.now();

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
        ms: { dom: Math.round(t1 - t0) },
      },
      colors: [...S.colors.values()].sort((a, b) => b.count - a.count).slice(0, 400),
      gradients: toList(S.gradients, 'css').slice(0, 60),
      typography: [...S.typo.values()].sort((a, b) => b.chars - a.chars).slice(0, 80),
      families: [...S.families.values()].sort((a, b) => b.chars - a.chars).slice(0, 20),
      spacing: { padding: toList(S.padding, 'px'), margin: toList(S.margin, 'px'), gap: toList(S.gap, 'px') },
      radii: toList(S.radii).slice(0, 40),
      shadows: toList(S.shadows).slice(0, 40),
      textShadows: toList(S.textShadows).slice(0, 20),
      filters: toList(S.filters).slice(0, 20),
      backdrops: toList(S.backdrops).slice(0, 20),
      borders: toList(S.borders).slice(0, 20),
      maxWidths: toList(S.maxWidths, 'px').slice(0, 20),
      displays: toList(S.displays).slice(0, 12),
      transitions: toList(S.transitions, 'key').slice(0, 80).map(({ key, count }) => {
        const [property, durationMs, easing, delayMs] = key.split('|');
        return { property, durationMs: +durationMs, easing, delayMs: +delayMs, count };
      }),
      animations: [...S.animations].map(([key, v]) => {
        const [name, durationMs, easing, delayMs, iterations, direction, fillMode, timeline] = key.split('|');
        return { name, durationMs: +durationMs, easing, delayMs: +delayMs, iterations, direction, fillMode, timeline, count: v.count, example: v.example };
      }).sort((a, b) => b.count - a.count).slice(0, 80),
    };
    result.meta.ms.total = Math.round(performance.now() - t0);
    return result;
  };

})();
