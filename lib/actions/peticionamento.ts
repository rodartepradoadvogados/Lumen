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
import { MATERIAS_DO_LUMEN, validarNovaMateria, lerMateriasDaSessao, normalizarSelecaoDeMaterias, type MateriaEscolhida } from "@/lib/peticionamentoMateria";
import { LIMITE_DE_RESULTADOS, ehTipoDeBuscaConhecido, normalizarTermo, termoEhBuscavel, subtipoEfetivo, type TipoDeBusca } from "@/lib/peticionamentoBusca";
import { naturezaWhere } from "@/lib/caseNatureza";
import { avaliarJanela, comMilhar, LIMITE_PADRAO_CARACTERES, type ItemDeContexto as ItemDeJanela, type ItemAvaliado } from "@/lib/peticionamentoJanelaDeContexto";
import { extrairTextoDeDocumento } from "@/lib/peticionamentoExtracaoDocumento";
import { ehCategoriaConhecida } from "@/lib/peticionamentoCategoriaPeca";
import { deduzirNatureza, ehNaturezaConhecida, type SinalDeVinculoParaNatureza, type DeducaoDeNatureza } from "@/lib/peticionamentoNatureza";
import { passoParaRetomar, ehPassoValido, hrefDoPasso, ROTULO_DO_PASSO, sessaoTemTrabalhoEmAndamento } from "@/lib/peticionamentoPasso";
import { montarMensagemParaHermes, custoFixoDaMensagem, type DadosParaPrompt } from "@/lib/peticionamentoPrompt";
import { interpretarRespostaHermes } from "@/lib/peticionamentoRespostaHermes";
import { montarListaDeCitacoes, normalizarTextoCitacao, hashDeTexto, type PrecedenteParaCitacao } from "@/lib/peticionamentoCitacoes";
import { garantirFecho } from "@/lib/peticionamentoFecho";
import { filtrarNotaDeRiscos, comAvisoDeContextoResumido } from "@/lib/peticionamentoRiscos";
import { montarNotaObrigatoria } from "@/lib/peticionamentoNotaObrigatoria";
import { montarNomeArquivoPeticao } from "@/lib/peticionamentoNomeArquivo";
import { montarPeticaoWord } from "@/lib/peticionamentoDocx";
import { hermesConfigurado, perguntarAoHermesComPerfil, perfilDePeticionamento, ESPERA_PETICIONAMENTO_MS, FalhaDoHermes } from "@/lib/hermesPonte";
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
  /** TODAS as matérias marcadas (leitura fail-open do dado antigo — ver lib/peticionamentoMateria.ts). */
  materias: string[];
  passo: string;
  passoRotulo: string;
  href: string;
  atualizadoEm: string;
  criadoPorNome: string;
  /**
   * O QUE SE PERDE ao excluir este rascunho — a tela de confirmação (espec. §3 + pedido do dono
   * 22/09/2026: "não tem opção de excluir rascunho") precisa DIZER o que vai embora antes de
   * apagar. Estes três números são essa frase, e vêm do servidor porque é lá que eles existem.
   */
  anexosCount: number;
  documentosCount: number;
  temMinuta: boolean;
  /** false quando existe registro de exportação apontando para a sessão — ver excluirRascunho. */
  podeExcluir: boolean;
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
      materiasNomes: true,
      geradoEm: true,
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
      _count: { select: { anexos: true, exportacoes: true } },
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
      materias: lerMateriasDaSessao(s.materiasNomes, s.materiaNome),
      passo,
      passoRotulo: ROTULO_DO_PASSO[passo],
      href: hrefDoPasso(s.id, passo),
      atualizadoEm: s.updatedAt.toISOString(),
      criadoPorNome: s.criadoPor.name,
      anexosCount: s._count.anexos,
      documentosCount: documentosExistentesIds.length,
      temMinuta: !!s.geradoEm,
      podeExcluir: s._count.exportacoes === 0,
    };
  });
}

