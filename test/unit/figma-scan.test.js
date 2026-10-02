import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../extension/lib/figma-scan.js';
import { restFile } from './figma-fixtures.js';

const S = globalThis.DecalqueFigmaScan;

test('scan de um arquivo no formato REST', () => {
  const r = S.scanFile(restFile());
  assert.equal(r.frames.length, 5);
  assert.equal(r.nodes, 12); // a camada oculta não conta
  assert.deepEqual(r.styles.map((s) => s.name).sort(), ['Absolute/White', 'Green/Green 60', 'Grey/Grey 10', 'Heading/H1']);
  assert.equal(r.styles.find((s) => s.name === 'Green/Green 60').value.paints[0].css, '#c6f432');
  assert.equal(r.gradients[0].css, 'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)');
  assert.deepEqual(r.icons.map((i) => i.name), ['icon/arrow', 'Facebook']);
  assert.equal(r.images[0].ref, 'abc123');
  assert.equal(r.shadows[0].css, '0px 4px 8px 0px #00000040');
  assert.equal(r.transitions[0].durationMs, 300);
  assert.ok(!r.text.some((t) => t.family === 'Comic Sans'), 'camada oculta fica de fora');
});

test('conversões do plugin API para o formato REST', () => {
  const p = S.pluginPaintToRest({ type: 'GRADIENT_LINEAR', gradientTransform: [[0, 1, 0], [-1, 0, 1]], gradientStops: [{ position: 0, color: { r: 0, g: 0, b: 0, a: 1 } }, { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } }] });
  assert.equal(S.gradientCss(p), 'linear-gradient(180deg, #000000 0%, #ffffff 100%)');
  const t = S.textStyle(S.pluginTextToRest({ fontName: { family: 'Inter', style: 'Semi Bold Italic' }, fontSize: 20, lineHeight: { unit: 'PERCENT', value: 140 }, letterSpacing: { unit: 'PERCENT', value: -2 }, textCase: 'UPPER' }));
  assert.deepEqual([t.weight, t.italic, t.lineHeight, t.letterSpacing], [600, true, '1.4', '-0.4px']);
  assert.equal(S.weightFromStyle('ExtraBold'), 800);
  assert.equal(S.weightFromStyle('Black'), 900);
});
