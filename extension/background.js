// Decalque — service worker: abre o painel lateral pelo ícone e faz fetch entre origens para os content scripts.

import { fetchableUrl } from './lib/util.js';

const openOnClick = () => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.runtime.onInstalled.addListener(openOnClick);
chrome.runtime.onStartup.addListener(openOnClick);
// O token do Figma fica no storage.local: só páginas da extensão leem, nunca content scripts.
try {
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
} catch {
  /* navegador sem setAccessLevel no storage.local */
}

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15000;

async function readText(res) {
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new Error('grande demais');
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      reader.cancel().catch(() => {});
      throw new Error('grande demais');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.length;
  }
  return new TextDecoder().decode(all);
}

// Content scripts não podem ler CSS de outra origem (CORS); com host_permissions o worker pode.
// Só responde a content scripts em abas, só devolve texto (folhas de estilo, JSON do Lottie) e só busca o que
// fetchableUrl aceita (http(s); rede local só a partir de página local).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'decalque:fetch' || !sender.tab) return false;
  const pageUrl = sender.tab.url || sender.url;
  const href = fetchableUrl(msg.url, pageUrl);
  if (!href) {
    sendResponse({ error: 'URL bloqueada: só http(s), e rede local só a partir de página local' });
    return false;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  fetch(href, { credentials: 'omit', signal: ctrl.signal })
    .then(async (res) => {
      if (res.redirected && !fetchableUrl(res.url, pageUrl)) throw new Error('URL bloqueada: redirecionou para a rede local');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sendResponse({ text: await readText(res) });
    })
    .catch((e) => sendResponse({ error: String(e.message || e) }))
    .finally(() => clearTimeout(timer));
  return true; // resposta assíncrona
});
