import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breakpointScale, buildPalette, buildTypeScale, buildWebModel, radiusScale, spacingScale } from '../../extension/lib/model.js';
import { rawPage, scanResult } from './fixtures.js';

const model = () => buildWebModel(rawPage(), { scan: scanResult(), mainLibs: [{ name: 'GSAP', version: '3.12.5', kind: 'motion' }] });

test('papéis semânticos das cores', () => {
  const m = model();
  assert.equal(m.semantic.background, '#0b0b0f');
  assert.equal(m.semantic.foreground, '#f4f4f5');
  assert.equal(m.semantic.muted, '#a1a1aa');
  assert.equal(m.semantic.primary, '#c6f432');
  assert.equal(m.semantic.surface, '#18181b');
  assert.equal(m.semantic.border, '#27272a');
  const primary = m.colors.find((c) => c.role === 'primary');
  assert.equal(primary.name, 'primary');
  const violet = m.colors.find((c) => c.hex === '#7c3aed');
  assert.equal(violet.original, 'oklch(54.1% 0.281 293.009)');
  assert.equal(violet.role, 'accent'); // cromática com matiz longe da primária
  assert.equal(m.colors.find((c) => c.value === '#00000040').name, 'black-a25');
});

test('tipografia: nomes por tag, famílias e Google Fonts', () => {
  const m = model();
  const names = m.typeScale.map((t) => t.name);
  assert.ok(names.includes('h1') && names.includes('h2') && names.includes('body') && names.includes('button') && names.includes('overline'), names.join(','));
  const h1 = m.typeScale.find((t) => t.name === 'h1');
  assert.equal(h1.lineHeight, '1.1');
  assert.equal(h1.letterSpacing, '-0.02em');
  assert.equal(m.fonts[0].family, 'Inter');
  assert.equal(m.fonts[0].role, 'sans');
  assert.equal(m.fonts[0].source, 'self');
  assert.equal(m.fonts[1].role, 'heading');
  assert.equal(m.fonts[1].source, 'google');
  assert.match(m.fonts.googleUrl, /family=Space\+Grotesk:wght@700/);
});

test('escalas de espaçamento, raio, breakpoints e movimento', () => {
  const m = model();
  assert.equal(m.spacing.base, 8);
  assert.deepEqual(m.spacing.scale.map((s) => s.px), [8, 12, 16, 24, 32, 48, 64]);
  assert.deepEqual(m.radii.map((r) => r.name), ['sm', 'md', 'full']);
  assert.deepEqual(m.breakpoints.map((b) => `${b.name}:${b.px}`), ['sm:640', 'md:768', 'lg:1024', 'xl:1280']);
  assert.deepEqual(m.motion.durations.map((d) => d.ms), [200, 600, 800]);
  assert.ok(m.motion.easings.some((e) => e.name === 'out-expo'));
  assert.ok(m.motion.easings.some((e) => e.name === 'standard'));
  assert.equal(m.motion.reveals.length, 1);
  assert.equal(m.motion.running.length, 1);
  assert.ok(m.stack.some((s) => s.name === 'GSAP' && s.version === '3.12.5'));
});

test('escalas isoladas', () => {
  assert.equal(spacingScale([{ px: 4, count: 10 }, { px: 8, count: 10 }, { px: 12, count: 10 }, { px: 6, count: 1 }]).base, 4);
  assert.deepEqual(radiusScale([{ value: '50%', count: 3 }, { value: '4px', count: 2 }]).map((r) => r.name), ['md', 'full']);
});

test('heurísticas: texto principal por contraste, botão neutro como primária, superfície e breakpoints vizinhos', () => {
  const c = (css, extra) => ({ css, hex: css.slice(0, 7), a: 1, count: 10, text: 0, chars: 0, bg: 0, area: 0, border: 0, ibg: 0, itext: 0, link: 0, ...extra });
  const { semantic } = buildPalette([
    c('#4d4d4d', { text: 50, chars: 5000 }), // corpo cinza
    c('#171717', { text: 30, chars: 2000, bg: 12, ibg: 12, area: 50000 }), // títulos e botões pretos
    c('#f2f2f2', { bg: 30, area: 900000 }),
    c('#297a3a', { text: 2, chars: 20, ibg: 2 }),
    { ...c('#000000'), a: 0.08, css: '#00000014', border: 80 },
  ], '#fafafa');
  assert.equal(semantic.foreground, '#171717');
  assert.equal(semantic.muted, '#4d4d4d');
  assert.equal(semantic.primary, '#171717');
  assert.equal(semantic.accent, '#297a3a');
  assert.equal(semantic.surface, '#f2f2f2');
  assert.equal(semantic.border, '#00000014');
  assert.deepEqual(breakpointScale([{ px: 600, count: 3 }, { px: 601, count: 5 }, { px: 960, count: 2 }, { px: 961, count: 1 }]).map((b) => b.px), [600, 960]);
  const scale = buildTypeScale([
    { family: 'Inter', size: 12, weight: 400, lineHeight: '16px', chars: 100, tags: {} },
    { family: 'Inter', size: 12, weight: 400, lineHeight: '18px', chars: 50, tags: {} },
    { family: 'Inter', size: 12, weight: 600, lineHeight: '16px', chars: 80, tags: {} },
    { family: 'Inter', size: 16, weight: 400, lineHeight: '24px', chars: 900, tags: { p: 3 } },
  ], new Map());
  assert.deepEqual(scale.map((t) => t.name), ['body', 'small', 'xs']);
  assert.equal(scale.find((t) => t.name === 'small').lineHeight, '1.333');
});
