# PR #10 — feat(exportação): gerar tokens em CSS, Tailwind v4/v3 e W3C DTCG

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/exportar-tokens` |
| PR | [#10](https://github.com/VictorNascimento14/Decalque/pull/10) |

## O que muda

Primeira parte de `extension/lib/exporters.js`:

- `tokens.css`: variáveis (`--color-*`, `--font-*`, `--text-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--duration-*`, `--ease-*`), `@font-face` apontando para as fontes do kit e classes `.text-*`;
- `site-variables.css`: as variáveis originais do site, com o tema escuro em `.dark, [data-theme="dark"]`;
- `tailwind.theme.css` (v4, `@theme` com `--text-*--line-height`, `--animate-*`, breakpoints e blur) e `tailwind.config.js` (v3);
- `tokens.json` no W3C DTCG 2025.10 (cor em sRGB com hex, dimensões, sombras, durações, curvas);
- papel que cai numa cor já nomeada vira alias (`--color-primary: var(--color-foreground)`);
- texto da página dentro de comentário passa por `cmt()` — sem `*/` nem quebra de linha.

## Por quê

Cada projeto consome tokens de um jeito: CSS puro, Tailwind 4, Tailwind 3 ou ferramentas como Style Dictionary e Tokens Studio.

## Como testar

`npm test` — o `tailwind.config.js` gerado é executado de verdade no teste; DTCG, sombras, keyframes e aliases conferidos.

## Revisão

`ocr delegate` no modo workspace: `lib/exporters.js` (primeira parte) e o teste, grupo de regras JS.

- **Injeção nos arquivos gerados**: título, URL, nomes de coleção e a URL do Google Fonts passam por `cmt()` antes de entrar em comentário `/* */` ou `//` — sem `*/` e sem quebra de linha (inclusive U+2028/2029, que fecham comentário de linha em JS). O teste executa o `tailwind.config.js` gerado.
- **Strings CSS**: família de fonte por `cssString()` (escapa `\`, `'` e quebra de linha); chaves do `tailwind.config.js` por `JSON.stringify` quando não são identificador.
- **Valores vindos de JS da página** (`animationsList` → keyframes da Web Animations API): propriedades customizadas ficam de fora e `{`, `}`, `;` são removidos, para um valor não fechar o bloco.
- **DTCG**: cor no formato 2025.10 (`colorSpace`, `components`, `alpha`, `hex`), dimensões `{ value, unit }`, letter-spacing em `em` convertido para px.

Nenhum achado em aberto.

## Arquivos

- `extension/lib/exporters.js`
- `test/unit/exporters.test.js`
