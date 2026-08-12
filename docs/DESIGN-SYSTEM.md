# Sistema de cor e detalhe — Lúmen

Fonte única de verdade para a implementação do redesenho (manual da marca v2, agosto/2026).
**Nenhum valor aqui é sugestão.** Se um componente precisa de uma cor que não está neste
documento, a resposta certa é perguntar, não inventar um hex.

Dois temas: **Manhã** (claro) e **Noite** (escuro, classe `.dark` no `<html>`).
Só existem esses dois — Dia/Tarde foram removidos antes desta rodada.

---

## 0. As três regras que não se quebram

1. **Nenhum hex solto em componente.** Toda cor vem de `app/globals.css` (variável CSS) ou de
   `tailwind.config.ts` (escala). Um `#` dentro de `components/` ou `app/` é bug de revisão.
2. **O ouro é acento, não cor de ação.** Ele marca a marca e a seção ativa. Nunca é fundo de
   botão. Nunca carrega texto sobre fundo claro — exceto no tom `ouro-800 #a87a1c`, e ainda
   assim só em rótulo curto.
3. **Sombra só em coisa que flutua de verdade.** Modal, menu suspenso e card sendo arrastado.
   Cartão parado se separa por régua de 1px, não por sombra.

---

## 1. Escalas base

| Escala | 300 | 500 | 700 | 800 | 900 |
|---|---|---|---|---|---|
| **grafite** | `#5b646e` | `#39414a` | `#22272e` | `#16191d` | `#0f1216` |
| **ouro** | `#e0b954` | `#d9a93a` | `#c9962f` | `#a87a1c` | `#7d5a11` |
| **vinho** | `#cd5f77` | `#a3234a` | `#7d1330` | `#5e0e24` | `#3e0918` |

| Apoio | Manhã | Noite |
|---|---|---|
| **tinta** (azul-tinta, cor de ação) | `#17325c` | `#7ea6dd` |
| **neutro** (superfície de apoio) | `#f3f4f6` | `#1b2026` |
| **régua** | `#e5e7ea` | `#272d34` |

> ⚠️ **Divergência do manual, resolvida.** O texto do manual diz *"use Ouro 700 `#a87a1c`"*,
> mas a rampa do mesmo manual põe `#a87a1c` em **800** e `#c9962f` em 700. Vale o **hex**:
> ouro como texto sobre fundo claro é **`#a87a1c`**. É exatamente o tipo de detalhe que vira
> erro de implementação — por isso está registrado aqui.

---

## 2. Tokens semânticos

São estes os nomes que os componentes usam. A escala base só aparece na definição.

| Token | Manhã | Noite | Papel |
|---|---|---|---|
| `--sf-fundo` | `#eef0f2` | `#0f1216` | Fundo da janela |
| `--sf-superficie` | `#ffffff` | `#161a1f` | Cartão, painel, barra |
| `--sf-apoio` | `#f3f4f6` | `#1b2026` | Cabeçalho de tabela, linha ativa, campo |
| `--regua` | `#e5e7ea` | `#272d34` | Divisor de 1px |
| `--regua-forte` | `#c9cdd3` | `#39414a` | Borda de contêiner, moldura |
| `--tx` | `#16191d` | `#e6eaee` | Texto corrido |
| `--tx-2` | `#5b646e` | `#98a1ab` | Rótulo, metadado |
| `--tx-3` | `#8b939c` | `#79828c` | Texto desabilitado, placeholder |
| `--acao` | `#17325c` | `#7ea6dd` | Ação primária, link, aba ativa |
| `--acao-hover` | `#21447a` | `#9dbce8` | Estado hover da ação |
| `--acao-tx` | `#ffffff` | `#0f1216` | **Texto sobre `--acao`** |
| `--acao-bg` | `rgba(23,50,92,.09)` | `rgba(126,166,221,.14)` | Fundo de chip informativo |
| `--marca` | `#c9962f` | `#d9a93a` | Marca e indicador de seção ativa |
| `--marca-tx` | `#a87a1c` | `#d9a93a` | Ouro **quando precisa ser texto** |
| `--marca-bg` | `rgba(201,150,47,.15)` | `rgba(217,169,58,.15)` | Fundo de chip da marca |
| `--vinho` | `#7d1330` | `#cd5f77` | Marca (pingo) e **ação destrutiva** |
| `--urgente` | `#b3261e` | `#e2685a` | Vencido, atrasado, prazo estourado |
| `--urgente-bg` | `rgba(179,38,30,.10)` | `rgba(226,104,90,.14)` | |
| `--aviso` | `#9a6700` | `#d0a02a` | Vence em breve, parcial, aguardando |
| `--aviso-bg` | `rgba(154,103,0,.12)` | `rgba(208,160,42,.14)` | |
| `--concluido` | `#1c6b52` | `#4fb28c` | Concluído, pago, recebido, conectado |
| `--concluido-bg` | `rgba(28,107,82,.10)` | `rgba(79,178,140,.14)` | |

