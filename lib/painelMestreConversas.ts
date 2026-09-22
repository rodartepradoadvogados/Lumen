import { prisma } from "@/lib/prisma";
import type { PlatformViewer } from "@/lib/platformMember";
import { FERRAMENTAS_QUE_EXIGEM_SESSAO_DE_SUPORTE } from "@/lib/painelMestreFerramentas";
import type { TurnoDoPainelMestre } from "@/lib/painelMestreOrcamento";

// ============================================================================
// MEMÓRIA E TRILHA DE AUDITORIA DO AGENTE DO PAINEL MESTRE (F7) — este arquivo é o ÚNICO lugar
// que lê ou grava PainelMestreConversa/PainelMestreTurno (prisma/schema.prisma). A rota
// (app/api/painel-mestre/agente/route.ts) e os dois endpoints de leitura
// (app/api/painel-mestre/agente/conversas/**) chamam só as funções daqui — nunca o Prisma
// direto — mesmo motivo do comentário de lib/painelMestreFerramentas.ts: uma trava numa função
// central, testável sem depender de onde é chamada, é uma trava; copiada em cada rota nova é
// mais uma chance de esquecer.
//
// LEI 1, A CLÁUSULA NOVA DESTA ENTREGA: "uma conversa gravada é de quem a criou." Toda LEITURA e
// toda ESCRITA fecham o filtro em `membroId` DENTRO da própria consulta — nunca um
// findUnique(conversaId) seguido de um `if` comparando o dono depois, que já teria lido a linha
// de outro membro antes de decidir que não devia. `buscarConversaDoMembro` é onde isto mais
// importa: sem o `membroId` no `where`, QUALQUER pessoa que soubesse (ou visse, em qualquer
// lugar que exiba um id) o conversaId de outro membro leria uma conversa que pode conter, em
// texto, dado que só o dono daquela conversa tinha teto para consultar.
//
// LEI 2 AQUI: `textoSeguroParaHistorico` decide o que SOBREVIVE no turno do assistente. Uma
// resposta que usou uma ferramenta marcada `exigeSessaoDeSuporte` (hoje, só
// consultar_atividade_do_escritorio) NUNCA grava o teor de verdade — grava um AVISO fixo. O
// motivo: a AccessSession que autorizou aquela resposta pode fechar a qualquer momento depois de
// respondida; se o texto de verdade sobrevivesse no histórico, reabrir a conversa DEPOIS que ela
// fechar seria, narrativamente, continuar enxergando através de um vidro-fosco que já foi
// embora — exatamente o que a Lei 2 proíbe. O NOME da ferramenta usada continua gravado em
// `ferramentasUsadas` (é metadado de auditoria sobre a MÁQUINA — o que foi consultado para
// responder — não o teor do escritório): é isso que deixa a trilha dizer "esta pergunta
// consultou o escritório X sob sessão de suporte" sem carregar, para sempre, o que a sessão
// mostrou. Ver o raciocínio completo no PR desta entrega.
// ============================================================================

export type PapelDoTurno = "user" | "assistant";

export type ConversaResumo = { id: string; titulo: string | null; createdAt: Date; updatedAt: Date };

export type TurnoGravado = {
  id: string;
  papel: PapelDoTurno;
  texto: string;
  ferramentasUsadas: string[];
  createdAt: Date;
};

export type ConversaComTurnos = ConversaResumo & { turnos: TurnoGravado[] };

const TAMANHO_MAXIMO_DO_TITULO = 80;

/** O texto fixo que substitui a resposta de verdade — ver o comentário da Lei 2 no topo do arquivo. */
export const AVISO_RESPOSTA_SOB_SESSAO_DE_SUPORTE =
  "[Resposta obtida com uma sessão de suporte aberta para um escritório. O teor não fica gravado no histórico — abra uma sessão de suporte para aquele escritório e pergunte de novo se precisar consultar isto outra vez.]";

/**
 * LEI 2 — a função PURA (sem banco) que decide o que sobrevive. Só o papel "assistant" pode ter
 * usado uma ferramenta; quem chama para "user" simplesmente passa `ferramentasUsadas: []` e o
 * resultado é sempre o texto original, sem checagem extra aqui.
 */
export function textoSeguroParaHistorico(texto: string, ferramentasUsadas: string[]): string {
  const usouFerramentaDeSessao = ferramentasUsadas.some((nome) => FERRAMENTAS_QUE_EXIGEM_SESSAO_DE_SUPORTE.includes(nome));
  return usouFerramentaDeSessao ? AVISO_RESPOSTA_SOB_SESSAO_DE_SUPORTE : texto;
}

