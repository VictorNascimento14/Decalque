import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../extension/lib/figma-scan.js';
import { buildFigmaModel, motionToKeyframes, parseFigmaUrl, tokenName } from '../../extension/lib/figma.js';
import { toCSS, toDesignMarkdown, toTailwindV4 } from '../../extension/lib/exporters.js';
import { restFile } from './figma-fixtures.js';

const S = globalThis.DecalqueFigmaScan;

test('URLs do Figma', () => {
  assert.deepEqual(parseFigmaUrl('https://www.figma.com/design/AbC123/Digital-Agency?node-id=1-2'), { kind: 'design', key: 'AbC123', fileKey: 'AbC123', nodeId: '1-2' });
  assert.equal(parseFigmaUrl('https://www.figma.com/design/AbC123/x/branch/Br4nch/x').key, 'Br4nch');
  assert.equal(parseFigmaUrl('https://exemplo.com/'), null);
  assert.equal(tokenName('Green/Green 60'), 'green-60');
  assert.equal(tokenName('Heading/H1 Bold'), 'heading-h1-bold');
});

test('modelo do Figma: estilos nomeados, escala, molas e breakpoints de frame', () => {
  const m = buildFigmaModel({ via: 'rest', file: { name: 'Digital Agency Company' }, scan: S.scanFile(restFile()), localStyles: [], variables: null, motion: null, failures: [] });
  const names = m.colors.map((c) => c.name);
  assert.ok(names.includes('green-60') && names.includes('grey-10') && names.includes('absolute-white'), names.join(','));
  assert.equal(m.colors.find((c) => c.name === 'green-60').value, '#c6f432');
  const h1 = m.typeScale.find((t) => t.name === 'heading-h1');
  assert.deepEqual([h1.size, h1.weight, h1.lineHeight, h1.letterSpacing], [80, 600, '1.2', '-0.02em']);
  assert.ok(m.typeScale.some((t) => t.size === 18 && t.lineHeight === '1.5'));
  assert.equal(m.fonts[0].family, 'Barlow');
  assert.deepEqual(m.breakpoints.map((b) => `${b.name}:${b.px}`), ['mobile:390', 'laptop:1440']);
  assert.deepEqual(m.radii.map((r) => r.value), ['8px', '12px']);
  assert.equal(m.motion.springs[0].name, 'spring-gentle');
  assert.equal(m.motion.springs[0].stiffness, 100);
  assert.match(m.motion.easings[0].value, /^linear\(/);
  assert.equal(m.components.figma[0].description, 'Ícone social');
  assert.equal(m.assets.figmaImages[0].ref, 'abc123');
  assert.ok(m.notes.some((n) => /API REST/.test(n)));
  const css = toCSS(m);
  assert.match(css, /--color-green-60: #c6f432;/);
  assert.match(toTailwindV4(m), /--text-heading-h1: 80px;/);
  assert.match(toDesignMarkdown(m), /## Componentes do Figma/);
});

test('variáveis do Figma com modos claro/escuro', () => {
  const snap = {
    via: 'plugin', file: { name: 'DS' }, scan: S.scanFile(restFile()), localStyles: [], motion: null, failures: [],
    variables: {
      collections: [{ id: 'c1', name: 'Theme', modes: [{ id: 'm1', name: 'Light' }, { id: 'm2', name: 'Dark' }], defaultModeId: 'm1' }],
      variables: [
        { id: 'v1', name: 'bg/default', type: 'COLOR', collectionId: 'c1', values: { m1: { color: { css: '#ffffff' } }, m2: { color: { css: '#0b0b0f' } } } },
        { id: 'v2', name: 'bg/surface', type: 'COLOR', collectionId: 'c1', values: { m1: { alias: 'bg/default' }, m2: { color: { css: '#18181b' } } } },
        { id: 'v3', name: 'radius/md', type: 'FLOAT', collectionId: 'c1', values: { m1: 8, m2: 8 } },
      ],
    },
  };
  const m = buildFigmaModel(snap);
  assert.deepEqual(m.variables.light.map((v) => `${v.name}=${v.value}`), ['--theme-bg-default=#ffffff', '--theme-bg-surface=var(--bg-default)', '--theme-radius-md=8']);
  assert.deepEqual(m.variables.dark.map((v) => `${v.name}=${v.value}`), ['--theme-bg-default=#0b0b0f', '--theme-bg-surface=#18181b', '--theme-radius-md=8']);
});

test('Figma Motion → @keyframes', () => {
  const [k] = motionToKeyframes({
    frame: 'Hero', duration: 1, nodes: [{
      name: 'Title', animations: {
        OPACITY: { baseValue: { type: 'FLOAT', value: 1 }, timelineDuration: 1, tracks: [{ id: 't1', keyframeOperation: 'SET', keyframes: [{ timelinePosition: 0, value: { type: 'FLOAT', value: 0 }, easing: { type: 'LINEAR' } }, { timelinePosition: 0.6, value: { type: 'FLOAT', value: 1 }, easing: { type: 'EASE_OUT' } }] }] },
        TRANSLATION_Y: { baseValue: { type: 'FLOAT', value: 0 }, timelineDuration: 1, tracks: [{ id: 't2', keyframeOperation: 'OFFSET', keyframes: [{ timelinePosition: 0, value: { type: 'FLOAT', value: 40 } }, { timelinePosition: 1, value: { type: 'FLOAT', value: 0 }, easing: { type: 'GENTLE' } }] }] },
      },
    }],
  });
  assert.equal(k.name, 'hero-title');
  assert.equal(k.durationMs, 1000);
  assert.match(k.css, /0% \{ opacity: 0; translate: 0px 40px; animation-timing-function: cubic-bezier\(0, 0, 0\.58, 1\); \}/);
  assert.match(k.css, /60% \{ opacity: 1; translate: 0px 16px; animation-timing-function: linear\(/);
  assert.match(k.css, /100% \{ opacity: 1; translate: 0px 0px; \}/);
  assert.equal(k.animation, 'hero-title 1000ms linear both');
});

test('Figma: alias aponta para o token com prefixo da coleção; STRING entre aspas; @keyframes com nome válido', () => {
  const S = globalThis.DecalqueFigmaScan;
  const snap = {
    via: 'plugin', file: { name: 'DS' }, localStyles: [], motion: null, failures: [],
    scan: S.scanFile({ document: { id: '0:0', type: 'DOCUMENT', children: [] } }),
    variables: {
      collections: [
        { id: 'c1', name: 'Primitives', modes: [{ id: 'm1', name: 'Value' }], defaultModeId: 'm1' },
        { id: 'c2', name: 'Semantic', modes: [{ id: 'm2', name: 'Light' }], defaultModeId: 'm2' },
      ],
      variables: [
        { id: 'v1', name: 'blue/500', type: 'COLOR', collectionId: 'c1', values: { m1: { color: { css: '#3b82f6' } } } },
        { id: 'v2', name: 'primary', type: 'COLOR', collectionId: 'c2', values: { m2: { alias: 'blue/500', collection: 'Primitives' } } },
        { id: 'v3', name: 'label', type: 'STRING', collectionId: 'c2', values: { m2: "Olá; tudo 'bem'?" } },
      ],
    },
  };
  const m = buildFigmaModel(snap);
  const light = Object.fromEntries(m.variables.light.map((v) => [v.name, v.value]));
  assert.equal(light['--primitives-blue-500'], '#3b82f6');
  assert.equal(light['--semantic-primary'], 'var(--primitives-blue-500)');
  assert.equal(light['--semantic-label'], "'Olá; tudo \\'bem\\'?'");
  const [k] = motionToKeyframes({ frame: '01 Hero', duration: 1, nodes: [{ name: 'Btn', animations: { OPACITY: { baseValue: { type: 'FLOAT', value: 1 }, timelineDuration: 1, tracks: [{ keyframeOperation: 'SET', keyframes: [{ timelinePosition: 0, value: { type: 'FLOAT', value: 0 } }, { timelinePosition: 1, value: { type: 'FLOAT', value: 1 } }] }] } } }] });
  assert.equal(k.name, 'figma-01-hero-btn');
  assert.match(k.css, /^@keyframes figma-01-hero-btn \{/);
});
