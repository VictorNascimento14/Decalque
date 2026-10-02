// Controlador do painel lateral: acompanha a aba ativa, injeta os scripts e desenha as telas.

import { buildWebModel } from '../lib/model.js';
import { globalCss, renderCSS, renderDocument, renderHTML, renderJSX, componentName } from '../lib/component.js';
import { createZip } from '../lib/zip.js';
import { hostOf, slugify, stamp } from '../lib/util.js';
import { base64ToBytes, bytesToBase64, copyText, downloadBlob, h, svgIcon, toast } from './dom.js';
import { buildKit, fetchBytes, textFiles } from './kit.js';
import { SECTIONS, renderComponentView, renderSection } from './views.js';

const params = new URLSearchParams(location.search);
const FIXED_TAB = params.has('tab') ? Number(params.get('tab')) : null; // painel aberto numa aba comum (testes)

const state = {
  windowId: null,
  tab: null,
  mode: 'web',
  busy: null,
  error: null,
  section: 'overview',
  byTab: new Map(),
  opts: { scroll: true, includeVideos: false },
  view: 'design',
  capture: null,
  captureCode: null,
  captureTab: 'jsx',
  picking: false,
  fonts: new Map(),
  filesCache: new WeakMap(),
};

const current = () => (state.tab && state.byTab.get(state.tab.id)) || {};

// Mesma chave = mesmo documento (ignora #hash e a query de navegação)
function pageKey(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return String(url || '');
  }
}

// ------------------------------------------------------------------ injeção e chamadas
async function inject(tabId, files, world = 'ISOLATED') {
  await chrome.scripting.executeScript({ target: { tabId }, files, world });
}

async function callContent(tabId, method, args = []) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (m, a) => {
      try {
        if (!window.__decalque || !window.__decalque[m]) return { error: 'Script do Decalque não carregado nesta página. Tente de novo.' };
        return { ok: await window.__decalque[m](...a) };
      } catch (e) {
        return { error: String((e && e.message) || e) };
      }
    },
    args: [method, args],
  });
  const r = res && res.result;
  if (!r) throw new Error('A página não respondeu (ela recarregou ou bloqueia extensões).');
  if (r.error) throw new Error(r.error);
  return r.ok;
}

async function probeLibs(tabId) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const w = window;
      const out = [];
      const get = (f) => {
        try {
          return f();
        } catch {
          return undefined;
        }
      };
      const add = (name, version, kind = 'motion') => out.push({ name, version: version ? String(version) : null, kind, evidence: 'objeto global na página' });
      if (w.gsap) add('GSAP', get(() => w.gsap.version));
      if (w.ScrollTrigger) add('ScrollTrigger', get(() => w.ScrollTrigger.version));
      if (w.Lenis || w.lenis) add('Lenis', get(() => w.lenis && w.lenis.version));
      if (w.lottie || w.bodymovin) add('Lottie', get(() => (w.lottie || w.bodymovin).version));
      if (w.THREE) add('Three.js', get(() => `r${w.THREE.REVISION}`));
      if (w.anime) add('anime.js', get(() => w.anime.version));
      if (w.Motion) add('Motion', null);
      if (w.barba) add('Barba.js', get(() => w.barba.version));
      if (w.LocomotiveScroll) add('Locomotive Scroll', null);
      if (w.ScrollReveal) add('ScrollReveal', null);
      if (w.AOS) add('AOS', null);
      if (w.SplitType) add('SplitType', null);
      if (w.PIXI) add('PixiJS', get(() => w.PIXI.VERSION));
      if (w.Swiper) add('Swiper', null, 'ui');
      if (w.jQuery) add('jQuery', get(() => w.jQuery.fn.jquery), 'lib');
      if (w.Alpine) add('Alpine.js', get(() => w.Alpine.version), 'framework');
      if (w.Vue || w.__VUE__) add('Vue', get(() => w.Vue && w.Vue.version), 'framework');
      if (w.__NEXT_DATA__ || w.next) add('Next.js', get(() => w.next && w.next.version), 'framework');
      if (w.__NUXT__) add('Nuxt', null, 'framework');
      if (w.React) add('React', get(() => w.React.version), 'framework');
      if (w.Webflow) add('Webflow', null, 'builder');
      if (w.Shopify) add('Shopify', null, 'builder');
      return out;
    },
  });
  return (res && res.result) || [];
}

