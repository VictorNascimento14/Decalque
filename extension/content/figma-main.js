/* Decalque — ponte com a API de plugins que o Figma expõe na própria página (global `figma`).
   Injetado no mundo MAIN junto com lib/figma-scan.js. Só leitura: nada aqui altera o arquivo. */
(function () {
  'use strict';
  if (window.__decalqueFigma && window.__decalqueFigma.version === 2) return;
  const S = window.DecalqueFigmaScan;

  const round = (n, d = 1) => {
    const f = 10 ** d;
    return Math.round(Number(n) * f) / f;
  };

  function figmaApi() {
    // eslint-disable-next-line no-undef
    const f = typeof figma !== 'undefined' ? figma : window.figma;
    return f && f.root && typeof f.getLocalPaintStylesAsync === 'function' ? f : null;
  }

  function b64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function sniff(b) {
    if (b[0] === 0x89 && b[1] === 0x50) return 'png';
    if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
    if (b[0] === 0x47 && b[1] === 0x49) return 'gif';
    if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return 'webp';
    return 'png';
  }
  const MIME = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', webm: 'video/webm', mp4: 'video/mp4' };

  const plain = (v) => {
    try {
      return JSON.parse(JSON.stringify(v));
    } catch {
      return null;
    }
  };

  async function getNode(f, id) {
    if (f.getNodeByIdAsync) return f.getNodeByIdAsync(id);
    return f.getNodeById(id);
  }

  // ------------------------------------------------------------------ estado
  function status() {
    const f = figmaApi();
    if (!f) return { available: false };
    const sel = f.currentPage.selection || [];
    return {
      available: true,
      file: f.root.name,
      editorType: f.editorType,
      page: f.currentPage.name,
      pages: f.root.children.map((p) => ({ id: p.id, name: p.name })),
      selectionCount: sel.length,
      selection: sel.slice(0, 5).map((n) => ({ id: n.id, name: n.name, type: n.type, width: Math.round(n.width || 0), height: Math.round(n.height || 0) })),
      motion: 'motion' in f,
    };
  }

  // ------------------------------------------------------------------ estilos e variáveis locais
  async function localStyles(f) {
    const out = [];
    const list = async (fn) => {
      try {
        return (await fn()) || [];
      } catch {
        return [];
      }
    };
    for (const s of await list(() => f.getLocalPaintStylesAsync())) {
      out.push({ id: s.id, name: s.name, type: 'FILL', description: s.description || '', value: S.styleValue('FILL', { paints: s.paints.map(S.pluginPaintToRest).filter(Boolean) }) });
    }
    for (const s of await list(() => f.getLocalTextStylesAsync())) {
      out.push({ id: s.id, name: s.name, type: 'TEXT', description: s.description || '', value: S.styleValue('TEXT', { text: S.textStyle(S.pluginTextToRest(s)) }) });
    }
    for (const s of await list(() => f.getLocalEffectStylesAsync())) {
      out.push({ id: s.id, name: s.name, type: 'EFFECT', description: s.description || '', value: S.styleValue('EFFECT', { effects: plain(s.effects) || [] }) });
    }
    for (const s of await list(() => f.getLocalGridStylesAsync())) {
      out.push({ id: s.id, name: s.name, type: 'GRID', description: s.description || '', value: S.styleValue('GRID', { grids: plain(s.layoutGrids) || [] }) });
    }
    return out.filter((s) => s.value);
  }

  async function variables(f) {
    if (!f.variables || !f.variables.getLocalVariableCollectionsAsync) return null;
    try {
      const cols = await f.variables.getLocalVariableCollectionsAsync();
      const vars = await f.variables.getLocalVariablesAsync();
      const byId = new Map(vars.map((v) => [v.id, v]));
      const colName = new Map(cols.map((c) => [c.id, c.name]));
      const value = (v) => {
        if (v && typeof v === 'object' && v.type === 'VARIABLE_ALIAS') {
          const t = byId.get(v.id);
          // a coleção entra no nome do token (--coleção-variável); alias de biblioteca externa fica marcado
          return t ? { alias: t.name, collection: colName.get(t.variableCollectionId) || '' } : { alias: v.id, external: true };
        }
        if (v && typeof v === 'object' && 'r' in v) return { color: S.colorOf(v) };
        return v;
      };
      return {
        collections: cols.map((c) => ({ id: c.id, name: c.name, modes: c.modes.map((m) => ({ id: m.modeId, name: m.name })), defaultModeId: c.defaultModeId })),
        variables: vars.map((v) => ({
          id: v.id,
          name: v.name,
          type: v.resolvedType,
          collectionId: v.variableCollectionId,
          description: v.description || '',
          scopes: plain(v.scopes) || [],
          codeSyntax: plain(v.codeSyntax) || {},
          values: Object.fromEntries(Object.entries(v.valuesByMode).map(([m, x]) => [m, value(x)])),
        })),
      };
    } catch (e) {
      return { error: String((e && e.message) || e), collections: [], variables: [] };
    }
  }

  // Figma Motion (beta): keyframes, estilos de animação aplicados e timelines dos frames de topo.
  async function motion(f, pages) {
    if (!('motion' in f)) return null;
    const out = { presets: [], timelines: [] };
    try {
      out.presets = f.motion.figmaAnimationStyles().slice(0, 80).map((s) => ({ name: s.name, id: s.styleId, description: s.description || '' }));
    } catch {
      /* API beta pode mudar */
    }
    for (const page of pages) {
      for (const frame of page.children || []) {
        let tls = [];
        try {
          tls = frame.timelines || [];
        } catch {
          continue;
        }
        if (!tls.length) continue;
        const entry = { frameId: frame.id, frame: frame.name, page: page.name, duration: tls[0].duration, width: frame.width, height: frame.height, nodes: [] };
        let nodes = [frame];
        try {
          nodes = nodes.concat(frame.findAll(() => true).slice(0, 4000));
        } catch {
          /* frame sem filhos */
        }
        for (const n of nodes) {
          let anim = null;
          let applied = null;
          try {
            anim = n.animations;
          } catch {
            /* sem keyframes */
          }
          try {
            applied = n.animationStyles;
          } catch {
            /* sem estilos */
          }
          const hasAnim = anim && Object.keys(anim).length > 0;
          if (!hasAnim && !(applied && applied.length)) continue;
          entry.nodes.push({
            id: n.id, name: n.name, type: n.type, width: n.width, height: n.height,
            animations: hasAnim ? plain(anim) : null,
            styles: (applied || []).map((s) => ({ name: s.name, type: s.type, duration: s.duration, offset: s.timelineOffset, props: plain(s.props) })),
          });
          if (entry.nodes.length >= 200) break;
        }
        if (entry.nodes.length) out.timelines.push(entry);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ extração do arquivo
  async function snapshot(opts) {
    const f = figmaApi();
    if (!f) throw new Error('A API do Figma não está disponível nesta aba.');
    const pages = opts && opts.scope === 'current' ? [f.currentPage] : f.root.children;
    const scan = S.createScan({ maxNodes: 150000 });
    const failures = [];
    for (const page of pages) {
      try {
        if (page.loadAsync) await page.loadAsync();
      } catch {
        /* página já carregada */
      }
      let json = null;
      try {
        json = await page.exportAsync({ format: 'JSON_REST_V1' });
      } catch (e) {
        failures.push(`${page.name}: ${(e && e.message) || e}`);
      }
      if (json && json.document) {
        scan.add(json);
        continue;
      }
      // plano B: exporta cada filho de topo e remonta a página
      const merged = { document: { id: page.id, name: page.name, type: 'CANVAS', children: [] }, styles: {}, components: {}, componentSets: {} };
      for (const child of page.children) {
        try {
          const j = await child.exportAsync({ format: 'JSON_REST_V1' });
          if (!j || !j.document) continue;
          merged.document.children.push(j.document);
          Object.assign(merged.styles, j.styles || {});
          Object.assign(merged.components, j.components || {});
          Object.assign(merged.componentSets, j.componentSets || {});
        } catch (e) {
          failures.push(`${child.name}: ${(e && e.message) || e}`);
        }
      }
      scan.add(merged);
    }
    return {
      via: 'plugin',
      file: { name: f.root.name, editorType: f.editorType, currentPage: f.currentPage.name, pageCount: f.root.children.length },
      scan: scan.result(),
      localStyles: await localStyles(f),
      variables: await variables(f),
      motion: await motion(f, pages),
      failures: failures.slice(0, 20),
    };
  }

  // ------------------------------------------------------------------ exportação de assets
  async function exportNode(id, opts) {
    const f = figmaApi();
    const node = await getNode(f, id);
    if (!node || !node.exportAsync) throw new Error(`Camada não encontrada: ${id}`);
    const format = (opts && opts.format) || 'PNG';
    if (format === 'SVG') return { text: await node.exportAsync({ format: 'SVG_STRING' }), ext: 'svg', mime: MIME.svg };
    if (format === 'WEBM' || format === 'MP4') {
      const bytes = await node.exportAsync({ format, fps: 30, quality: 'MEDIUM' });
      return { base64: b64(bytes), ext: format.toLowerCase(), mime: MIME[format.toLowerCase()] };
    }
    const scale = (opts && opts.scale) || 1;
    const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
    return { base64: b64(bytes), ext: 'png', mime: MIME.png };
  }

  async function imageBytes(hash) {
    const f = figmaApi();
    const img = f.getImageByHash(hash);
    if (!img) throw new Error('Imagem não encontrada');
    const bytes = await img.getBytesAsync();
    const ext = sniff(bytes);
    return { base64: b64(bytes), ext, mime: MIME[ext] };
  }

  // ------------------------------------------------------------------ seleção → árvore HTML/CSS
  const VECTOR = /^(VECTOR|BOOLEAN_OPERATION|STAR|POLYGON|LINE|REGULAR_POLYGON)$/;
  const SEMANTIC = [[/^(header|cabeçalho)/i, 'header'], [/^(footer|rodapé)/i, 'footer'], [/^(nav|navbar|menu)/i, 'nav'], [/^(section|seção)/i, 'section'], [/^main$/i, 'main']];

  function svgTree(markup) {
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const conv = (node) => {
      if (node.nodeType === 3) return node.nodeValue.trim() ? { t: 'text', v: node.nodeValue } : null;
      if (node.nodeType !== 1) return null;
      const attrs = {};
      for (const a of node.attributes) attrs[a.name] = a.value;
      return { t: 'el', tag: node.localName, ns: 'svg', attrs, children: [...node.childNodes].map(conv).filter(Boolean) };
    };
    return doc.documentElement && doc.documentElement.localName === 'svg' ? conv(doc.documentElement) : null;
  }

  function tagFor(node) {
    if (node.type === 'TEXT') {
      const size = typeof node.fontSize === 'number' ? node.fontSize : 16;
      return size >= 40 ? 'h1' : size >= 30 ? 'h2' : size >= 22 ? 'h3' : 'p';
    }
    if (/button|btn|\bcta\b|botão/i.test(node.name)) return 'button';
    for (const [re, tag] of SEMANTIC) if (re.test(node.name)) return tag;
    return 'div';
  }

  async function captureSelection(opts) {
    const f = figmaApi();
    if (!f) throw new Error('A API do Figma não está disponível nesta aba.');
    const sel = f.currentPage.selection || [];
    if (!sel.length) throw new Error('Selecione um frame ou camada no Figma primeiro.');
    const maxNodes = (opts && opts.maxNodes) || 600;
    const rootNode = sel[0];
    const assets = [];
    const vars = {};
    const families = new Map();
    const images = new Map();
    let count = 0;
    let seq = 0;
    let truncated = false;
    const isAuto = (n) => n && n.layoutMode && n.layoutMode !== 'NONE';
    const imageFills = (n) => (Array.isArray(n.fills) ? n.fills.filter((p) => p.type === 'IMAGE' && p.visible !== false && p.imageHash) : []);
    const keepVars = (v) =>
      String(v).replace(/var\((--[^,()\s]+)\s*,\s*([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (m, name, fb) => {
        vars[name] = fb.trim();
        return `var(${name})`;
      });

    async function visit(node, parent) {
      if (!node.visible) return null;
      if (count >= maxNodes) {
        truncated = true;
        return null;
      }
      count++;
      let css = {};
      try {
        css = await node.getCSSAsync();
      } catch {
        /* nó sem CSS (ex.: slice) */
      }
      let decls = Object.entries(css).map(([k, v]) => [k, keepVars(v)]);
      const box = node.absoluteBoundingBox;
      if (parent && box && parent.box && (!isAuto(parent.node) || node.layoutPositioning === 'ABSOLUTE')) {
        decls = decls.filter(([k]) => !/^(position|left|top|right|bottom|inset)$/.test(k));
        decls.push(['position', 'absolute'], ['left', `${round(box.x - parent.box.x)}px`], ['top', `${round(box.y - parent.box.y)}px`]);
      }
      const tag = tagFor(node);
      const cls = `${tag}${++seq}`;
      const ff = css['font-family'];
      if (ff) {
        const fam = ff.replace(/["']/g, '').split(',')[0].trim();
        if (!families.has(fam)) families.set(fam, new Set());
        families.get(fam).add(String(css['font-weight'] || '400'));
      }

      if (node.type !== 'TEXT' && (VECTOR.test(node.type) || (node.isAsset && !imageFills(node).length))) {
        try {
          const tree = svgTree(await node.exportAsync({ format: 'SVG_STRING' }));
          if (tree) {
            tree.cls = cls;
            tree.decls = decls.filter(([k]) => /^(position|left|top|width|height|flex|flex-shrink|flex-grow|align-self|margin|opacity|transform)/.test(k));
            return tree;
          }
        } catch {
          /* cai para div */
        }
      }

      for (const p of imageFills(node)) {
        if (images.has(p.imageHash)) continue;
        try {
          const img = f.getImageByHash(p.imageHash);
          const bytes = img && (await img.getBytesAsync());
          if (!bytes) continue;
          const ext = sniff(bytes);
          const name = `img-${p.imageHash.slice(0, 12)}.${ext}`;
          images.set(p.imageHash, name);
          assets.push({ name, base64: b64(bytes), mime: MIME[ext] });
        } catch {
          /* imagem indisponível */
        }
      }
      const firstImg = imageFills(node).find((p) => images.has(p.imageHash));
      if (firstImg) decls = decls.map(([k, v]) => [k, String(v).replace(/<path-to-image>/g, `assets/${images.get(firstImg.imageHash)}`)]);

      if (node.type === 'TEXT') {
        const children = [];
        String(node.characters || '').split('\n').forEach((line, i) => {
          if (i) children.push({ t: 'el', tag: 'br', attrs: {}, children: [] });
          if (line) children.push({ t: 'text', v: line });
        });
        return { t: 'el', tag, attrs: {}, cls, decls, children, name: node.name };
      }

      const kids = [];
      if ('children' in node) {
        for (const c of node.children) {
          const k = await visit(c, { node, box });
          if (k) kids.push(k);
        }
      }
      const hasAbs = kids.some((k) => (k.decls || []).some(([p, v]) => p === 'position' && v === 'absolute'));
      if (hasAbs && !decls.some(([k]) => k === 'position')) decls.push(['position', 'relative']);
      if (node.clipsContent && !decls.some(([k]) => /^overflow/.test(k))) decls.push(['overflow', 'hidden']);
      if (tag === 'button') decls = [['border', 'none'], ['background', 'none'], ['padding', '0'], ['font', 'inherit'], ['cursor', 'pointer'], ...decls];
      return { t: 'el', tag, attrs: {}, cls, decls, children: kids, name: node.name };
    }

    const tree = await visit(rootNode, null);
    if (!tree) throw new Error('A camada selecionada está oculta.');
    let background = '#ffffff';
    try {
      const bg = f.currentPage.backgrounds && f.currentPage.backgrounds[0];
      if (bg && bg.type === 'SOLID') background = S.colorOf(bg.color, bg.opacity).css;
    } catch {
      /* fundo padrão */
    }
    return {
      source: { kind: 'figma', file: f.root.name, page: f.currentPage.name, at: new Date().toISOString() },
      root: { description: rootNode.name, width: Math.round(rootNode.width || 0), height: Math.round(rootNode.height || 0) },
      tree,
      pseudo: [],
      states: [],
      keyframes: [],
      fontFaces: [],
      fontFamilies: [...families].map(([family, weights]) => ({ family, weights: [...weights] })),
      rootVars: vars,
      assets,
      background,
      stats: { nodes: count, truncated },
    };
  }

  const API = { status, snapshot, exportNode, imageBytes, captureSelection };

  window.__decalqueFigma = {
    version: 2,
    async run(method, args) {
      try {
        if (!API[method]) throw new Error(`Método desconhecido: ${method}`);
        return { ok: await API[method](...(args || [])) };
      } catch (e) {
        return { error: String((e && e.message) || e) };
      }
    },
  };
})();