### Vinho x urgente — onde cada um entra

Os dois são avermelhados e é aqui que a implementação erra. A regra é por **origem**, não por
aparência:

- **`--vinho`** é da **marca**. Aparece no pingo e na base do símbolo, no badge de contagem do
  rail, e em **ação destrutiva** (texto e botão de Excluir, confirmação de exclusão).
- **`--urgente`** é **dado**. Aparece quando um número ou uma data diz que algo furou: texto de
  data vencida, badge Atrasado, filete de severidade alta na Central de Alertas, KPI negativo.

Um botão "Excluir" é vinho. Um prazo vencido é urgente. Nunca o contrário.

---

## 3. Casca

### Rail (modo Régua) — `components/NavRail.tsx`

Largura **62px**. O rail é grafite nos **dois** temas.

| Elemento | Manhã | Noite |
|---|---|---|
| Fundo | `#16191d` | `#16191d` |
| Item inativo (ícone + rótulo) | `#9aa3ad` (`--rail-tx`) | `#8b949e` |
| Item ativo — fundo | `#22272e` | `#1b2026` |
| Item ativo — texto/ícone | `#ffffff` | `#ffffff` |
| **Item ativo — filete esquerdo 3px** | `#c9962f` | `#d9a93a` |
| Item inativo — hover | `rgba(255,255,255,.05)` | `rgba(255,255,255,.05)` |
| Badge de contagem — fundo | `#a3234a` | `#a3234a` |
| Badge de contagem — texto | `#ffffff` | `#ffffff` |

O filete ativo é **ouro** e tem **3px**, encostado na borda esquerda, altura total do item.
Hoje é bordô `#6e0d25` — muda. Rótulo em 8px, ícone em 17px, traço 1.9.

### Painel de seção — `components/SectionPanel.tsx`

Largura **190px** (era 224px). Fundo `--sf-superficie`, borda direita `--regua`.
Item ativo: fundo `--sf-apoio`, peso 700, **sem filete**. Contador à direita em `--tx-3`.
Cabeçalho em 10px caixa alta, `--tx-2`, com o botão de recolher em `--tx-3`.

### Barra superior (ambos os modos) — `components/TopBar.tsx`

Altura **42px**, fundo `--sf-superficie`, borda inferior `--regua`. **Sem `backdrop-blur`**
e sem borda dourada — hoje tem `border-gold-500/20`, que sai.

### Barra de menus (modo Bancada) — `components/TopMenuBar.tsx`

Altura **36px**, fundo `#16191d` nos dois temas. Desde 2026-08-12, as 6 seções não ficam mais
expostas como cards horizontais fixos: moram num menu suspenso disparado pelo próprio ícone da
marca (logo + seta), com "Painel" fixo no topo. Na mesma faixa, à direita, mora o cluster de
ações que antes vivia numa `TopBar` própria (Peticionar/Novo/Timesheet/Painel Mestre/Alertas/
avatar — ver `components/TopBarActions.tsx`), como uma ilha clara (`--sf-superficie`) flutuando
sobre o fundo escuro — mesmo raciocínio do campo de busca abaixo.