/**
 * O texto que entra no lugar de uma resposta VAZIA. A rota pode terminar com `respostaFinal`
 * igual a "" (o modelo devolveu um bloco de texto vazio, ou estourou o teto de rodadas sem
 * texto). Gravar "" seria pior do que parece: o histórico do pedido seguinte manda os turnos
 * gravados de volta à API da Anthropic, que RECUSA um bloco de texto vazio — e, como o histórico
 * agora vem do banco (ver `historicoParaOPedido`), a conversa ficaria QUEBRADA PARA SEMPRE, não
 * só naquela aba. Um turno gravado nunca pode ser vazio.
 */
export const AVISO_RESPOSTA_SEM_TEXTO = "[O agente não devolveu texto nesta resposta.]";

/** Nunca devolve string vazia — ver AVISO_RESPOSTA_SEM_TEXTO. */
export function textoNuncaVazio(texto: string): string {
  return texto.trim() ? texto : AVISO_RESPOSTA_SEM_TEXTO;
}

/**
 * O HISTÓRICO QUE VAI AO MODELO, montado a partir dos turnos GRAVADOS — nunca da cópia que o
 * navegador tem na aba. É a diferença entre "a máquina lembra" e "a máquina acredita no que lhe
 * contam", e ela importa por três motivos:
 *
 *  1. LEI 2 de verdade, e não só no banco. `textoSeguroParaHistorico` troca o teor de uma
 *     resposta obtida sob sessão de suporte por um aviso fixo NA GRAVAÇÃO. Enquanto o contexto
 *     do pedido vinha do navegador, a aba que ainda tinha o teor de verdade na tela o devolvia
 *     ao modelo no pedido seguinte — inclusive depois da AccessSession ter FECHADO. O teor não
 *     era novidade para quem já o tinha na tela, mas o agente seguia raciocinando sobre o
 *     escritório sem sessão nenhuma aberta, que é exatamente o que a Lei 2 proíbe.
 *  2. A TRILHA DE AUDITORIA passa a ser fiel. O que o modelo viu é o que está gravado; antes,
 *     um registro de "quem perguntou o quê" podia mostrar pergunta e resposta que não se
 *     explicam, porque o contexto de verdade só existia na aba de quem perguntou.
 *  3. O histórico deixa de ser FORJÁVEL. O corpo da requisição não escolhe mais o que o modelo
 *     "disse antes" — o filtro de papéis que existia (só "user"/"assistant") barrava o papel,
 *     nunca o conteúdo.
 *
 * Custa ZERO consulta a mais: a rota já buscava a conversa inteira (com os turnos) só para
 * conferir o dono, e jogava os turnos fora.
 */
export function historicoParaOPedido(turnos: TurnoGravado[], tetoDeTurnos = 40): TurnoDoPainelMestre[] {
  return turnos
    .slice(-tetoDeTurnos)
    .map((t) => ({ role: t.papel, texto: textoNuncaVazio(t.texto) }));
}

// ---------------------------------------------------------------------------
// A PONTE PARA O DONO CRU DA PLATAFORMA — ver o comentário de `resolveViewer` em
// app/api/painel-mestre/agente/route.ts: o dono (User.isPlatformOwner) pode perguntar sem NUNCA
// ter uma linha de PlatformMember cadastrada (`viewer.id` é o User.id cru nesse caso), mas a FK
// de PainelMestreConversa aponta para PlatformMember, não para User. Mesma ponte que
// lib/supportAccess.ts:resolveCallingMember já usa para abrir sessão de suporte nas mesmas
// condições — copiada, não importada: resolveCallingMember não é exportada de lá, e criar um
// acoplamento entre "abrir sessão de suporte" e "gravar uma conversa do agente" só para reusar
// dez linhas custaria mais do que vale (mesmo raciocínio do comentário de
// lib/painelMestreFerramentas.ts sobre `str`/`bool` copiadas de lib/assistantTools.ts).
// ---------------------------------------------------------------------------

async function membroIdSomenteLeitura(viewer: PlatformViewer): Promise<string | null> {
  // Caminho comum: viewer.id JÁ é um PlatformMember.id de verdade — getPlatformMember() sempre
  // devolve o id da própria linha (lib/platformMember.ts).
  const porId = await prisma.platformMember.findUnique({ where: { id: viewer.id }, select: { id: true } });
  if (porId) return porId.id;

  // Caminho do dono cru: viewer.id é o User.id — procura a linha ligada a ele, se existir, sem
  // criar nada (isto roda em caminhos de LEITURA; nunca escreve por conta de uma pergunta GET).
  const porUsuario = await prisma.platformMember.findUnique({ where: { userId: viewer.id }, select: { id: true } });
  return porUsuario?.id ?? null;
}

