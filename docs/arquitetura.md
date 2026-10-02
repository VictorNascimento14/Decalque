# Arquitetura do Decalque

## Fluxo

```
            painel lateral (sidepanel/panel.js)
              │  chrome.scripting.executeScript
   ┌──────────┼───────────────────────────────┬──────────────────────────────┐
   ▼          ▼                               ▼                              ▼
content/extract.js           content/capture.js            lib/figma-scan.js + content/figma-main.js
(mundo isolado)              (mundo isolado, "pinça")      (mundo MAIN do figma.com, usa o global `figma`)
   │ DOM + CSSOM + canvas       │ estilos computados          │ page.exportAsync('JSON_REST_V1') + scan
   │ folhas de outra origem ◄── background.js (fetch com host_permissions)
   ▼                            ▼                              ▼
 dados brutos              árvore do componente           resumo do arquivo (scan)
   │                            │                              │   ou: lib/figma.js → API REST + mesmo scan
   ▼                            ▼                              ▼
lib/model.js ──────────► MODELO (único formato) ◄──────── lib/figma.js
                               │
             lib/exporters.js  │  lib/component.js + lib/tailwind.js
                               ▼
        DESIGN.md · tokens.css · Tailwind v4/v3 · DTCG · animations.css · HTML/CSS/JSX
                               │
                     sidepanel/kit.js + lib/zip.js → .zip com assets
```

## Decisões

**Painel lateral, não popup.** O popup fecha quando o usuário clica na página — e a pinça precisa
justamente desse clique. O painel fica aberto e acompanha a aba ativa.

**Coleta na página, semântica no painel.** Os content scripts só leem e normalizam (cor em hex,
tempo em ms). Nomes, escalas e papéis ficam em `lib/` como módulos puros, testáveis em Node sem
navegador (`test/unit`).

**Cores modernas por canvas.** Valores computados podem vir em `oklch()`, `lab()`, `color()`.
Em vez de implementar cada espaço de cor, o content script pinta 1 pixel num `OffscreenCanvas`
e lê o sRGB (o alfa é separado antes, para não perder precisão). O valor original fica guardado
e aparece como comentário nos tokens.

**Folhas de outra origem pelo service worker.** Content scripts não leem `cssRules` de CSS de CDN
(CORS). O `background.js` busca o texto (tem `host_permissions`), o content script monta um
`CSSStyleSheet` construído e segue os `@import` à mão. Só aceita mensagens de abas e só http(s).

**Papéis semânticos por heurística** (`buildPalette`):
- fundo = fundo da página; texto = entre os textos mais usados, o de maior contraste com o fundo;
  texto secundário = o próximo, menos contrastado;
- primária = o fundo de botão mais usado (mesmo neutro — o preto da Vercel), senão a cromática
  mais usada em elementos clicáveis; destaque = outra cromática com matiz diferente;
- superfície = fundo neutro próximo da claridade do fundo; borda = a cor de borda mais usada.
Validado contra Tailwind, Linear, Stripe, Framer e Vercel (`test/e2e/real-sites.mjs`).

**Nomes que o dev já conhece.** Cores sem papel ganham o nome da cor do Tailwind v4 mais próxima
em OKLCH (`blue-500`), a escala de texto usa os baldes do Tailwind (`5xl`, `base`, `sm`) ou o
tamanho (`text-13`), durações viram números (`--duration-300`) e curvas conhecidas ganham nome
(`out-expo`, `standard`), as demais pelo formato (`out`, `in-out`, `overshoot`).

**Pinça por estilo computado.** Ler as regras que casam com cada elemento custaria
O(elementos × regras). Em vez disso: estilo computado de cada nó comparado com o padrão da mesma
tag num iframe limpo (com a variante certa: `<a>` com href, `<input>` com type), mais as regras
`:hover/:focus` lidas do CSSOM com `querySelectorAll` por regra (uma consulta por regra, não por nó).
Larguras e alturas só entram quando parecem explícitas (elementos substituídos, absolutos, vazios,
blocos mais estreitos que o pai, itens flex que não crescem nem encolhem, alturas maiores que o
conteúdo) — o componente continua fluido.

**Figma pela API de plugins.** O Figma desenha num canvas; não há DOM para ler. O global `figma`
fica disponível na página depois que um plugin é aberto uma vez no arquivo. O Decalque exporta cada
página como `JSON_REST_V1` (o mesmo formato da API REST), então **um único scan** (`lib/figma-scan.js`,
script clássico carregado no painel, nos testes e na página do Figma) atende os dois caminhos.
A API REST fica como alternativa para arquivos só de visualização, por causa dos limites de uso
do plano gratuito.

**ZIP sem compressão.** Imagens e fontes já vêm comprimidas; os textos do kit são pequenos.
`lib/zip.js` grava no método *store* com CRC-32 (`unzip -t` limpo). Se o kit crescer, trocar por
`CompressionStream('deflate-raw')`.

## Segurança

Tudo que vem da página é tratado como dado não confiável — inclusive o que volta do mundo MAIN, onde a página
controla os globais (até `String` e `Array`):

- **Painel:** só `textContent`/`setAttribute`, nunca `innerHTML`; prévia de componente em iframe `sandbox=""`;
  SVGs da página exibidos como `<img src="data:…">`. A pinça só aceita entrada real do usuário (`isTrusted`):
  um carrossel que chama `element.click()` não encerra a seleção.