/**
 * EXCLUIR RASCUNHO (pedido do dono, 22/09/2026, palavras dele: "não tem opção de excluir
 * rascunho"). Três decisões, e o motivo de cada uma:
 *
 * 1. APAGA DE VERDADE, não marca como descartada. Um rascunho é, por definição, trabalho não
 *    terminado: não há ato jurídico praticado a partir dele, nada foi protocolado, ninguém
 *    assinou nada. Guardar um túmulo ("DESCARTADA") só teria valor se algo lá fora apontasse
 *    para a sessão — e o único registro que aponta é PeticionamentoExportacao, tratado no item 2.
 *    Fora esse caso, manter a linha faria "excluir" ser mentira de produto: o advogado pede para
 *    sumir e a coisa continua ocupando banco, contagem e lista para sempre. As tabelas filhas
 *    (anexos, exportações, citações) têm onDelete: Cascade no schema e vão junto.
 *
 * 2. SESSÃO JÁ EXPORTADA NÃO SUMBE. PeticionamentoExportacao é o registro de AUDITORIA da trava
 *    de exportação (espec. §5: quem marcou o checkbox de ciência e quando) — a razão de ele
 *    existir no banco, e não só nos metadados do .docx, é justamente sobreviver ao arquivo. Um
 *    Cascade apagaria essa prova junto com a sessão, e o escritório perderia a resposta para "quem
 *    autorizou esta peça sair?" exatamente na peça que saiu. Por isso a recusa é explícita e diz
 *    o porquê, em vez de apagar em silêncio ou estourar um erro genérico. Na prática a tela nem
 *    oferece o botão (listarRascunhos devolve podeExcluir: false), mas a recusa mora AQUI —
 *    nunca só na tela.
 *
 * 3. CONFIRMAÇÃO EXIGIDA NO SERVIDOR. `confirmado` chega da tela, que mostra antes o que será
 *    perdido; a ação recusa sem ele. Um clique acidental não apaga trabalho de ninguém, mesmo que
 *    a tela seja contornada por uma chamada direta.
 *
 * O QUE NÃO É APAGADO, e a tela diz isso: os arquivos já enviados ao Google Drive continuam lá,
 * na subpasta da sessão dentro de "Peticionamento". Apagar arquivo no Drive de alguém a partir de
 * um clique em "excluir rascunho" seria destruição de documento que o advogado pode ter promovido
 * a anexo oficial — o link no Drive é a cópia dele, não nossa.
 */
export async function excluirRascunho(sessaoId: string, confirmado: boolean): Promise<{ ok: true } | { error: string }> {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);

  if (!confirmado) {
    return { error: "Exclusão não confirmada — o rascunho continua salvo." };
  }

  const exportacoes = await prisma.peticionamentoExportacao.count({ where: { sessaoId } });
  if (exportacoes > 0 || sessao.status === "EXPORTADA") {
    return {
      error:
        "Esta sessão já foi exportada e não pode ser excluída: existe registro de exportação apontando para ela (quem confirmou a ciência do rascunho gerado por IA, e quando). Esse registro é a auditoria da peça que saiu do escritório — apagá-lo junto com a sessão apagaria a prova de quem autorizou. Ela também não aparece na lista de rascunhos.",
    };
  }

  // O `where` do deleteMany carrega officeId E o status — defesa em profundidade, mesmo padrão do
  // resto do arquivo: nem um id de outro escritório, nem uma sessão que virou EXPORTADA entre a
  // leitura acima e esta linha, apagam nada. `deleteMany` (e não `delete`) porque só ele aceita
  // `where` composto; o `count` devolvido é a prova de que a linha certa foi a que saiu.
  const { count } = await prisma.peticionamentoSessao.deleteMany({
    where: { id: sessaoId, officeId: user.officeId, status: { not: "EXPORTADA" } },
  });
  if (count === 0) return { error: "Não foi possível excluir este rascunho — recarregue a lista e tente de novo." };

  revalidatePath("/peticionamento/rascunhos");
  revalidatePath("/peticionamento");
  return { ok: true };
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

/**
 * MAIS DE UMA MATÉRIA (pedido do dono, 22/09/2026). Era `definirMateria`, uma só, até aqui.
 *
 * OS DOIS CAMPOS SÃO GRAVADOS JUNTOS, SEMPRE — exigência literal do contrato de schema
 * (prisma/schema.prisma, PeticionamentoSessao.materiasNomes: "quem escrever precisa manter os
 * dois em pé ao mesmo tempo, sempre: gravar a lista e gravar a primeira em materiaNome, na MESMA
 * transação"). É por isso que isto é UM `update` só, e não dois: um único `update` do Prisma é um
 * único statement, logo atômico por definição. Dois updates em sequência poderiam deixar a sessão,
 * entre um e outro, com a lista nova e a principal velha — e é exatamente `materiaNome` que a
 * lista de rascunhos mostra e que o passo "contexto" usa para saber se a matéria foi escolhida.
 *
 * Lista vazia é permitida (o advogado desmarcou tudo): grava lista vazia E principal nula, nunca
 * uma principal órfã de uma lista que não a contém mais.
 */
export async function definirMaterias(sessaoId: string, selecao: MateriaEscolhida[]): Promise<{ ok: true } | { error: string }> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const materias = normalizarSelecaoDeMaterias(selecao);
  const principal = materias[0] ?? null;
  await prisma.peticionamentoSessao.update({
    where: { id: sessaoId },
    data: {
      materiasNomes: materias.map((m) => m.nome),
      materiaNome: principal?.nome ?? null,
      materiaEhDoEscritorio: principal?.ehDoEscritorio ?? false,
    },
  });
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

