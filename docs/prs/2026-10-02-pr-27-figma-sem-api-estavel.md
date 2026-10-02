# PR #27 — test(e2e): não criar a API simulada na página do Figma sem API

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `test/figma-sem-api-estavel` |
| PR | [#27](https://github.com/VictorNascimento14/Decalque/pull/27) |

## O que muda

- `test/fixtures/figma.html`: com `?mock=0`, a página não cria o `window.figma` simulado.
- `test/e2e/run.mjs`: o passo "sem a API do Figma" deixa de apagar o `window.figma` depois do carregamento.

## Por quê

O passo falhou uma vez em três execuções do CI (no #25, que só mexia em documentação), com `page.waitForSelector: Timeout 15000ms exceeded`. A fixture cria a API dentro de uma função assíncrona que antes espera `fetch('/hero.png')`, e `fetch` não segura o evento `load`. Assim o `goto` podia terminar antes de a API existir: o teste apagava um `window.figma` que ainda não existia, a fixture o criava logo depois e o painel encontrava a API "ativa" — o aviso esperado nunca aparecia. O `?mock=0` já estava na URL do teste, mas a fixture não o lia.

## Como testar

- Reprodução determinística da falha, com o arquivo anterior: o servidor atrasa o PNG em 1 s só para a página `?mock=0` (pelo Referer) e o teste espera 1,5 s antes de abrir o painel — o passo falha com o mesmo `Timeout 15000ms exceeded` do CI.
- Com a correção, a mesma reprodução passa (18/18) e a suíte normal também.

## Revisão

`ocr delegate` no modo workspace: `test/e2e/run.mjs` (−4); a fixture fica fora do filtro da ferramenta e foi lida.

- **A causa, não o sintoma:** a primeira tentativa era fazer o `tabIdOf` esperar a aba aparecer e acrescentar diagnóstico ao timeout. Ela foi descartada antes de virar commit, porque a reprodução mostrou outra causa: a fixture criava a API depois do `load`. A correção tira a corrida em vez de alargar a espera.
- **Sem perda de cobertura:** o passo continua provando o mesmo comportamento — o painel mostra o passo a passo quando o global `figma` não existe —, agora numa página onde ele de fato nunca existe.

Nenhum achado em aberto.

## Arquivos

- `test/e2e/run.mjs`
- `test/fixtures/figma.html`
