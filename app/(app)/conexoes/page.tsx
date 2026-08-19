import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { getDriveStatus, listGoogleAccounts } from "@/lib/googleDrive";
import { isMicrosoftConfigured, listMicrosoftAccounts } from "@/lib/microsoftGraph";
import { getOneDriveStatus } from "@/lib/oneDriveStorage";
import { isDropboxConfigured } from "@/lib/dropbox";
import { getDropboxStatus } from "@/lib/dropboxStorage";
import { getOwnOfficeBilling } from "@/lib/actions/subscriptionBilling";
import AccessRestrictedNotice from "@/components/AccessRestrictedNotice";
import ConexoesView, { type ConexaoGrupo, type ConexaoItem, type IntegrationRunRow } from "@/components/conexoes/ConexoesView";
import TestDjenButton from "@/components/TestDjenButton";
import TestEmailButton from "@/components/TestEmailButton";
import SyncPublicationsButton from "@/components/SyncPublicationsButton";

export const dynamic = "force-dynamic";

// Documento 04 do handoff do redesenho Modernist: hoje cada integração (DJEN, Datajud, Asaas,
// BTG, Drive/OneDrive/Dropbox, e-mail, WhatsApp) vive espalhada numa aba longa de
// app/(app)/configuracoes/page.tsx, cada uma com seu próprio jeito de dizer "funcionando". Esta
// rota nova junta tudo num catálogo (mesmo vocabulário de 4 estados para todas) + um detalhe de
// anatomia fixa. PR9 do plano de execução (documento 10) — só o catálogo/estado/detalhe; a
// frequência configurável, o log persistido de verdade (ver model IntegrationRun) e as ações mais
// fundas por integração (credencial mascarada, break-glass, API keys, MCP) chegam nas PRs
// seguintes desta mesma fase, uma de cada vez.
const EMAIL_PROVIDER_LABEL: Record<string, string> = { GOOGLE: "Google (Gmail)", MICROSOFT: "Microsoft (Outlook)" };

function formatRelative(date: Date): string {
  const minutos = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutos < 1) return "agora mesmo";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.round(horas / 24);
  return `há ${dias} dia(s)`;
}

