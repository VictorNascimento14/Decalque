# PR #22 — feat(figma): ler o arquivo pela API de plugins exposta na página

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/figma-ponte` |
| PR | [#22](https://github.com/VictorNascimento14/Decalque/pull/22) |

## O que muda

`extension/content/figma-main.js`, injetado no mundo MAIN do `figma.com` junto com o `figma-scan.js`. Usa o global `figma` que o Figma expõe na página (com acesso de edição, depois de abrir algum plugin uma vez no arquivo) — **só leitura**, nenhum setter:

- `status`: arquivo, páginas e seleção;
- `snapshot`: cada página exportada como `JSON_REST_V1` (com plano B por frame) e analisada pelo mesmo scan, mais estilos locais, variáveis com modos e o Figma Motion (beta);
- `exportNode` (PNG por escala, SVG, WebM) e `imageBytes` (imagem original por hash);
- `captureSelection`: o frame selecionado vira a árvore da pinça, com o CSS do `getCSSAsync`, posicionamento absoluto calculado, vetores como SVG, imagens embutidas e variáveis preservadas.

## Por quê

Não precisa de token nem de plano pago, e evita o limite da API REST no plano gratuito (assentos View/Collab têm poucas chamadas por mês).

## Como testar

Pelo painel no #23; o #24 testa contra um Figma simulado.

## Revisão

`ocr delegate` no modo workspace: `content/figma-main.js` (+418).

- **Só leitura, conferido por busca:** nenhuma atribuição a propriedade de nó (`name`, `fills`, `characters`, `x`/`y`…), nenhum `create*`, `remove()`, `setPluginData`, `setValueForMode`, `notify` nem troca de `currentPage`. As chamadas são `exportAsync`, `getCSSAsync`, `getBytesAsync`, `getImageByHash` e `page.loadAsync()`, que carrega a página para leitura sem alterar o arquivo.
- **Limites:** o scan para em 150 mil nós. Erro numa página ou num nó (API beta do Motion, nó sem exportação) cai num `try/catch` local e o resto do arquivo continua.
- **Superfície:** expõe `window.__decalqueFigma` (versionado, sem reinjeção) no mundo MAIN do figma.com. Os plugins do Figma rodam em realm isolado e não alcançam esse objeto.

Nenhum achado em aberto.

## Arquivos

- `extension/content/figma-main.js`
