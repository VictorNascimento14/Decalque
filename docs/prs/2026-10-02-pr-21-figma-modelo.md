# PR #21 — feat(figma): montar o design system do Figma com estilos, variáveis, molas e Motion

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/figma-modelo` |
| PR | [#21](https://github.com/VictorNascimento14/Decalque/pull/21) |

## O que muda

`extension/lib/figma.js`:

- `buildFigmaModel`: estilos nomeados primeiro (`Green/Green 60` → `--color-green-60`), depois as cores usadas sem estilo; **variáveis** por coleção e modo (o padrão em `:root`, um modo "Dark" em `.dark`), com alias apontando para `--coleção-variável` e STRING entre aspas; escala de texto; larguras de frame como breakpoints de referência; molas convertidas para `linear()` e para a config do Framer Motion;
- **Figma Motion → `@keyframes`**: timelines com opacidade, translação, rotação, escala e tamanho, curva por trecho e nome sempre válido como identificador CSS;
- `parseFigmaUrl` (inclusive branches) e o cliente da API REST com mensagens claras para 403, 404 e 429.

## Por quê

O Figma entra no mesmo modelo do site — então os mesmos exportadores, telas e kit servem para os dois.

## Como testar

`npm test` — modelo a partir do arquivo de exemplo, variáveis com modos e alias entre coleções, Motion → `@keyframes`.

## Revisão

`ocr delegate` no modo workspace: `lib/figma.js` (+419) e o teste. Os ternários encadeados (tipo de variável → tipo de token, mola → curva) ficaram como estão.

- **Token:** só vai no cabeçalho `X-Figma-Token` para a constante `https://api.figma.com/v1`. O caminho é montado aqui com a chave do arquivo, que `parseFigmaUrl` só aceita como `[A-Za-z0-9]+`: nenhum `../` nem host vindo da URL da aba.
- **Erros da API com mensagem útil:** 403 (escopo do token), 404 e 429, com `retry-after` e o aviso de que assentos View/Collab têm poucas chamadas.
- **Variáveis do arquivo no CSS:** o nome passa por `tokenName` (`slugify` por parte), STRING passa por `cssString`, cor sai em hex e alias vira `var(--…)` com o mesmo nome do destino. Os modos entram por `Object.fromEntries`, que cria propriedade própria, então um modo chamado `__proto__` não polui protótipo.
- **Motion:** molas viram `linear()` e as timelines viram `@keyframes`, com teste.

Nenhum achado em aberto.

## Arquivos

- `extension/lib/figma.js`
- `test/unit/figma.test.js`
