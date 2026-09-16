# F1 · Diagnóstico — Portal / SaaS (`app/(app)/**`)

**Modo:** Operate · **42 rotas · ~55 sub-telas · ~35 modais-tela** · Tema padrão escuro
**Data:** 2026-09-16 · Crítica baseada em leitura de código (sem navegador — ver ⚠️ DEGRADED em `00-mecanico.md`)

> **Veredito em uma frase:** o portal é um catálogo de telas com um tema aplicado por cima, não um
> sistema. A casca navega pelos *módulos do banco* (Agenda, Comunicação, Jurídico, Financeiro,
> Gestão), não pelo que o advogado precisa fazer. O sócio abre `/painel` e a primeira coisa que a
> tela diz é **o nome dele**.

---

## P0 — os três piores

### P0-1 · O painel do dono mede a pessoa errada

`app/(app)/painel/page.tsx:128` — o cartão **"Minhas atrasadas"** filtra por
`responsibleId === viewer.id`. O sócio-dono vê apenas **o próprio atraso**, não o do escritório.
Pior: `overdueTasksList` (`:91-95`) **já traz o escritório inteiro** e é descartado.

O usuário prioritário declarado (D-04) é justamente o dono, e a pergunta que ele faz ao abrir o
sistema — *"o que corre risco agora?"* — não tem resposta em lugar nenhum da home. Enquanto isso,
`:197` gasta o maior tipo da página (30px), o único gradiente (halo bordô de 340×160, `:193-194`) e a
única textura (`GrainOverlay`, `:187`) numa **saudação**.

Some-se: o card "O dia" (`:209-229`) conta prazos somando vencidos **e** futuros no mesmo número
(`prazosCount`, `:170`, sobre `:154`) — não diz quantos estão vencidos.

**Isto é defeito de produto, não de estética.** Corrigível independentemente do redesign.

### P0-2 · O rail não é um mapa

Quatro defeitos somados em `lib/navSections.ts` + `components/NavRail.tsx`:

| Defeito | Evidência |
|---|---|
| **Dois destinos, uma URL** — "Comunicação" e "Jurídico" abrem literalmente a mesma tela | `navSections.ts:65` e `:78`, ambos `/publicacoes`; `NavRail.tsx:134` navega sempre para `items[0].href` |
| **A mesma URL renderiza abas diferentes** conforme por onde você entrou | `sectionForPathname` usa `preferred` para desempatar (`navSections.ts:168-180`) — estado invisível decidindo navegação visível |
| **Dois ícones acesos ao mesmo tempo** em `/configuracoes` | "Ajustes" declara seção `gestao` (`NavRail.tsx:146-152`) e o ícone de Gestão acende com a mesma (`:129-137`) |
| **O hub do Financeiro é órfão** | `/financeiro` não está em `navSections.ts:89-95`. A única tela com os 4 agregados do escritório (`financeiro/page.tsx:45-48`) só é alcançável por um link de **11px cinza com seta "←"** escondido acima do título das sub-páginas (`receitas:62`, `despesas:68`, `dre:75`, `fluxo-de-caixa:71`, `livro-caixa:40`) |

**Seis ícones entregam cinco destinos e mentem sobre a posição atual.** E todo clique simples no rail
tem **250ms de atraso deliberado** (`NavRail.tsx:76`) para detectar duplo clique (abrir guia) — numa
ferramenta de 8h/dia.

Contagem de cliques a partir de `/painel`: triar publicação **1** · abrir um processo **3** (o
primeiro no lugar errado) · ver a saúde financeira do escritório **2**, um deles invisível · ver as
atrasadas do escritório **não existe caminho**.

### P0-3 · A navegação primária é o menor tipo do produto

