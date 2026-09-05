# Plano de Remediação de Segurança — Lúmen

Decorrente do `relatorio-auditoria-seguranca.pdf` (01/09/2026). Este documento é a versão
"para ir marcando" do mesmo conteúdo — os achados completos (trecho de código, exploração,
condições) estão no PDF; aqui é só o plano de ação, item por item, por fase.

Convenção de status: `[ ]` pendente · `[~]` em andamento · `[x]` concluído.

---

## Fase A — Esta semana (achados de severidade Alta)

- [x] **A1. Webhook do WhatsApp aceita requisição não autenticada sem `WHATSAPP_APP_SECRET`** (Achado F2)
  Arquivo: `lib/whatsapp.ts:148-150`
  Feito: `verifySignature()` agora é fail-closed (recusa quando o secret está ausente, igual ao
  webhook do Asaas). `.env.example` atualizado para deixar claro que a variável não é opcional
  em produção assim que o módulo WhatsApp estiver ativo em algum escritório.

- [x] **A2. `javascript:` não bloqueado em `meetingUrl`/`tribunalLink`** (Achado F5)
  Arquivos: `lib/urlSafety.ts` (novo helper `sanitizeExternalUrl`), `lib/actions/tasks.ts:113,199,420`,
  `lib/actions/cases.ts:269,385,600,746`, `components/AgendaView.tsx:727`,
  `app/(app)/processos/[id]/page.tsx:487`, `app/m/processos/[id]/page.tsx:428`
  Feito: protocolo validado (só `http:`/`https:`) ao salvar nas Server Actions, e de novo na
  renderização dos 3 pontos que exibem o link como `<a href>` (desktop + mobile).
  **Banco de produção auditado em 01/09/2026** (Neon Console, pelo Rodrigo): as duas consultas
  abaixo retornaram 0 linhas — nenhum `meetingUrl`/`tribunalLink` fora do padrão `http(s)` já
  gravado. Nada a limpar na origem.
  ```sql
  SELECT id, "meetingUrl" FROM "Task" WHERE "meetingUrl" IS NOT NULL AND "meetingUrl" NOT ILIKE 'http%';
  SELECT id, "tribunalLink" FROM "Case" WHERE "tribunalLink" IS NOT NULL AND "tribunalLink" NOT ILIKE 'http%';
  ```

- [~] **A3. Senhas reais em texto puro em `prisma/seed.ts`** (Achado F3)
  Arquivo: `prisma/seed.ts`
  Feito: o seed gera uma senha aleatória por execução (nunca mais fixa) e imprime no console ao
  final — nada persistido em arquivo.
  **Ainda pendente (ação manual, fora do que dá para automatizar por aqui):** rotacionar em
  produção as senhas reais das contas de Jairo e Rodrigo, já que a senha antiga conviveu em
  texto puro com o hash no histórico do git. Pelo próprio Lúmen: Configurações → Equipe → botão
  de link de redefinição de senha, para cada uma das duas contas.

---

## Fase B — Próximas duas semanas

- [x] **B1. Conteúdo de usuário sem escape em e-mails HTML** (Achado F4)
  Arquivos: `lib/htmlEscape.ts` (novo helper `escapeHtml`), `lib/email.ts` (`digestSection`,
  `digestFinanceSection`, `buildDailyAgendaHtml`), `lib/notificationOutboxDrain.ts`,
  `lib/emailTemplateRender.ts` (`renderTemplateBody`, `buildDigestEmailHtml`)
  Feito: todo texto livre de usuário que entra nesses templates (comentários/menções, título/
  descrição de tarefa, nome de cliente, conteúdo de publicação, variáveis `{{teor}}`/`{{cliente}}`/
  `{{prazo}}` dos comunicados) passa a ser escapado antes de virar HTML. O HTML do próprio
  template (`EmailTemplate.bodyHtml`, autoria do admin no editor) continua intocado — só as
  variáveis que entram nele.

