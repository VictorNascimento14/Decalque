# PR #11 — feat(exportação): gerar animations.css, reveal.js e DESIGN.md

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/exportar-design-md` |
| PR | [#11](https://github.com/VictorNascimento14/Decalque/pull/11) |

## O que muda

- `animations.css`: `@keyframes` em uso, animações de JS convertidas em CSS, classes `.reveal-*` (estado inicial + `.is-visible`) e o bloco de `prefers-reduced-motion`;
- `reveal.js`: o `IntersectionObserver` que liga os reveals;
- `DESIGN.md`: identidade em uma linha, como aplicar (CSS, Tailwind v4/v3, DTCG), regras para manter o visual, **prompt pronto para agente de IA**, cores com papel e uso, tipografia, espaçamento, raios, sombras, layout, componentes com CSS e estados `:hover`/`:focus`, movimento, assets e observações.

## Por quê

O `DESIGN.md` é o arquivo que se entrega a um agente (Claude Code, Cursor) para aplicar o design em outro projeto. O `animations.css` + `reveal.js` reproduzem as animações sem depender da biblioteca original.

## Como testar

`npm test` — inclui a regressão de segurança: um `<title>` com `*/` não sai do comentário nem executa código no `tailwind.config.js`.

## Revisão

`ocr delegate` no modo workspace: `lib/exporters.js` (+392/−2) e o teste, grupo de regras JS.

- **O que o `DESIGN.md` promete, o kit entrega** (conferido chamada a chamada): `.text-*` existe no `tokens.css`; `tailwind.theme.css` traz `@import "tailwindcss"` e o `@theme`; `reveal.js` só é citado quando há reveals (mesma condição que o inclui no `.zip`); `assets/manifest.json` existe sempre que há assets.
- **Título sem quebra de linha nem `#`, `<`, `>` ou crase**, e com teto de 120 caracteres — o arquivo vai para um agente de IA; texto do site nas tabelas tem `|` e quebra de linha escapados.
- **Reveals**: duração fora de 50 ms–4 s cai para 700 ms; `prefers-reduced-motion` desliga animações e reveals.
- Bloco de estado vazio (ex.: `:focus-visible` só com `outline: none`) não é impresso.

Nenhum achado em aberto. O teste novo cobre a injeção por `<title>` com `*/` nos quatro arquivos gerados.

## Arquivos

- `extension/lib/exporters.js`
- `test/unit/design-md.test.js`
