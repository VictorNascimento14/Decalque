import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easingName, fetchableUrl, isPrivateHost, parseTimeMs, prettyFamily, slugify, splitTopLevel, springToLinear, uniqueNamer } from '../../extension/lib/util.js';

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

test('fetchableUrl: só http(s), e rede local só a partir de página local', () => {
  const site = 'https://site.com/pagina';
  assert.equal(fetchableUrl('https://cdn.site.com/a.png', site), 'https://cdn.site.com/a.png');
  for (const u of ['file:///home/u/.ssh/id_rsa', 'javascript:alert(1)', 'chrome://settings', 'ftp://x.com/a', 'não é url']) {
    assert.equal(fetchableUrl(u, site), null, u);
  }
  // o parser de URL normaliza 0x7f.1 e 2130706433 para 127.0.0.1, e ::ffff:127.0.0.1 para ::ffff:7f00:1
  for (const u of ['http://localhost:3000/a.png', 'http://0x7f.1/', 'http://2130706433/', 'http://192.168.0.1/cfg', 'http://10.1.2.3/',
    'http://172.20.0.1/', 'http://169.254.169.254/latest/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[fd00::1]/', 'http://app.local/']) {
    assert.equal(fetchableUrl(u, site), null, u);
  }
  assert.equal(fetchableUrl('http://localhost:3000/a.png', 'http://localhost:5173/'), 'http://localhost:3000/a.png');
  assert.equal(fetchableUrl('http://192.168.0.1/a.png', undefined), null, 'sem página: trata como pública');
  assert.equal(isPrivateHost('[::ffff:c0a8:1]'), true, '192.168.0.1 dentro de IPv6');
  assert.equal(isPrivateHost('172.32.0.1'), false);
});
