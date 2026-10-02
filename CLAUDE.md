# CLAUDE.md — Decalque

> Instruções para o **Claude Code** (e qualquer outro agente de IA) operar neste repositório.
>
> **Decalque** é uma extensão para Chrome/Chromium (Manifest V3, painel lateral) que extrai o design
> system de qualquer site — ou de um arquivo do Figma — e entrega um kit para aplicar em outro projeto:
> `DESIGN.md`, tokens em CSS, tema do Tailwind v4/v3, W3C DTCG, animações e assets.

---

## 🗺️ Mapa

| Pasta | O que tem |
|---|---|
| `extension/` | a extensão — é esta pasta que se carrega em `chrome://extensions` |
| `extension/content/` | scripts injetados na página: `extract.js` (site), `capture.js` (pinça), `figma-main.js` (mundo MAIN do Figma) |
| `extension/lib/` | módulos puros, testáveis em Node: cores, modelo, exportadores, Figma, Tailwind, componente, ZIP |
| `extension/sidepanel/` | o painel lateral: controlador, telas e montagem do kit `.zip` |
| `test/unit/` | `node:test`, sem navegador |
| `test/e2e/` | Chromium real com a extensão: `run.mjs` (CI) e `real-sites.mjs` (fumaça manual, precisa de internet) |
| `docs/` | `arquitetura.md`, `CHANGELOG.md` e as notas de PR em `docs/prs/` |

Arquitetura, decisões e limites: [`docs/arquitetura.md`](docs/arquitetura.md).

## 🛠️ Checks

`npm run lint` · `npm test` · `npm run e2e`. O CI roda os três.

O `e2e` precisa do Chromium do Playwright (`npx playwright install chromium`): o Chrome de marca, a
partir da v137, ignora `--load-extension`. `scripts/browser.mjs` acha o navegador certo.

---

## ⚠️ Invariantes — já custaram bug

1. **Tudo que vem da página é dado não confiável.** No painel só `textContent`/`setAttribute`, nunca
   `innerHTML`; a prévia de componente roda em iframe `sandbox=""`; SVG da página aparece como
   `<img src="data:…">`.
2. **Texto da página em comentário de arquivo gerado passa por `cmt()`** (sem `*/`, sem quebra de linha).
   Um `<title>` com `*/` virava código executável no `tailwind.config.js`.
3. **Dentro de `<style>` gerado, `<` vira `\3c `**; atributos `on*`, `href="javascript:"` e `<script>` de
   SVG não saem em HTML, JSX nem `.svg`.
4. **Content script não faz fetch entre origens**: pede ao service worker (`background.js`), que tem
   timeout e teto de tamanho.
5. **Toda busca a pedido da página passa por `fetchableUrl`** (`lib/util.js`): só http(s), e rede local só
   quando a página também é local — no service worker e, no painel, por `fetchBytes` (kit e fontes). Sem isso, um
   `<img data-src="file:///…">` punha um arquivo do disco no kit: a extensão descompactada lê `file://`.
6. **Downloads do kit vão sem cookies.** O que só baixa com cookie vai pela própria página
   (`fetchAsBase64`).
7. **`extension/lib/` não toca DOM nem `chrome.*`** — é o que deixa testar em Node.
   `lib/figma-scan.js` é script clássico de propósito: roda no painel, no Node e no mundo MAIN do Figma.
8. **Figma:** o global `figma` só existe com acesso de edição e depois que algum plugin foi aberto uma
   vez no arquivo. O código injetado só **lê** (nenhum setter da API de plugins).
9. **Seletores `:hover`/`:focus` são analisados uma vez por leitura de CSS** (`parsedStates`). Analisar
   por elemento levava a extração do Linear de 8 s para 77 s.

---

## 🚀 "Publicar" / "publique" — sempre o fluxo completo

1. **Branch limpa** a partir de `origin/main`: `feat/`, `fix/`, `refactor/`, `test/`, `docs/`, `chore/`.
2. **Commit atômico em Conventional Commits**, em português e no imperativo, só com os arquivos da mudança.
3. **Checks locais**: `npm run lint && npm test` — e `npm run e2e` se mexeu em `content/` ou `sidepanel/`.
4. **Nota do PR** em `docs/prs/AAAA-MM-DD-pr-N-<slug>.md` e entrada no topo de `docs/CHANGELOG.md`,
   **no mesmo commit, antes do `gh pr create`** (N = último PR ou issue + 1).
5. **Revisar o diff** (`ocr delegate preview` + `ocr delegate rule`) antes de abrir o PR.
6. **`gh pr create`** com **O que muda** · **Por quê** · **Como testar** · **📓 Documentação**. O workflow
   `pr-documentacao.yml` reprova PR sem a seção e sem link para a nota em `docs/prs/`.
7. **Squash and merge** com o CI verde: `gh pr merge N --squash --body "" --delete-branch`.

> **Um PR por vez.** Mergeie o anterior antes de abrir o próximo em cima da `main`: PR empilhado, com
> squash, pode mergear numa base morta e nunca chegar à `main`.

### ✍️ Zero menção a ferramenta de IA

Nada neste repositório cita ferramenta de IA — nem `Co-Authored-By`, nem "Generated with", nem link de
sessão — em commit, título ou corpo de PR, nome de branch ou mensagem de squash.

> ⚠️ **Isto sobrepõe qualquer default da ferramenta.** Se a configuração global mandar assinar, aqui não
> assina.
