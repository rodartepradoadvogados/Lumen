"use server";

// Ação administrativa avulsa e ÚNICA (roda uma vez por escritório, não é um cron): corrige
// pastas de Processo/Atendimento que ficaram apontando para a raiz ANTIGA do Drive
// ("RP Financeiro - Processos"/"RP Financeiro - Atendimentos", ou qualquer outra raiz que não
// seja a atual) depois da migração rp-financeiro -> Lúmen multi-tenant.
//
// Fato central que torna isso seguro: no Google Drive, MOVER uma pasta troca só os parents dela
// — o id da pasta e o id de todo arquivo dentro dela permanecem os mesmos. Como
// Case.driveFolderId/Attendance.driveFolderId e Attachment.driveUrl guardam ids/URLs por id, não
// caminho, mover a pasta legada para a raiz nova não quebra NADA que já está salvo no banco.
// Não há, portanto, nenhuma escrita de driveFolderId aqui: se em algum ponto parecer necessário
// reescrever esse campo, é sinal de que a lógica abaixo está errada.
//
// O que esta ação NUNCA faz sozinha: decidir entre duas pastas homônimas que TÊM conteúdo dos
// dois lados (raiz antiga e raiz nova) — isso é registrado como CONFLITO (+ DriveSyncIssue, pra
// aparecer na Central de Alertas) e fica intocado até um humano resolver manualmente no Drive.
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import {
  hasPrimaryDriveCredential,
  getProcessosRootFolderId,
  getAtendimentosRootFolderId,
  listDriveChildren,
  moveDriveFile,
  renameDriveFolder,
  getDriveFileInfo,
  trashDriveFile,
  DRIVE_FOLDER_MIME_TYPE,
} from "@/lib/googleDrive";

export type DriveFolderMigrationEntry = {
  kind: "PROCESSO" | "ATENDIMENTO";
  entityId: string;
  title: string;
  folderId: string;
  action: "MOVER" | "JA_CORRETA" | "CONFLITO" | "PASTA_INEXISTENTE";
  detail: string; // explicação em português, pro usuário ler
  emptyDuplicateId?: string; // duplicado vazio que será/foi mandado pra lixeira
  conflictFolderId?: string; // pasta de nome parecido (não idêntico) e com conteúdo, candidata a ser o mesmo processo — ver pareceMesmoCaso
};

// Pasta que ESTÁ numa raiz legada mas que nenhum Processo/Atendimento do banco aponta. O laço
// principal desta ação anda pelo banco (Case/Attendance -> driveFolderId), então uma pasta assim
// é invisível para ele: ninguém a referencia. Sem esta varredura, a ação diria "tudo certo"
// enquanto documento de cliente segue esquecido numa raiz que nem o sync diário do Drive olha
// (lib/driveSync.ts só varre a raiz NOVA). Nunca é movida nem apagada — só reportada.
export type DriveFolderOrfa = {
  folderId: string;
  name: string;
  itens: number;
  driveUrl?: string | null;
  naRaizCorreta: boolean; // true = já está em "Lúmen - Processos"/"Lúmen - Atendimentos", só não tem Case/Attendance apontando pra ela
};

export type DriveFolderMigrationResult = {
  simulacao: boolean;
  entries: DriveFolderMigrationEntry[];
  orfas: DriveFolderOrfa[];
  movidas: number;
  conflitos: number;
  jaCorretas: number;
};

// issueType próprio desta migração, registrado no DriveSyncIssue só para os CONFLITO — ver
// comentário do campo issueType em prisma/schema.prisma, onde este valor está documentado junto
// dos usados por lib/driveSync.ts.
const CONFLITO_ISSUE_TYPE = "PASTA_PROCESSO_DUPLICADA_LEGADO_VS_NOVA";
const ORFA_ISSUE_TYPE = "PASTA_ORFA_NA_RAIZ_LEGADA";

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "erro desconhecido";
}

// Compara nomes de pasta ignorando acento, maiúscula/minúscula e espaços nas pontas/duplicados —
// mesma ideia de lib/driveSync.ts (normalizeForCompare), só que ali é pra SUGERIR o tipo mais
// parecido; aqui é pra decidir se duas pastas são "a mesma", então fica estrito (igualdade exata
// depois de normalizar, nunca substring) — evita casar "UNITINTAS" com "UNITINTAS COMÉRCIO...".
function normalizarNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Palavras comuns demais (raz\u00e3o social, conectivos) pra servirem de ind\u00edcio de que duas pastas
// s\u00e3o o mesmo processo \u2014 sem isso, "LTDA" ou "DE" por si s\u00f3 dispararia falso positivo em qualquer
// par de empresas.
const PALAVRAS_IGNORADAS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "com", "para", "por", "ltda", "epp", "eireli", "sa",
  "me", "cia", "jr", "junior",
]);

