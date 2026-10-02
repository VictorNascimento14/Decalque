# PR #26 — fix(extração): barrar file:, rede local e javascript: disfarçado nos assets

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `fix/extracao-urls-e-svg` |
| PR | [#26](https://github.com/VictorNascimento14/Decalque/pull/26) |

## O que muda

Fecha os dois achados que as revisões do #13 e do #18 deixaram para a extração:

- **`absUrl` só devolve http(s)** (`content/extract.js`). Um `<img data-src="file:///…">`, um `background-image: url(javascript:…)` ou um Lottie com `file:` não entram mais no resultado bruto; vídeo e Lottie passam a tratar o `null`.
- **O modelo tira o que a regra de rede recusaria** (`lib/model.js`, com `fetchableUrl` e a URL da página): imagem, vídeo, Lottie, Rive, 3D e arquivo de fonte da rede local listados por um site público não viram miniatura no painel nem entram no kit. De página local (site em desenvolvimento), entram.
- **O filtro do `serializeSvg` fica igual ao `safeAttr` do #18**: URL comparada sem espaço, tab nem quebra de linha (`java&#9;script:` executa), item por item em `values="a;b"`, e `<set>`/`<animate>` com `attributeName="href"` não saem. Vale para os `.svg` do kit e para o SVG copiado no painel.
- README (privacidade e limites), arquitetura e o invariante 3 do `CLAUDE.md`, que agora diz que a regra de URL vive em dois lugares.

## Por quê

Tudo que vem da página é dado não confiável, e URL de asset vira miniatura no painel, download no kit e texto no `DESIGN.md`. O #14 já bloqueava o download; aqui a URL inútil ou perigosa nem chega ao modelo. O `.svg` do kit pode ser aberto direto no navegador ou colado inline num projeto, e lá um `xlink:href` com tab no meio do `javascript:` executa no clique.

## Como testar

- `npm test`: o teste novo do modelo põe `http://192.168.0.1/…`, `file:///…`, `http://localhost:3000/…` e uma fonte em `10.0.0.2` num site público e confere que só `data:` e as URLs públicas ficam; de `http://localhost:5173/`, o Lottie local entra. Contraprova: com o filtro desligado, o teste lista as quatro URLs barradas.
- Ponta a ponta: a página de teste ganhou os vetores (`<img data-src="file:///etc/hostname">`, fundo com `javascript:`, Lottie `file:` e um SVG com `java&#9;script:` e `<set attributeName="href">`). O passo de assets exige só URLs http(s), `data:` ou `blob:` e um SVG limpo. Contraprova com o `extract.js` anterior: o passo falha no SVG.
- Extração bruta comparada à parte, sem o modelo: com o `extract.js` anterior saíam `file:///etc/hostname`, `javascript:alert(1)` e `file:///tmp/anim.json`; com o novo, nada.

## Revisão

`ocr delegate` no modo workspace: `content/extract.js` (+20/−6), `lib/model.js` (+10/−6) e `test/e2e/run.mjs` (+6). Docs, fixture e teste unitário ficam fora do filtro da ferramenta, mas foram lidos.

- **Duas camadas, provadas separadamente:**
  - `absUrl` limpa na origem. Com o arquivo anterior, a extração bruta da página de teste trazia `file:///etc/hostname`, `javascript:alert(1)` e `file:///tmp/anim.json`; agora, nada.
  - O modelo aplica a regra de rede com a URL da página. A contraprova do teste unitário lista as quatro URLs barradas.
  - O e2e confere o resultado final.
- **Todos os chamadores do `absUrl` tratam `null`:** `@import`, `CSSImportRule.href`, fontes e imagens já tratavam; vídeo, Lottie e o `poster` passaram a tratar.
- **O filtro de SVG ficou igual ao `safeAttr` do #18:** os dois lugares estão anotados no código e no invariante 3 do `CLAUDE.md`. O script clássico não pode importar o módulo, então a duplicação é consciente.
- **Efeito colateral aceito e documentado no README:** páginas abertas de `file://` continuam extraíveis (cores, tipografia, componentes), mas as imagens e fontes delas não entram no kit.

Nenhum achado em aberto.

## Arquivos

- `CLAUDE.md`
- `README.md`
- `docs/arquitetura.md`
- `extension/content/extract.js`
- `extension/lib/model.js`
- `test/e2e/run.mjs`
- `test/fixtures/site.html`
- `test/unit/model.test.js`
