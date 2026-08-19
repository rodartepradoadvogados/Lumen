# 05 — Publicações

Referência: slide 14 do deck; wireframe `1g`. Arquivos: `app/(app)/publicacoes/page.tsx`,
`components/PublicationsList.tsx`, `components/PublicationRow.tsx`.

## O conceito

A publicação deixa de ser um item de lista e passa a ser **uma decisão**: virar tarefa com
prazo, vincular a processo, delegar ou arquivar. Tudo sem sair da tela.

## Layout

Duas colunas, altura total: fila (560px, borda direita 2px `--regua-forte`) e teor.

### Cabeçalho (borda inferior 2px)

"Publicações" (26px/800) + chips de filtro, raio 0:

| Chip | Conteúdo |
| --- | --- |
| Não triadas · {n} | ativo por padrão; fundo `--acao`, texto `--acao-tx` |
| Minhas | responsável = usuário |
| Sem processo · {n} | `caseId == null` — a fila que mais dá problema |
| Arquivadas | |

À direita, 13px `--tx-2`: "DJEN {hora} · Datajud {hora}" + "sincronizar"
(`SyncPublicationsButton`).

### Fila

Cada cartão, separado por 1px `--regua`, **filete esquerdo de 4px pela fonte** — mantém a
tabela §9 do manual, que já está certa no código:

`DJE` `--acao` · `PJE` `#2f6fb0` · `ESAJ` `--aviso` · `PROJUDI` `--tx-2` ·
`MANUAL` `--vinho` · `JUSBRASIL_EMAIL` `--concluido` · desconhecida `--regua-forte`

Conteúdo: fonte + tribunal (10px caixa alta `.12em` `--tx-2`), data à direita, duas
linhas de teor truncado, e o processo vinculado em 13px/800. Sem vínculo, um chip
"sem processo vinculado" em `--aviso-bg`/`--aviso`.

**A alternância de fundo `.pub-card-a`/`.pub-card-b` sai inteira** (branco e palha). Todos
os cartões usam `--sf-superficie`; o ritmo vem da régua.

### Teor

- Cabeçalho: fonte · tribunal · vara · data (rótulo 10px caixa alta), nome das partes
  (26px/800), número do processo + **prazo sugerido calculado** ("15 dias úteis →
  09/09/2026", usando `HolidaysManager`)
- Corpo: teor integral, 15px/1.6, largura máxima 80ch
- Barra de ações fixa no pé, borda superior 2px:
  **Criar tarefa com prazo** (primário) · Vincular a processo · Delegar · Arquivar (texto)
- À direita da barra, 13px `--tx-3`: "J / K navega · Enter cria tarefa · A arquiva"

### Teclado

`J`/`K` ou `↑`/`↓` percorrem a fila; `Enter` abre o modal de tarefa já preenchido
(processo, prazo sugerido, tipo Prazo, responsável = o do processo); `V` vincula;
`A` arquiva e pula para a seguinte; `Esc` sai. Triar cinquenta publicações precisa ser
possível sem tocar o mouse — é o trabalho de segunda-feira de manhã.

## Aceite

- [ ] Triar uma publicação inteira sem sair da rota
- [ ] Filete por fonte usa os valores reais do enum `Publication.source`
- [ ] Prazo sugerido considera feriados cadastrados
- [ ] A alternância de fundo palha não existe mais
- [ ] Os atalhos funcionam e estão visíveis na tela
