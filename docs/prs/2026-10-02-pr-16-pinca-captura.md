# PR #16 — feat(pinça): escolher um elemento na página e capturar o estilo dele

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/pinca-captura` |
| PR | [#16](https://github.com/VictorNascimento14/Decalque/pull/16) |

## O que muda

- **Seletor visual** (`capture.js`): contorno e rótulo com o tamanho, `↑` pai, `↓` filho, `Enter`, `Esc`; cliques da página bloqueados durante a escolha; montado sem `innerHTML`. Só entrada real do usuário (`isTrusted`) move, escolhe ou cancela — um carrossel que chama `element.click()` encerrava a pinça sozinho.
- **Captura**: árvore do elemento com o estilo computado comparado ao padrão da mesma tag num iframe limpo (com a variante certa: `<a>` com `href`, `<input>` com `type`); bordas que só o padrão tinha viram `none`; largura e altura só quando explícitas (elementos substituídos, absolutos, vazios, blocos mais estreitos que o pai, alturas fixas de botão); margens laterais iguais viram `auto`; `::before`, `::after` e `::placeholder`; regras `:hover`/`:focus` do próprio elemento e de ancestrais; `@keyframes` e `@font-face` usados; SVG autônomo; URLs com protocolo seguro.
- `extract.js` expõe os utilitários que a captura reaproveita.

## Por quê

Para copiar um componente específico — um card, um menu, um botão — além dos tokens gerais.

## Como testar

Pelo painel no #19. O teste ponta a ponta do #24 captura um card com `::before` e hover de ancestral e, antes do clique real, dispara um `click()` e um `Esc` sintéticos que não podem encerrar a pinça. Contraprova: sem o `isTrusted`, o passo falha com "evento sintético encerrou a pinça".

## Revisão

`ocr delegate` no modo workspace: `capture.js` (+636) e `extract.js` (+3, o `D.util` que a captura usa).

- **Achado (médio) — corrigido neste PR:** o seletor aceitava eventos sintéticos. Um site com carrossel automático (`element.click()`) ou que dispara teclas encerrava a pinça sem o usuário clicar, capturando o que estivesse sob o mouse. Agora só `isTrusted` move, escolhe ou cancela. A regressão entra na suíte do #24, com contraprova.
- **Conferido sem achado:**
  - O overlay fica num shadow root fechado, montado sem `innerHTML`; os eventos são removidos no `finish`.
  - `safeUrl` só deixa `http(s)`, `mailto`, `tel`, `blob` e `data:` em `src`; `javascript:`, `vbscript:` e `file:` viram `#`.
  - O `srcset` passa pelo mesmo filtro, URL por URL.
  - `captureSelector`, `captureRelative` e `lastPicked` vivem no mundo isolado, fora do alcance da página.
  - O nome da família no `@font-face` gerado tem `\`, `'` e quebras de linha escapados.

## Arquivos

- `extension/content/capture.js`
- `extension/content/extract.js`
