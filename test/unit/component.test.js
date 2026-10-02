import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentName, renderCSS, renderDocument, renderHTML, renderJSX } from '../../extension/lib/component.js';
import { capture } from './fixtures.js';

test('HTML e CSS autônomos', () => {
  const cap = capture();
  const css = renderCSS(cap);
  assert.match(css, /^\*, \*::before, \*::after \{ box-sizing: border-box; \}/);
  assert.match(css, /\.div1 \{\n  display: flex;/);
  assert.doesNotMatch(css, /box-sizing: border-box;\n/);
  assert.match(css, /\.div1::before \{\n  content: "";/);
  assert.match(css, /\.a4:hover \{\n  transform: translateY\(-2px\);/);
  assert.match(css, /\.div1:hover \.h32 \{\n  color: #c6f432;/);
  const html = renderHTML(cap);
  assert.match(html, /<a class="a4" href="https:\/\/exemplo\.com\/pro">/);
  assert.match(html, /<path d="M5 12h14" stroke="currentColor" stroke-linecap="round"><\/path>/);
  assert.match(html, /Tudo \{ que \} você precisa/);
  const doc = renderDocument(cap);
  assert.match(doc, /^<!doctype html>/);
  assert.match(doc, /@keyframes pulse/);
  assert.match(doc, /body \{ margin: 0; padding: 24px; background: #0b0b0f; \}/);
});

test('React + Tailwind', () => {
  const jsx = renderJSX(capture());
  assert.match(jsx, /export default function DivCard\(\) \{/);
  assert.match(jsx, /<div className="group\/div1 p-6 rounded-\[12px\] gap-4 flex flex-col bg-\[#18181b\] text-\[#f4f4f5\]/);
  assert.match(jsx, /before:content-\[''\] before:absolute before:w-2 before:h-2/);
  assert.match(jsx, /group-hover\/div1:text-\[#c6f432\]/);
  assert.match(jsx, /hover:\[transform:translateY\(-2px\)\] hover:bg-\[#d4ff4a\]/);
  assert.match(jsx, /\{"Tudo \{ que \} você precisa "\}/);
  assert.match(jsx, /<svg className="shrink-0" xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="16" height="16" viewBox="0 0 24 24" color="#0b0b0f" strokeWidth="2">/);
  assert.match(jsx, /<path d="M5 12h14" stroke="currentColor" strokeLinecap="round" \/>/);
  assert.match(jsx, /Cole no seu CSS global:[\s\S]*@keyframes pulse/);
  assert.equal(componentName({ root: { description: '123 hero-section' } }), 'HeroSection');
});

test('</style> num valor capturado não vira <script> no .html', () => {
  const cap = capture();
  cap.pseudo[0].decls[0] = ['content', '"</style><script>alert(1)</script>"'];
  cap.source.url = 'https://exemplo.com/x*/y';
  const doc = renderDocument(cap);
  assert.doesNotMatch(doc, /<script>/);
  assert.match(doc, /\\3c \/style>/);
  assert.doesNotMatch(doc.split('<style>')[1].split('</style>')[0], /\*\/y/);
});

test('atributos que executam código não saem no HTML/JSX', () => {
  const cap = capture();
  const svg = cap.tree.children[2].children[1];
  svg.attrs.onload = 'alert(1)';
  svg.attrs['@click'] = 'open = true';
  svg.children.push({ t: 'el', tag: 'script', ns: 'svg', attrs: {}, children: [{ t: 'text', v: 'alert(2)' }] });
  svg.children.push({ t: 'el', tag: 'a', ns: 'svg', attrs: { href: ' JavaScript:alert(3)' }, children: [] });
  // o parser de URL descarta tab e quebra de linha: "java\tscript:" executa
  svg.children.push({ t: 'el', tag: 'a', ns: 'svg', attrs: { 'xlink:href': 'java\tscript:alert(4)' }, children: [] });
  // <set>/<animate> que troca o href do link depois que o atributo passou pelo filtro
  svg.children.push({ t: 'el', tag: 'a', ns: 'svg', attrs: { href: '#' }, children: [
    { t: 'el', tag: 'set', ns: 'svg', attrs: { attributeName: 'href', to: 'javascript:alert(5)' }, children: [] },
    { t: 'el', tag: 'animate', ns: 'svg', attrs: { attributeName: 'xlink:href', values: '#;javascript:alert(6)' }, children: [] },
  ] });
  const html = renderHTML(cap);
  const jsx = renderJSX(cap);
  for (const out of [html, jsx]) {
    assert.doesNotMatch(out, /onload|alert\(|@click|attributeName="(xlink:)?href"|script:/i);
  }
});

test('chave do style da página não fecha o objeto de estilo no JSX', () => {
  const cap = capture();
  cap.tree.children[2].children[1].attrs.style = 'fill: red; }} onClick={() => alert(7)} data-x={{ y: 1';
  const jsx = renderJSX(cap);
  // o texto continua lá, mas como chave entre aspas: o objeto não fecha e nenhum atributo nasce
  assert.ok(jsx.includes('style={{ fill: "red", "}} onClick={() => alert(7)} data-x={{ y": "1" }}'), 'a chave vira string entre aspas');
});

test('nome de fonte do Figma não fecha o href do Google Fonts no .html', () => {
  const cap = capture();
  cap.fontFamilies = [{ family: 'Inter"><script>alert(1)</script>', weights: [400] }];
  const doc = renderDocument(cap);
  assert.doesNotMatch(doc, /<script>/);
  assert.match(doc, /family=Inter%22%3E%3Cscript%3E/);
});
