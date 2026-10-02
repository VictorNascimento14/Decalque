// Fumaça em sites reais (precisa de internet): extrai, gera o kit e imprime um resumo por site.
// Uso: node test/e2e/real-sites.mjs [url ...]

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, chromiumPath } from '../../scripts/browser.mjs';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');
const urls = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['https://tailwindcss.com/', 'https://linear.app/', 'https://stripe.com/br', 'https://www.framer.com/', 'https://vercel.com/'];

const userData = mkdtempSync(join(tmpdir(), 'decalque-real-'));
const context = await chromium.launchPersistentContext(userData, {
  executablePath: chromiumPath(),
  headless: !process.env.DECALQUE_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;

for (const url of urls) {
  const errors = [];
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(1500);
    const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => (t.url || '').startsWith(u.split('#')[0].replace(/\/$/, '')))?.id, page.url());
    const panel = await context.newPage();
    panel.on('pageerror', (e) => errors.push(e.message));
    await panel.goto(`chrome-extension://${extId}/sidepanel/index.html?tab=${tabId}`);
    await page.bringToFront();
    const t0 = Date.now();
    await panel.click('#extract');
    await panel.waitForFunction(() => !globalThis.__decalque.state.busy && (globalThis.__decalque.state.error || document.querySelector('nav.tabs')), null, { timeout: 120000 });
    const ms = Date.now() - t0;
    const st = await panel.evaluate((id) => {
      const s = globalThis.__decalque.state;
      const m = s.byTab.get(id)?.model;
      if (!m) return { error: s.error };
      return {
        error: s.error,
        semantic: m.semantic,
        colors: m.colors.length,
        oklch: m.colors.filter((c) => c.original).length,
        fonts: m.fonts.map((f) => `${f.family}(${f.role || '-'},${f.source})`).join(', '),
        type: m.typeScale.map((t) => `${t.name}:${t.size}`).join(' '),
        spacing: `${m.spacing.base || '-'} [${m.spacing.scale.map((x) => x.px).join(',')}]`,
        radii: m.radii.map((r) => `${r.name}=${r.value}`).join(' '),
        shadows: m.shadows.length,
        bp: m.breakpoints.map((b) => b.px).join(','),
        vars: `${m.variables.light.length}/${m.variables.dark.length}`,
        motion: `kf ${m.motion.keyframes.filter((k) => k.used).length}/${m.motion.keyframes.length} · js ${m.motion.running.length} · reveals ${m.motion.reveals.map((r) => `${r.pattern}×${r.count}`).join(',') || 0} · ease ${m.motion.easings.map((e) => e.name).join(',')}`,
        comps: `btn ${m.components.buttons.length} · input ${m.components.inputs.length} · card ${m.components.cards.length} · link ${m.components.links.length}`,
        assets: `img ${m.assets.images.length} · svg ${m.assets.svgs.length} · fontes ${m.assets.fonts.length} · lottie ${m.assets.lottie.length} · video ${m.assets.videos.length}`,
        stack: m.stack.map((x) => x.name + (x.version ? ` ${x.version}` : '')).join(', '),
        notes: m.notes,
        stats: m.stats,
      };
    }, tabId);
    let kit = '';
    if (!st.error) {
      const [dl] = await Promise.all([panel.waitForEvent('download', { timeout: 180000 }), panel.click('#zip')]);
      const f = join(process.env.DECALQUE_KEEP || userData, dl.suggestedFilename());
      await dl.saveAs(f);
      kit = `${dl.suggestedFilename()}`;
      const failed = await panel.evaluate(() => document.getElementById('toast')?.textContent || '');
      kit += ` — ${failed}`;
    }
    console.log(`\n■ ${url}  (${(ms / 1000).toFixed(1)} s)`);
    for (const [k, v] of Object.entries(st)) if (v != null && k !== 'stats') console.log(`  ${k.padEnd(9)} ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    console.log(`  elementos ${JSON.stringify(st.stats?.elements)} ms ${JSON.stringify(st.stats?.ms)}`);
    if (kit) console.log(`  kit      ${kit}`);
    if (errors.length) console.log(`  ERROS JS: ${errors.join(' | ')}`);
    await panel.close();
  } catch (e) {
    console.log(`\n■ ${url}\n  FALHOU: ${e.message.split('\n')[0]}`);
  }
  await page.close();
}
await context.close();
rmSync(userData, { recursive: true, force: true });
