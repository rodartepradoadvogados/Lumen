---
name: Lúmen
description: Sistema de gestão jurídica — livro-razão vivo de processos, financeiro e comunicação, no sistema visual Modernist
colors:
  acao: "#8a2f42"
  acao-hover: "#9c3a4d"
  acao-tx: "#f7eef0"
  acao-light: "#a8495c"
  marca-bg: "rgba(138, 47, 66, 0.15)"
  vinho: "#ae1800"
  urgente: "#b3261e"
  urgente-bg: "rgba(179, 38, 30, 0.1)"
  aviso: "#9a6700"
  aviso-bg: "rgba(154, 103, 0, 0.12)"
  concluido: "#1c6b52"
  concluido-bg: "rgba(28, 107, 82, 0.1)"
  fonte-pje: "#2f6fb0"
  ouro-acento: "#a6790f"
  ardosia-noturna: "#16191d"
  rail-marca: "#c9707f"
  sf-fundo: "#f3f2f2"
  sf-superficie: "#ffffff"
  sf-apoio: "#eae9e9"
  regua: "#d7d3d3"
  regua-forte: "#bab6b6"
  tx: "#201e1d"
  tx-2: "#605d5d"
  tx-3: "#9b9797"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "normal"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.02em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.acao}"
    textColor: "{colors.acao-tx}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
    typography: { fontWeight: 600, fontSize: "14px" }
  button-primary-hover:
    backgroundColor: "{colors.acao-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.tx}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
    typography: { fontWeight: 600, fontSize: "14px" }
  card:
    backgroundColor: "{colors.sf-superficie}"
    rounded: "{rounded.lg}"
    padding: "20px"
  badge:
    backgroundColor: "{colors.sf-apoio}"
    textColor: "{colors.tx-2}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    typography: { fontWeight: 600, fontSize: "11px" }
---

# Design System: Lúmen

## Overview

**Creative North Star: "O Arquivo Vivo"**

O Lúmen é o dossiê de um escritório de advocacia que se mantém atualizado sozinho: publicações
chegam triadas, prazos se recalculam, um lançamento financeiro nasce onde a régua do livro-caixa
sempre esteve. A tela nunca finge ser um aplicativo de consumo — ela se parece com o processo,
o livro-razão contábil e a pauta de audiência que substitui, só que vivos. Uma régua de 1–2px
separa cada seção, exatamente como uma linha de tabela separaria um lançamento do próximo; a
sombra só aparece em algo que está literalmente flutuando sobre o resto (um modal, um menu, um
cartão sendo arrastado). Isso é o que o torna **caloroso e acessível sem decoração**: a calidez
não vem de gradiente, ilustração ou cor extra — vem de rótulo direto, alinhado à esquerda, de
verde de conclusão que celebra o que foi resolvido, e de nunca esconder atrás de jargão de
sistema o que é, no fundo, "isso está pago", "esse prazo venceu", "essa publicação foi lida".

Uma única cor de ação percorre o produto inteiro — o Bordô Editorial. Ele não decora; ele marca
o que pede ação ou identifica a marca, e nada mais. Fora dele, a tela é neutra (grafite/cinza
morno) com três acentos de **dado**, não de marca: urgente (algo venceu), aviso (algo está perto
de vencer) e concluído (algo foi resolvido) — a única exceção sancionada ao "uma cor só" é essa
tríade de estado, porque comunica fato, não hierarquia visual.

**Key Characteristics:**
- Régua substitui sombra: cartão parado se separa por filete de 1–2px, nunca por `box-shadow`.
- Uma cor de ação/marca (Bordô Editorial, `#8a2f42`) — sem ouro, sem azul-tinta, sem gradiente.
- Raio pequeno e discreto em três paradas (4/6/10px) — nunca zero, nunca "insanamente arredondado".
- Rótulo de botão sempre alinhado à esquerda, nunca centralizado.
- Ardósia Noturna (`#16191d`) é a única superfície que não retematiza entre Manhã e Noite — a
  âncora fixa do produto, seja qual for o tema do usuário.
- Movimento é sempre curto (120–200ms), sempre com um motivo nomeado — nunca decorativo.

## Colors

A paleta é deliberadamente estreita: uma cor de marca, uma escala neutra morna, e uma tríade de
estado que descreve fatos (vencido / próximo de vencer / resolvido), nunca hierarquia.

