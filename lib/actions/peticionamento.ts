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
import { avaliarJanela, bytesDaMensagemNoCorpo, comMilhar, LIMITE_DE_BYTES_DA_MENSAGEM, LIMITE_PADRAO_CARACTERES, type ItemDeContexto as ItemDeJanela, type ItemAvaliado } from "@/lib/peticionamentoJanelaDeContexto";
import { extrairTextoDeDocumento } from "@/lib/peticionamentoExtracaoDocumento";
import { ehCategoriaConhecida } from "@/lib/peticionamentoCategoriaPeca";
import { deduzirNatureza, ehNaturezaConhecida, type SinalDeVinculoParaNatureza, type DeducaoDeNatureza } from "@/lib/peticionamentoNatureza";
import { passoParaRetomar, ehPassoValido, hrefDoPasso, ROTULO_DO_PASSO, sessaoTemTrabalhoEmAndamento } from "@/lib/peticionamentoPasso";
import { montarMensagemParaHermes, custoFixoDaMensagem, type DadosParaPrompt } from "@/lib/peticionamentoPrompt";
import { hashDeTexto, normalizarTextoCitacao } from "@/lib/peticionamentoCitacoes";
import { sincronizarCitacoes } from "@/lib/peticionamentoCitacoesSync";
import { avaliarFonteDeCitacao, avaliarAprovacaoDeMinuta, type AvaliacaoDeFonte } from "@/lib/peticionamentoAprovacao";
import { garantirFecho } from "@/lib/peticionamentoFecho";
import { sanitizarMinutaHtml, textoPuroDaMinutaHtml } from "@/lib/peticionamentoMinutaFormatada";
import { montarNotaObrigatoria } from "@/lib/peticionamentoNotaObrigatoria";
import { montarNomeArquivoPeticao } from "@/lib/peticionamentoNomeArquivo";
import { montarPeticaoWord } from "@/lib/peticionamentoDocx";
import { margensValidas } from "@/lib/peticionamentoPaginaA4";
import { timbradoDoEscritorio } from "@/lib/peticionamentoTimbradoDoEscritorio";
import {
  hermesConfigurado,
  perguntarAoHermesComPerfil,
  perfilDePeticionamento,
  ESPERA_PETICIONAMENTO_MS,
  FalhaDoHermes,
  iniciarGeracaoNoHermes,
  PonteSemCaminhoAssincrono,
} from "@/lib/hermesPonte";
import { emitirCredencial } from "@/lib/agenteCredencial";
import { urlDasFerramentasDoAgente } from "@/lib/agenteFerramentasEndereco";
import {
  colherGeracaoDaMinuta,
  gravarMinutaGerada,
  motivoFalado,
  type AndamentoDaGeracao,
} from "@/lib/peticionamentoGeracaoAssincrona";
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
/**
 * "ALGUÉM JÁ VIU O DESFECHO DESTA GERAÇÃO" — o que faz o alerta da Central sumir sozinho.
 *
 * Chamada pela página da minuta (app/peticionamento/[id]/minuta/page.tsx) nos dois ramos FINAIS:
 * a minuta pronta e a falha falada. NUNCA no ramo de GERANDO — marcar como visto enquanto o agente
 * ainda redige apagaria o alerta antes de ele nascer, e o advogado de aba fechada nunca saberia que
 * a peça ficou pronta. É a diferença entre "abri a tela" e "vi o resultado".
 *
 * `updateMany` COM `minutaVistaEm: null` NO `where`, e por dois motivos:
 *
 *   · idempotência sem custo: a partir da segunda abertura, zero linhas casam e nada é escrito. O
 *     alerta já foi embora na primeira, e regravar a data só mudaria quando ele "sumiu";
 *   · `updatedAt` é `@updatedAt`, e a LISTA DE RASCUNHOS ordena por ele e mostra "atualizado em"
 *     (ver `gravarPassoDaSessao`, logo abaixo, e o achado de revisão que está escrito lá). Uma
 *     escrita incondicional no carregamento da página faria ABRIR uma minuta pular o rascunho para
 *     o topo da lista, como se alguém a tivesse editado — a tela afirmando algo falso sobre quem
 *     mexeu em quê e quando.
 *
 * O `status` no `where` é a mesma trava do parágrafo de cima, agora no banco: mesmo se um dia
 * alguém chamar isto da tela errada, uma sessão em GERANDO não pode ser marcada como vista.
 */
export async function marcarDesfechoDaGeracaoComoVisto(sessaoId: string): Promise<{ ok: true }> {
  const user = await exigirAcessoAba();
  // A GUARDA, como toda ação que recebe um `sessaoId` vindo do cliente — e a régua é cobrada por
  // varredura derivada em lib/testes/peticionamentoIsolamento.teste.ts, que apanhou esta função
  // exatamente por não chamá-la. O `where` da escrita abaixo também carrega `officeId` (defesa em
  // profundidade), mas a guarda não é substituível por isso: é ela que dá a MESMA recusa falada de
  // todas as outras ações quando o id não é deste escritório, em vez de uma escrita que não
  // acontece em silêncio.
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  await prisma.peticionamentoSessao.updateMany({
    where: {
      id: sessaoId,
      officeId: user.officeId,
      minutaVistaEm: null,
      status: { in: ["GERADA", "EXPORTADA", "FALHA_GERACAO"] },
    },
    data: { minutaVistaEm: new Date() },
  });
  return { ok: true };
}

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

