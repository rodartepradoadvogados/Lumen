"use server";

// Unificação de cadastros de cliente duplicados (ex.: "P França" existindo duas vezes) — cada
// Client tem no máximo UMA Assessoria (Assessoria.clientId é @unique), então "duas pastas da
// mesma empresa em Assessoria" só é possível havendo dois registros de Client para ela. Esta
// ação resolve as duas pontas: os registros no banco (processos, atendimentos, honorários,
// recebíveis, publicações, termos de vigilância) e, quando as duas têm Assessoria com pasta no
// Drive, o conteúdo físico das duas pastas.
//
// Mesmo desenho de duas etapas de lib/actions/driveParentMigration.ts (que já é o molde confiável
// do produto para isto): `simulacao: true` primeiro, só relatório, nada é alterado; a confirmação
// é uma chamada separada e explícita. E a mesma regra de decisão humana diante de ambiguidade:
// pasta homônima VAZIA no destino é substituída automaticamente (mover pra lá, mandar a vazia pra
// Lixeira); pasta homônima COM conteúdo nunca é decidida sozinha — vira "conflito" no relatório,
// e a ação não toca nela.
//
// Escopo deliberado: NUNCA apaga o Client duplicado nem a Assessoria duplicada — a Assessoria
// duplicada é marcada ENCERRADA (preserva o histórico como registro auditável) e o Client
// duplicado fica sem nenhuma relação apontando pra ele, então quem quiser removê-lo de vez pode
// fazer isso manualmente pela tela de Clientes (Contatos), onde já existe o botão de excluir —
// não é papel desta ação decidir isso.
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { listDriveChildren, moveDriveFile, trashDriveFile, DRIVE_FOLDER_MIME_TYPE } from "@/lib/googleDrive";

// Mesma normalização de nome (ignora acento/caixa/espaço) que lib/actions/driveParentMigration.ts
// e lib/actions/driveFolderMigration.ts já usam, cada uma com sua própria cópia local enxuta —
// não exportada de nenhuma das duas, então repetida aqui pelo mesmo motivo delas.
function normalizarNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

async function exigirAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." } as const;
  if (!user.isAdmin) return { error: "Apenas administradores podem unificar cadastros." } as const;
  return { user } as const;
}

// ---------------------------------------------------------------------------
// Diagnóstico: quais clientes deste escritório parecem duplicados
// ---------------------------------------------------------------------------

export type ClienteCandidato = {
  id: string;
  nome: string;
  criadoEm: string;
  temAssessoria: boolean;
  assessoriaId: string | null;
  assessoriaStatus: string | null;
  temPastaDrive: boolean;
  processos: number;
  atendimentos: number;
  recebiveis: number;
  honorarios: number;
  publicacoes: number;
};

export type GrupoClientesDuplicados = { chave: string; clientes: ClienteCandidato[] };

export async function listarClientesDuplicados(): Promise<{ error?: string; grupos?: GrupoClientesDuplicados[] }> {
  const auth = await exigirAdmin();
  if ("error" in auth) return auth;

  const clientes = await prisma.client.findMany({
    where: { officeId: auth.user.officeId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      assessoria: { select: { id: true, status: true, driveFolderId: true } },
      _count: { select: { cases: true, receivables: true, honorarioLancamentos: true, publications: true } },
    },
  });

  // Contagem de atendimentos à parte: Client.attendances usa a relação nomeada "AttendanceClient"
  // (ver prisma/schema.prisma), que o `_count` acima já resolveria pelo nome do campo — mas
  // manter explícito aqui documenta por que "atendimentos" não está no mesmo _count de cima.
  const attCounts = await prisma.attendance.groupBy({
    by: ["clientId"],
    where: { officeId: auth.user.officeId, clientId: { in: clientes.map((c) => c.id) } },
    _count: { _all: true },
  });
  const attByClient = new Map(attCounts.map((a) => [a.clientId, a._count._all]));

  const candidatos: ClienteCandidato[] = clientes.map((c) => ({
    id: c.id,
    nome: c.name,
    criadoEm: c.createdAt.toISOString(),
    temAssessoria: Boolean(c.assessoria),
    assessoriaId: c.assessoria?.id ?? null,
    assessoriaStatus: c.assessoria?.status ?? null,
    temPastaDrive: Boolean(c.assessoria?.driveFolderId),
    processos: c._count.cases,
    atendimentos: attByClient.get(c.id) ?? 0,
    recebiveis: c._count.receivables,
    honorarios: c._count.honorarioLancamentos,
    publicacoes: c._count.publications,
  }));

  const porNome = new Map<string, ClienteCandidato[]>();
  for (const c of candidatos) {
    const chave = normalizarNome(c.nome);
    const grupo = porNome.get(chave) ?? [];
    grupo.push(c);
    porNome.set(chave, grupo);
  }

  const grupos: GrupoClientesDuplicados[] = Array.from(porNome.entries())
    .filter(([, membros]) => membros.length > 1)
    .map(([chave, membros]) => ({
      chave,
      clientes: membros.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    }))
    .sort((a, b) => a.chave.localeCompare(b.chave, "pt-BR"));

  return { grupos };
}

