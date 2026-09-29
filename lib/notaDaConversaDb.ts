import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashDoTexto } from "@/lib/hashDoTexto";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { chaveDoAvisoDaAna, fraseDoAvisoDaAna, prepararNota, type LinhaDeNota } from "@/lib/notaDaConversa";
import type { MensagemDoChat } from "@/lib/mensagensDoChat";
import type { CodigoDeEnvio } from "@/lib/envioDeMensagem";

// ============================================================================
// O LADO DE BANCO DA NOTA INTERNA E DO AVISO DE SISTEMA.
//
// ATENÇÃO: NÃO confere o dono da conversa — quem chama já passou por `atendimentoDaRota` (401/403/404) e
// entrega o atendimento JÁ AUTORIZADO; o `officeId` do viewer entra em toda consulta como segundo cinto.
//
// ESTE ARQUIVO NÃO IMPORTA lib/whatsapp.ts, lib/registrarMensagem.ts, o agente (Hermes) nem nada que fale
// com provedor: o teste lib/testes/atendimentoAppNota.teste.ts varre isso. Uma nota não tem caminho até o
// WhatsApp porque o código que a grava não tem como chamá-lo.
//
// A NOTA NÃO ASSUME A CONVERSA: não chama `silenciarAtendente`, não grava `waLastMessageAt`,
// `firstResponseAt` nem `ultimaAtividadeEm` (nada em `Attendance`). O relógio de 15 min e a ordem da lista
// continuam contando só mensagens de WhatsApp.
// ============================================================================

type LinhaGravada = LinhaDeNota & { officeId: string; attendanceId: string; textoHash: string };

/** A costura de banco (o teste passa um repositório em memória; produção usa o Prisma). */
export type RepositorioDeNotas = {
  achar(officeId: string, clientMessageId: string): Promise<LinhaGravada | null>;
  /** `null` = a chave já existia (corrida entre dois pedidos). */
  criar(dados: { officeId: string; attendanceId: string; tipo: "NOTA" | "SISTEMA"; userId: string | null; autorNome: string | null; texto: string; clientMessageId: string; textoHash: string }): Promise<LinhaGravada | null>;
};

export const repositorioPrisma: RepositorioDeNotas = {
  achar: (officeId, clientMessageId) => prisma.notaDaConversa.findUnique({ where: { officeId_clientMessageId: { officeId, clientMessageId } } }),
  async criar(dados) {
    try {
      return await prisma.notaDaConversa.create({ data: dados });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") return null;
      throw erro;
    }
  },
};

export type RespostaDaNota =
  | { status: 200; corpo: { ok: true; jaTinhaSaido: boolean; mensagem: MensagemDoChat } }
  | { status: number; corpo: { ok: false; codigo: CodigoDeEnvio; erro: string } };

const recusa = (status: number, codigo: CodigoDeEnvio, erro: string): RespostaDaNota => ({ status, corpo: { ok: false, codigo, erro } });

type Autorizado = { officeId: string; userId: string; autorNome: string; attendance: { id: string } };

/**
 * Salva UMA nota, uma vez por chave. A chave já existe -> devolve a MESMA nota (nunca uma segunda); existe
 * com outro texto, em outra conversa ou como aviso de sistema -> 409 (erro do aparelho, não "reenvio").
 */
export async function salvarNotaDoApp(
  a: Autorizado,
  pedido: { clientMessageId: string; texto: string },
  opcoes: { agora?: Date; repo?: RepositorioDeNotas } = {},
): Promise<RespostaDaNota> {
  const agora = opcoes.agora ?? new Date();
  const repo = opcoes.repo ?? repositorioPrisma;
  const textoHash = hashDoTexto(pedido.texto);

  const conferir = (existente: LinhaGravada): RespostaDaNota => {
    if (existente.officeId !== a.officeId || existente.attendanceId !== a.attendance.id || existente.tipo !== "NOTA") {
      return recusa(409, "CHAVE_REUTILIZADA", "Identificador de nota já usado em outra conversa.");
    }
    if (existente.textoHash !== textoHash) return recusa(409, "CHAVE_REUTILIZADA", "Este identificador já foi usado com outro texto.");
    return { status: 200, corpo: { ok: true, jaTinhaSaido: true, mensagem: prepararNota(existente, agora) } };
  };

  const existente = await repo.achar(a.officeId, pedido.clientMessageId);
  if (existente) return conferir(existente);

  const criada = await repo.criar({
    officeId: a.officeId,
    attendanceId: a.attendance.id,
    tipo: "NOTA",
    userId: a.userId,
    autorNome: a.autorNome.trim() || "Equipe",
    texto: pedido.texto,
    clientMessageId: pedido.clientMessageId,
    textoHash,
  });
  if (criada) return { status: 200, corpo: { ok: true, jaTinhaSaido: false, mensagem: prepararNota(criada, agora) } };

  // Perdeu a corrida: quem ganhou já gravou. Devolve o dele (mesma regra de cima).
  const vencedora = await repo.achar(a.officeId, pedido.clientMessageId);
  return vencedora ? conferir(vencedora) : recusa(409, "EM_ANDAMENTO", "Esta nota ainda está sendo salva.");
}

/**
 * O aviso "A Ana não respondeu: <motivo>" no chat, uma vez por pergunta do cliente. NUNCA lança: quem chama
 * é `atendenteResponde`, que não pode falhar por causa de um aviso. Devolve true se gravou agora.
 */
export async function registrarAvisoDaAna(
  atendimento: { id: string; officeId: string },
  perguntaId: string,
  motivo: string,
  opcoes: { repo?: RepositorioDeNotas } = {},
): Promise<boolean> {
  const repo = opcoes.repo ?? repositorioPrisma;
  try {
    const chave = chaveDoAvisoDaAna(perguntaId);
    if (await repo.achar(atendimento.officeId, chave)) return false;
    const texto = fraseDoAvisoDaAna(motivo);
    const criada = await repo.criar({ officeId: atendimento.officeId, attendanceId: atendimento.id, tipo: "SISTEMA", userId: null, autorNome: null, texto, clientMessageId: chave, textoHash: hashDoTexto(texto) });
    return criada !== null;
  } catch (erro) {
    console.error("[ana] não foi possível gravar o aviso de desistência:", mensagemDeErro(erro));
    return false;
  }
}
