import { prisma } from "@/lib/prisma";

// REGISTRO DE USO DO ASSISTENTE — auditoria e limite, na mesma tabela.
//
// Não é economia de tabela: é que as duas perguntas são a mesma. "O que este escritório consultou
// e quando" (LGPD) e "quantas vezes este escritório pediu no último minuto" (limite) se respondem
// com a mesma linha, no mesmo índice `(officeId, createdAt)`.
//
// Por que NÃO um contador em memória, que seria mais barato: em ambiente serverless cada
// instância teria o seu, e o limite passaria a valer por instância em vez de por escritório — ou
// seja, o teto real seria o dobro, o triplo, o que a Vercel resolvesse escalar naquele minuto. Um
// limite que não sabe quanto está limitando não é um limite.
//
// Nada aqui é atualizado nem apagado pelo produto. A tabela só recebe inserção e leitura, e a
// chave estrangeira de escritório e usuário é RESTRICT de propósito (ver o SQL em prisma/sql):
// apagar um usuário não pode arrastar silenciosamente a prova do que ele consultou.

/** Teto por escritório, por minuto. Vem do requisito de produto (60 req/min por tenant). */
export const TETO_POR_MINUTO = 60;

export type AcaoAssistente = "PERGUNTA" | "FERRAMENTA" | "RECUSA_LIMITE";

export async function registrarUso(dados: {
  officeId: string;
  userId: string;
  sessionId?: string | null;
  acao: AcaoAssistente;
  ferramenta?: string | null;
  detalhe?: string | null;
}): Promise<void> {
  // O registro nunca derruba a conversa: se a gravação falhar, o usuário ainda recebe a resposta.
  // É um buraco na auditoria, não motivo para negar uma pergunta legítima — mesmo raciocínio já
  // aplicado ao AccessAuditLog do Vidro Fosco (ver lib/prisma.ts).
  try {
    await prisma.assistantAuditLog.create({
      data: {
        officeId: dados.officeId,
        userId: dados.userId,
        sessionId: dados.sessionId ?? null,
        acao: dados.acao,
        ferramenta: dados.ferramenta ?? null,
        // Corta em 500: o detalhe existe para dar rastro, não para virar uma segunda cópia do
        // conteúdo da conversa dentro da tabela de auditoria.
        detalhe: dados.detalhe ? dados.detalhe.slice(0, 500) : null,
      },
    });
  } catch (erro) {
    console.error("[assistente] falha ao registrar uso", erro);
  }
}

/**
 * Quantas perguntas este escritório fez no último minuto, e se ainda cabe mais uma.
 * Conta só `PERGUNTA`: as linhas de `FERRAMENTA` são consequência de uma pergunta já contada, e
 * cobrá-las de novo faria uma pergunta que consulta quatro tabelas custar cinco.
 */
export async function cabeMaisUmaPergunta(officeId: string): Promise<{ cabe: boolean; usadas: number }> {
  const desde = new Date(Date.now() - 60_000);
  const usadas = await prisma.assistantAuditLog.count({
    where: { officeId, acao: "PERGUNTA", createdAt: { gte: desde } },
  });
  return { cabe: usadas < TETO_POR_MINUTO, usadas };
}