// ------------------------------------------------------------------ aba alvo
function modeFor(tab) {
  const url = (tab && tab.url) || '';
  if (!/^https?:|^file:/.test(url) || /^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/.test(url)) return 'blocked';
  return 'web';
}

async function resolveTab() {
  if (FIXED_TAB) return chrome.tabs.get(FIXED_TAB);
  const query = { active: true };
  if (state.windowId != null) query.windowId = state.windowId;
  else query.currentWindow = true;
  const [tab] = await chrome.tabs.query(query);
  return tab;
}

async function refresh() {
  const tab = await resolveTab().catch(() => null);
  const changed = !state.tab || !tab || tab.id !== state.tab.id;
  state.tab = tab;
  state.mode = modeFor(tab);
  if (changed) {
    if (state.picking) cancelPick();
    state.view = 'design';
    state.capture = null;
    state.error = null;
  }
  render();
}

// ------------------------------------------------------------------ execução com status
function setProgress(text) {
  const el = document.getElementById('status-text');
  if (el) el.textContent = text;
}

async function run(label, fn) {
  if (state.busy) return;
  state.busy = label;
  state.error = null;
  render();
  try {
    await fn(setProgress);
  } catch (e) {
    state.error = String((e && e.message) || e);
    console.error(e);
  } finally {
    state.busy = null;
    render();
  }
}

// ------------------------------------------------------------------ ações: site
async function extractWeb() {
  const tab = state.tab;
  await run('Preparando…', async (progress) => {
    let shot = null;
    try {
      const live = await chrome.tabs.get(tab.id);
      if (live.active) shot = await chrome.tabs.captureVisibleTab(live.windowId, { format: 'png' });
    } catch {
      /* janela minimizada ou página protegida */
    }
    await inject(tab.id, ['content/extract.js']);
    let scan = null;
    if (state.opts.scroll) {
      progress('Rolando a página para pegar animações…');
      scan = await callContent(tab.id, 'scrollScan', [{ steps: 24, delay: 260 }]);
    }
    progress('Analisando estilos…');
    const raw = await callContent(tab.id, 'extract', [{ limit: 12000 }]);
    const mainLibs = await probeLibs(tab.id).catch(() => []);
    const model = buildWebModel(raw, { scan, mainLibs });
    state.byTab.set(tab.id, { model, shot, kind: 'web', key: pageKey(tab.url) });
    state.section = 'overview';
    toast(`Design extraído: ${model.colors.length} cores, ${model.typeScale.length} estilos de texto`);
  });
}

async function pickComponent() {
  const tab = state.tab;
  state.error = null;
  try {
    await inject(tab.id, ['content/extract.js', 'content/capture.js']);
  } catch (e) {
    state.error = String(e.message || e);
    render();
    return;
  }
  state.picking = true;
  state.pickTabId = tab.id;
  render();
  try {
    const cap = await callContent(tab.id, 'pick', [{ max: 1500 }]);
    if (cap && cap.error) throw new Error(cap.error);
    if (cap) showCapture(cap);
  } catch (e) {
    state.error = String(e.message || e);
  } finally {
    state.picking = false;
    state.pickTabId = null;
    render();
  }
}

// cancela na aba onde a pinça foi aberta (o usuário pode ter trocado de aba)
async function cancelPick() {
  if (state.pickTabId == null) return;
  try {
    await callContent(state.pickTabId, 'cancelPick');
  } catch {
    /* a aba fechou ou navegou */
  }
}

async function captureParent() {
  await run('Capturando o elemento pai…', async () => {
    const cap = await callContent(state.tab.id, 'captureRelative', ['parent', { max: 1500 }]);
    showCapture(cap);
  });
}

function showCapture(cap) {
  state.capture = cap;
  state.captureCode = null;
  state.captureFonts = null;
  state.view = 'component';
  inlineCaptureFonts(cap);
}

