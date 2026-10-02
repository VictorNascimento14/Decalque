import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arb, declsToClasses, toClassList } from '../../extension/lib/tailwind.js';

test('declarações → classes do Tailwind', () => {
  const c = (decls) => declsToClasses(decls).join(' ');
  assert.equal(c([['padding-top', '16px'], ['padding-right', '16px'], ['padding-bottom', '16px'], ['padding-left', '16px']]), 'p-4');
  assert.equal(c([['padding-top', '8px'], ['padding-bottom', '8px'], ['padding-left', '20px'], ['padding-right', '20px']]), 'py-2 px-5');
  assert.equal(c([['padding-top', '13px']]), 'pt-[13px]');
  assert.equal(c([['margin-left', 'auto'], ['margin-right', 'auto']]), 'mr-auto ml-auto');
  assert.equal(c([['margin-top', '-16px']]), '-mt-4');
  assert.equal(c([['row-gap', '24px'], ['column-gap', '24px']]), 'gap-6');
  assert.equal(c([['border-top-left-radius', '9999px'], ['border-top-right-radius', '9999px'], ['border-bottom-right-radius', '9999px'], ['border-bottom-left-radius', '9999px']]), 'rounded-full');
  assert.equal(
    c([['border-top-width', '1px'], ['border-right-width', '1px'], ['border-bottom-width', '1px'], ['border-left-width', '1px'], ['border-top-style', 'solid'], ['border-right-style', 'solid'], ['border-bottom-style', 'solid'], ['border-left-style', 'solid'], ['border-top-color', '#27272a'], ['border-right-color', '#27272a'], ['border-bottom-color', '#27272a'], ['border-left-color', '#27272a']]),
    'border border-[#27272a]',
  );
  assert.equal(c([['color', 'rgba(0, 0, 0, 0.5)']]), 'text-[#00000080]');
  assert.equal(c([['font-weight', '600'], ['font-size', '14px'], ['line-height', '20px']]), 'font-semibold text-[14px] leading-[20px]');
  assert.equal(c([['box-shadow', 'rgba(0, 0, 0, 0.1) 0px 1px 2px 0px']]), 'shadow-[0px_1px_2px_0px_#0000001a]');
  assert.equal(c([['grid-template-columns', '373.333px 373.333px 373.333px']]), 'grid-cols-3');
  assert.equal(c([['mask-type', 'luminance']]), '[mask-type:luminance]');
  assert.equal(c([['font-family', '"Space Grotesk", sans-serif']]), "[font-family:'Space_Grotesk',sans-serif]");
  assert.deepEqual(toClassList([['animation-name', 'pulse'], ['animation-duration', '2s'], ['animation-iteration-count', 'infinite']], 'hover:'), ['hover:animate-[pulse_2s_infinite]']);
  assert.equal(arb('a_b c'), 'a\\_b_c');
});

test('classes Tailwind válidas para aspect-ratio, var() e bordas exóticas', () => {
  const c = (decls) => declsToClasses(decls).join(' ');
  assert.equal(c([['aspect-ratio', 'auto 1200 / 630']]), '');
  assert.equal(c([['aspect-ratio', '16 / 9']]), 'aspect-[16/9]');
  assert.equal(c([['font-size', 'var(--fs-lg)']]), '[font-size:var(--fs-lg)]');
  assert.equal(c([['color', 'var(--text-primary)']]), 'text-[var(--text-primary)]');
  assert.equal(
    c([['border-top-width', '2px'], ['border-right-width', '2px'], ['border-bottom-width', '2px'], ['border-left-width', '2px'], ['border-top-style', 'groove'], ['border-right-style', 'groove'], ['border-bottom-style', 'groove'], ['border-left-style', 'groove']]),
    'border-2 [border-style:groove]',
  );
});

test('nenhuma classe fecha o className="…" do JSX', () => {
  const evil = [
    ['order', 'attr(data-x type(<integer>), "\\" onClick={() => alert(1)} x=\\"")'],
    ['font-weight', 'attr(data-w type(<number>), "x\\"y")'],
    ['--a"b', '1'],
    ['object-fit', 'cover" data-x="1'],
  ];
  const list = toClassList(evil, 'hover:');
  assert.ok(list.length >= 4, list.join(' '));
  for (const c of list) assert.doesNotMatch(c, /["\s]/, c);
});