export type CandidatoResolvido = CandidatoDeContexto & { bloqueado: boolean; motivoBloqueio: string | null; selecionado: boolean };

/**
 * OS VÍNCULOS JÁ ESCOLHIDOS nesta sessão — e só eles. São poucos por definição (a trava de
 * cliente impede que virem muitos) e precisam aparecer sempre, mesmo quando a busca do lado está
 * vazia: é por aqui que o advogado DESMARCA o que vinculou por engano.
 *
 * Até 22/09/2026 esta informação vinha junto de `buscarCandidatosDeContexto`, que carregava 200
 * processos + 200 atendimentos + 200 assessorias do escritório inteiro a cada abertura da tela,
 * para o React filtrar no cliente. Era exatamente o que o dono pediu para acabar ("ao invés de
 * ficar navegando em uma lista imensa de processos") — e, de quebra, mandava ao navegador o nome
 * de 600 clientes que aquela sessão jamais usaria. A busca agora é do SERVIDOR
 * (buscarContextoParaVincular, logo abaixo) e esta função devolve só o que já está marcado.
 */
export async function obterVinculosDaSessao(sessaoId: string): Promise<{
  vinculados: CandidatoResolvido[];
  clienteTravado: { id: string; nome: string | null } | null;
}> {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const vinculo = lerVinculo(sessao);
  const clienteTravado = sessao.clienteId ? { id: sessao.clienteId, nome: sessao.clienteNome } : null;

  const [cases, attendances, assessorias] = await Promise.all([
    vinculo.caseIds.length
      ? prisma.case.findMany({
          where: { id: { in: vinculo.caseIds }, officeId: user.officeId },
          select: { id: true, title: true, processNumber: true, court: true, clientId: true, client: { select: { name: true } } },
        })
      : Promise.resolve([]),
    vinculo.attendanceIds.length
      ? prisma.attendance.findMany({ where: { id: { in: vinculo.attendanceIds }, officeId: user.officeId }, select: { id: true, subject: true, clientName: true, channel: true, clientId: true } })
      : Promise.resolve([]),
    vinculo.assessoriaIds.length
      ? prisma.assessoria.findMany({ where: { id: { in: vinculo.assessoriaIds }, officeId: user.officeId }, select: { id: true, clientId: true, client: { select: { name: true } } } })
      : Promise.resolve([]),
  ]);

  const vinculados: CandidatoResolvido[] = [
    ...cases.map((c) => ({ ...itemDeCase(c), bloqueado: false, motivoBloqueio: null, selecionado: true })),
    ...attendances.map((a) => ({ ...itemDeAttendance(a), bloqueado: false, motivoBloqueio: null, selecionado: true })),
    ...assessorias.map((a) => ({ ...itemDeAssessoria(a, null), bloqueado: false, motivoBloqueio: null, selecionado: true })),
  ];

  return { vinculados, clienteTravado };
}

// ── OS TRÊS TRADUTORES de linha do banco para linha da tela. Existem separados porque a busca
// (abaixo) e a lista de já-vinculados (acima) precisam produzir EXATAMENTE o mesmo formato de
// linha — duas montagens paralelas divergiriam no primeiro ajuste de rótulo. ───────────────────

function itemDeCase(c: { id: string; title: string; processNumber: string | null; court: string | null; clientId: string | null; client: { name: string } | null }): CandidatoDeContexto {
  return {
    id: c.id,
    tipo: "case",
    clienteId: c.clientId,
    clienteNome: c.client?.name ?? null,
    titulo: c.processNumber ? `Processo nº ${c.processNumber}` : c.title,
    subtitulo: [c.client?.name, c.court, c.processNumber ? c.title : null].filter(Boolean).join(" — "),
  };
}

function itemDeAttendance(a: { id: string; subject: string; clientName: string; channel: string; clientId: string | null }): CandidatoDeContexto {
  return { id: a.id, tipo: "attendance", clienteId: a.clientId, clienteNome: a.clientName, titulo: `Atendimento — ${a.subject}`, subtitulo: `${a.clientName} · ${a.channel}` };
}

/**
 * `achadoPor` é o que o dono pediu sem pedir: quando o advogado procurou por LICITAÇÃO ou por
 * DEMANDA, o que entra na sessão é a ASSESSORIA dona daquilo (a sessão só sabe vincular
 * processo/atendimento/assessoria — ver PeticionamentoSessao no schema). A linha diz isso em
 * texto, sempre: "Assessoria — Empresa X · encontrada pela licitação «Pregão 12/2026»". Sem essa
 * frase, o advogado clicaria numa licitação e veria uma assessoria aparecer marcada, sem entender.
 */
