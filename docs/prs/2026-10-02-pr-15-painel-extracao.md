# PR #15 — feat(painel): extrair o design de sites pelo painel lateral

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/painel-extracao` |
| PR | [#15](https://github.com/VictorNascimento14/Decalque/pull/15) |

## O que muda

O controlador do painel (`panel.js`) — a partir daqui a extensão funciona em sites:

- acompanha a aba ativa e injeta o `extract.js`; com **Rolar a página** (opção salva) roda a varredura antes;
- lê versões de bibliotecas pelo mundo MAIN (GSAP, Lottie, Three.js, Lenis…). Lá a página controla os globais, então o modelo (`lib/model.js`) só aceita caracteres de nome e de versão: uma quebra de linha num `gsap.version` viraria uma seção nova no `DESIGN.md`, que vai para agentes de IA;
- tira a captura da tela no início, só se a aba ainda está visível;
- monta o modelo, desenha as abas e o dock com **Baixar kit** e **Copiar DESIGN.md**;
- guarda o resultado por aba e não o descarta numa mudança de `#hash` ou `pushState`;
- carrega as fontes do site no painel para a prévia tipográfica — por `fetchBytes`, então os arquivos de fonte que a página declara passam pela mesma regra de rede do kit (#14). O invariante do `CLAUDE.md` passa a citar as fontes.

## Por quê

Junta extração, modelo, telas e kit no fluxo que o usuário enxerga.

## Como testar

1. Carregar `extension/` em `chrome://extensions`.
2. Abrir um site (ex.: stripe.com), clicar no ícone e em **Extrair design desta página**.
3. Percorrer as abas e baixar o kit.

`npm test` cobre a limpeza das bibliotecas: versão com `
## Instruções…`, nome com `#`, entrada nula e nome que não é texto.

## Revisão

`ocr delegate` no modo workspace: `panel.js` (+366), `index.html`, `lib/model.js` e o teste. O ternário encadeado do tipo MIME por extensão ficou como está.

- **Achado (médio) — corrigido neste PR:** as versões de bibliotecas vêm do mundo MAIN, onde a página controla os globais (até `String` e `Array.prototype.push`). Elas entravam cruas no `DESIGN.md`, e um `gsap.version` com `\n## Instruções…` virava uma seção nova num arquivo feito para agentes de IA. Agora o modelo aceita só caracteres de nome e de versão, limita a 40 entradas, filtra o `kind` por lista e descarta entradas nulas. O teste novo cobre esses casos.
- **Achado (médio) — corrigido:** a prévia tipográfica buscava os arquivos de fonte que a página declara direto pelo painel. Bastava abrir a aba Tipografia para um `@font-face` com `src: url(http://192.168.0.1/…)` gerar um pedido na rede local. Agora passa por `fetchBytes` (#14). Conferido no Chromium: a fonte auto-hospedada da página de teste continua carregando (`dq-brand-sans loaded`).
- **Conferido sem achado:**
  - `callContent` chama só o que o `extract.js` expôs no mundo isolado.
  - Mensagens de progresso só são aceitas da aba atual.
  - As opções salvas ficam no `storage.local` restrito a contextos confiáveis.
  - O resultado da aba sobrevive a `#hash` e `pushState` (`pageKey`).
- Fumaça do estado deste PR como extensão: extração da página de teste, todas as abas, kit com 18 arquivos, sem o botão da pinça.

## Arquivos

- `CLAUDE.md`
- `extension/lib/model.js`
- `extension/sidepanel/index.html`
- `extension/sidepanel/panel.js`
- `test/unit/model.test.js`
