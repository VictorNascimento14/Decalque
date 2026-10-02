# PR #1 — chore: criar a base do projeto com checagem de sintaxe, testes e CI

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `chore/base-do-projeto` |
| PR | [#1](https://github.com/VictorNascimento14/Decalque/pull/1) |

## O que muda

A base do repositório, sem dependências de execução:

- `package.json` com `npm run lint` (confere a sintaxe de todo `.js` da extensão, dos testes e dos scripts — e o `manifest.json` quando ele existir) e `npm test` (`node:test`, sem navegador).
- CI no GitHub Actions rodando os dois em todo PR e na `main`, mais o workflow `pr-documentacao.yml`, que reprova PR sem a seção `## 📓 Documentação` linkando a nota em `docs/prs/`.
- `CLAUDE.md` com o mapa do projeto, os invariantes de segurança e o fluxo de publicação (branch → checks → nota → PR → squash), sem menção a ferramenta de IA em commit ou PR.
- O primeiro módulo puro, `extension/lib/util.js`: `slugify`, nomes únicos (`primary`, `primary-2`…), divisão por vírgula que respeita parênteses e aspas, tempo CSS em ms, nome real das fontes do `next/font` (`__Inter_d65c78` → `Inter`), pilhas de fallback, nomes de curvas conhecidas (`out-expo`, `standard`, pelo formato quando desconhecida) e mola amortecida convertida em `linear()`.

## Por quê

Tudo o que vem depois se apoia nessas utilidades e no CI. Lint e testes rodam só com Node, então o CI é rápido e não depende de instalar nada.

## Como testar

1. `npm run lint` — todos os arquivos ok.
2. `npm test` — testes de `util.js` (divisão, nomes, tempos, curvas e molas que vão de 0 a 1 sem passar do alvo quando superamortecidas).

## Revisão

`ocr delegate` no modo workspace: 5 de 8 arquivos revisáveis, em dois grupos de regras (workflows do GitHub Actions e JS/MJS). `CLAUDE.md`, `package-lock.json` e o teste ficam fora pela regra padrão.

- **Workflows**: sem `pull_request_target`, sem segredo, o corpo do PR chega ao `run:` por `env:` (sem injeção de script), actions oficiais em `v4`. Corrigido antes de abrir o PR: faltavam `permissions` (agora `contents: read`) e `timeout-minutes` nos jobs.
- **`util.js` e `check-syntax.mjs`**: sem `==`, sem `var`, sem código morto; falha do `node --check` vira mensagem com o arquivo e o motivo.

Nenhum achado em aberto.

## Arquivos

- `.github/workflows/ci.yml`
- `.github/workflows/pr-documentacao.yml`
- `CLAUDE.md`
- `extension/lib/util.js`
- `package-lock.json`
- `package.json`
- `scripts/check-syntax.mjs`
- `test/unit/util.test.js`
