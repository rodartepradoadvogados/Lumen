# Diagnóstico e Plano de Reforma — 10/07/2026

**Ponto de restauração:** tag `restauracao-2026-07-10` / branch `backup/pre-reforma-2026-07-10` (ambos no GitHub).
Para reverter tudo: `git checkout backup/pre-reforma-2026-07-10`.

Referências de mercado usadas: **Astrea** (evitar: excesso de funcionalidades irrelevantes, pouca liberdade de extração de dados, visual carregado; aproveitar: centralidade das publicações no fluxo diário) e **ADV BOX** (aproveitar: agenda como coração do sistema, visões múltiplas, filtros por responsável).

---

## A. Navegação e UX global

| # | Problema | Impacto | Solução |
|---|----------|---------|---------|
| A1 | **Busca global do topo é decorativa** — o campo "Pesquisar processo, contato ou tarefa" não faz nada | Crítico: é o caminho mais rápido para qualquer coisa e está morto | Busca real com resultados instantâneos (processos, clientes, tarefas, publicações, atendimentos), navegável por teclado |
| A2 | Botões-ícone (lápis, lixeira, power, carteira, reabrir) sem descrição visível ao passar o mouse | Usuário novo não sabe o que cada ícone faz | Tooltip estilizado global (aparece ao hover em qualquer botão de ação) |
| A3 | Itens expansíveis (publicações, histórico do timesheet) não se diferenciam dos não expansíveis | Usuário não descobre funcionalidades | Chevron (seta) indicando expansão + rotação ao abrir |
| A4 | Configurações = página única gigante com 9+ cartões abertos | Poluição visual, rolagem infinita | Reorganizar em **abas**: Geral · Equipe & Acesso · Financeiro · Modelos & Integrações |
| A5 | Sidebar sem contadores (ex.: publicações não lidas) | Advogado não vê que chegou publicação sem entrar na tela | Badge numérico em "Publicações" |

## B. Publicações e Andamentos (fluxo diário do advogado)

| # | Problema | Impacto | Solução |
|---|----------|---------|---------|
| B1 | Não existe aba "Lidas" — publicação marcada como lida some para sempre da tela | Perda de histórico consultável | Sub-abas **Não lidas / Lidas** |
| B2 | Publicações duplicadas (mesma intimação chega pelas 2 caixas de e-mail) | Ruído, retrabalho | Deduplicação por conteúdo no sync (hash do processo+data+texto) + limpeza das existentes |
| B3 | Sem filtro por advogado (Jairo/Rodrigo) nem busca por processo/cliente | Difícil achar publicação específica | Filtro por advogado + campo de busca |
| B4 | Sem "marcar todas como lidas" | Trabalho manual repetitivo | Botão com confirmação |

## C. Agenda e Prazos

| # | Problema | Impacto | Solução |
|---|----------|---------|---------|
| C1 | Só visão mensal | Semana cheia fica ilegível (ref. ADV BOX: múltiplas visões) | Alternador **Mês / Semana / Lista** |
| C2 | Sem filtro por responsável ou tipo | Sócio não isola a agenda de um advogado | Filtros no topo do calendário |
| C3 | Sem legenda das cores dos eventos | Cores sem significado aparente | Legenda compacta (por tipo) |
| C4 | Painel do dia não permite criar tarefa naquele dia | Fluxo interrompido | Botão "+ Nova neste dia" com data pré-preenchida |

## D. Processos e Casos

| # | Problema | Impacto | Solução |
|---|----------|---------|---------|
| D1 | 95 processos em lista única sem busca interna, sem filtro por área/responsável/cliente, sem ordenação | Encontrar um processo exige rolagem | Busca por texto + filtros (área, responsável) + ordenação (nome, valor, última mov.) |

## E. Contatos

| # | Problema | Impacto | Solução |
|---|----------|---------|---------|
| E1 | Advogados: sem editar nem excluir | Cadastro engessado | Editar + excluir com trava |
| E2 | Clientes: sem excluir | Cadastros de teste ficam para sempre | Excluir com trava (só sem processos/lançamentos vinculados) |
| E3 | Sem página de detalhe do cliente | Não há visão 360º (processos + financeiro + publicações do cliente) | Página `/contatos/clientes/[id]` com tudo do cliente |

## F. Financeiro

| # | Problema | Impacto | Solução |
|---|----------|---------|---------|
| F1 | 147 lançamentos sem busca por texto nem filtro por categoria | Achar um lançamento é penoso | Busca + filtro de categoria somados aos existentes |
| F2 | Total do cabeçalho ignora os filtros aplicados | Número enganoso | Total recalculado pelo filtro ativo |
| F3 | Sem exportação | Dados presos no sistema (dor citada do Astrea: falta de liberdade para extrair) | Botão **Exportar .xlsx** da lista filtrada (pagar, receber) |

## G. Equipe e Controle de Advogados

| # | Problema | Impacto | Solução |
|---|----------|---------|---------|
| G1 | **CRÍTICO: membro criado não consegue logar** — o cadastro de equipe não define usuário/senha | Estagiária cadastrada hoje não tem acesso | Ação "Definir acesso" no membro: admin define login + senha inicial (e pode redefinir depois) |

## H. Comunicação entre Advogados

| # | Problema | Impacto | Solução |
|---|----------|---------|---------|
| H1 | Só há comentários dentro de processos/tarefas; nenhum canal geral | Comunicados do escritório dependem de WhatsApp | **Mural de Recados** no Painel: qualquer membro publica, autor/sócios excluem, com fixar recado |

## I. Atendimento

| # | Problema | Impacto | Solução |
|---|----------|---------|---------|
| I1 | Lista sem busca nem filtro por status | Triagem lenta quando a lista crescer | Busca + filtro de status |

---

## Estratégia de execução

- **Diagnóstico, estratégia e plano:** Fable 5 (este documento).
- **Operacional:** Opus 4.8, em 2 lotes sequenciais, cada um com typecheck + build limpos antes de encerrar.
  - **Lote 1 — Fundação UX + fluxo diário:** A1, A2, A3, A4, A5, G1.
  - **Lote 2 — Módulos:** B1–B4, C1–C4, D1, E1–E3, F1–F3, H1, I1.
- **Fechamento:** verificação em preview, commit, push, deploy Vercel, relatório final ao usuário.

Nenhuma funcionalidade existente é removida; tudo é aditivo ou reorganização visual. Rollback integral disponível pelo ponto de restauração acima.
