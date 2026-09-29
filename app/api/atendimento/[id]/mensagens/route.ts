import { NextRequest, NextResponse } from "next/server";
import { atendimentoDaRota } from "@/lib/guardaDoAtendimento";
import { carregarPaginaDoChat } from "@/lib/mensagensDoChatDb";
import { lerCursor } from "@/lib/mensagensDoChat";

export const dynamic = "force-dynamic";

// GET /api/atendimento/[id]/mensagens?antes=<cursor> — a página de mensagens ANTERIORES ao cursor (o
// "Carregar mensagens anteriores" do chat do aplicativo). 60 por vez, da mais antiga para a mais nova.
//
// A GUARDA VEM ANTES DE TUDO: 401 sem sessão, 403 sem acesso ao Atendimento, 404 para a conversa que
// não é sua ou que não existe (indistinguíveis) — o recorte por dono de lib/acessoAtendimento.ts. O
// cursor é palpite de quem chama: `lerCursor` só aceita instante válido + id de formato conhecido;
// cursor inválido = 400, e não "a primeira página" (que seria devolver mensagens que a tela já tem).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await atendimentoDaRota(params.id);
  if (r.erro) return r.erro;
  const { viewer, attendance } = r;

  const antes = req.nextUrl.searchParams.get("antes");
  if (antes !== null && !lerCursor(antes)) return NextResponse.json({ error: "Cursor inválido" }, { status: 400 });

  const pagina = await carregarPaginaDoChat(attendance.id, viewer.officeId, { antes });
  return NextResponse.json(pagina, { headers: { "Cache-Control": "no-store" } });
}
