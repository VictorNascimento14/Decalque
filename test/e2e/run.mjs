// Teste ponta a ponta: carrega a extensão num Chromium de verdade e roda contra
// (1) uma página de teste com CSS de outra origem, animações e reveals, e (2) um Figma simulado.
// Uso: npm run e2e   (DECALQUE_HEADED=1 para ver o navegador)

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, chromiumPath } from '../../scripts/browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = join(ROOT, 'extension');
const FIX = join(ROOT, 'test', 'fixtures');
const PNG = readFileSync(join(EXT, 'icons', 'icon128.png'));
const FONT = (() => {
  try {
    return readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
  } catch {
    return null;
  }
})();

function listen(handler) {
  return new Promise((resolve) => {
    const srv = createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

const remote = await listen((req, res) => {
  if (req.url === '/remote.css') {
    res.writeHead(200, { 'content-type': 'text/css' }); // sem CORS: o content script não consegue ler sozinho
    res.end(`:root { --remote-accent: #7c3aed; }
.btn:hover { background-color: #d4ff4a; transform: translateY(-2px); }
.card:hover h3 { color: var(--primary); }
.btn-ghost:hover { border-color: var(--remote-accent); }
@keyframes float { 50% { transform: translateY(-6px); } }`);
    return;
  }
  res.writeHead(404).end();
});

const site = await listen((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(join(FIX, 'site.html'), 'utf8').replace('{{REMOTE}}', `http://127.0.0.1:${remote.port}`));
  } else if (path.startsWith('/design/')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(join(FIX, 'figma.html'), 'utf8'));
  } else if (/\.png$/.test(path)) {
    res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
  } else if (path === '/fonts/brand.ttf' && FONT) {
    res.writeHead(200, { 'content-type': 'font/ttf' }).end(FONT);
  } else if (path === '/vai-para-local') {
    res.writeHead(302, { location: `http://127.0.0.1:${site.port}/hero.png` }).end();
  } else if (path === '/anim.json') {
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"v":"5.7.4","fr":30,"ip":0,"op":60,"w":100,"h":100,"layers":[]}');
  } else res.writeHead(404).end();
});

const results = [];
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ✓ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false, error: e });
    console.log(`  ✗ ${name}\n    ${String(e.stack || e).split('\n').slice(0, 6).join('\n    ')}`);
  }
}

const userData = mkdtempSync(join(tmpdir(), 'decalque-e2e-'));
// um arquivo do disco que nenhuma página pode pôr no kit (a extensão descompactada lê file://)
const secretDir = mkdtempSync(join(tmpdir(), 'decalque-segredo-'));
const SECRET = join(secretDir, 'segredo.png');
writeFileSync(SECRET, 'CONTEUDO-SECRETO');
const downloads = mkdtempSync(join(tmpdir(), 'decalque-dl-'));
const context = await chromium.launchPersistentContext(userData, {
  executablePath: chromiumPath(),
  headless: !process.env.DECALQUE_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--host-resolver-rules=MAP www.figma.com 127.0.0.1, MAP www.site-publico.test 127.0.0.1'],
  viewport: { width: 1280, height: 800 },
  acceptDownloads: true,
});
const errors = [];

