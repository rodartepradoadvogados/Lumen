import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// As mensagens de UMA conversa, para a tela poder reabri-la.
//
// Devolve só o que se lê: o texto de cada turno, na ordem. O conteúdo gravado é a lista de blocos
// do Claude (texto, uso de ferramenta, resultado de ferramenta) — os blocos de ferramenta ficam
// de fora da resposta de propósito. Eles existem no banco porque são a PROCEDÊNCIA da resposta, e
// são úteis na auditoria; jogá-los na tela seria mostrar JSON de consulta a quem perguntou
// "quantos processos eu tenho".
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // O dono é conferido na MESMA consulta que busca as mensagens: não há janela entre verificar e
  // ler. Sem isto, passar o id da conversa de um colega leria o histórico dele.
  const sessao = await prisma.assistantSession.findFirst({
    where: { id: params.id, userId: user.id, officeId: user.officeId },
    select: {
      id: true,
      titulo: true,
      mensagens: { orderBy: { createdAt: "asc" }, select: { papel: true, conteudo: true } },
    },
  });
  if (!sessao) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  const mensagens: { autor: "user" | "assistant"; texto: string }[] = [];
  for (const m of sessao.mensagens) {
    let conteudo: unknown;
    try {
      conteudo = JSON.parse(m.conteudo);
    } catch {
      continue; // linha corrompida não derruba a conversa inteira
    }
    // Uma mensagem pode ser string (a pergunta) ou lista de blocos (a resposta do modelo).
    const texto =
      typeof conteudo === "string"
        ? conteudo
        : Array.isArray(conteudo)
          ? conteudo
              .filter((b): b is { type: "text"; text: string } => Boolean(b) && (b as { type?: string }).type === "text")
              .map((b) => b.text)
              .join("\n")
          : "";
    if (texto.trim()) mensagens.push({ autor: m.papel === "assistant" ? "assistant" : "user", texto });
  }

  return NextResponse.json({ id: sessao.id, titulo: sessao.titulo, mensagens });
}
