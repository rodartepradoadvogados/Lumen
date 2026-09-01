# Plano de Remediação de Segurança — Lúmen

Decorrente do `relatorio-auditoria-seguranca.pdf` (01/09/2026). Este documento é a versão
"para ir marcando" do mesmo conteúdo — os achados completos (trecho de código, exploração,
condições) estão no PDF; aqui é só o plano de ação, item por item, por fase.

Convenção de status: `[ ]` pendente · `[~]` em andamento · `[x]` concluído.

---

## Fase A — Esta semana (achados de severidade Alta)

- [ ] **A1. Webhook do WhatsApp aceita requisição não autenticada sem `WHATSAPP_APP_SECRET`** (Achado F2)
  Arquivo: `lib/whatsapp.ts:148-150`
  Ação: inverter `verifySignature()` para fail-closed (recusar quando o secret estiver ausente,
  igual ao webhook do Asaas). Atualizar `.env.example` para não descrever a variável como
  "opcional" sem ressalva.

- [ ] **A2. `javascript:` não bloqueado em `meetingUrl`/`tribunalLink`** (Achado F5)
  Arquivos: `lib/actions/tasks.ts:113,199,420`, `lib/actions/cases.ts:269,385,600,746`,
  `components/AgendaView.tsx:727`, `app/(app)/processos/[id]/page.tsx:487`
  Ação: validar protocolo (só `http:`/`https:`) ao salvar essas Server Actions; como defesa
  extra, validar de novo antes de renderizar o `<a href>`. Rodar uma migração de dado para
  identificar/limpar registros já existentes com protocolo inseguro.

- [ ] **A3. Senhas reais em texto puro em `prisma/seed.ts`** (Achado F3)
  Arquivo: `prisma/seed.ts:43-68`
  Ação: trocar a senha fixa por uma gerada aleatoriamente (ou lida de env var só de dev) a cada
  execução do seed. Rotacionar, em produção, as senhas reais das contas de Jairo e Rodrigo como
  precaução — o hash convive com a senha em claro no mesmo repositório desde sempre.

---

## Fase B — Próximas duas semanas

- [ ] **B1. Conteúdo de usuário sem escape em e-mails HTML** (Achado F4)
  Arquivos: `lib/email.ts:536-541`, `lib/actions/tasks.ts:452` (`addComment`),
  `lib/notificationOutboxDrain.ts:30-33`, `lib/comunicadosVarredura.ts`
  Ação: criar um helper `escapeHtml()` central e aplicá-lo a todo texto livre de usuário antes
  de entrar em template de e-mail (comentários/menções, título/descrição de tarefa, nome de
  cliente).

- [ ] **B2. Rota de foto de perfil sem exigir sessão** (Achado F1)
  Arquivo: `app/api/perfil/foto/[userId]/route.ts:10-16`
  Ação: exigir `getCurrentUser()` no início do handler (401 se ausente). Não precisa checar
  `officeId` — só sessão válida.

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
