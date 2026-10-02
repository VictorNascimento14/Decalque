# PR #4 — feat: criar a extensão com manifest, ícone e service worker

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/extensao` |
| PR | [#4](https://github.com/VictorNascimento14/Decalque/pull/4) |

## O que muda

- **Manifest V3** com painel lateral aberto pelo ícone (atalho `Alt+Shift+D`), permissões `sidePanel`, `scripting` e `storage`, e acesso a todos os sites.
- **Service worker** (`background.js`): faz o fetch entre origens que os content scripts não podem fazer (CSS de CDN), só para http(s), sem endereços de rede local quando a página não é local, com timeout de 15 s e teto de 8 MB lido em stream. Também restringe o `chrome.storage.local` a contextos confiáveis.
- **Ícone**: um adesivo com a ponta descolando, desenhado em SVG e renderizado em PNG (16, 32, 48 e 128) pelo `npm run icons`.
- `npm run pack` empacota `extension/` em `dist/decalque-<versão>.zip`.
- `scripts/browser.mjs` acha um Chromium que aceite extensões (o Chrome de marca ignora `--load-extension` desde a v137).
- Painel provisório, só para a extensão carregar — o painel de verdade entra no #15.

## Por quê

É a casca carregável em `chrome://extensions`. O fetch pelo service worker é o que permite ler folhas de estilo de outra origem; o bloqueio de rede local impede que um site use a extensão para fazer requisições à rede de quem está navegando.

## Como testar

1. `chrome://extensions` → Modo do desenvolvedor → **Carregar sem compactação** → pasta `extension/`.
2. O ícone abre o painel lateral provisório.
3. `npm run pack` gera `dist/decalque-1.0.0.zip` e `unzip -t` não acusa erro.

## Revisão

`ocr delegate` no modo workspace: 7 arquivos revisáveis em quatro grupos de regras (JS, JSON, `package.json` e padrão); os PNGs e o SVG do ícone ficam fora.

- **`manifest.json`**: chaves conferidas (`side_panel.default_path`, `host_permissions`, `commands._execute_action`); permissões só as usadas (`sidePanel`, `scripting`, `storage`) — sem `tabs`, porque a permissão de host já entrega a URL da aba.
- **`background.js`**: só responde a mensagem vinda de content script em aba (`sender.tab`), só http(s), bloqueia localhost/IP privado quando a página não é local, `credentials: 'omit'`, timeout de 15 s e leitura em stream com teto de 8 MB; `setAccessLevel` dentro de `try` para não derrubar o worker num navegador sem suporte.
- **`package.json`**: só scripts novos (`icons`, `pack`); o Playwright que o `make-icons` usa já está em `devDependencies`.
- Os dois `console.log` estão em scripts de linha de comando e são a saída esperada.

Nenhum achado em aberto.

## Arquivos

- `extension/background.js`
- `extension/icons/icon128.png`
- `extension/icons/icon16.png`
- `extension/icons/icon32.png`
- `extension/icons/icon48.png`
- `extension/icons/logo.svg`
- `extension/manifest.json`
- `extension/sidepanel/index.html`
- `package.json`
- `scripts/browser.mjs`
- `scripts/make-icons.mjs`
- `scripts/pack.mjs`
