# PR #12 — feat(painel): estilos do painel lateral com tema claro e escuro

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/painel-estilos` |
| PR | [#12](https://github.com/VictorNascimento14/Decalque/pull/12) |

## O que muda

`extension/sidepanel/panel.css`: tokens de tema escuro e claro (`prefers-color-scheme`), cabeçalho, controles, abas roláveis, amostras de cor com xadrez para transparência, escala tipográfica, barras de espaçamento, raios, sombras, curvas, prévia de animações e componentes, grade de assets, exportação, tela do componente e `prefers-reduced-motion`.

## Por quê

Separado do comportamento para revisar o visual sozinho. Entra em uso no #15.

## Como testar

Visual — conferido por captura de tela do painel nos dois temas.

## Revisão

`ocr delegate` no modo workspace: `sidepanel/panel.css` (+464), grupo de regras padrão.

- **Temas**: as cores são variáveis em `:root`, e `prefers-color-scheme: light` só troca os valores. O verde de destaque ganha uma variante escura (`--accent-text`) para texto sobre fundo claro.
- **Acessibilidade**: `:focus-visible` em botões, campos, `summary`, links e itens copiáveis. `prefers-reduced-motion` desliga transições e animações, inclusive as prévias de movimento.
- **Sem recurso externo**: nenhum `url()` nem `@import` de fora; as fontes do site entram por JS no #15.
- Conferido por captura do painel (420 px) com o modelo da página de teste, nos dois temas: abas de início, Cores, Movimento e Componentes.

Nenhum achado. O arquivo ainda não está ligado a nenhuma página: o `index.html` provisório recebe a folha no #15.

## Arquivos

- `extension/sidepanel/panel.css`