| Elemento | Manhã | Noite |
|---|---|---|
| Menu inativo (dentro do suspenso) | `#aeb6be` (`--menu-tx`) | `#8b949e` |
| Menu ativo — fundo/texto | `--acao-bg` / `--acao` | `--acao-bg` / `--acao` |
| Campo de busca — fundo | `rgba(255,255,255,.09)` | `rgba(255,255,255,.09)` |

### Guias de duplo clique — `components/GuiasBar.tsx`

**Primeira linha da janela, acima da barra de menus — só quando há pelo menos uma guia aberta**
(o botão "Principal" saiu: sem guias, esta faixa não renderiza nada, 0px). Altura 27px, fundo
`#16191d`.

| Elemento | Manhã | Noite |
|---|---|---|
| Guia inativa — texto | `#9aa3ad` (`--rail-tx`) | `#8b949e` |
| Guia ativa — fundo | `--sf-superficie` | `--sf-superficie` |
| Guia ativa — texto | `--tx` | `--tx` |
| **Guia ativa — filete superior 2px** | `--acao` | `--acao` |
| Botão de fechar | `--tx-2` a 45% | `--tx-2` a 45% |

Largura máxima 210px com reticências. Raio 4px só nos cantos de cima.

### Painel de Anotações — altura no modo Bancada

O painel (`components/anotacoes/AnotacoesPanel.tsx`) ocupa a altura **inteira** da janela, desde
o topo real (y=0) até a base — inclusive ao lado de guias/menus/sub-abas do modo Bancada, não só
ao lado do conteúdo. É por isso que em `components/AppShell.tsx` ele é irmão da coluna inteira
da casca (não só da linha de conteúdo abaixo das faixas).

### Sub-abas (modo Bancada) — `components/SubTabsBar.tsx` *(novo)*

Fundo `--sf-superficie`, borda inferior `--regua`. Aba ativa: peso 600, `--tx`,
**filete inferior 2px `--acao`**. Aba inativa: `--tx-2`, filete transparente.

> As abas **internas de página** (Visão Geral / Atividades / …) usam a mesma regra: filete
> inferior 2px em `--acao`. Hoje várias usam `border-gold-600` — todas mudam.

---

## 4. Botões

Altura 32px no desktop, 26px em barra compacta. Raio **5px**. Peso 600. Ícone 12–14px.

| Tipo | Fundo | Texto | Borda | Onde |
|---|---|---|---|---|
| **Primário** | `--acao` | `--acao-tx` | — | Peticionar, Criar, Salvar, Filtrar, Publicar, Dar baixa |
| Primário hover | `--acao-hover` | `--acao-tx` | — | |
| **Secundário** | `--sf-superficie` | `--tx` | 1px `--regua` | Novo, Cancelar, Editar, Exportar, Reconectar |
| Secundário hover | `--sf-apoio` | `--tx` | 1px `--regua` | |
| **Terciário / link** | — | `--acao` | — | "Ver tudo →", "Marcar como lida" |
| **Destrutivo (texto)** | — | `--vinho` | — | Excluir, Descartar |
| **Destrutivo (sólido)** | `--vinho` | `#ffffff` | — | **Só** na confirmação do modal |
| Desabilitado | `--sf-apoio` | `--tx-3` | 1px `--regua` | |

### Peticionar — o caso que você citou

`components/PeticionarButton.tsx` é **primário** e o mais visível do produto:

- **Manhã:** fundo `#17325c`, texto `#ffffff`, hover `#21447a`
- **Noite:** fundo `#7ea6dd`, texto `#0f1216`, hover `#9dbce8`

> No Noite o texto é **escuro sobre azul claro**. Escrever `text-white` no Noite é o erro
> mais provável de toda esta migração — o azul de ação no escuro é claro, não escuro.
> Sempre `--acao-tx`, nunca `#fff` cravado.

**Nenhum botão tem fundo ouro.** Nenhum botão tem fundo vinho, exceto a confirmação de exclusão.
Os botões que hoje estão em `bg-bordo-700` (migrados na rodada anterior) passam a `--acao`.

---

## 5. Controle segmentado — tema e modo de visualização

Vale para **Manhã / Noite** e para **Régua / Bancada**, no menu do avatar
(`components/TeamMonitorPanel.tsx`). Os dois são o mesmo componente.