### Primary
- **Bordô Editorial** (`#8a2f42`, tokens `--acao`/`--marca`): única cor de ação e de marca do
  produto. Preenche botão primário, link ativo, filete de seção selecionada. Não retematiza
  entre Manhã e Noite — sobre branco rende ~8:1 de contraste, por isso pode ser tanto fundo
  (botão) quanto texto/filete sem precisar de uma variante escurecida à parte.
  - **Hover** (`#9c3a4d`, `--acao-hover`): usado só em interação, nunca em repouso.
  - **Sobre o Bordô** (`#f7eef0`, `--acao-tx`): texto claro que vai sobre o preenchimento sólido.
  - **Variante clara** (`#a8495c`, `--acao-light`): reservada para diferenciar uma ação
    secundária-mas-ainda-de-marca (ex.: "+Novo" da faixa de topo) do botão de ação mais forte da
    tela, sem virar contorno.
- **Vinho institucional** (`#ae1800`, `--vinho`): a única outra cor de marca — reservada
  exclusivamente para ação destrutiva (excluir, cancelar em definitivo). Nunca usar para o que é
  só "urgente" (isso é o token `urgente` abaixo, que é dado, não ação).

### Neutral
- **Superfície e fundo** — `--sf-fundo` (`#f3f2f2`), `--sf-superficie` (`#ffffff`),
  `--sf-apoio` (`#eae9e9`): três camadas de fundo/cartão/superfície de apoio, mornas (não cinza
  puro), da rampa neutra do Modernist.
- **Régua** — `--regua` (`#d7d3d3`) e `--regua-forte` (`#bab6b6`): filete de 1–2px que separa
  seções, linhas de tabela e cartões. Faz o trabalho que sombra faria em outro sistema.
- **Texto** — `--tx` (`#201e1d`, texto principal), `--tx-2` (`#605d5d`, texto secundário/legenda),
  `--tx-3` (`#9b9797`, texto terciário/placeholder).
- **Ardósia Noturna** (`#16191d`, `--grafite-800`): a única superfície fixa nos dois temas — o
  rail de navegação lateral e a faixa de guias. Nunca clareia; textos sobre ela usam tokens
  próprios (`--rail-tx`, `--rail-marca`) em vez dos tokens de texto padrão, que sumiriam sobre
  fundo escuro na Manhã.

### Estado (dado, não marca)
- **Urgente** (`#b3261e`/`--urgente-bg` `rgba(179,38,30,.1)`): algo venceu — prazo atrasado,
  conta vencida. É fato, não convite à ação; por isso nunca é a mesma cor do botão de excluir.
- **Aviso** (`#9a6700`/`--aviso-bg`): algo está perto de vencer — vence hoje, pendência parcial.
- **Concluído** (`#1c6b52`/`--concluido-bg`): resolvido — prazo cumprido, conta paga, tarefa
  concluída. É o único tom "celebrativo" do sistema (`ConclusionChip`).
- **Fonte PJE** (`#2f6fb0`): azul isolado só para diferenciar a origem de uma publicação (PJE vs.
  DJE) — não é um acento de marca, é rótulo de proveniência.
- **Ouro de acento** (`#a6790f`, `--ouro-acento`): acento pontual reintroduzido em setembro/2026,
  hoje só no filete de um cartão (Assessoria Jurídica na Início). Decoração de destaque única,
  não uma segunda cor de marca — não espalhar.

### Named Rules
**A Regra da Régua.** Sombra só existe em algo que está flutuando de verdade — modal, menu
suspenso, cartão sendo arrastado. Um cartão parado no lugar se separa do resto por régua de
1–2px, nunca por `box-shadow`.

**A Regra da Cor Única.** O Bordô Editorial é a única cor de ação/marca do produto. A tríade
urgente/aviso/concluído comunica fato sobre um dado, nunca hierarquia de interface — nenhuma
delas substitui o bordô como cor de botão primário ou link.

## Typography

**Body/Display Font:** Inter (com fallback `system-ui, sans-serif`) — uma família só, sem
pareamento com serifa. Substituiu Archivo em agosto/2026 por ser mais neutra e discreta em tela
cheia de dados tabulares; `font-variant-numeric: tabular-nums` no `body` garante que números em
tabela/relatório alinhem por coluna.

