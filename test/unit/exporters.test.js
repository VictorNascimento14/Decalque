import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPalette, buildWebModel } from '../../extension/lib/model.js';
import { colorTokens, parseKeyframes, parseShadow, toCSS, toDTCG, toSiteVariablesCSS, toTailwindV3, toTailwindV4 } from '../../extension/lib/exporters.js';
import { rawPage, scanResult } from './fixtures.js';

const model = () => buildWebModel(rawPage(), { scan: scanResult(), mainLibs: [{ name: 'GSAP', version: '3.12.5', kind: 'motion' }] });

test('tokens.css', () => {
  const css = toCSS(model(), { pathFor: (u) => (u.endsWith('inter.woff2') ? 'assets/fonts/inter.woff2' : null) });
  assert.match(css, /--color-primary: #c6f432;/);
  assert.match(css, /--color-accent: #7c3aed; \/\* oklch/);
  assert.match(css, /--font-sans: 'Inter', ui-sans-serif/);
  assert.match(css, /--text-h1: 64px;/);
  assert.match(css, /--leading-h1: 1\.1;/);
  assert.match(css, /--space-4: 16px;/);
  assert.match(css, /--radius-full: 9999px;/);
  assert.match(css, /--ease-out-expo: cubic-bezier\(0\.16, 1, 0\.3, 1\);/);
  assert.match(css, /@font-face \{\n  font-family: 'Inter';\n  src: url\("\.\/assets\/fonts\/inter\.woff2"\)/);
  assert.match(css, /@import url\("https:\/\/fonts\.googleapis\.com/);
  assert.match(css, /\.text-h1 \{\n  font-family: var\(--font-heading\);/);
});

test('variáveis originais do site', () => {
  const css = toSiteVariablesCSS(model());
  assert.match(css, /:root \{\n  --background: 0 0% 4%;\n  --radius: 0\.75rem;\n\}/);
  assert.match(css, /\.dark, \[data-theme="dark"\] \{\n  --background: 0 0% 100%;/);
  assert.doesNotMatch(css, /--nao-usada/);
});

test('Tailwind v4 e v3', () => {
  const v4 = toTailwindV4(model());
  assert.match(v4, /@import "tailwindcss";/);
  assert.match(v4, /@theme \{/);
  assert.match(v4, /--text-h1--line-height: 1\.1;/);
  assert.match(v4, /--breakpoint-md: 768px;/);
  assert.match(v4, /--animate-fadeUp: fadeUp 800ms cubic-bezier\(0\.16, 1, 0\.3, 1\) both;/);
  assert.match(v4, /@keyframes fadeUp/);
  assert.match(v4, /--blur-glass: 12px;/);

  const v3 = toTailwindV3(model());
  const mod = { exports: null };
  new Function('module', v3)(mod); // o arquivo precisa ser JS válido
  const ext = mod.exports.theme.extend;
  assert.equal(ext.colors.primary, '#c6f432');
  assert.deepEqual(ext.fontSize.h1, ['64px', { lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.02em' }]);
  assert.equal(mod.exports.theme.screens.lg, '1024px');
  assert.deepEqual(ext.keyframes.fadeUp['0%'], { opacity: '0', transform: 'translateY(20px)' });
  assert.ok(ext.animation[Object.keys(ext.animation).find((k) => k.startsWith('js-'))]);
});

test('DTCG 2025.10', () => {
  const t = toDTCG(model());
  assert.deepEqual(t.color.primary.$value, { colorSpace: 'srgb', components: [0.7765, 0.9569, 0.1961], alpha: 1, hex: '#c6f432' });
  assert.equal(t.typography.h1.$value.fontFamily, '{font.family.heading}');
  assert.deepEqual(t.typography.h1.$value.fontSize, { value: 64, unit: 'px' });
  assert.equal(t.typography.h1.$value.lineHeight, 1.1);
  assert.deepEqual(t.spacing['4'].$value, { value: 16, unit: 'px' });
  assert.equal(t.shadow.sm.$type, 'shadow');
  assert.deepEqual(t.easing['out-expo'].$value, [0.16, 1, 0.3, 1]);
  assert.deepEqual(t.duration['200'].$value, { value: 200, unit: 'ms' });
});

test('parse de sombras e keyframes', () => {
  const [s] = parseShadow('rgba(0, 0, 0, 0.25) 0px 10px 30px -10px');
  assert.deepEqual([s.offsetX.value, s.offsetY.value, s.blur.value, s.spread.value, s.inset], [0, 10, 30, -10, false]);
  assert.equal(s.color.alpha, 0.25);
  const inset = parseShadow('inset 0px 1px 0px 0px #ffffff1a')[0];
  assert.equal(inset.inset, true);
  assert.deepEqual(parseKeyframes('@keyframes x { from { opacity: 0 } to { opacity: 1; translate: 0 0 } }'), { from: { opacity: '0' }, to: { opacity: '1', translate: '0 0' } });
});

test('papel que cai numa cor já nomeada vira alias', () => {
  const c = (css, extra) => ({ css, hex: css.slice(0, 7), a: 1, count: 10, text: 0, chars: 0, bg: 0, area: 0, border: 0, ibg: 0, itext: 0, link: 0, ...extra });
  const { semantic, colors } = buildPalette([
    c('#4d4d4d', { text: 50, chars: 5000 }),
    c('#171717', { text: 30, chars: 2000, bg: 12, ibg: 12, area: 50000 }),
  ], '#fafafa');
  const tokens = colorTokens({ colors, semantic });
  assert.equal(tokens.find((t) => t.name === 'primary').alias, 'foreground');
  const css = toCSS({ ...model(), colors, semantic });
  assert.match(css, /--color-primary: var\(--color-foreground\);/);
});