// ---------------------------------------------------------------------------
// Simulação e confirmação da unificação de DOIS clientes específicos
// ---------------------------------------------------------------------------

export type ItemMovido = { rotulo: string; quantidade: number };
export type ConflitoPasta = { caminho: string; motivo: string };

export type SimulacaoUnificacao = {
  canonico: { id: string; nome: string };
  duplicata: { id: string; nome: string };
  moveria: ItemMovido[];
  // null = nenhum dos dois tem Assessoria com pasta no Drive, então não há nada físico a
  // conferir; array vazio = há pasta(s), mas nada em conflito.
  conflitosPastaDrive: ConflitoPasta[] | null;
  avisos: string[];
};

async function contarRelacoesDeCliente(clienteId: string, officeId: string) {
  const [processos, atendimentos, recebiveis, honorarios, publicacoes, termos] = await Promise.all([
    prisma.case.count({ where: { clientId: clienteId, officeId } }),
    prisma.attendance.count({ where: { clientId: clienteId, officeId } }),
    prisma.receivable.count({ where: { clientId: clienteId, officeId } }),
    prisma.honorarioLancamento.count({ where: { clientId: clienteId, officeId } }),
    prisma.publication.count({ where: { clientId: clienteId, officeId } }),
    prisma.termoVigilancia.count({ where: { clientId: clienteId, officeId } }),
  ]);
  return { processos, atendimentos, recebiveis, honorarios, publicacoes, termos };
}

async function contarRelacoesDeAssessoria(assessoriaId: string, officeId: string) {
  const [documentos, pareceres, honorarios, licitacoes, anotacoes, envios] = await Promise.all([
    prisma.assessoriaDocumento.count({ where: { assessoriaId, officeId } }),
    prisma.parecer.count({ where: { assessoriaId, officeId } }),
    prisma.honorario.count({ where: { assessoriaId, officeId } }),
    prisma.licitacao.count({ where: { assessoriaId, officeId } }),
    prisma.anotacao.count({ where: { assessoriaId, officeId } }),
    prisma.documentoEnvio.count({ where: { assessoriaId, officeId } }),
  ]);
  return { documentos, pareceres, honorarios, licitacoes, anotacoes, envios };
}