- [x] **B2. Rota de foto de perfil sem exigir sessão** (Achado F1)
  Arquivo: `app/api/perfil/foto/[userId]/route.ts:10-16`
  Feito: exige `getCurrentUser()` no início do handler (401 se ausente).

---

## Fase C — Antes de ir ao mercado / disciplina contínua

- [x] **C1. Padronizar "fail-closed" como regra para todo webhook/integração externa nova**
  Feito: seção nova em `CLAUDE.md` documentando o padrão correto (`CRON_SECRET`,
  `ASAAS_WEBHOOK_TOKEN`) e o Achado F2 como contraexemplo já corrigido — vale para toda
  integração externa nova, não só as que já existem.

- [x] **C2. Checagem automatizada para `dangerouslySetInnerHTML` novo**
  Feito: `react/no-danger` como `"warn"` em `.eslintrc.json`. As 4 ocorrências existentes
  (revisadas e legítimas) têm `eslint-disable-next-line react/no-danger` com o motivo ao lado;
  qualquer ocorrência nova sem esse comentário aparece no lint.

- [x] **C3. Gerenciador de senhas dedicado para os segredos reais do projeto**
  Feito em 01/09/2026: os segredos reais (chaves, tokens, senha de banco) passam a viver só no
  gerenciador de senhas do escritório (1Password/Bitwarden), nunca em arquivo de texto no disco
  ou no git. Ver `docs/vault-chaves/README.md` para a estrutura de categorias e o modelo de
  importação (sem nenhum valor real).

- [x] **C4. Nunca commitar segredo real em nenhum arquivo do repositório**
  Feito: seção nova em `CLAUDE.md` fixando essa regra para revisão de PR, com o Achado F3 como
  o exemplo do que dá errado sem ela. `.env`, `.env.local` e `docs/security-audit/.venv/` já
  estão no `.gitignore`.

**Fase C concluída — as 3 fases do plano estão 100% resolvidas no código/documentação.**
Da Fase A, a auditoria do banco de produção (A2) já foi feita e confirmou dado limpo. Resta só a
rotação das senhas reais de Jairo/Rodrigo (A3), ação manual que depende de acesso que esta sessão
não tem.

---

## Fora do plano original — corrigido durante a Fase D

