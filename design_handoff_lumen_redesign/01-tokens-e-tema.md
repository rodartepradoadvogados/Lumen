# 01 — Tokens e tema

> **Decisão registrada nesta implementação (19/08/2026):** o dono do projeto escolheu o
> **modelo B** ("Modernist puro") como o modelo real a aplicar — onde este documento (ou
> qualquer outro do pacote) descrever o modelo A, vale o modelo B no lugar. Os valores de
> `--acao`/`--marca`/`--vinho` efetivamente aplicados em `app/globals.css` são os do bloco
> "B" abaixo; o restante deste documento (tudo que não é a paleta de cor de ação/marca —
> raio, régua, sombra, tipografia, tabela de botões) vale como está, para os dois modelos.

Este documento é a **fonte única de verdade** de cor, tipografia, raio, régua e sombra do
redesenho. Substitui as seções §1, §2, §13 e §14 de `docs/DESIGN-SYSTEM.md` — atualize
aquele arquivo no mesmo PR, para não haver duas verdades no repositório.

> **Ajuste de tema (agosto/2026, segunda rodada) — supersede este documento em 3 pontos:**
> cor de ação/marca virou bordô `#8a2f42` (era `#ec3013`); o raio deixou de ser zero — passa
> a ter 3 paradas (4px chips/badges, 6px botões/inputs, 10px cartões/modais/painéis/
> contêiner da tela); tipografia virou Inter (era Archivo). Fonte real de verdade agora é
> `app/globals.css`/`tailwind.config.ts`/`app/layout.tsx` — ver `docs/DESIGN-SYSTEM.md` (nota
> no topo) para a tabela completa. O resto deste documento (régua, sombra, decisão de manter
> só duas cores de destaque) continua valendo.

## A decisão de marca

Duas leituras foram apresentadas. **A versão aprovada é a A.**

- **A — Modernist com ouro e vinho (aprovada).** Papel, régua de 2px e canto zero do
  Modernist. O ouro marca a marca e o estado ativo; a ação primária é **tinta chapada**;
  o vinho carrega o destrutivo. O vermelho `#ec3013` do Modernist **não aparece**.
- **B — Modernist puro (não usada).** Trocar `--acao` para `#ec3013`, `--marca` para
  `#ec3013` e `--vinho` para `#ae1800`. É uma mudança de três linhas em `globals.css`,
  nada mais — mantenha o código livre de hex literal para que isso continue verdade.

## Mudança de conceito: a ação deixa de ser azul

Hoje `--acao` é azul-tinta `#17325c`. **Passa a ser tinta chapada** (`#201e1d` no Manhã,
`#e6eaee` no Noite). Motivo: o Modernist organiza com alinhamento e régua, não com cor; o
azul era a única cor do produto sem origem na marca. O ouro continua sendo **só** marca e
estado ativo — nunca fundo de botão, como já mandava o manual v2.

> **No modelo B efetivamente aplicado**, `--acao` não vira tinta chapada: vira o vermelho
> `#ec3013`, fixo nos dois temas — ver `docs/DESIGN-SYSTEM.md` §2 para a tabela final e a
> nota sobre os tokens derivados (`--acao-tx`/`--acao-hover`/`--acao-bg`/`--marca-tx`/
> `--marca-bg`), que este documento não especifica e foram derivados na implementação.

## Tokens semânticos — `app/globals.css`

Mantenha os nomes que já existem. Só os valores mudam.

| Token | Manhã | Noite | Papel |
| --- | --- | --- | --- |
| `--sf-fundo` | `#f3f2f2` | `#0f1216` | Fundo da janela |
| `--sf-superficie` | `#ffffff` | `#161a1f` | Cartão, painel, barra |
| `--sf-apoio` | `#eae9e9` | `#1b2026` | Cabeçalho de tabela, linha ativa, campo |
| `--regua` | `#d7d3d3` | `#272d34` | Divisor de 1px (linha de lista) |
| `--regua-forte` | `#bab6b6` | `#39414a` | **Divisor de 2px** (seção, topo de cartão, borda de contêiner) |
| `--tx` | `#201e1d` | `#e6eaee` | Texto corrido |
| `--tx-2` | `#605d5d` | `#98a1ab` | Rótulo, metadado |
| `--tx-3` | `#9b9797` | `#79828c` | Desabilitado, placeholder |
| `--acao` | `#201e1d` | `#e6eaee` | Ação primária, aba ativa |
| `--acao-hover` | `#2d2b2b` | `#f8f4f4` | Hover da ação |
| `--acao-tx` | `#f3f2f2` | `#0f1216` | **Texto sobre `--acao`** — nunca `#fff` cravado |
| `--acao-bg` | `rgba(32,30,29,.07)` | `rgba(230,234,238,.12)` | Fundo de chip informativo |
| `--marca` | `#c9962f` | `#d9a93a` | Marca e indicador de seção ativa |
| `--marca-tx` | `#a87a1c` | `#d9a93a` | Ouro **quando precisa ser texto** |
| `--marca-bg` | `rgba(201,150,47,.15)` | `rgba(217,169,58,.15)` | Chip da marca |
| `--vinho` | `#7d1330` | `#cd5f77` | Excluir, revelar, confirmação destrutiva |
| `--urgente` | `#b3261e` | `#e2685a` | Vencido, atrasado, prazo estourado |
| `--urgente-bg` | `rgba(179,38,30,.10)` | `rgba(226,104,90,.14)` | |
| `--aviso` | `#9a6700` | `#d0a02a` | Vence em breve, parcial, aguardando |
| `--aviso-bg` | `rgba(154,103,0,.12)` | `rgba(208,160,42,.14)` | |
| `--concluido` | `#1c6b52` | `#4fb28c` | Concluído, pago, conectado |
| `--concluido-bg` | `rgba(28,107,82,.10)` | `rgba(79,178,140,.14)` | |