// Percorre (sem mexer em nada) o que uma mesclagem de pasta encontraria: para cada item da
// origem, existe homônimo no destino? Se existir e os dois forem pasta com conteúdo, desce mais
// um nível — é assim que a pasta "Pareceres" de cada lado (que quase sempre existe nos dois,
// porque toda Assessoria já nasce com as 4 subpastas fixas) tem suas DEMANDAS conferidas uma a
// uma, em vez de a subpasta inteira virar um conflito só por ter conteúdo.
async function preverMesclaDePasta(officeId: string, origemId: string, destinoId: string, caminho: string, conflitos: ConflitoPasta[]): Promise<void> {
  const [origemFilhos, destinoFilhos] = await Promise.all([listDriveChildren(officeId, origemId), listDriveChildren(officeId, destinoId)]);
  for (const filho of origemFilhos) {
    const homonimo = destinoFilhos.find((d) => normalizarNome(d.name) === normalizarNome(filho.name));
    if (!homonimo) continue; // sem homônimo — seria movido direto, nunca é conflito
    if (homonimo.mimeType !== DRIVE_FOLDER_MIME_TYPE || filho.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
      conflitos.push({ caminho: `${caminho}/${filho.name}`, motivo: "Já existe um item com este nome no destino." });
      continue;
    }
    const conteudo = await listDriveChildren(officeId, homonimo.id);
    if (conteudo.length === 0) continue; // homônima vazia — seria substituída automaticamente
    await preverMesclaDePasta(officeId, filho.id, homonimo.id, `${caminho}/${filho.name}`, conflitos);
  }
}

export async function simularUnificacaoClientes(canonicoId: string, duplicataId: string): Promise<{ error?: string; simulacao?: SimulacaoUnificacao }> {
  const auth = await exigirAdmin();
  if ("error" in auth) return auth;
  if (canonicoId === duplicataId) return { error: "Selecione dois cadastros diferentes." };

  const [canonico, duplicata] = await Promise.all([
    prisma.client.findFirst({ where: { id: canonicoId, officeId: auth.user.officeId }, include: { assessoria: true } }),
    prisma.client.findFirst({ where: { id: duplicataId, officeId: auth.user.officeId }, include: { assessoria: true } }),
  ]);
  if (!canonico || !duplicata) return { error: "Cadastro não encontrado." };

  const [relDuplicata, relAssessoriaDuplicata] = await Promise.all([
    contarRelacoesDeCliente(duplicataId, auth.user.officeId),
    duplicata.assessoria ? contarRelacoesDeAssessoria(duplicata.assessoria.id, auth.user.officeId) : null,
  ]);

  // Filtrado uma única vez, no final (ver return) — os itens de Assessoria abaixo entram nesta
  // mesma lista antes do filtro, então filtrar aqui já seria refeito ali mesmo.
  const moveria: ItemMovido[] = [
    { rotulo: "Processos e casos", quantidade: relDuplicata.processos },
    { rotulo: "Atendimentos", quantidade: relDuplicata.atendimentos },
    { rotulo: "Lançamentos a receber", quantidade: relDuplicata.recebiveis },
    { rotulo: "Lançamentos de honorário (financeiro)", quantidade: relDuplicata.honorarios },
    { rotulo: "Publicações vinculadas diretamente ao cliente", quantidade: relDuplicata.publicacoes },
    { rotulo: "Termos de vigilância (Radar de Publicações Administrativas)", quantidade: relDuplicata.termos },
  ];

  const avisos: string[] = [];
  let conflitosPastaDrive: ConflitoPasta[] | null = null;

  if (duplicata.assessoria && relAssessoriaDuplicata) {
    const r = relAssessoriaDuplicata;
    moveria.push(
      { rotulo: "Documentos da assessoria", quantidade: r.documentos },
      { rotulo: "Demandas (pareceres)", quantidade: r.pareceres },
      { rotulo: "Honorários da assessoria (financeiro)", quantidade: r.honorarios },
      { rotulo: "Licitações", quantidade: r.licitacoes },
      { rotulo: "Anotações", quantidade: r.anotacoes },
      { rotulo: "Envios de documento (e-mail/WhatsApp)", quantidade: r.envios }
    );

    if (!canonico.assessoria) {
      avisos.push(
        `"${canonico.name}" ainda não tem Assessoria própria — a Assessoria de "${duplicata.name}" (com tudo o que já tem: documentos, demandas, honorários) passa a ser a de "${canonico.name}", sem precisar mexer em nenhuma pasta do Drive.`
      );
    } else if (duplicata.assessoria.driveFolderId && canonico.assessoria.driveFolderId) {
      conflitosPastaDrive = [];
      await preverMesclaDePasta(
        auth.user.officeId,
        duplicata.assessoria.driveFolderId,
        canonico.assessoria.driveFolderId,
        duplicata.name,
        conflitosPastaDrive
      );
    } else if (duplicata.assessoria.driveFolderId && !canonico.assessoria.driveFolderId) {
      avisos.push(`"${canonico.name}" ainda não tem pasta no Drive — a pasta de "${duplicata.name}" passa a ser a pasta da assessoria unificada, sem mover nenhum arquivo.`);
    }
  }

  return {
    simulacao: {
      canonico: { id: canonico.id, nome: canonico.name },
      duplicata: { id: duplicata.id, nome: duplicata.name },
      moveria: moveria.filter((i) => i.quantidade > 0),
      conflitosPastaDrive,
      avisos,
    },
  };
}

