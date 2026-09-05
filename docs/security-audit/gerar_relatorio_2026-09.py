#!/usr/bin/env python3
"""Gera o Relatório de Auditoria de Segurança Zero-Trust — Lúmen (rodada 2, set/2026).

Uso:
    docs/security-audit/.venv/bin/python docs/security-audit/gerar_relatorio_2026-09.py

Esta é uma auditoria SEPARADA da de 01/09/2026 (relatorio-auditoria-seguranca.pdf) — não a
substitui nem a sobrescreve. Reaproveita os estilos/paleta/capa do script original
(gerar_relatorio.py, mesmo diretório) por import direto, para manter a identidade visual dos
relatórios do projeto consistente entre rodadas.

NENHUMA correção deste relatório foi aplicada ao código ainda — Fase 2 (código corrigido) e
Fase 3 (testes) são PROPOSTAS para validação, não commits.
"""

import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image,
    PageBreak, KeepTogether, HRFlowable, ListFlowable, ListItem,
)

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from gerar_relatorio import (  # noqa: E402  (import após sys.path.insert, de propósito)
    COR_CRITICA, COR_ALTA, COR_MEDIA, COR_BAIXA, COR_PONTO_FORTE,
    COR_TEXTO, COR_TEXTO_2, COR_LINHA, COR_FUNDO_CAPA,
    SEV_COLOR, SEV_ORDER, esc, build_styles, on_page_cover, on_page_normal,
    sev_chip, MARGIN, PAGE_W, PAGE_H,
)

OUT_PDF = os.path.join(HERE, "relatorio-auditoria-seguranca-2026-09.pdf")
CHART_DONUT = os.path.join(HERE, "_chart_donut_2.png")
CHART_BARS = os.path.join(HERE, "_chart_bars_2.png")

REPORT_NAME = "Relatório de Auditoria de Segurança Zero-Trust — Lúmen (rodada 2)"
PROJECT_NAME = "Lúmen"
REPO = "rodartepradoadvogados/lumen"
AUDIT_DATE = "05 de setembro de 2026"
PREV_AUDIT_DATE = "01 de setembro de 2026"

# ---------------------------------------------------------------------------
# Achados (13 confirmados — cada um lido diretamente no código atual)
# ---------------------------------------------------------------------------
CAT_LABELS = [
    "1. Corrida financeira",
    "2. Autorização",
    "3. Integrações externas",
    "4. Infra & Config",
    "5. Entrada & Upload",
    "6. Exposição de dados",
]