| Elemento | Tamanho | Arquivo |
|---|---|---|
| Rótulo de seção do rail | **9px** | `NavRail.tsx:204` |
| "v0.1" no pé do rail | **8px** | `NavRail.tsx:155` |
| Contador de badge | **9px** em círculo de 15px | `NavRail.tsx:197` |
| Rótulo de guia | 11px | `GuiasBar.tsx:73` |
| Rótulo de tipo de alerta | 9,5px | `alertas/page.tsx:50` |

Contra 30px na saudação (`painel:197`), 26px em `publicacoes:174`, 24px em `ui.tsx:195`.

**Não é uma escala com poucos degraus — é um abismo com dois polos.** O portal opera em 10-14px e
salta direto para 24-34px: **não existe nada entre 15px e 24px em nenhuma tela da casca.** Sem tier
intermediário, "título de seção" e "corpo de texto" são a mesma coisa. Esta é a causa material das
duas queixas — *fonte* e *hierarquia*.

---

## P1 — os cinco seguintes

**P1-1 · Dez larguras de conteúdo diferentes.** 700 (`produtividade:81`) · 720 (`perfil:38`) · 800
(`importar:22`) · 900 (`alertas:72`) · 1000 (`dre:74`) · 1100 (`contatos/clientes:32`) · 1200
(`receitas:61`) · 1320 (`configuracoes:245`) · 1400 (`painel:188`) · 1600 (`agenda:128`) · **sem teto**
(`processos/[id]:336`). Com rail de largura fixa, **o conteúdo desliza lateralmente a cada
navegação**. Somado ao `animate-fade-in` universal e ao `stagger-in` das listas (`painel:218`,
`globals.css:356-366`), produz instabilidade permanente.

> ⚠️ **Releitura importante da sua queixa:** o incômodo com "animações" provavelmente **não é excesso
> de animação** — é o layout nunca ficar parado. Cada navegação é fade + cascata + salto lateral.

**P1-2 · O bordô perdeu função.** `--acao` e `--marca` são **o mesmo hex** (`globals.css:48` e `:57`).
Onze usos, sete significados incompatíveis: ação primária · pílula do rail · chip de filtro ·
sublinhado de aba · **halo decorativo** (`painel:194`) · badge de natureza (`processos/[id]:74-78`) ·
pílulas de matéria (`:523`) · severidade média de alerta (`alertas:44`) · badge de audiência ·
ponto de guia atualizada · link de processo. **Nada é identificável como clicável pela cor.**

E há **três vermelhos brigando**: `--acao` `#8a2f42`, `--atencao`/`--vinho` `#ae1800` (não
retematiza, e é a cor de **todos** os badges de contagem) e `--urgente` `#e2685a`. Os três aparecem
juntos em 200px no canto superior esquerdo.

**P1-3 · `/processos/[id]` pede 6 decisões antes das 9 abas.** `:350-378` — Modo reunião, Peticionar,
seletor de Assessoria, badge de natureza, seletor de Status (que altera o registro) e Excluir. O
`CaseStatusSelect` (`:370`) e o `DeleteEntityButton` (`:371`) são **vizinhos imediatos, mesmo peso
visual**. As 9 abas (`:53-70`) têm 4 condicionais (`:409-414`): a barra muda de tamanho conforme o
registro, então não há memória muscular de posição. A aba padrão tem ~25 campos numa viewport, todos
no mesmo peso, e nada diz **o que está pendente neste processo**.

**P1-4 · `/assessoria/[id]`: identidade e métrica no mesmo tamanho.** O h1 com o nome do cliente
(`:96`) é `text-2xl` e os **quatro KPIs** (`:121`,`:125`,`:129`,`:133`) são **também `text-2xl
font-bold`**. Cinco elementos idênticos em peso; rótulos a 11px. Razão 24:11 sem degrau intermediário.

**P1-5 · Um seletor CSS apontando para variável inexistente.** `financeiro/receitas/page.tsx:219-222`
(idem `despesas`, `dre`): `.fp-input { background-color: var(--sf); }` — **`--sf` não existe em
`app/globals.css`**. Os tokens são `--sf-fundo`/`--sf-superficie`/`--sf-apoio`; `bg-sf` é mapeamento
do Tailwind, não variável CSS. Os inputs dessas três telas financeiras renderizam **sem fundo
declarado**. Sintoma de que não existe componente de input no sistema — cada tela reinventa o seu.

