# PR #20 — feat(figma): analisar arquivos do Figma no formato da API REST

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/figma-scan` |
| PR | [#20](https://github.com/VictorNascimento14/Decalque/pull/20) |

## O que muda

`extension/lib/figma-scan.js` — script clássico de propósito, que roda no painel, no Node e dentro da página do Figma:

- percorre o JSON da API REST (arquivo inteiro ou uma página): cores por papel e área, gradientes com ângulo, imagens, estilos de texto (com overrides), fontes, raios, auto layout, traços, sombras e desfoques (raio ÷ 2, como no Dev Mode);
- transições do protótipo com curvas bezier e molas (`GENTLE`, `QUICK`, `BOUNCY`, `SLOW` e customizadas);
- componentes e variantes, ícones candidatos, frames de topo (inclusive dentro de seções) e o valor dos estilos referenciados;
- conversões do formato da API de plugins (paints com `gradientTransform`, estilos de texto com peso a partir do nome).

## Por quê

Um scan só para os dois caminhos de leitura do Figma: a API de plugins exporta as páginas como `JSON_REST_V1` e a API REST devolve o mesmo formato.

## Como testar

`npm test` — scan de um arquivo de exemplo (frames, estilos, gradiente, ícones, imagem, sombra, transição, camada oculta ignorada) e as conversões do plugin API.

## Revisão

`ocr delegate` no modo workspace: `lib/figma-scan.js` (+406) e a fixture. Os três apontamentos do verificador de regras são falsos positivos (`(?:` de regex).

- **Dado do arquivo como dado:** nome de camada, de estilo e de componente nunca vira chave de objeto comum — todo acúmulo é `Map`, então um `__proto__` no nome não polui nada. Texto que sai daqui para o `DESIGN.md` e para o CSS passa pelos exportadores (`cmt()` nos comentários, escape nas tabelas).
- **Um scan para os dois caminhos:** o mesmo código analisa o `JSON_REST_V1` da API de plugins e a resposta da API REST. Os testes rodam a fixture em Node.
- Baixo, sem mudança: o `walk` é recursivo e sem teto de profundidade. Um arquivo com milhares de níveis estoura a pilha, e a extração termina com mensagem de erro, sem perda de dado. Arquivos reais ficam abaixo de cem níveis.

## Arquivos

- `extension/lib/figma-scan.js`
- `test/unit/figma-fixtures.js`
- `test/unit/figma-scan.test.js`