function itemDeAssessoria(a: { id: string; clientId: string; client: { name: string } }, achadoPor: string | null): CandidatoDeContexto {
  return {
    id: a.id,
    tipo: "assessoria",
    clienteId: a.clientId,
    clienteNome: a.client.name,
    titulo: `Assessoria — ${a.client.name}`,
    subtitulo: achadoPor ?? "Assessoria jurídica continuada",
  };
}

export type ResultadoDaBusca = {
  resultados: CandidatoResolvido[];
  /** true quando existem mais linhas do que o teto — a tela pede para refinar o termo, nunca finge que acabou. */
  truncado: boolean;
  /** false quando o termo ainda é curto demais: a tela mostra "os mais recentes", não um vazio enganoso. */
  filtradoPorTermo: boolean;
  clienteTravado: { id: string; nome: string | null } | null;
};

/**
 * A BUSCA DO ITEM 3 (pedido do dono, 22/09/2026). Roda NO SERVIDOR, sempre: o corte por officeId
 * e o volume de dados vivem aqui, e a lista completa nunca chega ao navegador para ser filtrada
 * em JavaScript. Todo `where` abaixo carrega officeId DENTRO dele — nunca um filtro depois da
 * consulta (lib/testes/peticionamentoIsolamento.teste.ts varre isto consulta a consulta).
 *
 * Termo curto demais (< MINIMO_DE_CARACTERES) não é erro: devolve os mais RECENTES daquele tipo,
 * limitados ao mesmo teto — a tela nasce útil, sem lista imensa e sem tela em branco.
 *
 * A trava de cliente (lib/peticionamentoContexto.ts) é aplicada sobre o resultado como sempre:
 * o que pertence a outro cliente volta marcado como bloqueado, COM o motivo — nunca some da
 * busca em silêncio, senão o advogado procuraria pelo processo certo e concluiria que ele não
 * existe no Lúmen.
 */
