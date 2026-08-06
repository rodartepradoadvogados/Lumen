/**
 * Migração de pastas de CASO (Case.type fora de JUDICIAL/ADMINISTRATIVO — ver
 * lib/caseNatureza.ts, naturezaOf) da raiz antiga "Lúmen - Processos" para a raiz nova
 * "Lúmen - Casos", em cada um dos três provedores de armazenamento (Google Drive, OneDrive,
 * Dropbox), conforme o provedor ATIVO de cada escritório (Office.storageProvider).
 *
 * Contexto: a partir desta entrega, toda pasta de Caso NOVA já nasce direto em "Lúmen - Casos"
 * (ver getOrCreateCaseFolder em lib/googleDrive.ts / lib/oneDriveStorage.ts /
 * lib/dropboxStorage.ts — só decide a raiz quando o Case ainda não tem driveFolderId salvo). Este
 * script cobre só as pastas de caso que já existiam ANTES desta entrega, ainda apontando para
 * dentro de "Lúmen - Processos".
 *
 * MOVER, não copiar: no Google Drive é troca de parents (addParents/removeParents — ver
 * moveDriveFile em lib/googleDrive.ts); no OneDrive é PATCH de parentReference (moveOneDriveFile);
 * no Dropbox é files/move_v2 (moveDropboxFile). Em nenhum dos três o conteúdo é recriado — o id da
 * pasta e de tudo dentro dela permanece o mesmo, então Case.driveFolderId e qualquer
 * Attachment.driveUrl/storageFileId já salvos continuam válidos depois da migração. Mesmo
 * raciocínio de lib/actions/driveFolderMigration.ts (migração legada rp-financeiro -> Lúmen), que
 * já apoia essa garantia — ver o comentário no topo daquele arquivo.
 *
 * Diferença importante em relação a lib/actions/driveFolderMigration.ts: lá, a pasta legada
 * precisava ser CASADA por nome contra a raiz nova (o vínculo por id nem sempre existia ainda), o
 * que abre espaço para duas pastas homônimas conflitantes. Aqui não: a pasta já é conhecida por id
 * via Case.driveFolderId, então não há nada para "adivinhar" — só decidir se ela está em
 * "Lúmen - Processos" (move) ou já em "Lúmen - Casos" (não mexe) ou em nenhum dos dois (pula,
 * fora do escopo).
 *
 * ---------------------------------------------------------------------------------------------
 * COMO RODAR — DUAS ETAPAS OBRIGATÓRIAS, NESTA ORDEM:
 *
 *   1) RELATÓRIO (padrão, sem argumento nenhum) — NÃO move nada:
 *
 *        npx tsx scripts/migrar-pastas-casos.ts
 *
 *      Lista, por escritório: quantos Case são "caso" (natureza CASO), quantos já têm pasta, em
 *      que raiz cada pasta está HOJE, e para cada um: se seria movido, se já está correto, se não
 *      tem pasta ainda, ou se foi pulado (com o motivo). Confira esta saída com calma — ela reflete
 *      pastas reais de um escritório em produção — antes de rodar a etapa 2.
 *
 *   2) EXECUÇÃO — só com o argumento --executar:
 *
 *        npx tsx scripts/migrar-pastas-casos.ts --executar
 *
 *      Move de verdade as pastas listadas como "seria movida" no relatório. IDEMPOTENTE: rodar de
 *      novo depois de já ter movido tudo não faz nada (a pasta já está na raiz certa, vira
 *      "já correta"). Cada pasta é processada em try/catch isolado — uma falha não derruba as
 *      demais, só é contada e reportada no resumo final. NUNCA apaga nada: se não der para mover,
 *      pula e registra o motivo.
 *
 * Requer as mesmas variáveis de ambiente de qualquer script deste projeto que fala com o banco
 * (DATABASE_URL) e, para os escritórios que tiverem, as credenciais já conectadas de
 * Google/Microsoft/Dropbox (não pede nada extra — usa as mesmas tabelas de credencial que o site
 * usa em runtime).
 * ---------------------------------------------------------------------------------------------
 *
 * O QUE FICA DE FORA (nenhum dos três provedores foi excluído da migração — todos têm operação de
 * mover pasta por id/caminho já usada em produção em outros fluxos do projeto, ver
 * lib/actions/driveReorg.ts): OneDrive e Dropbox estão cobertos exatamente com a mesma cautela do
 * Google (lê o estado atual antes de mexer, só move quando a origem é reconhecida, nunca apaga).
 * A única assimetria real é que o Google expõe um campo `trashed` explícito (pasta na Lixeira do
 * Drive continua respondendo, só marcada) — OneDrive/Dropbox não têm esse campo aqui: um item
 * apagado nesses dois simplesmente para de responder pelo id antigo (404 / not_found), tratado da
 * mesma forma que "pasta não encontrada" (pulada, nunca recriada).
 *
 * NÃO FOI EXECUTADO neste ambiente — o ambiente de desenvolvimento não tem acesso à porta 5432 do
 * banco Neon nem a nenhuma credencial de Google/Microsoft/Dropbox (bloqueio de rede proposital do
 * ambiente de trabalho). Só TypeScript-verificado (npx tsc --noEmit -p .). Rodar manualmente em
 * produção, SEMPRE primeiro sem --executar.
 */