**Character:** Neutra e funcional — a tipografia nunca é o elemento de personalidade do sistema
(isso é papel da régua e da cor única). Peso é a ferramenta de hierarquia, não tamanho: título de
cartão e valor de destaque diferem mais em `font-weight` do que em `font-size`.

### Hierarquia
- **Display** (extrabold/800, 24px, linha 1.2): valores de destaque em `StatCard` — o número que
  a tela mais quer que o usuário veja primeiro.
- **Headline** (bold/700, 24px, linha 1.25): título de página (`PageHeader`).
- **Title** (semibold/600, 16px, linha 1.3): título de cartão/seção (`CardHeader`).
- **Body** (regular/400, 14px, linha 1.5): texto corrido, rótulo de botão, conteúdo de tabela.
- **Label** (medium/500, 12px, `letter-spacing: .02em`, geralmente uppercase): rótulo de campo
  acima de valor (`StatCard` label), rótulo de seção discreta.

### Named Rules
**A Regra do Peso, não do Tamanho.** Hierarquia visual entre título e corpo vem primeiro de
`font-weight`, só depois de `font-size` — a escala tipográfica é deliberadamente curta.

## Layout

Densidade de produto de dados (tabelas, formulários financeiros, listas de processo), não de
site de marketing: conteúdo alinhado à esquerda, sem centralizar título ou texto. Botão de
32px de altura (`h-8`), cabeçalho de cartão em `px-5 py-4`, cartão de estatística em `p-5`
(20px) — o ritmo geral vive na escala padrão do Tailwind (4px), sem uma escala de espaçamento
customizada além disso.

Casca única: rail de navegação lateral fixo (56px em telas médias 768–1023px, 76px com rótulo
a partir de 1024px), sem os antigos modos de visualização alternativos. Em mobile, o rail vira
overlay disparado por um botão fixo no canto superior esquerdo; abaixo disso, o PWA em `/m` é
uma casca de cinco telas própria, não um espelho encolhido do desktop.

Responsivo por breakpoint padrão do Tailwind (`md`/`lg`), sem grade customizada — os módulos
mais densos (tabela financeira, calendário) preferem rolagem horizontal contida a colapsar
colunas.

## Elevation & Depth

Sistema majoritariamente plano: profundidade normal vem de régua (filete de 1–2px), não de
sombra. Sombra existe só como vocabulário reservado para o que está literalmente flutuando sobre
o layout — nunca em repouso, nunca em cartão parado.

### Shadow Vocabulary
- **`shadow-pop`/`shadow-menu`** (`0 3px 10px rgba(45,43,43,.16)` na Manhã, mais escura na
  Noite): popover, menu suspenso, tooltip.
- **`shadow-modal`** (`0 12px 32px rgba(45,43,43,.22)`): modal (`ModalShell`).
- **`shadow-arrasto`** (mesmo valor de `shadow-modal`): cartão sendo arrastado (Kanban).
- **`shadow-card`**: deliberadamente `none` — cartão parado nunca tem sombra, mesmo que a classe
  `shadow-card` ainda apareça em ~200 arquivos não migrados; o valor já resolve para nenhuma
  sombra em todos eles.

### Named Rules
**A Regra do Flutuar de Verdade.** Só três coisas no sistema inteiro têm sombra: modal, menu/
popover suspenso, e cartão em arrasto ativo. Qualquer outro uso de sombra é bug de revisão.

## Shapes

Escala de raio em três paradas, nunca zero e nunca exagerada: `sm` (4px) para chip/badge/tag de
status; `DEFAULT`/`md` (6px) para botão, input, item de rail, ícone de ação; `lg`/`xl`/`2xl`/
`3xl` (10px, um único valor prático) para cartão, linha de lista, modal, painel suspenso e o
contêiner da própria tela. `rounded-full` (9999px) fica reservado para avatar e badge de
contagem circular.

Cartão não usa borda nas quatro arestas — usa filete de 2px só no topo (`border-t-2`), na cor
neutra `--regua-forte` por padrão, ou numa cor de categoria quando o cartão aceita um "accent"
(ex.: cartões de Início, setembro/2026). Cabeçalho de cartão usa filete de 2px embaixo, o mesmo
peso — "abrir estrutura" pede régua mais forte que separar item de lista (que usa 1px).

