import Link from "next/link";
import { HardDrive } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { getDriveStatus, listGoogleAccounts } from "@/lib/googleDrive";
import { isMicrosoftConfigured, listMicrosoftAccounts } from "@/lib/microsoftGraph";
import { getOneDriveStatus } from "@/lib/oneDriveStorage";
import { isDropboxConfigured } from "@/lib/dropbox";
import { getDropboxStatus } from "@/lib/dropboxStorage";
import { getOwnOfficeBilling } from "@/lib/actions/subscriptionBilling";
import { getDjenTargets } from "@/lib/djenSync";
import { isBtgConnected } from "@/lib/btg";
import { getAppUrl } from "@/lib/appUrl";
import { listApiKeys } from "@/lib/actions/apiKeys";
import { formatDate } from "@/components/ui";
import AccessRestrictedNotice from "@/components/AccessRestrictedNotice";
import ApiKeysManager from "@/components/conexoes/ApiKeysManager";
import ConexoesView, { type ConexaoGrupo, type ConexaoItem, type IntegrationRunRow } from "@/components/conexoes/ConexoesView";
import TestDjenButton from "@/components/TestDjenButton";
import TestEmailButton from "@/components/TestEmailButton";
import SyncPublicationsButton from "@/components/SyncPublicationsButton";
import CopyButton from "@/components/CopyButton";
import EmailSendProviderPicker from "@/components/EmailSendProviderPicker";
import StorageProviderPicker from "@/components/StorageProviderPicker";
import NomeacaoDriveForm from "@/components/NomeacaoDriveForm";
import WhatsappConfigForm from "@/components/WhatsappConfigForm";
import MigrarPastaMaeButton from "@/components/MigrarPastaMaeButton";
import MigrarPastasLegadasButton from "@/components/MigrarPastasLegadasButton";
import ReorganizeAttachmentsButton from "@/components/ReorganizeAttachmentsButton";
import RenameCasesToConventionButton from "@/components/RenameCasesToConventionButton";

export const dynamic = "force-dynamic";

// Documento 04 do handoff do redesenho Modernist: hoje cada integração (DJEN, Datajud, Asaas,
// BTG, Drive/OneDrive/Dropbox, e-mail, WhatsApp) vive espalhada numa aba longa de
// app/(app)/configuracoes/page.tsx, cada uma com seu próprio jeito de dizer "funcionando". Esta
// rota nova junta tudo num catálogo (mesmo vocabulário de 4 estados para todas) + um detalhe de
// anatomia fixa.
//
// PR9 do plano de execução (documento 10) fez o catálogo/estado/detalhe. Este PR (10) liga o log
// persistido de verdade: lib/actions/settings.ts (runDjenConnectionTest) e lib/roboBridge.ts
// (syncRoboParaSite, chamado pelo cron de 3 em 3 horas em app/api/cron/robo-bridge) agora GRAVAM
// em IntegrationRun a cada execução — por isso o estado de DJEN/DATAJUD abaixo passa a preferir
// esse sinal (mais fresco, por escritório) ao antigo RoboExecucaoLog (global, robô inteiro) quando
// já existe pelo menos uma linha.
//
// "Frequência configurável" (item 5 da anatomia do documento 04) fica de fora aqui, por decisão
// combinada com o dono do produto: DJEN/DATAJUD são sincronizados por um serviço Python separado
// (robo-publicacoes/, hospedado à parte com cron próprio, hoje a cada 3h) — tornar a frequência
// configurável de verdade exigiria mexer no agendamento desse serviço, uma mudança maior e mais
// arriscada que esta PR, então fica para uma investigação/PR futura. A tela já avisa isso
// explicitamente (`frequenciaNota` abaixo) em vez de fabricar um seletor que não mudaria nada.
//
// PR11 aprofundou gateway (Asaas/BTG), armazenamento (Drive/OneDrive/Dropbox), e-mail e WhatsApp:
// cada detalhe ganhou as ações/formulários reais que já existiam espalhados em
// app/(app)/configuracoes/page.tsx, reaproveitados sem reescrever nenhuma lógica. BTG passou a
// mostrar o estado REAL (isBtgConnected(), lib/btg.ts) em vez do "não configurado" fixo do PR9.
//
// PR12 (este) faz "API keys do escritório" de verdade — criar/listar/revogar (lib/actions/
// apiKeys.ts, components/conexoes/ApiKeysManager.tsx), sobre o model ApiKey (PR12a, sozinho por
// ser mudança de schema). Aviso importante, mostrado também NA TELA (não só em comentário): nenhum
// endpoint do Lúmen valida essas chaves ainda — não existe hoje uma API pública do produto, só
// rotas internas autenticadas por sessão. "Servidores MCP" segue "não implementado" de propósito:
// diferente de API keys (onde dá pra construir a GESTÃO da credencial mesmo sem a API que a usa),
// MCP não tem NENHUMA peça real no projeto — nenhum servidor, nenhuma ferramenta, nada — então uma
// tela de administração aqui seria só decoração enganosa. Fica para quando essa capacidade existir
// de verdade.
//
// PR13 removeu a aba "Modelos & Integrações" de app/(app)/configuracoes/page.tsx (documento 04:
// "configuracoes/page.tsx perde a aba inteira") — os callbacks OAuth de Google/Microsoft/Dropbox
// (app/api/google/callback, app/api/microsoft/callback, app/api/dropbox/callback) agora voltam
// pra cá (conexão do escritório) ou para /perfil (conexão pessoal — ver comentário lá), em vez de
// pra /configuracoes. Os botões "Conectar"/"Reconectar" de Drive/OneDrive/Dropbox, que só existiam
// naquela aba, ganharam extra abaixo nos itens correspondentes.
//
// Ainda pendente: credencial mascarada (break-glass, documento 07) — chega só na Fase 04.
const EMAIL_PROVIDER_LABEL: Record<string, string> = { GOOGLE: "Google (Gmail)", MICROSOFT: "Microsoft (Outlook)" };