FINDINGS = [
    {
        "id": "V1",
        "categoria": "1. Corrida financeira",
        "severidade": "Alta",
        "arquivo": "lib/actions/financeiro.ts:282-419 (markPayablePaid, markReceivablePaid, markManyPayablesPaid, markManyReceivablesPaid) + lib/actions/assessoria.ts:550-563 (markHonorarioPaid)",
        "titulo": "Dar baixa (individual e em bloco) sem trava de corrida — pagamento pode ser contado em dobro",
        "descricao": (
            "Cada baixa cria um novo FinancePayment sem verificar se a conta já foi quitada e sem "
            "transação nem lock de linha. Duas chamadas concorrentes (duplo clique, duas abas, retry "
            "de rede, dois usuários na mesma tela) para a mesma conta passam ambas pela checagem, "
            "ambas criam um FinancePayment, e o valor pago é somado em dobro pelo recálculo de status "
            "(syncPayableStatus/syncReceivableStatus). FinancePayment não tem nenhuma constraint única "
            "que impeça a duplicata."
        ),
        "trecho": (
            "export async function markPayablePaid(id: string, paidAmount: number, paidDate: string, ...) {\n"
            "  const officeId = await requireFinanceOfficeId();\n"
            "  const existing = await prisma.payable.findFirst({ where: { id, officeId }, select: { id: true, caseId: true } });\n"
            "  if (!existing) throw new Error(\"Conta a pagar não encontrada.\");\n"
            "  // nenhuma checagem de status/saldo aqui\n"
            "  await prisma.financePayment.create({ data: { officeId, amount: paidAmount, ..., payableId: id } });\n"
            "  await syncPayableStatus(id, officeId);\n"
            "  ...\n"
            "}"
        ),
        "exploracao": (
            "Duas requisições markPayablePaid(id, 5000, ...) disparadas com poucos milissegundos de "
            "diferença (duas abas abertas na mesma conta, ou um clique duplo que o React ainda não "
            "desabilitou) passam as duas pelo findFirst antes de qualquer uma escrever. Resultado: dois "
            "FinancePayment de R$5000 no lugar de um — a conta aparece paga com R$10000, e esse valor "
            "duplicado entra direto no Livro Caixa, DRE e Fluxo de Caixa (que somam FinancePayment, não "
            "o campo legado paidAmount). O mesmo vale para markManyPayablesPaid/markManyReceivablesPaid "
            "(o \"Dar baixa em bloco\"): o saldo de cada item é calculado uma vez, antes do loop, então "
            "duas chamadas do lote inteiro se sobrepondo duplicam a baixa de cada conta selecionada."
        ),
        "condicoes": "Nenhuma condição especial — duplo clique, duas abas abertas na mesma conta, ou uma requisição HTTP repetida (retry de rede) já é suficiente. Não exige nenhum privilégio além do acesso normal ao Financeiro.",
        "correcao": (
            "Serializar a baixa por linha com um lock explícito (SELECT ... FOR UPDATE) dentro de uma "
            "transação, recalcular o saldo já dentro do lock, e recusar uma baixa que ultrapasse o "
            "saldo em aberto — assim a segunda chamada concorrente vê o estado já atualizado pela "
            "primeira e é rejeitada em vez de duplicar."
        ),
        "correcao_codigo": (
            "// financeiro.ts — markPayablePaid corrigido (mesmo padrão para markReceivablePaid).\n"
            "// [SEGURANÇA] [V1]: lock de linha + saldo recalculado dentro da transação — impede que\n"
            "// duas chamadas concorrentes leiam o mesmo saldo \"em aberto\" e criem dois pagamentos.\n"
            "export async function markPayablePaid(id: string, paidAmount: number, paidDate: string, receiptNumber?: string, paymentMethod?: string, bankAccountId?: string) {\n"
            "  const officeId = await requireFinanceOfficeId();\n"
            "  if (bankAccountId) await assertFinanceRelationsInOffice({ bankAccountId }, officeId);\n\n"
            "  await prisma.$transaction(async (tx) => {\n"
            "    // [SEGURANÇA] Lock pessimista: nenhuma outra transação lê/escreve esta linha até esta commitar.\n"
            "    const locked = await tx.$queryRaw<{ id: string; caseId: string | null; amount: number; discount: number; surcharge: number }[]>`\n"
            "      SELECT id, \"caseId\", amount, discount, surcharge FROM \"Payable\"\n"
            "      WHERE id = ${id} AND \"officeId\" = ${officeId}\n"
            "      FOR UPDATE\n"
            "    `;\n"
            "    const payable = locked[0];\n"
            "    if (!payable) throw new Error(\"Conta a pagar não encontrada.\");\n\n"
            "    const pagos = await tx.financePayment.aggregate({ where: { payableId: id }, _sum: { amount: true } });\n"
            "    const soma = pagos._sum.amount ?? 0;\n"
            "    const saldo = valorLiquido(payable.amount, payable.discount, payable.surcharge) - soma;\n"
            "    // [SEGURANÇA] [V1]: uma segunda chamada concorrente (ou um retry) já vê saldo <= 0\n"
            "    // aqui, porque a primeira já commitou dentro do lock — recusa em vez de duplicar.\n"
            "    if (saldo <= 0.005) throw new Error(\"Este lançamento já foi quitado (baixa duplicada recusada).\");\n"
            "    if (paidAmount > saldo + 0.005) throw new Error(`Valor informado (${paidAmount}) é maior que o saldo em aberto (${saldo.toFixed(2)}).`);\n\n"
            "    await tx.financePayment.create({\n"
            "      data: { officeId, amount: paidAmount, paidDate: new Date(paidDate), paymentMethod: paymentMethod || null, documentNumber: receiptNumber || null, bankAccountId: bankAccountId || null, payableId: id },\n"
            "    });\n"
            "    await syncPayableStatus(id, officeId, tx); // syncPayableStatus precisa aceitar `tx` opcional\n"
            "    revalidateCase(payable.caseId);\n"
            "  });\n"
            "  revalidateFinance();\n"
            "}\n\n"
            "// markManyPayablesPaid/markManyReceivablesPaid: aplicar o MESMO lock por item, dentro do\n"
            "// loop existente (envolver cada iteração num prisma.$transaction com o SELECT ... FOR UPDATE\n"
            "// acima) em vez de ler `items` uma vez fora do loop."
        ),
        "teste": (
            "// tests/financeiro.race.test.ts (vitest — instalar vitest + @vitest/... antes de rodar)\n"
            "test(\"VULN-1: duas baixas concorrentes na mesma conta não duplicam o pagamento\", async () => {\n"
            "  const payable = await criarPayableDeTeste({ amount: 5000 });\n"
            "  const [r1, r2] = await Promise.allSettled([\n"
            "    markPayablePaid(payable.id, 5000, \"2026-09-05\"),\n"
            "    markPayablePaid(payable.id, 5000, \"2026-09-05\"),\n"
            "  ]);\n"
            "  const sucesso = [r1, r2].filter((r) => r.status === \"fulfilled\").length;\n"
            "  expect(sucesso).toBe(1); // só uma das duas deve ter sido aceita\n"
            "  const pagamentos = await prisma.financePayment.findMany({ where: { payableId: payable.id } });\n"
            "  const total = pagamentos.reduce((s, p) => s + p.amount, 0);\n"
            "  expect(total).toBe(5000); // nunca 10000\n"
            "});"
        ),
    },
    {
        "id": "V2",
        "categoria": "2. Autorização",
        "severidade": "Alta",
        "arquivo": "lib/actions/cases.ts:288-382 (updateCase)",
        "titulo": "updateCase permite que qualquer usuário do escritório altere os valores-base do honorário percentual, sem gate financeiro nem auditoria",
        "descricao": (
            "caseValue, convictionValue e economicBenefitValue — exatamente os campos que "
            "createHonorarioLancamento usa como \"base\" para calcular quanto o cliente deve pagar num "
            "honorário percentual — são graváveis por updateCase com a única checagem sendo "
            "getCurrentUser() (login válido). Não existe nenhum requireFinanceAccess()/checagem de "
            "role específica para Processo, e nenhum registro de quem mudou o valor nem quando — "
            "diferente do fluxo correto (apurarHonorario, lib/actions/apuracao.ts), que exige acesso "
            "financeiro e grava apuradoEm/apuradoPorId."
        ),
        "trecho": (
            "export async function updateCase(caseId: string, data: { ...; caseValue?: string; convictionValue?: string; economicBenefitValue?: string; ... }) {\n"
            "  const viewer = await getCurrentUser(); // só verifica login, não financeAccess\n"
            "  if (!viewer) return { error: \"Sessão inválida.\" };\n"
            "  const existing = await prisma.case.findFirst({ where: { id: caseId, officeId: viewer.officeId }, ... });\n"
            "  ...\n"
            "  await prisma.case.update({ where: { id: caseId }, data: {\n"
            "    caseValue: data.caseValue ? parseFloat(data.caseValue) : null,\n"
            "    convictionValue: data.convictionValue ? parseFloat(data.convictionValue) : null,\n"
            "    economicBenefitValue: data.economicBenefitValue ? parseFloat(data.economicBenefitValue) : null,\n"
            "    ...\n"
            "  }});\n"
            "}"
        ),
        "exploracao": (
            "Um estagiário ou advogado sem financeAccess, com permissão normal de editar o cadastro do "
            "processo, define convictionValue: \"999999\" num caso que tem (ou terá) honorário "
            "sucumbencial percentual. Quando o financeiro rodar apurarHonorario/"
            "createHonorarioLancamento, o valor cobrado do cliente é calculado sobre um número que "
            "essa pessoa inventou — sem que financeAccess/apuradoPorId tenham entrado em nenhum "
            "momento na jogada."
        ),
        "condicoes": "Qualquer usuário ativo do escritório com acesso normal à edição de Processo (não precisa de financeAccess nem isAdmin).",
        "correcao": (
            "Bloquear a gravação desses três campos em updateCase para quem não tem financeAccess (ou "
            "exigi-la só quando esses campos vierem alterados em relação ao valor atual), e registrar "
            "quem alterou — reaproveitando o padrão já existente em apurarHonorario."
        ),
        "correcao_codigo": (
            "// cases.ts — updateCase corrigido (trecho da função, resto inalterado)\n"
            "export async function updateCase(caseId: string, data: { ...; caseValue?: string; convictionValue?: string; economicBenefitValue?: string; ... }) {\n"
            "  const viewer = await getCurrentUser();\n"
            "  if (!viewer) return { error: \"Sessão inválida.\" };\n"
            "  const existing = await prisma.case.findFirst({ where: { id: caseId, officeId: viewer.officeId }, select: { caseValue: true, convictionValue: true, economicBenefitValue: true, ... } });\n"
            "  if (!existing) return { error: \"Processo não encontrado.\" };\n\n"
            "  // [SEGURANÇA] [V2]: as 3 bases de cálculo de honorário só mudam de valor com acesso\n"
            "  // financeiro — evita que edição de cadastro vire canal indireto de fraude em cobrança.\n"
            "  const novoCaseValue = data.caseValue ? parseFloat(data.caseValue) : null;\n"
            "  const novoConvictionValue = data.convictionValue ? parseFloat(data.convictionValue) : null;\n"
            "  const novoEconomicBenefitValue = data.economicBenefitValue ? parseFloat(data.economicBenefitValue) : null;\n"
            "  const mudouBaseFinanceira =\n"
            "    novoCaseValue !== existing.caseValue ||\n"
            "    novoConvictionValue !== existing.convictionValue ||\n"
            "    novoEconomicBenefitValue !== existing.economicBenefitValue;\n"
            "  if (mudouBaseFinanceira && !(viewer.isAdmin || viewer.financeAccess)) {\n"
            "    return { error: \"Alterar valor da causa/condenação/proveito econômico exige acesso ao Financeiro.\" };\n"
            "  }\n\n"
            "  await prisma.case.update({ where: { id: caseId }, data: {\n"
            "    caseValue: novoCaseValue,\n"
            "    convictionValue: novoConvictionValue,\n"
            "    economicBenefitValue: novoEconomicBenefitValue,\n"
            "    ...\n"
            "  }});\n"
            "  // [SEGURANÇA] Auditoria mínima — mesma tabela/padrão já usado por AccessAuditLog em outros pontos sensíveis.\n"
            "  if (mudouBaseFinanceira) {\n"
            "    await prisma.accessAuditLog.create({ data: { userId: viewer.id, officeId: viewer.officeId, action: \"CASE_FINANCIAL_BASE_UPDATE\", targetId: caseId } });\n"
            "  }\n"
            "  ...\n"
            "}"
        ),
        "teste": (
            "test(\"VULN-2: usuário sem financeAccess não consegue alterar valor de condenação do processo\", async () => {\n"
            "  const user = await criarUsuarioDeTeste({ isAdmin: false, financeAccess: false });\n"
            "  const kase = await criarCaseDeTeste({ convictionValue: 1000 });\n"
            "  const result = await asUser(user).updateCase(kase.id, { convictionValue: \"999999\" });\n"
            "  expect(result.error).toMatch(/Financeiro/);\n"
            "  const atual = await prisma.case.findUnique({ where: { id: kase.id } });\n"
            "  expect(atual?.convictionValue).toBe(1000); // não mudou\n"
            "});"
        ),
    },
    {
        "id": "V3",
        "categoria": "3. Integrações externas",
        "severidade": "Alta",
        "arquivo": "app/api/btg/callback/route.ts, app/api/btg/connect/route.ts, lib/btg.ts:53-90",
        "titulo": "Conexão OAuth com o BTG Empresas sem verificação de state — CSRF / injeção de código de autorização",
        "descricao": (
            "As outras três integrações OAuth do projeto (Google, Microsoft, Dropbox) usam "
            "lib/oauthState.ts (buildOAuthState/verifyAndConsumeOAuthState — um nonce em cookie "
            "httpOnly, corrigindo o achado A61 já documentado no próprio histórico do repositório). A "
            "integração com o BTG, adicionada depois, nunca recebeu essa correção: o \"state\" enviado "
            "ao BTG é só o id do usuário (não um nonce ligado à sessão), e o callback nem lê o "
            "parâmetro state da URL — só o code."
        ),
        "trecho": (
            "// lib/btg.ts\n"
            "export function getBtgAuthorizeUrl(state: string): string {\n"
            "  const params = new URLSearchParams({ ..., state }); // state = user.id, não um nonce\n"
            "}\n\n"
            "// app/api/btg/connect/route.ts\n"
            "return NextResponse.redirect(getBtgAuthorizeUrl(user.id));\n\n"
            "// app/api/btg/callback/route.ts — nunca lê searchParams.get(\"state\")\n"
            "const code = request.nextUrl.searchParams.get(\"code\");\n"
            "const result = await exchangeBtgCode(code);\n\n"
            "// exchangeBtgCode grava numa conexão ÚNICA para toda a plataforma:\n"
            "await prisma.btgConnection.deleteMany({});\n"
            "await prisma.btgConnection.create({ data: { accessToken, refreshToken, expiresAt } });"
        ),
        "exploracao": (
            "O atacante inicia o fluxo OAuth com a PRÓPRIA conta BTG (id.btgpactual.com, usando o "
            "client_id público do app registrado), captura o code que o BTG devolve para o navegador "
            "dele, e envia esse link para o platform owner (já logado): "
            "https://<lumen>/api/btg/callback?code=<code do atacante>. Como o callback já confirma "
            "isPlatformOwner mas não confirma que o code pertence à MESMA sessão que iniciou o fluxo "
            "(sem state, sem nonce), ao clicar o admin faz o servidor trocar o code do atacante e "
            "sobrescrever a única conexão BTG da plataforma pela conta do atacante — a plataforma "
            "passaria a emitir boletos (e ler dados de boleto, escopo bank-slips.readonly) contra a "
            "conta bancária do atacante em vez da do escritório."
        ),
        "condicoes": "Exige que o platform owner esteja logado e clique no link malicioso (engenharia social/phishing de um único clique) — clássico \"login CSRF\"/OAuth code injection.",
        "correcao": "Aplicar exatamente o mesmo padrão já usado por Google/Microsoft/Dropbox: buildOAuthState/verifyAndConsumeOAuthState.",
        "correcao_codigo": (
            "// lib/btg.ts\n"
            "import { buildOAuthState } from \"@/lib/oauthState\"; // [SEGURANÇA] [V3]\n"
            "export function getBtgAuthorizeUrl(state: string): string {\n"
            "  const params = new URLSearchParams({ client_id: ..., response_type: \"code\", redirect_uri: redirectUri(), scope: \"...\", prompt: \"login\", state });\n"
            "  return `${AUTH_BASE}/oauth2/authorize?${params.toString()}`;\n"
            "}\n\n"
            "// app/api/btg/connect/route.ts\n"
            "// [SEGURANÇA] [V3]: state agora é um nonce em cookie httpOnly, não o id do usuário —\n"
            "// fecha a janela de CSRF/injeção de código que as outras 3 integrações OAuth já fecharam.\n"
            "return NextResponse.redirect(getBtgAuthorizeUrl(buildOAuthState(\"btg\")));\n\n"
            "// app/api/btg/callback/route.ts\n"
            "import { verifyAndConsumeOAuthState } from \"@/lib/oauthState\";\n"
            "export async function GET(request: NextRequest) {\n"
            "  const user = await getCurrentUser();\n"
            "  if (!user?.isPlatformOwner) return NextResponse.redirect(new URL(\"/painel\", request.url));\n\n"
            "  const state = request.nextUrl.searchParams.get(\"state\");\n"
            "  const verified = verifyAndConsumeOAuthState(state); // [SEGURANÇA] [V3]\n"
            "  if (!verified) return NextResponse.redirect(new URL(\"/painel-mestre?btg=erro&msg=state_invalido\", request.url));\n\n"
            "  const code = request.nextUrl.searchParams.get(\"code\");\n"
            "  ... // resto inalterado\n"
            "}"
        ),
        "teste": (
            "test(\"VULN-3: callback do BTG recusa quando o state não bate com o cookie da sessão\", async () => {\n"
            "  const res = await fetch(\"/api/btg/callback?code=codigo-do-atacante&state=btg:nonce-forjado\", {\n"
            "    headers: { cookie: sessionCookiePlatformOwner }, // sem o cookie lumen-oauth-state correspondente\n"
            "  });\n"
            "  expect(res.url).toMatch(/btg=erro/);\n"
            "  const conn = await prisma.btgConnection.findFirst();\n"
            "  expect(conn?.accessToken).not.toBe(\"token-do-atacante\");\n"
            "});"
        ),
    },
    {
        "id": "V4",
        "categoria": "3. Integrações externas",
        "severidade": "Alta",
        "arquivo": "package.json:35 (\"xlsx\": \"^0.18.5\"), lib/importers/parse.ts:5-9",
        "titulo": "Dependência xlsx (SheetJS) travada numa versão com Prototype Pollution e ReDoS conhecidos, sem correção disponível via npm",
        "descricao": (
            "A distribuição do pacote xlsx no npm nunca passou da versão 0.18.5 — a SheetJS moveu a "
            "distribuição para o CDN próprio depois disso. Essa versão é anterior às correções de "
            "Prototype Pollution (GHSA-4r6h-8v6p-xvw6) e ReDoS (GHSA-5pgg-2g8v-p4x9). O código chama "
            "XLSX.read diretamente sobre o conteúdo de um arquivo enviado pelo usuário."
        ),
        "trecho": (
            "// package.json\n\"xlsx\": \"^0.18.5\",\n\n"
            "// lib/importers/parse.ts\n"
            "export async function parseSpreadsheet(file: File): Promise<Row[]> {\n"
            "  const buffer = await file.arrayBuffer();\n"
            "  const wb = XLSX.read(buffer, { type: \"array\", cellDates: false }); // conteúdo não confiável\n"
            "  ...\n"
            "}"
        ),
        "exploracao": (
            "Alcançável por importCases/importFinance/importAgenda (lib/actions/import.ts), gated por "
            "isAdmin/financeAccess — ou seja, exige uma conta admin/financeiro comprometida ou um "
            "insider malicioso, não um estranho. Essa conta faz upload de uma planilha .xlsx/.xls "
            "malformada especificamente construída para disparar o ReDoS conhecido (trava o processo "
            "Node servindo TODOS os escritórios da plataforma) ou o Prototype Pollution."
        ),
        "condicoes": "Requer uma conta com isAdmin ou financeAccess (phishing, credencial vazada, ou insider).",
        "correcao": "Trocar para a distribuição corrigida via CDN da própria SheetJS, ou migrar para exceljs.",
        "correcao_codigo": (
            "# [SEGURANÇA] [V4]: remove a versão travada do npm, instala a distribuição corrigida\n"
            "# publicada pela própria SheetJS (nunca chega ao registry do npm — instalação por tarball).\n"
            "npm uninstall xlsx\n"
            "npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz\n\n"
            "// lib/importers/parse.ts — sem nenhuma outra mudança de código necessária:\n"
            "// a API pública (XLSX.read/XLSX.utils) é compatível entre 0.18.5 e 0.20.3."
        ),
        "teste": (
            "test(\"VULN-4: dependência xlsx não está mais na versão vulnerável do npm\", () => {\n"
            "  const pkg = require(\"../package.json\");\n"
            "  expect(pkg.dependencies.xlsx).not.toMatch(/\\^?0\\.18\\./);\n"
            "});"
        ),
    },
    {
        "id": "V5",
        "categoria": "4. Infra & Config",
        "severidade": "Alta",
        "arquivo": "next.config.mjs, middleware.ts, vercel.json",
        "titulo": "Nenhum header de segurança configurado (CSP, X-Frame-Options, HSTS, X-Content-Type-Options)",
        "descricao": (
            "next.config.mjs é um objeto vazio (sem headers()), middleware.ts nunca adiciona headers "
            "à resposta, e vercel.json só define crons. Não existe Content-Security-Policy, "
            "X-Frame-Options, Strict-Transport-Security, X-Content-Type-Options nem Referrer-Policy em "
            "nenhum lugar do stack — relevante porque o app já usa dangerouslySetInnerHTML em 4 pontos "
            "revisados e um sanitizador de HTML artesanal (ver V9)."
        ),
        "trecho": (
            "// next.config.mjs\n"
            "/** @type {import('next').NextConfig} */\n"
            "const nextConfig = {};\n"
            "export default nextConfig;"
        ),
        "exploracao": (
            "Sem X-Frame-Options/frame-ancestors, o site pode ser embutido num <iframe> de um domínio "
            "malicioso para clickjacking (ex.: sobrepor um botão invisível de \"aprovar\" sobre um "
            "elemento da UI real). Sem CSP, qualquer XSS que eventualmente escape das defesas pontuais "
            "existentes (V9) tem via livre para executar/exfiltrar sem nenhuma camada adicional de "
            "contenção — exatamente o cenário que \"defesa em profundidade\" existe para cobrir."
        ),
        "condicoes": "Nenhuma — é uma lacuna de configuração, não depende de nenhuma ação de terceiro.",
        "correcao": "Adicionar um bloco headers() em next.config.mjs com o conjunto mínimo recomendado pela OWASP.",
        "correcao_codigo": (
            "// next.config.mjs\n"
            "/** @type {import('next').NextConfig} */\n"
            "const nextConfig = {\n"
            "  poweredByHeader: false, // [SEGURANÇA] [V5b]: para de anunciar \"Next.js\" no header X-Powered-By\n"
            "  async headers() {\n"
            "    return [\n"
            "      {\n"
            "        source: \"/:path*\",\n"
            "        headers: [\n"
            "          // [SEGURANÇA] [V5]: baseline de headers ausente — clickjacking, MIME-sniffing e\n"
            "          // downgrade para HTTP não tinham nenhuma barreira além do que o Vercel já faz por padrão.\n"
            "          { key: \"X-Content-Type-Options\", value: \"nosniff\" },\n"
            "          { key: \"X-Frame-Options\", value: \"DENY\" },\n"
            "          { key: \"Referrer-Policy\", value: \"strict-origin-when-cross-origin\" },\n"
            "          { key: \"Strict-Transport-Security\", value: \"max-age=63072000; includeSubDomains; preload\" },\n"
            "          {\n"
            "            key: \"Content-Security-Policy\",\n"
            "            // Começa em modo Report-Only — o app usa OAuth de 3 provedores + Vercel Blob +\n"
            "            // fontes/scripts variados; apertar direto para \"enforce\" arriscaria quebrar algo\n"
            "            // sem antes ver os relatórios de violação por um tempo.\n"
            "            value: \"default-src 'self'; frame-ancestors 'none'; base-uri 'self';\",\n"
            "          },\n"
            "        ],\n"
            "      },\n"
            "    ];\n"
            "  },\n"
            "};\n"
            "export default nextConfig;"
        ),
        "teste": (
            "test(\"VULN-5: resposta HTTP inclui os headers de segurança mínimos\", async () => {\n"
            "  const res = await fetch(\"https://lumen-flax-chi.vercel.app/\");\n"
            "  expect(res.headers.get(\"x-frame-options\")).toBe(\"DENY\");\n"
            "  expect(res.headers.get(\"x-content-type-options\")).toBe(\"nosniff\");\n"
            "  expect(res.headers.get(\"strict-transport-security\")).toMatch(/max-age=/);\n"
            "});"
        ),
    },
    {
        "id": "V6",
        "categoria": "4. Infra & Config",
        "severidade": "Alta",
        "arquivo": "app/api/admin/migrate-legacy/route.ts",
        "titulo": "Rota de migração sem verificação de sessão — só um segredo em query string, com erro cru devolvido ao cliente",
        "descricao": (
            "Diferente de todas as outras rotas app/api/admin/* (que exigem isAdmin/isPlatformOwner "
            "além de qualquer segredo), esta rota tem como ÚNICA proteção um MIGRATION_SECRET comparado "
            "por igualdade simples, recebido como parâmetro da URL — sem checar getCurrentUser() em "
            "nenhum momento. Além disso, em caso de erro, devolve error.message cru na resposta JSON, "
            "que pode ecoar detalhe da string de conexão com o banco legado (SOURCE_DATABASE_URL)."
        ),
        "trecho": (
            "export async function GET(request: NextRequest) {\n"
            "  const secret = request.nextUrl.searchParams.get(\"secret\"); // segredo na URL\n"
            "  const expected = process.env.MIGRATION_SECRET;\n"
            "  if (!expected || secret !== expected) return NextResponse.json({ error: \"unauthorized\" }, { status: 401 });\n"
            "  // nenhum getCurrentUser()/isAdmin aqui\n"
            "  ...\n"
            "  } catch (error) {\n"
            "    return NextResponse.json({ error: error instanceof Error ? error.message : \"...\" }, { status: 500 });\n"
            "  }\n"
            "}"
        ),
        "exploracao": (
            "Um segredo em query string fica em logs de acesso do servidor/proxy, no histórico do "
            "navegador de quem a chamou, e em qualquer header Referer enviado por engano — mais fácil "
            "de vazar que um Authorization header. Quem obtiver esse único valor tem acesso completo à "
            "rota, sem precisar de login algum no Lúmen (nenhuma conta, nenhuma sessão) — diferente de "
            "toda outra rota administrativa do projeto, que sempre soma um segundo fator (sessão + "
            "isAdmin/isPlatformOwner)."
        ),
        "condicoes": "Requer conhecer o valor de MIGRATION_SECRET (vazamento de log/histórico) — mas, ao contrário das outras rotas admin, não exige NENHUMA conta/sessão além disso.",
        "correcao": "Somar getCurrentUser() + isPlatformOwner como segunda camada (mesmo padrão de setup-painel-mestre), mover o segredo para um header Authorization, e nunca devolver error.message cru ao cliente.",
        "correcao_codigo": (
            "export async function GET(request: NextRequest) {\n"
            "  // [SEGURANÇA] [V6]: segunda camada de defesa — mesmo com o segredo em mãos, exige\n"
            "  // também uma sessão de platform owner (padrão já usado por setup-painel-mestre).\n"
            "  const viewer = await getCurrentUser();\n"
            "  if (!viewer?.isPlatformOwner) {\n"
            "    return NextResponse.json({ error: \"unauthorized\" }, { status: 401 });\n"
            "  }\n\n"
            "  // [SEGURANÇA] [V6]: segredo agora via header, não query string (não fica em log/histórico/Referer).\n"
            "  const secret = request.headers.get(\"authorization\")?.replace(\"Bearer \", \"\");\n"
            "  const expected = process.env.MIGRATION_SECRET;\n"
            "  if (!expected || secret !== expected) {\n"
            "    return NextResponse.json({ error: \"unauthorized\" }, { status: 401 });\n"
            "  }\n"
            "  ...\n"
            "  try {\n"
            "    const result = await migrarDadosLegado({ sourceUrl, destDb: prisma, officeSlug, officeName });\n"
            "    return NextResponse.json(result, { headers: { \"Cache-Control\": \"no-store\" } });\n"
            "  } catch (error) {\n"
            "    // [SEGURANÇA] [V6]: detalhe completo só no log do servidor — nunca no corpo da resposta,\n"
            "    // que podia ecoar host/usuário da string de conexão do banco legado.\n"
            "    console.error(\"[migrate-legacy] falha:\", error);\n"
            "    return NextResponse.json({ error: \"Erro durante a migração. Veja os logs do servidor.\" }, { status: 500, headers: { \"Cache-Control\": \"no-store\" } });\n"
            "  }\n"
            "}"
        ),
        "teste": (
            "test(\"VULN-6: migrate-legacy recusa mesmo com o secret certo, sem sessão de platform owner\", async () => {\n"
            "  const res = await fetch(\"/api/admin/migrate-legacy?officeSlug=x\", {\n"
            "    headers: { authorization: `Bearer ${process.env.MIGRATION_SECRET}` }, // sem cookie de sessão\n"
            "  });\n"
            "  expect(res.status).toBe(401);\n"
            "});"
        ),
    },
    {
        "id": "V7",
        "categoria": "1. Corrida financeira",
        "severidade": "Média",
        "arquivo": "lib/actions/tasks.ts:182-224 (delegateTask), lib/actions/publications.ts:196-244 (submitPublicationDistribution)",
        "titulo": "Distribuição/delegação de publicação sem compare-and-swap — a mesma publicação pode ser atribuída duas vezes",
        "descricao": (
            "delegateTask cria a(s) Task(s) e depois faz um updateMany incondicional em "
            "Publication.assignedToId — sem verificar se o campo ainda está null no momento da "
            "escrita. getPendingPublicationsForDistribution (leitura de \"pendentes\") e a delegação em "
            "si são dois round-trips separados, sem lock entre eles."
        ),
        "trecho": (
            "for (const responsibleId of responsibleIds) {\n"
            "  const task = await prisma.task.create({ data: { ..., publicationId: data.publicationId } });\n"
            "  ...\n"
            "}\n"
            "if (data.publicationId) {\n"
            "  await prisma.publication.updateMany({ where: { id: data.publicationId, officeId: viewer.officeId }, data: { assignedToId: responsibleIds[0] } }); // sem checar estado atual\n"
            "}"
        ),
        "exploracao": (
            "Dois advogados (ou um admin usando \"Distribuir pendentes\" e um colega clicando "
            "\"Delegar\" na mesma publicação) veem a mesma publicação como não atribuída e submetem a "
            "delegação quase ao mesmo tempo. O servidor cria DUAS Tasks (dois compromissos/prazos, "
            "duas notificações TAREFA_DELEGADA) para a mesma publicação, e o último updateMany a rodar "
            "vence silenciosamente — o outro responsável continua com uma tarefa ativa para algo que a "
            "tela mostra como \"atribuído a outra pessoa\"."
        ),
        "condicoes": "Dois usuários agindo sobre a mesma publicação pendente em uma janela de poucos segundos — plausível numa distribuição em lote feita por um admin coincidindo com uma delegação individual.",
        "correcao": "Tornar o updateMany condicional ao estado atual (assignedToId: null) e checar o count retornado antes de considerar a delegação bem-sucedida.",
        "correcao_codigo": (
            "if (data.publicationId) {\n"
            "  // [SEGURANÇA] [V7]: compare-and-swap — só \"vence\" quem chegar primeiro; a segunda\n"
            "  // chamada concorrente recebe count:0 e pode avisar o usuário em vez de duplicar silenciosamente.\n"
            "  const { count } = await prisma.publication.updateMany({\n"
            "    where: { id: data.publicationId, officeId: viewer.officeId, assignedToId: null },\n"
            "    data: { assignedToId: responsibleIds[0] },\n"
            "  });\n"
            "  if (count === 0) {\n"
            "    return { error: \"Esta publicação já foi atribuída a outra pessoa enquanto você preenchia o formulário.\" };\n"
            "  }\n"
            "  await resolvePublicationGroupForOffice(data.publicationId, viewer.officeId);\n"
            "  ...\n"
            "}"
        ),
        "teste": (
            "test(\"VULN-7: duas delegações concorrentes na mesma publicação não criam duas tarefas\", async () => {\n"
            "  const pub = await criarPublicacaoDeTeste({ assignedToId: null });\n"
            "  const [r1, r2] = await Promise.allSettled([\n"
            "    delegateTask({ responsibleIds: [\"user-a\"], publicationId: pub.id, ... }),\n"
            "    delegateTask({ responsibleIds: [\"user-b\"], publicationId: pub.id, ... }),\n"
            "  ]);\n"
            "  const semErro = [r1, r2].filter((r) => r.status === \"fulfilled\" && !r.value.error);\n"
            "  expect(semErro.length).toBe(1);\n"
            "});"
        ),
    },
    {
        "id": "V8",
        "categoria": "5. Entrada & Upload",
        "severidade": "Média",
        "arquivo": "app/(app)/processos/page.tsx:106-118, app/(app)/contatos/clientes/page.tsx:15-19, lib/actions/search.ts:69-81",
        "titulo": "Sem paginação/limite em listas centrais e na busca global — leitura completa do tenant a cada render/tecla",
        "descricao": (
            "As páginas de Processos e Clientes carregam prisma.findMany sem take/skip — toda linha do "
            "escritório, com múltiplos includes, em toda renderização. globalSearch (busca do TopBar, "
            "cada tecla digitada) roda 4 findMany sem take para o fallback de correspondência "
            "tolerante a acento."
        ),
        "trecho": (
            "// app/(app)/processos/page.tsx\n"
            "prisma.case.findMany({ where, include: { client: true, clients: {...}, parties: true, responsible: true, _count: {...} }, orderBy: SORTS[sortKey] }) // sem take\n\n"
            "// lib/actions/search.ts — 4x por chamada, sem take\n"
            "const caseCandidates = await prisma.case.findMany({ where: { officeId }, select: {...} });"
        ),
        "exploracao": (
            "Não há vazamento cross-tenant (tudo já filtra por officeId) — é um risco de exaustão de "
            "recursos. Um escritório com histórico grande de processos/clientes paga uma leitura cada "
            "vez mais cara a cada carregamento de página ou a cada tecla no campo de busca; nada "
            "impede que uma sessão autenticada dispare essas chamadas repetidamente (não há "
            "rate-limit nas Server Actions), degradando o pool de conexão do banco (Neon) para outros "
            "tenants do mesmo plano compartilhado."
        ),
        "condicoes": "Nenhuma condição além de um histórico de dados crescente ou uma sessão autenticada disparando as chamadas repetidamente.",
        "correcao": "Adicionar take (com paginação de verdade nas duas páginas) e um teto de candidatos nas 4 queries de fallback do globalSearch.",
        "correcao_codigo": (
            "// app/(app)/processos/page.tsx — adiciona paginação real\n"
            "const PAGE_SIZE = 50;\n"
            "const page = Number(searchParams.page) || 1;\n"
            "prisma.case.findMany({\n"
            "  where, include: {...}, orderBy: SORTS[sortKey],\n"
            "  take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE, // [SEGURANÇA] [V8]\n"
            "});\n\n"
            "// lib/actions/search.ts — teto nas 4 queries de fallback\n"
            "const caseCandidates = await prisma.case.findMany({ where: { officeId }, select: {...}, take: 500 }); // [SEGURANÇA] [V8]"
        ),
        "teste": (
            "test(\"VULN-8: listagem de processos nunca devolve mais que PAGE_SIZE registros\", async () => {\n"
            "  await criarNCasesDeTeste(200);\n"
            "  const html = await renderProcessosPage({ page: \"1\" });\n"
            "  expect(contarLinhasDaTabela(html)).toBeLessThanOrEqual(50);\n"
            "});"
        ),
    },
    {
        "id": "V9",
        "categoria": "5. Entrada & Upload",
        "severidade": "Média",
        "arquivo": "lib/richText.ts:19-33, components/anotacoes/AnotacoesPessoaisList.tsx:64",
        "titulo": "Sanitizador de HTML artesanal (regex, sem parser real) alimentando dangerouslySetInnerHTML",
        "descricao": (
            "sanitizeRichTextHtml bloqueia tags perigosas e remove atributos por regex — não usa um "
            "parser HTML de verdade nem uma biblioteca mantida (DOMPurify/sanitize-html). Bateria de "
            "payloads clássicos testada durante a auditoria não encontrou bypass funcional, mas essa "
            "classe de solução é reconhecidamente frágil contra mutation-XSS (a OWASP desaconselha "
            "sanitização de HTML só por regex) e é justamente o tipo de bug que F4/F5 (auditoria "
            "anterior) já corrigiram noutro lugar do mesmo projeto."
        ),
        "trecho": (
            "const ALLOWED_TAGS = new Set([\"b\", \"strong\", \"i\", \"em\", \"u\", \"ul\", \"ol\", \"li\", \"br\", \"p\", \"div\", \"span\"]);\n"
            "export function sanitizeRichTextHtml(html: string): string {\n"
            "  let out = html;\n"
            "  out = out.replace(/<(script|style|iframe|object|embed|link|meta|form|svg)\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>/gi, \"\");\n"
            "  out = out.replace(/<(script|style|iframe|object|embed|link|meta|form|svg)\\b[^>]*\\/?>/gi, \"\");\n"
            "  out = out.replace(/<\\/?([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*>/g, (match, tagName) => {\n"
            "    const tag = tagName.toLowerCase();\n"
            "    if (!ALLOWED_TAGS.has(tag)) return \"\";\n"
            "    return match.startsWith(\"</\") ? `</${tag}>` : `<${tag}>`;\n"
            "  });\n"
            "  return out.trim();\n"
            "}"
        ),
        "exploracao": (
            "Nenhum bypass funcional confirmado nesta rodada (testado contra <img onerror>, <svg "
            "onload>, tag-splitting, atributos com aspas confusas). O risco é estrutural: a superfície "
            "coberta por este sanitizador cresceu de \"só Anotações\" para também Descrição de "
            "Tarefa/Evento/Prazo (agosto/2026), e regex sobre HTML não cobre com segurança os casos de "
            "borda que um parser real (com uma árvore DOM de verdade) cobre — noscript/template/math, "
            "entidades malformadas, etc."
        ),
        "condicoes": "Nenhuma condição para o risco estrutural; um bypass concreto exigiria descobrir um caso de borda específico do parser HTML do navegador que a regex não replica.",
        "correcao": "Substituir por uma biblioteca mantida (isomorphic-dompurify) como defesa em profundidade, mesmo sem um exploit confirmado hoje.",
        "correcao_codigo": (
            "npm install isomorphic-dompurify\n\n"
            "// lib/richText.ts\n"
            "import DOMPurify from \"isomorphic-dompurify\";\n\n"
            "const ALLOWED_TAGS = [\"b\", \"strong\", \"i\", \"em\", \"u\", \"ul\", \"ol\", \"li\", \"br\", \"p\", \"div\", \"span\"];\n\n"
            "// [SEGURANÇA] [V9]: troca regex por um parser HTML real (DOMPurify) — mesma allowlist de\n"
            "// tags de antes, mas a análise agora é feita sobre uma árvore DOM de verdade, não uma\n"
            "// sequência de replace() que um caso de borda do parser do navegador pode escapar.\n"
            "export function sanitizeRichTextHtml(html: string): string {\n"
            "  if (!html) return \"\";\n"
            "  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: [] }).trim();\n"
            "}"
        ),
        "teste": (
            "test(\"VULN-9: sanitizeRichTextHtml remove onerror/onload mesmo em tags não bloqueadas por nome\", () => {\n"
            "  expect(sanitizeRichTextHtml('<p onclick=\"alert(1)\">x</p>')).toBe(\"<p>x</p>\");\n"
            "  expect(sanitizeRichTextHtml('<svg><script>alert(1)</script></svg>')).toBe(\"\");\n"
            "});"
        ),
    },
    {
        "id": "V10",
        "categoria": "2. Autorização",
        "severidade": "Média",
        "arquivo": "lib/actions/financeiro.ts:258,1084,1222 (syncReceivableStatus, ensureRecurringFeeReceivables, ensureRecurringExpensePayables), lib/actions/attendancePendencias.ts:115 (autoResolvePendenciasForAttachment)",
        "titulo": "Server Actions aceitam officeId como parâmetro cru em vez de derivar da sessão (violação estrutural da Lei 5)",
        "descricao": (
            "Essas funções são export async function num arquivo \"use server\" — ou seja, fazem parte "
            "do manifesto de Server Actions que o Next.js expõe ao cliente — mas recebem officeId como "
            "argumento e nunca chamam getCurrentUser() para conferi-lo. Hoje, todo call site interno já "
            "passa o officeId certo (derivado de viewer.officeId antes de chamar), então não há "
            "exploração comprovada agora — mas ensureRecurringFeeReceivables(officeId?), em particular, "
            "quando chamada SEM argumento, processa TODOS os escritórios da plataforma de propósito "
            "(uso interno de manutenção/cron)."
        ),
        "trecho": (
            "export async function syncReceivableStatus(id: string, officeId: string) { ... } // officeId cru\n"
            "export async function ensureRecurringFeeReceivables(officeId?: string) { ... } // sem officeId = TODOS os escritórios\n"
            "export async function autoResolvePendenciasForAttachment(attendanceId: string, docType: string, officeId: string) { ... }"
        ),
        "exploracao": (
            "Não há hoje um caminho client-reachable comprovado que passe um officeId arbitrário — mas "
            "como são exports de um arquivo \"use server\", o Next.js as registra no manifesto de "
            "actions independentemente de qual componente as usa hoje. Uma chamada direta ao endpoint "
            "codificado da action (bypassando a UI, via devtools/fetch) com um officeId de outro "
            "tenant, ou sem argumento nenhum em ensureRecurringFeeReceivables, executaria a função "
            "mesmo assim — o gate de autorização que deveria existir simplesmente não está lá."
        ),
        "condicoes": "Requer que um atacante descubra/replique o identificador de action codificado pelo Next.js build — não é trivial, mas não é impossível, e não deveria ser a única barreira.",
        "correcao": "Cada uma dessas funções deve derivar officeId de getCurrentUser() internamente; se precisarem continuar genéricas para uso interno (cron/scripts), mover para um módulo comum sem \"use server\" em vez de ficarem no mesmo arquivo das Server Actions client-reachable.",
        "correcao_codigo": (
            "// lib/actions/attendancePendencias.ts\n"
            "// [SEGURANÇA] [V10]: officeId deixa de ser parâmetro — deriva da sessão, como toda outra\n"
            "// Server Action do arquivo já faz.\n"
            "export async function autoResolvePendenciasForAttachment(attendanceId: string, docType: string): Promise<void> {\n"
            "  const viewer = await getCurrentUser();\n"
            "  if (!viewer) return;\n"
            "  const kind = DOC_TYPE_TO_PENDENCIA_ENVIAR[docType];\n"
            "  if (!kind) return;\n"
            "  try {\n"
            "    await prisma.atendimentoPendencia.updateMany({\n"
            "      where: { attendanceId, officeId: viewer.officeId, direction: \"ENVIAR\", kind, status: \"PENDENTE\" },\n"
            "      data: { status: \"CONCLUIDA\", completedAt: new Date() },\n"
            "    });\n"
            "  } catch { /* best-effort */ }\n"
            "}\n"
            "// Chamador (lib/actions/attachments.ts) para de passar officeId: autoResolvePendenciasForAttachment(attendanceId, docType)\n\n"
            "// ensureRecurringFeeReceivables/ensureRecurringExpensePayables/syncReceivableStatus: se o\n"
            "// uso \"todos os escritórios\" (cron) é intencional e precisa continuar existindo, mover\n"
            "// esse caminho para um arquivo SEM \"use server\" (ex.: lib/cron/recurringFees.ts, chamado só\n"
            "// pela rota app/api/cron/recurring-fees/route.ts, que já é fail-closed por CRON_SECRET) —\n"
            "// tirando a função do manifesto de Server Actions client-reachable por completo."
        ),
        "teste": (
            "test(\"VULN-10: autoResolvePendenciasForAttachment não aceita mais officeId de outro tenant\", () => {\n"
            "  // typecheck: a assinatura não tem mais o 3º parâmetro — o teste é de compilação\n"
            "  // @ts-expect-error officeId não é mais um parâmetro válido\n"
            "  autoResolvePendenciasForAttachment(\"att-1\", \"CONTRATO\", \"office-de-outro-tenant\");\n"
            "});"
        ),
    },
    {
        "id": "V11",
        "categoria": "1. Corrida financeira",
        "severidade": "Baixa",
        "arquivo": "lib/actions/apuracao.ts:73-166 (apurarHonorario)",
        "titulo": "apurarHonorario não-transacional (corrida possível, mas sem duplicar dinheiro — só uma tarefa de lembrete)",
        "descricao": (
            "O caminho de sucesso lê os Receivables A_APURAR e os atualiza em loop fora de uma "
            "transação (diferente do branch IMPROCEDENTE, que já usa prisma.$transaction). Uma "
            "segunda chamada concorrente, na janela entre a leitura e a escrita da primeira, "
            "reprocessaria o mesmo conjunto — mas como a escrita é um SET determinístico (não uma "
            "soma), o estado final converge para o mesmo valor; o único efeito colateral real é criar "
            "a tarefa \"Conferir trânsito em julgado\" duas vezes."
        ),
        "trecho": (
            "const pendentes = await prisma.receivable.findMany({ where: { status: \"A_APURAR\", ... } });\n"
            "for (const r of pendentes) {\n"
            "  await prisma.receivable.update({ where: { id: r.id }, data: { status: \"PENDENTE\", amount: valorApurado, ... } });\n"
            "}\n"
            "await prisma.task.create({ data: { title: \"Conferir trânsito em julgado\", ... } }); // pode duplicar"
        ),
        "exploracao": "Duplo clique/duas abas no mesmo processo+base gera duas tarefas idênticas de lembrete — ruído operacional, sem impacto financeiro.",
        "condicoes": "Duas submissões da mesma apuração dentro da mesma janela de milissegundos.",
        "correcao": "Envolver o caminho de sucesso em prisma.$transaction (mesmo padrão já usado no branch IMPROCEDENTE), e checar se já existe uma tarefa de conferência aberta antes de criar outra.",
        "correcao_codigo": (
            "// [SEGURANÇA] [V11]: mesmo padrão de transação já usado no branch IMPROCEDENTE, aplicado ao sucesso.\n"
            "await prisma.$transaction(async (tx) => {\n"
            "  const pendentes = await tx.receivable.findMany({ where: { status: \"A_APURAR\", ... } });\n"
            "  for (const r of pendentes) {\n"
            "    await tx.receivable.update({ where: { id: r.id }, data: { status: \"PENDENTE\", amount: valorApurado, ... } });\n"
            "  }\n"
            "  const jaExiste = await tx.task.findFirst({ where: { caseId, type: \"TAREFA\", title: \"Conferir trânsito em julgado\", status: { not: \"CONCLUIDO\" } } });\n"
            "  if (!jaExiste) await tx.task.create({ data: { title: \"Conferir trânsito em julgado\", ... } });\n"
            "});"
        ),
        "teste": (
            "test(\"VULN-11: duas apurações concorrentes não criam duas tarefas de conferência\", async () => {\n"
            "  await Promise.allSettled([apurarHonorario(caseId, base, valor), apurarHonorario(caseId, base, valor)]);\n"
            "  const tarefas = await prisma.task.count({ where: { caseId, title: \"Conferir trânsito em julgado\" } });\n"
            "  expect(tarefas).toBe(1);\n"
            "});"
        ),
    },
    {
        "id": "V12",
        "categoria": "5. Entrada & Upload",
        "severidade": "Baixa",
        "arquivo": "app/api/photos/upload/route.ts:28, app/api/perfil/foto/upload/route.ts:24",
        "titulo": "Upload de foto confia só no MIME declarado pelo navegador — aceita SVG com script embutido",
        "descricao": (
            "A única validação de tipo é file.type.startsWith(\"image/\") — um valor que o próprio "
            "cliente define no objeto File, trivialmente falsificável. Nenhum dos dois endpoints "
            "verifica os magic bytes reais nem reprocessa a imagem antes de armazenar."
        ),
        "trecho": (
            "if (!file.type.startsWith(\"image/\")) { return NextResponse.json({ error: \"O arquivo precisa ser uma imagem.\" }, { status: 400 }); }\n"
            "const blob = await put(`perfil/${user.id}-${Date.now()}-${file.name}`, file, { access: \"public\" });"
        ),
        "exploracao": (
            "Um arquivo .svg contendo <svg onload=\"...\"> ou <script> passa pela checagem (basta "
            "declarar Content-Type: image/svg+xml) e é armazenado com acesso público. Se essa URL for "
            "aberta como navegação de topo (não só usada dentro de <img>, que não executa SVG ativo), "
            "o script roda no domínio do Vercel Blob — separado do domínio/cookies do Lúmen, então o "
            "impacto prático é baixo (phishing/desfiguração visual, não roubo de sessão), mas seria "
            "trivial de fechar."
        ),
        "condicoes": "Qualquer usuário autenticado (perfil/foto/upload é autoatendimento, sem exigir admin).",
        "correcao": "Restringir contentType a um allowlist raster (png/jpeg/webp) explicitamente no put(), rejeitando svg+xml.",
        "correcao_codigo": (
            "const ALLOWED_IMAGE_TYPES = new Set([\"image/png\", \"image/jpeg\", \"image/webp\"]); // [SEGURANÇA] [V12]\n"
            "if (!ALLOWED_IMAGE_TYPES.has(file.type)) {\n"
            "  return NextResponse.json({ error: \"Envie uma imagem PNG, JPEG ou WEBP.\" }, { status: 400 });\n"
            "}\n"
            "const blob = await put(`perfil/${user.id}-${Date.now()}-${file.name}`, file, { access: \"public\", contentType: file.type });"
        ),
        "teste": (
            "test(\"VULN-12: upload de foto de perfil rejeita SVG\", async () => {\n"
            "  const svg = new File([\"<svg onload=alert(1)></svg>\"], \"x.svg\", { type: \"image/svg+xml\" });\n"
            "  const res = await uploadPerfilFoto(svg);\n"
            "  expect(res.status).toBe(400);\n"
            "});"
        ),
    },
    {
        "id": "V13",
        "categoria": "6. Exposição de dados",
        "severidade": "Baixa",
        "arquivo": "app/api/photos/file/[id]/route.ts",
        "titulo": "Rota pública de biblioteca de fotos sem checagem de sessão/officeId — vazamento cross-tenant de imagens decorativas",
        "descricao": (
            "Serve os bytes de qualquer Photo por id, sem getCurrentUser() nem filtro por officeId — "
            "deliberadamente pública, segundo o próprio comentário do arquivo. Photo é uma biblioteca "
            "por escritório de imagens decorativas/tribunais usada para ilustrar posts do blog."
        ),
        "trecho": (
            "export async function GET(_request: Request, { params }: { params: { id: string } }) {\n"
            "  const photo = await prisma.photo.findUnique({ where: { id: params.id } }); // sem officeId\n"
            "  ...\n"
            "}"
        ),
        "exploracao": "Quem enumerar/adivinhar um id de Photo (cuid) vê a imagem de QUALQUER escritório-cliente da plataforma, publicada ou não. Sem PII de cliente — só fotografia decorativa/institucional.",
        "condicoes": "Conhecer ou adivinhar um id de Photo válido; nenhuma sessão necessária.",
        "correcao": "Restringir a rota a fotos já vinculadas a um BlogPost publicado (a única situação em que a foto já é intencionalmente pública) — qualquer outra Photo passa a exigir sessão.",
        "correcao_codigo": (
            "export async function GET(_request: Request, { params }: { params: { id: string } }) {\n"
            "  const photo = await prisma.photo.findUnique({ where: { id: params.id } });\n"
            "  if (!photo) return new Response(\"Foto não encontrada\", { status: 404 });\n\n"
            "  // [SEGURANÇA] [V13]: só é pública quando já está anexada a um post PUBLICADO — o único\n"
            "  // caso em que \"pública\" já era a intenção. Qualquer outra Photo exige sessão do MESMO office.\n"
            "  const emPostPublicado = await prisma.blogPost.findFirst({ where: { photoId: photo.id, status: \"PUBLICADO\" }, select: { id: true } });\n"
            "  if (!emPostPublicado) {\n"
            "    const viewer = await getCurrentUser();\n"
            "    if (!viewer || viewer.officeId !== photo.officeId) {\n"
            "      return new Response(\"Foto não encontrada\", { status: 404 });\n"
            "    }\n"
            "  }\n"
            "  ... // resto inalterado (busca no Blob e serve os bytes)\n"
            "}"
        ),
        "teste": (
            "test(\"VULN-13: foto não publicada de outro escritório não é acessível sem sessão do mesmo tenant\", async () => {\n"
            "  const photo = await criarPhotoDeTeste({ officeId: \"office-b\" }); // não publicada\n"
            "  const res = await fetch(`/api/photos/file/${photo.id}`); // sem cookie de sessão\n"
            "  expect(res.status).toBe(404);\n"
            "});"
        ),
    },
]