import { prisma } from "../lib/prisma";
import { naturezaWhere } from "../lib/caseNatureza";
import {
  hasPrimaryDriveCredential,
  getProcessosRootFolderId as getGoogleProcessosRootFolderId,
  getCasosRootFolderId as getGoogleCasosRootFolderId,
  getDriveFileInfo,
  moveDriveFile,
} from "../lib/googleDrive";
import {
  getOneDriveStatus,
  getProcessosRootFolderId as getOneDriveProcessosRootFolderId,
  getCasosRootFolderId as getOneDriveCasosRootFolderId,
  getOneDriveItemInfo,
  moveOneDriveFile,
} from "../lib/oneDriveStorage";
import {
  getDropboxStatus,
  getProcessosRootFolderId as getDropboxProcessosRootFolderId,
  getCasosRootFolderId as getDropboxCasosRootFolderId,
  getDropboxItemInfo,
  moveDropboxFile,
} from "../lib/dropboxStorage";

const EXECUTAR = process.argv.includes("--executar");

type Provider = "GOOGLE_DRIVE" | "ONEDRIVE" | "DROPBOX";

type CasoRow = { id: string; title: string; type: string; driveFolderId: string | null };

type Status = "MOVIDA" | "SERIA_MOVIDA" | "JA_CORRETA" | "SEM_PASTA" | "PULADA";

type Plano = { caseId: string; title: string; type: string; status: Status; detail: string };

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function providerFor(officeId: string): Promise<Provider> {
  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { storageProvider: true } });
  if (office?.storageProvider === "ONEDRIVE") return "ONEDRIVE";
  if (office?.storageProvider === "DROPBOX") return "DROPBOX";
  return "GOOGLE_DRIVE";
}

const SEM_PASTA_DETAIL =
  'Ainda não tem pasta criada — nada a mover (será criada direto em "Lúmen - Casos" na primeira vez que alguém anexar algo).';

// ============ GOOGLE DRIVE ============