```
contêiner   fundo --sf-apoio · borda 1px --regua · raio 6px · padding 2px · display flex
opção       flex 1 · centralizado · 11px · raio 4px · altura 24px
  inativa   fundo transparente · texto --tx-2 · peso 500
  ativa     fundo --tx · texto --sf-superficie · peso 600
```

A opção ativa **inverte**: fundo da cor do texto, texto da cor da superfície. Funciona nos dois
temas sem exceção e sem cor de acento — o acento fica reservado ao produto, não ao seletor de
preferência.

Cada bloco é precedido de um rótulo em 9,5px, caixa alta, `letter-spacing .11em`, `--tx-2`:
**MODO DE VISUALIZAÇÃO** e **TEMA**. Ordem no menu: identificação do usuário → modo de
visualização → tema → Meu perfil → Sair (este em `--vinho`, separado por régua).

**Padrão de quem nunca escolheu: Régua.** Persistência em `localStorage`, chave
`lumen:viewMode`, valores `"regua"` | `"bancada"` — mesmo padrão de `lumen:sectionPanelCollapsed`.

---

## 6. Ícones da linha do tempo — `components/processos/CaseTimeline.tsx`

Hoje **todos** os eventos usam o mesmo chip bordô. Passam a ser diferenciados por tipo.
Chip de **20×20**, raio **4px**, ícone 11px.

| Evento | Fundo do chip | Ícone | Ícone lucide |
|---|---|---|---|
| Tarefa concluída | `--concluido-bg` | `--concluido` | `CircleCheck` |
| Publicação / intimação | `--urgente-bg` | `--urgente` | `Bell` |
| Comentário | `--sf-apoio` | `--tx-2` | `MessageSquare` |
| Cadastrado no Lúmen | `--marca-bg` | `--marca-tx` | `FilePlus` |
| Documento gerado | `--marca-bg` | `--marca-tx` | `FileText` |
| Andamento (Datajud/Projudi) | `--sf-apoio` | `--tx-2` | `Gavel` |
| Protocolo / petição protocolada | `--acao-bg` | `--acao` | `FileText` |
| Distribuição | `--sf-apoio` | `--tx-2` | `Clock` |
| Escalada de instância | `--acao-bg` | `--acao` | `ArrowUp` |
| Retorno de instância | `--sf-apoio` | `--tx-2` | `ArrowDown` |

Título do evento: 11,5px peso 500 `--tx`. Data: 10,5px `--tx-2`. Linha entre eventos:
régua horizontal de 1px `--regua`, **não** a linha vertical pontilhada de hoje.

---

## 7. Tipos de tarefa — agenda, kanban, alertas

Cinco tipos, definidos em `components/ui.tsx` (`taskTypeColors`, `typeMeta`).
A cor aparece em três formas: **bolinha** de legenda (10px), **chip** de rótulo, e
**filete esquerdo de 3px** no card do Kanban e no chip do calendário.

| Tipo | Cor (Manhã) | Cor (Noite) | Fundo do chip | Texto do chip |
|---|---|---|---|---|
| **Tarefa** | `#5b646e` | `#98a1ab` | `--sf-apoio` | `--tx-2` |
| **Evento** | `#17325c` | `#7ea6dd` | `--acao-bg` | `--acao` |
| **Audiência** | `#c9962f` | `#d9a93a` | `--marca-bg` | `--marca-tx` |
| **Perícia** | `#9a6700` | `#d0a02a` | `--aviso-bg` | `--aviso` |
| **Prazo** | `#b3261e` | `#e2685a` | `--urgente-bg` | `--urgente` |

> **Audiência é a única exceção autorizada ao ouro fora da marca.** Ela já é ouro hoje
> (`bg-gold-500`) e o escritório lê essa cor como audiência. O ouro entra como **preenchimento**
> (bolinha e filete) e, quando vira texto, usa `--marca-tx` `#a87a1c` — nunca `#c9962f`.

### Prioridade

