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

- [~] **A2. `javascript:` não bloqueado em `meetingUrl`/`tribunalLink`** (Achado F5)
  Arquivos: `lib/urlSafety.ts` (novo helper `sanitizeExternalUrl`), `lib/actions/tasks.ts:113,199,420`,
  `lib/actions/cases.ts:269,385,600,746`, `components/AgendaView.tsx:727`,
  `app/(app)/processos/[id]/page.tsx:487`, `app/m/processos/[id]/page.tsx:428`
  Feito: protocolo validado (só `http:`/`https:`) ao salvar nas Server Actions, e de novo na
  renderização dos 3 pontos que exibem o link como `<a href>` (desktop + mobile).
  **Ainda pendente:** auditar os registros que já existem no banco de produção — esta sessão
  não tem acesso a `DATABASE_URL` para rodar essa checagem. Rodar, com acesso ao banco:
  ```sql
  SELECT id, "meetingUrl" FROM "Task" WHERE "meetingUrl" IS NOT NULL AND "meetingUrl" NOT ILIKE 'http%';
  SELECT id, "tribunalLink" FROM "Case" WHERE "tribunalLink" IS NOT NULL AND "tribunalLink" NOT ILIKE 'http%';
  ```
  Qualquer linha aqui já está neutralizada na tela (defesa em profundidade), mas vale limpar o
  dado na origem.

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

- [ ] **C1. Padronizar "fail-closed" como regra para todo webhook/integração externa nova**
  Documentar (README ou CLAUDE.md) o padrão já usado corretamente por `CRON_SECRET` e
  `ASAAS_WEBHOOK_TOKEN`, e linkar o Achado F2 como o contraexemplo do que não fazer.

- [ ] **C2. Checagem automatizada para `dangerouslySetInnerHTML` novo**
  Adicionar um lint/CI check que sinalize qualquer ocorrência nova para revisão manual — hoje
  só existem 4 no projeto inteiro, vale manter esse número baixo e sempre revisado.

- [ ] **C3. Gerenciador de senhas dedicado para os segredos reais do projeto**
  Decidido em 01/09/2026: os segredos reais (chaves, tokens, senha de banco) passam a viver só
  no gerenciador de senhas do escritório (1Password/Bitwarden), nunca em arquivo de texto no
  disco ou no git. Ver `docs/vault-chaves/README.md` para a estrutura de categorias e o modelo
  de importação (sem nenhum valor real).

- [ ] **C4. Nunca commitar segredo real em nenhum arquivo do repositório**
  Reforçar isso como regra explícita de revisão de PR (mesmo em arquivo aparentemente
  inofensivo — foi assim que o Achado F3 aconteceu). `.env`, `.env.local` e
  `docs/vault-chaves/.venv` (ou qualquer arquivo com valor real) sempre no `.gitignore`.

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