async function processarGoogle(officeId: string, casos: CasoRow[]): Promise<Plano[]> {
  const conectado = await hasPrimaryDriveCredential(officeId);
  if (!conectado) {
    return casos.map((c) => ({ caseId: c.id, title: c.title, type: c.type, status: "PULADA", detail: "Google Drive não está conectado para este escritório." }));
  }

  const [processosRootId, casosRootId] = await Promise.all([
    getGoogleProcessosRootFolderId(officeId),
    getGoogleCasosRootFolderId(officeId),
  ]);

  const planos: Plano[] = [];
  for (const c of casos) {
    if (!c.driveFolderId) {
      planos.push({ caseId: c.id, title: c.title, type: c.type, status: "SEM_PASTA", detail: SEM_PASTA_DETAIL });
      continue;
    }
    try {
      const info = await getDriveFileInfo(c.driveFolderId, officeId);
      if (!info) {
        planos.push({ caseId: c.id, title: c.title, type: c.type, status: "PULADA", detail: `A pasta (id ${c.driveFolderId}) não foi encontrada no Drive — pode ter sido apagada definitivamente.` });
        continue;
      }
      if (info.trashed) {
        planos.push({ caseId: c.id, title: c.title, type: c.type, status: "PULADA", detail: "A pasta está na Lixeira do Drive — não mexida (restaure pela Lixeira antes de rodar de novo, se for para existir)." });
        continue;
      }
      if (info.parents.includes(casosRootId)) {
        planos.push({ caseId: c.id, title: c.title, type: c.type, status: "JA_CORRETA", detail: 'Já está em "Lúmen - Casos".' });
        continue;
      }
      if (!info.parents.includes(processosRootId)) {
        planos.push({
          caseId: c.id,
          title: c.title,
          type: c.type,
          status: "PULADA",
          detail: `A pasta não está em "Lúmen - Processos" nem em "Lúmen - Casos" (parents atuais: ${info.parents.join(", ") || "nenhum"}) — fora do escopo desta migração, não mexida.`,
        });
        continue;
      }
      if (!EXECUTAR) {
        planos.push({ caseId: c.id, title: c.title, type: c.type, status: "SERIA_MOVIDA", detail: 'Está em "Lúmen - Processos" — seria movida para "Lúmen - Casos".' });
        continue;
      }
      await moveDriveFile(c.driveFolderId, casosRootId, officeId);
      planos.push({ caseId: c.id, title: c.title, type: c.type, status: "MOVIDA", detail: 'Movida de "Lúmen - Processos" para "Lúmen - Casos".' });
    } catch (e) {
      planos.push({ caseId: c.id, title: c.title, type: c.type, status: "PULADA", detail: `Erro inesperado ao processar esta pasta: ${msg(e)}. Nenhuma ação foi tomada.` });
    }
  }
  return planos;
}

// ============ ONEDRIVE ============

async function processarOneDrive(officeId: string, casos: CasoRow[]): Promise<Plano[]> {
  const status = await getOneDriveStatus(officeId);
  if (!status.connected) {
    return casos.map((c) => ({ caseId: c.id, title: c.title, type: c.type, status: "PULADA", detail: "OneDrive não está conectado para este escritório." }));
  }

  const [processosRootId, casosRootId] = await Promise.all([
    getOneDriveProcessosRootFolderId(officeId),
    getOneDriveCasosRootFolderId(officeId),
  ]);

  const planos: Plano[] = [];
  for (const c of casos) {
    if (!c.driveFolderId) {
      planos.push({ caseId: c.id, title: c.title, type: c.type, status: "SEM_PASTA", detail: SEM_PASTA_DETAIL });
      continue;
    }
    try {
      const info = await getOneDriveItemInfo(c.driveFolderId, officeId);
      if (!info) {
        planos.push({ caseId: c.id, title: c.title, type: c.type, status: "PULADA", detail: `A pasta (id ${c.driveFolderId}) não foi encontrada no OneDrive — pode ter sido apagada ou está na Lixeira.` });
        continue;
      }
      if (info.parentId === casosRootId) {
        planos.push({ caseId: c.id, title: c.title, type: c.type, status: "JA_CORRETA", detail: 'Já está em "Lúmen - Casos".' });
        continue;
      }
      if (info.parentId !== processosRootId) {
        planos.push({
          caseId: c.id,
          title: c.title,
          type: c.type,
          status: "PULADA",
          detail: `A pasta não está em "Lúmen - Processos" nem em "Lúmen - Casos" (pai atual: ${info.parentId ?? "nenhum"}) — fora do escopo desta migração, não mexida.`,
        });
        continue;
      }
      if (!EXECUTAR) {
        planos.push({ caseId: c.id, title: c.title, type: c.type, status: "SERIA_MOVIDA", detail: 'Está em "Lúmen - Processos" — seria movida para "Lúmen - Casos".' });
        continue;
      }
      await moveOneDriveFile(c.driveFolderId, casosRootId, officeId);
      planos.push({ caseId: c.id, title: c.title, type: c.type, status: "MOVIDA", detail: 'Movida de "Lúmen - Processos" para "Lúmen - Casos".' });
    } catch (e) {
      planos.push({ caseId: c.id, title: c.title, type: c.type, status: "PULADA", detail: `Erro inesperado ao processar esta pasta: ${msg(e)}. Nenhuma ação foi tomada.` });
    }
  }
  return planos;
}

