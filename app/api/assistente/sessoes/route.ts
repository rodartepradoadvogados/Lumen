import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { listarSessoes, apagarSessao } from "@/lib/assistenteSessoes";

export const dynamic = "force-dynamic";

// As conversas do assistente: listar e apagar.
//
// Criar NÃO tem rota própria de propósito. Uma conversa sem nenhuma mensagem é lixo — ela nasceria
// com título vazio, apareceria na lista e não teria o que mostrar. Quem cria a sessão é a primeira
// pergunta, em /api/assistente: manda sem `sessaoId` e recebe o id da sessão nova na resposta.
//
// Toda consulta filtra por userId E officeId. Não é redundância: officeId isola inquilinos,
// userId isola colegas do mesmo escritório — ver a nota em lib/assistenteSessoes.ts.

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const sessoes = await listarSessoes(user.id, user.officeId);
  return NextResponse.json({ sessoes });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Informe o id da conversa." }, { status: 400 });
  }

  // `deleteMany` com os três filtros, e não `delete` por id: assim uma tentativa de apagar a
  // conversa de outra pessoa não encontra nada e devolve 404, em vez de apagar e depois descobrir.
  const apagou = await apagarSessao(id, user.id, user.officeId);
  if (!apagou) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