| Prioridade | Fundo | Texto |
|---|---|---|
| Baixa | `--sf-apoio` | `--tx-2` |
| Média | `--acao-bg` | `--acao` |
| Alta | `--aviso-bg` | `--aviso` |
| Urgente | `--urgente-bg` | `--urgente` |

---

## 8. Severidade na Central de Alertas

Filete esquerdo de **3px**, altura total da linha:

| Severidade | Manhã | Noite |
|---|---|---|
| Alta | `#b3261e` (`--urgente`) | `#e2685a` |
| Média | `#c9962f` (`--marca`) | `#d9a93a` |
| Baixa | `#8b939c` (`--tx-3`) | `#79828c` |

O rótulo do tipo de alerta fica acima do título, em 9,5px caixa alta `letter-spacing .1em`
`--tx-2`. São doze tipos e **nenhum deles ganha cor própria** — a severidade já resolve.

---

## 9. Borda por fonte de publicação — `components/PublicationsList.tsx` e `app/m/publicacoes/page.tsx`

Filete esquerdo de **3px**. As chaves são os valores reais do enum `Publication.source` —
foi justamente aqui que estava o bug corrigido na rodada anterior.

| Fonte | Manhã | Noite |
|---|---|---|
| `DJE` | `#17325c` | `#7ea6dd` |
| `PJE` | `#2f6fb0` (`--fonte-pje`) | `#93c0f0` |
| `ESAJ` | `#9a6700` | `#d0a02a` |
| `PROJUDI` | `#5b646e` | `#98a1ab` |
| `MANUAL` | `#7d1330` | `#cd5f77` |
| `JUSBRASIL_EMAIL` | `#1c6b52` | `#4fb28c` |
| *(fonte desconhecida)* | `#c9cdd3` | `#39414a` |

`MANUAL` usa vinho porque é o único lançamento feito por pessoa — merece ser notado.
**Nenhuma fonte usa ouro**, para o ouro continuar significando marca e seção ativa.

A alternância de fundo dos cartões (`.pub-card-a` / `.pub-card-b`, hoje branco e palha `#faf6ec`)
**sai inteira**. Todos os cartões usam `--sf-superficie`; o ritmo vem da régua.

---

## 10. Status financeiro — `components/PayablesList.tsx`, `ReceivablesList`, honorários

| Status | Fundo | Texto | Rótulo exibido |
|---|---|---|---|
| `PENDENTE` | `--aviso-bg` | `--aviso` | **Pendente** |
| `PAGO` | `--concluido-bg` | `--concluido` | **Pago** |
| `ATRASADO` | `--urgente-bg` | `--urgente` | **Atrasado** |
| `PARCIAL` | `--aviso-bg` | `--aviso` | **Parcial** |
| `CANCELADO` | `--sf-apoio` | `--tx-3` | **Cancelado** |

> **Correção de texto junto:** hoje a lista de Despesas mostra o enum cru em caixa alta
> (`ATRASADO`, `PENDENTE`). Passa a mostrar o rótulo capitalizado da última coluna. A aba de
> Honorários da Assessoria já faz certo — é ela que vira o padrão.

Valores monetários: `font-variant-numeric: tabular-nums`, peso 600, alinhados à direita.
Valor de item cancelado leva `line-through` em `--tx-3`.

---

## 11. Seções de formulário — `components/financeiro/SecaoLancamento.tsx`

Os cinco fundos cheios (palha, azul, ouro, verde, rosa) **saem**. Cada seção vira
**fundo `--sf-apoio` + filete esquerdo de 3px**, raio `0 5px 5px 0`, e um rótulo em 10px caixa
alta na cor do filete.

| Seção | Filete (Manhã) | Filete (Noite) |
|---|---|---|
| Contato / Identificação | `#17325c` | `#7ea6dd` |
| Assunto e matéria | `#5b646e` | `#98a1ab` |
| Honorário | `#c9962f` | `#d9a93a` |
| Pendências | `#7d1330` | `#cd5f77` |
| Anexos | `#1c6b52` | `#4fb28c` |

> Isto **corrige o mockup**, que usava ouro em duas seções (Contato e Honorário). Só o
> Honorário fica com ouro; Contato passa a azul-tinta.