export default async function ConexoesPage() {
  const viewer = await getCurrentUser();
  if (!canConfigureIntegrations(viewer)) {
    return <AccessRestrictedNotice moduleName="Conexões" />;
  }
  const officeId = viewer.officeId;

  const trinta = new Date();
  trinta.setDate(trinta.getDate() - 30);

  const [
    driveStatus,
    googleAccounts,
    oneDriveStatus,
    microsoftAccounts,
    dropboxStatus,
    ownBilling,
    viewerEmailProvider,
    roboLogs,
    whatsappConfig,
    integrationRuns,
  ] = await Promise.all([
    getDriveStatus(officeId),
    listGoogleAccounts(officeId),
    getOneDriveStatus(officeId),
    listMicrosoftAccounts(officeId),
    getDropboxStatus(officeId),
    getOwnOfficeBilling(),
    // emailSendProvider é POR USUÁRIO (User.emailSendProvider, lib/actions/settings.ts:
    // setEmailSendProvider) — cada advogado escolhe a própria conta de envio para o Atendimento,
    // não existe um provedor único "do escritório" como o documento 04 supõe ao catalogar isto
    // como uma integração só. Mostrado aqui escopado a QUEM ESTÁ VENDO A TELA (viewer), com a
    // ressalva explícita no texto de contexto — mudar esse modelo de dados (torná-lo por
    // escritório) é decisão de produto fora do escopo deste PR.
    prisma.user.findUnique({ where: { id: viewer.id }, select: { emailSendProvider: true } }),
    // Tabela global do robô Python, sem officeId (mesma ressalva de app/(app)/configuracoes/page.tsx:
    // o status mostrado aqui é da ÚLTIMA execução do robô inteiro, não deste escritório sozinho —
    // o robô roda uma vez para todos os escritórios monitorados).
    prisma.roboExecucaoLog.findMany({ orderBy: { executadoEm: "desc" }, take: 20 }),
    prisma.whatsappConfig.findUnique({ where: { officeId } }),
    // Ainda não há nenhum escritor real (isso chega junto com cada integração nas próximas PRs) —
    // a consulta já é a de verdade, só devolve vazio até lá.
    prisma.integrationRun.findMany({ where: { officeId, startedAt: { gte: trinta } }, orderBy: { startedAt: "desc" }, take: 500 }),
  ]);

  const runsByIntegration = new Map<string, IntegrationRunRow[]>();
  for (const r of integrationRuns) {
    const list = runsByIntegration.get(r.integration) ?? [];
    list.push({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      status: r.status as "OK" | "ERRO" | "AVISO",
      httpStatus: r.httpStatus,
      itemCount: r.itemCount,
      message: r.message,
    });
    runsByIntegration.set(r.integration, list);
  }

  const ultimoDjen = roboLogs.find((l) => l.fonte === "DJEN");
  const ultimoDatajud = roboLogs.find((l) => l.fonte === "DATAJUD");
  const googleConnected = googleAccounts.length > 0;
  const microsoftConnected = microsoftAccounts.length > 0;
  const emailProvider = viewerEmailProvider?.emailSendProvider ?? null;
  const emailProviderConnected = emailProvider === "GOOGLE" ? googleConnected : emailProvider === "MICROSOFT" ? microsoftConnected : false;

  const grupos: { grupo: ConexaoGrupo; itens: ConexaoItem[] }[] = [
    {
      grupo: "Tribunais",
      itens: [
        {
          id: "DJEN",
          nome: "DJEN",
          descricao: "Busca publicações no Diário de Justiça Eletrônico Nacional pelas OABs cadastradas do escritório.",
          estado: !ultimoDjen ? "off" : ultimoDjen.sucesso ? "ok" : "erro",
          estadoTexto: !ultimoDjen ? "não configurado" : ultimoDjen.sucesso ? "ativo" : "falhando",
          contexto: ultimoDjen ? `Última execução ${formatRelative(ultimoDjen.executadoEm)}` : "Nunca executado",
          resultado: ultimoDjen?.detalhe ?? undefined,
          acoes: <TestDjenButton />,
        },
        {
          id: "DATAJUD",
          nome: "DATAJUD",
          descricao: "Consulta andamentos processuais na API pública do Datajud (CNJ).",
          estado: !ultimoDatajud ? "off" : ultimoDatajud.sucesso ? "ok" : "erro",
          estadoTexto: !ultimoDatajud ? "não configurado" : ultimoDatajud.sucesso ? "ativo" : "falhando",
          contexto: ultimoDatajud ? `Última execução ${formatRelative(ultimoDatajud.executadoEm)}` : "Nunca executado",
          resultado: ultimoDatajud?.detalhe ?? undefined,
          acoes: <SyncPublicationsButton />,
        },
      ],
    },
    {
      grupo: "Dinheiro",
      itens: [
        {
          id: "ASAAS",
          nome: "Asaas",
          descricao: "Gateway de cobrança da assinatura do Lúmen — boleto e Pix.",
          estado: ownBilling.subscription ? "ok" : "off",
          estadoTexto: ownBilling.subscription ? "ativo" : "não configurado",
          contexto: ownBilling.subscription ? `Ciclo: ${ownBilling.subscription.billingCycle}` : "Assinatura ainda não configurada",
        },
        {
          id: "BTG",
          nome: "BTG (conciliação)",
          descricao: "Concilia boletos e Pix da cobrança das assinaturas com o extrato bancário.",
          estado: "off",
          estadoTexto: "não configurado",
          contexto: "Conciliação administrada pela plataforma (Painel Mestre) — sem configuração por escritório ainda.",
        },
      ],
    },
    {
      grupo: "Arquivos",
      itens: [
        {
          id: "DRIVE",
          nome: "Google Drive",
          descricao: "Guarda os anexos dos processos e assessorias na conta Google conectada.",
          estado: driveStatus.state === "CONECTADO" ? "ok" : driveStatus.state === "DESCONECTADO" ? "off" : "erro",
          estadoTexto: driveStatus.state === "CONECTADO" ? "ativo" : driveStatus.state === "DESCONECTADO" ? "não configurado" : "falhando",
          contexto: driveStatus.accountEmail ? `Conta: ${driveStatus.accountEmail}` : driveStatus.message || "Nenhuma conta conectada ainda.",
        },
        {
          id: "ONEDRIVE",
          nome: "OneDrive",
          descricao: "Guarda os anexos dos processos e assessorias na conta Microsoft conectada.",
          estado: !isMicrosoftConfigured() ? "off" : oneDriveStatus.connected ? "ok" : "off",
          estadoTexto: !isMicrosoftConfigured() ? "não configurado" : oneDriveStatus.connected ? "ativo" : "não configurado",
          contexto: !isMicrosoftConfigured()
            ? "Não registrado na plataforma (Azure AD)."
            : oneDriveStatus.accountEmail
              ? `Conta: ${oneDriveStatus.accountEmail}`
              : "Nenhuma conta conectada ainda.",
        },
        {
          id: "DROPBOX",
          nome: "Dropbox",
          descricao: "Guarda os anexos dos processos e assessorias na conta Dropbox conectada.",
          estado: !isDropboxConfigured() ? "off" : dropboxStatus.connected ? "ok" : "off",
          estadoTexto: !isDropboxConfigured() ? "não configurado" : dropboxStatus.connected ? "ativo" : "não configurado",
          contexto: !isDropboxConfigured()
            ? "Não registrado na plataforma (Dropbox App Console)."
            : dropboxStatus.accountEmail
              ? `Conta: ${dropboxStatus.accountEmail}`
              : "Nenhuma conta conectada ainda.",
        },
      ],
    },
    {
      grupo: "Mensagens",
      itens: [
        {
          id: "EMAIL",
          nome: "E-mail de envio",
          // A escolha de provedor é POR USUÁRIO (User.emailSendProvider), não por escritório —
          // o que este cartão mostra é a escolha de QUEM ESTÁ VENDO a tela agora, não um estado
          // único do escritório inteiro (ver comentário na consulta acima, em Promise.all).
          descricao: "Provedor que você escolheu para responder clientes por e-mail a partir do Atendimento (a escolha é por advogado, não por escritório).",
          estado: !emailProvider ? "off" : emailProviderConnected ? "ok" : "erro",
          estadoTexto: !emailProvider ? "não configurado" : emailProviderConnected ? "ativo" : "falhando",
          contexto: emailProvider
            ? `Sua escolha: ${EMAIL_PROVIDER_LABEL[emailProvider] ?? emailProvider}${emailProviderConnected ? "" : " (conta não conectada)"}`
            : "Você ainda não escolheu um provedor de envio.",
          acoes: <TestEmailButton />,
        },
        {
          id: "WHATSAPP",
          nome: "WhatsApp",
          descricao: "Envia e recebe mensagens de clientes pela Cloud API da Meta.",
          estado: whatsappConfig ? "ok" : "off",
          estadoTexto: whatsappConfig ? "ativo" : "não configurado",
          // Documento 04 pede o estado "aviso" com os dias restantes até o token expirar — o
          // schema (WhatsappConfig) não guarda validade de token nenhuma hoje, então esse terceiro
          // estado fica pendente de uma coluna nova (fora do escopo desta PR — mudança de schema
          // tem PR própria).
          contexto: whatsappConfig?.displayPhone ? `Número: ${whatsappConfig.displayPhone}` : "Nenhum número conectado ainda.",
        },
      ],
    },
    {
      grupo: "Chaves e automação",
      itens: [
        {
          id: "API_KEYS",
          nome: "API keys do escritório",
          descricao: "Chaves para integrações externas chamarem a API do Lúmen em nome do escritório.",
          estado: "off",
          estadoTexto: "não configurado",
          contexto: "Ainda não implementado — chega numa próxima PR desta fase (documento 04, item 12 do plano).",
        },
        {
          id: "MCP",
          nome: "Servidores MCP",
          descricao: "Ferramentas externas que o assistente (ClaudeAssistantWidget) pode chamar em nome do escritório.",
          estado: "off",
          estadoTexto: "não configurado",
          // Disclosure explícita: hoje não existe NENHUM servidor MCP administrável no projeto —
          // o assistente não tem essa capacidade de verdade ainda, então esta tela nasce vazia até
          // essa capacidade existir (não é só uma tela sem dado; é uma tela sem a FUNCIONALIDADE por
          // trás dela). Ver comentário na PR sobre o que falta antes de PR12 poder ligar isto de
          // verdade.
          contexto: "Ainda não implementado — o assistente hoje não chama nenhuma ferramenta MCP.",
        },
        {
          id: "WEBHOOKS_LOG",
          nome: "Webhooks e log",
          descricao: "Visão consolidada de todas as execuções de integração dos últimos 30 dias.",
          estado: integrationRuns.length > 0 ? "ok" : "off",
          estadoTexto: integrationRuns.length > 0 ? "ativo" : "sem execuções",
          contexto:
            integrationRuns.length > 0
              ? `${integrationRuns.length} execução(ões) nos últimos 30 dias`
              : "Nenhuma execução registrada ainda — o log passa a preencher conforme cada integração acima liga a escrita (próximas PRs desta fase).",
          ehLog: true,
        },
      ],
    },
  ];

  const totalIntegracoes = grupos.reduce((s, g) => s + g.itens.length, 0);
  const exigemAtencao = grupos.reduce((s, g) => s + g.itens.filter((i) => i.estado === "erro" || i.estado === "aviso").length, 0);

  return (
    <ConexoesView
      grupos={grupos}
      totalIntegracoes={totalIntegracoes}
      exigemAtencao={exigemAtencao}
      runsByIntegration={Object.fromEntries(runsByIntegration)}
    />
  );
}
