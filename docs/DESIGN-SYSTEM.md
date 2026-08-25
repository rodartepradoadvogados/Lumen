# Sistema de cor e detalhe — Lúmen

Fonte única de verdade para a implementação do redesenho. **Nenhum valor aqui é sugestão.**
Se um componente precisa de uma cor que não está neste documento, a resposta certa é
perguntar, não inventar um hex.

> **Redesenho Modernist em andamento (agosto/2026).** As seções §1, §2 e as linhas de sombra
> de §13 abaixo já refletem o sistema novo — ver `design_handoff_lumen_redesign/`,
> especialmente `01-tokens-e-tema.md` (fonte única dos tokens) e `10-plano-de-execucao.md`
> (ordem das fases). **Modelo aplicado: B — "Modernist puro"**, do documento 01: o vermelho
> `#ec3013` é a única cor de ação e de marca; não existe mais ouro nem azul-tinta neste
> sistema. As demais seções (§3 em diante) ainda descrevem o desenho ANTERIOR ao redesenho
> (azul-tinta, ouro, raio 5–6px) e são substituídas seção por seção conforme cada fase do
> `10-plano-de-execucao.md` chega ao respectivo componente — não de uma vez. Ao migrar uma
> área, atualize a seção correspondente aqui no mesmo PR, para nunca haver duas verdades no
> repositório.

> **Ajuste de tema (agosto/2026, segunda rodada).** Três mudanças em cima do Modernist puro
> acima, já aplicadas em `app/globals.css`/`tailwind.config.ts`/`app/layout.tsx` (fonte real
> de verdade — as tabelas de hex mais abaixo neste documento ainda não foram todas
> varridas):
> - **Cor de ação/marca**: bordô `#8a2f42` no lugar do vermelho-alaranjado `#ec3013` — mais
>   suave, e com contraste melhor sobre branco (~8:1 vs ~4,2:1).
> - **Raio**: deixou de ser zero. Escala em 3 paradas — `sm` (4px, chips/badges), `DEFAULT`/
>   `md` (6px, botões/inputs/rail), `lg`/`xl`/`2xl`/`3xl` (10px, cartões/modais/painéis
>   suspensos/contêiner da tela).
> - **Tipografia**: Inter no lugar de Archivo (`--font-sans`) — Archivo lia como reta/
>   mecânica demais; Inter é neutra e discreta.
>
> **Sweep dos chips/avisos soltos (agosto/2026, terceira rodada).** O ajuste acima só chegou
> aos componentes compartilhados (`Card`, botões, rail, guias, `ModalShell`) — os ~61 arquivos
> com chip/badge/aviso de status construído com classe solta (`bg-aviso-bg`/`bg-urgente-bg`/
> `bg-concluido-bg` fora desses componentes) ficaram de fora de propósito, para não arriscar
> um resultado inconsistente numa passada só. Revisados um a um nesta rodada:
> - **Chip/badge pequeno** (pílula curta, `px-2`/`px-2.5 py-0.5`/`py-1`): `rounded-sm` (4px).
> - **Botão** (`<button>` com estado de seleção, ex.: desfecho do honorário): `rounded-md`
>   (6px), mesma régua de `ButtonPrimary`/`ButtonSecondary`.
> - **Aviso/erro inline** (mensagem de formulário, notice de Drive desconectado, caixa de
>   conflitos): `rounded-md` (6px) — não é chip nem é cartão elevado, fica no meio da escala.
> - **Popover flutuante** (`shadow-pop`, menu de confirmar exclusão): `rounded-lg` (10px) —
>   mesmo nível de painel suspenso, regra 3 (`§0`: sombra só em coisa que flutua de verdade).
> - **Painel/bloco destacado** (ex.: card de inadimplência em Relatórios): `rounded-lg` (10px).
> - **Deixado de fora nesta rodada**: linha de tabela/menu suspenso/linha de lista corrida
>   (ex.: `<tr>`, item de dropdown, linha da Central de Alertas) — canto arredondado numa
>   única linha dentro de uma lista contínua quebra visualmente contra as vizinhas.
>
> **Chip de conclusão (agosto/2026, quarta rodada).** `ConclusionChip` (`components/ui.tsx`):
> check + rótulo, `rounded-sm` (4px), reaproveita `--concluido`/`--concluido-bg` (o mesmo verde
> do `Badge` `green` — nenhum token novo). Pensado como componente espalhável, não como tela
> nova — hoje em: tarefa/compromisso concluído (`TaskActivityRow`, `AgendaView`
> `DayPanelTaskRow`, `MobileAgendaTaskRow`, `KanbanBoard`, atendimento — "Audiência realizada"
> só para o tipo Audiência, "Prazo cumprido" para os demais, ver `taskConclusionLabel`) e
> status financeiro `PAGO` (`FinanceStatusBadge`, com prop `kind: "payable" | "receivable"` —
> "Conta paga" vs "Conta recebida"; todo call site do produto, desktop e app, passa por ele —
> não sobrou nenhum lugar lendo `financeStatusColors` direto). Nos dois casos substitui o Badge
> de tipo/status só quando o item está concluído; nos outros estados a tela continua exatamente
> como era. Deixado de fora de propósito: a tabela de pontuação em Produtividade (o tipo da
> tarefa é o eixo do relatório ali, não faz sentido esconder atrás do chip) e "Meta batida" — o
> Lúmen ainda não tem uma feature de metas.
>
> **Botão ícone-só (agosto/2026, quinta rodada).** O padrão apontado como pendente na rodada 3
> (lápis/lixeira/paginação com fundo só no hover) recebeu `rounded-md` (6px, mesma régua de
> `ButtonPrimary`/`ButtonSecondary`) em todo o produto — não só nos arquivos que tinham chip de
> status.