STRENGTHS = [
    ("1. Isolamento de tenant", "Confirmado sistemático e consistente em ~90 arquivos revisados (lib/actions/*.ts + app/api/**/route.ts): toda mutação/consulta por id valida officeId via findFirst/where antes de agir, e os helpers isXInOffice (lib/officeScope.ts) são usados antes de aceitar qualquer FK secundária vinda do cliente."),
    ("2. Impersonação (\"atuar como\")", "Regressão do achado A33 checada e PASSOU: exige isPlatformOwner na identidade REAL (ignoreActing:true), a sessão de suporte é revalidada contra o banco a cada requisição (não confia só no cookie), e isAdmin é zerado durante a atuação — quem está \"atuando como\" o escritório-cliente nunca herda privilégio de admin dele."),
    ("3. Fail-closed em webhooks/cron", "Todas as 13 rotas de cron, o webhook do Asaas e o webhook do WhatsApp (achado F2 da auditoria anterior) seguem o padrão correto: recusam quando o segredo de verificação está ausente. O NOVO endpoint /api/blog/draft (robô de conteúdo) também nasceu seguindo esse padrão — evidência de que a disciplina documentada em CLAUDE.md está sendo aplicada em código novo."),
    ("4. Criptografia/hashing", "JWT via `jose` com verificação de assinatura de verdade (HS256), nunca decode sem verify; bcrypt com custo 10 em todos os pontos de hash de senha; SSRF do achado A63 (upload por URL) permanece fechado — allowlist estrita a *.blob.vercel-storage.com em todo call site atual."),
    ("5. Auditoria anterior (01/09/2026)", "Os 5 achados da primeira rodada (F1-F5) seguem corrigidos sem regressão: webhook WhatsApp fail-closed, protocolo javascript: bloqueado em meetingUrl/tribunalLink, seed.ts sem senha real fixa, e-mails HTML escapados, foto de perfil exigindo sessão."),
]

