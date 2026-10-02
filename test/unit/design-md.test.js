import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWebModel } from '../../extension/lib/model.js';
import { revealScript, toAnimationsCSS, toCSS, toDesignMarkdown, toTailwindV3, toTailwindV4 } from '../../extension/lib/exporters.js';
import { rawPage, scanResult } from './fixtures.js';

const model = () => buildWebModel(rawPage(), { scan: scanResult(), mainLibs: [{ name: 'GSAP', version: '3.12.5', kind: 'motion' }] });

test('animations.css e reveal.js', () => {
  const css = toAnimationsCSS(model());
  assert.match(css, /\.animate-fadeUp \{ animation: fadeUp 800ms/);
  assert.match(css, /@keyframes js-div-card-1 \{\n  0% \{ opacity: 0; transform: scale\(0\.9\); \}/);
  assert.match(css, /\.animate-js-div-card-1 \{ animation: js-div-card-1 500ms ease-out forwards; \}/);
  assert.match(css, /@keyframes spin/); // definido e não usado
  assert.match(css, /\.reveal-fade-up \{ opacity: 0; translate: 0px 40px; transition: opacity 800ms cubic-bezier/);
  assert.match(css, /\.reveal-fade-up\.is-visible \{ opacity: 1; translate: 0 0; \}/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(revealScript(), /IntersectionObserver/);
});

test('DESIGN.md', () => {
  const md = toDesignMarkdown(model(), { assetIndex: [{ path: 'assets/images/hero.webp', kind: 'img', url: 'https://exemplo.com/hero.webp' }] });
  for (const h of ['## Como aplicar no seu projeto', '## Cores', '## Tipografia', '## Espaçamento, forma e profundidade', '## Componentes recorrentes', '## Movimento', '## Assets']) assert.ok(md.includes(h), h);
  assert.match(md, /tema escuro \(fundo `#0b0b0f`\)/);
  assert.match(md, /\.btn-primario-1:hover \{\n  background-color: #d4ff4a;\n\}/);
  assert.match(md, /\.btn-contorno-2 \{/);
  assert.match(md, /`reveal-fade-up`/);
  assert.match(md, /Next\.js, Tailwind CSS, GSAP 3\.12\.5/);
  assert.match(md, /assets\/images\/hero\.webp/);
});

test('título com */ não escapa do comentário (tailwind.config.js não executa código da página)', () => {
  const raw = rawPage();
  raw.meta.title = 'Acme */ globalThis.__pwned = 1; /*\nlinha 2';
  raw.meta.url = 'https://exemplo.com/a*/b';
  const scan = scanResult();
  scan.reveals[0].trigger = 'classe .x*/ @import url(//evil/x.css); /*';
  const m = buildWebModel(raw, { scan });
  const v3 = toTailwindV3(m);
  const mod = { exports: null };
  new Function('module', v3)(mod);
  assert.equal(globalThis.__pwned, undefined);
  assert.ok(mod.exports.theme);
  for (const out of [toCSS(m), toTailwindV4(m), toAnimationsCSS(m)]) {
    assert.doesNotMatch(out, /\*\/ globalThis|\*\/ @import/);
  }
  assert.doesNotMatch(toDesignMarkdown(m).split('\n')[0], /\n|linha 2.*\n/);
});