**Menções que também morrem no redesign:** `PageSectionTabs` retorna `null` em `/painel`
(`PageSectionTabs.tsx:66`), então o conteúdo salta 40px ao entrar/sair da home · o badge da seção
Agenda soma publicações que **já são contadas** no badge de Comunicação (`NavRail.tsx:124` +
`getAlertsCount`) · **11 ocorrências de `dark:` dentro de `app/(app)`** são código morto (o portal usa
`.portal-light`, não a classe `dark` do Tailwind).

---

## Modo claro: é remendo, não tema

`.portal-shell` (`globals.css:535-585`) define o escuro; `.portal-light` (`:587-625`) reescreve os
mesmos ~20 tokens. Mas **o rail é grafite fixo nos dois temas** (`NavRail.tsx:96-99`), **o aside de
Configurações também** (`configuracoes/page.tsx:270`), e `--acao`/`--marca`/`--vinho`/`--ouro-acento`
**não retematizam por decisão explícita** (`globals.css:131-133`).

Resultado no claro: uma barra preta à esquerda, um bloco preto no meio de Configurações, e um bordô
calibrado para fundo escuro. **O modo claro não foi desenhado — foi derivado por substituição de
variáveis**, e os pontos onde a substituição não se aplica são justamente os mais visíveis.

---

## O que MERECE SOBREVIVER ao redesign

O que está bom aqui é **o modelo de domínio e as regras**, não a pele.

1. **A fila de triagem de publicações inteira** (`components/PublicationsTriage.tsx` +
   `lib/publicationGrouping.ts`): fila → teor → ação, com agrupamento que elimina a duplicata quando
   o mesmo andamento chega por DJEN e por e-mail (`publicacoes:141-143`), prazo em dias úteis já
   calculado (`:146-149`) e **atalhos J/K/Enter/A/L**. É o único lugar desenhado para 8h/dia. **O
   redesign deve partir daqui e propagar para Alertas e Painel — não o contrário.**
2. **A ordenação por severidade da fila "O dia"** (`painel:133-141`): vencido-prazo → vencido-outros →
   hoje-prazo → hoje-audiência → hoje-resto → amanhã → semana. A lógica está certa; falta a forma.
3. **Linguagem humana para datas** (`painel:146-152`): "venceu ontem", "hoje 14:30". Vale por dez KPIs.
4. **Cor = risco, nunca categoria** (`DayQueueRow.tsx:33-38`, `alertas:41-46`): nenhum dos 12 tipos de
   alerta ganha cor própria — só a severidade fala. **Generalizar esta regra e apagar todos os outros
   usos de cor categórica** é, sozinho, metade da solução da paleta.
5. **Régua no lugar de sombra** (`ui.tsx:56-62`): filete de 2px no topo em vez de box-shadow. Dá ao
   produto a seriedade documental certa para um escritório. Manter integralmente.
6. **Contadores nos rótulos de filtro** (`publicacoes:163-168`): "Não triadas · 47". Deve virar regra
   do sistema, não exceção de uma tela.
7. **`prefers-reduced-motion` global** (`globals.css:437-441`) e **`live-dot` como recurso único**
   (`:652-664`) — a disciplina de reservar um recurso a um só significado é exatamente o que falta ao
   bordô.

---

## Direção que este diagnóstico impõe a F2

> O Lúmen tem as regras certas e o mapa errado. O trabalho não é retipografar — é decidir **quais três
> perguntas o sócio faz ao abrir o portal**, respondê-las no primeiro terço da tela **com números do
> escritório, não do usuário logado**, e reconstruir o rail a partir das tarefas, não das tabelas do
> banco.