RECOMMENDATIONS = [
    ("P1", "Corrigir a corrida de pagamento duplicado (V1) — é o achado de maior impacto financeiro real, some direto no Livro Caixa/DRE/Fluxo de Caixa.", "V1"),
    ("P1", "Bloquear updateCase de alterar valor da causa/condenação/proveito econômico sem financeAccess (V2).", "V2"),
    ("P1", "Aplicar verifyAndConsumeOAuthState ao fluxo BTG, igual às outras 3 integrações OAuth (V3).", "V3"),
    ("P1", "Trocar a dependência xlsx pela distribuição corrigida da SheetJS ou migrar para exceljs (V4).", "V4"),
    ("P2", "Configurar os headers de segurança em next.config.mjs (V5) e fechar a lacuna de autenticação de migrate-legacy (V6).", "V5, V6"),
    ("P2", "Aplicar compare-and-swap em Publication.assignedToId (V7) e adicionar paginação real a Processos/Clientes/globalSearch (V8).", "V7, V8"),
    ("P3", "Substituir o sanitizador regex por isomorphic-dompurify (V9); derivar officeId da sessão nas 4 funções apontadas em V10 (ou movê-las para fora do arquivo \"use server\").", "V9, V10"),
    ("P3", "Envolver apurarHonorario em transação (V11), restringir upload de foto a PNG/JPEG/WEBP (V12), e restringir /api/photos/file a fotos já publicadas ou do mesmo escritório (V13).", "V11, V12, V13"),
]

