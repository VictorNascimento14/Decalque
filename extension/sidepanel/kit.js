// Monta o kit .zip: arquivos de tokens + assets baixados (imagens, SVGs, fontes, Lottie, frames do Figma).

import {
  revealScript, toAnimationsCSS, toCSS, toDesignMarkdown, toDTCG, toSiteVariablesCSS, toTailwindV3, toTailwindV4,
} from '../lib/exporters.js';
import { restImageFills, restRenderUrls } from '../lib/figma.js';
import { createZip } from '../lib/zip.js';
import { fetchableUrl, hostOf, slugify, stamp } from '../lib/util.js';
import { base64ToBytes } from './dom.js';

const MAX_FILE = 30 * 1024 * 1024;
const MAX_TOTAL = 300 * 1024 * 1024;
const EXT_BY_TYPE = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif',
  'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'font/woff2': 'woff2',
  'font/woff': 'woff', 'font/ttf': 'ttf', 'font/otf': 'otf', 'application/json': 'json', 'video/mp4': 'mp4', 'video/webm': 'webm',
};

function decodeDataUrl(url) {
  const comma = url.indexOf(',');
  if (comma < 0) throw new Error('data: inválida');
  const meta = url.slice(5, comma).split(';');
  const payload = url.slice(comma + 1);
  if (meta.includes('base64')) return { bytes: base64ToBytes(payload), type: meta[0] || 'application/octet-stream' };
  let text = payload;
  try {
    text = decodeURIComponent(payload);
  } catch {
    /* "%" solto: usa como está */
  }
  return { bytes: new TextEncoder().encode(text), type: meta[0] || 'text/plain' };
}

// Lê a resposta com teto de tamanho (sem carregar um arquivo gigante inteiro na memória).
async function readLimited(res, max = MAX_FILE) {
  if (Number(res.headers.get('content-length') || 0) > max) throw new Error('arquivo grande demais (> 30 MB)');
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      reader.cancel().catch(() => {});
      throw new Error('arquivo grande demais (> 30 MB)');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

async function fetchWithTimeout(url, pageUrl, ms = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { credentials: 'omit', signal: ctrl.signal });
    if (res.redirected && !fetchableUrl(res.url, pageUrl)) throw new Error('URL bloqueada: redirecionou para a rede local');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { bytes: await readLimited(res), type: (res.headers.get('content-type') || '').split(';')[0] };
  } finally {
    clearTimeout(timer);
  }
}

// Busca pelo painel sem cookies (tem permissão de host, sem CORS); se falhar, pede para a própria página,
// que manda os cookies e o Referer dela como faria ao exibir a imagem (e lê blob:).
// A URL vem da página: passa pela mesma regra do service worker (fetchableUrl) antes de qualquer busca.
export async function fetchBytes(url, viaPage, pageUrl) {
  if (url.startsWith('data:')) return decodeDataUrl(url);
  if (!url.startsWith('blob:')) {
    const href = fetchableUrl(url, pageUrl);
    if (!href) throw new Error('URL bloqueada: só http(s), e rede local só a partir de página local');
    try {
      return await fetchWithTimeout(href, pageUrl);
    } catch (e) {
      if (/grande demais|bloqueada/.test(e.message)) throw e;
    }
  }
  if (!viaPage) throw new Error('falha no download');
  const r = await viaPage(url);
  return { bytes: base64ToBytes(r.base64), type: (r.type || '').split(';')[0] };
}

class Files {
  constructor(root) {
    this.root = root;
    this.list = [];
    this.used = new Set();
    this.total = 0;
    this.index = [];
    this.failed = [];
  }

  name(folder, base, ext) {
    const clean = (slugify(base, 60) || 'arquivo').replace(/-+$/, '');
    let path = `${folder}/${clean}.${ext}`;
    for (let i = 2; this.used.has(path); i++) path = `${folder}/${clean}-${i}.${ext}`;
    this.used.add(path);
    return path;
  }

  add(path, data, meta) {
    const size = typeof data === 'string' ? data.length : data.length;
    if (size > MAX_FILE) throw new Error('arquivo grande demais (> 30 MB)');
    if (this.total + size > MAX_TOTAL) throw new Error('kit passou de 300 MB');
    this.total += size;
    this.list.push({ name: `${this.root}/${path}`, data });
    if (meta) this.index.push({ path, ...meta });
  }
}

function baseFromUrl(url) {
  if (url.startsWith('data:')) return 'embutida';
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || u.hostname);
    return last.replace(/\.[a-z0-9]{2,5}$/i, '');
  } catch {
    return 'arquivo';
  }
}

