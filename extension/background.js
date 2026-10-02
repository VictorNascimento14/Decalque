// Decalque — service worker: abre o painel lateral pelo ícone e faz fetch entre origens para os content scripts.

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

// localhost, IPs privados e de link-local: só quando a própria página também é local (ex.: site em desenvolvimento).
function isPrivateHost(host) {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '0.0.0.0') return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
  }
  return h === '::1' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h);
}

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
// Só responde a content scripts em abas, só http(s) e só devolve texto (folhas de estilo, JSON do Lottie).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'decalque:fetch' || !sender.tab) return false;
  let url;
  try {
    url = new URL(msg.url);
  } catch {
    sendResponse({ error: 'URL inválida' });
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    sendResponse({ error: 'protocolo não suportado' });
    return false;
  }
  let pageHost = '';
  try {
    pageHost = new URL(sender.tab.url || sender.url || '').hostname;
  } catch {
    /* sem URL da aba */
  }
  if (isPrivateHost(url.hostname) && !isPrivateHost(pageHost)) {
    sendResponse({ error: 'endereço de rede local bloqueado' });
    return false;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  fetch(url.href, { credentials: 'omit', signal: ctrl.signal })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sendResponse({ text: await readText(res) });
    })
    .catch((e) => sendResponse({ error: String(e.message || e) }))
    .finally(() => clearTimeout(timer));
  return true; // resposta assíncrona
});