# ---------------------------------------------------------------------------
# Gráficos (6 categorias, cores compartilhadas com o relatório original)
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
    counts_by_sev = {s: [0] * len(CAT_LABELS) for s in SEV_ORDER}
    for f in FINDINGS:
        idx = CAT_LABELS.index(f["categoria"])
        counts_by_sev[f["severidade"]][idx] += 1

    fig, ax = plt.subplots(figsize=(7.6, 4.4), dpi=200)
    bottom = [0] * len(CAT_LABELS)
    for s in SEV_ORDER:
        vals = counts_by_sev[s]
        if sum(vals) == 0:
            continue
        ax.bar(CAT_LABELS, vals, bottom=bottom, color=SEV_COLOR[s], label=s, width=0.55)
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
    ax.tick_params(colors=COR_TEXTO_2, labelsize=7.6)
    plt.setp(ax.get_xticklabels(), rotation=18, ha="right")
    ax.legend(loc="upper right", frameon=False, fontsize=9, labelcolor=COR_TEXTO)
    ax.set_ylabel("Achados", fontsize=9, color=COR_TEXTO_2)
    fig.tight_layout()
    fig.savefig(CHART_BARS, transparent=True)
    plt.close(fig)


# ---------------------------------------------------------------------------
# Conteúdo
# ---------------------------------------------------------------------------