**Vinho x urgente continua valendo pela origem, não pela aparência:** vinho é marca e ação
destrutiva; urgente é dado que furou.

## Rampa neutra (nova)

Substitui a escala `grafite` do `tailwind.config.ts` no que diz respeito a superfícies
claras. Vem do Modernist, gerada em OKLCH:

```
100 #f8f4f4 · 200 #eae7e7 · 300 #d7d3d3 · 400 #bab6b6 · 500 #9b9797
600 #7d7979 · 700 #605d5d · 800 #444141 · 900 #2d2b2b
```

O rail escuro continua em grafite `#16191d` nos dois temas (é a única superfície que não
retematiza), como já está em `components/NavRail.tsx`.

## Raio — tudo vira zero

| Antes (manual v2) | Agora |
| --- | --- |
| Cartão e painel 6px | **0** |
| Botão e campo 5px | **0** |
| Chip de ícone 4px | **0** |
| Pílula / chip de filtro 11px | **0** |
| Guia 4px no topo | **0** |

Em `tailwind.config.ts`, aponte `borderRadius` inteiro para `0` (`sm`, `DEFAULT`, `md`,
`lg`, `xl`, `2xl`, `full`) **exceto** `full`, que sobrevive só para avatar e badge de
contagem circular. Não existe canto arredondado em mais nada. A logomarca tem `rx` no SVG
— é arte, não interface, e não muda.

## Régua — o que organiza a tela

O Modernist troca sombra e cor por régua. Duas espessuras, e a espessura tem significado:

- **2px `--regua-forte`** — separa seções e abre estruturas: topo de cartão, cabeçalho de
  página, cabeçalho de tabela, topo de coluna, borda de contêiner.
- **1px `--regua`** — separa itens da mesma lista: linha de tabela, item de lista, linha
  de log.

O padrão de cartão muda: em vez de borda de 1px em volta, **filete de 2px no topo** em
`--regua-forte` (ou na cor de severidade, quando houver) e sem borda nas outras arestas.
Ver os mockups dos slides 12 a 17.

## Sombra

Só em coisa que flutua: menu suspenso, modal, card sendo arrastado.

| Uso | Manhã | Noite |
| --- | --- | --- |
| Menu suspenso | `0 3px 10px rgba(45,43,43,.16)` | `0 3px 10px rgba(0,0,0,.45)` |
| Modal | `0 12px 32px rgba(45,43,43,.22)` | `0 12px 32px rgba(0,0,0,.5)` |
| Card arrastado | `0 12px 32px rgba(45,43,43,.22)` | `0 12px 32px rgba(0,0,0,.5)` |

Cartão parado: **nenhuma**.

## Tipografia

Archivo em todo o produto (já configurada). `font-variant-numeric: tabular-nums` no
`body`. **A serifada sai:** remova `fontFamily.serif` de `tailwind.config.ts` e todo
`className="font-serif"` restante.

| Papel | Tamanho | Peso | Tracking |
| --- | --- | --- | --- |
| Marca (LÚMEN) | 20–30px | 800 | `.16em` |
| Título de tela | 26–30px | 800 | `-.015em` |
| Título de painel | 15–18px | 800 | `-.005em` |
| Rótulo de seção | 10–12px caixa alta | 600 | `.12em` |
| Corpo | 15px (13px em tela densa) | 400 | 0 |
| Botão | 14px | 800 | 0 |
| Metadado / log | 11–13px | 400 | 0 |
| Dado numérico | herda | 800 | 0, tabular |

Peso 700 sai do vocabulário: os pesos são **800 / 600 / 400**.

## Botões

Altura 32px no desktra, 26px em barra compacta. **Raio 0. Rótulo alinhado à esquerda** —
um botão mais largo que seu rótulo começa o texto na borda esquerda do padding, jamais
centralizado (regra do Modernist; vale inclusive para botão com ícone à direita).

| Tipo | Fundo | Texto | Borda |
| --- | --- | --- | --- |
| Primário | `--acao` | `--acao-tx` | — |
| Primário hover | `--acao-hover` | `--acao-tx` | — |
| Secundário | transparente | `--tx` | 2px `--regua-forte` |
| Secundário hover | `--acao-bg` | `--tx` | 2px `--regua-forte` |
| Terciário / link | — | `--tx` sublinhado | — |
| Destrutivo (texto) | — | `--vinho` | — |
| Destrutivo (sólido) | `--vinho` | `#ffffff` | — |
| Desabilitado | — | `--tx-3` | 2px `--regua`, opacidade 45% |

Foco de teclado em **todo** elemento interativo:
`outline: 2px solid var(--marca); outline-offset: 2px` — nunca o anel azul do navegador.

## Proibido

1. Hex literal em `app/**` ou `components/**`.
2. Classes legadas `navy-*`, `gold-*`, `bordo-*`, `cream-*`, `magenta-*` em código novo.
3. Ouro como fundo de botão.
4. Sombra em cartão parado.
5. Canto arredondado em qualquer superfície de interface.
6. `text-white` sobre `--acao` — use `--acao-tx`.
7. Qualquer textura ou gradiente de fundo (`.brand-texture` e `SiteBackgroundLayer` saem).
8. Rótulo de botão centralizado.