export type DocumentoVinculado = {
  id: string;
  name: string;
  docType: string;
  driveUrl: string;
  // Rótulo da demanda a que este documento pertence DENTRO da assessoria vinculada (ex.:
  // "Processo: Fulano x Beltrano", "Licitação: Pregão 12/2026", "Demanda: Parecer societário") —
  // null para documento de processo/atendimento vinculado direto à sessão (sem outro nível: é
  // exatamente o que já existia antes desta entrega, "como já consigo fazer em processos", nas
  // palavras do dono) e também null para o documento "geral" da assessoria, sem demanda nenhuma.
  demanda: string | null;
};

/**
 * Documentos de TODAS as demandas de uma assessoria vinculada — pedido do dono, 23/09/2026:
 * "quando chego em assessoria, não consigo entrar nas demandas que criei para uma consultoria e
 * olhar os documentos de cada demanda dentro de cada assessoria, como eu já consigo fazer em
 * processos". Uma "demanda" de assessoria, no modelo de dados, é uma das quatro coisas que já
 * penduram em Assessoria: um Processo (Case.assessoriaId), um Atendimento
 * (Attendance.assessoriaId), uma Licitação (Licitacao.assessoriaId) ou um Parecer
 * (Parecer.assessoriaId, o agrupador de AssessoriaDocumento — ver o comentário do model Parecer
 * em prisma/schema.prisma). Documento sem nenhuma dessas quatro amarras é documento GERAL da
 * assessoria (contrato, regimento interno...) e não tem demanda. NUNCA um nível a mais: a própria
 * aba Licitações (AssessoriaLicitacoesTab.tsx) já registra que "accordion dentro de accordion"
 * foi pedido explícito do dono para NÃO fazer — aqui repete a mesma régua, uma lista por demanda,
 * nunca demanda dentro de demanda.
 *
 * `officeId` já chega reconferido por quem chama (listarDocumentosDoVinculo, logo depois de
 * carregarSessaoOuFalhar) — mesmo assim toda consulta abaixo carrega officeId no PRÓPRIO `where`,
 * defesa em profundidade e exatamente o que lib/testes/peticionamentoIsolamento.teste.ts cobra de
 * qualquer consulta nova a tabela do escritório.
 */