function StatusLine({ state, children }: { state: "ok" | "erro"; children: React.ReactNode }) {
  const tone: Record<typeof state, string> = { ok: "border-concluido text-concluido", erro: "border-atencao text-atencao" };
  return <p className={`flex items-center gap-2 border-l-4 ${tone[state]} bg-sf-apoio px-3 py-2 text-xs font-medium mb-3`}>{children}</p>;
}

function formatRelative(date: Date): string {
  const minutos = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutos < 1) return "agora mesmo";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.round(horas / 24);
  return `há ${dias} dia(s)`;
}

export default async function ConexoesPage({
  searchParams,
}: {
  searchParams: { google?: string; microsoft?: string; dropbox?: string; msg?: string };
}) {
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
    djenTargets,
    office,
    btgConnected,
    btgConnection,
    webhookEvents,
    apiKeysRaw,
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
    // Agora escrita de verdade: runDjenConnectionTest (lib/actions/settings.ts) e
    // syncRoboParaSite (lib/roboBridge.ts, chamado a cada 3h pelo cron) gravam aqui — ver
    // comentário no topo do arquivo.
    prisma.integrationRun.findMany({ where: { officeId, startedAt: { gte: trinta } }, orderBy: { startedAt: "desc" }, take: 500 }),
    getDjenTargets(officeId),
    prisma.office.findUnique({ where: { id: officeId }, select: { storageProvider: true, drivePastaMae: true, drivePrefixo: true } }),
    isBtgConnected(),
    // BtgConnection é uma linha ÚNICA da plataforma (não por escritório — ver comentário do
    // model em prisma/schema.prisma: quem emite o boleto é o Rodarte Prado, não o escritório
    // cliente), então dá pra buscar sem where nenhum.
    prisma.btgConnection.findFirst({ select: { expiresAt: true, connectedAt: true } }),
    // PaymentWebhookEvent também é GLOBAL (log de todo evento recebido da Asaas, de qualquer
    // escritório) — mostrado aqui com a ressalva de que não é só deste escritório.
    prisma.paymentWebhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    listApiKeys(),
  ]);

  // canConfigureIntegrations já foi checado no topo desta página — a checagem redundante dentro
  // de listApiKeys() (lib/actions/apiKeys.ts) é o padrão normal de Server Action (nunca confiar só
  // no chamador), então o branch de erro aqui não deveria disparar de verdade; se disparar, trata
  // como "nenhuma chave" em vez de derrubar a página inteira.
  const apiKeysList = Array.isArray(apiKeysRaw) ? apiKeysRaw : [];
  const apiKeysAtivas = apiKeysList.filter((k) => !k.revokedAt);

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

  const STATUS_ESTADO: Record<"OK" | "ERRO" | "AVISO", ConexaoItem["estado"]> = { OK: "ok", ERRO: "erro", AVISO: "aviso" };
  const STATUS_TEXTO: Record<"OK" | "ERRO" | "AVISO", string> = { OK: "ativo", ERRO: "falhando", AVISO: "atenção" };

  // Estado de DJEN/DATAJUD prefere o sinal novo, por escritório (IntegrationRun, gravado por
  // runDjenConnectionTest/syncRoboParaSite — ver comentário no topo do arquivo) sobre o antigo
  // RoboExecucaoLog (global, robô Python inteiro) — só cai pro antigo enquanto ainda não existe
  // nenhuma linha nova (ex.: logo depois deste deploy, antes do primeiro ciclo de 3h rodar).
  const ultimoRunDjen = runsByIntegration.get("DJEN")?.[0];
  const djenEstado: ConexaoItem["estado"] = ultimoRunDjen ? STATUS_ESTADO[ultimoRunDjen.status] : !ultimoDjen ? "off" : ultimoDjen.sucesso ? "ok" : "erro";
  const djenEstadoTexto = ultimoRunDjen ? STATUS_TEXTO[ultimoRunDjen.status] : !ultimoDjen ? "não configurado" : ultimoDjen.sucesso ? "ativo" : "falhando";
  const djenContexto = ultimoRunDjen
    ? `Último ciclo ${formatRelative(new Date(ultimoRunDjen.startedAt))} — ${ultimoRunDjen.itemCount ?? 0} publicação(ões) nova(s)`
    : ultimoDjen
      ? `Última execução ${formatRelative(ultimoDjen.executadoEm)}`
      : "Nunca executado";

  const ultimoRunDatajud = runsByIntegration.get("DATAJUD")?.[0];
  const datajudEstado: ConexaoItem["estado"] = ultimoRunDatajud
    ? STATUS_ESTADO[ultimoRunDatajud.status]
    : !ultimoDatajud
      ? "off"
      : ultimoDatajud.sucesso
        ? "ok"
        : "erro";
  const datajudEstadoTexto = ultimoRunDatajud
    ? STATUS_TEXTO[ultimoRunDatajud.status]
    : !ultimoDatajud
      ? "não configurado"
      : ultimoDatajud.sucesso
        ? "ativo"
        : "falhando";
  const datajudContexto = ultimoRunDatajud
    ? `Último ciclo ${formatRelative(new Date(ultimoRunDatajud.startedAt))} — ${ultimoRunDatajud.itemCount ?? 0} andamento(s) novo(s)`
    : ultimoDatajud
      ? `Última execução ${formatRelative(ultimoDatajud.executadoEm)}`
      : "Nunca executado";

  const FREQUENCIA_ROBO =
    "Sincronizado por um serviço agendado à parte (robo-publicacoes/), hoje a cada 3 horas — configurar isso por aqui ainda não está disponível.";

  // Nomeação de pastas, escolha de provedor ativo e os botões de manutenção do Drive são
  // configuração de ARMAZENAMENTO como um todo, não de um provedor específico — documento 04:
  // "os botões de migração ficam num bloco 'Manutenção' ao pé do detalhe do PROVEDOR ATIVO, não
  // na primeira dobra". Por isso este bloco só entra no `extra` do item (DRIVE/ONEDRIVE/DROPBOX)
  // que bate com office.storageProvider — os outros dois mostram só a própria conta conectada.
  const storageProvider = office?.storageProvider ?? "GOOGLE_DRIVE";
  // Bloco só do provedor ATIVO (documento 04: "ao pé do detalhe do provedor ativo, não na
  // primeira dobra") — nomeação, troca de provedor e manutenção não fazem sentido repetidos nos
  // três itens do catálogo. Os dois links do fim (relatório de pastas, clientes duplicados)
  // vieram da extinta aba "Modelos & Integrações" → categoria "Documentos e pastas" (PR13).
  const storageManutencaoExtra = (
    <div className="flex flex-col gap-5">
      <NomeacaoDriveForm pastaMae={office?.drivePastaMae ?? ""} prefixo={office?.drivePrefixo ?? ""} provedor={storageProvider} />
      <StorageProviderPicker
        current={storageProvider}
        isAdmin={Boolean(viewer.isAdmin)}
        oneDriveConnected={oneDriveStatus.connected}
        dropboxConnected={dropboxStatus.connected}
      />
      <div>
        <h3 className="text-[10px] font-semibold text-tx-2 uppercase tracking-[.12em] mb-2">Manutenção</h3>
        <div className="flex flex-col gap-2 items-start">
          <MigrarPastaMaeButton />
          <MigrarPastasLegadasButton />
          <ReorganizeAttachmentsButton />
          <RenameCasesToConventionButton />
          <Link href="/configuracoes/relatorio-pastas" className="text-xs font-semibold text-acao hover:underline">
            Ver relatório de pastas →
          </Link>
          <Link href="/configuracoes/duplicados" className="text-xs font-semibold text-acao hover:underline">
            Ver e unificar clientes duplicados →
          </Link>
        </div>
      </div>
    </div>
  );

  const CONNECT_BTN = "inline-flex items-center gap-2 h-8 border-2 border-regua-forte bg-transparent hover:bg-acao-bg text-tx text-sm font-semibold px-4 w-fit transition-colors";

  const driveExtra = (
    <div className="flex flex-col gap-5">
      <div>
        {searchParams.google === "conectado" && <StatusLine state="ok">Google conectado com sucesso!</StatusLine>}
        {searchParams.google === "erro" && <StatusLine state="erro">Erro ao conectar: {searchParams.msg || "tente novamente."}</StatusLine>}
        <a href="/api/google/connect" className={CONNECT_BTN}>
          <HardDrive size={16} /> {driveStatus.connected ? "Reconectar" : "Conectar"} Google (Drive)
        </a>
      </div>
      {storageProvider === "GOOGLE_DRIVE" && storageManutencaoExtra}
    </div>
  );

  const oneDriveExtra = (
    <div className="flex flex-col gap-5">
      <div>
        {searchParams.microsoft === "onedrive-conectado" && <StatusLine state="ok">OneDrive conectado com sucesso!</StatusLine>}
        {searchParams.microsoft === "erro" && <StatusLine state="erro">Erro ao conectar: {searchParams.msg || "tente novamente."}</StatusLine>}
        {isMicrosoftConfigured() && (
          <a href="/api/microsoft/connect?mode=onedrive" className={CONNECT_BTN}>
            <HardDrive size={16} /> {oneDriveStatus.connected ? "Reconectar" : "Conectar"} OneDrive
          </a>
        )}
      </div>
      {storageProvider === "ONEDRIVE" && storageManutencaoExtra}
    </div>
  );

  const dropboxExtra = (
    <div className="flex flex-col gap-5">
      <div>
        {searchParams.dropbox === "conectado" && <StatusLine state="ok">Dropbox conectado com sucesso!</StatusLine>}
        {searchParams.dropbox === "erro" && <StatusLine state="erro">Erro ao conectar: {searchParams.msg || "tente novamente."}</StatusLine>}
        {isDropboxConfigured() && (
          <a href="/api/dropbox/connect" className={CONNECT_BTN}>
            <HardDrive size={16} /> {dropboxStatus.connected ? "Reconectar" : "Conectar"} Dropbox
          </a>
        )}
      </div>
      {storageProvider === "DROPBOX" && storageManutencaoExtra}
    </div>
  );

  const grupos: { grupo: ConexaoGrupo; itens: ConexaoItem[] }[] = [
    {
      grupo: "Tribunais",
      itens: [
        {
          id: "DJEN",
          nome: "DJEN",
          descricao: "Busca publicações no Diário de Justiça Eletrônico Nacional pelas OABs cadastradas do escritório.",
          estado: djenEstado,
          estadoTexto: djenEstadoTexto,
          contexto: djenContexto,
          resultado: ultimoRunDjen?.message ?? ultimoDjen?.detalhe ?? undefined,
          acoes: <TestDjenButton />,
          frequenciaNota: FREQUENCIA_ROBO,
          extra:
            djenTargets.length > 0 ? (
              <div>
                <h3 className="text-[10px] font-semibold text-tx-2 uppercase tracking-[.12em] mb-1.5">OABs monitoradas</h3>
                <ul className="text-sm text-tx space-y-1">
                  {djenTargets.map((t) => (
                    <li key={`${t.numeroOab}-${t.ufOab}`}>
                      {t.label} — OAB {t.numeroOab}/{t.ufOab}
                    </li>
                  ))}
                </ul>
              </div>
            ) : undefined,
        },
        {
          id: "DATAJUD",
          nome: "DATAJUD",
          descricao: "Consulta andamentos processuais na API pública do Datajud (CNJ).",
          estado: datajudEstado,
          estadoTexto: datajudEstadoTexto,
          contexto: datajudContexto,
          resultado: ultimoRunDatajud?.message ?? ultimoDatajud?.detalhe ?? undefined,
          acoes: <SyncPublicationsButton />,
          frequenciaNota: FREQUENCIA_ROBO,
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
          extra: (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-[10px] font-semibold text-tx-2 uppercase tracking-[.12em] mb-1.5">Webhook</h3>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-tx-2 bg-sf-apoio px-2 py-1 truncate">{`${getAppUrl()}/api/asaas/webhook`}</code>
                  <CopyButton text={`${getAppUrl()}/api/asaas/webhook`} label="Copiar" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-[10px] font-semibold text-tx-2 uppercase tracking-[.12em]">Últimos eventos recebidos</h3>
                  {/* PaymentWebhookEvent é global (todo escritório que paga a assinatura via Asaas
                      cai na mesma tabela) — não dá pra filtrar só o deste escritório sem juntar
                      com TenantInvoice por competência, fora do escopo desta PR. */}
                  <span className="text-[10px] text-tx-3">de toda a plataforma, não só deste escritório</span>
                </div>
                {webhookEvents.length === 0 ? (
                  <p className="text-sm text-tx-2">Nenhum evento recebido ainda.</p>
                ) : (
                  <ul className="text-sm text-tx space-y-1">
                    {webhookEvents.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2">
                        <span>{e.eventType}</span>
                        <span className="text-xs text-tx-2 tabular-nums">{formatDate(e.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ),
        },
        {
          id: "BTG",
          nome: "BTG (conciliação)",
          descricao: "Concilia boletos e Pix da cobrança das assinaturas com o extrato bancário.",
          estado: btgConnected ? "ok" : "off",
          estadoTexto: btgConnected ? "ativo" : "não configurado",
          contexto: btgConnected
            ? `Conectado${btgConnection ? ` — token expira em ${formatDate(btgConnection.expiresAt)}` : ""}`
            : "Conciliação administrada pela plataforma (Painel Mestre) — ainda não conectado.",
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
          extra: driveExtra,
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
          extra: oneDriveExtra,
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
          extra: dropboxExtra,
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
          extra: <EmailSendProviderPicker current={emailProvider} googleConnected={googleConnected} microsoftConnected={microsoftConnected} />,
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
          extra: <WhatsappConfigForm connected={Boolean(whatsappConfig)} displayPhone={whatsappConfig?.displayPhone ?? null} />,
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
          estado: apiKeysAtivas.length > 0 ? "ok" : "off",
          estadoTexto: apiKeysAtivas.length > 0 ? `${apiKeysAtivas.length} ativa(s)` : "não configurado",
          contexto:
            apiKeysAtivas.length > 0
              ? `${apiKeysAtivas.length} chave(s) ativa(s) — nenhuma valida chamada real ainda (ver aviso no detalhe)`
              : "Nenhuma chave criada ainda. Nenhum endpoint do Lúmen valida chaves ainda — só a gestão da credencial existe.",
          extra: <ApiKeysManager initialKeys={apiKeysList} />,
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
