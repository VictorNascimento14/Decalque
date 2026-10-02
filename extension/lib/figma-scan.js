/* Decalque — análise de árvores do Figma no formato da API REST.
   Script clássico de propósito: roda no painel, nos testes (Node) e dentro da página do Figma
   (injetado no mundo MAIN, onde não há import). Expõe globalThis.DecalqueFigmaScan. */
(function (root) {
  'use strict';

  const round = (n, d = 2) => {
    const f = 10 ** d;
    return Math.round(Number(n) * f) / f;
  };
  const hex2 = (n) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');
  const inc = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by);

  function colorOf(c, opacity) {
    if (!c) return null;
    const a = round((c.a == null ? 1 : c.a) * (opacity == null ? 1 : opacity), 3);
    const hex = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
    return { hex, a, css: a < 1 ? hex + hex2(a) : hex };
  }

  function gradientCss(p) {
    const stops = (p.gradientStops || [])
      .map((s) => `${colorOf(s.color, p.opacity).css} ${round(s.position * 100, 1)}%`)
      .join(', ');
    if (!stops) return null;
    const h = p.gradientHandlePositions;
    if (p.type === 'GRADIENT_LINEAR') {
      let angle = 180;
      if (h && h.length >= 2) {
        angle = round((Math.atan2(h[1].x - h[0].x, -(h[1].y - h[0].y)) * 180) / Math.PI, 1);
        if (angle < 0) angle += 360;
      }
      return `linear-gradient(${angle}deg, ${stops})`;
    }
    if (p.type === 'GRADIENT_ANGULAR') return `conic-gradient(${stops})`;
    return `radial-gradient(circle, ${stops})`;
  }

  function paintInfo(p) {
    if (!p || p.visible === false) return null;
    if (p.type === 'SOLID') {
      const c = colorOf(p.color, p.opacity);
      return c && c.a > 0 ? { kind: 'solid', hex: c.hex, a: c.a, css: c.css } : null;
    }
    if (/^GRADIENT_/.test(p.type)) {
      const css = gradientCss(p);
      return css ? { kind: 'gradient', css, stops: (p.gradientStops || []).map((s) => colorOf(s.color, p.opacity)) } : null;
    }
    if (p.type === 'IMAGE') return { kind: 'image', ref: p.imageRef || p.imageHash || null, scaleMode: p.scaleMode || 'FILL' };
    return null;
  }

  const WEIGHTS = [
    [/thin|hairline/, 100], [/extra ?light|ultra ?light/, 200], [/light/, 300], [/semi ?bold|demi ?bold/, 600],
    [/extra ?bold|ultra ?bold/, 800], [/black|heavy/, 900], [/bold/, 700], [/medium/, 500],
  ];
  function weightFromStyle(style) {
    const s = String(style || '').toLowerCase();
    for (const [re, w] of WEIGHTS) if (re.test(s)) return w;
    return 400;
  }

  // TypeStyle (REST) → estilo normalizado
  function textStyle(s) {
    if (!s || !s.fontFamily) return null;
    const size = round(s.fontSize || 16, 2);
    let lineHeight = 'normal';
    if (s.lineHeightUnit === 'PIXELS' && s.lineHeightPx) lineHeight = `${round(s.lineHeightPx, 2)}px`;
    else if (s.lineHeightUnit === 'FONT_SIZE_%' && s.lineHeightPercentFontSize) lineHeight = String(round(s.lineHeightPercentFontSize / 100, 3));
    else if (s.lineHeightUnit !== 'INTRINSIC_%' && s.lineHeightPx && size) lineHeight = String(round(s.lineHeightPx / size, 3));
    const ls = s.letterSpacing ? round(s.letterSpacing, 3) : 0;
    return {
      family: s.fontFamily,
      weight: s.fontWeight || weightFromStyle(s.fontStyle),
      italic: !!s.italic || /italic/i.test(s.fontStyle || ''),
      size,
      lineHeight,
      letterSpacing: ls ? `${ls}px` : 'normal',
      textCase: s.textCase || 'ORIGINAL',
      decoration: s.textDecoration || 'NONE',
    };
  }

  // Figma: raio de desfoque r ≈ blur(r/2) no CSS (mesma conversão do Dev Mode).
  function effectCss(e) {
    if (!e || e.visible === false) return null;
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      const c = colorOf(e.color || { r: 0, g: 0, b: 0, a: 0.25 });
      const o = e.offset || { x: 0, y: 0 };
      return {
        kind: 'shadow',
        css: `${e.type === 'INNER_SHADOW' ? 'inset ' : ''}${round(o.x, 1)}px ${round(o.y, 1)}px ${round(e.radius || 0, 1)}px ${round(e.spread || 0, 1)}px ${c.css}`,
      };
    }
    if (e.type === 'LAYER_BLUR') return { kind: 'blur', css: `blur(${round((e.radius || 0) / 2, 1)}px)` };
    if (e.type === 'BACKGROUND_BLUR') return { kind: 'backdrop', css: `blur(${round((e.radius || 0) / 2, 1)}px)` };
    return null;
  }

  const BEZIER = {
    EASE_IN: [0.42, 0, 1, 1], EASE_OUT: [0, 0, 0.58, 1], EASE_IN_AND_OUT: [0.42, 0, 0.58, 1], LINEAR: [0, 0, 1, 1],
    EASE_IN_BACK: [0.3, -0.05, 0.7, -0.5], EASE_OUT_BACK: [0.45, 1.45, 0.8, 1], EASE_IN_AND_OUT_BACK: [0.7, -0.4, 0.4, 1.4],
  };
  // Presets de mola do Figma (mesmos do painel de protótipo).
  const SPRINGS = {
    GENTLE: { mass: 1, stiffness: 100, damping: 15 }, QUICK: { mass: 1, stiffness: 300, damping: 20 },
    BOUNCY: { mass: 1, stiffness: 600, damping: 15 }, SLOW: { mass: 1, stiffness: 80, damping: 20 },
  };

  function easingOf(e) {
    if (!e || !e.type) return { name: 'ease-out', css: 'ease-out' };
    const type = e.type;
    if (type === 'CUSTOM_CUBIC_BEZIER' && e.easingFunctionCubicBezier) {
      const b = e.easingFunctionCubicBezier;
      return { name: 'custom', css: `cubic-bezier(${[b.x1, b.y1, b.x2, b.y2].map((n) => round(n, 3)).join(', ')})` };
    }
    if (BEZIER[type]) {
      return { name: type.toLowerCase().replace(/_and_/, '-').replace(/_/g, '-'), css: type === 'LINEAR' ? 'linear' : `cubic-bezier(${BEZIER[type].join(', ')})` };
    }
    if (SPRINGS[type] || type === 'CUSTOM_SPRING') {
      const fn = e.easingFunctionSpring;
      const spring = fn && 'stiffness' in fn ? { mass: fn.mass, stiffness: fn.stiffness, damping: fn.damping } : SPRINGS[type] || null;
      return { name: `spring-${type.toLowerCase().replace(/_/g, '-')}`, spring, bounce: fn && 'bounce' in fn ? fn.bounce : null };
    }
    if (type === 'HOLD') return { name: 'hold', css: 'steps(1, end)' };
    return { name: type.toLowerCase(), css: 'ease' };
  }

  // Transform afim do plugin API ([[a,b,c],[d,e,f]]) → alças do gradiente no formato REST.
  function handlesFromTransform(t) {
    if (!t) return null;
    const [[a, b, c], [d, e, f]] = t;
    const det = a * e - b * d;
    if (!det) return null;
    const inv = [[e / det, -b / det, (b * f - c * e) / det], [-d / det, a / det, (c * d - a * f) / det]];
    const at = (x, y) => ({ x: inv[0][0] * x + inv[0][1] * y + inv[0][2], y: inv[1][0] * x + inv[1][1] * y + inv[1][2] });
    return [at(0, 0.5), at(1, 0.5), at(0, 1)];
  }

  function pluginPaintToRest(p) {
    if (!p) return null;
    if (p.type === 'SOLID') return { type: 'SOLID', visible: p.visible, opacity: p.opacity, color: { r: p.color.r, g: p.color.g, b: p.color.b, a: 1 } };
    if (/^GRADIENT_/.test(p.type)) {
      return {
        type: p.type, visible: p.visible, opacity: p.opacity,
        gradientStops: (p.gradientStops || []).map((s) => ({ position: s.position, color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a } })),
        gradientHandlePositions: handlesFromTransform(p.gradientTransform),
      };
    }
    if (p.type === 'IMAGE') return { type: 'IMAGE', visible: p.visible, opacity: p.opacity, imageRef: p.imageHash, scaleMode: p.scaleMode };
    return null;
  }

  function pluginTextToRest(t) {
    if (!t || !t.fontName || typeof t.fontName !== 'object') return null;
    const lh = t.lineHeight && typeof t.lineHeight === 'object' ? t.lineHeight : { unit: 'AUTO' };
    const ls = t.letterSpacing && typeof t.letterSpacing === 'object' ? t.letterSpacing : { unit: 'PIXELS', value: 0 };
    return {
      fontFamily: t.fontName.family,
      fontStyle: t.fontName.style,
      fontWeight: typeof t.fontWeight === 'number' ? t.fontWeight : weightFromStyle(t.fontName.style),
      italic: /italic|oblique/i.test(t.fontName.style),
      fontSize: t.fontSize,
      lineHeightUnit: lh.unit === 'PIXELS' ? 'PIXELS' : lh.unit === 'PERCENT' ? 'FONT_SIZE_%' : 'INTRINSIC_%',
      lineHeightPx: lh.unit === 'PIXELS' ? lh.value : undefined,
      lineHeightPercentFontSize: lh.unit === 'PERCENT' ? lh.value : undefined,
      letterSpacing: ls.unit === 'PERCENT' ? (ls.value / 100) * (t.fontSize || 16) : ls.value,
      textCase: t.textCase,
      textDecoration: t.textDecoration,
    };
  }

  function styleValue(type, v) {
    if (!v) return null;
    if (type === 'FILL') {
      const paints = (v.paints || []).map(paintInfo).filter((p) => p && p.kind !== 'image');
      return paints.length ? { paints } : null;
    }
    if (type === 'TEXT') return v.text ? { text: v.text } : null;
    if (type === 'EFFECT') {
      const fx = (v.effects || []).map(effectCss).filter(Boolean);
      const shadow = fx.filter((f) => f.kind === 'shadow').map((f) => f.css).join(', ');
      const blur = fx.find((f) => f.kind !== 'shadow');
      return shadow || blur ? { shadow: shadow || null, blur: blur || null } : null;
    }
    if (type === 'GRID') {
      const g = (v.grids || []).filter((x) => x.visible !== false);
      return g.length ? { grids: g.map((x) => ({ pattern: x.pattern, count: x.count, gutter: x.gutterSize, margin: x.offset, alignment: x.alignment, size: x.sectionSize })) } : null;
    }
    return null;
  }

  function createScan(opts) {
    opts = opts || {};
    const max = opts.maxNodes || 150000;
    const S = {
      colors: new Map(), gradients: new Map(), images: new Map(), text: new Map(), fonts: new Map(), radii: new Map(),
      spacing: new Map(), strokes: new Map(), shadows: new Map(), blurs: new Map(), transitions: new Map(),
      styleValues: {}, styleMeta: {}, frames: [], components: [], icons: [], iconKeys: new Set(), pages: [], nodes: 0, truncated: false,
    };

    function addSolid(c, role, area, name) {
      let e = S.colors.get(c.css);
      if (!e) S.colors.set(c.css, (e = { hex: c.hex, a: c.a, css: c.css, count: 0, fill: 0, text: 0, stroke: 0, gradient: 0, area: 0, names: [] }));
      e.count++;
      e[role] = (e[role] || 0) + 1;
      e.area += area || 0;
      if (name && e.names.length < 3 && !e.names.includes(name)) e.names.push(name);
    }

    function addPaint(p, role, area, n, w, h) {
      const info = paintInfo(p);
      if (!info) return;
      if (info.kind === 'solid') addSolid(info, role, area, n.name);
      else if (info.kind === 'gradient') {
        inc(S.gradients, info.css);
        for (const s of info.stops) if (s && s.a > 0) addSolid(s, 'gradient', 0, n.name);
      } else if (info.kind === 'image' && info.ref) {
        let e = S.images.get(info.ref);
        if (!e) S.images.set(info.ref, (e = { ref: info.ref, count: 0, names: [], nodeId: n.id, width: round(w, 0), height: round(h, 0) }));
        e.count++;
        if (e.names.length < 3 && !e.names.includes(n.name)) e.names.push(n.name);
      }
    }

    function addSpace(v, kind) {
      const key = round(v, 1);
      let e = S.spacing.get(key);
      if (!e) S.spacing.set(key, (e = { px: key, count: 0, gap: 0, padding: 0 }));
      e.count++;
      e[kind]++;
    }

    function addText(ts, chars, weight) {
      if (!ts) return;
      const key = [ts.family, ts.weight, ts.italic, ts.size, ts.lineHeight, ts.letterSpacing, ts.textCase].join('|');
      let e = S.text.get(key);
      if (!e) S.text.set(key, (e = Object.assign({}, ts, { count: 0, chars: 0, sample: '' })));
      e.count += weight;
      const sample = String(chars || '').replace(/\s+/g, ' ').trim();
      e.chars += sample.length * weight;
      if (sample && e.sample.length < 24 && sample.length > e.sample.length) e.sample = sample.slice(0, 60);
      let f = S.fonts.get(ts.family);
      if (!f) S.fonts.set(ts.family, (f = { family: ts.family, count: 0, weights: {}, italic: false }));
      f.count += weight;
      f.weights[ts.weight] = (f.weights[ts.weight] || 0) + 1;
      if (ts.italic) f.italic = true;
    }

    function addTransition(t, trigger) {
      if (!t || t.duration == null) return;
      const durationMs = Math.round(t.duration <= 10 ? t.duration * 1000 : t.duration);
      const easing = easingOf(t.easing);
      const key = [t.type, durationMs, easing.css || easing.name].join('|');
      let e = S.transitions.get(key);
      if (!e) S.transitions.set(key, (e = { type: t.type, durationMs, easing, triggers: [], count: 0 }));
      e.count++;
      if (trigger && !e.triggers.includes(trigger)) e.triggers.push(trigger);
    }

    function captureStyle(kind, id, n) {
      if (!id || S.styleValues[id]) return;
      const k = kind.replace(/s$/, '');
      if (k === 'fill') S.styleValues[id] = { paints: n.fills || [] };
      else if (k === 'stroke') S.styleValues[id] = { paints: n.strokes || [] };
      else if (k === 'text') S.styleValues[id] = { text: textStyle(n.style) };
      else if (k === 'effect') S.styleValues[id] = { effects: n.effects || [] };
      else if (k === 'grid') S.styleValues[id] = { grids: n.layoutGrids || [] };
    }

    function isIcon(n, ctx, w, h) {
      if (!(w > 0 && h > 0 && w <= 96 && h <= 96)) return false;
      if (!/^(COMPONENT|INSTANCE|FRAME|GROUP|VECTOR|BOOLEAN_OPERATION)$/.test(n.type)) return false;
      const name = String(n.name || '').toLowerCase();
      if (/icon|ícone|\bico\b|^ic[-_ ]|logo|arrow|chevron|close|menu|search|social|seta/.test(name)) return true;
      if (/icon|ícone/i.test(ctx.page) && ctx.depth <= 4) return true;
      return n.type === 'COMPONENT' && w <= 48 && h <= 48;
    }

    function walk(n, ctx, file) {
      if (S.nodes >= max) {
        S.truncated = true;
        return;
      }
      if (!n || n.visible === false) return;
      S.nodes++;
      const b = n.absoluteBoundingBox || n.absoluteRenderBounds || {};
      const w = b.width || 0;
      const h = b.height || 0;
      const isText = n.type === 'TEXT';
      for (const p of n.fills || []) addPaint(p, isText ? 'text' : 'fill', w * h, n, w, h);
      const strokes = (n.strokes || []).filter((p) => p && p.visible !== false);
      if (strokes.length && (n.strokeWeight || 0) > 0) {
        for (const p of strokes) addPaint(p, 'stroke', 0, n, w, h);
        inc(S.strokes, round(n.strokeWeight, 2));
      }
      const fx = (n.effects || []).map(effectCss).filter(Boolean);
      const sh = fx.filter((f) => f.kind === 'shadow');
      if (sh.length) inc(S.shadows, sh.map((f) => f.css).join(', '));
      for (const f of fx) if (f.kind !== 'shadow') inc(S.blurs, `${f.kind}|${f.css}`);
      const radii = Array.isArray(n.rectangleCornerRadii) ? n.rectangleCornerRadii : n.cornerRadius ? [n.cornerRadius] : [];
      for (const r of new Set(radii.filter((r) => r > 0).map((r) => round(r, 1)))) inc(S.radii, r);
      if (n.layoutMode && n.layoutMode !== 'NONE') {
        if (n.itemSpacing > 0) addSpace(n.itemSpacing, 'gap');
        if (n.counterAxisSpacing > 0) addSpace(n.counterAxisSpacing, 'gap');
        for (const k of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) if (n[k] > 0) addSpace(n[k], 'padding');
      }
      if (isText && n.style) {
        addText(textStyle(n.style), n.characters, 1);
        const table = n.styleOverrideTable || {};
        for (const k of Object.keys(table)) addText(textStyle(Object.assign({}, n.style, table[k])), '', 0.5);
      }
      if (n.styles) for (const kind of Object.keys(n.styles)) captureStyle(kind, n.styles[kind], n);
      for (const it of n.interactions || []) {
        for (const a of (it && it.actions) || []) if (a && a.transition) addTransition(a.transition, it.trigger && it.trigger.type);
      }
      if (n.transitionNodeID && n.transitionDuration != null) {
        addTransition({ type: 'LEGACY', duration: n.transitionDuration, easing: { type: n.transitionEasing || 'EASE_OUT' } }, 'ON_CLICK');
      }
      if (n.type === 'COMPONENT_SET' || (n.type === 'COMPONENT' && ctx.parentType !== 'COMPONENT_SET')) {
        const meta = (file.components && file.components[n.id]) || (file.componentSets && file.componentSets[n.id]) || {};
        S.components.push({
          id: n.id, name: n.name, type: n.type, page: ctx.page, width: round(w, 0), height: round(h, 0),
          variants: n.type === 'COMPONENT_SET' ? (n.children || []).length : 0, description: meta.description || n.description || '',
        });
      }
      let icon = false;
      if (!ctx.inIcon && isIcon(n, ctx, w, h)) {
        const key = `${n.name}|${Math.round(w)}x${Math.round(h)}`;
        if (!S.iconKeys.has(key) && S.icons.length < 400) {
          S.iconKeys.add(key);
          S.icons.push({ id: n.id, name: n.name, width: round(w, 1), height: round(h, 1), page: ctx.page });
        }
        icon = true;
      }
      for (const c of n.children || []) walk(c, { page: ctx.page, depth: ctx.depth + 1, inIcon: ctx.inIcon || icon, parentType: n.type }, file);
    }

    function topLevel(n, page, file) {
      if (!n || n.visible === false) return;
      if (n.type === 'SECTION') {
        for (const c of n.children || []) topLevel(c, page, file);
        return;
      }
      const b = n.absoluteBoundingBox || {};
      if (/^(FRAME|COMPONENT|COMPONENT_SET|INSTANCE|GROUP)$/.test(n.type)) {
        S.frames.push({ id: n.id, name: n.name, type: n.type, page, width: round(b.width || 0, 0), height: round(b.height || 0, 0) });
      }
      walk(n, { page, depth: 1, inIcon: false, parentType: 'CANVAS' }, file);
    }

    return {
      // file: { document, styles, components, componentSets } — documento inteiro ou uma página (CANVAS)
      add(file) {
        const doc = file.document;
        if (!doc) return;
        Object.assign(S.styleMeta, file.styles || {});
        const pages = doc.type === 'DOCUMENT' ? doc.children || [] : [doc];
        for (const page of pages) {
          S.pages.push({ id: page.id, name: page.name, background: page.backgroundColor ? colorOf(page.backgroundColor).css : null });
          for (const child of page.children || []) topLevel(child, page.name, file);
        }
      },
      result() {
        const list = (map, key) => [...map].map(([k, count]) => ({ [key]: k, count })).sort((a, b) => b.count - a.count);
        const styles = Object.keys(S.styleMeta)
          .map((id) => {
            const m = S.styleMeta[id];
            return { id, name: m.name, type: m.styleType, description: m.description || '', value: styleValue(m.styleType, S.styleValues[id]) };
          })
          .filter((s) => s.value);
        return {
          pages: S.pages,
          frames: S.frames,
          components: S.components,
          icons: S.icons,
          colors: [...S.colors.values()].sort((a, b) => b.count - a.count),
          gradients: list(S.gradients, 'css'),
          images: [...S.images.values()].sort((a, b) => b.count - a.count),
          text: [...S.text.values()].sort((a, b) => b.count - a.count),
          fonts: [...S.fonts.values()].sort((a, b) => b.count - a.count),
          radii: list(S.radii, 'px'),
          spacing: [...S.spacing.values()].sort((a, b) => b.count - a.count),
          strokes: list(S.strokes, 'px'),
          shadows: list(S.shadows, 'css'),
          blurs: list(S.blurs, 'key').map(({ key, count }) => ({ kind: key.split('|')[0], css: key.split('|')[1], count })),
          transitions: [...S.transitions.values()].sort((a, b) => b.count - a.count),
          styles,
          nodes: S.nodes,
          truncated: S.truncated,
        };
      },
    };
  }

  function scanFile(file, opts) {
    const scan = createScan(opts);
    scan.add(file);
    return scan.result();
  }

  root.DecalqueFigmaScan = {
    createScan, scanFile, colorOf, gradientCss, paintInfo, textStyle, effectCss, easingOf, weightFromStyle,
    handlesFromTransform, pluginPaintToRest, pluginTextToRest, styleValue, SPRINGS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