try {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  console.log(`extensão carregada: ${extId}`);

  const tabIdOf = (prefix) => sw.evaluate(async (p) => (await chrome.tabs.query({})).find((t) => (t.url || "").startsWith(p))?.id, prefix);
  const openPanel = async (tabId) => {
    const panel = await context.newPage();
    panel.on('pageerror', (e) => errors.push(`painel: ${e.message}`));
    panel.on('console', (m) => m.type() === 'error' && errors.push(`painel console: ${m.text()}`));
    await panel.goto(`chrome-extension://${extId}/sidepanel/index.html?tab=${tabId}`);
    return panel;
  };
  const modelOf = (panel, tabId) => panel.evaluate((id) => globalThis.__decalque.state.byTab.get(id)?.model, tabId);
  const saveDownload = async (panel, click) => {
    const [dl] = await Promise.all([panel.waitForEvent('download', { timeout: 60000 }), click()]);
    const file = join(downloads, dl.suggestedFilename());
    await dl.saveAs(file);
    return file;
  };
  const zipList = (file) => execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).trim().split('\n');
  const zipText = (file, name) => execFileSync('unzip', ['-p', file, name], { encoding: 'utf8' });

  // ------------------------------------------------------------ site
  console.log('\nSite de teste');
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`site: ${e.message}`));
  await page.goto(`http://localhost:${site.port}/`);
  const tabId = await tabIdOf(`http://localhost:${site.port}/`);
  const panel = await openPanel(tabId);
  await page.bringToFront();
  let model;

  await step('extrai o design com varredura de rolagem', async () => {
    await panel.click('#extract');
    await panel.waitForSelector('nav.tabs', { timeout: 90000 });
    const err = await panel.evaluate(() => globalThis.__decalque.state.error);
    assert.equal(err, null);
    model = await modelOf(panel, tabId);
    assert.ok(model, 'modelo existe');
  });

  await step('cores e papéis', async () => {
    assert.equal(model.semantic.background, '#0b0b0f');
    assert.equal(model.semantic.foreground, '#f4f4f5');
    assert.equal(model.semantic.primary, '#c6f432');
    assert.ok(model.colors.some((c) => c.value === '#18181b'), 'cor dos cards');
  });

  await step('variáveis: :root, .dark e a da folha de outra origem (via service worker)', async () => {
    const light = Object.fromEntries(model.variables.light.map((v) => [v.name, v.value]));
    assert.equal(light['--primary'], '#c6f432');
    assert.equal(light['--remote-accent'], '#7c3aed');
    assert.equal(light['--unused'], undefined);
    assert.ok(model.variables.dark.some((v) => v.name === '--bg' && v.value === '#ffffff'));
  });

  await step('tipografia e fonte auto-hospedada', async () => {
    const h1 = model.typeScale.find((t) => t.name === 'h1');
    assert.ok(h1, `escala: ${model.typeScale.map((t) => t.name)}`);
    assert.equal(h1.size, 64);
    assert.equal(h1.letterSpacing, '-0.02em');
    assert.equal(model.fonts[0].family, 'Brand Sans');
    if (FONT) assert.equal(model.fonts[0].source, 'self');
  });

  await step('espaçamento, raios, sombras e breakpoints', async () => {
    assert.ok(model.spacing.scale.some((s) => s.px === 24));
    assert.ok(model.radii.some((r) => r.value === '12px'));
    assert.ok(model.radii.some((r) => r.name === 'full'));
    assert.ok(model.shadows.some((s) => /30px -10px/.test(s.value)));
    assert.deepEqual(model.breakpoints.map((b) => b.px), [768, 1024]);
  });

  await step('movimento: @keyframes, WAAPI, transições e reveals', async () => {
    assert.ok(model.motion.keyframes.some((k) => k.name === 'spin' && k.used));
    assert.ok(model.motion.keyframes.some((k) => k.name === 'float'), '@keyframes da folha remota');
    assert.ok(model.motion.running.some((r) => r.keyframes.some((f) => /scale\(1\.3\)/.test(f.transform || ''))), 'animação via element.animate()');
    assert.ok(model.motion.easings.some((e) => e.name === 'out-expo'));
    const reveal = model.motion.reveals.find((r) => r.pattern === 'fade-up');
    assert.ok(reveal, `reveals: ${JSON.stringify(model.motion.reveals.map((r) => r.pattern))}`);
    assert.ok(reveal.count >= 3);
    assert.match(reveal.trigger, /is-in/);
  });

  await step('componentes com estado :hover vindo de CSS de outra origem', async () => {
    const primary = model.components.buttons.find((b) => b.css.background === '#c6f432');
    assert.ok(primary, 'botão primário');
    assert.equal(primary.states.hover['background-color'], '#d4ff4a');
    const pill = model.components.buttons.find((b) => b.css.background === '#7c3aed');
    assert.ok(pill, 'pílula roxa');
    assert.equal(pill.states.hover?.['box-shadow'], '#c6f432 0px 0px 0px 4px', 'classe com \\:hover escapado no nome');
    assert.ok(model.components.cards.length >= 1);
    assert.ok(model.components.inputs.length >= 1);
  });

  await step('assets: imagens, srcset, fundo, favicon, SVG com sprite e Lottie', async () => {
    const urls = model.assets.images.map((i) => i.url);
    for (const p of ['/hero.png', '/photo-2x.png', '/favicon.png', '/og.png']) assert.ok(urls.some((u) => u.endsWith(p)), p);
    assert.ok(!urls.some((u) => u.endsWith('/photo.png')), 'só a maior resolução do srcset');
    assert.ok(urls.some((u) => u.endsWith('/tight-2x.png')), 'srcset sem espaço depois da vírgula');
    const star = model.assets.svgs.find((s) => s.name === 'estrela');
    assert.ok(star, `svgs: ${model.assets.svgs.map((s) => s.name)}`);
    assert.match(star.markup, /<symbol id="icon-star"/);
    assert.match(star.markup, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.ok(model.assets.lottie.some((u) => u.endsWith('/anim.json')));
    assert.ok(model.stack.some((s) => s.name === 'Lottie'));
  });

  await step('todas as abas do painel renderizam', async () => {
    await panel.bringToFront();
    for (const id of ['colors', 'type', 'layout', 'effects', 'motion', 'components', 'assets', 'export', 'overview']) {
      await panel.click(`nav.tabs [data-section="${id}"]`);
      const n = await panel.locator('.section-body .block').count();
      assert.ok(n > 0, `aba ${id} vazia`);
    }
  });

  await step('kit .zip com tokens e assets', async () => {
    const file = await saveDownload(panel, () => panel.click('#zip'));
    const names = zipList(file);
    const has = (suffix) => names.some((n) => n.endsWith(suffix));
    for (const f of ['DESIGN.md', 'tokens.css', 'tailwind.theme.css', 'tailwind.config.js', 'tokens.json', 'animations.css', 'reveal.js', 'site-variables.css', 'screenshot.png', 'assets/manifest.json', 'assets/lottie/anim.json']) assert.ok(has(f), `falta ${f}`);
    assert.ok(names.some((n) => /assets\/images\/hero\.png$/.test(n)));
    assert.ok(names.some((n) => /assets\/svg\/estrela\.svg$/.test(n)));
    if (FONT) assert.ok(names.some((n) => /assets\/fonts\/brand\.ttf$/.test(n)), 'fonte baixada');
    const root = names[0].split('/')[0];
    const tokens = zipText(file, `${root}/tokens.css`);
    assert.match(tokens, /--color-primary: #c6f432;/);
    if (FONT) assert.match(tokens, /url\("\.\/assets\/fonts\/brand\.ttf"\)/);
    const md = zipText(file, `${root}/DESIGN.md`);
    assert.match(md, /## Movimento/);
    assert.match(md, /reveal-fade-up/);
    const manifest = JSON.parse(zipText(file, `${root}/assets/manifest.json`));
    assert.deepEqual(manifest.falhas, []);
  });

  await step('kit não baixa file://, rede local nem redirecionamento para ela a pedido de página pública', async () => {
    const got = await panel.evaluate(async ([secret, port]) => {
      const { fetchBytes } = await import('./kit.js');
      const out = {};
      const urls = [['file', `file://${secret}`], ['lan', 'http://127.0.0.1:9/x.png'], ['js', 'javascript:alert(1)'],
        ['redir', `http://www.site-publico.test:${port}/vai-para-local`]];
      for (const [k, url] of urls) {
        try {
          const { bytes } = await fetchBytes(url, null, 'https://site-publico.com/');
          out[k] = `baixou: ${new TextDecoder().decode(bytes).slice(0, 20)}`;
        } catch (e) {
          out[k] = e.message;
        }
      }
      return out;
    }, [SECRET, site.port]);
    for (const k of ['file', 'lan', 'js', 'redir']) assert.match(got[k], /^URL bloqueada/, `${k}: ${got[k]}`);
  });

  await step('pinça: captura um card com ::before, hover de ancestral e SVG', async () => {
    await panel.bringToFront();
    await panel.click('#pick');
    await page.bringToFront();
    await page.evaluate(() => scrollTo(0, 0));
    const box = await page.locator('#card1').boundingBox();
    await page.mouse.move(box.x + 6, box.y + 6);
    await page.mouse.move(box.x + 8, box.y + 8);
    // clique sintético da página (carrossel, analytics) não encerra a pinça
    await page.evaluate(() => {
      document.querySelector('#card1').click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await page.waitForTimeout(300);
    assert.equal(await panel.locator('iframe.preview').count(), 0, 'evento sintético encerrou a pinça');
    assert.equal(await page.locator('[data-decalque-ui]').count(), 1, 'a pinça continua ativa');
    await page.mouse.click(box.x + 8, box.y + 8);
    await panel.waitForSelector('iframe.preview', { timeout: 30000 });
    const code = await panel.evaluate(() => globalThis.__decalque.state.captureCode);
    assert.match(code.css, /::before \{\n  content: "";/);
    assert.match(code.css, /:hover \.h3\d+ \{\n  color: #c6f432;/);
    assert.match(code.html, /<symbol id="icon-star"/);
    assert.match(code.jsx, /group-hover\/div\d+:text-\[#c6f432\]/);
    assert.match(code.jsx, /before:content-\[''\]/);
    assert.match(code.jsx, /export default function DivCard/);
    if (FONT) {
      await panel.waitForFunction(() => !!globalThis.__decalque.state.captureFonts, null, { timeout: 15000 });
      const doc = await panel.evaluate(() => globalThis.__decalque.state.captureCode?.preview || '');
      assert.match(doc, /url\("data:font\/ttf;base64,/);
    }
  });

  await step('pinça: sobe para o elemento pai', async () => {
    await panel.click('.cap-actions button:first-child');
    await panel.waitForFunction(() => /div\.grid/.test(globalThis.__decalque.state.capture?.root?.description || ''), null, { timeout: 30000 });
    const cap = await panel.evaluate(() => globalThis.__decalque.state.capture);
    assert.equal(cap.tree.children.filter((c) => c.t === 'el').length, 3);
  });

  // ------------------------------------------------------------ Figma simulado
  console.log('\nFigma simulado');
  const fig = await context.newPage();
  fig.on('pageerror', (e) => errors.push(`figma: ${e.message}`));
  await fig.goto(`http://www.figma.com:${site.port}/design/ABC123/Mock-DS?node-id=0-1`);
  await fig.waitForFunction(() => document.title.includes('pronto'));
  const figTab = await tabIdOf(`http://www.figma.com:${site.port}/design/`);
  const fpanel = await openPanel(figTab);
  let fmodel;

  await step('detecta a API do Figma na aba', async () => {
    await fpanel.waitForFunction(() => globalThis.__decalque.state.figma?.available === true, null, { timeout: 15000 });
    const st = await fpanel.evaluate(() => globalThis.__decalque.state.figma);
    assert.equal(st.file, 'Mock DS');
    assert.equal(st.selectionCount, 1);
  });

  await step('extrai estilos, variáveis, protótipo e Figma Motion', async () => {
    await fpanel.click('button.primary.wide');
    await fpanel.waitForSelector('nav.tabs', { timeout: 60000 });
    assert.equal(await fpanel.evaluate(() => globalThis.__decalque.state.error), null);
    fmodel = await modelOf(fpanel, figTab);
    assert.equal(fmodel.colors.find((c) => c.name === 'brand-lime')?.value, '#c6f432');
    assert.ok(fmodel.colors.some((c) => c.name === 'brand-ink'), 'estilo sem uso na árvore também entra');
    const xl = fmodel.typeScale.find((t) => t.name === 'display-xl');
    assert.deepEqual([xl.size, xl.weight, xl.lineHeight, xl.letterSpacing], [64, 700, '1.1', '-0.02em']);
    assert.equal(fmodel.shadows[0].name, 'elevation-card');
    assert.deepEqual(fmodel.variables.dark.map((v) => v.value), ['#0b0b0f', 'var(--theme-surface-base)', '26']);
    assert.ok(fmodel.motion.easings.some((e) => e.name === 'out-expo'));
    assert.match(fmodel.motion.keyframes[0].css, /translate: 0px 32px/);
    assert.deepEqual(fmodel.breakpoints.map((b) => b.name), ['mobile', 'desktop']);
  });

  await step('seleção do Figma → HTML/CSS e React + Tailwind', async () => {
    await fpanel.click('.controls button.ghost.wide');
    await fpanel.waitForSelector('iframe.preview', { timeout: 30000 });
    const st = await fpanel.evaluate(() => ({ cap: globalThis.__decalque.state.capture, code: globalThis.__decalque.state.captureCode, err: globalThis.__decalque.state.error }));
    assert.equal(st.err, null);
    assert.match(st.code.css, /--surface-base: #0B0B0F;/);
    assert.match(st.code.html, /<button class="button\d+">/);
    assert.match(st.code.html, /stroke-linecap="round"/);
    assert.match(st.code.css, /url\(assets\/img-img-hash-1\.png\)/);
    assert.equal(st.cap.assets.length, 1);
    assert.match(st.code.preview, /data:image\/png;base64,/);
  });

  await step('kit do Figma com frames, ícones, imagens e vídeo', async () => {
    await fpanel.click('.cap-head button');
    await fpanel.click('nav.tabs [data-section="export"]');
    await fpanel.check('.options label:has-text("vídeo") input');
    const file = await saveDownload(fpanel, () => fpanel.click('#zip'));
    const names = zipList(file);
    for (const re of [/assets\/frames\/design\/home-desktop\.png$/, /assets\/icons\/icon-arrow-right\.svg$/, /assets\/images\/photo\.png$/, /assets\/videos\/home-desktop\.webm$/, /DESIGN\.md$/, /site-variables\.css$/]) {
      assert.ok(names.some((n) => re.test(n)), `falta ${re}`);
    }
    const root = names[0].split('/')[0];
    assert.match(zipText(file, `${root}/site-variables.css`), /\.dark, \[data-theme="dark"\] \{\n  --theme-surface-base: #0b0b0f;/);
    assert.match(zipText(file, `${root}/animations.css`), /@keyframes mock-ds|@keyframes home-desktop-hero-title/);
  });

  await step('sem a API do Figma: mostra o passo a passo', async () => {
    const blank = await context.newPage();
    await blank.goto(`http://www.figma.com:${site.port}/design/ZZZ999/Sem-api?mock=0`);
    await blank.evaluate(() => {
      delete window.figma;
      window.figma = undefined;
    });
    const t = await tabIdOf(`http://www.figma.com:${site.port}/design/ZZZ999/`);
    const p = await openPanel(t);
    await p.waitForSelector('text=A API do Figma ainda não está ativa', { timeout: 15000 });
    await p.close();
    await blank.close();
  });
} finally {
  await context.close();
  site.srv.close();
  remote.srv.close();
  rmSync(userData, { recursive: true, force: true });
  rmSync(secretDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
const realErrors = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND|404/.test(e));
if (realErrors.length) console.log(`\nErros de JS durante o teste:\n  ${realErrors.join('\n  ')}`);
console.log(`\n${results.length - failed.length}/${results.length} passos ok`);
process.exit(failed.length || realErrors.length ? 1 : 0);
