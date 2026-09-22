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
  downloadFileFromDrive,
  extractDriveFileId,
  translateDriveError,
} from "@/lib/googleDrive";
import { podeAcessarAba, podeAnexar, avaliarExportacao } from "@/lib/peticionamentoAcesso";
import { avaliarProntidao } from "@/lib/peticionamentoMinimo";
import { avaliarCandidatos, validarNovoVinculo, ehSessaoAvulsa, type ItemDeContexto, type TipoVinculo } from "@/lib/peticionamentoContexto";
import { MATERIAS_DO_LUMEN, validarNovaMateria } from "@/lib/peticionamentoMateria";
import { avaliarJanela, type ItemDeContexto as ItemDeJanela } from "@/lib/peticionamentoJanelaDeContexto";
import { extrairTextoDeDocumento } from "@/lib/peticionamentoExtracaoDocumento";
import { ehCategoriaConhecida } from "@/lib/peticionamentoCategoriaPeca";
import { deduzirNatureza, ehNaturezaConhecida, type SinalDeVinculoParaNatureza, type DeducaoDeNatureza } from "@/lib/peticionamentoNatureza";
import { passoParaRetomar, ehPassoValido, hrefDoPasso, ROTULO_DO_PASSO, sessaoTemTrabalhoEmAndamento } from "@/lib/peticionamentoPasso";
import { montarMensagemParaHermes } from "@/lib/peticionamentoPrompt";
import { interpretarRespostaHermes } from "@/lib/peticionamentoRespostaHermes";
import { montarListaDeCitacoes, normalizarTextoCitacao, hashDeTexto, type PrecedenteParaCitacao } from "@/lib/peticionamentoCitacoes";
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

/**
 * O prazo para LEITURA HUMANA (dd/mm/aaaa) — em UTC, de propósito: `prazoFatal` vem de um
 * `<input type="date">` e é gravado como meia-noite UTC, ou seja, é uma DATA DE CALENDÁRIO, não um
 * instante. Lida em America/Sao_Paulo (UTC-3), a mesma data voltaria como o DIA ANTERIOR — e um
 * prazo mostrado um dia antes do que é seria pior do que não mostrar nenhum.
 */