export async function buscarContextoParaVincular(
  sessaoId: string,
  tipoPedido: string,
  subtipoPedido: string | null,
  termoDigitado: string,
): Promise<ResultadoDaBusca | { error: string }> {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);
  if (!ehTipoDeBuscaConhecido(tipoPedido)) return { error: "Tipo de busca desconhecido." };

  const tipo: TipoDeBusca = tipoPedido;
  const subtipo = subtipoEfetivo(tipo, subtipoPedido);
  const termo = normalizarTermo(termoDigitado);
  const filtradoPorTermo = termoEhBuscavel(termo);
  const contem = { contains: termo, mode: "insensitive" as const };
  const teto = LIMITE_DE_RESULTADOS + 1; // +1 só para saber que há mais — a linha extra nunca é devolvida.

  const vinculoAtual = lerVinculo(sessao);
  const clienteTravado = sessao.clienteId ? { id: sessao.clienteId, nome: sessao.clienteNome } : null;
  const officeId = user.officeId;

  let itens: CandidatoDeContexto[] = [];

  if (tipo === "atendimento") {
    const linhas = await prisma.attendance.findMany({
      where: { officeId, ...(filtradoPorTermo ? { OR: [{ subject: contem }, { clientName: contem }] } : {}) },
      select: { id: true, subject: true, clientName: true, channel: true, clientId: true },
      orderBy: { createdAt: "desc" },
      take: teto,
    });
    itens = linhas.map(itemDeAttendance);
  } else if (tipo !== "assessoria" || subtipo === "processo-vinculado") {
    // Os quatro caminhos que terminam em Case. A natureza vem de lib/caseNatureza.ts — a MESMA
    // régua das abas Judicial/Administrativo/Casos do Lúmen, nunca uma segunda definição de
    // "o que é um processo judicial" morando só nesta aba.
    const recorteDeNatureza =
      tipo === "processo-judicial" ? { type: "JUDICIAL" } : tipo === "processo-administrativo" ? { type: "ADMINISTRATIVO" } : tipo === "caso" ? naturezaWhere("CASO") : {};
    const linhas = await prisma.case.findMany({
      where: {
        officeId,
        ...recorteDeNatureza,
        // "Processo vinculado" (subtipo de assessoria) = processo/caso cadastrado DENTRO de uma
        // assessoria — é o que a aba "Demandas, Processos e Casos" da Assessoria mostra.
        ...(subtipo === "processo-vinculado" ? { assessoriaId: { not: null } } : {}),
        ...(filtradoPorTermo ? { OR: [{ title: contem }, { processNumber: contem }, { court: contem }, { client: { name: contem } }] } : {}),
      },
      select: { id: true, title: true, processNumber: true, court: true, clientId: true, client: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: teto,
    });
    itens = linhas.map(itemDeCase);
  } else if (subtipo === "licitacao") {
    const linhas = await prisma.licitacao.findMany({
      where: {
        officeId,
        ...(filtradoPorTermo ? { OR: [{ nome: contem }, { objeto: contem }, { orgao: contem }, { assessoria: { client: { name: contem } } }] } : {}),
      },
      select: { id: true, nome: true, objeto: true, assessoria: { select: { id: true, clientId: true, client: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: teto,
    });
    itens = linhas.map((l) => itemDeAssessoria(l.assessoria, `Encontrada pela licitação «${l.nome ?? l.objeto}»`));
  } else if (subtipo === "demanda") {
    // "Demanda" no Lúmen é um Parecer — ver components/assessoria/ParecerCard.tsx e a aba
    // "Demandas, Processos e Casos" de app/(app)/assessoria/[id]/page.tsx.
    const linhas = await prisma.parecer.findMany({
      where: { officeId, ...(filtradoPorTermo ? { OR: [{ name: contem }, { assessoria: { client: { name: contem } } }] } : {}) },
      select: { id: true, name: true, assessoria: { select: { id: true, clientId: true, client: { select: { name: true } } } } },
      orderBy: { date: "desc" },
      take: teto,
    });
    itens = linhas.map((d) => itemDeAssessoria(d.assessoria, `Encontrada pela demanda «${d.name}»`));
  } else {
    const linhas = await prisma.assessoria.findMany({
      where: { officeId, ...(filtradoPorTermo ? { client: { name: contem } } : {}) },
      select: { id: true, clientId: true, client: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: teto,
    });
    itens = linhas.map((a) => itemDeAssessoria(a, null));
  }

  // Licitação e demanda podem apontar para a MESMA assessoria — duas licitações da mesma empresa
  // virariam duas linhas idênticas na tela, e marcar uma marcaria "as duas".
  const vistos = new Set<string>();
  const unicos = itens.filter((i) => {
    const chave = `${i.tipo}:${i.id}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });

  const truncado = unicos.length > LIMITE_DE_RESULTADOS;
  const pagina = unicos.slice(0, LIMITE_DE_RESULTADOS);
  const avaliados = avaliarCandidatos(pagina, clienteTravado?.id ?? null);
  const jaSelecionados = { case: vinculoAtual.caseIds, attendance: vinculoAtual.attendanceIds, assessoria: vinculoAtual.assessoriaIds };

  return {
    resultados: pagina.map((item, i) => ({
      ...item,
      bloqueado: avaliados[i].bloqueado,
      motivoBloqueio: avaliados[i].motivoBloqueio,
      selecionado: jaSelecionados[item.tipo].includes(item.id),
    })),
    truncado,
    filtradoPorTermo,
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

/**
 * O texto de UM documento como ele vai à mensagem do Hermes.
 *
 * NUNCA string vazia para documento que não deu para ler (era a raiz do defeito original: o
 * Hermes via o NOME do documento sob "Documentos disponíveis nesta sessão" e preenchia o vazio
 * sozinho). O marcador abaixo é explícito: não presuma, não invente, não liste como usado.
 *
 * Mora aqui, e não dentro de confirmarTriagemEGerar, porque DOIS lugares precisam do mesmo
 * texto: a montagem da mensagem e a medição do custo fixo do pedido (calcularAvaliacaoDeContexto)
 * — e um marcador medido com um tamanho e enviado com outro traria de volta, por outra porta,
 * exatamente o desencontro entre o que se mede e o que se manda que esta entrega conserta.
 */
function textoDoDocumentoParaPrompt(doc: DocumentoDaSessaoComTexto): string {
  if (doc.resultado.ok) return doc.resultado.texto;
  return `[NÃO FOI POSSÍVEL LER ESTE DOCUMENTO — ${doc.resultado.motivo} Não presuma nem invente o conteúdo deste documento; não inclua "${doc.nome}" na lista de documentos usados.]`;
}

// ── JANELA DE CONTEXTO — nunca trunca em silêncio (especificação §8) ───────────────────────────

/**
 * Avalia a sessão inteira (fatos + TODO documento, existente ou anexado, com texto já lido) —
 * usado tanto pela ação pública abaixo (tela de confirmação) quanto por confirmarTriagemEGerar,
 * que precisa do `textoFinal` por item para montar a mensagem ao Hermes; os dois chamam ESTA
 * função para baixar/ler cada documento uma ÚNICA vez por geração, nunca duas.
 *
 * E É AQUI QUE A CONTA PASSOU A SER A DA MENSAGEM INTEIRA. Antes, `avaliarJanela` recebia só
 * `fatos` + os documentos — mas o que a ponte mede é o retorno de `montarMensagemParaHermes`,
 * que leva junto instruções fixas, matéria, categoria, tipo de peça, contexto vinculado,
 * pedidos, teses, observações, as cercas de documento e os avisos. A trava dizia "coube" e a
 * mensagem estourava assim mesmo: foi esse o 400 que o dono viu na tela.
 *
 * Por isso esta função monta os MESMOS `dadosDoPrompt` que confirmarTriagemEGerar vai usar,
 * mede o custo fixo com `custoFixoDaMensagem` (que chama o montador de verdade, com os textos
 * vazios — nunca uma segunda conta escrita à mão, que divergiria em silêncio), e devolve esses
 * dados prontos. Um caminho só, uma conta só.
 */
async function calcularAvaliacaoDeContexto(sessaoId: string, officeId: string) {
  const sessao = await carregarSessaoOuFalhar(sessaoId, officeId);
  const documentos = await carregarDocumentosDaSessaoComTexto(sessaoId, officeId);

  // O ESQUELETO DO PEDIDO: tudo que vai ao agente menos o texto dos fatos e dos documentos (que
  // entram abaixo como itens, cada um com seu orçamento). `textoDoDocumentoParaPrompt` devolve,
  // para o documento que NÃO deu para ler, o marcador explícito de "não presuma" — ele ocupa
  // lugar na mensagem e por isso é contado aqui, no custo fixo, e não como item.
  const dadosDoPrompt: DadosParaPrompt = {
    // AS MATÉRIAS ENTRAM AQUI, e não na montagem final: `dadosDoPrompt` é o que
    // `custoFixoDaMensagem` mede. Com várias matérias o bloco cresce, e um bloco que cresce sem
    // ocupar lugar no orçamento é a mesma família de defeito que as entregas #306/#307
    // consertaram — o que se mede tem de ser o que se manda.
    materias: lerMateriasDaSessao(sessao.materiasNomes, sessao.materiaNome),
    categoriaPeca: sessao.categoriaPeca,
    tipoPeca: sessao.tipoPeca,
    tipoPecaOutro: sessao.tipoPecaOutro,
    contextoDescricao: await descricaoDoContexto(sessaoId, officeId),
    fatos: sessao.fatos ?? "",
    pedidos: ((sessao.pedidos as string[] | null) ?? []) as string[],
    // O PRAZO ENTRA AQUI, e não lá embaixo na montagem: `dadosDoPrompt` é o que
    // `custoFixoDaMensagem` mede. Se os campos do prazo só aparecessem na hora de montar a
    // mensagem final, a seção do prazo preclusivo iria ao agente SEM ter ocupado lugar no
    // orçamento — e o orçamento voltaria a medir menos do que se manda, que é a família de
    // defeito inteira que estas duas entregas consertaram.
    prazoFatal: prazoParaLeitura(sessao.prazoFatal),
    prazoPreclusivo: sessao.prazoPreclusivo,
    teses: ((sessao.teses as string[] | null) ?? []) as string[],
    observacoes: sessao.observacoes,
    // Texto vazio no documento LIDO (o conteúdo entra depois, com o orçamento que a janela der);
    // marcador inteiro no documento que NÃO deu para ler, porque ele vai à mensagem do jeito que
    // está e o seu tamanho é fixo.
    documentos: documentos.map((d) => ({ nome: d.nome, texto: d.resultado.ok ? "" : textoDoDocumentoParaPrompt(d) })),
    contextoFoiResumido: false,
    avisoDeResumo: null,
  };
  const custoFixo = custoFixoDaMensagem(dadosDoPrompt);

  // Documento é sempre `protegido: true` — nunca se manda ao agente meia leitura de um laudo, de
  // um contrato ou da contestação a que se responde (ver "POR QUE DOCUMENTO CONTINUA PROTEGIDO"
  // em lib/peticionamentoJanelaDeContexto.ts: com o limite agora REAL, essa escolha é o que
  // troca "resumido em silêncio-quase" por uma recusa falada, com o caminho de saída nomeado).
  // Documento cuja leitura FALHOU entra com texto vazio: não pesa como item (o marcador que vai
  // no lugar dele já foi contado no custo fixo) e nunca aparece "resumido" — não faz sentido
  // resumir o que não foi lido.
  const itens: ItemDeJanela[] = [
    { id: "fatos", rotulo: "Fatos descritos pelo advogado", texto: sessao.fatos ?? "" },
    ...documentos.map((d) => ({ id: d.id, rotulo: d.nome, texto: d.resultado.ok ? d.resultado.texto : "", protegido: true })),
  ];
  const avaliacao = avaliarJanela(itens, { custoFixo });

  await prisma.peticionamentoSessao.update({
    where: { id: sessaoId },
    data: {
      contextoResumoAviso: avaliacao.acao === "resumido" ? avaliacao.aviso : null,
      contextoBloqueadoMotivo: avaliacao.acao === "bloqueado" ? avaliacao.aviso : null,
    },
  });

  return { avaliacao, documentos, dadosDoPrompt };
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
    // EM CARACTERES, não em tokens: é caractere o que a ponte conta, e era a troca de unidade
    // que fazia a trava passar longe do limite real (ver o cabeçalho do módulo da janela).
    caracteresTotaisOriginais: avaliacao.caracteresTotaisOriginais,
    caracteresTotaisFinais: avaliacao.caracteresTotaisFinais,
    custoFixo: avaliacao.custoFixo,
    limite: avaliacao.limite,
    aviso: avaliacao.aviso,
    // Lista explícita de campos (não um "resto" via destructuring) — nunca esquece de excluir um
    // campo novo que carregue texto, caso ItemAvaliado ganhe outro no futuro.
    itens: avaliacao.itens.map((item) => ({
      id: item.id,
      rotulo: item.rotulo,
      caracteresOriginais: item.caracteresOriginais,
      caracteresFinais: item.caracteresFinais,
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
    // TODAS as matérias marcadas — a tela de triagem mostra o que vai ao agente, e mostrar só a
    // principal esconderia justamente a matéria que o advogado acrescentou de propósito.
    materias: lerMateriasDaSessao(sessao.materiasNomes, sessao.materiaNome),
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
export async function confirmarTriagemEGerar(sessaoId: string): Promise<{ ok: true } | { error: string; contextoExcedido?: boolean }> {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);

  const prontidao = avaliarProntidao({ fatos: sessao.fatos, pedidos: (sessao.pedidos as string[] | null) ?? [] });
  if (!prontidao.pronto) return { error: `Não é possível gerar ainda: falta ${prontidao.faltando.join(" e ")}.` };

  // Baixa e LÊ cada documento AQUI, uma única vez para toda a geração (prioridade 1 do dono:
  // "fazer o agente ler toda a documentação, pois é imprescindível") — nunca chama a ação pública
  // avaliarContextoDaSessao, que devolve a versão SANITIZADA (sem o texto) pensada para o
  // cliente; esta função precisa do texto de verdade para montar a mensagem ao Hermes.
  const { avaliacao, documentos, dadosDoPrompt } = await calcularAvaliacaoDeContexto(sessaoId, user.officeId);
  // RECUSA FALADA, NUNCA O 400 CRU DA PONTE. `contextoExcedido` vai como CAMPO, e não escondido
  // no texto do erro: a tela levava o advogado à tela de limite procurando as palavras "contexto"
  // e "exced" dentro da frase, o que quebra na primeira vez que alguém reescrever a frase.
  if (avaliacao.acao === "bloqueado") {
    return { error: avaliacao.aviso ?? "O contexto selecionado é grande demais mesmo depois de resumir o que era seguro resumir.", contextoExcedido: true };
  }

  if (!hermesConfigurado()) {
    await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { status: "FALHA_GERACAO" } });
    return { error: "O Hermes não está configurado neste ambiente (faltam HERMES_URL/HERMES_TOKEN) — não é possível gerar a minuta agora. Isto não é uma falha da sessão: os dados desta triagem continuam salvos." };
  }

  await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { status: "GERANDO" } });

  // `avaliacao.itens` carrega o TEXTO FINAL de cada documento (já cortado, se a janela precisou
  // resumir) — casa de volta com `documentos` (que sabe quem leu/não leu) pelo id.
  const itensPorId = new Map(avaliacao.itens.map((item) => [item.id, item]));

  // ACHADO DA REVISÃO — A ESCOTILHA SILENCIOSA. Este bloco casava `avaliacao.itens` com
  // `documentos` pelo id e, quando a casação FALHAVA, caía num `?? doc.resultado.texto` que
  // mandava o texto INTEIRO. Isto é, o único jeito de a casação dar errado desfazia exatamente o
  // que esta entrega conserta — e sem ruído nenhum: mutei o mapa para casar por `rotulo` em vez
  // de `id` e as 71 suítes ficaram verdes.
  //
  // O estrago não é mandar demais (a última trava, mais abaixo, mede a mensagem pronta e recusa).
  // É a MENTIRA: `contextoFoiResumido` e `avisoDeResumo` continuam vindo da avaliação, então a
  // tela diria ao advogado "resumimos automaticamente" e o pedido diria ao agente que parte do
  // contexto foi condensada — enquanto o texto inteiro foi junto. Uma afirmação falsa nas duas
  // pontas, que é o que esta casa trata como defeito mesmo quando o dado "sobra" em vez de faltar.
  //
  // Um item que não casa é erro de programação, não estado possível do mundo: id de item e id de
  // documento nascem no MESMO lugar (`calcularAvaliacaoDeContexto`, logo acima). Então isto
  // falha FECHADO e falado, nunca cai de volta no texto cru.
  const semAvaliacao = documentos.filter((doc) => doc.resultado.ok && !itensPorId.has(doc.id)).map((doc) => doc.nome);
  if (semAvaliacao.length > 0 || !itensPorId.has("fatos")) {
    console.error(
      "[peticionamento] avaliação de contexto não casa com os documentos da sessão %s — itens sem par: %s",
      sessaoId,
      semAvaliacao.join(", ") || "(fatos)",
    );
    await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { status: "FALHA_GERACAO" } });
    return {
      error:
        "Não foi possível preparar o contexto desta sessão para o agente. Nada foi enviado e nada do que você " +
        "preencheu se perdeu — tente gerar de novo; se repetir, avise o suporte.",
    };
  }

  const documentosParaPrompt = documentos.map((doc) => ({
    nome: doc.nome,
    // O documento LIDO vai com o texto que a janela de contexto aprovou (`textoFinal`, já com o
    // aviso embutido se foi cortado); o NÃO lido vai com o marcador de "não presuma" —
    // `textoDoDocumentoParaPrompt` decide os dois casos, e é a MESMA função que mediu o custo.
    // Sem `??` de socorro: a ausência já foi tratada, fechada, logo acima.
    texto: doc.resultado.ok ? (itensPorId.get(doc.id) as ItemAvaliado).textoFinal : textoDoDocumentoParaPrompt(doc),
  }));

  const mensagem = montarMensagemParaHermes({
    ...dadosDoPrompt,
    // OS FATOS TAMBÉM PASSAM PELA JANELA. Antes iam crus daqui (`sessao.fatos`) enquanto a janela
    // os contava como item resumível: quando ela decidia cortá-los, o corte não chegava à
    // mensagem — mais um lugar onde o que se media e o que se mandava eram coisas diferentes.
    fatos: (itensPorId.get("fatos") as ItemAvaliado).textoFinal,
    documentos: documentosParaPrompt,
    contextoFoiResumido: avaliacao.acao === "resumido",
    avisoDeResumo: avaliacao.aviso,
  });

  // ÚLTIMA TRAVA, e é ela que garante a promessa: mede a MENSAGEM DE VERDADE, a mesma string que
  // a ponte vai contar. A conta de orçamento acima é boa, mas é uma previsão; esta é o fato. Se
  // ainda assim passou, quem recusa somos nós, com uma frase que diz o que fazer — nunca a ponte,
  // com `{"erro": "mensagem ausente ou longa demais"}` repassado cru para a tela do advogado
  // (foi exatamente isso que o dono viu).
  if (mensagem.length > LIMITE_PADRAO_CARACTERES) {
    const motivo =
      `O pedido ao agente ficou com ${comMilhar(mensagem.length)} caracteres, acima do limite de ` +
      `${comMilhar(LIMITE_PADRAO_CARACTERES)} que o agente aceita. ${avaliacao.aviso ?? ""} ` +
      "Selecione menos documentos, encurte os fatos ou divida a peça em sessões separadas.";
    await prisma.peticionamentoSessao.update({
      where: { id: sessaoId },
      data: { status: "FALHA_GERACAO", contextoBloqueadoMotivo: motivo },
    });
    return { error: motivo, contextoExcedido: true };
  }

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
      // NÃO é o `ESPERA_MS` padrão (105s, dimensionado para conversa de chat): este pedido leva o
      // texto dos documentos e pode demorar minutos. Ver a corrente de tempos inteira no
      // comentário de ESPERA_PETICIONAMENTO_MS.
      esperaMs: ESPERA_PETICIONAMENTO_MS,
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
    // REDE DE SEGURANÇA DA RECUSA FALADA: se, apesar de tudo, a ponte for quem recusar por
    // tamanho, o advogado NUNCA lê `{"erro": "mensagem ausente ou longa demais"}` — uma frase que
    // não diz o que ele deve fazer, e que foi o que ele leu no dia em que este defeito apareceu.
    if (/mensagem ausente ou longa demais|corpo ausente ou grande demais/i.test(motivo)) {
      const falado =
        `O agente recusou o pedido por tamanho (o pacote enviado tinha ${comMilhar(mensagem.length)} caracteres). ` +
        "Selecione menos documentos, encurte o texto dos fatos ou divida a peça em sessões separadas. " +
        "A triagem continua salva — nada do que você preencheu se perdeu.";
      await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { contextoBloqueadoMotivo: falado } });
      return { error: falado, contextoExcedido: true };
    }
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
