# PR #18 — feat(pinça): gerar HTML/CSS autônomo e componente React + Tailwind

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/pinca-codigo` |
| PR | [#18](https://github.com/VictorNascimento14/Decalque/pull/18) |

## O que muda

`extension/lib/component.js`:

- `renderCSS`: classes deduplicadas, `box-sizing` global quando a maioria é `border-box`, estados de ancestral (`.card:hover .titulo`);
- `renderHTML` e `renderDocument`: documento autônomo com fontes, `@keyframes` e variáveis; `<` escapado como `\3c ` dentro do `<style>`;
- `renderJSX`: `className` com Tailwind, `group/<classe>` + `group-hover/<classe>:`, `before:`/`after:`/`placeholder:`, atributos SVG em camelCase, texto com `{ }` escapado e o CSS global necessário num comentário;
- nada que execute código sai: atributos `on*`, `<script>` de SVG, URL `javascript:`/`vbscript:` comparada como o parser de URL a lê (sem espaço, tab nem quebra de linha — `java	script:` executa; item por item em `<animate values>`) e `attributeName="href"` de `<set>`/`<animate>`, que troca o `href` depois do filtro;
- a chave do `style` vindo da página vai entre aspas no objeto JSX quando não é um nome de propriedade simples, e o nome de fonte do Figma é codificado no link do Google Fonts.

## Por quê

Duas saídas para dois usos: HTML/CSS para abrir e conferir, React + Tailwind para colar no projeto.

## Como testar

`npm test` — inclui as regressões de segurança: `</style>` capturado, `on*`, `java	script:`, `<set>`/`<animate>` sobre `href`, chave de `style` fechando o objeto no JSX e nome de fonte fechando o `href` no `.html`. Contraprova: com a versão anterior do arquivo, os três testes novos falham.

## Revisão

`ocr delegate` no modo workspace: `lib/component.js` (+275) e o teste. A revisão percorreu cada saída que leva texto da página: atributo HTML, atributo JSX, texto JSX, `<style>`, `<title>` e o `<link>` de fontes.

- **Achado (alto) — corrigido neste PR:** URL perigosa disfarçada. O filtro testava `/^\s*javascript:/`, mas o parser de URL descarta tab e quebra de linha no meio, então `java\tscript:alert(1)` num `xlink:href` de SVG passava e executava no clique. Agora o valor é comparado sem nenhum caractere ≤ U+0020.
- **Achado (alto) — corrigido:** `<set attributeName="href" to="javascript:…">` e `<animate attributeName="xlink:href" values="#;javascript:…">` trocam o `href` do link depois que ele passou pelo filtro. `attributeName` que aponta para `href` não sai, e `to`/`from`/`by`/`values` são conferidos item por item.
- **Achado (alto) — corrigido:** no JSX, a chave do `style` vinha do texto da página sem aspas. `}} onClick={…} data-x={{ y: 1` fechava o objeto e criava um `onClick` no componente colado no projeto. Fora de um nome de propriedade simples, a chave agora vai entre aspas.
- **Achado (médio) — corrigido:** o nome da família no `<link>` do Google Fonts (vindo do Figma) entrava cru no `href` do `.html`: `Inter"><script>…` fechava o atributo. Agora vai codificado na URL e escapado no atributo.
- **Conferido sem achado:**
  - Texto JSX com `{ } < >` vira expressão `{"…"}`.
  - Valores de atributo JSX com caractere especial viram `{JSON.stringify(v)}`.
  - Atributos HTML passam por `escapeHtml`.
  - O `<title>` é escapado; dentro do `<style>`, `<` vira `\3c `.
- O mesmo filtro de URL existe no `serializeSvg` do `extract.js`, script clássico que não pode importar este módulo. Os dois furos se repetem lá, para os `.svg` do kit e o SVG copiado no painel, e a correção entra no PR de correção da extração (#26).

## Arquivos

- `extension/lib/component.js`
- `test/unit/component.test.js`
