# PR #19 — feat(pinça): capturar componentes pelo painel com prévia e código

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/pinca-painel` |
| PR | [#19](https://github.com/VictorNascimento14/Decalque/pull/19) |

## O que muda

- Botão **Capturar componente** no painel; a pinça cancela na aba certa se o usuário trocar de aba.
- Tela do componente: prévia em iframe `sandbox=""`, **↑ Pai**, **Capturar outro**, abas **HTML · CSS · React + Tailwind**, copiar e baixar `.html`/`.css`/`.jsx` ou um `.zip` com tudo.
- Fontes de outro servidor são embutidas como `data:` na prévia e no `.html` baixado (no iframe sem origem elas esbarram em CORS); o CSS copiado mantém as URLs. O download passa por `fetchBytes`, com a mesma regra de rede do kit: os bytes vão para um arquivo que o usuário leva embora.

## Por quê

Fecha o fluxo da pinça: do clique na página ao código pronto para colar.

## Como testar

1. Num site, **Capturar componente** e clicar num card.
2. Conferir a prévia, a aba React + Tailwind e **↑ Pai**.

## Revisão

`ocr delegate` no modo workspace: `panel.js` (+159/−10) e `views.js` (+25).

- **Prévia isolada:** iframe com `sandbox=""` aplicado antes do `srcdoc`, então script do componente não roda nem com o `<style>` adulterado. O código aparece por `textContent`.
- **Pinça presa à aba de origem:** trocar de aba cancela a seleção na aba onde ela foi aberta (`pickTabId`); navegar para outro documento volta para a tela de design.
- **Fontes embutidas pelo caminho seguro:** `inlineCaptureFonts` baixa por `fetchBytes` (regra de rede do #14 e checagem de redirecionamento). É o caminho certo aqui: os bytes vão para o `.html` que o usuário leva embora. Teto de 3 MB por fonte e 12 fontes.
- **Nomes de arquivo:** o `.zip` da captura usa `slugify`/`componentName`. Os assets do Figma se chamam `img-<hash>.<ext>`, com hash do Figma e extensão de lista fixa, sem `../` possível.
- Fumaça do estado deste PR como extensão: extração, kit com 18 arquivos e pinça num card (CSS com `::before`, JSX com `export default function`).

Nenhum achado em aberto.

## Arquivos

- `extension/sidepanel/panel.js`
- `extension/sidepanel/views.js`