function prazoParaLeitura(prazo: Date | null): string | null {
  return prazo ? prazo.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null;
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

/**
 * A DEDUÇÃO da natureza do procedimento (especificação §8) — recalculada sempre que o vínculo
 * muda, nunca perguntada do zero. `officeId` já vem conferido de quem chama; a consulta abaixo
 * ainda assim carrega `officeId` no `where` do processo (defesa em profundidade, mesmo padrão do
 * resto do arquivo).
 */
async function recalcularNaturezaDoVinculo(officeId: string, vinculo: VinculoJson): Promise<DeducaoDeNatureza> {
  const sinais: SinalDeVinculoParaNatureza[] = [];
  if (vinculo.caseIds.length) {
    const casos = await prisma.case.findMany({ where: { id: { in: vinculo.caseIds }, officeId }, select: { processNumber: true, court: true } });
    sinais.push(...casos.map((c) => ({ tipo: "case" as const, numeroProcesso: c.processNumber, vara: c.court })));
  }
  if (vinculo.attendanceIds.length) sinais.push({ tipo: "attendance" });
  if (vinculo.assessoriaIds.length) sinais.push({ tipo: "assessoria" });
  return deduzirNatureza(sinais);
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

/**
 * "Numa sessão vazia, sair é sair" (espec. §4) — cada página de sessão chama isto para saber se
 * mostra o pop-up de saída (via SincronizarTrabalhoEmAndamento). Concentrado aqui para não
 * duplicar, em cinco páginas, a conta de "o que conta como trabalho" (lib/peticionamentoPasso.ts).
 */
export async function avaliarTrabalhoEmAndamento(sessaoId: string): Promise<boolean> {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const anexosCount = await prisma.peticionamentoAnexo.count({ where: { sessaoId } });
  const documentosExistentesIds = ((sessao.documentosExistentesIds as string[] | null) ?? []) as string[];
  return sessaoTemTrabalhoEmAndamento({
    categoriaPeca: sessao.categoriaPeca,
    materiaNome: sessao.materiaNome,
    contextoDecidido: sessao.contextoDecidido,
    fatos: sessao.fatos,
    pedidos: ((sessao.pedidos as string[] | null) ?? []) as string[],
    temDocumento: documentosExistentesIds.length > 0 || anexosCount > 0,
    minutaTexto: sessao.minutaTexto,
  });
}

// ── RASCUNHOS (espec. §3: "FAÇA ESTE PRIMEIRO" — o pop-up de saída promete que nada se perde) ──

export type RascunhoResumo = {
  id: string;
  titulo: string;
  categoriaPeca: string | null;
  clienteNome: string | null;
  naturezaProcedimento: string | null;
  passo: string;
  passoRotulo: string;
  href: string;
  atualizadoEm: string;
  criadoPorNome: string;
};

/** Só a contagem — para o "Ver rascunhos (n)" do Menu, sem precisar montar a lista inteira (mesmo corte de listarRascunhos, logo abaixo). */
export async function contarRascunhos(): Promise<number> {
  const user = await exigirAcessoAba();
  return prisma.peticionamentoSessao.count({ where: { officeId: user.officeId, status: { not: "EXPORTADA" } } });
}

/**
 * Toda sessão do escritório ainda NÃO exportada — a lista inteira, não só as do usuário logado:
 * um rascunho iniciado por um colega continua sendo do escritório, e a especificação não separa
 * "meus rascunhos" de "os do escritório". `criadoPorNome` aparece na lista exatamente para deixar
 * isso visível, nunca escondido.
 */
export async function listarRascunhos(): Promise<RascunhoResumo[]> {
  const user = await exigirAcessoAba();
  const sessoes = await prisma.peticionamentoSessao.findMany({
    where: { officeId: user.officeId, status: { not: "EXPORTADA" } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      categoriaPeca: true,
      tipoPeca: true,
      tipoPecaOutro: true,
      materiaNome: true,
      clienteNome: true,
      naturezaProcedimento: true,
      contextoDecidido: true,
      fatos: true,
      pedidos: true,
      documentosExistentesIds: true,
      status: true,
      passoAtual: true,
      updatedAt: true,
      criadoPor: { select: { name: true } },
      _count: { select: { anexos: true } },
    },
  });

  return sessoes.map((s) => {
    const pedidos = ((s.pedidos as string[] | null) ?? []) as string[];
    const documentosExistentesIds = ((s.documentosExistentesIds as string[] | null) ?? []) as string[];
    const temDocumento = documentosExistentesIds.length > 0 || s._count.anexos > 0;
    // passoParaRetomar: usa s.passoAtual (gravado a cada navegação) quando é um passo válido;
    // sessão antiga sem o campo, ou valor torto, cai na dedução de sempre — nunca quebra a tela.
    const passo = passoParaRetomar(
      {
        status: s.status,
        categoriaPeca: s.categoriaPeca,
        materiaNome: s.materiaNome,
        contextoDecidido: s.contextoDecidido,
        fatos: s.fatos,
        pedidos,
        temDocumento,
      },
      s.passoAtual,
    );
    const tipoParaTitulo = s.tipoPeca === "Outra" && s.tipoPecaOutro ? s.tipoPecaOutro : s.tipoPeca;
    const titulo = s.categoriaPeca ? `${s.categoriaPeca}${tipoParaTitulo ? ` — ${tipoParaTitulo}` : ""}` : "Rascunho sem tipo de peça definido";
    return {
      id: s.id,
      titulo,
      categoriaPeca: s.categoriaPeca,
      clienteNome: s.clienteNome,
      naturezaProcedimento: s.naturezaProcedimento,
      passo,
      passoRotulo: ROTULO_DO_PASSO[passo],
      href: hrefDoPasso(s.id, passo),
      atualizadoEm: s.updatedAt.toISOString(),
      criadoPorNome: s.criadoPor.name,
    };
  });
}

/**
 * GRAVA o passo de verdade — chamada por cada uma das seis páginas de sessão (app/peticionamento/
 * [id]/*) ao carregar, uma por navegação. É esta gravação, não mais a dedução, que "Retomar" usa
 * em primeiro lugar (lib/peticionamentoPasso.ts: `passoParaRetomar`). Recusa um passo que a lista
 * de hoje não conhece em vez de gravar lixo no banco — a mesma trava que faz `passoParaRetomar`
 * cair na dedução quando o valor já gravado está torto.
 */
export async function gravarPassoDaSessao(sessaoId: string, passo: string): Promise<{ ok: true } | { error: string }> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  if (!ehPassoValido(passo)) return { error: "Passo de sessão desconhecido." };

  // ESCREVE SÓ QUANDO O PASSO DE FATO MUDOU — achado da revisão, e o motivo não é economia de
  // consulta: `PeticionamentoSessao.updatedAt` é `@updatedAt` (prisma/schema.prisma), e a lista de
  // rascunhos ORDENA por ele e MOSTRA "atualizado em {data}" (listarRascunhos, logo acima, e
  // components/peticionamento/RascunhosClient.tsx). Como esta gravação roda no carregamento das
  // SEIS páginas de passo, um `update` incondicional fazia ABRIR — ou só recarregar — um rascunho
  // reescrever "atualizado em" para agora e pular o rascunho para o topo da lista, como se alguém
  // o tivesse editado. A tela passava a afirmar uma coisa falsa sobre quem mexeu em quê e quando,
  // justamente na tela que existe para retomar trabalho.
  //
  // `updateMany` com o passo no `where` é o que torna a gravação um NADA quando não há mudança:
  // zero linhas casadas, zero escrita, `updatedAt` intocado.
  //
  // O `OR` com `passoAtual: null` NÃO é enfeite: em SQL, `passoAtual != 'contexto'` é NULL (nunca
  // verdadeiro) para uma linha com passoAtual nulo — sem este ramo, toda sessão ANTIGA (as que
  // nasceram antes de existir `passoAtual`) jamais teria o passo gravado, e a dedução de
  // lib/peticionamentoPasso.ts seguiria sendo o único caminho para elas, para sempre.
  await prisma.peticionamentoSessao.updateMany({
    where: { id: sessaoId, OR: [{ passoAtual: null }, { passoAtual: { not: passo } }] },
    data: { passoAtual: passo },
  });
  return { ok: true };
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

// ── CATEGORIA DA PEÇA (espec. §7: a primeira pergunta, antes até do contexto) ───────────────────

export async function definirCategoriaPeca(sessaoId: string, categoriaPeca: string): Promise<{ ok: true } | { error: string }> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  if (!ehCategoriaConhecida(categoriaPeca)) return { error: "Categoria de peça desconhecida." };
  await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { categoriaPeca } });
  revalidatePath(`/peticionamento/${sessaoId}/tipo`);
  return { ok: true };
}

