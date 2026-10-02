# PR #7 — feat(extração): coletar imagens, SVGs, Lottie, vídeos e a stack do site

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/extracao-assets` |
| PR | [#7](https://github.com/VictorNascimento14/Decalque/pull/7) |

## O que muda

- **Imagens**: uma por elemento — a maior resolução do `srcset` (parser da especificação, inclusive sem espaço depois da vírgula) ou do `<source>` que o navegador escolheu; fundos, máscaras, pseudo-elementos, favicons, `og:image` e pôsteres.
- **SVG inline autônomo**: o CSS da página vira atributo, sprites (`<use href="#…">`) e `url(#…)` entram em `<defs>`, `currentColor` é preservado e nada que execute código vai junto (`<script>`, `on*`, `javascript:`).
- **Lottie** (players e arquivos `.json`/`.lottie`), Rive, modelos 3D e vídeos.
- **Stack detectada**: framework (Next.js, Nuxt, Astro…), builder (Webflow, Framer…), CSS (Tailwind, Bootstrap…), UI (Radix, shadcn/ui…), movimento (GSAP, AOS, Lenis, Lottie, Three.js…) e ícones.
- `fetchAsBase64`: a própria página baixa o que só sai com o cookie ou o Referer dela.

## Por quê

O kit precisa levar os assets, e a stack ajuda a explicar como o site foi feito no `DESIGN.md`.

## Como testar

`await __decalque.extract()` devolve `assets` (imagens, SVGs, Lottie, vídeos) e `stack`.

## Revisão

`ocr delegate` no modo workspace: `content/extract.js` (+365/−3), grupo de regras JS.

- **SVG exportado é autônomo e inerte**: o clone recebe o CSS computado como atributo e as referências (`<use href="#…">`, `url(#…)`) em `<defs>`; `<script>`, `<foreignObject>`, `<iframe>`, atributos `on*`, `href` com `javascript:`/`vbscript:` e nomes de atributo inválidos (ex.: `@click` do Alpine) são removidos — o `.svg` do kit pode ser aberto direto no navegador.
- **Imagens**: um arquivo por elemento (maior resolução do `srcset` ou do `<source>` escolhido); `data:` grande demais ou que não é imagem fica de fora; `blob:` é baixado pela página.
- **`fetchAsBase64`** roda no contexto da página (cookies e Referer dela), com teto de 40 MB.
- **Stack**: só lê sinais do DOM (scripts, atributos, classes, meta generator); nada é executado.
- Sem `innerHTML`; ternários encadeados de uma linha mantidos.

Nenhum achado em aberto. Verificação extra: na página de teste vieram imagens (com `srcset` sem espaço após a vírgula), o SVG com sprite resolvido, o Lottie e a stack.

## Arquivos

- `extension/content/extract.js`