def build_cover(styles):
    flow = [Spacer(1, 5.0 * cm)]
    flow.append(Paragraph("RELATÓRIO DE AUDITORIA DE SEGURANÇA ZERO-TRUST", ParagraphStyle(
        "eyebrow2", fontName="Helvetica-Bold", fontSize=10.5, textColor=colors.HexColor("#E8AE52"),
        spaceAfter=10)))
    flow.append(Paragraph(f"{PROJECT_NAME} — rodada 2", styles["Cover_Title"]))
    flow.append(Spacer(1, 0.4 * cm))
    flow.append(Paragraph(
        "Framework de 15 leis de arquitetura segura, aplicado camada por camada — perímetro, "
        "identidade/autorização, lógica de negócio/dados e infraestrutura/supply chain. "
        "Metodologia: 6 agentes de auditoria independentes, cada um cobrindo uma camada, achados "
        "cruzados e consolidados manualmente.",
        styles["Cover_Sub"]))
    flow.append(Spacer(1, 2.0 * cm))
    label_style = ParagraphStyle("CoverLabel2", fontName="Helvetica-Bold", fontSize=9,
                                  leading=12.5, textColor=colors.HexColor("#E8AE52"))
    value_style = ParagraphStyle("CoverValue2", fontName="Helvetica", fontSize=9,
                                  leading=12.5, textColor=colors.HexColor("#DCE3EC"))
    meta_rows_raw = [
        ["Repositório", REPO],
        ["Data desta auditoria", AUDIT_DATE],
        ["Auditoria anterior", f"{PREV_AUDIT_DATE} — 5 achados (F1-F5), todos corrigidos e sem regressão (verificado nesta rodada)"],
        ["Escopo", "Autenticação/multi-tenant, Server Actions, integrações externas (SSRF/OAuth/webhooks), segredos/config/headers, código novo da sessão, corridas em fluxo financeiro"],
        ["Status", "NENHUMA correção deste relatório foi aplicada ao código — Fase 2 e 3 são propostas aguardando validação"],
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


def build_resumo_scorecard(styles):
    flow = [Paragraph("Resumo executivo", styles["H2"])]
    counts = {s: 0 for s in SEV_ORDER}
    for f in FINDINGS:
        counts[f["severidade"]] += 1
    total = len(FINDINGS)

    # Um único Paragraph por célula (número + rótulo com <br/>) em vez de tabela aninhada — evita
    # o problema de altura de linha de tabelas aninhadas fazendo o rótulo colidir com o número.
    cells = []
    for s in ("Alta", "Média", "Baixa"):
        cell_style = ParagraphStyle(
            f"SevCount_{s}", alignment=1, leading=26,
        )
        html = (
            f"<font face='Helvetica-Bold' size=22 color='{SEV_COLOR[s]}'>{counts[s]}</font>"
            f"<br/><font face='Helvetica' size=8 color='{COR_TEXTO_2}'>{esc(s)}</font>"
        )
        cells.append(Paragraph(html, cell_style))
    strip = Table([cells], colWidths=[3.0 * cm] * 3)
    strip.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEABOVE", (0, 0), (0, 0), 2.4, colors.HexColor(SEV_COLOR["Alta"])),
        ("LINEABOVE", (1, 0), (1, 0), 2.4, colors.HexColor(SEV_COLOR["Média"])),
        ("LINEABOVE", (2, 0), (2, 0), 2.4, colors.HexColor(SEV_COLOR["Baixa"])),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
    ]))
    flow.append(strip)
    flow.append(Spacer(1, 0.5 * cm))

    make_donut()
    make_bars()
    charts_row = Table(
        [[Image(CHART_DONUT, width=6.3 * cm, height=6.3 * cm), Image(CHART_BARS, width=8.9 * cm, height=5.15 * cm)]],
        colWidths=[6.5 * cm, 8.9 * cm],
    )
    charts_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    flow.append(Paragraph("Achados por severidade e por categoria", styles["H3"]))
    flow.append(charts_row)
    flow.append(Spacer(1, 0.3 * cm))
    flow.append(Paragraph(
        f"<b>{total} achados confirmados</b> nesta rodada, nenhum crítico. Zero regressão nos 5 "
        f"achados da auditoria de 01/09/2026. Maior risco concentrado no módulo financeiro "
        f"(corrida de pagamento duplicado, V1) e numa integração adicionada depois do último "
        f"endurecimento de segurança (BTG, V3) — ambos os padrões de correção JÁ existem em outro "
        f"lugar do próprio código, só não foram replicados nesses dois pontos.",
        styles["Body"]))

    flow.append(Spacer(1, 0.4 * cm))
    flow.append(Paragraph("Scorecard de segurança", styles["H2"]))
    label_style = ParagraphStyle("ScoreLabel", parent=styles["BodySmall"], fontName="Helvetica-Bold")
    scorecard_raw = [
        ["Vulnerabilidades CRÍTICAS", "0"],
        ["Vulnerabilidades ALTAS", str(counts["Alta"])],
        ["Vulnerabilidades MÉDIAS", str(counts["Média"])],
        ["Vulnerabilidades BAIXAS", str(counts["Baixa"])],
        ["Anti-padrões de vibe coding detectados", "A5 parcial (BTG sem o nonce que as outras 3 integrações OAuth já usam) · nenhum outro dos A1-A10 confirmado"],
        ["Nota geral", "C — funcional e com isolamento de tenant sólido, mas com gaps reais que precisam virar prioridade de sprint antes de crescer mais o produto"],
    ]
    scorecard_rows = [[Paragraph(esc(label), label_style), Paragraph(esc(value), styles["BodySmall"])] for label, value in scorecard_raw]
    t = Table(scorecard_rows, colWidths=[6.0 * cm, 9.5 * cm])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor(COR_LINHA)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#F7F8FA")]),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FFF7E8")),
    ]))
    flow.append(t)
    flow.append(Spacer(1, 0.3 * cm))
    flow.append(Paragraph("<b>Top 3 ações prioritárias</b>", styles["H3"]))
    top3 = [
        "1. Corrigir a corrida de pagamento duplicado no financeiro (V1) — trava de linha + rejeição de pagamento acima do saldo.",
        "2. Aplicar o mesmo verifyAndConsumeOAuthState do Google/Microsoft/Dropbox ao fluxo BTG (V3), e trocar a dependência xlsx (V4).",
        "3. Configurar os headers de segurança ausentes (V5) e fechar a autenticação da rota migrate-legacy (V6).",
    ]
    flow.append(ListFlowable(
        [ListItem(Paragraph(esc(t_), styles["Body"])) for t_ in top3],
        bulletType="bullet", start="●", bulletFontSize=7, leftIndent=14,
    ))
    return flow


