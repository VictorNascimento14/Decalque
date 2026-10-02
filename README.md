# Decalque

> Decalque o design de qualquer site — ou de um arquivo do Figma — e aplique no seu projeto.

Extensão para Chrome/Chromium (Manifest V3, painel lateral) que lê a página aberta e entrega o
**design system** dela pronto para usar: cores com papéis, tipografia, espaçamentos, raios,
sombras, breakpoints, animações, imagens, ícones e fontes — além de uma **pinça** que transforma
qualquer elemento clicado em HTML/CSS ou React + Tailwind.

## O que sai do Decalque

| Arquivo | Para quê |
| --- | --- |
| `DESIGN.md` | Guia completo do design (para você e para agentes de IA como o Claude Code), com prompt pronto |
| `tokens.css` | Variáveis CSS (`--color-primary`, `--text-h1`, `--space-4`…) + classes `.text-*` |
| `tailwind.theme.css` | Tema do Tailwind v4 (`@theme`) com cores, fontes, escala de texto, raios, sombras, curvas, breakpoints e animações |
| `tailwind.config.js` | O mesmo para Tailwind v3 |
| `tokens.json` | W3C Design Tokens (DTCG 2025.10) para Style Dictionary, Tokens Studio etc. |
| `animations.css` + `reveal.js` | `@keyframes` em uso, animações feitas em JS, reveals ao rolar a página |
| `site-variables.css` | As variáveis CSS originais do site (ou do Figma), com tema escuro |
| `assets/` | Imagens, SVGs/ícones (sprites resolvidos), fontes, Lottie, vídeos (opcional), frames do Figma |
| `screenshot.png`, `decalque.json` | Captura da tela e o modelo completo em JSON |

## Instalar

1. Abra `chrome://extensions` (vale para Chrome, Brave, Edge, Opera).
2. Ligue o **Modo do desenvolvedor**.
3. **Carregar sem compactação** → escolha a pasta `decalque/extension`.
4. Fixe o ícone do Decalque. Clique nele (ou `Alt+Shift+D`) para abrir o painel lateral.

Para levar a outra máquina: `npm run pack` gera `dist/decalque-<versão>.zip`.

## Usar em sites

1. Abra o site e clique em **Extrair design desta página**.
   Com **Rolar a página** ligado (padrão), o Decalque rola até o fim para disparar animações de
   entrada (reveals) e carregar imagens lazy, e depois volta ao topo.
2. Navegue pelas abas: Cores, Tipografia, Layout, Efeitos, Movimento (com prévia das animações),
   Componentes (botões, campos e cards com `:hover`), Assets.
3. **Baixar kit (.zip)** — ou copie só o arquivo que precisar na aba Exportar.

**Pinça (Capturar componente):** passe o mouse pela página e clique no elemento. O painel mostra a
prévia e o código em três abas — HTML, CSS e React + Tailwind — com estados `:hover`/`:focus`,
`::before`/`::after`, `@keyframes` e `@font-face` que o elemento usa. **↑ Pai** sobe um nível.

**Para aplicar no seu projeto:** abra o `DESIGN.md` do kit no seu agente de IA (há um prompt pronto
no arquivo) ou importe `tokens.css` / `tailwind.theme.css` no CSS global.

## Usar no Figma

O Figma desenha o arquivo num canvas, então o Decalque lê pela **API de plugins** que o próprio Figma
expõe na página (o global `figma`). Não precisa de token nem de plano pago, mas:

- você precisa **poder editar** o arquivo (arquivo da Comunidade ou só de visualização: duplique para
  os seus Rascunhos);
- o Figma só expõe a API **depois que algum plugin foi aberto uma vez** no arquivo
  (menu Ações → Plugins e widgets → abra qualquer um e feche). O painel avisa e tem **Tentar de novo**.

Com a API ativa, o Decalque extrai:

- estilos de cor, texto, efeito e grid **com os nomes do arquivo** (`Green/Green 60` → `--color-green-60`);
- **variáveis** com modos (o modo padrão vira `:root`, um modo "Dark" vira `.dark`);
- cores, fontes, raios e espaçamentos de auto layout realmente usados;
- transições do protótipo (curvas e molas, já convertidas para CSS `linear()` e para Framer Motion);
- **Figma Motion** (keyframes das timelines) convertido em `@keyframes` — API beta do Figma;
- frames em PNG, ícones em SVG, imagens originais e, opcionalmente, animações em vídeo WebM;
- **Gerar código da seleção**: o frame selecionado vira HTML/CSS (CSS gerado pelo próprio Figma) e React + Tailwind.

**Sem acesso de edição?** Use a API REST com um token pessoal (Figma → Configurações → Segurança →
Tokens de acesso pessoal, escopo `file_content:read`). O token só é salvo depois de funcionar, fica no
`chrome.storage.local` deste navegador (fora do alcance de content scripts), só é enviado para
`api.figma.com` e pode ser apagado em **Esquecer o token salvo**. Atenção ao limite: no plano gratuito, assentos
View/Collab têm poucas chamadas por mês nos endpoints de arquivo (cada extração usa 1; o kit, 1 a 3).

## Limites conhecidos

- Os valores são os **computados no viewport atual**: a pinça captura o componente naquela largura
  (os breakpoints aparecem nos tokens, não no componente).
- Animações feitas em JavaScript (GSAP, Framer Motion…) só entram se estavam rodando durante a captura
  ou se a varredura com rolagem as disparou. Conteúdo em `<canvas>`/WebGL não vira código.
- Iframes de outra origem não são lidos. Folhas de estilo bloqueadas aparecem como aviso.
- Logos, fotos, ilustrações e fontes têm dono: use como referência e confira licenças antes de publicar.

## Privacidade

Tudo roda no seu navegador. As requisições vão para os arquivos que a própria página usa (CSS, imagens,
fontes), para o Google Fonts quando a prévia tipográfica precisa de uma fonte que não veio com a página (vai
só o nome da família) e, se você usar token, para `api.figma.com`. Nenhum dado é enviado a outro lugar.

## Desenvolvimento

```bash
npm install          # só o Playwright, para o teste ponta a ponta
npm test             # testes unitários (node:test), sem navegador
npm run lint         # sintaxe de todos os .js + manifest
npm run e2e          # carrega a extensão num Chromium e testa site + Figma simulado
node test/e2e/real-sites.mjs https://stripe.com/br   # fumaça em sites reais (precisa de internet)
npm run icons        # regenera os PNGs a partir de extension/icons/logo.svg
npm run pack         # dist/decalque-<versão>.zip
```

Arquitetura e decisões em [`docs/arquitetura.md`](docs/arquitetura.md).