Dois temas: **Manhã** (claro) e **Noite** (escuro, classe `.dark` no `<html>`).
Só existem esses dois — Dia/Tarde foram removidos antes desta rodada.

---

## 0. As três regras que não se quebram

1. **Nenhum hex solto em componente.** Toda cor vem de `app/globals.css` (variável CSS) ou de
   `tailwind.config.ts` (escala). Um `#` dentro de `components/` ou `app/` é bug de revisão.
2. **O bordô (`--marca`/`--acao`) é a única cor de destaque do produto.** Não há ouro nem
   azul-tinta no sistema Modernist. Raio em 3 paradas (4/6/10px conforme a superfície — ver
   nota de ajuste de tema no topo do documento), não mais zero.
3. **Sombra só em coisa que flutua de verdade.** Modal, menu suspenso e card sendo arrastado.
   Cartão parado se separa por régua, não por sombra.

---

## 1. Escalas base

| Escala | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|
| **neutro** | `#f8f4f4` | `#eae7e7` | `#d7d3d3` | `#bab6b6` | `#9b9797` | `#7d7979` | `#605d5d` | `#444141` | `#2d2b2b` |

| Escala | 300 (hover) | 500 (base) | 700 (escuro/destrutivo) |
|---|---|---|---|
| **bordô** (`--acao`/`--marca`) | `#9c3a4d` | `#8a2f42` | — |
| **vinho** (`--vinho`, só ação destrutiva — não é a marca) | — | — | `#ae1800` |

O rail é a única superfície que continua fixa em grafite (`#16191d`) nos dois temas — ver
`components/NavRail.tsx` e o documento 02.

> **Ouro e azul-tinta saíram da paleta.** O modelo B ("Modernist puro") do documento 01
> substitui os dois pelo bordô único acima — `--acao` e `--marca` resolvem para o mesmo
> hex. As classes legadas `gold-*`/`bordo-*`/`magenta-*` continuam existindo em
> `tailwind.config.ts` só para não quebrar componentes ainda não migrados, e já apontam para
> esta escala.

---

## 2. Tokens semânticos

São estes os nomes que os componentes usam. A escala base só aparece na definição.

| Token | Manhã | Noite | Papel |
|---|---|---|---|
| `--sf-fundo` | `#f3f2f2` | `#14161c` | Fundo da janela |
| `--sf-superficie` | `#ffffff` | `#1c1f27` | Cartão, painel, barra |
| `--sf-apoio` | `#eae9e9` | `#262b35` | Cabeçalho de tabela, linha ativa, campo |
| `--regua` | `#d7d3d3` | `#333844` | Divisor de 1px |
| `--regua-forte` | `#bab6b6` | `#414755` | Borda de contêiner, moldura |
| `--tx` | `#201e1d` | `#eef1f5` | Texto corrido |
| `--tx-2` | `#605d5d` | `#a3aab6` | Rótulo, metadado |
| `--tx-3` | `#9b9797` | `#767e8c` | Texto desabilitado, placeholder |
| `--acao` | `#8a2f42` | `#8a2f42` | Ação primária, aba ativa — não retematiza |
| `--acao-hover` | `#9c3a4d` | `#9c3a4d` | Estado hover da ação |
| `--acao-tx` | `#f7eef0` | `#f7eef0` | **Texto sobre `--acao`** — claro nos dois temas (bordô é escuro demais para texto escuro em cima) |
| `--acao-bg` | `rgba(138,47,66,.08)` | `rgba(138,47,66,.16)` | Fundo de chip informativo |
| `--marca` | `#8a2f42` | `#8a2f42` | Marca e indicador de seção ativa — não retematiza |
| `--marca-tx` | `= --marca` | `#c9707f` | Bordô **quando precisa ser texto/filete** — na Noite precisa de um tom mais claro (o sólido some contra o fundo escuro); na Manhã o sólido já contrasta bem sozinho |
| `--marca-bg` | `rgba(138,47,66,.15)` | `rgba(138,47,66,.18)` | Fundo de chip da marca |
| `--vinho` | `#ae1800` | `#ae1800` | **Ação destrutiva** — não retematiza |
| `--urgente` | `#b3261e` | `#e2685a` | Vencido, atrasado, prazo estourado |
| `--urgente-bg` | `rgba(179,38,30,.10)` | `rgba(226,104,90,.14)` | |
| `--aviso` | `#9a6700` | `#d0a02a` | Vence em breve, parcial, aguardando |
| `--aviso-bg` | `rgba(154,103,0,.12)` | `rgba(208,160,42,.14)` | |
| `--concluido` | `#1c6b52` | `#4fb28c` | Concluído, pago, recebido, conectado |
| `--concluido-bg` | `rgba(28,107,82,.10)` | `rgba(79,178,140,.14)` | |