function extFrom(url, type, fallback) {
  if (EXT_BY_TYPE[type]) return EXT_BY_TYPE[type];
  const m = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url.startsWith('data:') ? '' : url);
  return m ? m[1].toLowerCase() : fallback;
}

async function pool(items, limit, fn) {
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

async function webAssets(model, files, opts, progress) {
  const jobs = [];
  for (const img of model.assets.images) jobs.push({ url: img.url, folder: img.kind === 'favicon' || img.kind === 'og' ? 'assets/meta' : 'assets/images', kind: img.kind });
  for (const f of model.assets.fonts) jobs.push({ url: f.url, folder: 'assets/fonts', kind: 'font', font: f });
  for (const l of model.assets.lottie) jobs.push({ url: l, folder: 'assets/lottie', kind: 'lottie' });
  if (opts.includeVideos) for (const v of model.assets.videos) jobs.push({ url: v.url, folder: 'assets/videos', kind: 'video' });
  for (const r of [...(model.assets.rive || []), ...(model.assets.models || [])]) jobs.push({ url: r, folder: 'assets/3d', kind: 'outro' });

  const urlToPath = new Map();
  let done = 0;
  await pool(jobs, 6, async (job) => {
    try {
      const { bytes, type } = await fetchBytes(job.url, opts.viaPage, model.source.url);
      if (job.kind === 'lottie' && /json/.test(type + job.url)) {
        const head = new TextDecoder().decode(bytes.slice(0, 4000));
        if (!/"layers"\s*:/.test(head) && !/"v"\s*:/.test(head)) throw new Error('não é Lottie');
      }
      const ext = extFrom(job.url, type, job.kind === 'font' ? 'woff2' : 'bin');
      const path = files.name(job.folder, baseFromUrl(job.url), ext);
      files.add(path, bytes, { kind: job.kind, url: job.url.startsWith('data:') ? 'data: (embutida)' : job.url, bytes: bytes.length });
      urlToPath.set(job.url, path);
    } catch (e) {
      files.failed.push({ url: job.url, kind: job.kind, error: String(e.message || e) });
    }
    done++;
    if (done % 4 === 0 || done === jobs.length) progress(`Baixando assets… ${done}/${jobs.length}`);
  });

  model.assets.svgs.forEach((s) => {
    const path = files.name('assets/svg', s.name || 'icone', 'svg');
    files.add(path, s.markup, { kind: 'svg', note: `${s.w}×${s.h}, ${s.count}× na página` });
  });
  return urlToPath;
}

async function figmaAssets(model, files, opts, progress) {
  const fig = opts.figma;
  const frames = opts.frames === 'none' ? [] : model.assets.frames.filter((f) => opts.frames === 'all' || f.page === fig.currentPage).slice(0, 60);
  const icons = opts.icons ? model.assets.icons.slice(0, 300) : [];
  const images = opts.images ? model.assets.figmaImages.slice(0, 150) : [];
  const videos = opts.videos ? (model.motion.timelines || []).slice(0, 8) : [];
  const scaleFor = (f) => (f.height * opts.scale > 12000 ? Math.max(0.25, 12000 / f.height) : opts.scale);
  let done = 0;
  const total = frames.length + icons.length + images.length + videos.length;
  const tick = () => {
    done++;
    progress(`Exportando do Figma… ${done}/${total}`);
  };
  const fail = (what, e) => files.failed.push({ url: what, kind: 'figma', error: String(e.message || e) });

  if (fig.via === 'plugin') {
    for (const f of frames) {
      try {
        const r = await fig.call('exportNode', [f.id, { format: 'PNG', scale: scaleFor(f) }]);
        files.add(files.name(`assets/frames/${slugify(f.page) || 'pagina'}`, f.name, 'png'), base64ToBytes(r.base64), { kind: 'frame', note: `${f.page} › ${f.name}` });
      } catch (e) {
        fail(f.name, e);
      }
      tick();
    }
    for (const ic of icons) {
      try {
        const r = await fig.call('exportNode', [ic.id, { format: 'SVG' }]);
        files.add(files.name('assets/icons', ic.name, 'svg'), r.text, { kind: 'icon', note: `${ic.width}×${ic.height}` });
      } catch (e) {
        fail(ic.name, e);
      }
      tick();
    }
    for (const im of images) {
      try {
        const r = await fig.call('imageBytes', [im.ref]);
        files.add(files.name('assets/images', im.names[0] || im.ref.slice(0, 10), r.ext), base64ToBytes(r.base64), { kind: 'image', note: im.names.join(', ') });
      } catch (e) {
        fail(im.names[0] || im.ref, e);
      }
      tick();
    }
    for (const v of videos) {
      try {
        const r = await fig.call('exportNode', [v.frameId, { format: 'WEBM' }]);
        files.add(files.name('assets/videos', v.frame, r.ext), base64ToBytes(r.base64), { kind: 'video', note: `${v.durationMs}ms` });
      } catch (e) {
        fail(`${v.frame} (vídeo)`, e);
      }
      tick();
    }
    return;
  }

  // API REST: 1 chamada por lote de render + downloads diretos das URLs (não contam no limite).
  // Erro numa chamada (ex.: 429) marca só aquele grupo como falho; o kit sai com o resto.
  const urlsOrFail = async (what, list, fn) => {
    try {
      return await fn();
    } catch (e) {
      for (const x of list) fail(`${what}: ${x.name || x.ref}`, e);
      return {};
    }
  };
  const grab = async (url, folder, base, ext, meta) => {
    try {
      const { bytes } = await fetchBytes(url, null, model.source.url);
      files.add(files.name(folder, base, ext), bytes, meta);
    } catch (e) {
      fail(base, e);
    }
    tick();
  };
  if (frames.length) {
    const urls = await urlsOrFail('frame', frames, () => restRenderUrls(fig.key, fig.token, frames.map((f) => f.id), { format: 'png', scale: opts.scale }));
    await pool(frames, 4, (f) => (urls[f.id] ? grab(urls[f.id], `assets/frames/${slugify(f.page) || 'pagina'}`, f.name, 'png', { kind: 'frame', note: `${f.page} › ${f.name}` }) : tick()));
  }
  if (icons.length) {
    const urls = await urlsOrFail('ícone', icons, () => restRenderUrls(fig.key, fig.token, icons.map((i) => i.id), { format: 'svg' }));
    await pool(icons, 6, (ic) => (urls[ic.id] ? grab(urls[ic.id], 'assets/icons', ic.name, 'svg', { kind: 'icon' }) : tick()));
  }
  if (images.length) {
    const urls = await urlsOrFail('imagem', images, () => restImageFills(fig.key, fig.token));
    await pool(images, 4, (im) => (urls[im.ref] ? grab(urls[im.ref], 'assets/images', im.names[0] || im.ref.slice(0, 10), 'png', { kind: 'image' }) : tick()));
  }
}

export async function buildKit(model, opts) {
  const progress = opts.onProgress || (() => {});
  const label = model.source.kind === 'figma' ? slugify(model.source.title) || 'figma' : slugify(hostOf(model.source.url));
  const root = `decalque-${label}-${stamp()}`;
  const files = new Files(root);

  let urlToPath = new Map();
  if (model.source.kind === 'figma') await figmaAssets(model, files, opts, progress);
  else urlToPath = await webAssets(model, files, opts, progress);
  if (opts.screenshot) {
    try {
      files.add('screenshot.png', base64ToBytes(opts.screenshot.split(',')[1]), { kind: 'screenshot', note: 'viewport no momento da captura' });
    } catch {
      /* sem screenshot */
    }
  }

  progress('Gerando arquivos de tokens…');
  const pathFor = (url) => urlToPath.get(url) || null;
  const animations = toAnimationsCSS(model);
  const siteVars = toSiteVariablesCSS(model);
  const present = { 'animations.css': !!animations, 'reveal.js': !!(model.motion.reveals || []).length, 'site-variables.css': !!siteVars };
  const text = [
    ['DESIGN.md', toDesignMarkdown(model, { files: present, assetIndex: files.index })],
    ['tokens.css', toCSS(model, { pathFor })],
    ['tailwind.theme.css', toTailwindV4(model)],
    ['tailwind.config.js', toTailwindV3(model)],
    ['tokens.json', JSON.stringify(toDTCG(model), null, 2)],
    ['animations.css', animations],
    ['reveal.js', present['reveal.js'] ? revealScript() : null],
    ['site-variables.css', siteVars],
    ['decalque.json', JSON.stringify(model, null, 1)],
    ['assets/manifest.json', JSON.stringify({ arquivos: files.index, falhas: files.failed }, null, 2)],
  ];
  for (const [name, data] of text) if (data) files.add(name, data);
  progress('Compactando…');
  return { blob: createZip(files.list), filename: `${root}.zip`, count: files.list.length, failed: files.failed, bytes: files.total };
}

export function textFiles(model) {
  return {
    'DESIGN.md': toDesignMarkdown(model, { files: { 'animations.css': !!toAnimationsCSS(model), 'reveal.js': !!(model.motion.reveals || []).length } }),
    'tokens.css': toCSS(model),
    'tailwind.theme.css': toTailwindV4(model),
    'tailwind.config.js': toTailwindV3(model),
    'tokens.json': JSON.stringify(toDTCG(model), null, 2),
    'animations.css': toAnimationsCSS(model),
    'site-variables.css': toSiteVariablesCSS(model),
  };
}
