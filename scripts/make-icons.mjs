// Gera os PNGs do ícone a partir de extension/icons/logo.svg (renderizado pelo Chromium).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, chromiumPath } from './browser.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');
const svg = readFileSync(join(dir, 'logo.svg'), 'utf8');
const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: join(dir, `icon${size}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`icon${size}.png`);
}
await browser.close();
