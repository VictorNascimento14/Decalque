# PR #23 — feat(figma): extrair arquivos do Figma e gerar código da seleção pelo painel

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/figma-painel` |
| PR | [#23](https://github.com/VictorNascimento14/Decalque/pull/23) |

## O que muda

Modo Figma no painel:

- detecta a API de plugins na aba e, quando ela não está ativa, mostra o passo a passo (acesso de edição, abrir um plugin uma vez, tentar de novo);
- extrai todas as páginas ou só a atual; **Gerar código da seleção** usa a mesma tela da pinça;
- o resultado sobrevive à troca de página ou de camada (o Figma reescreve `?node-id=`);
- alternativa pela **API REST** com token pessoal: salvo só depois de funcionar, fora do alcance de content scripts, com botão para esquecer;
- kit do Figma com frames em PNG (escala com teto de altura), ícones em SVG, imagens originais e vídeo WebM das timelines, pelo plugin ou pela REST — a falha de um grupo (ex.: 429) não derruba o kit.

## Por quê

Fecha o pedido original: pegar o design de um arquivo do Figma como se pega o de um site.

## Como testar

1. Abrir um arquivo seu no Figma (com acesso de edição) e abrir qualquer plugin uma vez.
2. No painel: **Extrair design do arquivo**, selecionar um frame e **Gerar código da seleção**.
3. Baixar o kit com frames e ícones.

## Revisão

`ocr delegate` no modo workspace: `panel.js` (+156/−18), `kit.js` (+94/−3) e `index.html`.

- **Token do Figma:**
  - Campo `password`, sem autocompletar.
  - Fica salvo só depois de uma chamada que funcionou, no `storage.local` restrito a contextos confiáveis (content scripts não leem).
  - Tem botão para esquecer.
  - Vai só no cabeçalho para `api.figma.com` (`lib/figma.js`). Os downloads das URLs devolvidas pela API passam por `fetchBytes` sem o token.
- **Ponte MAIN só no Figma:** o modo Figma depende de `parseFigmaUrl`, que exige `figma.com` ou subdomínio. Nenhum outro site recebe `figma-scan.js`/`figma-main.js` no mundo MAIN.
- **Kit do Figma com teto:** 60 frames, 300 ícones, 150 imagens e 8 vídeos; frame limitado a 12 mil px de altura. Nomes por `slugify`. Erro num lote da API REST (ex.: 429) marca só aquele grupo como falho.
- **Chave estável:** `pageKey` usa a chave do arquivo, então o `?node-id=` que o Figma reescreve ao clicar não descarta o resultado.
- Com este PR, `extension/` fica idêntica à versão final; a suíte ponta a ponta do #24 roda contra ela (18/18 local).

Nenhum achado em aberto.

## Arquivos

- `extension/sidepanel/index.html`
- `extension/sidepanel/kit.js`
- `extension/sidepanel/panel.js`
