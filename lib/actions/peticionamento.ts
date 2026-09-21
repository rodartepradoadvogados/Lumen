"use server";

// SERVER ACTIONS da aba de Peticionamento. Cada ação aqui aplica, de verdade, as travas cujo
// desenho mora nos módulos puros lib/peticionamento*.ts — nunca confia na tela para ter aplicado
// a régua antes de chamar (a especificação §3 e §8 são explícitas: hard gate é código, não
// combinado com o front-end).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import {
  uploadFileToDriveFolder,
  getOrCreatePeticionamentoSessaoFolder,
  getOrCreateCaseFolder,
  getOrCreateAttendanceFolder,
  getOrCreateAssessoriaCompanyFolderCached,
} from "@/lib/googleDrive";
import { podeAcessarAba, podeAnexar, avaliarExportacao } from "@/lib/peticionamentoAcesso";
import { avaliarProntidao } from "@/lib/peticionamentoMinimo";
import { avaliarCandidatos, validarNovoVinculo, ehSessaoAvulsa, type ItemDeContexto, type TipoVinculo } from "@/lib/peticionamentoContexto";
import { MATERIAS_DO_LUMEN, validarNovaMateria } from "@/lib/peticionamentoMateria";
import { avaliarJanela, type ItemDeContexto as ItemDeJanela } from "@/lib/peticionamentoJanelaDeContexto";
import { montarMensagemParaHermes } from "@/lib/peticionamentoPrompt";
import { interpretarRespostaHermes } from "@/lib/peticionamentoRespostaHermes";
import { garantirFecho } from "@/lib/peticionamentoFecho";
import { filtrarNotaDeRiscos, comAvisoDeContextoResumido } from "@/lib/peticionamentoRiscos";
import { montarNotaObrigatoria } from "@/lib/peticionamentoNotaObrigatoria";
import { montarNomeArquivoPeticao } from "@/lib/peticionamentoNomeArquivo";
import { montarPeticaoWord } from "@/lib/peticionamentoDocx";
import { hermesConfigurado, perguntarAoHermesComPerfil, perfilDePeticionamento, FalhaDoHermes } from "@/lib/hermesPonte";
import { mensagemDeErro } from "@/lib/mensagemDeErro";

type VinculoJson = { caseIds: string[]; attendanceIds: string[]; assessoriaIds: string[] };

function lerVinculo(sessao: { vinculoCaseIds: unknown; vinculoAttendanceIds: unknown; vinculoAssessoriaIds: unknown }): VinculoJson {
  const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
  return { caseIds: arr(sessao.vinculoCaseIds), attendanceIds: arr(sessao.vinculoAttendanceIds), assessoriaIds: arr(sessao.vinculoAssessoriaIds) };
}

async function exigirAcessoAba() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sessão inválida.");
  if (!podeAcessarAba(user)) throw new Error("Recepção e demais papéis sem OAB/estágio não têm acesso à aba de Peticionamento.");
  return user;
}

/** Toda leitura/escrita de UMA sessão reconfere officeId — nunca confia num id vindo do cliente sozinho. */
async function carregarSessaoOuFalhar(sessaoId: string, officeId: string) {
  const sessao = await prisma.peticionamentoSessao.findFirst({ where: { id: sessaoId, officeId } });
  if (!sessao) throw new Error("Sessão de peticionamento não encontrada.");
  return sessao;
}

// ── SESSÃO ───────────────────────────────────────────────────────────────────────────────────

export async function criarSessaoPeticionamento(): Promise<{ id: string } | { error: string }> {
  const user = await exigirAcessoAba();
  const sessao = await prisma.peticionamentoSessao.create({
    data: { officeId: user.officeId, criadoPorId: user.id },
  });
  revalidatePath("/peticionamento");
  return { id: sessao.id };
}

export async function obterSessaoPeticionamento(sessaoId: string) {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);
  return sessao;
}

// ── MATÉRIA (decisions.md §9 item 4: nova matéria vale só para este escritório) ────────────────