// ============ DROPBOX ============

async function processarDropbox(officeId: string, casos: CasoRow[]): Promise<Plano[]> {
  const status = await getDropboxStatus(officeId);
  if (!status.connected) {
    return casos.map((c) => ({ caseId: c.id, title: c.title, type: c.type, status: "PULADA", detail: "Dropbox não está conectado para este escritório." }));
  }

  const [processosRootId, casosRootId] = await Promise.all([
    getDropboxProcessosRootFolderId(officeId),
    getDropboxCasosRootFolderId(officeId),
  ]);
  // O Dropbox não tem "id do pai" direto — get_metadata só devolve caminho (path_display). Por
  // isso lê o caminho das duas raízes uma única vez aqui, e compara o `parentPath` de cada pasta
  // de caso contra eles abaixo (mesma técnica de renameDropboxFolder/moveDropboxFile em
  // lib/dropboxStorage.ts).
  const [processosRootInfo, casosRootInfo] = await Promise.all([
    getDropboxItemInfo(processosRootId, officeId),
    getDropboxItemInfo(casosRootId, officeId),
  ]);
  if (!processosRootInfo || !casosRootInfo) {
    return casos.map((c) => ({ caseId: c.id, title: c.title, type: c.type, status: "PULADA", detail: "Não foi possível ler as pastas-raiz do Dropbox deste escritório." }));
  }

  const planos: Plano[] = [];
  for (const c of casos) {
    if (!c.driveFolderId) {
      planos.push({ caseId: c.id, title: c.title, type: c.type, status: "SEM_PASTA", detail: SEM_PASTA_DETAIL });
      continue;
    }
    try {
      const info = await getDropboxItemInfo(c.driveFolderId, officeId);
      if (!info) {
        planos.push({ caseId: c.id, title: c.title, type: c.type, status: "PULADA", detail: `A pasta (id ${c.driveFolderId}) não foi encontrada no Dropbox — pode ter sido apagada.` });
        continue;
      }
      if (info.parentPath === casosRootInfo.pathDisplay) {
        planos.push({ caseId: c.id, title: c.title, type: c.type, status: "JA_CORRETA", detail: 'Já está em "Lúmen - Casos".' });
        continue;
      }
      if (info.parentPath !== processosRootInfo.pathDisplay) {
        planos.push({
          caseId: c.id,
          title: c.title,
          type: c.type,
          status: "PULADA",
          detail: `A pasta não está em "Lúmen - Processos" nem em "Lúmen - Casos" (pasta-pai atual: ${info.parentPath}) — fora do escopo desta migração, não mexida.`,
        });
        continue;
      }
      if (!EXECUTAR) {
        planos.push({ caseId: c.id, title: c.title, type: c.type, status: "SERIA_MOVIDA", detail: 'Está em "Lúmen - Processos" — seria movida para "Lúmen - Casos".' });
        continue;
      }
      await moveDropboxFile(c.driveFolderId, casosRootId, officeId);
      planos.push({ caseId: c.id, title: c.title, type: c.type, status: "MOVIDA", detail: 'Movida de "Lúmen - Processos" para "Lúmen - Casos".' });
    } catch (e) {
      planos.push({ caseId: c.id, title: c.title, type: c.type, status: "PULADA", detail: `Erro inesperado ao processar esta pasta: ${msg(e)}. Nenhuma ação foi tomada.` });
    }
  }
  return planos;
}

