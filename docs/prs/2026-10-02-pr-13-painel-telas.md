# PR #13 — feat(painel): telas de resultado do design extraído

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/painel-telas` |
| PR | [#13](https://github.com/VictorNascimento14/Decalque/pull/13) |

## O que muda

- `dom.js`: `h()` que só usa `textContent`/`setAttribute` (nunca `innerHTML` — tudo que vem da página é dado não confiável), ícones de traço, aviso, copiar e download.
- `views.js`: as seções — visão geral (identidade, stack, avisos, captura), cores (papéis, paleta, gradientes, variáveis), tipografia (famílias na própria fonte, escala), layout (espaçamento, raios, breakpoints), efeitos, movimento (curvas desenhadas, prévia tocável de `@keyframes` e reveals), componentes (botões e campos com `:hover` ao vivo), assets (miniaturas e ícones como `<img src="data:…">`) e exportação.

## Por quê

O controlador (#15) só decide o que mostrar; as telas ficam isoladas e reaproveitáveis entre site e Figma.

## Como testar

Entram em uso no #15 (o teste ponta a ponta do #24 percorre todas as abas).

## Revisão

`ocr delegate` no modo workspace: `sidepanel/dom.js` (+104) e `sidepanel/views.js` (+390), grupo de regras padrão. As duas tabelas de ternários encadeados (rótulo por tipo de animação, tag por tipo de componente) ficaram como estão.

- **Dado da página só como texto ou propriedade**: `h()` escreve por `textContent`/`setAttribute` e só registra `on*` quando o valor é função. Estilos vindos da página entram por `style.setProperty` (nunca concatenados em `cssText`). SVG aparece como `<img src="data:…">`.
- **Prévia de animação**: o `@keyframes` da página entra por `insertRule`, que aceita uma regra só; CSS inválido é descartado. `infinite` vira 2 repetições.
- **Achado (médio) — `href` com esquema não http(s)**: miniaturas, Lottie e vídeos viram `<a href>` com a URL extraída. O extrator aceita qualquer esquema, então um `<img data-src="javascript:…">` chegaria como link. Testado no Chromium: a CSP do painel (`script-src 'self'`) bloqueia a execução, tanto em `_self` quanto em `_blank`. A URL inútil, porém, ainda vai para o kit. A correção é na origem (`absUrl` no `extract.js`), com teste ponta a ponta, no PR #26.

## Arquivos

- `extension/sidepanel/dom.js`
- `extension/sidepanel/views.js`
