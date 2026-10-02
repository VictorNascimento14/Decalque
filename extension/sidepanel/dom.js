// Helpers de DOM do painel. Todo texto vindo da página entra por textContent — nunca innerHTML.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function svgIcon(name) {
  // ícones de traço simples (desenhados aqui, sem dependência)
  const paths = {
    copy: 'M9 9h10v10H9zM5 15V5h10',
    download: 'M12 4v11m0 0-4-4m4 4 4-4M5 19h14',
    target: 'M12 3v3m0 12v3m9-9h-3M6 12H3m15 0a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-4 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
    wand: 'm4 20 11-11m2-5v3m3 1h-3m1-4-2 2M14 4l-1 1m6 6-1-1',
    up: 'M12 19V5m0 0-6 6m6-6 6 6',
    back: 'M19 12H5m0 0 6-6m-6 6 6 6',
    refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
    play: 'M8 5v14l11-7z',
    x: 'M6 6l12 12M18 6 6 18',
    figma: 'M9 3h3v6H9a3 3 0 0 1 0-6Zm3 0h3a3 3 0 0 1 0 6h-3Zm0 6h3a3 3 0 1 1 0 6 3 3 0 0 1-3-3Zm-3 0h3v6H9a3 3 0 0 1 0-6Zm0 6h3v3a3 3 0 1 1-3-3Z',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', paths[name] || '');
  p.setAttribute('fill', name === 'play' ? 'currentColor' : 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.8');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  svg.append(p);
  return svg;
}

let toastTimer = null;
export function toast(text, kind = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.dataset.kind = kind;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export async function copyText(text, label = 'Copiado') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(label);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function svgDataUrl(markup) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

export function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