// ---------------------------------------------------------------------------
// Confirmação — só chamada depois que o admin já viu a simulação
// ---------------------------------------------------------------------------

export type ResultadoUnificacao = {
  movidos: ItemMovido[];
  conflitosPastaDrive: ConflitoPasta[];
  // null = não havia pasta física dos dois lados a mesclar (um dos dois não tinha Assessoria com
  // pasta, ou nenhum dos dois tinha Assessoria).
  pastaDuplicataEsvaziada: boolean | null;
  avisos: string[];
};

// Igual a preverMesclaDePasta, mas executa de verdade: move o que não tem homônimo, substitui
// homônima vazia (manda a vazia pra Lixeira, move a de origem pro lugar dela), desce um nível
// quando a homônima tem conteúdo — e ao voltar da recursão, se a pasta de origem ficou vazia,
// ela também vai pra Lixeira (não sobra casca inútil pra trás). Nunca usa deleteDriveFile: toda
// remoção aqui é reversível por 30 dias.
async function mesclarPastaDeVerdade(
  officeId: string,
  origemId: string,
  destinoId: string,
  caminho: string,
  conflitos: ConflitoPasta[]
): Promise<void> {
  const [origemFilhos, destinoFilhos] = await Promise.all([listDriveChildren(officeId, origemId), listDriveChildren(officeId, destinoId)]);
  for (const filho of origemFilhos) {
    const homonimo = destinoFilhos.find((d) => normalizarNome(d.name) === normalizarNome(filho.name));
    if (!homonimo) {
      await moveDriveFile(filho.id, destinoId, officeId);
      continue;
    }
    if (homonimo.mimeType !== DRIVE_FOLDER_MIME_TYPE || filho.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
      conflitos.push({ caminho: `${caminho}/${filho.name}`, motivo: "Já existia um item com este nome no destino — não mexido, os dois continuam existindo." });
      continue;
    }
    const conteudo = await listDriveChildren(officeId, homonimo.id);
    if (conteudo.length === 0) {
      await trashDriveFile(homonimo.id, officeId);
      await moveDriveFile(filho.id, destinoId, officeId);
      continue;
    }
    await mesclarPastaDeVerdade(officeId, filho.id, homonimo.id, `${caminho}/${filho.name}`, conflitos);
    const restou = await listDriveChildren(officeId, filho.id);
    if (restou.length === 0) await trashDriveFile(filho.id, officeId);
  }
}