As variáveis `--secao-*-bg` / `--secao-*-border` de `app/globals.css` são substituídas por
este par único (`--sf-apoio` + filete), reduzindo dez variáveis a cinco.

---

## 12. Kanban — `components/KanbanBoard.tsx`

- **Coluna:** fundo `--sf-apoio`, borda 1px `--regua`, raio 6px. Cabeçalho com régua inferior.
- **Contador da coluna:** fundo `--sf-superficie`, borda 1px `--regua`, raio 9px, `--tx-2`.
- **Card:** fundo `--sf-superficie`, borda 1px `--regua`, raio 5px,
  **filete esquerdo 3px na cor do tipo de tarefa** (tabela da seção 7).
- **Card sendo arrastado:** este sim ganha sombra — `0 8px 24px rgba(22,25,29,.18)` no Manhã,
  `rgba(0,0,0,.45)` no Noite.
- **Card concluído:** opacidade 72% e `line-through` no título.

O card é a única coisa branca da coluna — é isso que comunica que ele é o que se pega.

---

## 13. Superfícies, raios e sombras

| Uso | Valor |
|---|---|
| Raio de cartão e painel | **6px** (hoje 16px, via `rounded-xl` sobrescrito no Tailwind) |
| Raio de botão e campo | **5px** |
| Raio de chip de ícone | **4px** |
| Raio de pílula / chip de filtro | **11px** |
| Régua de linha | 1px `--regua` |
| Régua de seção | 2px `--tx` |
| Sombra de menu suspenso | `0 10px 30px rgba(22,25,29,.18)` / Noite `rgba(0,0,0,.45)` |
| Sombra de modal | `0 12px 40px rgba(22,25,29,.20)` / Noite `rgba(0,0,0,.5)` |
| Sombra de cartão parado | **nenhuma** |

`.brand-texture` (o grid dourado de fundo) é **removida**, junto com `SiteBackgroundLayer` se
ele só existir para isso.

---

## 14. Tipografia

**Archivo** em todo o produto, via `next/font/google` (auto-hospedado, sem CDN).
`font-variant-numeric: tabular-nums` no `body`. A família serifada sai do
`tailwind.config.ts` — `font-serif` deixa de existir e todos os `className="font-serif"` saem.

| Papel | Tamanho | Peso | Tracking |
|---|---|---|---|
| Marca (LÚMEN) | 20–30px | 700 | `.16em` |
| Título de tela | 19–26px | 700 | `-.015em` |
| Título de painel | 15px | 600 | `-.005em` |
| Rótulo de seção | 10–12px caixa alta | 600 | `.11em` |
| Corpo | 15px (12,5px em tela densa) | 400 | 0 |
| Metadado | 11px | 400 | 0 |
| Dado numérico | herda | 600 | 0, tabular |

---

## 15. A marca — `components/LumenMark.tsx`

**Nenhuma coordenada muda.** Quadrado 120 canto 27, moldura 1,3 recuada 4,5, painel 54×60
canto 3, fresta de 6. Só os preenchimentos:

| Elemento | Antes | Agora |
|---|---|---|
| Quadrado | `#0a1128` | `#16191d` |
| Moldura interna (35% opac.) | `#b8860b` | `#c9962f` |
| Painel do L | degradê `#e7c15a → #b8860b` | **chapado `#c9962f`** |
| Fresta (2 retângulos) | `#0a1128` | `#16191d` |
| Pingo e base | `#6e0d25` | `#cd5f77` |

O `<linearGradient>` e o `useId()` que o acompanha são removidos.

---

## 16. Proibido

1. Hex literal em `app/**` ou `components/**`.
2. Classe `navy-*`, `gold-*`, `bordo-*`, `cream-*`, `magenta-*` em código novo — são legado
   e serão removidas ao fim da migração.
3. Ouro como fundo de botão, ou como texto sobre fundo claro fora de `--marca-tx`.
4. Sombra em cartão parado.
5. Fundo colorido cheio em seção de formulário.
6. `text-white` sobre `--acao` — use `--acao-tx`.
7. Qualquer textura de fundo.
