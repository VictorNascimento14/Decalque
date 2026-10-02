# PR #6 — feat(extração): ler variáveis, @keyframes, fontes, breakpoints e estados das folhas de estilo

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/extracao-folhas-de-estilo` |
| PR | [#6](https://github.com/VictorNascimento14/Decalque/pull/6) |

## O que muda

O `extract.js` passa a ler o CSSOM:

- folhas da página, adotadas e de shadow roots; as de **outra origem** vêm pelo service worker e são montadas num `CSSStyleSheet` construído, com `@import` seguido à mão (até 60 folhas por extração);
- **variáveis CSS** do `:root` e do **tema escuro** (`.dark`, `[data-theme=dark]`, `prefers-color-scheme: dark`), com `var()` resolvido, tipo inferido (cor, dimensão, duração, curva, fonte…) e marcação de uso;
- `@keyframes`, `@font-face` (com URLs absolutas) e `@property`;
- **breakpoints** de `@media` (`min-width`/`max-width` e a sintaxe de intervalo);
- regras **`:hover`/`:focus`/`:active`**, analisadas uma vez por leitura — respeitando classes escapadas do Tailwind (`md\:hover\:…`) e o que está dentro de `:not()`;
- **componentes recorrentes** (botões, campos, cards, links) com assinatura de estilo e os estados de cada um.

## Por quê

O estilo computado diz o que aparece; a folha diz o que o autor nomeou (as variáveis) e o que muda em hover, foco e animação.

## Como testar

`await __decalque.extract()` passa a devolver `variables`, `keyframes`, `fontFaces`, `breakpoints` e `components`.

## Revisão

`ocr delegate` no modo workspace: `content/extract.js` (+589/−1), grupo de regras JS. Passa um pouco das 500 linhas porque leitura de folhas, estados e componentes dependem um do outro.

- **Rede**: folha de outra origem só pelo service worker, com teto de 60 buscas por extração (`@import` encadeado não vira varredura); erro de rede vira entrada em `blocked`, não exceção.
- **Seletores de estado**: o analisador respeita escape (`\:`), aspas e parênteses — `.md\:hover\:bg-x:hover` mantém a classe e `.btn:hover:not(:focus)` não vira `.btn:not()`; regras de `@media` que não valem agora ficam de fora; tudo analisado uma vez por leitura (`parsedStates`).
- **Variáveis**: escopo `:root` × escuro (`.dark`, `[data-theme=dark]`, `prefers-color-scheme`) sem confundir `:root:not(.dark)`; `var()` resolvido com limite de profundidade (sem laço em referência circular); internas do Tailwind (`--tw-*`) ignoradas.
- **Componentes**: botão exige tamanho de botão (≤ 520 × 110 px) e preenchimento ou borda nos quatro lados; os estados vêm das regras analisadas, com cor normalizada para hex.
- Ternários encadeados de uma linha mantidos (estilo).

Nenhum achado em aberto. Verificação extra: na página de teste, `extract()` passou a devolver variáveis, `@keyframes`, fontes, breakpoints e componentes.

## Arquivos

- `extension/content/extract.js`
