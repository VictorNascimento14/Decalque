# PR #8 — feat(extração): rolar a página para pegar reveals e animações em execução

| | |
|---|---|
| Data | 02/10/2026 |
| Branch | `feat/extracao-movimento` |
| PR | [#8](https://github.com/VictorNascimento14/Decalque/pull/8) |

## O que muda

- **Animações em execução** pela Web Animations API: animações CSS, transições e as criadas em JS (`element.animate()`, Framer Motion, Motion One), com os keyframes.
- **`scrollScan()`**: fotografa os elementos com cara de "antes do reveal" (opacidade baixa, deslocados, desfocados ou com classe de biblioteca), rola a página em 24 passos com `IntersectionObserver` e `MutationObserver`, guarda o estado mais revelado de cada um e agrupa em padrões (`fade-up`, `slide-left`, `zoom-in`, `blur-in`…) com duração, curva e disparo (classe adicionada, estilo inline de JS ou CSS). Marquee e parallax — estilo inline mexido o tempo todo sem mudar a opacidade — ficam de fora. A rolagem volta ao ponto de partida.

## Por quê

Animação de entrada é boa parte da cara de um site, e a maioria só dispara com a rolagem. A rolagem também carrega as imagens lazy antes da coleta de assets.

## Como testar

Numa página com reveal ao rolar: `await __decalque.scrollScan()` devolve os padrões encontrados e a contagem de elementos.

## Revisão

`ocr delegate` no modo workspace: `content/extract.js` (+221), grupo de regras JS.

- **A página volta como estava**: a rolagem roda dentro de `try/finally`, que desconecta o `IntersectionObserver` e o `MutationObserver` e devolve a posição inicial mesmo se algo falhar no meio.
- **Custo controlado**: só elementos com cara de "antes do reveal" (até 3 mil) entram na foto inicial; a releitura a cada passo é só dos que já cruzaram a tela.
- **Falsos reveals descartados**: animação `infinite`, e estilo inline mexido mais de 30 vezes sem mudar a opacidade (marquee, parallax, carrossel).
- **Web Animations API**: animação que termina no meio da leitura cai no `catch` e é pulada; a própria UI do Decalque não entra.
- Ternários encadeados de uma linha mantidos.

Nenhum achado em aberto. Verificação extra: na página de teste, `scrollScan()` achou o `fade-up` dos três cards revelados por IntersectionObserver.

## Arquivos

- `extension/content/extract.js`