`--acao-tx`/`--acao-hover`/`--acao-bg`/`--marca-tx`/`--marca-bg` não vêm prontos do documento
01 (que só fixa `--acao`/`--marca`/`--vinho`) — foram derivados seguindo o mesmo padrão de
contraste/alpha que o próprio documento já usa nos demais pares base/`-bg` do sistema.
`--acao-tx` é escuro (não branco) nos dois temas: sobre `#ec3013` o texto escuro contrasta
melhor (~4,46:1) que o branco (~4,20:1), e é o mesmo par cor-de-marca/texto-escuro que o
documento 09 já usa no bloco em pôster do site público.

### Vinho x urgente — onde cada um entra

Os dois são avermelhados e é aqui que a implementação erra. A regra é por **origem**, não por
aparência:

- **`--vinho`** é a **marca** — a única cor de ação destrutiva (texto e botão de Excluir,
  confirmação de exclusão, badge de contagem do rail).
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

> **Atualizado na Fase 01/PR2:** raio zero (não mais 5px) e rótulo alinhado à ESQUERDA
> (nunca centralizado — documento 01, "Proibido" #8), já aplicado em `ButtonPrimary`/
> `ButtonSecondary` de `components/ui.tsx`. Secundário passou a fundo transparente com
> borda de **2px** `--regua-forte` (era 1px `--regua`), hover `--acao-bg` (era
> `--sf-apoio`). O restante da tabela abaixo (cor por tipo, exemplo do Peticionar) ainda
> descreve o desenho anterior à cor de ação do modelo B — vale só a FORMA (borda/raio/
> alinhamento), não a cor azul-tinta citada nos exemplos.

Altura 32px no desktop, 26px em barra compacta. Raio **6px** (ajuste de tema, ver topo do
documento — era 0). Peso 600. Ícone 12–14px.

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

Raio em 3 paradas em `tailwind.config.ts` desde o ajuste de tema (ver topo do documento) —
`sm` resolve a `4px` (chips/badges), `DEFAULT`/`md` a `6px` (botões/inputs/rail),
`lg`/`xl`/`2xl`/`3xl` a `10px` (cartões/modais/painéis suspensos/contêiner da tela); só
`rounded-full` sobrevive à parte (não redeclarado, segue o padrão do Tailwind), para avatar e
**badge de contagem**. O padrão de cartão
também mudou: em vez de borda de 1px nas quatro arestas, **filete de 2px no topo** em
`--regua-forte` (ou na cor de severidade, quando houver — ex.: KPI de inadimplência em
`--urgente`) e sem borda nas outras arestas — ver `Card`/`CardHeader` em
`components/ui.tsx` e `components/ModalShell.tsx`.

> **Pendente:** o PR2 zerou o raio via config e migrou os componentes centrais
> (`Card`/`CardHeader`/`ModalShell`/`ButtonPrimary`/`ButtonSecondary`) e os contêineres
> de cartão mais comuns fora deles. Ainda restam divisores internos (`border-b border-regua`
> entre cabeçalho e corpo) e botões ad-hoc fora dos componentes centrais em 1px/borda
> antiga — inofensivos visualmente (a cor já é a nova), mas não uniformizados; migre-os
> quando mexer em cada tela, ao invés de uma varredura só.

| Uso | Valor |
|---|---|
| Raio de cartão, painel, botão, campo, chip, pílula | **0** |
| Régua de linha | 1px `--regua` |
| Régua de seção | 2px `--regua-forte` |
| Sombra de menu suspenso | `0 3px 10px rgba(45,43,43,.16)` / Noite `rgba(0,0,0,.45)` |
| Sombra de modal / card arrastado | `0 12px 32px rgba(45,43,43,.22)` / Noite `rgba(0,0,0,.5)` |
| Sombra de cartão parado | **nenhuma** |

`.brand-texture` (o grid dourado de fundo) e `SiteBackgroundLayer` são **removidos** — ver
documento 02 do handoff (fase da casca), ainda não migrada.

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
3. `--marca`/vermelho como fundo de botão, ou como texto sobre fundo claro fora de
   `--marca-tx`.
4. Sombra em cartão parado.
5. Fundo colorido cheio em seção de formulário.
6. `text-white` sobre `--acao` — use `--acao-tx`.
7. Qualquer textura ou gradiente de fundo.
8. Canto arredondado em qualquer superfície de interface — só `rounded-full` sobrevive, e só
   em avatar e badge de contagem (documento 01; varredura completa no PR2 da Fase 01).
9. Rótulo de botão centralizado — sempre alinhado à esquerda (documento 01).
