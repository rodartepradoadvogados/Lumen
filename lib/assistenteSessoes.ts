import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

// SESSÕES DO ASSISTENTE — a conversa deixa de ser efêmera.
//
// Antes, o front reenviava o histórico inteiro a cada pergunta e nada ficava gravado: fechar a
// aba perdia a conversa, trocar de aparelho perdia a conversa, e uma pergunta de dez turnos
// trafegava dez vezes. Agora o cliente manda só a pergunta e o id da sessão.
//
// A SESSÃO É DO USUÁRIO. Toda função aqui filtra por `userId` E `officeId`, e isso não é
// redundância defensiva: `officeId` isola inquilinos, `userId` isola colegas. Um advogado
// perguntando sobre a estratégia de um caso não está escrevendo um documento do escritório.
//
// O conteúdo é gravado como JSON porque uma mensagem do Claude não é uma string: é uma lista de
// blocos (texto, uso de ferramenta, resultado de ferramenta). Guardar só o texto jogaria fora
// exatamente o que prova de onde a resposta veio.

/** Quantas mensagens do fim da conversa voltam para o modelo. Ver a nota em `carregarHistorico`. */
const JANELA_DE_CONTEXTO = 40;

export type ResumoSessao = {
  id: string;
  titulo: string;
  atualizadaEm: string;
};

/** Título a partir da primeira pergunta — o suficiente para reconhecer a conversa numa lista. */
export function tituloDaPergunta(pergunta: string): string {
  const limpo = pergunta.replace(/\s+/g, " ").trim();
  return limpo.length <= 60 ? limpo : `${limpo.slice(0, 57)}…`;
}

export async function listarSessoes(userId: string, officeId: string): Promise<ResumoSessao[]> {
  const linhas = await prisma.assistantSession.findMany({
    where: { userId, officeId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, titulo: true, updatedAt: true },
  });
  return linhas.map((l) => ({ id: l.id, titulo: l.titulo, atualizadaEm: l.updatedAt.toISOString() }));
}

export async function criarSessao(userId: string, officeId: string, titulo: string) {
  return prisma.assistantSession.create({ data: { userId, officeId, titulo } });
}

/**
 * Apaga a conversa e, por cascata, as mensagens dela. O registro de USO não vai junto: a pessoa
 * pode apagar a própria conversa, mas o escritório continua podendo provar o que foi consultado
 * sobre os dados dele — é o que a LGPD pede, e são coisas diferentes.
 */
export async function apagarSessao(id: string, userId: string, officeId: string): Promise<boolean> {
  const r = await prisma.assistantSession.deleteMany({ where: { id, userId, officeId } });
  return r.count > 0;
}

/**
 * O histórico que volta para o modelo.
 *
 * Só as últimas `JANELA_DE_CONTEXTO` mensagens. Uma conversa longa não pode crescer sem teto para
 * dentro do pedido: além do custo, há um limite de contexto, e estourá-lo faz a conversa PARAR DE
 * FUNCIONAR justamente para quem mais a usa. Cortar pelo fim preserva o que importa (o assunto
 * corrente); quem precisar do começo tem a conversa inteira gravada e visível na tela.
 *
 * O corte respeita pares: um `tool_result` sem o `tool_use` que o originou é rejeitado pela API,
 * então a janela avança até a primeira mensagem de usuário que não seja resultado de ferramenta.
 */
export async function carregarHistorico(sessionId: string): Promise<Anthropic.MessageParam[]> {
  const linhas = await prisma.assistantMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: { papel: true, conteudo: true },
  });

  const todas: Anthropic.MessageParam[] = linhas.map((l) => ({
    role: l.papel === "assistant" ? "assistant" : "user",
    content: JSON.parse(l.conteudo),
  }));

  if (todas.length <= JANELA_DE_CONTEXTO) return todas;

  let inicio = todas.length - JANELA_DE_CONTEXTO;
  while (inicio < todas.length) {
    const m = todas[inicio];
    const ehResultadoDeFerramenta =
      m.role === "user" && Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result");
    if (m.role === "user" && !ehResultadoDeFerramenta) break;
    inicio += 1;
  }
  return todas.slice(inicio);
}

export async function gravarMensagem(
  sessionId: string,
  papel: "user" | "assistant",
  conteudo: Anthropic.MessageParam["content"],
): Promise<void> {
  await prisma.assistantMessage.create({
    data: { sessionId, papel, conteudo: JSON.stringify(conteudo) },
  });
}

/** Marca a conversa como mexida agora, para ela subir na lista. */
export async function tocarSessao(sessionId: string): Promise<void> {
  await prisma.assistantSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
}