async function documentosDasAssessorias(officeId: string, assessoriaIds: string[]): Promise<DocumentoVinculado[]> {
  const [cases, attendances, licitacoes, pareceres, documentosProprios] = await Promise.all([
    prisma.case.findMany({ where: { assessoriaId: { in: assessoriaIds }, officeId }, select: { id: true, title: true } }),
    prisma.attendance.findMany({ where: { assessoriaId: { in: assessoriaIds }, officeId }, select: { id: true, subject: true } }),
    prisma.licitacao.findMany({ where: { assessoriaId: { in: assessoriaIds }, officeId }, select: { id: true, nome: true, objeto: true } }),
    prisma.parecer.findMany({ where: { assessoriaId: { in: assessoriaIds }, officeId }, select: { id: true, name: true } }),
    prisma.assessoriaDocumento.findMany({
      where: { assessoriaId: { in: assessoriaIds }, officeId },
      select: { id: true, name: true, docType: true, driveUrl: true, caseId: true, parecerId: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const rotuloCase = new Map(cases.map((c) => [c.id, `Processo: ${c.title}`]));
  const rotuloAttendance = new Map(attendances.map((a) => [a.id, `Atendimento: ${a.subject}`]));
  const rotuloLicitacao = new Map(licitacoes.map((l) => [l.id, `Licitação: ${l.nome ?? l.objeto}`]));
  const rotuloParecer = new Map(pareceres.map((p) => [p.id, `Demanda: ${p.name}`]));

  const orAttachments: object[] = [];
  if (cases.length) orAttachments.push({ caseId: { in: cases.map((c) => c.id) } });
  if (attendances.length) orAttachments.push({ attendanceId: { in: attendances.map((a) => a.id) } });
  if (licitacoes.length) orAttachments.push({ licitacaoId: { in: licitacoes.map((l) => l.id) } });

  const attachments = orAttachments.length
    ? await prisma.attachment.findMany({
        where: { officeId, OR: orAttachments },
        select: { id: true, name: true, docType: true, driveUrl: true, caseId: true, attendanceId: true, licitacaoId: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const deDemandasVinculadas: DocumentoVinculado[] = attachments.map((a) => ({
    id: a.id,
    name: a.name,
    docType: a.docType,
    driveUrl: a.driveUrl,
    demanda:
      (a.caseId && rotuloCase.get(a.caseId)) ||
      (a.attendanceId && rotuloAttendance.get(a.attendanceId)) ||
      (a.licitacaoId && rotuloLicitacao.get(a.licitacaoId)) ||
      null,
  }));

  const deDocumentosProprios: DocumentoVinculado[] = documentosProprios.map((d) => ({
    id: d.id,
    name: d.name,
    docType: d.docType,
    driveUrl: d.driveUrl,
    demanda: (d.parecerId && rotuloParecer.get(d.parecerId)) || (d.caseId && rotuloCase.get(d.caseId)) || null,
  }));

  return [...deDemandasVinculadas, ...deDocumentosProprios];
}

export async function listarDocumentosDoVinculo(sessaoId: string): Promise<DocumentoVinculado[]> {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const vinculo = lerVinculo(sessao);
  if (ehSessaoAvulsa(vinculo)) return [];

  const orDireto: object[] = [];
  if (vinculo.caseIds.length) orDireto.push({ caseId: { in: vinculo.caseIds } });
  if (vinculo.attendanceIds.length) orDireto.push({ attendanceId: { in: vinculo.attendanceIds } });

  const [diretos, daAssessoria] = await Promise.all([
    // `OR: []` no Prisma não devolve "sem filtro" — devolve NADA. Era exatamente aqui que o
    // defeito original morava: com só assessoriaIds preenchido, orDireto ficava vazio e o
    // resultado era sempre lista vazia, mesmo a assessoria tendo demanda com documento.
    orDireto.length
      ? prisma.attachment.findMany({
          where: { officeId: user.officeId, OR: orDireto },
          select: { id: true, name: true, docType: true, driveUrl: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    vinculo.assessoriaIds.length ? documentosDasAssessorias(user.officeId, vinculo.assessoriaIds) : Promise.resolve([] as DocumentoVinculado[]),
  ]);

  return [...diretos.map((d) => ({ ...d, demanda: null as string | null })), ...daAssessoria];
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

// A conversão para Markdown foi RETIRADA da tela nesta entrega (decisão do dono, 23/09/2026):
// `marcarConversaoMarkdown` nunca convertia nada, só gravava um booleano — e a tela, depois do
// clique, afirmava "✓ Convertido em Markdown" sobre um trabalho que não tinha acontecido. O
// agente já lê o conteúdo real de cada documento por outro caminho (carregarDocumentosDaSessaoComTexto
// logo abaixo, que baixa do Drive e extrai o texto de verdade), então a conversão não servia a
// nada. Os campos markdownConvertido/markdownRecusado continuam em PeticionamentoAnexo (ver
// comentário no schema) só porque tirar coluna de produção pede migração pensada — nenhum código
// grava ou lê mais estes dois campos.

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
//
// ENDURECIMENTO 23/09/2026: o quadro "Citações desta minuta" chegou a mostrar três citações-molde
// (número mascarado ou de exemplo clássico) com "fonte secundária: não informada pelo agente" — e
// ainda assim ofereceu "Li e revisei esta citação" para as três. `montarListaDeCitacoes` passou a
// RECUSAR citação-molde na entrada (ela nunca chega a ser gravada aqui — vira `avisosDeMolde`), e
// a graduação de fonte (lib/peticionamentoAprovacao.ts) passou a BLOQUEAR a aprovação final,
// nunca só exibir a ausência.

export type CitacaoParaValidacao = {
  id: string;
  tipo: "EMENTA" | "TRECHO";
  texto: string;
  fonteUrl: string | null;
  fonteSecundariaUrl: string | null;
  confirmada: boolean;
  confirmadaPorNome: string | null;
  confirmadaEm: Date | null;
  /** Graduação da fonte pelo Passo 4 da skill pesquisa-jurisprudencia — nunca uma checagem própria do Lúmen. */
  fonte: AvaliacaoDeFonte;
};

export type CitacaoExcluidaParaTela = {
  id: string;
  tipo: "EMENTA" | "TRECHO";
  texto: string;
  excluidaPorNome: string | null;
  excluidaEm: Date | null;
  /** O texto ainda aparece no corpo ATUAL da minuta — excluir o registro nunca apaga o texto. */
  aindaNoCorpo: boolean;
};

export type AvisoDeMoldeParaTela = {
  origem: "EMENTA" | "TRECHO";
  textoOriginal: string;
  identificadorMolde: string;
};

export type ListaDeCitacoesParaTela = {
  citacoes: CitacaoParaValidacao[];
  excluidas: CitacaoExcluidaParaTela[];
  avisosDeMolde: AvisoDeMoldeParaTela[];
  aprovacao: {
    podeAprovar: boolean;
    motivos: string[];
    aprovadaEm: Date | null;
    aprovadaPorNome: string | null;
  };
};

/**
 * A lista de validação (decisão do dono, 22/09/2026): ementas citadas + trechos soltos, sempre
 * recalculada a partir do estado ATUAL da minuta antes de responder — nunca uma foto velha. Desde
 * 23/09/2026 devolve também as citações EXCLUÍDAS (transparência: o registro some, o texto pode
 * continuar na minuta), os avisos de MOLDE rejeitados na entrada, e a avaliação do gate de
 * aprovação final.
 */
export async function listarCitacoesParaValidacao(sessaoId: string): Promise<ListaDeCitacoesParaTela> {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const { avisosDeMolde } = await sincronizarCitacoes(sessaoId, user.officeId);
  const linhas = await prisma.peticionamentoCitacao.findMany({
    where: { sessaoId },
    include: { confirmadaPor: { select: { name: true } }, excluidaPor: { select: { name: true } } },
    orderBy: [{ tipo: "asc" }, { createdAt: "asc" }],
  });

  const ativas = linhas.filter((c) => !c.excluidaEm);
  const excluidas = linhas.filter((c) => c.excluidaEm);
  const minutaNormalizada = sessao.minutaTexto ? normalizarTextoCitacao(sessao.minutaTexto) : "";

  const citacoes: CitacaoParaValidacao[] = ativas.map((c) => ({
    id: c.id,
    tipo: c.tipo as "EMENTA" | "TRECHO",
    texto: c.texto,
    fonteUrl: c.fonteUrl,
    fonteSecundariaUrl: c.fonteSecundariaUrl,
    confirmada: !!c.confirmadaPorId,
    confirmadaPorNome: c.confirmadaPor?.name ?? null,
    confirmadaEm: c.confirmadaEm,
    fonte: avaliarFonteDeCitacao(c.fonteUrl, c.fonteSecundariaUrl),
  }));

  const excluidasParaTela: CitacaoExcluidaParaTela[] = excluidas.map((c) => ({
    id: c.id,
    tipo: c.tipo as "EMENTA" | "TRECHO",
    texto: c.texto,
    excluidaPorNome: c.excluidaPor?.name ?? null,
    excluidaEm: c.excluidaEm,
    aindaNoCorpo: minutaNormalizada.length > 0 && minutaNormalizada.includes(normalizarTextoCitacao(c.texto)),
  }));

  const avaliacaoAprovacao = avaliarAprovacaoDeMinuta({
    citacoes: citacoes.map((c) => ({ confirmada: c.confirmada, fonteUrl: c.fonteUrl, fonteSecundariaUrl: c.fonteSecundariaUrl })),
    haAvisoDeMolde: avisosDeMolde.length > 0,
  });

  let aprovadaPorNome: string | null = null;
  if (sessao.minutaAprovadaPorId) {
    const aprovador = await prisma.user.findFirst({ where: { id: sessao.minutaAprovadaPorId }, select: { name: true } });
    aprovadaPorNome = aprovador?.name ?? null;
  }

  return {
    citacoes,
    excluidas: excluidasParaTela,
    avisosDeMolde: avisosDeMolde.map((a) => ({ origem: a.origem, textoOriginal: a.textoOriginal, identificadorMolde: a.identificadorMolde })),
    aprovacao: {
      podeAprovar: avaliacaoAprovacao.podeAprovar,
      motivos: avaliacaoAprovacao.motivos,
      aprovadaEm: sessao.minutaAprovadaEm,
      aprovadaPorNome,
    },
  };
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
  if (citacao.excluidaEm) return { error: "Esta citação foi excluída — não é possível confirmar uma citação excluída." };
  await prisma.peticionamentoCitacao.update({
    where: { id: citacaoId },
    data: { confirmadaPorId: user.id, confirmadaEm: new Date(), hashDoTexto: hashDeTexto(citacao.texto) },
  });
  revalidatePath(`/peticionamento/${sessaoId}/minuta`);
  return { ok: true };
}

/**
 * O botão "Excluir" do quadro "Citações desta minuta" (pedido do dono, 23/09/2026). Excluir o
 * REGISTRO de citação nunca apaga o texto da minuta — são coisas diferentes de propósito (o
 * registro é a trava de "li e revisei", o texto é a peça em si). SOFT-DELETE (ver o comentário do
 * campo `excluidaEm` no schema): sincronizarCitacoes NÃO ressuscita uma linha excluída enquanto o
 * texto/links dela não mudarem.
 */
export async function excluirCitacao(sessaoId: string, citacaoId: string): Promise<{ ok: true; aindaNoCorpo: boolean } | { error: string }> {
  const user = await exigirAcessoAba();
  const sessao = await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const citacao = await prisma.peticionamentoCitacao.findFirst({ where: { id: citacaoId, sessaoId } });
  if (!citacao) return { error: "Citação não encontrada nesta sessão." };
  if (citacao.excluidaEm) return { error: "Esta citação já foi excluída." };
  await prisma.peticionamentoCitacao.update({
    where: { id: citacaoId },
    data: { excluidaPorId: user.id, excluidaEm: new Date() },
  });
  // A aprovação final (se houver) valia para o conjunto de citações de ANTES desta exclusão —
  // excluir uma citação muda esse conjunto, então a aprovação precisa ser refeita, pelo mesmo
  // motivo que editar o corpo já desfaz a confirmação de cada citação cujo texto mudou.
  await prisma.peticionamentoSessao.updateMany({
    where: { id: sessaoId, officeId: user.officeId },
    data: { minutaAprovadaEm: null, minutaAprovadaPorId: null },
  });
  const aindaNoCorpo = Boolean(sessao.minutaTexto) && normalizarTextoCitacao(sessao.minutaTexto ?? "").includes(normalizarTextoCitacao(citacao.texto));
  revalidatePath(`/peticionamento/${sessaoId}/minuta`);
  return { ok: true, aindaNoCorpo };
}

/**
 * O passo final, separado do "li e revisei" de cada citação (pedido do dono, 23/09/2026):
 * "Aprovar minuta / gerar peça". Só libera quando TODAS as citações ativas estão confirmadas e
 * NENHUMA é bloqueante (molde, ou sem fonte oficial — lib/peticionamentoAprovacao.ts). Esta ação
 * NÃO exporta nem imprime nada — grava só o estado da aprovação; quem consome esse estado (a
 * exportação de verdade) vem em outra etapa.
 */
export async function aprovarMinutaGerarPeca(sessaoId: string): Promise<{ ok: true } | { error: string }> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const { avisosDeMolde } = await sincronizarCitacoes(sessaoId, user.officeId);
  const linhas = await prisma.peticionamentoCitacao.findMany({ where: { sessaoId, excluidaEm: null } });
  const avaliacao = avaliarAprovacaoDeMinuta({
    citacoes: linhas.map((c) => ({ confirmada: !!c.confirmadaPorId, fonteUrl: c.fonteUrl, fonteSecundariaUrl: c.fonteSecundariaUrl })),
    haAvisoDeMolde: avisosDeMolde.length > 0,
  });
  if (!avaliacao.podeAprovar) {
    return { error: `Ainda não é possível aprovar: ${avaliacao.motivos.join(" ")}` };
  }
  await prisma.peticionamentoSessao.update({
    where: { id: sessaoId },
    data: { minutaAprovadaEm: new Date(), minutaAprovadaPorId: user.id },
  });
  revalidatePath(`/peticionamento/${sessaoId}/minuta`);
  return { ok: true };
}

/** Quantas citações ativas ainda faltam confirmar — o botão de exportar usa isto para dizer "faltam N". */
export async function contarCitacoesPendentes(sessaoId: string): Promise<number> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  await sincronizarCitacoes(sessaoId, user.officeId);
  // excluidaEm: null — uma citação excluída não pede mais confirmação nenhuma (ver excluirCitacao).
  return prisma.peticionamentoCitacao.count({ where: { sessaoId, confirmadaPorId: null, excluidaEm: null } });
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

  // A SEGUNDA TRAVA, E ELA É EM BYTES — porque o segundo teto da ponte é em bytes.
  //
  // A de cima mede CARACTERES contra `PERGUNTA_MAXIMA` (um teto de caracteres). Esta mede os
  // BYTES que a mensagem ocupa dentro do corpo JSON contra `CORPO_MAXIMO` (um teto de bytes,
  // aplicado sobre o `content-length`). São dois limites diferentes, em duas unidades
  // diferentes, e aplicar um só deixaria o outro chegar cru à tela: o 413 da ponte diz
  // literalmente "corpo ausente ou grande demais", que não é instrução para ninguém.
  //
  // Em português normal esta trava nunca dispara — 190.000 caracteres precisariam de 2,7 bytes
  // cada para alcançá-la. Ela existe para o texto que NÃO é português normal: a extração de um
  // PDF que veio cheio de símbolo, ideograma ou emoji, onde um caractere custa 3 ou 4 bytes. É
  // barata e fecha o buraco por completo, em vez de fechá-lo "para o caso comum".
  const bytesNoCorpo = bytesDaMensagemNoCorpo(mensagem);
  if (bytesNoCorpo > LIMITE_DE_BYTES_DA_MENSAGEM) {
    const motivo =
      `O pedido ao agente ficou com ${comMilhar(bytesNoCorpo)} bytes (são ${comMilhar(mensagem.length)} caracteres, ` +
      `e em texto com acento cada caractere pesa mais de um byte), acima do limite de ` +
      `${comMilhar(LIMITE_DE_BYTES_DA_MENSAGEM)} bytes que o agente aceita receber de uma vez. ` +
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

  // ── A TRADUÇÃO DA FALHA DE ENVIO, UM LUGAR SÓ PARA OS DOIS CAMINHOS ───────────────────────
  //
  // Fica aqui dentro, como fechamento, porque usa o tamanho MEDIDO deste pedido (caracteres e
  // bytes) para a frase dizer ao advogado o número real — e porque os DOIS caminhos abaixo (o
  // disparo assíncrono e o síncrono de compatibilidade) podem falhar pelos MESMOS motivos. Duas
  // cópias desta tradução divergiriam, e a que divergisse deixaria o texto cru da ponte chegar à
  // tela — que é exatamente o defeito que ela existe para não repetir.
  const traduzirFalhaDeEnvio = async (e: unknown): Promise<{ error: string; contextoExcedido?: boolean }> => {
    // A TAREFA MORRE COM A FALHA — é o contrato escrito no schema: os três campos do
    // acompanhamento só existem enquanto a sessão está em GERANDO. Deixá-los gravados numa
    // sessão que já desistiu convidaria uma colheita futura a perguntar por uma tarefa que
    // ninguém mais vai buscar.
    await prisma.peticionamentoSessao.update({
      where: { id: sessaoId },
      data: { status: "FALHA_GERACAO", hermesTarefaId: null, geracaoIniciadaEm: null, geracaoDocumentosLidos: [] },
    });
    const motivo = e instanceof FalhaDoHermes ? e.motivo : mensagemDeErro(e);
    // REDE DE SEGURANÇA DA RECUSA FALADA: se, apesar de tudo, quem recusar for a ponte, o
    // advogado NUNCA lê o texto cru do erro dela — frases que não dizem o que ele deve fazer, e
    // que foram exatamente o que ele leu nos dois dias em que este defeito apareceu.
    //
    // AS QUATRO FRASES, e por que cada uma está aqui:
    //
    //   · "mensagem ausente ou longa demais" — o 400 de tamanho da ponte (o primeiro dia);
    //   · "corpo ausente ou grande demais"   — o 413 de corpo, em bytes;
    //   · "falha ao executar o Hermes"       — o 500 genérico da ponte. Foi ELE que chegou cru à
    //     tela no segundo dia: a pergunta ia como argumento de linha de comando, estourava
    //     MAX_ARG_STRLEN e morria com `[Errno 7]` antes de o Hermes existir. A causa daquele dia
    //     está consertada na raiz (a pergunta viaja por `--query-file -`, fora do argv), mas a
    //     tradução FICA: "falha ao executar o Hermes" é o balde onde a ponte joga toda exceção
    //     inesperada, e um 500 opaco não pode ser o que o advogado lê, seja qual for a causa;
    //   · "Argument list too long" / "E2BIG"  — o texto do próprio sistema operacional, caso ele
    //     chegue aqui por algum caminho que não passe pelo balde acima.
    //
    // A FRASE FALADA NÃO AFIRMA QUE A CAUSA É TAMANHO. Tamanho é a causa mais comum e é o que o
    // advogado pode resolver sozinho, então é o que vem primeiro; mas quando o pedido é pequeno,
    // insistir em "reduza o tamanho" mandaria ele para um beco. Por isso a última linha nomeia a
    // outra saída — avisar o suporte — em vez de fingir certeza que não existe.
    if (/mensagem ausente ou longa demais|corpo ausente ou grande demais|falha ao executar o Hermes|Argument list too long|E2BIG/i.test(motivo)) {
      const falado =
        `O agente não conseguiu receber este pedido (o pacote enviado tinha ${comMilhar(mensagem.length)} caracteres, ` +
        `${comMilhar(bytesNoCorpo)} bytes). A causa mais comum é tamanho: selecione menos documentos, encurte o texto ` +
        "dos fatos ou divida a peça em sessões separadas. Se o pedido já for pequeno, isto é falha do servidor do " +
        "agente e não do que você preencheu — avise o suporte. A triagem continua salva: nada do que você preencheu se perdeu.";
      await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { contextoBloqueadoMotivo: falado } });
      return { error: falado, contextoExcedido: true };
    }
    // As demais falhas da ponte (demora, perfil ausente, binário velho, ponte cheia) já têm
    // frase falada pronta — a MESMA que a colheita usa, para o advogado não ler duas explicações
    // diferentes para o mesmo problema dependendo do caminho que a geração tomou.
    const falado = motivoFalado(motivo);
    await prisma.peticionamentoSessao.update({ where: { id: sessaoId }, data: { contextoBloqueadoMotivo: falado } });
    return { error: falado };
  };

  // ── O DISPARO: A ESPERA SAI DE DENTRO DA REQUISIÇÃO WEB ───────────────────────────────────
  //
  // Daqui para baixo esta função NÃO espera mais o agente redigir. Ela entrega o pedido à ponte,
  // guarda o identificador da tarefa na sessão e volta na hora; quem acompanha é a tela (e, se o
  // advogado fechar a aba, o cron — ver lib/peticionamentoGeracaoAssincrona.ts).
  //
  // O MOTIVO, em uma frase: o teto duro da Vercel é de 300 segundos, e uma peça a partir de um
  // processo de dezenas de páginas pode legitimamente precisar de mais. Em produção o Hermes foi
  // MORTO aos 240s com o agente ainda escrevendo, e o advogado leu "DEMORA: o Hermes não
  // respondeu em 230s" — o trabalho inteiro perdido por causa do relógio de uma requisição HTTP.
  //
  // OS TRÊS CAMPOS ANDAM JUNTOS com o GERANDO (ver o contrato no schema): sem `hermesTarefaId`
  // ninguém consegue colher; sem `geracaoIniciadaEm` o cron não varre; sem
  // `geracaoDocumentosLidos` a colheita — que pode acontecer noutra requisição, sem nada em
  // memória — não teria contra o que filtrar a declaração do agente, e um nome alucinado entraria
  // na lista de "documentos consultados" da nota obrigatória.
  // ── A CREDENCIAL DE FERRAMENTAS DESTA GERAÇÃO ─────────────────────────────────────────────
  //
  // ESCOPO "peticionamento", não "conversa": esta credencial precisa sobreviver à minuta inteira
  // (até TETO_DA_PONTE_S + folga — ver lib/hermesPonte.ts e lib/agenteCredencial.ts), não aos
  // cinco minutos de uma pergunta de chat. É a MESMA credencial que vai tanto no disparo
  // assíncrono quanto no caminho síncrono de compatibilidade logo abaixo — emitida uma vez aqui,
  // porque os dois `try` disputam a MESMA geração, nunca duas.
  //
  // `financeiro` e `admin` VÃO FALSOS, SEMPRE — nunca os valores reais do advogado que está
  // gerando a peça. Duas razões, e as duas importam:
  //
  //   1. DINHEIRO NÃO É INSUMO DE PEÇA. Uma minuta não presta contas nem cobra; não há motivo
  //      jurídico para o agente que redige uma petição consultar o caixa do escritório.
  //   2. DEFESA EM DUAS CAMADAS. Se um dia alguém, por engano, acrescentar uma ferramenta
  //      financeira à lista branca do peticionamento (FERRAMENTAS_DO_PETICIONAMENTO, em
  //      app/api/agente/ferramentas/route.ts), esta credencial AINDA ASSIM não abriria nada —
  //      porque ela nunca carrega `financeiro`/`admin` verdadeiros para começo de conversa. A
  //      parede por escopo é a primeira camada; esta é a segunda, e nenhuma substitui a outra.
  const credencialDeFerramentas = await emitirCredencial({
    officeId: user.officeId,
    userId: user.id,
    financeiro: false,
    admin: false,
    escopo: "peticionamento",
  });
  const ferramentas = { url: urlDasFerramentasDoAgente(), credencial: credencialDeFerramentas };

  try {
    const { tarefa } = await iniciarGeracaoNoHermes({
      perfil: perfilDePeticionamento(),
      mensagem,
      sessao: sessao.hermesSessionId,
      ferramentas,
    });
    await prisma.peticionamentoSessao.update({
      where: { id: sessaoId },
      data: {
        status: "GERANDO",
        hermesTarefaId: tarefa,
        geracaoIniciadaEm: new Date(),
        geracaoDocumentosLidos: nomesLidos,
        documentosNaoLidos,
        // Uma tentativa nova apaga o motivo falado da tentativa anterior — senão a tela mostraria
        // a falha de ontem enquanto a geração de hoje ainda corre.
        contextoBloqueadoMotivo: null,
      },
    });
    revalidatePath(`/peticionamento/minuta`);
    return { ok: true };
  } catch (e) {
    // COMPATIBILIDADE, E ELA IMPORTA DE VERDADE: o deploy do Lúmen (automático, na Vercel) e a
    // cópia do `servidor.py` novo para a VPS (manual, pelo dono) NÃO acontecem no mesmo instante.
    // Uma ponte ainda sem `/chat-async` responde 404, e nesse caso o certo é fazer o que sempre
    // se fez — esperar dentro da requisição — e não quebrar na cara do advogado. Mesmo espírito
    // do 501 de binário velho que já existe em `executar_hermes`.
    //
    // A DECISÃO É PELO TIPO DO ERRO, nunca lendo a frase dele.
    if (!(e instanceof PonteSemCaminhoAssincrono)) return traduzirFalhaDeEnvio(e);
  }

  // ── O CAMINHO SÍNCRONO DE COMPATIBILIDADE (ponte antiga) ──────────────────────────────────
  //
  // É o caminho de antes desta entrega, inteiro: espera o agente dentro da requisição, com o
  // mesmo `ESPERA_PETICIONAMENTO_MS` e a mesma corrente de tempos. Continua sujeito ao teto de
  // 300s da Vercel — é justamente por isso que ele é o caminho de EXCEÇÃO, e não o normal.
  //
  // `geracaoIniciadaEm` é gravado aqui também, sem tarefa nenhuma: é o relógio que impede uma
  // sessão de ficar "gerando" para sempre se esta função morrer no meio (a Vercel cortando a
  // função é exatamente o caso). Sem ele, o cron não teria como saber desde quando.
  // O MESMO instante vai para o banco e para a medição, guardado numa variável: dois `new Date()`
  // dariam dois números diferentes para a mesma geração, e o que a tela mostraria depois como
  // "tempo medido" seria a diferença entre eles somada ao trabalho.
  const iniciadaEm = new Date();
  await prisma.peticionamentoSessao.update({
    where: { id: sessaoId },
    data: {
      status: "GERANDO",
      hermesTarefaId: null,
      geracaoIniciadaEm: iniciadaEm,
      geracaoDocumentosLidos: nomesLidos,
      documentosNaoLidos,
      contextoBloqueadoMotivo: null,
    },
  });
  try {
    const resposta = await perguntarAoHermesComPerfil({
      perfil: perfilDePeticionamento(),
      mensagem,
      sessao: sessao.hermesSessionId,
      // NÃO é o `ESPERA_MS` padrão (105s, dimensionado para conversa de chat): este pedido leva o
      // texto dos documentos e pode demorar minutos. Ver a corrente de tempos inteira no
      // comentário de ESPERA_PETICIONAMENTO_MS.
      esperaMs: ESPERA_PETICIONAMENTO_MS,
      // A MESMA credencial do disparo assíncrono, acima — este é o caminho de COMPATIBILIDADE
      // (ponte antiga sem /chat-async), não uma segunda geração: a ferramenta que o agente chama
      // aqui dentro é a mesma, com o mesmo alcance.
      ferramentas,
    });
    // A MESMA GRAVAÇÃO DOS OUTROS DOIS CAMINHOS, e é de propósito que seja a mesma função: é ali
    // que moram o fecho garantido por código, a nota obrigatória e a sincronização de citações.
    await gravarMinutaGerada({
      sessaoId,
      officeId: user.officeId,
      respostaBruta: resposta.resposta,
      sessaoDoHermes: resposta.sessao,
      nomesLidos,
      contextoResumido: avaliacao.acao === "resumido",
      tipoPecaJaEscolhido: sessao.tipoPeca,
      hermesSessionIdAnterior: sessao.hermesSessionId,
      // O caminho síncrono MEDE do mesmo jeito: é a mesma geração, com o mesmo relógio, só
      // esperada dentro da requisição. Deixá-lo de fora faria a faixa do escritório descrever
      // apenas metade das gerações — e ninguém saberia qual metade.
      geracaoIniciadaEm: iniciadaEm,
    });
    revalidatePath(`/peticionamento/minuta`);
    return { ok: true };
  } catch (e) {
    return traduzirFalhaDeEnvio(e);
  }
}

/**
 * EM QUE PÉ ESTÁ A GERAÇÃO — a ação que a tela de "gerando" chama de tempos em tempos.
 *
 * Confere acesso à aba e ESCRITÓRIO antes de qualquer coisa (o id vem do cliente), e só então
 * delega a colheita ao módulo que a tela e o cron compartilham. É a colheita que decide tudo:
 * perguntar à ponte, gravar a minuta com a reivindicação atômica, ou declarar a geração perdida.
 *
 * NÃO DEVOLVE PORCENTAGEM, e nunca vai devolver: o sistema não sabe quanto falta. Ela devolve
 * `desdeMs`, que é um fato medido — há quanto tempo a geração começou. Inventar um número de
 * progresso seria a única coisa pior do que uma tela parada.
 */
export async function acompanharGeracaoDaMinuta(sessaoId: string): Promise<AndamentoDaGeracao> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const andamento = await colherGeracaoDaMinuta(sessaoId);
  // Quando a colheita gravou a minuta, a tela de minuta precisa ser revalidada — senão o
  // advogado é mandado para uma página que o cache ainda acha que está "gerando".
  if (andamento.estado === "pronta") revalidatePath(`/peticionamento/${sessaoId}/minuta`);
  return andamento;
}

/**
 * A GRAVAÇÃO DO CORPO DA MINUTA — recebe SÓ o HTML da folha, e deriva o texto puro dele.
 *
 * A assinatura é de propósito: se esta ação recebesse o HTML E o texto puro, bastaria um bug de
 * tela para gravar um corpo que não é o que está na folha, e o advogado exportaria um Word que
 * não corresponde ao que ele revisou. Derivar aqui, por
 * lib/peticionamentoMinutaFormatada.ts:textoPuroDaMinutaHtml (uma função só, no sistema todo), é
 * o que impede as duas representações de divergirem — ver o contrato no schema, em
 * `minutaFormatadaHtml`.
 *
 * A sanitização também acontece AQUI, no servidor, antes de qualquer gravação: o HTML chega do
 * navegador e nunca é confiado (mesma disciplina de lib/richText.ts).
 */
export async function atualizarCorpoDaMinuta(sessaoId: string, formatadaHtml: string): Promise<{ ok: true }> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const htmlLimpo = sanitizarMinutaHtml(formatadaHtml);
  const textoDerivado = textoPuroDaMinutaHtml(htmlLimpo);
  // O fecho é reconferido em toda gravação — mesmo edição manual não sai sem ele; ver export,
  // que reconfere de novo por segurança (defesa em profundidade, nunca confiar numa trava só).
  await prisma.peticionamentoSessao.update({
    where: { id: sessaoId },
    data: {
      minutaTexto: garantirFecho(textoDerivado),
      minutaFormatadaHtml: htmlLimpo,
      // A aprovação final (decisão do dono, 23/09/2026) é sobre UM estado do corpo — editar depois
      // de aprovar desfaz a aprovação, pelo mesmo motivo que editar já desfaz a confirmação de
      // cada citação cujo texto mudou: ninguém aprovou um texto que ainda não existia.
      minutaAprovadaEm: null,
      minutaAprovadaPorId: null,
    },
  });
  // Decisão do dono (22/09/2026): editar a minuta invalida a confirmação das citações que
  // mudaram — recalculado AQUI, no momento da edição, para a lista nunca ficar atrasada em
  // relação ao texto que o advogado acabou de salvar.
  await sincronizarCitacoes(sessaoId, user.officeId);
  return { ok: true };
}

/**
 * ETAPA B — grava as MARGENS DA FOLHA que o advogado ajustou na régua, para que elas sobrevivam à
 * recarga e cheguem ao Word (ver a conciliação em lib/peticionamentoPaginaA4.ts:margensDaFolha).
 *
 * NÃO TOCA O CORPO: nem `minutaTexto`, nem `minutaFormatadaHtml`, nem as citações. Por isso também
 * não desfaz a aprovação — ela é sobre o texto que o advogado leu, e margem não muda uma palavra.
 *
 * As margens chegam do navegador e são revalidadas aqui (margensValidas) — fora da folha, ou sem
 * formato de margem, a gravação é recusada em vez de guardar lixo que a tela depois desenharia.
 */
export async function salvarMargensDaMinuta(sessaoId: string, margens: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await exigirAcessoAba();
  await carregarSessaoOuFalhar(sessaoId, user.officeId);
  const validas = margensValidas(margens);
  if (!validas) return { error: "Margens inválidas." };
  await prisma.peticionamentoSessao.updateMany({
    where: { id: sessaoId, officeId: user.officeId },
    data: { minutaMargensMm: validas },
  });
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
  // excluidaEm: null — uma citação excluída pelo advogado não pede mais confirmação (ver excluirCitacao).
  const citacoesPendentes = await prisma.peticionamentoCitacao.count({ where: { sessaoId, confirmadaPorId: null, excluidaEm: null } });
  if (citacoesPendentes > 0) {
    return {
      error: `Ainda falta${citacoesPendentes === 1 ? "" : "m"} confirmar ${citacoesPendentes} cita${citacoesPendentes === 1 ? "ção" : "ções"} antes de exportar — cada uma precisa da marca "li e revisei" individual, na tela da minuta.`,
    };
  }

  if (!sessao.minutaTexto) return { error: "Esta sessão ainda não tem minuta gerada." };

  // O MESMO download que a prévia da minuta usa (lib/peticionamentoTimbradoDoEscritorio.ts): a
  // prévia não pode mostrar um timbrado que o Word não aplica.
  const timbrado = (await timbradoDoEscritorio(user.officeId)).docx;
  let avisoTimbrado: string | null = null;
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
      // O TEXTO PURO, com o fecho RECONFERIDO aqui — `atualizarCorpoDaMinuta` já garantiu o fecho
      // ao gravar, e a exportação confere de novo (defesa em profundidade, nunca uma trava só).
      corpoMinuta: garantirFecho(sessao.minutaTexto),
      // A FORMATAÇÃO DA FOLHA, quando existe: é ela que monta o corpo do Word, para o arquivo sair
      // com o negrito, a cor, o alinhamento, o recuo, a lista e a tabela que o advogado revisou na
      // tela. Nula em sessão anterior ao editor — e aí o corpo sai do texto puro, como sempre saiu.
      corpoMinutaFormatadaHtml: sessao.minutaFormatadaHtml,
      tituloPeca: `${sessao.tipoPeca ?? "Petição"}${sessao.clienteNome ? ` — ${sessao.clienteNome}` : ""}`,
    },
    { confirmadoPorNome: user.name, confirmadoPorOab: user.oab ?? "", confirmadoEm: agora, sessaoId: sessao.id },
    timbrado,
    // A margem que o advogado salvou na régua (null = nunca mexeu: vale a do timbrado, ou a padrão
    // — a mesma regra que a régua e a prévia usam, lib/peticionamentoPaginaA4.ts:margensDaFolha).
    margensValidas(sessao.minutaMargensMm),
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