// ============ RELATÓRIO / EXECUÇÃO ============

function statusLabel(s: Status): string {
  switch (s) {
    case "MOVIDA":
      return "MOVIDA";
    case "SERIA_MOVIDA":
      return "seria movida";
    case "JA_CORRETA":
      return "já correta";
    case "SEM_PASTA":
      return "sem pasta ainda";
    case "PULADA":
      return "PULADA";
  }
}

async function main() {
  console.log(EXECUTAR ? "=== EXECUÇÃO — movendo pastas de caso de verdade ===" : "=== RELATÓRIO (simulação — nada será movido) ===");
  console.log(EXECUTAR ? "" : "Rode com --executar depois de conferir esta saída para mover de verdade.\n");

  const offices = await prisma.office.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  let totalCasos = 0;
  let totalComPasta = 0;
  let totalMovidas = 0;
  let totalSeriaMovida = 0;
  let totalJaCorreta = 0;
  let totalSemPasta = 0;
  let totalPuladas = 0;
  let totalFalhas = 0;

  for (const office of offices) {
    const casos = (await prisma.case.findMany({
      where: { officeId: office.id, ...naturezaWhere("CASO") },
      select: { id: true, title: true, type: true, driveFolderId: true },
      orderBy: { title: "asc" },
    })) as CasoRow[];

    if (casos.length === 0) continue; // escritório sem nenhum Case de natureza "caso": nada a fazer, não polui o relatório

    const comPasta = casos.filter((c) => c.driveFolderId).length;
    totalCasos += casos.length;
    totalComPasta += comPasta;

    const provider = await providerFor(office.id);
    console.log(`\n--- ${office.name} (${provider}) ---`);
    console.log(`${casos.length} caso(s) não judicial/administrativo — ${comPasta} já com pasta criada.`);

    let planos: Plano[];
    try {
      switch (provider) {
        case "ONEDRIVE":
          planos = await processarOneDrive(office.id, casos);
          break;
        case "DROPBOX":
          planos = await processarDropbox(office.id, casos);
          break;
        default:
          planos = await processarGoogle(office.id, casos);
      }
    } catch (e) {
      console.log(`  FALHA ao processar este escritório inteiro: ${msg(e)}`);
      totalFalhas += casos.length;
      continue;
    }

    for (const p of planos) {
      console.log(`  [${statusLabel(p.status)}] ${p.title} (${p.type}) — ${p.detail}`);
      if (p.status === "MOVIDA") totalMovidas++;
      else if (p.status === "SERIA_MOVIDA") totalSeriaMovida++;
      else if (p.status === "JA_CORRETA") totalJaCorreta++;
      else if (p.status === "SEM_PASTA") totalSemPasta++;
      else if (p.status === "PULADA") {
        totalPuladas++;
        if (p.detail.startsWith("Erro inesperado")) totalFalhas++;
      }
    }
  }

  console.log("\n=== RESUMO ===");
  console.log(`Total de casos (natureza CASO) em todos os escritórios: ${totalCasos}`);
  console.log(`Com pasta criada: ${totalComPasta}`);
  console.log(`Sem pasta ainda (nada a fazer): ${totalSemPasta}`);
  console.log(`Já corretas (em "Lúmen - Casos"): ${totalJaCorreta}`);
  if (EXECUTAR) {
    console.log(`Movidas agora: ${totalMovidas}`);
  } else {
    console.log(`Seriam movidas (rode com --executar para mover de verdade): ${totalSeriaMovida}`);
  }
  console.log(`Puladas (fora do escopo, não encontradas, na lixeira, ou provedor não conectado): ${totalPuladas}`);
  if (totalFalhas > 0) {
    console.log(`⚠ Falhas inesperadas dentro das puladas acima: ${totalFalhas} — reveja os detalhes marcados "Erro inesperado" antes de considerar a migração concluída.`);
  }
}

main()
  .catch((err) => {
    console.error("\nFALHOU:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
