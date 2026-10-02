/* Decalque — "pinça": escolher um elemento na página e capturar HTML + CSS dele.
   Depende de content/extract.js (window.__decalque.util). Mundo isolado. */
(() => {
  'use strict';
  const D = window.__decalque;
  if (!D || !D.util || D.captureVersion === 2) return;
  D.captureVersion = 2;
  const U = D.util;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Propriedades que importam para reproduzir o visual. Sem as lógicas (inline-size etc.), que duplicam as físicas.
  const PROPS = [
    'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float', 'clear', 'box-sizing',
    'min-width', 'min-height', 'max-width', 'max-height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'overflow-x', 'overflow-y', 'aspect-ratio', 'object-fit', 'object-position', 'vertical-align', 'visibility', 'opacity',
    'transform', 'transform-origin', 'translate', 'rotate', 'scale', 'isolation', 'mix-blend-mode', 'filter',
    'backdrop-filter', 'clip-path', 'mask-image', 'mask-size', 'mask-position', 'mask-repeat', 'cursor', 'pointer-events', 'user-select',
    'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'align-self', 'justify-items', 'justify-self',
    'flex-grow', 'flex-shrink', 'flex-basis', 'order', 'row-gap', 'column-gap',
    'grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows',
    'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end',
    'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing', 'text-align',
    'text-transform', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style', 'text-decoration-thickness',
    'text-underline-offset', 'text-indent', 'text-overflow', 'text-shadow', 'white-space', 'word-break', 'overflow-wrap',
    'font-variant-numeric', 'font-feature-settings', 'text-wrap', 'list-style-type', 'list-style-position',
    '-webkit-line-clamp', '-webkit-box-orient', '-webkit-text-fill-color', '-webkit-text-stroke-width', '-webkit-text-stroke-color',
    'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'background-attachment',
    'background-clip', 'background-origin', 'background-blend-mode',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'outline-width', 'outline-style', 'outline-color', 'outline-offset', 'box-shadow',
    'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
    'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count',
    'animation-direction', 'animation-fill-mode', 'animation-play-state', 'animation-timeline',
    'border-collapse', 'border-spacing', 'table-layout',
  ];
  const INHERITED = new Set([
    'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing', 'text-align',
    'text-transform', 'text-indent', 'text-shadow', 'white-space', 'word-break', 'overflow-wrap', 'font-variant-numeric',
    'font-feature-settings', 'text-wrap', 'list-style-type', 'list-style-position', 'cursor', 'visibility', 'pointer-events',
    'border-collapse', 'border-spacing', '-webkit-text-fill-color', '-webkit-text-stroke-width', '-webkit-text-stroke-color',
  ]);
  const DROP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'link', 'meta', 'base', 'title', 'head']);
  const REPLACED = /^(img|video|canvas|iframe|svg|input|textarea|select|object|embed|audio)$/;
  const KEEP_ATTRS = {
    a: ['href', 'target', 'rel'],
    img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading', 'decoding'],
    source: ['src', 'srcset', 'type', 'media', 'sizes'],
    video: ['src', 'poster', 'autoplay', 'muted', 'loop', 'playsinline', 'controls', 'preload'],
    audio: ['src', 'controls'],
    input: ['type', 'placeholder', 'value', 'checked', 'disabled', 'readonly', 'name', 'min', 'max', 'step'],
    textarea: ['placeholder', 'rows', 'disabled', 'readonly'],
    button: ['type', 'disabled'],
    select: ['disabled', 'name'],
    option: ['value', 'selected'],
    label: ['for'],
    iframe: ['src', 'title', 'allow', 'loading'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
    ol: ['start', 'reversed'],
    time: ['datetime'],
    progress: ['value', 'max'],
    meter: ['value', 'min', 'max'],
  };
  const GLOBAL_ATTRS = ['role', 'aria-label', 'aria-hidden', 'title', 'dir', 'lang'];
  const URL_ATTRS = new Set(['href', 'src', 'poster']);

  // ------------------------------------------------------------ estilos padrão (iframe limpo)
  let frame = null;
  const defaults = new Map();
  // O estilo padrão depende de atributos: <a> só é sublinhado com href; <input> muda com o type.
  function variantOf(el) {
    const tag = el.localName;
    if ((tag === 'a' || tag === 'area') && el.hasAttribute('href')) return { tag, attrs: { href: '#' } };
    if (tag === 'input') return { tag, attrs: { type: el.getAttribute('type') || 'text' } };
    return { tag, attrs: {} };
  }

  function defaultsFor(tag, svg = false, attrs = {}) {
    const key = (svg ? 'svg:' : '') + tag + JSON.stringify(attrs);
    if (defaults.has(key)) return defaults.get(key);
    if (!frame || !frame.isConnected) {
      frame = document.createElement('iframe');
      frame.setAttribute(U.UI_ATTR, '');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:800px;border:0;visibility:hidden;pointer-events:none';
      document.documentElement.appendChild(frame);
      const doc = frame.contentDocument;
      try {
        doc.open();
        doc.write('<!doctype html><html><head></head><body></body></html>');
        doc.close();
      } catch {
        /* Trusted Types: segue em modo quirks */
      }
    }
    const doc = frame.contentDocument;
    let el;
    try {
      el = svg ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
    } catch {
      el = doc.createElement('div');
    }
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    (doc.body || doc.documentElement).appendChild(el);
    const cs = frame.contentWindow.getComputedStyle(el);
    const map = {};
    for (const p of PROPS) map[p] = cs.getPropertyValue(p);
    map.width = cs.width;
    el.remove();
    defaults.set(key, map);
    return map;
  }

  function cleanupFrame() {
    if (frame) frame.remove();
    frame = null;
  }

  // ------------------------------------------------------------ cores e valores
  function normValue(prop, v) {
    if (/color$/.test(prop) || prop === 'color' || prop === '-webkit-text-fill-color') {
      const c = U.normColor(v);
      return c ? c.css : v;
    }
    if (/(shadow|background-image|filter)$/.test(prop) && /rgba?\(/.test(v)) {
      return v.replace(/rgba?\([^)]*\)/g, (m) => {
        const c = U.normColor(m);
        return c ? c.css : m;
      });
    }
    return v;
  }

  const num = (v) => parseFloat(v) || 0;

  function declsFor(el, cs, ctx, isRoot) {
    const tag = el.localName;
    const variant = variantOf(el);
    const def = defaultsFor(tag, el.namespaceURI === SVG_NS, variant.attrs);
    const base = defaultsFor('div');
    const pcs = ctx.parentCS;
    const out = [];
    const has = (p, v) => cs.getPropertyValue(p) !== v;
    const positioned = cs.position !== 'static';
    // borda "efetiva" por lado: largura > 0 e estilo visível. Se a página não tem borda num lado mas o
    // padrão da tag tem (ex.: <button>), basta declarar o estilo como none.
    const sideOn = (get, side) => num(get(`border-${side}-width`)) > 0 && !/^(none|hidden)$/.test(get(`border-${side}-style`));
    const pageSide = {};
    const defSide = {};
    for (const side of ['top', 'right', 'bottom', 'left']) {
      pageSide[side] = sideOn((k) => cs.getPropertyValue(k), side);
      defSide[side] = sideOn((k) => def[k], side);
    }
    const flexParent = !isRoot && pcs && /flex|grid/.test(pcs.display);
    const gridParent = !isRoot && pcs && /grid/.test(pcs.display);
    const container = /flex|grid/.test(cs.display);
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p);
      if (!v) continue;
      const uaSets = def[p] !== base[p];
      const side = /^border-(top|right|bottom|left)-style$/.exec(p);
      if (side && !pageSide[side[1]] && defSide[side[1]]) {
        out.push([p, 'none']);
        continue;
      }
      if (INHERITED.has(p)) {
        const ref = isRoot ? def[p] : pcs.getPropertyValue(p);
        if (!uaSets && v === ref) continue;
        if (isRoot && v === def[p]) continue;
      } else if (v === def[p] && !(uaSets && /^(margin|padding)-/.test(p))) continue;
      // relevância por contexto
      if (/^(top|right|bottom|left|z-index)$/.test(p) && !positioned && p !== 'z-index') continue;
      if (p === 'z-index' && v === 'auto') continue;
      if (/^(flex-direction|flex-wrap|justify-content|align-items|align-content|justify-items|row-gap|column-gap)$/.test(p) && !container) continue;
      if (/^grid-(template|auto)/.test(p) && !/grid/.test(cs.display)) continue;
      if (/^grid-(column|row)-/.test(p) && !gridParent) continue;
      if (/^(flex-grow|flex-shrink|flex-basis|order|align-self|justify-self)$/.test(p) && !flexParent) continue;
      if (/^background-(size|position|repeat|attachment|origin|blend-mode)$/.test(p) && cs.backgroundImage === 'none') continue;
      if (/^mask-(size|position|repeat)$/.test(p) && (cs.maskImage || 'none') === 'none') continue;
      if (/^text-decoration-(color|style|thickness)$/.test(p) && cs.textDecorationLine === 'none') continue;
      if (/^outline-(color|offset|width)$/.test(p) && cs.outlineStyle === 'none') continue;
      const border = /^border-(top|right|bottom|left)-(width|style|color)$/.exec(p);
      if (border && !pageSide[border[1]]) {
        if (defSide[border[1]] && border[2] === 'style') out.push([p, 'none']);
        continue;
      }
      if (/^transition-/.test(p) && cs.transitionDuration.split(',').every((d) => d.trim() === '0s')) continue;
      if (/^animation-/.test(p) && cs.animationName === 'none') continue;
      if (/^(object-fit|object-position)$/.test(p) && !/^(img|video)$/.test(tag)) continue;
      if (/^list-style/.test(p) && !/^(li|ul|ol)$/.test(tag)) continue;
      if (/^(border-collapse|border-spacing|table-layout)$/.test(p) && !/^(table)$/.test(tag)) continue;
      if (p === '-webkit-box-orient' && cs.webkitLineClamp === 'none') continue;
      if (p === '-webkit-text-fill-color' && !has('-webkit-text-fill-color', cs.color)) continue;
      if (!relevant(p, v, cs)) continue;
      if (p === 'transform-origin') {
        if (cs.transform === 'none' && cs.rotate === 'none' && cs.scale === 'none') continue;
        const r = el.getBoundingClientRect();
        const [ox, oy] = v.split(' ').map(num);
        if (Math.abs(ox - r.width / 2) < 1 && Math.abs(oy - r.height / 2) < 1) continue;
      }
      out.push([p, normValue(p, v)]);
    }
    return out.concat(sizeDecls(el, cs, ctx, isRoot));
  }

  // Valores que o navegador computa mas que não mudam nada na tela.
  function relevant(p, v, cs) {
    if ((p === 'min-width' || p === 'min-height') && v === 'auto') return false;
    if (p === 'aspect-ratio' && /^auto/.test(v)) return false; // derivado de width/height do <img>, que já vão como atributo
    if (/^outline-/.test(p) && (cs.outlineStyle === 'none' || !(num(cs.outlineWidth) > 0))) return false;
    if (/^-webkit-text-stroke-/.test(p) && !(num(cs.webkitTextStrokeWidth) > 0)) return false;
    if (/^text-decoration-(color|style|thickness)$/.test(p) && cs.textDecorationLine === 'none') return false;
    if (p === 'text-underline-offset' && cs.textDecorationLine === 'none') return false;
    if (p === 'text-wrap' && /^(wrap|nowrap)$/.test(v)) return false; // já vem em white-space
    return true;
  }

  function sizeDecls(el, cs, ctx, isRoot) {
    const tag = el.localName;
    const rect = el.getBoundingClientRect();
    const out = [];
    if (isRoot) {
      out.push(['width', `${U.round(rect.width, 1)}px`], ['max-width', '100%']);
      if (REPLACED.test(tag) || !el.children.length) out.push(['height', `${U.round(rect.height, 1)}px`]);
      return out;
    }
    const empty = !el.children.length && !(el.textContent || '').trim();
    const abs = cs.position === 'absolute' || cs.position === 'fixed';
    const pcs = ctx.parentCS;
    const flexItem = pcs && /flex|grid/.test(pcs.display);
    if (REPLACED.test(tag) || abs || empty) {
      if (cs.width !== 'auto') out.push(['width', cs.width]);
      if (cs.height !== 'auto') out.push(['height', cs.height]);
      return out;
    }
    if (flexItem) {
      if (cs.flexGrow === '0' && cs.flexShrink === '0') out.push(['width', cs.width]);
    } else if (/^(block|flex|grid|table|list-item|flow-root)$/.test(cs.display) && ctx.parentEl) {
      const p = ctx.parentEl;
      const inner = p.clientWidth - num(pcs.paddingLeft) - num(pcs.paddingRight);
      const used = rect.width + num(cs.marginLeft) + num(cs.marginRight);
      if (inner > 0 && Math.abs(used - inner) > 1.5 && cs.maxWidth === 'none') out.push(['width', cs.width]);
    }
    if (cs.overflowY !== 'visible' && cs.overflowY !== 'clip') out.push(['height', cs.height]);
    else if (el.childElementCount <= 3 && !/^(inline|contents)$/.test(cs.display)) {
      // altura fixa (ex.: botão de 40px com padding só lateral): a caixa interna é maior que o conteúdo.
      // ponytail: só em elementos com poucos filhos; em contêineres grandes as margens dos filhos dariam falso positivo.
      const range = document.createRange();
      range.selectNodeContents(el);
      const content = range.getBoundingClientRect().height;
      const inner = rect.height - num(cs.paddingTop) - num(cs.paddingBottom) - num(cs.borderTopWidth) - num(cs.borderBottomWidth);
      const fromMinHeight = cs.minHeight !== 'auto' && num(cs.minHeight) >= rect.height - 1;
      if (content > 0 && inner - content > 2 && !fromMinHeight) out.push(['height', cs.height]);
    }
    return out;
  }

  // Margens laterais iguais num bloco mais estreito que o pai = centralizado com auto.
  function autoMargins(decls, el, cs, ctx) {
    const ml = num(cs.marginLeft);
    const mr = num(cs.marginRight);
    if (!(ml > 0) || Math.abs(ml - mr) > 1 || !ctx.parentEl || /flex|grid/.test(ctx.parentCS.display)) return decls;
    return decls.map(([p, v]) => (p === 'margin-left' || p === 'margin-right' ? [p, 'auto'] : [p, v]));
  }

  function rootFix(decls) {
    const pos = decls.find(([p]) => p === 'position');
    let out = decls.filter(([p]) => !/^margin-/.test(p));
    if (pos && /fixed|absolute|sticky/.test(pos[1])) {
      out = out.filter(([p]) => !/^(top|right|bottom|left|z-index)$/.test(p)).map(([p, v]) => (p === 'position' ? [p, 'relative'] : [p, v]));
    }
    return out;
  }

  function pseudoDecls(el, cs, pseudo) {
    const ps = getComputedStyle(el, pseudo);
    const content = ps.content;
    if (!content || content === 'none' || content === 'normal') return null;
    const def = defaultsFor('span');
    const out = [['content', content]];
    for (const p of PROPS) {
      const v = ps.getPropertyValue(p);
      if (!v) continue;
      if (INHERITED.has(p) ? v === cs.getPropertyValue(p) : v === def[p]) continue;
      if (/^(top|right|bottom|left)$/.test(p) && ps.position === 'static') continue;
      if (/^border-(top|right|bottom|left)-(style|color)$/.test(p) && !(num(ps.getPropertyValue(p.replace(/-(style|color)$/, '-width'))) > 0)) continue;
      if (/^transition-/.test(p) && ps.transitionDuration === '0s') continue;
      if (/^animation-/.test(p) && ps.animationName === 'none') continue;
      if (p === 'transform-origin' && ps.transform === 'none') continue;
      if (!relevant(p, v, ps)) continue;
      out.push([p, normValue(p, v)]);
    }
    if (ps.display !== 'inline' || ps.position === 'absolute') {
      if (ps.width !== 'auto') out.push(['width', ps.width]);
      if (ps.height !== 'auto') out.push(['height', ps.height]);
    }
    return out;
  }

  // ------------------------------------------------------------ árvore
  // URL absoluta com protocolo conhecido; javascript:, vbscript: (em qualquer caixa, com espaços) e data: em href viram "#"
  function safeUrl(name, value) {
    const v = String(value).trim();
    if (v.startsWith('#')) return v;
    const u = U.safe(() => new URL(v, document.baseURI));
    if (!u) return '#';
    if (u.protocol === 'data:') return name === 'href' ? '#' : u.href;
    return /^(https?|mailto|tel|blob):$/.test(u.protocol) ? u.href : '#';
  }

  function absolutize(name, value) {
    if (URL_ATTRS.has(name)) return safeUrl(name, value);
    if (name === 'srcset') return U.parseSrcset(value).map((c) => [safeUrl('src', c.url), c.desc].filter(Boolean).join(' ')).join(', ');
    return value;
  }

  function attrsOf(el) {
    const tag = el.localName;
    const out = {};
    for (const name of [...(KEEP_ATTRS[tag] || []), ...GLOBAL_ATTRS]) {
      if (!el.hasAttribute(name)) continue;
      out[name] = absolutize(name, el.getAttribute(name));
    }
    if (tag === 'img' && el.currentSrc && !out.srcset) out.src = el.currentSrc;
    return out;
  }

  function svgTree(node) {
    if (node.nodeType === 3) {
      const v = node.nodeValue;
      return v.trim() ? { t: 'text', v } : null;
    }
    if (node.nodeType !== 1 || /^(script|foreignobject|iframe)$/i.test(node.localName)) return null;
    const attrs = {};
    for (const a of node.attributes) attrs[a.name] = a.value;
    const children = [];
    for (const c of node.childNodes) {
      const k = svgTree(c);
      if (k) children.push(k);
    }
    return { t: 'el', tag: node.localName, ns: 'svg', attrs, children };
  }

  function collapse(text, ws) {
    if (/^(pre|pre-wrap|pre-line|break-spaces)$/.test(ws)) return text;
    return text.replace(/\s+/g, ' ');
  }

  function build(el, ctx) {
    const tag = el.localName;
    if (DROP_TAGS.has(tag) || el.hasAttribute(U.UI_ATTR)) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return null;
    if (ctx.count >= ctx.max) {
      ctx.truncated = true;
      return null;
    }
    ctx.count++;
    const isRoot = ctx.depth === 0;
    const cls = `${tag.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'el'}${++ctx.seq}`;
    ctx.map.set(el, cls);
    let decls = declsFor(el, cs, ctx, isRoot);
    decls = isRoot ? rootFix(decls) : autoMargins(decls, el, cs, ctx);
    decls = [...new Map(decls)]; // a última declaração de cada propriedade vence

    for (const fam of decls.filter(([p]) => p === 'font-family')) ctx.families.add(U.firstFamily(fam[1]).toLowerCase());
    for (const an of decls.filter(([p]) => p === 'animation-name')) for (const n of U.splitTop(an[1])) ctx.animations.add(n);

    if (tag === 'svg') {
      const rect = el.getBoundingClientRect();
      const markup = U.safe(() => U.serializeSvg(el, cs, rect));
      const doc = markup && U.safe(() => new DOMParser().parseFromString(markup, 'image/svg+xml'));
      const tree = doc && doc.documentElement && doc.documentElement.localName === 'svg' ? svgTree(doc.documentElement) : null;
      if (tree) {
        tree.cls = cls;
        tree.decls = decls.filter(([p]) => !/^(color|fill|stroke)$/.test(p) || p === 'color');
        return tree;
      }
    }
    if (tag === 'canvas') {
      const data = U.safe(() => el.toDataURL('image/png'));
      if (data && data.length > 100) return { t: 'el', tag: 'img', attrs: { src: data, alt: '' }, cls, decls, children: [] };
      return { t: 'el', tag: 'div', attrs: {}, cls, decls, children: [] };
    }

    const node = { t: 'el', tag, attrs: attrsOf(el), cls, decls, children: [] };
    for (const pseudo of ['::before', '::after']) {
      const pd = pseudoDecls(el, cs, pseudo);
      if (pd) {
        ctx.pseudo.push({ cls, pseudo: pseudo.slice(2), decls: pd });
        for (const an of pd.filter(([p]) => p === 'animation-name')) for (const n of U.splitTop(an[1])) ctx.animations.add(n);
      }
    }
    if ((tag === 'input' || tag === 'textarea') && el.placeholder) {
      const ph = getComputedStyle(el, '::placeholder');
      const c = U.normColor(ph.color);
      const own = U.normColor(cs.color);
      if (c && (!own || c.css !== own.css)) ctx.pseudo.push({ cls, pseudo: 'placeholder', decls: [['color', c.css]] });
    }

    const childCtx = { ...ctx, depth: ctx.depth + 1, parentCS: cs, parentEl: el };
    const flexy = /flex|grid/.test(cs.display);
    const kids = el.shadowRoot ? el.shadowRoot.childNodes : el.childNodes;
    const visitKid = (child) => {
      if (child.nodeType === 3) {
        const text = collapse(child.nodeValue, cs.whiteSpace);
        if (text.trim() || (text === ' ' && !flexy)) node.children.push({ t: 'text', v: text });
      } else if (child.nodeType === 1) {
        if (child.localName === 'slot') {
          for (const n of child.assignedNodes({ flatten: true })) visitKid(n);
          return;
        }
        const k = build(child, childCtx);
        if (k) node.children.push(k);
      }
    };
    for (const child of kids) visitKid(child);
    ctx.count = childCtx.count;
    ctx.seq = childCtx.seq;
    ctx.truncated = ctx.truncated || childCtx.truncated;
    return node;
  }

  // Regras :hover/:focus que tocam elementos capturados.
  function stateRules(root, map, css) {
    const out = new Map();
    for (const p of U.parsedStates(css)) {
      let hits = [];
      try {
        hits = [...(root.matches(p.target) ? [root] : []), ...root.querySelectorAll(p.target)];
      } catch {
        continue;
      }
      for (const el of hits) {
        const cls = map.get(el);
        if (!cls) continue;
        let ownerCls = null;
        if (p.owner) {
          let anc = el;
          while (anc && !U.safe(() => anc.matches(p.owner), false)) anc = anc === root ? null : anc.parentElement;
          ownerCls = anc ? map.get(anc) : null;
          if (!ownerCls) continue;
        }
        const key = `${cls}|${p.state}|${ownerCls || ''}`;
        let e = out.get(key);
        if (!e) out.set(key, (e = { cls, state: p.state, ownerCls, decls: {} }));
        for (const [k, v] of U.declsFromCss(p.css, el)) e.decls[k] = v;
      }
    }
    return [...out.values()].map((e) => ({ ...e, decls: Object.entries(e.decls).map(([k, v]) => [k, normValue(k, v)]) }));
  }

  function fontFaceCss(css, families) {
    const out = [];
    for (const f of css.fontFaces) {
      if (!families.has(f.family.toLowerCase()) || !f.sources.length) continue;
      const src = f.sources.map((s) => `url("${s.url}")${s.format ? ` format("${s.format}")` : ''}`).join(', ');
      out.push(
        `@font-face {\n  font-family: '${f.family.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]+/g, ' ')}';\n  src: ${src};\n  font-weight: ${f.weight};\n  font-style: ${f.style};\n  font-display: swap;${f.unicodeRange ? `\n  unicode-range: ${f.unicodeRange};` : ''}\n}`,
      );
    }
    return [...new Set(out)];
  }

  function backgroundBehind(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = U.normColor(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) return c.css;
    }
    return '#ffffff';
  }

  async function capture(el, opts = {}) {
    const t0 = performance.now();
    const css = D.css || (D.css = await U.readSheets([]));
    const ctx = {
      depth: 0, count: 0, seq: 0, max: opts.max || 1500, truncated: false, map: new Map(), pseudo: [],
      families: new Set(), animations: new Set(), parentCS: el.parentElement ? getComputedStyle(el.parentElement) : null, parentEl: el.parentElement,
    };
    let tree;
    try {
      tree = build(el, ctx);
    } finally {
      cleanupFrame();
    }
    if (!tree) throw new Error('Esse elemento não está visível.');
    const states = stateRules(el, ctx.map, css);
    for (const s of states) for (const [k, v] of s.decls) if (k === 'animation-name' || k === 'animation') ctx.animations.add(String(v).split(/\s+/)[0]);
    const keyframes = [...ctx.animations].map((n) => css.keyframes.get(n)).filter(Boolean);
    const rect = el.getBoundingClientRect();
    D.lastPicked = el;
    return {
      source: { kind: 'web', url: location.href, title: document.title, viewport: { width: innerWidth, height: innerHeight }, at: new Date().toISOString() },
      root: { description: U.describe(el), width: Math.round(rect.width), height: Math.round(rect.height) },
      tree,
      pseudo: ctx.pseudo,
      states,
      keyframes,
      fontFaces: fontFaceCss(css, ctx.families),
      background: backgroundBehind(el.parentElement || el),
      stats: { nodes: ctx.count, truncated: ctx.truncated, ms: Math.round(performance.now() - t0) },
    };
  }

  // ------------------------------------------------------------ seletor visual
  let active = null;

  function deepElementFromPoint(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && el.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  }

  D.pick = (opts = {}) => {
    if (active) active.finish(null);
    return new Promise((resolve) => {
      const host = document.createElement('div');
      host.setAttribute(U.UI_ATTR, '');
      host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
      const shadow = host.attachShadow({ mode: 'closed' });
      // DOM montado à mão (sem innerHTML) para não esbarrar em Trusted Types da página
      const style = document.createElement('style');
      style.textContent = `
        .box { position: fixed; border: 2px solid #c8f169; background: rgba(200, 241, 105, .12); border-radius: 3px;
               box-shadow: 0 0 0 1px rgba(0,0,0,.6); transition: all .06s ease-out; pointer-events: none; }
        .tag { position: fixed; font: 600 11px/1.6 ui-monospace, Menlo, monospace; color: #0e0f12; background: #c8f169;
               padding: 1px 6px; border-radius: 3px; white-space: nowrap; pointer-events: none; }
        .hint { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); font: 500 12px/1.4 system-ui, sans-serif;
                color: #e8eaee; background: rgba(14,15,18,.92); border: 1px solid #2a2e37; padding: 8px 12px; border-radius: 10px;
                pointer-events: none; box-shadow: 0 8px 24px rgba(0,0,0,.35); }
        b { color: #c8f169; font-weight: 600; }`;
      const box = document.createElement('div');
      box.className = 'box';
      const tag = document.createElement('div');
      tag.className = 'tag';
      const hint = document.createElement('div');
      hint.className = 'hint';
      for (const [strong, text] of [['Decalque', ' · clique para capturar · '], ['↑', ' pai · '], ['↓', ' filho · '], ['Esc', ' cancela']]) {
        const b = document.createElement('b');
        b.textContent = strong;
        hint.append(b, text);
      }
      shadow.append(style, box, tag, hint);
      document.documentElement.appendChild(host);
      let current = null;

      const draw = () => {
        if (!current) return;
        const r = current.getBoundingClientRect();
        Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        tag.textContent = `${U.describe(current)} · ${Math.round(r.width)}×${Math.round(r.height)}`;
        Object.assign(tag.style, { left: `${Math.max(4, r.left)}px`, top: `${r.top > 24 ? r.top - 22 : r.bottom + 4}px` });
      };
      // Só entrada real do usuário: um carrossel que chama element.click() encerraria a pinça sozinho.
      const onMove = (e) => {
        if (!e.isTrusted) return;
        const el = deepElementFromPoint(e.clientX, e.clientY);
        if (el && el !== current && !host.contains(el) && el !== document.documentElement) {
          current = el;
          draw();
        }
      };
      const block = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      };
      const onClick = (e) => {
        block(e);
        if (e.isTrusted && current) finish(current);
      };
      const onKey = (e) => {
        if (!e.isTrusted) return;
        if (e.key === 'Escape') {
          block(e);
          finish(null);
        } else if (e.key === 'ArrowUp' && current && current.parentElement && current.parentElement !== document.documentElement) {
          block(e);
          current = current.parentElement;
          draw();
        } else if (e.key === 'ArrowDown' && current && current.firstElementChild) {
          block(e);
          current = current.firstElementChild;
          draw();
        } else if (e.key === 'Enter' && current) {
          block(e);
          finish(current);
        }
      };
      const events = [
        ['mousemove', onMove], ['click', onClick], ['mousedown', block], ['mouseup', block], ['pointerdown', block],
        ['pointerup', block], ['touchstart', block], ['keydown', onKey], ['scroll', draw],
      ];
      for (const [type, fn] of events) window.addEventListener(type, fn, { capture: true, passive: false });

      function finish(el) {
        for (const [type, fn] of events) window.removeEventListener(type, fn, { capture: true });
        host.remove();
        active = null;
        if (!el) return resolve(null);
        capture(el, opts).then(resolve, (err) => resolve({ error: String((err && err.message) || err) }));
      }
      active = { finish };
    });
  };

  D.cancelPick = () => {
    if (active) active.finish(null);
    return true;
  };

  D.captureRelative = async (direction, opts = {}) => {
    const base = D.lastPicked;
    if (!base || !base.isConnected) throw new Error('O elemento capturado não está mais na página.');
    const next = direction === 'parent' ? base.parentElement : base.firstElementChild;
    if (!next || next === document.documentElement) throw new Error(direction === 'parent' ? 'Já está no topo.' : 'Esse elemento não tem filhos.');
    return capture(next, opts);
  };

  D.captureSelector = async (selector, opts = {}) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`Nada encontrado para ${selector}`);
    return capture(el, opts);
  };
})();