## Components

Botão, cartão e badge compartilham a mesma frase de caráter: **direto e acolhedor** — rótulo
alinhado à esquerda, sem jargão frio de sistema, sem decoração nova. A calidez do produto mora
no texto (rótulo humano, "Prazo cumprido" em vez de "CONCLUÍDO") e no verde de conclusão
celebrativo, nunca em gradiente, ilustração ou sombra extra.

### Buttons
- **Shape:** raio `md` (6px), altura fixa 32px (`h-8`).
- **Primário (`ButtonPrimary`):** fundo Bordô Editorial (`--acao`), texto claro (`--acao-tx`),
  peso 600, `hover:` → `--acao-hover`. Rótulo sempre alinhado à esquerda (`justify-start`), nunca
  centralizado — mesmo num botão mais largo que o texto.
- **Secundário (`ButtonSecondary`):** contorno de 2px em `--regua-forte`, fundo transparente,
  `hover:` → `--acao-bg` (bordô a 8–16% de opacidade). Mesma altura, mesmo raio, mesmo
  alinhamento à esquerda do primário.
- **Desabilitado:** opacidade 60%, cursor padrão (`disabled:opacity-60 disabled:cursor-default`)
  em ambos.

### Badges e Chips
- **Badge (`Badge`):** pílula (`rounded-full`), `px-2 py-0.5`, texto 11px/semibold. Cor por
  papel semântico, nunca por escolha livre: `slate`/`navy` (neutro), `blue` (ação/prioridade
  média), `gold` (marca — reservado quase só à Audiência), `amber` (aviso/prioridade alta),
  `red` (urgente — é dado, não é a cor do botão destrutivo), `bordo` (vinho — destrutivo ou
  identificação manual pontual), `green` (concluído/pago), `muted` (neutro apagado, só
  Cancelado).
- **ConclusionChip:** check inline + rótulo, raio `sm` (4px, mais discreto que o Badge redondo),
  sempre no par verde `--concluido`/`--concluido-bg`. Reservado a desfecho positivo — "prazo
  cumprido", "audiência realizada", "conta paga/recebida" — nunca a outro estado.

### Cards / Containers
- **Corner Style:** `rounded-lg` (10px).
- **Background:** `--sf-superficie` (branco na Manhã).
- **Shadow Strategy:** nenhuma em repouso — ver Elevation & Depth. Separação por filete de topo
  (2px, `--regua-forte` ou cor de `accent`).
- **Border:** só no topo (`border-t-2`), nunca nas quatro arestas.
- **Internal Padding:** cabeçalho `px-5 py-4`; corpo tipicamente `p-5` (20px, ex.: `StatCard`).

### Inputs / Fields
- **Padrão do produto:** borda 1px em `--regua`, fundo `--sf-superficie`, sem preenchimento de
  cor. `accent-color` global aplicado a checkbox/radio nativos (`--acao`) para não deixar o azul
  padrão do sistema operacional destoar da paleta.
- **`EntityPicker` (seletor azul):** um sub-sistema deliberadamente distinto — busca dinâmica com
  contorno e foco em azul (`border-blue-*`, `focus:ring-blue-400/50`), reconhecível como "o
  seletor com cadastro rápido inline" em Fornecedor/Categoria/Centro de Custo/Cliente/Processo.
  Não é herança não-migrada: é um padrão próprio, intencionalmente diferente do resto (azul, não
  bordô), para que o usuário reconheça a mesma interação em qualquer tela financeira.
- **Foco:** anel de foco visível (`focus:ring-2`) nos campos que já usam o padrão EntityPicker;
  demais campos usam o contorno padrão do navegador sobre a borda `--regua`.

### Navigation
- **Rail (desktop):** único modo de navegação — 56px sem rótulo (768–1023px), 76px com rótulo
  (≥1024px), fundo fixo Ardósia Noturna nos dois temas. Ícone 19px, traço 1.5. Item ativo: pílula
  de fundo `--rail-marca-bg` + texto `--rail-marca` (variante clara e fixa do Bordô Editorial,
  legível sobre o grafite em qualquer tema) — sem filete lateral.
  Item fixo no pé: atalho direto para Configurações.
- **Mobile:** rail vira overlay disparado por botão fixo (canto superior esquerdo, fundo Ardósia
  Noturna); abaixo de `/m`, casca própria de cinco telas com navegação inferior fixa.