async function membroIdParaGravar(viewer: PlatformViewer): Promise<string> {
  const existente = await membroIdSomenteLeitura(viewer);
  if (existente) return existente;

  // Nunca existiu uma linha de PlatformMember para este dono — cria agora com papel SOCIO,
  // mesmo comportamento de resolveCallingMember, para a primeira pergunta dele ao agente não
  // falhar por causa de um passo de setup que ainda não rodou.
  let socio = await prisma.platformRole.findUnique({ where: { key: "SOCIO" } });
  if (!socio) {
    socio = await prisma.platformRole.create({
      data: { key: "SOCIO", name: "Sócio", maxVisibility: "QUEBRA_VIDRO", canManageBilling: true, canManageMembers: true, canApproveAccess: true },
    });
  }
  const criado = await prisma.platformMember.create({ data: { userId: viewer.id, roleId: socio.id } });
  return criado.id;
}

// ---------------------------------------------------------------------------
// Escrita — a ÚNICA que esta entrega introduz no agente do Painel Mestre, e é sobre dado da
// PLATAFORMA (a própria conversa), nunca do escritório-cliente (Lei 3).
// ---------------------------------------------------------------------------

export async function criarConversaMestre(viewer: PlatformViewer): Promise<{ id: string }> {
  const membroId = await membroIdParaGravar(viewer);
  return prisma.painelMestreConversa.create({ data: { membroId }, select: { id: true } });
}

export async function registrarTurno(input: {
  conversaId: string;
  viewer: PlatformViewer;
  papel: PapelDoTurno;
  texto: string;
  ferramentasUsadas: string[];
}): Promise<void> {
  const membroId = await membroIdParaGravar(input.viewer);

  // LEI 1 NA ESCRITA: confirma que a conversa é DESTE membro antes de gravar qualquer turno —
  // sem isto, um conversaId forjado (de outro membro) gravaria uma pergunta na conversa alheia.
  const conversa = await prisma.painelMestreConversa.findFirst({
    where: { id: input.conversaId, membroId },
    select: { id: true, titulo: true },
  });
  if (!conversa) {
    throw new Error("Conversa não encontrada para este membro — nada foi gravado.");
  }

  const texto = textoNuncaVazio(
    input.papel === "assistant" ? textoSeguroParaHistorico(input.texto, input.ferramentasUsadas) : input.texto,
  );

  await prisma.$transaction([
    prisma.painelMestreTurno.create({
      data: {
        conversaId: input.conversaId,
        membroId,
        papel: input.papel,
        texto,
        ferramentasUsadas: input.ferramentasUsadas,
      },
    }),
    prisma.painelMestreConversa.update({
      where: { id: input.conversaId },
      data: {
        // O primeiro texto do MEMBRO (não do assistente) vira o título — só na primeira vez,
        // quando ainda não existe um.
        titulo: conversa.titulo ?? (input.papel === "user" ? input.texto.slice(0, TAMANHO_MAXIMO_DO_TITULO) : undefined),
      },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Leitura — as duas funções que carregam o corte por dono que esta entrega mais precisa provar.
// ---------------------------------------------------------------------------

export async function listarConversasDoMembro(viewer: PlatformViewer): Promise<ConversaResumo[]> {
  const membroId = await membroIdSomenteLeitura(viewer);
  if (!membroId) return [];

  return prisma.painelMestreConversa.findMany({
    where: { membroId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, titulo: true, createdAt: true, updatedAt: true },
  });
}

export async function buscarConversaDoMembro(conversaId: string, viewer: PlatformViewer): Promise<ConversaComTurnos | null> {
  const membroId = await membroIdSomenteLeitura(viewer);
  if (!membroId) return null;

  // LEI 1 — O CORTE MAIS IMPORTANTE DESTA ENTREGA: `membroId` mora DENTRO do `where`, na MESMA
  // consulta que busca a conversa. Um `where: { id: conversaId }` sozinho devolveria a conversa
  // de QUALQUER membro para QUALQUER outro que soubesse o id — e como o id só precisa ter sido
  // visto uma vez (por exemplo, na resposta JSON de uma requisição anterior), "adivinhar" nem é
  // necessário. Ver o teste que prova isto em lib/testes/painelMestreConversas.teste.ts.
  const conversa = await prisma.painelMestreConversa.findFirst({
    where: { id: conversaId, membroId },
    include: { turnos: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversa) return null;

  return {
    id: conversa.id,
    titulo: conversa.titulo,
    createdAt: conversa.createdAt,
    updatedAt: conversa.updatedAt,
    turnos: conversa.turnos.map((t) => ({
      id: t.id,
      papel: t.papel as PapelDoTurno,
      texto: t.texto,
      ferramentasUsadas: Array.isArray(t.ferramentasUsadas) ? (t.ferramentasUsadas as string[]) : [],
      createdAt: t.createdAt,
    })),
  };
}