export async function confirmarUnificacaoClientes(canonicoId: string, duplicataId: string): Promise<{ error?: string; resultado?: ResultadoUnificacao }> {
  const auth = await exigirAdmin();
  if ("error" in auth) return auth;
  if (canonicoId === duplicataId) return { error: "Selecione dois cadastros diferentes." };

  const [canonico, duplicata] = await Promise.all([
    prisma.client.findFirst({ where: { id: canonicoId, officeId: auth.user.officeId }, include: { assessoria: true } }),
    prisma.client.findFirst({ where: { id: duplicataId, officeId: auth.user.officeId }, include: { assessoria: true } }),
  ]);
  if (!canonico || !duplicata) return { error: "Cadastro não encontrado." };

  const officeId = auth.user.officeId;
  const movidos: ItemMovido[] = [];
  const avisos: string[] = [];

  // ---- 1) Relações que apontam direto para o CLIENTE ----
  const rCase = await prisma.case.updateMany({ where: { clientId: duplicataId, officeId }, data: { clientId: canonicoId } });
  if (rCase.count) movidos.push({ rotulo: "Processos e casos", quantidade: rCase.count });

  const rAttendance = await prisma.attendance.updateMany({ where: { clientId: duplicataId, officeId }, data: { clientId: canonicoId } });
  if (rAttendance.count) movidos.push({ rotulo: "Atendimentos", quantidade: rAttendance.count });

  const rReceivable = await prisma.receivable.updateMany({ where: { clientId: duplicataId, officeId }, data: { clientId: canonicoId } });
  if (rReceivable.count) movidos.push({ rotulo: "Lançamentos a receber", quantidade: rReceivable.count });

  const rHonorLanc = await prisma.honorarioLancamento.updateMany({ where: { clientId: duplicataId, officeId }, data: { clientId: canonicoId } });
  if (rHonorLanc.count) movidos.push({ rotulo: "Lançamentos de honorário (financeiro)", quantidade: rHonorLanc.count });

  const rPub = await prisma.publication.updateMany({ where: { clientId: duplicataId, officeId }, data: { clientId: canonicoId } });
  if (rPub.count) movidos.push({ rotulo: "Publicações vinculadas diretamente ao cliente", quantidade: rPub.count });

  const rTermo = await prisma.termoVigilancia.updateMany({ where: { clientId: duplicataId, officeId }, data: { clientId: canonicoId } });
  if (rTermo.count) movidos.push({ rotulo: "Termos de vigilância (Radar de Publicações Administrativas)", quantidade: rTermo.count });

  // CaseClient (litisconsórcio) tem @@unique([caseId, clientId]) — um updateMany em massa
  // quebraria se o MESMO processo já estivesse ligado aos dois clientes duplicados ao mesmo
  // tempo. Por isso vai linha a linha: quando colide, a ligação com o canônico já existe e
  // continua valendo, então a da duplicata é só removida (redundante), não perdida.
  const caseClientsDuplicata = await prisma.caseClient.findMany({ where: { clientId: duplicataId } });
  let caseClientMovidos = 0;
  for (const cc of caseClientsDuplicata) {
    try {
      await prisma.caseClient.update({ where: { id: cc.id }, data: { clientId: canonicoId } });
      caseClientMovidos++;
    } catch {
      await prisma.caseClient.delete({ where: { id: cc.id } }).catch(() => {});
    }
  }
  if (caseClientMovidos) movidos.push({ rotulo: "Vínculos de litisconsórcio", quantidade: caseClientMovidos });

  // ---- 2) ASSESSORIA ----
  let pastaDuplicataEsvaziada: boolean | null = null;
  const conflitosPastaDrive: ConflitoPasta[] = [];

  if (duplicata.assessoria) {
    if (!canonico.assessoria) {
      // Só a duplicata tinha Assessoria — ela passa a ser a Assessoria do canônico. Nenhum
      // documento se move: é a mesma pasta de sempre, só o dono (Client) muda.
      await prisma.assessoria.update({ where: { id: duplicata.assessoria.id }, data: { clientId: canonicoId } });
      movidos.push({ rotulo: "Assessoria (com todo o conteúdo)", quantidade: 1 });
    } else {
      const assessoriaDuplicataId = duplicata.assessoria.id;
      const assessoriaCanonicoId = canonico.assessoria.id;

      const rDocs = await prisma.assessoriaDocumento.updateMany({ where: { assessoriaId: assessoriaDuplicataId, officeId }, data: { assessoriaId: assessoriaCanonicoId } });
      if (rDocs.count) movidos.push({ rotulo: "Documentos da assessoria", quantidade: rDocs.count });

      const rPareceres = await prisma.parecer.updateMany({ where: { assessoriaId: assessoriaDuplicataId, officeId }, data: { assessoriaId: assessoriaCanonicoId } });
      if (rPareceres.count) movidos.push({ rotulo: "Demandas (pareceres)", quantidade: rPareceres.count });

      const rLicitacoes = await prisma.licitacao.updateMany({ where: { assessoriaId: assessoriaDuplicataId, officeId }, data: { assessoriaId: assessoriaCanonicoId } });
      if (rLicitacoes.count) movidos.push({ rotulo: "Licitações", quantidade: rLicitacoes.count });

      const rAnotacoes = await prisma.anotacao.updateMany({ where: { assessoriaId: assessoriaDuplicataId, officeId }, data: { assessoriaId: assessoriaCanonicoId } });
      if (rAnotacoes.count) movidos.push({ rotulo: "Anotações", quantidade: rAnotacoes.count });

      const rEnvios = await prisma.documentoEnvio.updateMany({ where: { assessoriaId: assessoriaDuplicataId, officeId }, data: { assessoriaId: assessoriaCanonicoId } });
      if (rEnvios.count) movidos.push({ rotulo: "Envios de documento (e-mail/WhatsApp)", quantidade: rEnvios.count });

      // Honorario tem @@unique([assessoriaId, competencia]) — mesmo raciocínio do CaseClient
      // acima: se as duas assessorias já lançaram honorário no MESMO mês, não dá pra mesclar
      // sozinho (duas cobranças reais do mesmo mês) — fica registrado como aviso, não decidido
      // automaticamente, e o financeiro segue com os dois lançamentos onde já estavam.
      const honorariosDuplicata = await prisma.honorario.findMany({ where: { assessoriaId: assessoriaDuplicataId, officeId } });
      let honorariosMovidos = 0;
      const honorariosEmConflito: string[] = [];
      for (const h of honorariosDuplicata) {
        try {
          await prisma.honorario.update({ where: { id: h.id }, data: { assessoriaId: assessoriaCanonicoId } });
          honorariosMovidos++;
        } catch {
          honorariosEmConflito.push(h.competencia);
        }
      }
      if (honorariosMovidos) movidos.push({ rotulo: "Honorários da assessoria (financeiro)", quantidade: honorariosMovidos });
      if (honorariosEmConflito.length) {
        avisos.push(
          `${honorariosEmConflito.length} honorário(s) da assessoria duplicada (competência ${honorariosEmConflito.join(", ")}) não foram movidos porque a assessoria canônica já tem lançamento no mesmo mês — revise manualmente em Financeiro → Honorários.`
        );
      }

      // ---- Pasta física no Drive ----
      if (duplicata.assessoria.driveFolderId && canonico.assessoria.driveFolderId) {
        await mesclarPastaDeVerdade(officeId, duplicata.assessoria.driveFolderId, canonico.assessoria.driveFolderId, duplicata.name, conflitosPastaDrive);
        const restou = await listDriveChildren(officeId, duplicata.assessoria.driveFolderId);
        pastaDuplicataEsvaziada = restou.length === 0;
        if (pastaDuplicataEsvaziada) await trashDriveFile(duplicata.assessoria.driveFolderId, officeId);
      } else if (duplicata.assessoria.driveFolderId && !canonico.assessoria.driveFolderId) {
        // Canônica não tinha pasta ainda — a da duplicata passa a ser a pasta da Assessoria
        // canônica. Não move nenhum arquivo: só troca qual Assessoria "é dona" desse id de pasta.
        await prisma.assessoria.update({ where: { id: assessoriaCanonicoId }, data: { driveFolderId: duplicata.assessoria.driveFolderId } });
        pastaDuplicataEsvaziada = null;
      }

      // A Assessoria duplicada NUNCA é apagada — vira histórico encerrado. Preserva auditoria
      // (quem pagou o quê, quando) sem deixar a empresa aparecer "ativa" duas vezes em lugar
      // nenhum do sistema.
      await prisma.assessoria.update({ where: { id: assessoriaDuplicataId }, data: { status: "ENCERRADA" } });
    }
  }

  revalidatePath("/assessoria");
  revalidatePath("/contatos/clientes");
  revalidatePath("/configuracoes");

  return {
    resultado: { movidos, conflitosPastaDrive, pastaDuplicataEsvaziada, avisos },
  };
}