export async function listarMateriasParaEscritorio(): Promise<{ nome: string; ehDoEscritorio: boolean }[]> {
  const user = await exigirAcessoAba();
  const doEscritorio = await prisma.peticionamentoMateria.findMany({ where: { officeId: user.officeId }, orderBy: { nome: "asc" } });
  return [
    ...MATERIAS_DO_LUMEN.map((nome) => ({ nome, ehDoEscritorio: false })),
    ...doEscritorio.map((m) => ({ nome: m.nome, ehDoEscritorio: true })),
  ];
}

export async function adicionarMateriaDoEscritorio(nomeDigitado: string): Promise<{ nome: string } | { error: string }> {
  const user = await exigirAcessoAba();
  const jaExistentes = await prisma.peticionamentoMateria.findMany({ where: { officeId: user.officeId }, select: { nome: true } });
  const resultado = validarNovaMateria(nomeDigitado, jaExistentes.map((m) => m.nome));
  if (!resultado.ok) return { error: resultado.erro };
  await prisma.peticionamentoMateria.create({ data: { officeId: user.officeId, nome: resultado.nomeNormalizado, criadoPorId: user.id } });
  revalidatePath("/peticionamento/contexto");
  return { nome: resultado.nomeNormalizado };
}

export async function definirMateria(sessaoId: string, materiaNome: string, ehDoEscritorio: boolean): Promise<{ ok: true } | { error: string }> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { materiaNome, materiaEhDoEscritorio: ehDoEscritorio } });
  return { ok: true };
}

// ── CONTEXTO (a trava de cliente é aplicada AQUI, não só na tela) ──────────────────────────────

export type CandidatoDeContexto = ItemDeContexto & { titulo: string; subtitulo: string };

type CandidatoResolvido = CandidatoDeContexto & { bloqueado: boolean; motivoBloqueio: string | null; selecionado: boolean };

