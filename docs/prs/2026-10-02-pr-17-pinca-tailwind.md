# PR #17 — feat(pinça): converter estilos computados em classes do Tailwind

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/pinca-tailwind` |
| PR | [#17](https://github.com/VictorNascimento14/Decalque/pull/17) |

## O que muda

`extension/lib/tailwind.js`: declarações → utilitários (`p-4`, `py-2 px-5`, `rounded-full`, `border border-[#27272a]`, `gap-6`, `grid-cols-3`, flex, tipografia, sombras com a cor no fim, transições, opacidade…). Valores fora da escala vão em `[]`; o resto vira propriedade arbitrária `[prop:valor]`, então nada se perde.

- só números de escala que existem no v3 **e** no v4;
- `var()` vira propriedade arbitrária (o Tailwind adivinharia o tipo errado);
- **nenhuma classe sai com aspa dupla nem espaço** — a guarda fica na saída do `toClassList`, não em cada ramo. Os ramos de `order`, `font-weight`, `flex-grow`, `object-fit` e `mix-blend-mode` montavam a classe com o valor cru, e o valor das regras `:hover` vem do texto da regra: o Chromium aceita `order: attr(x type(<integer>), " onClick={…} data-x=")`, e a aspa que delimita a string fechava o `className="…"`, injetando JSX no componente que o usuário cola no projeto;
- `aspect-ratio: auto …` e estilos de borda inexistentes no Tailwind tratados.

## Por quê

O componente capturado sai em React + Tailwind, a stack mais comum nos projetos de destino.

## Como testar

`npm test` — tabela de conversões, os casos de borda (`aspect-ratio`, `var()`, `groove`) e o teste novo de injeção (`attr()` com aspas, custom property com aspas no nome, valor com aspas em `object-fit`). Contraprova: sem a guarda, o teste falha com `hover:order-[attr(… "\" onClick={() => alert(1)} …")]`.

## Revisão

`ocr delegate` no modo workspace: `lib/tailwind.js` (+340) e o teste. Os ternários encadeados de palavra-chave → utilitário (`grow`, `bg-cover`, `invisible`…) ficaram como estão: são tabelas de três casos.

- **Achado (alto) — corrigido neste PR:** classes com o valor cru podiam fechar o `className="…"` do JSX. O valor de uma regra `:hover` vem do texto da regra, e o Chromium 148 aceita `order: attr(data-x type(<integer>), " onClick={() => …} data-x=")` (conferido no CSSOM). O `declsFromCss` deixa o `attr()` passar e resolve `var()` pelo fallback, então a aspa que delimita a string fecha o atributo e o `onClick` vira JSX válido no componente que o usuário cola no projeto. A guarda agora fica na saída do `toClassList`, por onde passa todo uso externo: nenhuma classe sai com aspa dupla nem espaço, venha de que ramo vier. Isso também cobre nomes de custom property com aspas por escape (`--a\"b`).
- **Conferido sem achado:** só números de escala que existem no v3 e no v4; `var()` vira propriedade arbitrária antes do `switch`.

## Arquivos

- `extension/lib/tailwind.js`
- `test/unit/tailwind.test.js`
