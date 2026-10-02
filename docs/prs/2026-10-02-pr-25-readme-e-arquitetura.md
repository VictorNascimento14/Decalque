# PR #25 — docs: escrever o README e a arquitetura

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `docs/readme-e-arquitetura` |
| PR | [#25](https://github.com/VictorNascimento14/Decalque/pull/25) |

## O que muda

- `README.md`: o que sai do Decalque, instalação, uso em sites (inclusive a pinça) e no Figma, limites conhecidos, privacidade e desenvolvimento.
- `docs/arquitetura.md`: fluxo entre painel, content scripts e `lib/`, decisões (painel lateral, cores por canvas, CSS de outra origem pelo worker, heurísticas de papel, pinça por estilo computado, Figma pela API de plugins, ZIP sem compressão), segurança, formato do modelo, testes e caminhos de evolução. A seção de segurança reúne as regras desta série: `fetchableUrl` em toda busca a pedido da página, URL comparada como o parser a lê, classes do Tailwind sem aspa dupla, versões de biblioteca limpas antes do `DESIGN.md` e `isTrusted` na pinça.
- A privacidade do README diz o que a extensão realmente pede: os arquivos da página, o Google Fonts para a prévia tipográfica (só o nome da família) e `api.figma.com` com token.

## Por quê

Quem chega ao repositório precisa saber instalar, usar e onde mexer sem ler o código inteiro.

## Como testar

Leitura; os comandos do README são os mesmos do CI.

## Revisão

O `ocr delegate` não revisa Markdown (0 arquivos revisáveis); a revisão foi à mão, conferindo cada afirmação contra o código já no `main`:

- o atalho `Alt+Shift+D` está no `manifest.json`; os comandos de desenvolvimento são os scripts do `package.json` e os mesmos do CI;
- o fluxo do token do Figma (salvo só depois de funcionar, fora do alcance de content scripts, só para `api.figma.com`, botão de esquecer) é o do #23;
- **Corrigido na escrita:** a primeira versão da seção Privacidade dizia que as únicas requisições iam para a página e para `api.figma.com`, mas a prévia tipográfica também consulta o Google Fonts (só o nome da família) quando a fonte não veio com a página. O texto agora diz isso;
- a seção de segurança da arquitetura descreve só o que já está no `main`. O que o PR de correção da extração (#26) muda — URLs dos assets e o filtro de SVG do kit — entra no próprio #26.

## Arquivos

- `README.md`
- `docs/arquitetura.md`