// A prévia roda num iframe sem origem: fonte de outro servidor sem CORS não carrega.
// Embute as fontes como data: na prévia e no .html baixado (não no CSS copiado).
async function inlineCaptureFonts(cap) {
  const urls = [...new Set((cap.fontFaces || []).flatMap((f) => [...f.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1])))]
    .filter((u) => /^https?:/.test(u))
    .slice(0, 12);
  if (!urls.length) return;
  const map = {};
  await Promise.all(urls.map(async (u) => {
    try {
      // URL da página e bytes que vão para o .html baixado: mesma regra do kit (fetchableUrl + redirecionamento)
      const { bytes, type } = await fetchBytes(u, null, cap.source && cap.source.url);
      if (bytes.length > 3 * 1024 * 1024) return;
      map[u] = `data:${type || 'font/woff2'};base64,${bytesToBase64(bytes)}`;
    } catch {
      /* fica a URL original */
    }
  }));
  if (state.capture !== cap || !Object.keys(map).length) return;
  state.captureFonts = map;
  state.captureCode = null;
  if (state.view === 'component') render();
}

// ------------------------------------------------------------------ exportação
async function downloadKit() {
  const cur = current();
  if (!cur.model) return;
  const tabId = state.tab.id;
  await run('Montando o kit…', async (progress) => {
    const opts = {
      onProgress: progress,
      includeVideos: state.opts.includeVideos,
      screenshot: cur.shot,
      // o que o painel não baixa sem cookie, a própria página baixa
      viaPage: async (url) => {
        await inject(tabId, ['content/extract.js']);
        return callContent(tabId, 'fetchAsBase64', [url]);
      },
    };
    const kit = await buildKit(cur.model, opts);
    downloadBlob(kit.blob, kit.filename);
    toast(`Kit pronto: ${kit.count} arquivos${kit.failed.length ? ` (${kit.failed.length} assets falharam — ver assets/manifest.json)` : ''}`);
  });
}

function files(model) {
  if (!state.filesCache.has(model)) state.filesCache.set(model, textFiles(model));
  return state.filesCache.get(model);
}

function downloadText(name, text) {
  const type = name.endsWith('.json') ? 'application/json' : name.endsWith('.md') ? 'text/markdown' : name.endsWith('.js') ? 'text/javascript' : 'text/css';
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), name);
}

