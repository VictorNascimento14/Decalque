import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easingName, parseTimeMs, prettyFamily, slugify, splitTopLevel, springToLinear, uniqueNamer } from '../../extension/lib/util.js';

test('splitTopLevel respeita parênteses e aspas', () => {
  assert.deepEqual(splitTopLevel('a, rgb(1, 2, 3), "x,y"'), ['a', 'rgb(1, 2, 3)', '"x,y"']);
  assert.deepEqual(splitTopLevel('color: red; background: url(data:a;b)', ';'), ['color: red', 'background: url(data:a;b)']);
});

test('utilidades de nome e tempo', () => {
  assert.equal(slugify('Ação Primária / 2'), 'acao-primaria-2');
  assert.equal(prettyFamily('__Inter_d65c78'), 'Inter');
  assert.equal(prettyFamily('__Space_Grotesk_a1b2c3'), 'Space Grotesk');
  assert.equal(parseTimeMs('0.3s'), 300);
  assert.equal(parseTimeMs('150ms'), 150);
  const name = uniqueNamer();
  assert.deepEqual([name('a'), name('a'), name('a')], ['a', 'a-2', 'a-3']);
  assert.equal(easingName('cubic-bezier(0.16, 1, 0.3, 1)'), 'out-expo');
  assert.equal(easingName('ease-in-out'), 'in-out');
  assert.equal(easingName('cubic-bezier(0.2, 0.9, 0.3, 1)'), 'out');
  assert.equal(easingName('cubic-bezier(0.5, 0, 0.5, 1)'), 'in-out');
});

test('springToLinear gera curva de 0 a 1 e duração', () => {
  for (const spring of [{ mass: 1, stiffness: 100, damping: 15 }, { mass: 1, stiffness: 300, damping: 60 }, { mass: 1, stiffness: 100, damping: 20 }]) {
    const { css, durationMs } = springToLinear(spring);
    const pts = /^linear\((.*)\)$/.exec(css)[1].split(',').map(Number);
    assert.equal(pts[0], 0);
    assert.equal(pts.at(-1), 1);
    assert.ok(durationMs > 100 && durationMs <= 3000, `duração ${durationMs}`);
    assert.ok(pts.every((p) => Number.isFinite(p)));
  }
  // superamortecida: nunca passa do alvo
  const over = /^linear\((.*)\)$/.exec(springToLinear({ mass: 1, stiffness: 100, damping: 40 }).css)[1].split(',').map(Number);
  assert.ok(over.every((p, i) => i === 0 || p >= over[i - 1] - 1e-9), 'monotônica');
  assert.ok(Math.max(...over) <= 1 + 1e-9);
});