// ── NATUREZA DO PROCEDIMENTO (espec. §8: deduzida, corrigir é um clique) ────────────────────────

/** O advogado corrige (ou confirma explicitamente) a dedução automática — nunca perguntada do zero. */
export async function confirmarNatureza(sessaoId: string, naturezaProcedimento: string): Promise<{ ok: true } | { error: string }> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  if (!ehNaturezaConhecida(naturezaProcedimento)) return { error: "Natureza de procedimento desconhecida." };
  await prisma.peticionamentoSessao.update({
    where: { id: sessaoId },
    data: { naturezaProcedimento, naturezaConfirmadaManualmente: true },
  });
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
    // A dedução (espec. §8) é recalculada a cada mudança de vínculo, para trás e para frente —
    // desmarcar um processo pode fazer a natureza voltar a "extrajudicial"/"consultivo", ou a
    // nenhuma, se nada mais sobrou.
    const deducao = await recalcularNaturezaDoVinculo(user.officeId, vinculo);
    await prisma.peticionamentoSessao.update({
      where: { id: sessaoId },
      data: {
        vinculoCaseIds: vinculo.caseIds,
        vinculoAttendanceIds: vinculo.attendanceIds,
        vinculoAssessoriaIds: vinculo.assessoriaIds,
        contextoDecidido: true,
        naturezaProcedimento: deducao.natureza,
        naturezaMotivo: deducao.motivo,
        naturezaConfirmadaManualmente: false,
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
  const deducao = await recalcularNaturezaDoVinculo(user.officeId, vinculo);
  await prisma.peticionamentoSessao.update({
    where: { id: sessaoId },
    data: {
      vinculoCaseIds: vinculo.caseIds,
      vinculoAttendanceIds: vinculo.attendanceIds,
      vinculoAssessoriaIds: vinculo.assessoriaIds,
      clienteId: validacao.clienteId,
      clienteNome: validacao.clienteNome,
      contextoDecidido: true,
      naturezaProcedimento: deducao.natureza,
      naturezaMotivo: deducao.motivo,
      naturezaConfirmadaManualmente: false,
    },
  });
  return { ok: true };
}

export async function definirSessaoAvulsa(sessaoId: string): Promise<{ ok: true }> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const vinculoVazio: VinculoJson = { caseIds: [], attendanceIds: [], assessoriaIds: [] };
  const deducao = await recalcularNaturezaDoVinculo(user.officeId, vinculoVazio);
  await prisma.peticionamentoSessao.update({
    where: { id: sessaoId },
    data: {
      vinculoCaseIds: [],
      vinculoAttendanceIds: [],
      vinculoAssessoriaIds: [],
      clienteId: null,
      clienteNome: null,
      pastaPrincipal: null,
      contextoDecidido: true,
      naturezaProcedimento: deducao.natureza,
      naturezaMotivo: deducao.motivo,
      naturezaConfirmadaManualmente: false,
    },
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
  prazoPreclusivo?: boolean;
  valorCausa?: string | null;
  descumprimentoLiminar?: string | null;
  teses?: string[];
  observacoes?: string | null;
};

export async function salvarWizard(sessaoId: string, campos: CamposWizard): Promise<{ ok: true }> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  // PRECLUSIVO SEM DATA NÃO EXISTE (pedido do dono, 22/09/2026): apagar o prazo apaga a marca
  // junto, aqui no servidor e não só na tela. Sem isto, limpar a data deixaria um `true` órfão no
  // banco, e o advogado teria marcado "preclusivo" sobre um prazo que já não está em lugar nenhum.
  // Isto NÃO é deduzir preclusão — o sistema nunca LIGA a marca sozinho, só deixa de afirmar uma
  // preclusão cujo prazo o próprio advogado acabou de remover.
  const prazoFoiApagado = campos.prazoFatal !== undefined && !campos.prazoFatal;
  await prisma.peticionamentoSessao.update({
    where: { id: sessaoId },
    data: {
      ...(campos.tipoPeca !== undefined ? { tipoPeca: campos.tipoPeca } : {}),
      ...(campos.tipoPecaOutro !== undefined ? { tipoPecaOutro: campos.tipoPecaOutro } : {}),
      ...(campos.fatos !== undefined ? { fatos: campos.fatos } : {}),
      ...(campos.pedidos !== undefined ? { pedidos: campos.pedidos } : {}),
      ...(campos.prazoFatal !== undefined ? { prazoFatal: campos.prazoFatal ? new Date(campos.prazoFatal) : null } : {}),
      ...(prazoFoiApagado ? { prazoPreclusivo: false } : campos.prazoPreclusivo !== undefined ? { prazoPreclusivo: campos.prazoPreclusivo === true } : {}),
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

// ── LEITURA DE DOCUMENTO — prioridade 1 do dono: "fazer o agente ler toda a documentação, pois é
// imprescindível". Até esta entrega só o NOME do arquivo era mandado ao Hermes; o conteúdo nunca
// (ver relatório da entrega). Este bloco baixa o arquivo do Drive e extrai o texto de verdade. ──

export type DocumentoDaSessaoComTexto = {
  id: string;
  nome: string;
  resultado: import("@/lib/peticionamentoExtracaoDocumento").ResultadoExtracao;
};

/**
 * Todo documento da sessão (existentes vinculados + anexados nesta sessão) COM o texto já
 * extraído — ou o motivo de não ter dado para extrair. Reconfere a sessão por officeId ANTES de
 * tocar qualquer tabela, igual a toda ação deste arquivo (nunca confia que quem chamou já
 * validou — lib/testes/peticionamentoIsolamento.teste.ts cobra isso de QUALQUER função nova que
 * receba sessaoId, exportada ou não). Baixa do Drive com `officeId` sempre reconferido também
 * (downloadFileFromDrive já exige a credencial DESTE escritório) — conteúdo de documento é dado
 * de cliente sob sigilo, nunca lido por id sozinho.
 *
 * NUNCA loga o texto extraído — só nome, contagens e motivo de falha (nada do conteúdo do
 * documento em si) chegam a qualquer mensagem de erro devolvida ao chamador.
 */
async function carregarDocumentosDaSessaoComTexto(sessaoId: string, officeId: string): Promise<DocumentoDaSessaoComTexto[]> {
  const sessao = await carregarSessaoOuFalhar(sessaoId, officeId);
  const documentosExistentesIds = ((sessao.documentosExistentesIds as string[] | null) ?? []) as string[];

  const [documentosExistentes, anexosNovos] = await Promise.all([
    documentosExistentesIds.length
      ? prisma.attachment.findMany({ where: { id: { in: documentosExistentesIds }, officeId }, select: { id: true, name: true, driveUrl: true } })
      : Promise.resolve([]),
    prisma.peticionamentoAnexo.findMany({ where: { sessaoId }, select: { id: true, nome: true, driveUrl: true } }),
  ]);

  const todos = [
    ...documentosExistentes.map((d) => ({ id: d.id, nome: d.name, driveUrl: d.driveUrl })),
    ...anexosNovos.map((a) => ({ id: a.id, nome: a.nome, driveUrl: a.driveUrl })),
  ];

  return Promise.all(
    todos.map(async (doc): Promise<DocumentoDaSessaoComTexto> => {
      if (!doc.driveUrl) return { id: doc.id, nome: doc.nome, resultado: { ok: false, motivo: "Documento sem arquivo vinculado no Google Drive." } };
      const fileId = extractDriveFileId(doc.driveUrl);
      if (!fileId) return { id: doc.id, nome: doc.nome, resultado: { ok: false, motivo: "Não foi possível identificar o arquivo no link do Google Drive." } };
      try {
        const { content, mimeType } = await downloadFileFromDrive(fileId, officeId);
        const resultado = await extrairTextoDeDocumento(content, mimeType, doc.nome);
        return { id: doc.id, nome: doc.nome, resultado };
      } catch (e) {
        return { id: doc.id, nome: doc.nome, resultado: { ok: false, motivo: translateDriveError(e, "baixar o documento do Google Drive") } };
      }
    }),
  );
}

// ── JANELA DE CONTEXTO — nunca trunca em silêncio (especificação §8) ───────────────────────────

/**
 * Avalia a sessão inteira (fatos + TODO documento, existente ou anexado, com texto já lido) —
 * usado tanto pela ação pública abaixo (tela de confirmação) quanto por confirmarTriagemEGerar,
 * que precisa do `textoFinal` por item para montar a mensagem ao Hermes; os dois chamam ESTA
 * função para baixar/ler cada documento uma ÚNICA vez por geração, nunca duas.
 */
async function calcularAvaliacaoDeContexto(sessaoId: string, officeId: string) {
  const sessao = await carregarSessaoOuFalhar(sessaoId, officeId);
  const documentos = await carregarDocumentosDaSessaoComTexto(sessaoId, officeId);

  // Documento é sempre `protegido: true` — mesmo tratamento que os anexos já tinham antes desta
  // entrega (nunca resumir o documento central da peça, ex.: o laudo, o contrato, a contestação
  // a que se responde). Documento cuja leitura FALHOU entra com texto vazio (0 tokens): não pesa
  // no orçamento, e nunca aparece "resumido" — não faz sentido resumir o que não foi lido.
  const itens: ItemDeJanela[] = [
    { id: "fatos", rotulo: "Fatos descritos pelo advogado", texto: sessao.fatos ?? "" },
    ...documentos.map((d) => ({ id: d.id, rotulo: d.nome, texto: d.resultado.ok ? d.resultado.texto : "", protegido: true })),
  ];
  const avaliacao = avaliarJanela(itens);

  await prisma.peticionamentoSessao.update({
    where: { id: sessaoId },
    data: {
      contextoResumoAviso: avaliacao.acao === "resumido" ? avaliacao.aviso : null,
      contextoBloqueadoMotivo: avaliacao.acao === "bloqueado" ? avaliacao.aviso : null,
    },
  });

  return { avaliacao, documentos };
}

export async function avaliarContextoDaSessao(sessaoId: string) {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const { avaliacao, documentos } = await calcularAvaliacaoDeContexto(sessaoId, user.officeId);

  // SANITIZADO: esta ação é exportada (chamável, em tese, direto do cliente) — nunca devolve o
  // TEXTO do documento por aqui, só metadados de tamanho/decisão. Quem precisa do texto de fato
  // (confirmarTriagemEGerar, para montar a mensagem ao Hermes) chama calcularAvaliacaoDeContexto
  // direto, dentro do próprio servidor.
  return {
    acao: avaliacao.acao,
    tokensTotaisOriginais: avaliacao.tokensTotaisOriginais,
    tokensTotaisFinais: avaliacao.tokensTotaisFinais,
    limite: avaliacao.limite,
    aviso: avaliacao.aviso,
    // Lista explícita de campos (não um "resto" via destructuring) — nunca esquece de excluir um
    // campo novo que carregue texto, caso ItemAvaliado ganhe outro no futuro.
    itens: avaliacao.itens.map((item) => ({
      id: item.id,
      rotulo: item.rotulo,
      tokensOriginais: item.tokensOriginais,
      tokensAposResumo: item.tokensAposResumo,
      foiResumido: item.foiResumido,
      protegido: item.protegido,
    })),
    documentos: documentos.map((d) => ({ id: d.id, nome: d.nome, lido: d.resultado.ok, motivo: d.resultado.ok ? null : d.resultado.motivo })),
  };
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

// ── CITAÇÕES — validação uma a uma antes de exportar (decisão do dono, 22/09/2026) ─────────────

/**
 * Recalcula as linhas de PeticionamentoCitacao a partir do estado ATUAL da sessão (jurisprudência
 * estruturada + corpo da minuta) — chamada depois de toda geração e de toda edição do corpo, para
 * a lista nunca ficar desatualizada.
 *
 * IDENTIDADE de uma citação = (tipo, texto normalizado). Uma citação cujo texto mudou é, por
 * definição, OUTRA citação: a linha antiga (com a confirmação que carregava) é apagada, e a nova
 * entra sem confirmação nenhuma. É assim que "editar a minuta invalida a confirmação das citações
 * que mudaram" (decisão do dono) vira código — hashDoTexto é a impressão do texto gravada NA
 * confirmação, para auditoria; a invalidação em si acontece aqui, pela identidade deixar de bater.
 */
async function sincronizarCitacoes(sessaoId: string, officeId: string): Promise<void> {
  const sessao = await carregarSessaoOuFalhar(sessaoId, officeId);
  const atuais = montarListaDeCitacoes({
    jurisprudenciaCitada: ((sessao.jurisprudenciaCitada as PrecedenteParaCitacao[] | null) ?? []) as PrecedenteParaCitacao[],
    minutaTexto: sessao.minutaTexto,
  });

  const existentes = await prisma.peticionamentoCitacao.findMany({ where: { sessaoId } });
  const porChave = new Map(existentes.map((c) => [`${c.tipo}::${normalizarTextoCitacao(c.texto)}`, c]));
  const chavesMantidas = new Set<string>();

  const operacoes: Promise<unknown>[] = [];
  for (const item of atuais) {
    const chave = `${item.tipo}::${normalizarTextoCitacao(item.texto)}`;
    chavesMantidas.add(chave);
    const existente = porChave.get(chave);
    if (existente) {
      // Mesma identidade de TEXTO. Duas mudanças possíveis aqui, e elas NÃO valem o mesmo:
      //
      //  · só a FORMA do texto mudou (um espaço, uma quebra de linha, uma maiúscula — tudo que a
      //    normalização já ignora): a confirmação SOBREVIVE. É para isso que a identidade é a
      //    forma normalizada, e não a string crua.
      //
      //  · mudaram os LINKS: a confirmação CAI. Achado da revisão — antes, `fonteUrl` e
      //    `fonteSecundariaUrl` eram atualizados junto com o texto e a confirmação seguia de pé.
      //    A decisão do dono é explícita sobre o que o advogado está confirmando: "os links
      //    utilizados na dupla validação para conferência, uma a uma". O "li e revisei" é sobre
      //    a citação E os links por onde ela foi conferida. Como `jurisprudenciaCitada` é
      //    repovoada a cada geração do Hermes, uma mesma ementa pode voltar com outra fonte
      //    secundária (ou com uma que antes não existia) sem uma vírgula do texto mudar — e, com
      //    o comportamento antigo, o "li e revisei" de ontem passava a responder por um link que
      //    o advogado nunca abriu. É exatamente a responsabilidade que esta tela existe para
      //    criar ("ninguém poderá dizer que não viu"), assinada em branco.
      //
      // hashDoTexto não socorre aqui: ele é impressão do TEXTO, e o texto não mudou.
      const mudouAFormaDoTexto = existente.texto !== item.texto;
      const mudaramOsLinks =
        existente.fonteUrl !== item.fonteUrl || existente.fonteSecundariaUrl !== item.fonteSecundariaUrl;
      if (mudouAFormaDoTexto || mudaramOsLinks) {
        operacoes.push(
          prisma.peticionamentoCitacao.update({
            where: { id: existente.id },
            data: {
              texto: item.texto,
              fonteUrl: item.fonteUrl,
              fonteSecundariaUrl: item.fonteSecundariaUrl,
              ...(mudaramOsLinks ? { confirmadaPorId: null, confirmadaEm: null, hashDoTexto: null } : {}),
            },
          }),
        );
      }
    } else {
      operacoes.push(
        prisma.peticionamentoCitacao.create({
          data: { sessaoId, tipo: item.tipo, texto: item.texto, fonteUrl: item.fonteUrl, fonteSecundariaUrl: item.fonteSecundariaUrl },
        }),
      );
    }
  }
  // Sobrou no mapa quem não está mais na lista atual — a citação mudou de texto ou desapareceu; dos
  // dois jeitos, uma confirmação antiga (se houver) não pode continuar valendo por um texto que já
  // não existe mais na minuta.
  for (const [chave, existente] of porChave) {
    if (!chavesMantidas.has(chave)) operacoes.push(prisma.peticionamentoCitacao.delete({ where: { id: existente.id } }));
  }
  await Promise.all(operacoes);
}

export type CitacaoParaValidacao = {
  id: string;
  tipo: "EMENTA" | "TRECHO";
  texto: string;
  fonteUrl: string | null;
  fonteSecundariaUrl: string | null;
  confirmada: boolean;
  confirmadaPorNome: string | null;
  confirmadaEm: Date | null;
};

/**
 * A lista de validação (decisão do dono, 22/09/2026): ementas citadas + trechos soltos, sempre
 * recalculada a partir do estado ATUAL da minuta antes de responder — nunca uma foto velha.
 */
export async function listarCitacoesParaValidacao(sessaoId: string): Promise<CitacaoParaValidacao[]> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  await sincronizarCitacoes(sessaoId, user.officeId);
  const linhas = await prisma.peticionamentoCitacao.findMany({
    where: { sessaoId },
    include: { confirmadaPor: { select: { name: true } } },
    orderBy: [{ tipo: "asc" }, { createdAt: "asc" }],
  });
  return linhas.map((c) => ({
    id: c.id,
    tipo: c.tipo as "EMENTA" | "TRECHO",
    texto: c.texto,
    fonteUrl: c.fonteUrl,
    fonteSecundariaUrl: c.fonteSecundariaUrl,
    confirmada: !!c.confirmadaPorId,
    confirmadaPorNome: c.confirmadaPor?.name ?? null,
    confirmadaEm: c.confirmadaEm,
  }));
}

/**
 * O botão INDIVIDUAL "li e revisei" — não existe "confirmar todas" (decisão do dono é explícita:
 * o ponto da mudança é obrigar a olhar uma por uma). Cada chamada confirma UMA única citação.
 */
export async function confirmarCitacaoIndividual(sessaoId: string, citacaoId: string): Promise<{ ok: true } | { error: string }> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  // A citação pende de uma sessão JÁ conferida — mesmo padrão de PeticionamentoAnexo/
  // PeticionamentoExportacao (ver lib/testes/peticionamentoIsolamento.teste.ts): o corte por
  // sessaoId basta, porque sessaoId já foi validado contra o officeId de quem pediu.
  const citacao = await prisma.peticionamentoCitacao.findFirst({ where: { id: citacaoId, sessaoId } });
  if (!citacao) return { error: "Citação não encontrada nesta sessão." };
  await prisma.peticionamentoCitacao.update({
    where: { id: citacaoId },
    data: { confirmadaPorId: user.id, confirmadaEm: new Date(), hashDoTexto: hashDeTexto(citacao.texto) },
  });
  revalidatePath(`/peticionamento/${sessaoId}/minuta`);
  return { ok: true };
}

/** Quantas citações ainda faltam confirmar — o botão de exportar usa isto para dizer "faltam N". */
export async function contarCitacoesPendentes(sessaoId: string): Promise<number> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  await sincronizarCitacoes(sessaoId, user.officeId);
  return prisma.peticionamentoCitacao.count({ where: { sessaoId, confirmadaPorId: null } });
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
    categoriaPeca: sessao.categoriaPeca,
    tipoPeca: sessao.tipoPeca,
    tipoPecaOutro: sessao.tipoPecaOutro,
    naturezaProcedimento: sessao.naturezaProcedimento,
    naturezaMotivo: sessao.naturezaMotivo,
    naturezaConfirmadaManualmente: sessao.naturezaConfirmadaManualmente,
    fatos: sessao.fatos ?? "",
    pedidos: ((sessao.pedidos as string[] | null) ?? []) as string[],
    // A tela de confirmação existe para o advogado ver o que a máquina vai ler ANTES de ela
    // escrever — e o prazo preclusivo muda o documento gerado, então ele precisa estar visível ali.
    prazoFatal: prazoParaLeitura(sessao.prazoFatal),
    prazoPreclusivo: sessao.prazoPreclusivo,
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

  // Baixa e LÊ cada documento AQUI, uma única vez para toda a geração (prioridade 1 do dono:
  // "fazer o agente ler toda a documentação, pois é imprescindível") — nunca chama a ação pública
  // avaliarContextoDaSessao, que devolve a versão SANITIZADA (sem o texto) pensada para o
  // cliente; esta função precisa do texto de verdade para montar a mensagem ao Hermes.
  const { avaliacao, documentos } = await calcularAvaliacaoDeContexto(sessaoId, user.officeId);
  if (avaliacao.acao === "bloqueado") return { error: avaliacao.aviso ?? "Contexto grande demais mesmo após resumir." };

  if (!hermesConfigurado()) {
    await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { status: "FALHA_GERACAO" } });
    return { error: "O Hermes não está configurado neste ambiente (faltam HERMES_URL/HERMES_TOKEN) — não é possível gerar a minuta agora. Isto não é uma falha da sessão: os dados desta triagem continuam salvos." };
  }

  await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { status: "GERANDO" } });

  // `avaliacao.itens` carrega o TEXTO FINAL de cada documento (já cortado, se a janela precisou
  // resumir) — casa de volta com `documentos` (que sabe quem leu/não leu) pelo id.
  const itensPorId = new Map(avaliacao.itens.map((item) => [item.id, item]));
  const documentosParaPrompt = documentos.map((doc) => {
    if (!doc.resultado.ok) {
      // NUNCA manda string vazia (era a raiz do defeito original: o Hermes via o NOME do
      // documento sob "Documentos disponíveis nesta sessão" e preenchia o vazio sozinho). O
      // marcador abaixo é explícito: não presuma, não invente, não liste como usado.
      return { nome: doc.nome, texto: `[NÃO FOI POSSÍVEL LER ESTE DOCUMENTO — ${doc.resultado.motivo} Não presuma nem invente o conteúdo deste documento; não inclua "${doc.nome}" na lista de documentos usados.]` };
    }
    return { nome: doc.nome, texto: itensPorId.get(doc.id)?.textoFinal ?? doc.resultado.texto };
  });

  const mensagem = montarMensagemParaHermes({
    materia: sessao.materiaNome ?? "(não informada)",
    categoriaPeca: sessao.categoriaPeca,
    tipoPeca: sessao.tipoPeca,
    tipoPecaOutro: sessao.tipoPecaOutro,
    contextoDescricao: await descricaoDoContexto(sessaoId, user.officeId),
    fatos: sessao.fatos ?? "",
    pedidos: ((sessao.pedidos as string[] | null) ?? []) as string[],
    prazoFatal: prazoParaLeitura(sessao.prazoFatal),
    prazoPreclusivo: sessao.prazoPreclusivo,
    teses: ((sessao.teses as string[] | null) ?? []) as string[],
    observacoes: sessao.observacoes,
    documentos: documentosParaPrompt,
    contextoFoiResumido: avaliacao.acao === "resumido",
    avisoDeResumo: avaliacao.aviso,
  });

  // A lista de "documentos consultados" só pode conter quem foi de fato LIDO e ENVIADO — nunca
  // "todos os selecionados" (o comportamento antigo: um documento nunca lido aparecia como
  // "consultado" só por estar marcado na sessão) — ver relatório da entrega, prioridade 1.
  const nomesLidos = documentos.filter((d) => d.resultado.ok).map((d) => d.nome);
  const documentosNaoLidos: { nome: string; motivo: string }[] = [];
  for (const d of documentos) if (!d.resultado.ok) documentosNaoLidos.push({ nome: d.nome, motivo: d.resultado.motivo });

  try {
    const resposta = await perguntarAoHermesComPerfil({
      perfil: perfilDePeticionamento(),
      mensagem,
      sessao: sessao.hermesSessionId,
    });
    const estruturada = interpretarRespostaHermes(resposta.resposta);
    const corpoComFecho = garantirFecho(estruturada.corpo);
    const riscosFiltrados = filtrarNotaDeRiscos(estruturada.riscos);
    const riscosComAviso = comAvisoDeContextoResumido(riscosFiltrados.aceitas, avaliacao.acao === "resumido");

    // Filtra a declaração do agente contra o que REALMENTE foi lido — nunca aceita um nome
    // alucinado (citado sem ter vindo no pacote), e nunca cai de volta para "todos os
    // selecionados" quando a declaração vem vazia: cai para os que FORAM lidos, o único conjunto
    // que pode ser chamado de "consultado" com verdade.
    const declaradosEValidos = estruturada.documentosUsados.filter((nome) => nomesLidos.includes(nome));

    await prisma.peticionamentoSessao.update({
      where: { id: sessaoId },
      data: {
        status: "GERADA",
        minutaTexto: corpoComFecho,
        notaRiscos: riscosComAviso,
        jurisprudenciaCitada: estruturada.jurisprudencia as unknown as object,
        documentosBaseConsultados: declaradosEValidos.length ? declaradosEValidos : nomesLidos,
        documentosNaoLidos,
        tipoPecaInferido: !sessao.tipoPeca && !!estruturada.tipoPecaInferido,
        tipoPeca: !sessao.tipoPeca && estruturada.tipoPecaInferido ? estruturada.tipoPecaInferido : sessao.tipoPeca,
        hermesSessionId: resposta.sessao || sessao.hermesSessionId,
        geradoEm: new Date(),
      },
    });
    // Popula a lista de validação de citações (decisão do dono, 22/09/2026) já na primeira
    // geração — nunca deixa a tela de minuta abrir com a lista vazia por falta de sincronizar.
    await sincronizarCitacoes(sessaoId, user.officeId);
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
  // Decisão do dono (22/09/2026): editar a minuta invalida a confirmação das citações que
  // mudaram — recalculado AQUI, no momento da edição, para a lista nunca ficar atrasada em
  // relação ao texto que o advogado acabou de salvar.
  await sincronizarCitacoes(sessaoId, user.officeId);
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

  // HARD GATE 3 (decisão do dono, 22/09/2026): toda citação — ementa ou trecho solto — precisa
  // estar confirmada, uma a uma, antes de exportar. Resincroniza a partir do texto ATUAL da minuta
  // primeiro (defesa em profundidade: mesmo que a tela de validação não tenha sido revisitada
  // depois da última edição, a exportação nunca deixa passar uma citação cujo texto mudou).
  await sincronizarCitacoes(sessaoId, user.officeId);
  const citacoesPendentes = await prisma.peticionamentoCitacao.count({ where: { sessaoId, confirmadaPorId: null } });
  if (citacoesPendentes > 0) {
    return {
      error: `Ainda falta${citacoesPendentes === 1 ? "" : "m"} confirmar ${citacoesPendentes} cita${citacoesPendentes === 1 ? "ção" : "ções"} antes de exportar — cada uma precisa da marca "li e revisei" individual, na tela da minuta.`,
    };
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
    documentosNaoLidos: ((sessao.documentosNaoLidos as { nome: string; motivo: string }[] | null) ?? []) as { nome: string; motivo: string }[],
    prazoPreclusivoEm: sessao.prazoPreclusivo ? sessao.prazoFatal : null,
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