function captureCode() {
  if (!state.captureCode) {
    const cap = state.capture;
    const assetUrls = Object.fromEntries((cap.assets || []).map((a) => [a.name, `data:${a.mime};base64,${a.base64}`]));
    const fonts = state.captureFonts || {};
    const embedded = { ...cap, fontFaces: (cap.fontFaces || []).map((f) => f.replace(/url\("([^"]+)"\)/g, (m, u) => (fonts[u] ? `url("${fonts[u]}")` : m))) };
    state.captureCode = {
      html: renderHTML(cap),
      css: [globalCss(cap), renderCSS(cap)].filter(Boolean).join('\n\n'),
      jsx: renderJSX(cap),
      doc: renderDocument(embedded),
      // sem as fontes embutidas ainda, a prévia usa fallback (evita o bloqueio de CORS no iframe sem origem)
      preview: renderDocument(state.captureFonts ? embedded : { ...cap, fontFaces: [] }, { assetUrls }),
    };
  }
  return state.captureCode;
}

function downloadCapture(tab) {
  const code = captureCode();
  const base = slugify(state.capture.root.description) || 'componente';
  if (tab === 'jsx') downloadBlob(new Blob([code.jsx], { type: 'text/javascript' }), `${componentName(state.capture)}.jsx`);
  else if (tab === 'css') downloadBlob(new Blob([code.css], { type: 'text/css' }), `${base}.css`);
  else downloadBlob(new Blob([code.doc], { type: 'text/html' }), `${base}.html`);
}

function downloadCaptureZip() {
  const cap = state.capture;
  const code = captureCode();
  const base = slugify(cap.root.description) || 'componente';
  const root = `decalque-${base}-${stamp()}`;
  const list = [
    { name: `${root}/${base}.html`, data: code.doc },
    { name: `${root}/${base}.css`, data: code.css },
    { name: `${root}/${componentName(cap)}.jsx`, data: code.jsx },
    ...(cap.assets || []).map((a) => ({ name: `${root}/assets/${a.name}`, data: base64ToBytes(a.base64) })),
  ];
  downloadBlob(createZip(list), `${root}.zip`);
}

// ------------------------------------------------------------------ fontes na prévia
function fontAlias(family) {
  const clean = String(family).replace(/["']/g, '').split(',')[0].trim();
  const key = clean.toLowerCase();
  if (!state.fonts.has(key)) {
    state.fonts.set(key, 'loading');
    loadFont(clean).catch(() => state.fonts.set(key, 'failed'));
  }
  return `"dq-${slugify(clean)}", "${clean}", system-ui, sans-serif`;
}

async function loadFont(family) {
  const model = current().model;
  const f = model && model.fonts.find((x) => x.family.toLowerCase() === family.toLowerCase());
  if (!f || f.source === 'system') return;
  let faces = (f.files || []).slice(0, 6).map((x) => ({ url: x.url, weight: x.weight, style: x.style }));
  if (!faces.length && f.source !== 'adobe') {
    const res = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap`);
    if (res.ok) {
      const css = await res.text();
      const blocks = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
      const latin = blocks.filter((b) => /U\+0000-00FF/i.test(b));
      for (const b of (latin.length ? latin : blocks).slice(0, 2)) {
        const url = (/url\(([^)]+)\)/.exec(b) || [])[1];
        if (url) faces.push({ url: url.replace(/["']/g, ''), weight: (/font-weight:\s*([^;]+)/.exec(b) || [])[1] || '400', style: (/font-style:\s*([^;]+)/.exec(b) || [])[1] || 'normal' });
      }
    }
  }
  for (const face of faces) {
    // a URL vem da página: fetchBytes aplica a mesma regra do kit (só http(s), sem rede local)
    const got = await fetchBytes(face.url, null, model.source.url).catch(() => null);
    if (!got) continue;
    const ff = new FontFace(`dq-${slugify(family)}`, got.bytes, { weight: String(face.weight), style: face.style || 'normal' });
    await ff.load();
    document.fonts.add(ff);
  }
  state.fonts.set(family.toLowerCase(), 'loaded');
}

// ------------------------------------------------------------------ desenho
function setOpt(key, value) {
  state.opts[key] = value;
  chrome.storage.local.set({ opts: state.opts });
  render();
}

function targetLabel() {
  const tab = state.tab;
  if (!tab) return '—';
  return hostOf(tab.url || '');
}

function checkbox(key, label) {
  return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!state.opts[key], onchange: (e) => setOpt(key, e.target.checked), disabled: !!state.busy }), h('span', { text: label }));
}

function webControls() {
  const cur = current();
  return h('section', { class: 'controls' },
    h('button', { class: 'primary wide', id: 'extract', onclick: extractWeb, disabled: !!state.busy || state.picking }, svgIcon('wand'), cur.model ? 'Extrair de novo' : 'Extrair design desta página'),
    checkbox('scroll', 'Rolar a página para pegar animações de rolagem e imagens lazy'),
    h('button', { class: 'ghost wide', id: 'pick', onclick: state.picking ? cancelPick : pickComponent, disabled: !!state.busy }, svgIcon(state.picking ? 'x' : 'target'), state.picking ? 'Cancelar seleção' : 'Capturar componente'),
    state.picking ? h('p', { class: 'hint', text: 'Passe o mouse e clique no elemento. Depois de clicar na página, ↑/↓ sobem ou descem um nível e Esc cancela.' }) : null);
}

function statusBar() {
  if (state.busy) return h('div', { class: 'status busy', role: 'status' }, h('span', { class: 'spinner' }), h('span', { id: 'status-text', text: state.busy }));
  if (state.error) return h('div', { class: 'status error', role: 'alert' }, h('span', { text: state.error }), h('button', { class: 'icon-btn', title: 'Fechar', onclick: () => ((state.error = null), render()) }, svgIcon('x')));
  return null;
}

function intro() {
  return h('section', { class: 'intro' },
    h('h2', { text: 'Decalque o design desta página' }),
    h('ul', {},
      ['Paleta com papéis (fundo, texto, primária…) e variáveis do site', 'Tipografia, espaçamento, raios, sombras e breakpoints', '@keyframes, transições, animações JS e reveals ao rolar', 'Imagens, SVGs, fontes e Lottie no .zip', 'Pinça: qualquer elemento → HTML/CSS e React + Tailwind'].map((t) => h('li', { text: t }))),
    h('p', { class: 'muted small', text: 'Saída: DESIGN.md (pronto para agentes de IA), tokens.css, tema Tailwind v4/v3, tokens W3C e animations.css.' }));
}

function results(cur) {
  const ctx = {
    screenshot: cur.shot,
    fontAlias,
    opts: state.opts,
    setOpt,
    busy: state.busy,
    downloadKit,
    files: () => files(cur.model),
    downloadText,
  };
  return [
    h('nav', { class: 'tabs', role: 'tablist' }, SECTIONS.map(([id, label]) => h('button', {
      role: 'tab', class: state.section === id ? 'on' : '', 'aria-selected': String(state.section === id), 'data-section': id,
      onclick: () => {
        state.section = id;
        render();
        document.getElementById('app').scrollTo({ top: 0 });
      },
    }, label))),
    h('div', { class: 'section-body' }, renderSection(state.section, cur.model, ctx)),
  ];
}

function render() {
  document.getElementById('target').textContent = targetLabel();
  const chipEl = document.getElementById('mode');
  chipEl.textContent = state.mode === 'blocked' ? '—' : 'Site';
  chipEl.dataset.mode = state.mode;
  const app = document.getElementById('app');
  const cur = current();
  let nodes;
  if (state.view === 'component' && state.capture) {
    const code = captureCode();
    nodes = [statusBar(), ...renderComponentView(state.capture, {
      code, tab: state.captureTab, previewDoc: code.preview, busy: state.busy,
      setTab: (t) => {
        state.captureTab = t;
        render();
      },
      back: () => {
        state.view = 'design';
        render();
      },
      parent: captureParent,
      again: pickComponent,
      downloadCode: downloadCapture,
      downloadZip: downloadCaptureZip,
    })];
  } else if (state.mode === 'blocked') {
    nodes = [h('section', { class: 'intro' }, h('h2', { text: 'Esta página não pode ser lida' }), h('p', { class: 'muted', text: 'O navegador não deixa extensões lerem páginas internas (chrome://, loja de extensões, PDF). Abra um site.' }))];
  } else {
    nodes = [webControls(), statusBar(), ...(cur.model ? results(cur) : [intro()])];
  }
  app.replaceChildren(...nodes.filter(Boolean));
  const activeTab = app.querySelector('nav.tabs button.on');
  if (activeTab) activeTab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  const dock = document.getElementById('dock');
  dock.hidden = !(cur.model && state.view === 'design' && state.mode !== 'blocked');
  document.getElementById('zip').disabled = !!state.busy;
}

// ------------------------------------------------------------------ início
document.getElementById('zip').addEventListener('click', downloadKit);
document.getElementById('copy-md').addEventListener('click', () => {
  const cur = current();
  if (cur.model) copyText(files(cur.model)['DESIGN.md'], 'DESIGN.md copiado — cole no seu agente de IA');
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'decalque:progress' && sender.tab && state.tab && sender.tab.id === state.tab.id) setProgress(msg.text);
});

if (!FIXED_TAB) {
  chrome.tabs.onActivated.addListener((info) => {
    if (info.windowId === state.windowId) refresh();
  });
}
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (!state.tab || tabId !== state.tab.id) return;
  const sameDoc = info.url && pageKey(info.url) === pageKey(state.tab.url);
  if (info.url && !sameDoc) {
    state.byTab.delete(tabId);
    state.view = 'design';
  }
  if ((info.url && !sameDoc) || info.status === 'complete') refresh();
});

(async () => {
  try {
    state.windowId = (await chrome.windows.getCurrent()).id;
  } catch {
    /* sem janela */
  }
  const saved = await chrome.storage.local.get(['opts']);
  if (saved.opts) Object.assign(state.opts, saved.opts);
  await refresh();
})();

// para depuração e testes ponta a ponta
globalThis.__decalque = { state };
