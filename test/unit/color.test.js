import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorName, contrast, parseColor, toHex } from '../../extension/lib/color.js';

test('parseColor entende hex, rgb, hsl e canais HSL soltos (shadcn)', () => {
  assert.equal(toHex(parseColor('#fff')), '#ffffff');
  assert.equal(toHex(parseColor('#ffffff80')), '#ffffff80');
  assert.equal(toHex(parseColor('rgb(255, 0, 0)')), '#ff0000');
  assert.equal(toHex(parseColor('rgba(0, 0, 0, 0.5)')), '#00000080');
  assert.equal(toHex(parseColor('rgb(0 0 0 / 50%)')), '#00000080');
  assert.equal(toHex(parseColor('hsl(0 100% 50%)')), '#ff0000');
  assert.equal(toHex(parseColor('222.2 47.4% 11.2%')), '#0f172a');
  assert.equal(parseColor('transparent').a, 0);
  assert.equal(parseColor('Inter, sans-serif'), null);
});

test('colorName usa os nomes do Tailwind v4', () => {
  assert.equal(colorName('#3b82f6'), 'blue-500');
  assert.equal(colorName('#ef4444'), 'red-500');
  assert.equal(colorName('#0f172a'), 'gray-900');
  assert.equal(colorName('#ffffff'), 'white');
  assert.equal(colorName('rgba(0,0,0,0.1)'), 'black-a10');
});

test('contraste WCAG', () => {
  assert.equal(contrast('#000000', '#ffffff'), 21);
  assert.ok(contrast('#777777', '#ffffff') < 4.5);
});