- [x] **D1. Sócio/admin sem opção de editar os próprios dados básicos**
  Arquivo: `components/UserRow.tsx`
  Achado ao tentar trocar o e-mail de login do Rodrigo (Configurações → Equipe): o botão
  "Editar" (nome/e-mail/OAB/telefone) estava dentro do mesmo bloco condicional
  `canManage && !user.isAdmin` que Credenciais/Financeiro/Inativar/Excluir — restrição correta
  para essas quatro ações (anti-bloqueio entre admins), mas que também escondia a edição básica,
  reversível e não destrutiva. O backend (`updateUser`, `lib/actions/settings.ts`) já permitia a
  edição para qualquer usuário do escritório; era só a UI que bloqueava.
  Feito: "Editar" passa a ficar em bloco próprio, sob `canManage` isoladamente (PR #117).

---

## Achados x Fase (referência rápida)

| Achado | Severidade | Fase | Descrição curta |
|---|---|---|---|
| F2 | Alta | A | Webhook WhatsApp fail-open sem secret |
| F5 | Alta | A | `javascript:` em meetingUrl/tribunalLink |
| F3 | Alta | A | Senhas reais em `prisma/seed.ts` |
| F4 | Média | B | HTML sem escape em e-mails |
| F1 | Baixa | B | Foto de perfil sem sessão |
| — | — | C | Disciplina contínua / go-to-market |

Relatório completo com evidência linha a linha: `docs/security-audit/relatorio-auditoria-seguranca.pdf`.
Para regenerar o PDF depois de atualizar achados: `docs/security-audit/.venv/bin/python docs/security-audit/gerar_relatorio.py`.

---

## Rodada 2 — 05/09/2026 (framework de 15 leis, zero-trust)

Auditoria SEPARADA da acima — não a substitui. Metodologia: 6 agentes de auditoria
independentes, um por camada (identidade/autorização, Server Actions/dados, integrações
externas/SSRF, segredos/config/headers, código novo desta sessão, corridas no financeiro),
achados cruzados e consolidados manualmente. Relatório completo (exploração, PoC, código
corrigido proposto, testes): `docs/security-audit/relatorio-auditoria-seguranca-2026-09.pdf`.
Regenerar com `docs/security-audit/.venv/bin/python docs/security-audit/gerar_relatorio_2026-09.py`.

**Nenhuma correção da Rodada 2 foi aplicada ainda — aguardando validação do dono do projeto.**

- [ ] **V1 (Alta).** Corrida de pagamento duplicado em `markPayablePaid`/`markReceivablePaid`/
  `markManyPayablesPaid`/`markManyReceivablesPaid` (`lib/actions/financeiro.ts`) e
  `markHonorarioPaid` (`lib/actions/assessoria.ts`) — sem lock de linha/transação, duas chamadas
  concorrentes duplicam o `FinancePayment`.
- [ ] **V2 (Alta).** `updateCase` (`lib/actions/cases.ts`) grava `caseValue`/`convictionValue`/
  `economicBenefitValue` (bases do honorário percentual) sem exigir `financeAccess` nem
  registrar quem alterou.
- [ ] **V3 (Alta).** Fluxo OAuth do BTG (`app/api/btg/callback`, `app/api/btg/connect`,
  `lib/btg.ts`) sem `verifyAndConsumeOAuthState` — as outras 3 integrações OAuth (Google/
  Microsoft/Dropbox) já usam desde o achado A61; BTG foi adicionado depois e ficou de fora.
- [ ] **V4 (Alta).** Dependência `xlsx` travada em `0.18.5` (npm nunca recebeu correção de
  Prototype Pollution/ReDoS) — trocar pela distribuição do CDN da SheetJS ou migrar para
  `exceljs`.
- [ ] **V5 (Alta).** Nenhum header de segurança configurado (`next.config.mjs` vazio) — sem CSP,
  X-Frame-Options, HSTS, X-Content-Type-Options.
- [ ] **V6 (Alta).** `app/api/admin/migrate-legacy/route.ts` sem checagem de sessão (só
  `MIGRATION_SECRET` via query string) e com `error.message` cru na resposta.
- [ ] **V7 (Média).** `delegateTask`/`submitPublicationDistribution` sem compare-and-swap em
  `Publication.assignedToId` — mesma publicação pode ser atribuída duas vezes.
- [ ] **V8 (Média).** Sem paginação em Processos/Clientes/`globalSearch` — leitura completa do
  tenant a cada render/tecla.
- [ ] **V9 (Média).** `sanitizeRichTextHtml` (`lib/richText.ts`) é regex artesanal, não um parser
  real — trocar por `isomorphic-dompurify` como defesa em profundidade (nenhum bypass
  confirmado, mas classe de solução frágil).
- [ ] **V10 (Média).** `syncReceivableStatus`/`ensureRecurringFeeReceivables`/
  `ensureRecurringExpensePayables` (`lib/actions/financeiro.ts`) e
  `autoResolvePendenciasForAttachment` (`lib/actions/attendancePendencias.ts`) aceitam `officeId`
  cru em vez de derivar da sessão — violação estrutural da Lei 5, sem exploração comprovada hoje.
- [ ] **V11 (Baixa).** `apurarHonorario` (`lib/actions/apuracao.ts`) não-transacional no caminho
  de sucesso — corrida possível, mas sem duplicar dinheiro (só a tarefa de lembrete).
- [ ] **V12 (Baixa).** Upload de foto (`app/api/photos/upload`, `app/api/perfil/foto/upload`)
  confia só no MIME declarado pelo cliente — restringir a PNG/JPEG/WEBP.
- [ ] **V13 (Baixa).** `app/api/photos/file/[id]/route.ts` serve qualquer foto sem checar sessão/
  officeId — vazamento cross-tenant de imagens decorativas (sem PII).
