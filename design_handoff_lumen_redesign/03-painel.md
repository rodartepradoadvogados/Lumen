# 03 — Painel

Referência: slide 12 do deck; wireframe `1e`. Arquivo: `app/(app)/painel/page.tsx`.

## O problema

A tela tem hoje sete blocos com o mesmo peso visual: três KPIs em cima
(`PendingListModal` × 2 + processos ativos) e quatro listas embaixo (compromissos,
alertas, tarefas atrasadas, avisos). Nenhuma hierarquia — quem entra às 8h não sabe por
onde começar.

## A estrutura nova

Duas colunas, `grid-template-columns: 2fr 1fr`, gap `--space-4` (16px). Largura máxima
`1400px`, centralizada, padding 24px.

### Cabeçalho

- Saudação: "Bom dia/Boa tarde/Boa noite, {primeiro nome}", 30px peso 800
- À direita, 15px `--tx-2`: data por extenso + "1 comunicado hoje às {hora}" (lê a
  preferência de digest do documento 06)

### Coluna larga (2fr)

**1. "O dia" — a fila, em ordem de urgência.** Cartão com filete de 2px `--regua-forte` no
topo. Cabeçalho: "O dia — {n} prazos, {n} audiências" (18px/800) + link "Ver agenda".
Cada linha:

- filete esquerdo de 4px na cor do tipo de tarefa (§7 do manual: Tarefa `--tx-2`,
  Evento `--acao`, Audiência `--marca`, Perícia `--aviso`, Prazo `--urgente`)
- título 15px/400 `--tx`; abaixo, processo/cliente 13px `--tx-2`
- hora ou "hoje 17h" à direita, `--urgente` quando é hoje
- **botão "Abrir" na própria linha** (secundário, 30px) — a ação não exige entrar na agenda
- linhas separadas por 1px `--regua`
- ordem: prazo vencido → prazo hoje → audiência hoje → compromisso hoje → amanhã
- máximo 6 linhas; abaixo, "Ver os outros {n}"

Fonte de dados: as mesmas queries de `upcomingTasks` e `overdueTasksList` já existentes,
reordenadas por severidade em vez de só `dueDate: asc`.

**2. "Publicações não lidas — {n}".** Mesmo padrão de cartão. Três linhas de prévia
(fonte + processo + primeiras palavras do teor) e o link "Triar", que leva a
`/publicacoes?filtro=nao-triadas` (documento 05).

### Coluna estreita (1fr)

Quatro cartões, todos com filete de 2px no topo:

| Cartão | Filete | Valor |
| --- | --- | --- |
| MINHAS ATRASADAS | `--urgente` | contagem, 34px/800 em `--urgente` |
| A RECEBER · 7 DIAS | `--regua-forte` | `formatCurrency`, 26px/800 |
| A PAGAR · 7 DIAS | `--regua-forte` | `formatCurrency`, 26px/800 |
| FUNIL — {n} HOJE | `--regua-forte` | duas linhas de atendimento + link |

Rótulo dos cartões: 10px caixa alta, `.12em`, peso 600, `--tx-2`.

Os dois cartões financeiros continuam abrindo o `PendingListModal` que já existe (com
`SettleButton` dentro) — só o recorte muda: **próximos 7 dias**, não tudo em aberto. Sem
acesso financeiro (`hasFinanceAccess === false`), os dois cartões não renderizam e a
coluna estreita fica com dois.

### O que sai do Painel

- O KPI "Processos ativos" e o widget de matérias (vão para Relatórios)
- O painel de avisos da equipe (`NoticesPanel`) — vira item do menu do avatar com badge
- A lista de alertas: a Central de Alertas continua em `/alertas`; o Painel mostra apenas
  o que é do dia

## Aceite

- [ ] A primeira coisa visível abaixo da saudação é a fila do dia
- [ ] "Abrir" na linha navega para a tarefa sem passar pela agenda
- [ ] Ordenação por severidade, não por data pura
- [ ] Sem acesso financeiro, nenhum valor aparece (nem mascarado — o cartão não existe)
- [ ] Nenhum cartão tem sombra ou canto arredondado