export async function buscarCandidatosDeContexto(sessaoId: string): Promise<{
  processos: CandidatoResolvido[];
  atendimentos: CandidatoResolvido[];
  assessorias: CandidatoResolvido[];
  clienteTravado: { id: string; nome: string | null } | null;
}> {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const vinculoAtual = lerVinculo(sessao);

  const [cases, attendances, assessorias] = await Promise.all([
    prisma.case.findMany({
      where: { officeId: user.officeId },
      select: { id: true, title: true, processNumber: true, court: true, clientId: true, client: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.attendance.findMany({
      where: { officeId: user.officeId },
      select: { id: true, subject: true, clientName: true, channel: true, clientId: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.assessoria.findMany({
      where: { officeId: user.officeId },
      select: { id: true, clientId: true, client: { select: { name: true } } },
      take: 200,
    }),
  ]);

  const clienteTravado = sessao.clienteId ? { id: sessao.clienteId, nome: sessao.clienteNome } : null;

  const itensCase: CandidatoDeContexto[] = cases.map((c) => ({
    id: c.id,
    tipo: "case",
    clienteId: c.clientId,
    clienteNome: c.client?.name ?? null,
    titulo: c.processNumber ? `Processo nº ${c.processNumber}` : c.title,
    subtitulo: [c.client?.name, c.court].filter(Boolean).join(" — "),
  }));
  const itensAtend: CandidatoDeContexto[] = attendances.map((a) => ({
    id: a.id,
    tipo: "attendance",
    clienteId: a.clientId,
    clienteNome: a.clientName,
    titulo: `Atendimento — ${a.subject}`,
    subtitulo: `${a.clientName} · ${a.channel}`,
  }));
  const itensAsses: CandidatoDeContexto[] = assessorias.map((a) => ({
    id: a.id,
    tipo: "assessoria",
    clienteId: a.clientId,
    clienteNome: a.client.name,
    titulo: `Assessoria — ${a.client.name}`,
    subtitulo: "Assessoria jurídica continuada",
  }));

  const avCase = avaliarCandidatos(itensCase, clienteTravado?.id ?? null);
  const avAtend = avaliarCandidatos(itensAtend, clienteTravado?.id ?? null);
  const avAsses = avaliarCandidatos(itensAsses, clienteTravado?.id ?? null);

  const juntar = (base: CandidatoDeContexto[], avaliados: (ItemDeContexto & { bloqueado: boolean; motivoBloqueio: string | null })[], jaSelecionados: string[]): CandidatoResolvido[] =>
    base.map((b, i) => ({ ...b, bloqueado: avaliados[i].bloqueado, motivoBloqueio: avaliados[i].motivoBloqueio, selecionado: jaSelecionados.includes(b.id) }));

  return {
    processos: juntar(itensCase, avCase, vinculoAtual.caseIds),
    atendimentos: juntar(itensAtend, avAtend, vinculoAtual.attendanceIds),
    assessorias: juntar(itensAsses, avAsses, vinculoAtual.assessoriaIds),
    clienteTravado,
  };
}

export async function alternarVinculo(sessaoId: string, tipo: TipoVinculo, itemId: string, marcar: boolean): Promise<{ ok: true } | { error: string }> {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const vinculo = lerVinculo(sessao);
  const chave = tipo === "case" ? "caseIds" : tipo === "attendance" ? "attendanceIds" : "assessoriaIds";

  if (!marcar) {
    vinculo[chave] = vinculo[chave].filter((id) => id !== itemId);
    const aindaTemAlgo = !ehSessaoAvulsa(vinculo);
    await prisma.peticionamentoSessao.update({
      where: { id: sessaoId },
      data: {
        vinculoCaseIds: vinculo.caseIds,
        vinculoAttendanceIds: vinculo.attendanceIds,
        vinculoAssessoriaIds: vinculo.assessoriaIds,
        // Só some a trava de cliente quando NENHUM vínculo sobrou — do contrário um vínculo
        // remanescente ficaria "sem cliente" mesmo pertencendo a um.
        ...(aindaTemAlgo ? {} : { clienteId: null, clienteNome: null }),
      },
    });
    return { ok: true };
  }

  // HARD GATE: valida o cliente ANTES de gravar — nunca confia que a tela já bloqueou a opção.
  let clienteIdDoItem: string | null = null;
  let clienteNomeDoItem: string | null = null;
  if (tipo === "case") {
    const c = await prisma.case.findFirst({ where: { id: itemId, officeId: user.officeId }, select: { clientId: true, client: { select: { name: true } } } });
    if (!c) return { error: "Processo não encontrado." };
    clienteIdDoItem = c.clientId;
    clienteNomeDoItem = c.client?.name ?? null;
  } else if (tipo === "attendance") {
    const a = await prisma.attendance.findFirst({ where: { id: itemId, officeId: user.officeId }, select: { clientId: true, clientName: true } });
    if (!a) return { error: "Atendimento não encontrado." };
    clienteIdDoItem = a.clientId;
    clienteNomeDoItem = a.clientName;
  } else {
    const a = await prisma.assessoria.findFirst({ where: { id: itemId, officeId: user.officeId }, select: { clientId: true, client: { select: { name: true } } } });
    if (!a) return { error: "Assessoria não encontrada." };
    clienteIdDoItem = a.clientId;
    clienteNomeDoItem = a.client.name;
  }

  const clienteTravado = sessao.clienteId ? { id: sessao.clienteId, nome: sessao.clienteNome } : null;
  const validacao = validarNovoVinculo(clienteTravado, { id: itemId, tipo, clienteId: clienteIdDoItem, clienteNome: clienteNomeDoItem });
  if (!validacao.ok) return { error: validacao.erro };

  vinculo[chave] = Array.from(new Set([...vinculo[chave], itemId]));
  await prisma.peticionamentoSessao.update({
    where: { id: sessaoId },
    data: {
      vinculoCaseIds: vinculo.caseIds,
      vinculoAttendanceIds: vinculo.attendanceIds,
      vinculoAssessoriaIds: vinculo.assessoriaIds,
      clienteId: validacao.clienteId,
      clienteNome: validacao.clienteNome,
    },
  });
  return { ok: true };
}

export async function definirSessaoAvulsa(sessaoId: string): Promise<{ ok: true }> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  await prisma.peticionamentoSessao.update({
    where: { id: sessaoId },
    data: { vinculoCaseIds: [], vinculoAttendanceIds: [], vinculoAssessoriaIds: [], clienteId: null, clienteNome: null, pastaPrincipal: null },
  });
  return { ok: true };
}

// ── QUESTIONÁRIO (wizard) — autosave, fatos+pedidos são o mínimo (lib/peticionamentoMinimo.ts) ──

export type CamposWizard = {
  tipoPeca?: string | null;
  tipoPecaOutro?: string | null;
  fatos?: string;
  pedidos?: string[];
  prazoFatal?: string | null; // ISO date
  valorCausa?: string | null;
  descumprimentoLiminar?: string | null;
  teses?: string[];
  observacoes?: string | null;
};

export async function salvarWizard(sessaoId: string, campos: CamposWizard): Promise<{ ok: true }> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  await prisma.peticionamentoSessao.update({
    where: { id: sessaoId },
    data: {
      ...(campos.tipoPeca !== undefined ? { tipoPeca: campos.tipoPeca } : {}),
      ...(campos.tipoPecaOutro !== undefined ? { tipoPecaOutro: campos.tipoPecaOutro } : {}),
      ...(campos.fatos !== undefined ? { fatos: campos.fatos } : {}),
      ...(campos.pedidos !== undefined ? { pedidos: campos.pedidos } : {}),
      ...(campos.prazoFatal !== undefined ? { prazoFatal: campos.prazoFatal ? new Date(campos.prazoFatal) : null } : {}),
      ...(campos.valorCausa !== undefined ? { valorCausa: campos.valorCausa } : {}),
      ...(campos.descumprimentoLiminar !== undefined ? { descumprimentoLiminar: campos.descumprimentoLiminar } : {}),
      ...(campos.teses !== undefined ? { teses: campos.teses } : {}),
      ...(campos.observacoes !== undefined ? { observacoes: campos.observacoes } : {}),
    },
  });
  return { ok: true };
}

// ── DOCUMENTOS ───────────────────────────────────────────────────────────────────────────────

export async function listarDocumentosDoVinculo(sessaoId: string) {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const vinculo = lerVinculo(sessao);
  if (ehSessaoAvulsa(vinculo)) return [];
  const attachments = await prisma.attachment.findMany({
    where: {
      officeId: user.officeId,
      OR: [
        vinculo.caseIds.length ? { caseId: { in: vinculo.caseIds } } : undefined,
        vinculo.attendanceIds.length ? { attendanceId: { in: vinculo.attendanceIds } } : undefined,
      ].filter(Boolean) as object[],
    },
    select: { id: true, name: true, docType: true, driveUrl: true },
    orderBy: { createdAt: "desc" },
  });
  return attachments;
}

export async function listarAnexosDaSessao(sessaoId: string) {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  return prisma.peticionamentoAnexo.findMany({ where: { sessaoId }, orderBy: { createdAt: "asc" } });
}

export async function definirDocumentosSelecionados(sessaoId: string, ids: string[]): Promise<{ ok: true }> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { documentosExistentesIds: ids } });
  return { ok: true };
}

export async function anexarNovoDocumento(sessaoId: string, formData: FormData): Promise<{ ok: true; nome: string } | { error: string }> {
  const user = await exigirAcessoAba();
  if (!podeAnexar(user)) return { error: "Sem permissão para anexar documento." };
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Nenhum arquivo enviado." };
  if (file.size > 25 * 1024 * 1024) return { error: "Arquivo maior que 25 MB — limite desta sessão." };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // Anexo NOVO desta sessão sempre vai para a subpasta da própria sessão dentro de
    // "Peticionamento" (especificação §10: "documento anexado só-para-esta-finalidade") — nunca
    // direto na pasta oficial do vínculo, que só recebe o documento se/quando promovido.
    const label = `Sessão ${sessaoId.slice(0, 8)} — ${new Date(sessao.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
    const folderId = await getOrCreatePeticionamentoSessaoFolder(label, user.officeId);
    const { webViewLink } = await uploadFileToDriveFolder(file.name, file.type || "application/octet-stream", buffer, folderId, user.officeId);

    await prisma.peticionamentoAnexo.create({
      data: { sessaoId, nome: file.name, driveUrl: webViewLink, tamanhoBytes: file.size },
    });
    revalidatePath(`/peticionamento/documentos`);
    return { ok: true, nome: file.name };
  } catch (e) {
    return { error: `Não foi possível enviar o arquivo ao Google Drive: ${mensagemDeErro(e)}` };
  }
}

export async function marcarConversaoMarkdown(anexoId: string, aceitar: boolean): Promise<{ ok: true }> {
  const user = await exigirAcessoAba();
  const anexo = await prisma.peticionamentoAnexo.findFirst({ where: { id: anexoId }, include: { sessao: true } });
  if (!anexo || anexo.sessao.officeId !== user.officeId) throw new Error("Anexo não encontrado.");
  // Markdown é SEMPRE sugerido, nunca obrigatório (especificação §1) — este módulo não faz a
  // conversão de verdade (dependeria de markitdown rodando ao lado do Hermes); só registra a
  // escolha do advogado. Ver relatório da entrega para esta limitação por extenso.
  await prisma.peticionamentoAnexo.update({
    where: { id: anexoId },
    data: aceitar ? { markdownConvertido: true, markdownRecusado: false } : { markdownConvertido: false, markdownRecusado: true },
  });
  return { ok: true };
}

// ── JANELA DE CONTEXTO — nunca trunca em silêncio (especificação §8) ───────────────────────────

export async function avaliarContextoDaSessao(sessaoId: string) {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const anexos = await prisma.peticionamentoAnexo.findMany({ where: { sessaoId } });

  const itens: ItemDeJanela[] = [
    { id: "fatos", rotulo: "Fatos descritos pelo advogado", texto: sessao.fatos ?? "" },
    ...anexos.map((a) => ({ id: a.id, rotulo: a.nome, texto: "x".repeat(200), protegido: true })),
  ];
  const avaliacao = avaliarJanela(itens);

  await prisma.peticionamentoSessao.update({
    where: { id: sessaoId },
    data: {
      contextoResumoAviso: avaliacao.acao === "resumido" ? avaliacao.aviso : null,
      contextoBloqueadoMotivo: avaliacao.acao === "bloqueado" ? avaliacao.aviso : null,
    },
  });
  return avaliacao;
}

// ── GERAÇÃO DA MINUTA ────────────────────────────────────────────────────────────────────────

async function descricaoDoContexto(sessaoId: string, officeId: string): Promise<string | null> {
  const sessao = await carregarSessaoOuFalhar(sessaoId, officeId);
  const vinculo = lerVinculo(sessao);
  if (ehSessaoAvulsa(vinculo)) return null;
  const partes: string[] = [];
  if (vinculo.caseIds.length) {
    const cs = await prisma.case.findMany({ where: { id: { in: vinculo.caseIds }, officeId }, select: { processNumber: true, title: true, court: true } });
    partes.push(...cs.map((c) => (c.processNumber ? `Processo nº ${c.processNumber}${c.court ? ` — ${c.court}` : ""}` : c.title)));
  }
  if (vinculo.attendanceIds.length) {
    const as = await prisma.attendance.findMany({ where: { id: { in: vinculo.attendanceIds }, officeId }, select: { id: true, subject: true } });
    partes.push(...as.map((a) => `Atendimento — ${a.subject}`));
  }
  if (vinculo.assessoriaIds.length) {
    const ases = await prisma.assessoria.findMany({ where: { id: { in: vinculo.assessoriaIds }, officeId }, include: { client: true } });
    partes.push(...ases.map((a) => `Assessoria — ${a.client.name}`));
  }
  return partes.length > 0 ? partes.join(" · ") : null;
}

/**
 * O resumo da tela de confirmação (confirmar-geracao.html). CORREÇÃO PEDIDA PELO PRÓPRIO AUTOR
 * DOS MOCKUPS (ver decisions.md §10, último item): a linha "Fatos" mostra o TEXTO LITERAL do
 * advogado, nunca um resumo parafraseado — esta tela existe para o advogado ver o que a máquina
 * vai ler antes de ela escrever, e uma paráfrase reintroduziria a IA no meio dessa checagem.
 */
export async function obterResumoTriagem(sessaoId: string) {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const documentosExistentesIds = ((sessao.documentosExistentesIds as string[] | null) ?? []) as string[];
  const [documentosExistentes, anexos] = await Promise.all([
    documentosExistentesIds.length ? prisma.attachment.findMany({ where: { id: { in: documentosExistentesIds }, officeId: user.officeId }, select: { name: true } }) : Promise.resolve([]),
    prisma.peticionamentoAnexo.findMany({ where: { sessaoId }, select: { nome: true } }),
  ]);
  return {
    contextoDescricao: (await descricaoDoContexto(sessaoId, user.officeId)) ?? "Sem vínculo — petição avulsa",
    materiaNome: sessao.materiaNome,
    tipoPeca: sessao.tipoPeca,
    tipoPecaOutro: sessao.tipoPecaOutro,
    fatos: sessao.fatos ?? "",
    pedidos: ((sessao.pedidos as string[] | null) ?? []) as string[],
    documentos: [...documentosExistentes.map((d) => d.name), ...anexos.map((a) => a.nome)],
    teses: ((sessao.teses as string[] | null) ?? []) as string[],
  };
}

/**
 * O botão "Confirmar e gerar minuta" da tela de triagem. HARD GATE nº 1 desta função: recusa
 * gerar sem fatos+pedidos, mesmo que a tela (por algum bug) tenha deixado o botão clicável.
 */
export async function confirmarTriagemEGerar(sessaoId: string): Promise<{ ok: true } | { error: string }> {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);

  const prontidao = avaliarProntidao({ fatos: sessao.fatos, pedidos: (sessao.pedidos as string[] | null) ?? [] });
  if (!prontidao.pronto) return { error: `Não é possível gerar ainda: falta ${prontidao.faltando.join(" e ")}.` };

  const janela = await avaliarContextoDaSessao(sessaoId);
  if (janela.acao === "bloqueado") return { error: janela.aviso ?? "Contexto grande demais mesmo após resumir." };

  if (!hermesConfigurado()) {
    await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { status: "FALHA_GERACAO" } });
    return { error: "O Hermes não está configurado neste ambiente (faltam HERMES_URL/HERMES_TOKEN) — não é possível gerar a minuta agora. Isto não é uma falha da sessão: os dados desta triagem continuam salvos." };
  }

  await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { status: "GERANDO" } });

  const documentosExistentesIds = ((sessao.documentosExistentesIds as string[] | null) ?? []) as string[];
  const documentosExistentes = documentosExistentesIds.length
    ? await prisma.attachment.findMany({ where: { id: { in: documentosExistentesIds }, officeId: user.officeId }, select: { name: true } })
    : [];
  const anexosNovos = await prisma.peticionamentoAnexo.findMany({ where: { sessaoId } });

  const mensagem = montarMensagemParaHermes({
    materia: sessao.materiaNome ?? "(não informada)",
    tipoPeca: sessao.tipoPeca,
    tipoPecaOutro: sessao.tipoPecaOutro,
    contextoDescricao: await descricaoDoContexto(sessaoId, user.officeId),
    fatos: sessao.fatos ?? "",
    pedidos: ((sessao.pedidos as string[] | null) ?? []) as string[],
    teses: ((sessao.teses as string[] | null) ?? []) as string[],
    observacoes: sessao.observacoes,
    // Nomes/metadados, não o conteúdo binário extraído — ver limitação registrada no relatório
    // da entrega (leitura de conteúdo de documento fica a cargo das ferramentas do próprio
    // Hermes, quando configuradas).
    documentos: [...documentosExistentes.map((d) => ({ nome: d.name, texto: "" })), ...anexosNovos.map((a) => ({ nome: a.nome, texto: "" }))],
    contextoFoiResumido: janela.acao === "resumido",
    avisoDeResumo: janela.aviso,
  });

  try {
    const resposta = await perguntarAoHermesComPerfil({
      perfil: perfilDePeticionamento(),
      mensagem,
      sessao: sessao.hermesSessionId,
    });
    const estruturada = interpretarRespostaHermes(resposta.resposta);
    const corpoComFecho = garantirFecho(estruturada.corpo);
    const riscosFiltrados = filtrarNotaDeRiscos(estruturada.riscos);
    const riscosComAviso = comAvisoDeContextoResumido(riscosFiltrados.aceitas, janela.acao === "resumido");

    await prisma.peticionamentoSessao.update({
      where: { id: sessaoId },
      data: {
        status: "GERADA",
        minutaTexto: corpoComFecho,
        notaRiscos: riscosComAviso,
        jurisprudenciaCitada: estruturada.jurisprudencia as unknown as object,
        documentosBaseConsultados: estruturada.documentosUsados.length ? estruturada.documentosUsados : [...documentosExistentes.map((d) => d.name), ...anexosNovos.map((a) => a.nome)],
        tipoPecaInferido: !sessao.tipoPeca && !!estruturada.tipoPecaInferido,
        tipoPeca: !sessao.tipoPeca && estruturada.tipoPecaInferido ? estruturada.tipoPecaInferido : sessao.tipoPeca,
        hermesSessionId: resposta.sessao || sessao.hermesSessionId,
        geradoEm: new Date(),
      },
    });
    revalidatePath(`/peticionamento/minuta`);
    return { ok: true };
  } catch (e) {
    await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { status: "FALHA_GERACAO" } });
    const motivo = e instanceof FalhaDoHermes ? e.motivo : mensagemDeErro(e);
    return { error: `Não foi possível gerar a minuta: ${motivo}` };
  }
}

export async function atualizarCorpoDaMinuta(sessaoId: string, texto: string): Promise<{ ok: true }> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  // O fecho é reconferido em toda gravação — mesmo edição manual não sai sem ele; ver export,
  // que reconfere de novo por segurança (defesa em profundidade, nunca confiar numa trava só).
  await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { minutaTexto: garantirFecho(texto) } });
  return { ok: true };
}

// ── EXPORTAÇÃO — a TRAVA REAL (especificação §5) ───────────────────────────────────────────────

export async function confirmarExportacao(
  sessaoId: string,
  confirmouCheckbox: boolean,
): Promise<{ ok: true; arquivoNome: string; arquivoBase64: string; driveUrl: string | null; avisoTimbrado: string | null } | { error: string }> {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);

  // HARD GATE 1: só advogado com OAB.
  const avaliacao = avaliarExportacao(user);
  if (!avaliacao.pode) return { error: avaliacao.motivo! };

  // HARD GATE 2: o checkbox de ciência é OBRIGATÓRIO — texto literal da especificação §5, exibido
  // na tela; aqui é onde ele é de fato exigido, não confiado ao estado do botão no cliente.
  if (!confirmouCheckbox) {
    return { error: 'É preciso marcar "Li e estou ciente de que este é um rascunho gerado por IA e requer revisão profissional integral antes de qualquer protocolo." antes de exportar.' };
  }

  if (!sessao.minutaTexto) return { error: "Esta sessão ainda não tem minuta gerada." };

  const office = await prisma.office.findUnique({ where: { id: user.officeId }, select: { timbradoUrl: true, timbradoFormato: true, name: true } });
  let timbrado: Buffer | null = null;
  let avisoTimbrado: string | null = null;
  if (office?.timbradoUrl && office.timbradoFormato === "DOCX") {
    try {
      const resp = await fetch(office.timbradoUrl);
      if (resp.ok) timbrado = Buffer.from(await resp.arrayBuffer());
    } catch {
      timbrado = null;
    }
  }
  if (!timbrado) {
    avisoTimbrado = "Sem timbrado cadastrado para este escritório — a exportação segue em Word simples. Cadastre o timbrado em Configurações → Geral.";
  }

  const agora = new Date();
  const arquivoNome = montarNomeArquivoPeticao({ dataGeracao: sessao.geradoEm ?? agora, tipoPeca: sessao.tipoPeca, tipoPecaOutro: sessao.tipoPecaOutro });

  const notaObrigatoria = montarNotaObrigatoria({
    precedentes: ((sessao.jurisprudenciaCitada as { texto: string; fonte: string | null }[] | null) ?? []) as { texto: string; fonte: string | null }[],
    documentosBaseConsultados: ((sessao.documentosBaseConsultados as string[] | null) ?? []) as string[],
    contextoVinculadoDescricao: await descricaoDoContexto(sessaoId, user.officeId),
    geradoEm: sessao.geradoEm ?? agora,
    perfil: perfilDePeticionamento(),
    sessaoId: sessao.id,
  });

  const buffer = montarPeticaoWord(
    {
      notaObrigatoriaTexto: notaObrigatoria,
      notaRiscos: ((sessao.notaRiscos as string[] | null) ?? []) as string[],
      corpoMinuta: garantirFecho(sessao.minutaTexto),
      tituloPeca: `${sessao.tipoPeca ?? "Petição"}${sessao.clienteNome ? ` — ${sessao.clienteNome}` : ""}`,
    },
    { confirmadoPorNome: user.name, confirmadoPorOab: user.oab ?? "", confirmadoEm: agora, sessaoId: sessao.id },
    timbrado,
  );

  // Salva no Drive: pasta do vínculo principal, ou subpasta da sessão em "Peticionamento" para
  // sessão avulsa (especificação §10 e §11).
  let driveUrl: string | null = null;
  try {
    const vinculo = lerVinculo(sessao);
    let folderId: string;
    if (sessao.pastaPrincipal?.startsWith("case:")) {
      const id = sessao.pastaPrincipal.slice(5);
      const c = await prisma.case.findFirst({ where: { id, officeId: user.officeId }, select: { title: true } });
      folderId = await getOrCreateCaseFolder(id, c?.title ?? "Processo", user.officeId);
    } else if (sessao.pastaPrincipal?.startsWith("attendance:")) {
      const id = sessao.pastaPrincipal.slice(11);
      const a = await prisma.attendance.findFirst({ where: { id, officeId: user.officeId }, select: { subject: true } });
      folderId = await getOrCreateAttendanceFolder(id, a?.subject ?? "Atendimento", user.officeId);
    } else if (sessao.pastaPrincipal?.startsWith("assessoria:")) {
      const id = sessao.pastaPrincipal.slice(11);
      const a = await prisma.assessoria.findFirst({ where: { id, officeId: user.officeId }, include: { client: true } });
      folderId = await getOrCreateAssessoriaCompanyFolderCached(id, a?.client.name ?? "Assessoria", user.officeId);
    } else if (!ehSessaoAvulsa(vinculo) && vinculo.caseIds[0]) {
      folderId = await getOrCreateCaseFolder(vinculo.caseIds[0], "Processo", user.officeId);
    } else if (!ehSessaoAvulsa(vinculo) && vinculo.attendanceIds[0]) {
      folderId = await getOrCreateAttendanceFolder(vinculo.attendanceIds[0], "Atendimento", user.officeId);
    } else {
      const label = `Sessão ${sessaoId.slice(0, 8)} — ${agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
      folderId = await getOrCreatePeticionamentoSessaoFolder(label, user.officeId);
    }
    const upload = await uploadFileToDriveFolder(arquivoNome, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer, folderId, user.officeId);
    driveUrl = upload.webViewLink;
  } catch (e) {
    // Falha ao SALVAR no Drive não deve impedir o download imediato do arquivo já gerado — mas
    // precisa ficar visível, nunca escondida (nunca fingir que salvou quando não salvou).
    avisoTimbrado = `${avisoTimbrado ? `${avisoTimbrado} ` : ""}Não foi possível salvar automaticamente no Google Drive (${mensagemDeErro(e)}) — baixe o arquivo abaixo e salve manualmente.`;
  }

  await prisma.peticionamentoExportacao.create({
    data: { sessaoId, confirmadoPorId: user.id, confirmadoEm: agora, arquivoNome, driveUrl, timbradoAplicado: !!timbrado },
  });
  await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { status: "EXPORTADA" } });
  revalidatePath("/peticionamento/minuta");

  return { ok: true, arquivoNome, arquivoBase64: buffer.toString("base64"), driveUrl, avisoTimbrado };
}