function palavrasSignificativas(s: string): Set<string> {
  return new Set(
    normalizarNome(s)
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 4 && !PALAVRAS_IGNORADAS.has(p))
  );
}

// Acusa nomes de pasta bem diferentes (grafia, abrevia\u00e7\u00e3o, "|" vs "x", raz\u00e3o social completa vs.
// apelido do cliente) que ainda assim s\u00e3o muito provavelmente o MESMO processo \u2014 caso real que
// motivou isto: a pasta antiga "All Car Motors | Cynthia Borges Ramos Macedo (IDPJ) x UNITINTAS
// COMERCIO DE TINTAS LTDA" e uma pasta j\u00e1 existente na raiz nova "ALL CAR MOTORS LTDA (Cynthia
// Macedo) x UNITINTAS COM\u00c9RCIO DE TINTAS LTDA", com conte\u00fado diferente dos dois lados. A
// compara\u00e7\u00e3o exata (normalizarNome) n\u00e3o as casa \u2014 nomes diferentes demais \u2014, mas 6+ palavras
// relevantes em comum (motors, cynthia, macedo, unitintas, comercio, tintas) deixam claro que s\u00e3o
// o mesmo caso. Sem esta checagem, a a\u00e7\u00e3o moveria a pasta antiga direto pra dentro da raiz nova,
// criando SILENCIOSAMENTE um segundo lugar pro mesmo processo \u2014 documento dividido em dois
// lugares, sem qualquer aviso.
function pareceMesmoCaso(a: string, b: string): boolean {
  const ta = palavrasSignificativas(a);
  const tb = palavrasSignificativas(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let compartilhadas = 0;
  for (const p of ta) if (tb.has(p)) compartilhadas++;
  const menor = Math.min(ta.size, tb.size);
  return compartilhadas >= 2 || compartilhadas / menor >= 0.6;
}

async function registrarConflito(
  officeId: string,
  kind: "PROCESSO" | "ATENDIMENTO",
  entityId: string,
  folderId: string,
  title: string,
  detail: string
): Promise<void> {
  const description = `A migração de pastas legadas do Drive encontrou um conflito para "${title}": a pasta antiga e uma pasta duplicada na raiz nova têm conteúdo diferente.`;
  await prisma.driveSyncIssue.upsert({
    where: { officeId_driveFileId_issueType: { officeId, driveFileId: folderId, issueType: CONFLITO_ISSUE_TYPE } },
    update: {
      description,
      suggestedFix: detail,
      caseId: kind === "PROCESSO" ? entityId : null,
      attendanceId: kind === "ATENDIMENTO" ? entityId : null,
      resolvedAt: null,
    },
    create: {
      officeId,
      driveFileId: folderId,
      issueType: CONFLITO_ISSUE_TYPE,
      description,
      suggestedFix: detail,
      caseId: kind === "PROCESSO" ? entityId : null,
      attendanceId: kind === "ATENDIMENTO" ? entityId : null,
    },
  });
}

async function registrarOrfa(officeId: string, orfa: DriveFolderOrfa): Promise<void> {
  const description = orfa.naRaizCorreta
    ? `A pasta "${orfa.name}" está dentro da raiz correta do Drive, mas nenhum processo ou atendimento do Lúmen aponta para ela (${orfa.itens} item(ns) dentro) — pode ser um processo cadastrado com título diferente do nome da pasta, ou uma pasta criada direto no Drive sem passar pelo site.`
    : `A pasta "${orfa.name}" está numa raiz antiga do Drive e nenhum processo ou atendimento do Lúmen aponta para ela (${orfa.itens} item(ns) dentro).`;
  const suggestedFix = orfa.naRaizCorreta
    ? `Abra a pasta no Drive e confira o conteúdo. Se pertencer a um processo já cadastrado no Lúmen, vincule os documentos pela tela de Anexos daquele processo (ou renomeie a pasta pra bater com o título do processo, se for só uma diferença de nome). Se não pertencer a nada, mande para a Lixeira.`
    : `Abra a pasta no Drive e confira o conteúdo. Se pertencer a um processo que já existe no Lúmen, mova os documentos para a pasta certa dentro de "Lúmen - Processos" — ou anexe-os pelo próprio site, na tela do processo. Se não pertencer a nada, mande para a Lixeira.`;
  await prisma.driveSyncIssue.upsert({
    where: { officeId_driveFileId_issueType: { officeId, driveFileId: orfa.folderId, issueType: ORFA_ISSUE_TYPE } },
    update: { description, suggestedFix, driveUrl: orfa.driveUrl ?? null, resolvedAt: null },
    create: { officeId, driveFileId: orfa.folderId, issueType: ORFA_ISSUE_TYPE, description, suggestedFix, driveUrl: orfa.driveUrl ?? null },
  });
}

// Se a pasta acabou de ser movida e o nome dela no Drive não bate mais com o título ATUAL da
// entidade (vários títulos foram renomeados pra convenção "Cliente x Parte Adversa" depois que a
// pasta já existia com o nome antigo), renomeia — mas só depois de mover, e sem derrubar o resto
// da migração se falhar (ex: nome duplicado por coincidência).
async function renomearSeNecessario(folderId: string, nomeAtualNoDrive: string, tituloDaEntidade: string, officeId: string): Promise<string | null> {
  if (nomeAtualNoDrive === tituloDaEntidade) return null;
  try {
    await renameDriveFolder(folderId, tituloDaEntidade, officeId);
    return null;
  } catch (e) {
    return `Pasta movida, mas não foi possível renomeá-la de "${nomeAtualNoDrive}" para "${tituloDaEntidade}": ${msg(e)}.`;
  }
}

async function processarEntidade(
  kind: "PROCESSO" | "ATENDIMENTO",
  entityId: string,
  title: string,
  folderId: string,
  rootCorreta: string,
  officeId: string,
  simulacao: boolean,
  raizesLegadasVistas: Set<string>
): Promise<DriveFolderMigrationEntry> {
  const base = { kind, entityId, title, folderId };
  try {
    const info = await getDriveFileInfo(folderId, officeId);
    if (!info) {
      return { ...base, action: "PASTA_INEXISTENTE", detail: "A pasta não foi encontrada no Drive (id não existe mais) — foi apagada definitivamente. Nenhuma ação foi tomada." };
    }
    if (info.trashed) {
      return { ...base, action: "PASTA_INEXISTENTE", detail: "A pasta está na Lixeira do Drive. Uma pasta no lixo continua reportando a última raiz em que estava, então a migração NÃO a traz de volta sozinha — se ela deveria existir, restaure pela Lixeira do Drive e rode a verificação outra vez." };
    }

    if (info.parents.includes(rootCorreta)) {
      return { ...base, action: "JA_CORRETA", detail: "A pasta já está na raiz correta do Drive. Nada a fazer." };
    }

    // Guarda em qual raiz legada esta pasta está, para a varredura de órfãs no fim — é assim que
    // as raízes antigas são DESCOBERTAS, sem precisar do nome delas ("RP Financeiro - Processos")
    // chumbado no código.
    for (const p of info.parents) raizesLegadasVistas.add(p);

    // A pasta está numa raiz legada (ou em qualquer outro lugar fora da raiz atual). Procura, na
    // raiz correta, uma subpasta homônima. Compara contra DOIS nomes, não só o nome atual da
    // pasta no Drive (info.name): também contra o título ATUAL da entidade no banco (title). Por
    // quê: getOrCreateCaseFolder/getOrCreateAttendanceFolder criam a pasta nova buscando por
    // título (ver lib/googleDrive.ts) — então um duplicado que nasceu depois da migração, num
    // momento em que o driveFolderId salvo apontava (errado) pra pasta antiga, tem o nome do
    // título ATUAL, não necessariamente o nome antigo que ficou gravado na pasta legada (vários
    // títulos foram renomeados pra convenção "Cliente x Parte Adversa" depois que a pasta antiga
    // já existia com o nome de antes). Sem essa segunda comparação, um par legítimo de
    // duplicados com nomes diferentes passaria batido como "sem duplicata" e seria movido sem
    // checar o conflito real do lado de lá.
    const irmasNaRaizCorreta = await listDriveChildren(officeId, rootCorreta);
    const candidatos = new Set([normalizarNome(info.name), normalizarNome(title)]);
    const homonima = irmasNaRaizCorreta.find((f) => f.mimeType === DRIVE_FOLDER_MIME_TYPE && candidatos.has(normalizarNome(f.name)));

    if (!homonima) {
      // Nome exato não bateu, mas isso não garante ausência de duplicata: nomes de pasta divergem
      // por abreviação, "|" vs "x", razão social completa vs. apelido do cliente. Antes de mover
      // direto, procura por uma pasta na raiz correta que COMPARTILHE palavras significativas com
      // o nome atual/título e que tenha conteúdo — achar uma sem checar teria criado
      // silenciosamente um segundo lugar pro mesmo processo.
      let provavelDuplicata: { id: string; name: string } | null = null;
      for (const f of irmasNaRaizCorreta) {
        if (f.mimeType !== DRIVE_FOLDER_MIME_TYPE) continue;
        if (!pareceMesmoCaso(f.name, info.name) && !pareceMesmoCaso(f.name, title)) continue;
        const conteudo = await listDriveChildren(officeId, f.id);
        if (conteudo.length > 0) {
          provavelDuplicata = f;
          break;
        }
      }

      if (provavelDuplicata) {
        const detail = `Não existe pasta com o nome exato "${info.name}" na raiz correta, mas existe uma pasta de nome PARECIDO e com conteúdo ("${provavelDuplicata.name}", id ${provavelDuplicata.id}) — muito provavelmente o mesmo processo, só com a pasta nomeada de outro jeito. Mover automaticamente criaria um segundo lugar para o mesmo processo. Confira as duas pastas no Drive e mescle manualmente antes de rodar esta ação de novo.`;
        if (!simulacao) {
          await registrarConflito(officeId, kind, entityId, folderId, title, detail);
        }
        return { ...base, action: "CONFLITO", detail, conflictFolderId: provavelDuplicata.id };
      }

      if (simulacao) {
        return { ...base, action: "MOVER", detail: `Não existe pasta com o nome "${info.name}" (nem com o título atual "${title}", nem qualquer pasta de nome parecido com conteúdo) na raiz correta — será movida diretamente para lá, sem conflito.` };
      }
      await moveDriveFile(folderId, rootCorreta, officeId);
      const avisoRename = await renomearSeNecessario(folderId, info.name, title, officeId);
      return { ...base, action: "MOVER", detail: avisoRename ?? `Pasta movida da raiz antiga para a raiz correta do Drive.` };
    }

    const conteudoHomonima = await listDriveChildren(officeId, homonima.id);
    if (conteudoHomonima.length === 0) {
      if (simulacao) {
        return {
          ...base,
          action: "MOVER",
          detail: `Existe uma pasta duplicada VAZIA com o mesmo nome ("${info.name}") na raiz correta — ela será enviada à Lixeira e a pasta com conteúdo será movida para o lugar dela.`,
          emptyDuplicateId: homonima.id,
        };
      }
      try {
        await trashDriveFile(homonima.id, officeId);
      } catch (e) {
        return {
          ...base,
          action: "MOVER",
          detail: `Falha ao enviar a duplicada vazia (id ${homonima.id}) para a Lixeira: ${msg(e)}. A pasta original NÃO foi movida, por segurança.`,
          emptyDuplicateId: homonima.id,
        };
      }
      await moveDriveFile(folderId, rootCorreta, officeId);
      const avisoRename = await renomearSeNecessario(folderId, info.name, title, officeId);
      return {
        ...base,
        action: "MOVER",
        detail: avisoRename ?? "Duplicada vazia enviada à Lixeira; pasta com conteúdo movida para a raiz correta no lugar dela.",
        emptyDuplicateId: homonima.id,
      };
    }

    // Homônima TEM conteúdo dos dois lados: conflito real, decisão humana. Não mexe em nada.
    const conteudoOriginal = await listDriveChildren(officeId, folderId);
    const detail = `Existe uma pasta com o mesmo nome ("${info.name}") na raiz correta (id ${homonima.id}, ${conteudoHomonima.length} item(ns)) e a pasta legada (id ${folderId}, ${conteudoOriginal.length} item(ns)) também tem conteúdo. Não é seguro decidir automaticamente qual manter — confira as duas pastas no Drive e mescle/mova manualmente antes de rodar esta ação de novo.`;
    if (!simulacao) {
      await registrarConflito(officeId, kind, entityId, folderId, title, detail);
    }
    return { ...base, action: "CONFLITO", detail };
  } catch (e) {
    // Qualquer falha inesperada (rede, permissão, etc.) cai aqui — não deve derrubar a migração
    // das outras entidades. Fica marcado como CONFLITO (precisa de olho humano) em vez de
    // qualquer ação automática, já que não temos certeza do estado real da pasta.
    return { ...base, action: "CONFLITO", detail: `Erro inesperado ao processar esta pasta: ${msg(e)}. Nenhuma ação foi tomada — verifique manualmente.` };
  }
}

export async function migrarPastasLegadasDoDrive(simulacao: boolean): Promise<DriveFolderMigrationResult | { error: string }> {
  const user = await getCurrentUser();
  if (!canConfigureIntegrations(user)) return { error: "Apenas administradores podem rodar esta ação." };

  const officeId = user.officeId;
  const connected = await hasPrimaryDriveCredential(officeId);
  if (!connected) {
    return { error: "Google Drive não está conectado para este escritório. Vá em Configurações e conecte a conta do Google antes de rodar esta ação." };
  }

  const [rootProcessos, rootAtendimentos] = await Promise.all([
    getProcessosRootFolderId(officeId),
    getAtendimentosRootFolderId(officeId),
  ]);

  const [cases, attendances] = await Promise.all([
    prisma.case.findMany({ where: { officeId, driveFolderId: { not: null } }, select: { id: true, title: true, driveFolderId: true } }),
    prisma.attendance.findMany({ where: { officeId, driveFolderId: { not: null } }, select: { id: true, subject: true, driveFolderId: true } }),
  ]);

  const entries: DriveFolderMigrationEntry[] = [];
  const raizesLegadasVistas = new Set<string>();

  for (const c of cases) {
    if (!c.driveFolderId) continue;
    entries.push(await processarEntidade("PROCESSO", c.id, c.title, c.driveFolderId, rootProcessos, officeId, simulacao, raizesLegadasVistas));
  }
  for (const a of attendances) {
    if (!a.driveFolderId) continue;
    entries.push(await processarEntidade("ATENDIMENTO", a.id, a.subject, a.driveFolderId, rootAtendimentos, officeId, simulacao, raizesLegadasVistas));
  }

  entries.sort((x, y) => x.title.localeCompare(y.title, "pt-BR"));

  // Varredura de órfãs: agora que se sabe QUAIS são as raízes legadas (descobertas pelos parents
  // das pastas acima, não por nome chumbado), lista o que sobrou dentro delas — e TAMBÉM varre a
  // raiz correta, porque uma pasta pode ter sido criada direto lá (ex: por engano, ou por um
  // fluxo antigo) sem nenhum Case/Attendance apontar pra ela; nesse caso ela é invisível tanto
  // para este laço (que anda pelo banco) quanto para o sync diário, que só confirma pastas cujo
  // nome bate com um processo conhecido. Toda pasta sem dono conhecido é reportada — nunca movida
  // nem apagada, porque não há como saber a quem ela pertence sem um humano olhar. Pastas já
  // explicadas por uma entrada acima (duplicada vazia que será/foi pra Lixeira, ou candidata a
  // conflito por nome parecido) não entram aqui de novo — já têm seu próprio aviso.
  const idsConhecidos = new Set<string>([
    ...cases.map((c) => c.driveFolderId).filter((v): v is string => Boolean(v)),
    ...attendances.map((a) => a.driveFolderId).filter((v): v is string => Boolean(v)),
    ...entries.map((e) => e.emptyDuplicateId).filter((v): v is string => Boolean(v)),
    ...entries.map((e) => e.conflictFolderId).filter((v): v is string => Boolean(v)),
  ]);
  const orfas: DriveFolderOrfa[] = [];
  const raizesParaVarrer = new Set<string>([...raizesLegadasVistas, rootProcessos, rootAtendimentos]);
  for (const raiz of raizesParaVarrer) {
    const naRaizCorreta = raiz === rootProcessos || raiz === rootAtendimentos;
    try {
      for (const filho of await listDriveChildren(officeId, raiz)) {
        if (filho.mimeType !== DRIVE_FOLDER_MIME_TYPE) continue;
        if (idsConhecidos.has(filho.id)) continue;
        const conteudo = await listDriveChildren(officeId, filho.id);
        if (naRaizCorreta && conteudo.length === 0) continue; // pasta vazia na raiz certa não é problema de ninguém
        orfas.push({ folderId: filho.id, name: filho.name, itens: conteudo.length, driveUrl: filho.webViewLink, naRaizCorreta });
      }
    } catch {
      // Uma raiz ilegível não invalida a migração das pastas que já foram tratadas acima.
    }
  }

  if (!simulacao) {
    for (const o of orfas) {
      try {
        await registrarOrfa(officeId, o);
      } catch {
        // Falha ao registrar o alerta não deve derrubar o resultado já apurado.
      }
    }
  }

  return {
    simulacao,
    entries,
    orfas,
    movidas: entries.filter((e) => e.action === "MOVER").length,
    conflitos: entries.filter((e) => e.action === "CONFLITO").length,
    jaCorretas: entries.filter((e) => e.action === "JA_CORRETA").length,
  };
}
