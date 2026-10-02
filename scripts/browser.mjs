// Acha um Chromium que aceite extensões (o Chrome de marca ignora --load-extension desde a v137).
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

export function chromiumPath() {
  if (process.env.DECALQUE_CHROMIUM) return process.env.DECALQUE_CHROMIUM;
  try {
    const p = chromium.executablePath();
    if (existsSync(p)) return p;
  } catch {
    /* sem o navegador da versão exata */
  }
  const cache = join(homedir(), '.cache', 'ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    const exe = join(cache, d, 'chrome-linux64', 'chrome');
    if (existsSync(exe)) return exe;
  }
  throw new Error('Nenhum Chromium encontrado. Rode: npx playwright install chromium');
}

export { chromium };
