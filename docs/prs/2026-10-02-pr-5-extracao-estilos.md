# PR #5 — feat(extração): ler cores, tipografia, espaçamentos e efeitos dos estilos computados

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/extracao-estilos` |
| PR | [#5](https://github.com/VictorNascimento14/Decalque/pull/5) |

## O que muda

Primeira parte do content script `extension/content/extract.js`, que percorre o DOM (incluindo shadow DOM aberto e fechado) e agrega os estilos computados:

- **cores** por papel de uso — texto (pesado por caractere), fundo (com área), borda, sombra, gradiente — e uso em botões e links; `oklch()`, `lab()` e `color()` viram sRGB exato por um canvas 1×1, com o valor original guardado;
- **tipografia**: família, tamanho, peso, entrelinha, espaçamento, caixa, tag dominante (h1–h6, botão, link, código…) e uma amostra de texto;
- **espaçamentos** (padding, margin, gap), **raios**, **sombras**, filtros e `backdrop-filter`, bordas, largura máxima e `display`;
- **transições e animações** aplicadas (propriedade, duração, curva, atraso, iterações, `animation-timeline`).

Páginas enormes são amostradas (teto de 12 mil elementos lidos com estilo).

## Por quê

É a matéria-prima de todos os tokens: o que de fato aparece na tela, não o que o CSS promete.

## Como testar

Por enquanto pelo console da página: injetar o arquivo e rodar `await __decalque.extract()` — devolve `colors`, `typography`, `spacing`, `radii`, `shadows`, `transitions`… O painel que chama isso chega no #15.

## Revisão

`ocr delegate` no modo workspace: 1 arquivo revisável (`content/extract.js`, 435 linhas), grupo de regras JS.

- **Segurança**: nada é escrito no DOM da página; texto vem por `textContent` (`sampleText`) e só é lido. Elementos da UI do próprio Decalque (`data-decalque-ui`) ficam fora da varredura.
- **Desempenho**: um `getComputedStyle` por elemento, amostragem acima de 12 mil elementos, subárvores com `display: none` e o miolo de SVG puladas; cache de normalização de cor (o canvas 1×1 só roda para `oklch()`/`lab()`/`color()`).
- **Corretude**: a cor inválida no canvas é detectada pelo sentinela `#010203` (em vez de virar preto); o alfa de cor moderna é separado antes de pintar, para não perder precisão no pixel pré-multiplicado.
- Ternários encadeados de uma linha (`kebab`, fundo da página) mantidos: são cadeias de else-if curtas, e reescrever seria nit.

Nenhum achado em aberto. Verificação extra: o arquivo foi injetado na página de teste e `extract()` devolveu cores, tipografia, espaçamentos, efeitos e movimento sem erro de página.

## Arquivos

- `extension/content/extract.js`