- **Arquivos gerados:**
  - texto da página em comentário passa por `cmt()` (sem `*/` nem quebra de linha — senão um `<title>`
    malicioso viraria código no `tailwind.config.js`);
  - dentro de `<style>` o `<` vira `\3c ` (um `content: "</style><script>"` não fecha a tag);
  - no HTML/JSX da pinça e nos `.svg` do kit, atributos `on*`, `<script>` de SVG e URL `javascript:`/`vbscript:`
    não saem — a URL é comparada como o parser a lê, sem espaço, tab nem quebra de linha (`java\tscript:`
    executa), e `<set>`/`<animate>` que trocam o `href` também caem. A regra existe em dois lugares
    (`safeAttr` em `lib/component.js` e o filtro do `serializeSvg` em `content/extract.js`, script clássico que
    não importa módulo) e precisa ficar igual nos dois;
  - nenhuma classe do Tailwind sai com aspa dupla: o valor de uma regra `:hover` vem do texto da regra, e um
    `attr(…, " onClick={…} x=")` fecharia o `className="…"`; chave de `style` fora do padrão vai entre aspas;
  - nome e versão de biblioteca lidos no mundo MAIN só com caracteres de versão — uma quebra de linha viraria
    uma seção nova no `DESIGN.md`, que vai para agentes de IA; variáveis STRING do Figma saem entre aspas.
- **Rede:** a extensão tem `host_permissions` e passa por cima das proteções que o navegador aplica à página,
  então toda busca a pedido da página passa por `fetchableUrl` (`lib/util.js`): só http(s), e nenhum
  endereço local/privado quando a página não é local. Sem isso, um site poderia usar a extensão para varrer a
  rede da casa ou pôr no kit um `file:///…` do disco (a extensão descompactada lê `file://`). A regra vale
  para o service worker (timeout de 15 s, teto de 8 MB lido em stream) e para as buscas do painel por
  `fetchBytes` (kit, fontes da prévia, fontes da pinça), que vão **sem cookies**; o que precisa de cookie é
  pedido pela própria página. Num redirecionamento para a rede local a resposta é descartada (o pedido já
  saiu). Até 60 folhas de estilo por extração.
- **Assets no modelo:** o extrator só guarda URL http(s) (`absUrl`), além de `data:`/`blob:`, e o modelo tira
  o que a regra de rede recusaria (`fetchableUrl` com a URL da página). Um `<img data-src="file:///…">` ou uma
  imagem da rede local listada por um site público não vira miniatura no painel nem entra no kit.
- **Token do Figma:** `chrome.storage.local` restrito a contextos confiáveis (content scripts não leem),
  salvo só depois de funcionar, com botão para esquecer; só é enviado para `api.figma.com`.
- **Figma:** o código injetado só lê (`exportAsync`, `getCSSAsync`, `getBytesAsync`); nenhum setter.

## Formato do modelo (resumo)

```js
{
  source: { kind: 'web' | 'figma', url, title, capturedAt, viewport?, via? },
  colors: [{ name, value, hex, alpha, original?, role?, roles, count }],
  semantic: { background, foreground, muted, surface, border, primary, accent },
  gradients, variables: { light, dark, collections },
  fonts: [{ family, role, kind, stack, weights, source, files }] (+ fonts.googleUrl),
  typeScale: [{ name, family, size, weight, lineHeight, letterSpacing, transform }],
  spacing: { base, scale, gaps }, radii, shadows, effects, borders, breakpoints, containers,
  motion: { durations, easings, transitions, animations, keyframes, running, reveals, springs, presets, timelines },
  components: { buttons, inputs, cards, links, figma },
  assets: { images, svgs, fonts, lottie, videos, rive, models, frames, icons, figmaImages },
  stack, notes, stats,
}
```

## Testes

- `test/unit` — paleta, nomes, escalas, todos os exportadores (o `tailwind.config.js` gerado é
  executado), DTCG, conversão para Tailwind, renderização de componente, ZIP validado pelo `unzip`,
  scan do Figma, variáveis com modos e Figma Motion → `@keyframes`; e as regressões de segurança
  (`fetchableUrl`, injeção no HTML/JSX/classes do Tailwind, versões de biblioteca no `DESIGN.md`).
- `test/e2e/run.mjs` — Chromium real com a extensão carregada: página de teste com CSS de outra
  origem sem CORS, tema escuro, sprite SVG, `element.animate()`, reveal por IntersectionObserver,
  Lottie; pinça com `::before` e `:hover` de ancestral; kit .zip conferido; Figma simulado
  (estilos, variáveis, protótipo, Motion, seleção → código, kit com frames/ícones/imagens/vídeo) e
  o aviso de "API indisponível"; `fetchBytes` recusando `file://`, rede local e redirecionamento para
  ela; a pinça ignorando clique e tecla sintéticos.
- `test/e2e/real-sites.mjs` — fumaça em sites reais, imprime o resumo de cada extração.

## Limites e caminhos de evolução

- Componentes capturados refletem só o viewport atual. Caminho: capturar em 2–3 larguras
  (redimensionando via `chrome.debugger`/emulação) e gerar `@media`/prefixos `md:`.
- Animações JS só entram se estavam rodando. Caminho: instrumentar `Element.prototype.animate`
  e o GSAP (mundo MAIN) desde o carregamento da página.
- Figma Motion usa uma API beta: se ela mudar, a extração do resto do arquivo continua (tudo em
  `try/catch`), só as timelines somem.
- Firefox: não tem `chrome.sidePanel`; exigiria uma casca com `sidebar_action`.