def build_pontos(styles):
    flow = [Paragraph("Pontos fortes confirmados", styles["H2"])]
    items = [ListItem(Paragraph(f"<b>{esc(t)}</b> — {esc(d)}", styles["BodySmall"]),
                       bulletColor=colors.HexColor(COR_PONTO_FORTE)) for t, d in STRENGTHS]
    flow.append(ListFlowable(items, bulletType="bullet", start="●", bulletFontSize=7,
                              leftIndent=14, spaceBefore=4, spaceAfter=10))
    return flow


def build_fase1(styles):
    flow = [Paragraph("Fase 1 — Visão do atacante (Red Team)", styles["H2"])]
    flow.append(Paragraph(
        "Cada achado abaixo foi lido diretamente no código atual do repositório antes de entrar "
        "neste relatório — arquivo, linha e trecho reais.", styles["Body"]))

    header = ["Sev.", "Categoria / Arquivo", "Descrição"]
    rows = [header]
    for f in FINDINGS:
        cat_arquivo = Paragraph(f"<b>{esc(f['categoria'])}</b><br/><font face='Courier' size=6.8>{esc(f['arquivo'][:95])}</font>", styles["BodySmall"])
        desc = Paragraph(f"<b>{esc(f['id'])} — {esc(f['titulo'])}</b>", styles["BodySmall"])
        rows.append([sev_chip(f["severidade"]), cat_arquivo, desc])
    t = Table(rows, colWidths=[2.1 * cm, 5.6 * cm, 7.8 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(COR_FUNDO_CAPA)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor(COR_LINHA)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (0, 1), (0, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F8FA")]),
    ]))
    flow.append(t)

    flow.append(Spacer(1, 0.3 * cm))
    flow.append(Paragraph("Evidência e exploração por achado", styles["H3"]))
    for f in FINDINGS:
        trecho_html = esc(f["trecho"]).replace("\n", "<br/>").replace("  ", "&nbsp;&nbsp;")
        block = [
            Spacer(1, 0.15 * cm),
            Table([[sev_chip(f["severidade"]),
                    Paragraph(f"<b>{esc(f['id'])} — {esc(f['titulo'])}</b>", styles["BodySmall"])]],
                  colWidths=[2.3 * cm, 12.8 * cm],
                  style=TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")])),
            Paragraph(f"<font face='Courier' size=7.2 color='{COR_TEXTO_2}'>{esc(f['arquivo'])}</font>", styles["BodySmall"]),
            Paragraph(trecho_html, styles["Mono"]),
            Paragraph(f"<b>Exploração:</b> {esc(f['exploracao'])}", styles["BodySmall"]),
            Paragraph(f"<b>Condições:</b> {esc(f['condicoes'])}", styles["BodySmall"]),
            HRFlowable(width="100%", thickness=0.5, color=colors.HexColor(COR_LINHA), spaceBefore=8, spaceAfter=4),
        ]
        flow.append(KeepTogether(block))
    return flow


def build_fase2(styles):
    flow = [PageBreak(), Paragraph("Fase 2 — Código blindado (Blue Team)", styles["H2"])]
    flow.append(Paragraph(
        "<b>Nada abaixo foi aplicado ao repositório.</b> São propostas de correção — apenas o "
        "trecho vulnerável de cada arquivo é reescrito, com comentários inline explicando o "
        "porquê de cada trava (padrão [SEGURANÇA] [id]). Aguardando validação antes de virar commit.",
        styles["Body"]))
    for f in FINDINGS:
        codigo_html = esc(f["correcao_codigo"]).replace("\n", "<br/>").replace("  ", "&nbsp;&nbsp;")
        block = [
            Spacer(1, 0.15 * cm),
            Paragraph(f"<b>{esc(f['id'])}</b> — {esc(f['correcao'])}", styles["BodySmall"]),
            Paragraph(codigo_html, styles["Mono"]),
            HRFlowable(width="100%", thickness=0.5, color=colors.HexColor(COR_LINHA), spaceBefore=6, spaceAfter=4),
        ]
        flow.append(KeepTogether(block))
    return flow


def build_fase3(styles):
    flow = [PageBreak(), Paragraph("Fase 3 — Testes de segurança (Security TDD)", styles["H2"])]
    flow.append(Paragraph(
        "O repositório não tem framework de teste configurado hoje (sem jest/vitest em "
        "package.json). Os testes abaixo usam sintaxe estilo Vitest como referência — para rodar de "
        "verdade, instalar <font face='Courier'>vitest</font> e um helper de fixtures de banco de "
        "teste antes.", styles["Body"]))
    for f in FINDINGS:
        teste_html = esc(f["teste"]).replace("\n", "<br/>").replace("  ", "&nbsp;&nbsp;")
        block = [
            Spacer(1, 0.15 * cm),
            Paragraph(f"<b>{esc(f['id'])}</b>", styles["BodySmall"]),
            Paragraph(teste_html, styles["Mono"]),
            HRFlowable(width="100%", thickness=0.5, color=colors.HexColor(COR_LINHA), spaceBefore=6, spaceAfter=4),
        ]
        flow.append(KeepTogether(block))
    return flow


def build_recomendacoes(styles):
    flow = [PageBreak(), Paragraph("Recomendações priorizadas", styles["H2"])]
    header = ["Prior.", "Recomendação", "Achado"]
    rows = [header]
    prio_color = {"P1": COR_ALTA, "P2": COR_MEDIA, "P3": COR_BAIXA}
    for p, texto, ref in RECOMMENDATIONS:
        chip = Table([[p]], colWidths=[1.3 * cm], rowHeights=[0.5 * cm])
        chip.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(prio_color[p])),
            ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        rows.append([chip, Paragraph(esc(texto), styles["BodySmall"]), Paragraph(esc(ref), styles["BodySmall"])])
    t = Table(rows, colWidths=[1.6 * cm, 11.4 * cm, 2.5 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(COR_FUNDO_CAPA)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor(COR_LINHA)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (2, 1), (2, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F8FA")]),
    ]))
    flow.append(t)
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
    story += build_resumo_scorecard(styles)
    story.append(PageBreak())
    story += build_pontos(styles)
    story.append(PageBreak())
    story += build_fase1(styles)
    story += build_fase2(styles)
    story += build_fase3(styles)
    story += build_recomendacoes(styles)

    def on_first(c, d):
        on_page_cover(c, d)

    def on_later(c, d):
        on_page_normal(c, d)

    # on_page_normal usa REPORT_NAME/PROJECT_NAME do módulo ORIGINAL — sobrescreve os globais lá
    # para o cabeçalho/rodapé deste relatório mostrarem o título certo.
    import gerar_relatorio as base
    base.REPORT_NAME = REPORT_NAME
    base.PROJECT_NAME = PROJECT_NAME

    doc.build(story, onFirstPage=on_first, onLaterPages=on_later)

    for f in (CHART_DONUT, CHART_BARS):
        try:
            os.remove(f)
        except OSError:
            pass

    print(f"PDF gerado em: {OUT_PDF}")


if __name__ == "__main__":
    main()
