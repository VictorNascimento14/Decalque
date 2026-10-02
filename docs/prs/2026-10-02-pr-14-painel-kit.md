# PR #14 — feat(painel): montar o kit .zip com tokens e assets baixados

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/painel-kit` |
| PR | [#14](https://github.com/VictorNascimento14/Decalque/pull/14) |

## O que muda

`extension/sidepanel/kit.js`: o kit com `DESIGN.md`, `tokens.css`, Tailwind v4/v3, `tokens.json`, `animations.css`, `reveal.js`, `site-variables.css`, `decalque.json`, `screenshot.png` e os assets (imagens, SVGs, fontes, Lottie e vídeos opcionais).

- downloads **sem cookies**, com timeout de 20 s e teto de 30 MB por arquivo (lido em stream) e 300 MB no total;
- o que o painel não consegue baixar é pedido à própria página (`fetchAsBase64`);
- `data:` URLs decodificadas (inclusive `;utf8`), nomes de arquivo únicos, falhas listadas em `assets/manifest.json`;
- o `@font-face` do `tokens.css` aponta para as fontes baixadas.

**A regra de rede sai do service worker e vira `fetchableUrl` em `lib/util.js`**: só http(s), e rede local só quando a própria página também é local. O kit e o `background.js` usam a mesma função; para importá-la, o service worker passa a ser módulo (`"type": "module"` no manifesto). O `isPrivateHost` ganhou o IPv4 dentro de IPv6 (`[::ffff:127.0.0.1]`), que antes passava. Num redirecionamento, o destino passa pela mesma regra (`res.url`): a resposta que cai na rede local é descartada — no kit e no service worker.

## Por quê

Um arquivo só, pronto para soltar no projeto ou entregar a um agente de IA.

A regra compartilhada fecha um furo achado na revisão. O kit baixa direto pelo painel, que tem `host_permissions` e passa por cima das proteções que o navegador aplica à página. Na primeira versão, ele baixava qualquer URL que a página listasse. Testado no Chromium com a extensão descompactada (é assim que o Decalque se instala): o painel lê `file:///…` sem nenhuma permissão extra, então um `<img data-src="file:///home/…/.ssh/id_rsa">` punha a chave no kit — que foi feito para ir para dentro de um projeto e, às vezes, para um repositório público. O mesmo caminho alcançava a rede local a partir de um site público.

## Como testar

- `npm test`: o teste novo de `fetchableUrl` cobre `file:`, `javascript:`, `localhost`, `0x7f.1`, `2130706433`, `[::ffff:127.0.0.1]`, faixas privadas e link-local, a página local liberando rede local e a ausência de página.
- Ponta a ponta (a suíte chega no #24): o passo novo chama o `fetchBytes` de verdade dentro da página do painel com um `file://` real, um endereço local, um `javascript:` e uma URL pública que redireciona para a rede local, e espera os quatro bloqueados. Contraprova: sem a checagem, o passo falha com `file: baixou: CONTEUDO-SECRETO`; sem a do redirecionamento, com `redir: baixou: �PNG`.
- Pelo painel no #15: **Baixar kit (.zip)** e `unzip -l` no arquivo.

## Revisão

`ocr delegate` no modo workspace: `kit.js` (+227), `lib/util.js` (+44), `background.js` (+10/−33) e `manifest.json`. O `CLAUDE.md` e o teste ficam fora do filtro da ferramenta, mas foram lidos.

- **Achado (alto) — corrigido neste PR:** o kit baixava qualquer URL que a página listasse, direto pelo painel. A extensão descompactada lê `file://` sem permissão extra (testado no Chromium), então um arquivo do disco podia entrar no kit; o mesmo caminho alcançava a rede local a partir de um site público. Agora tudo passa por `fetchableUrl`, a mesma regra do service worker. Ela fica em `lib/util.js`, onde o Node testa.
- **Achado (médio) — corrigido:** `[::ffff:127.0.0.1]` (IPv4 dentro de IPv6) escapava do `isPrivateHost`.
- **Achado (médio) — mitigado:** um redirecionamento de URL pública para a rede local passava. A resposta agora é descartada por `res.url`; o pedido em si ainda sai (anotado com `ponytail:` no código).
- **Conferido sem achado:** nomes no `.zip` saem de `slugify`, e a extensão de lista fixa ou de `[a-z0-9]{2,5}` (sem `../`). O teto de 30 MB é lido em stream e há 300 MB no total. As URLs `data:` são decodificadas, inclusive `;utf8`. Lottie é conferido antes de entrar.
- Baixo, sem mudança: o total do kit conta texto em unidades UTF-16, não em bytes. Só afeta a conta dos 300 MB.

## Arquivos

- `CLAUDE.md`
- `extension/background.js`
- `extension/lib/util.js`
- `extension/manifest.json`
- `extension/sidepanel/kit.js`
- `test/unit/util.test.js`