## Exceções documentadas

Desvios deliberados da escala/vocabulário acima, escopados a uma superfície específica — mesmo
espírito da exceção de fonte do blog (Lora, só em `app/blog/`) e da escala tipográfica própria do
site público: um desvio real, não resíduo a convergir num sweep futuro.

### Portal Noturno — escopo `app/(app)/*`

Aprovado em `.impeccable/plano-portal/andamento-portal.md` (Rodada 0, 2026-09-11), depois de
entrevista de `grilling` com o dono do projeto. Aplica-se **só** ao portal logado desktop
(`app/(app)/*`, escopo CSS `.portal-shell` em `app/globals.css`) — o site público e o Painel
Mestre continuam exatamente como documentado no resto deste arquivo. O PWA `/m` ganhou sua
própria variante do mesmo sistema, ver "PWA Noturno" abaixo.

- **Tema padrão é escuro** (não claro): mecanismo próprio (`lib/portalTheme.ts`, chave
  `rp-portal-theme`), independente do tema Manhã/Noite do site (`lib/theme.ts`,
  `rp-site-theme`) e do app mobile (`rp-mobile-theme`) — os três nunca se afetam. Manhã continua
  disponível no portal como opção explícita (`.portal-light`), não removida.
- **Paleta escura aproximada do Dracula Theme Official** (fundo `#1c1a22`, cinza-arroxeado — não
  preto puro), referência trazida pelo próprio dono do projeto. Bordô Editorial, régua-em-vez-de-
  sombra e a tríade urgente/aviso/concluído **não mudam** — só a superfície neutra (fundo/
  cartão/régua/texto) e a atmosfera geral.
- **Tipografia: Inter** (a mesma do resto do produto — `--font-sans` não é mais redefinido dentro
  de `.portal-shell`). Chegou a usar Barlow no corpo + Barlow Condensed em número/rótulo/aba
  (aproximação da tipografia do CowData, outro produto do dono do projeto) entre P1 e P5 — revertido
  em 2026-09-11 por decisão do dono do projeto ("não ficou boa"). O token `font-display`
  (`tailwind.config.ts`) continua existindo e sendo usado nos mesmos lugares (número de destaque/
  rótulo/aba), só que `--font-display` agora resolve para a mesma Inter — não foi preciso remover
  a classe de nenhum componente, só o que a variável aponta (`app/globals.css`).
- **Raio quase reto (2px)** em vez da escala de três paradas (4/6/10px) — escopado por **seletor
  descendente** em `app/globals.css` (`.portal-shell .rounded-lg { border-radius: 2px }` e
  irmãos `sm`/`md`/`xl`/`2xl`/`3xl`), não por variável de tema (`tailwind.config.ts` compila
  `rounded-*` para px fixo, não `var(--...)`) nem por edição componente a componente: a
  especificidade de duas classes já vence uma classe só, então cobre automaticamente qualquer
  `rounded-*` usado dentro do portal, mesmo em componentes ainda não tocados por uma rodada
  específica. `rounded-full` fica de fora (pílula/avatar continuam circulares). A regra "Don't dar
  raio maior que 10px" abaixo permanece a regra do resto do produto; a exceção aqui é "menor que
  4px", não maior.
- **Glow reservado** (`--concluido-glow`, sombra difusa verde) a um único uso por tela — hoje só o
  indicador "ao vivo" de publicações não lidas no Painel. Não espalhar, mesma disciplina do
  `--ouro-acento`.
- Módulos de `app/(app)/*` ainda não redesenhados nesta rodada (ver
  `.impeccable/plano-portal/roteiro-portal.md`) herdam cor/fonte/tema automaticamente (a casca é
  compartilhada), mas **não** o raio 2px (que é por componente) — esperado, não regressão,
  enquanto as rodadas seguintes não chegam neles.

### PWA Noturno — escopo `app/m/*`

Aprovado em `.impeccable/plano-portal/andamento-portal.md` ("PWA — próxima rodada", 2026-09-11),
depois de nova entrevista de `grilling`. Aplica-se **só** ao PWA mobile (`app/m/*`, escopo CSS
`.mobile-shell` em `app/globals.css`) — mesmo sistema do Portal Noturno acima, reaproveitado tal
qual (nenhum valor de cor novo), com duas diferenças deliberadas:

- **Tema padrão continua claro (Manhã)**, diferente do portal — o PWA é usado por qualquer
  pessoa em qualquer situação de luz (rua, tribunal, ao lado de um cliente), não só pela equipe
  interna o dia todo. Noite (`.mobile-dark`) fica disponível com a mesma paleta aproximada do
  Dracula do portal, só não é o padrão de ninguém. Mecanismo próprio (`rp-mobile-theme`, já
  existia — só o alvo da classe mudou de `.dark` em `<html>`, compartilhado com o site público,
  para `.mobile-dark` só em `#mobile-shell`, do mesmo jeito que o portal já não depende de
  `.dark`).
- **Raio quase reto (2px) só quando `.mobile-dark` está ativo** — na Manhã o PWA continua na
  escala de três paradas de sempre (4/6/10px). Mesmo seletor descendente do portal
  (`.mobile-shell.mobile-dark .rounded-lg` e irmãos), `rounded-full` de fora pela mesma exceção.
- **Glow reservado** (mesmo `--concluido-glow`) — primeiro uso no PWA: indicador "ao vivo" na
  Central de Alertas do Painel (`app/m/page.tsx`), quando há alerta pendente. Visível nos dois
  temas (a Manhã do PWA também define `--concluido-glow`, valor da Manhã do portal — variável
  que não existe em `:root`/`.dark` fora do escopo do Portal/PWA Noturno).
- **Ícone vira emoji só quando a coisa que ele representa está pendente de verdade** (pedido do
  dono do projeto ao validar o protótipo — ele gostou especificamente do sino colorido com
  contagem) — sino do cabeçalho (`app/m/layout.tsx`) e calendário da aba Agenda na barra inferior
  (`components/mobile/MobileBottomNav.tsx`), os dois únicos lugares desta rodada onde um ícone já
  carregava um contador de pendência. Sem pendência, ícone de linha (lucide-react) de sempre —
  não é uma troca geral de sistema de ícone, só um reforço de estado nos dois pontos que já
  eram "isto precisa de atenção agora". Tipografia (Inter) e demais tokens de marca não mudam.
- Módulos de `app/m/*` fora do escopo desta rodada (Financeiro, Publicações, Assessoria etc. —
  ver `.impeccable/plano-portal/andamento-portal.md`) herdam cor/tema automaticamente quando
  alguém troca para Noite (a casca é compartilhada), mas não o raio 2px nem o emoji condicional
  (ambos por componente) — esperado, não regressão, mesma lógica já documentada acima para o
  portal.

## Do's and Don'ts

### Do:
- **Do** usar régua de 1–2px para separar cartão/seção em repouso; reservar sombra só para
  modal, popover e item em arrasto (A Regra do Flutuar de Verdade).
- **Do** manter o Bordô Editorial (`#8a2f42`) como única cor de ação/marca — a tríade
  urgente/aviso/concluído descreve dado, nunca substitui a cor de botão primário.
- **Do** alinhar rótulo de botão à esquerda, sempre — mesmo em botão mais largo que o texto.
- **Do** usar peso tipográfico (não tamanho) como primeira ferramenta de hierarquia dentro de uma
  mesma tela densa em dados.
- **Do** tratar o `EntityPicker` azul como um padrão à parte, intencional — não "corrigir" para
  bordô sem confirmar, é reconhecimento de interação, não inconsistência.

### Don't:
- **Don't** aplicar `box-shadow` a um cartão parado — mesmo que uma classe legada `shadow-card`
  apareça no arquivo, ela já resolve para nenhuma sombra.
- **Don't** introduzir ouro ou azul-tinta como cor de marca/ação — só existe o Bordô Editorial;
  `ouro-acento` é decoração pontual isolada, não uma segunda cor de marca.
- **Don't** usar o token `urgente` (vermelho, dado) no lugar do `vinho` (ação destrutiva) ou
  vice-versa — um descreve um fato vencido, o outro é uma ação irreversível do usuário.
- **Don't** centralizar rótulo de botão ou título de página — o sistema é alinhado à esquerda por
  princípio, não por acidente de layout.
- **Don't** dar raio maior que 10px a cartão, modal ou painel — a escala para em três paradas
  (4/6/10px) de propósito.
