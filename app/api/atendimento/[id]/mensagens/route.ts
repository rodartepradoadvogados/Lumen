import { NextRequest, NextResponse } from "next/server";
import { atendimentoDaRota } from "@/lib/guardaDoAtendimento";
import { carregarEntregasRecentes, carregarMensagensDepois, carregarPaginaDoChat } from "@/lib/mensagensDoChatDb";
import { lerCursor } from "@/lib/mensagensDoChat";
import { despacharPedidoDoChat } from "@/lib/pedidoDoChatDb";
import { lerEstadoDoChat } from "@/lib/estadoDoChatDb";

export const dynamic = "force-dynamic";
// O envio espera o WhatsApp responder. Se o processo for cortado no meio, a reserva fica RESERVADO e o
// aparelho mostra "sem confirmação" — é o caso que o desenho existe para tratar, sem reenviar às cegas.
export const maxDuration = 60;

const SEM_CACHE = { "Cache-Control": "no-store" };

// GET /api/atendimento/[id]/mensagens
//   ?antes=<cursor>   a página de mensagens ANTERIORES ao cursor (o "Carregar mensagens anteriores").
//   ?depois=<cursor>  o que chegou DEPOIS do cursor + o estado da conversa (a atualização a cada 15 s).
//
// A GUARDA VEM ANTES DE TUDO: 401 sem sessão, 403 sem acesso ao Atendimento, 404 para a conversa que
// não é sua ou que não existe (indistinguíveis) — o recorte por dono de lib/acessoAtendimento.ts. O
// cursor é palpite de quem chama: `lerCursor` só aceita instante válido + id de formato conhecido;
// cursor inválido = 400, e não "a primeira página" (que seria devolver mensagens que a tela já tem).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await atendimentoDaRota(params.id);
  if (r.erro) return r.erro;
  const { viewer, attendance } = r;

  const depois = req.nextUrl.searchParams.get("depois");
  if (depois !== null) {
    if (!lerCursor(depois)) return NextResponse.json({ error: "Cursor inválido" }, { status: 400 });
    const agora = new Date();
    // `entregas`: o estado (✓ / ✓✓ / lida / falhou) das mensagens de saída que a tela JÁ TEM, que podem ter mudado.
    const [mensagens, estado, entregas] = await Promise.all([
      carregarMensagensDepois(attendance.id, viewer.officeId, depois, { agora }),
      lerEstadoDoChat(attendance, viewer.officeId, agora),
      carregarEntregasRecentes(attendance.id, viewer.officeId),
    ]);
    return NextResponse.json({ mensagens, estado, entregas }, { headers: SEM_CACHE });
  }

  const antes = req.nextUrl.searchParams.get("antes");
  if (antes !== null && !lerCursor(antes)) return NextResponse.json({ error: "Cursor inválido" }, { status: 400 });

  const pagina = await carregarPaginaDoChat(attendance.id, viewer.officeId, { antes });
  return NextResponse.json(pagina, { headers: SEM_CACHE });
}

// POST /api/atendimento/[id]/mensagens — envia um TEXTO ao cliente pelo WhatsApp, ou salva uma NOTA INTERNA.
//   corpo: { clientMessageId, texto, confirmouReenvio?, modo?: "mensagem" | "nota" }   (JSON)
//
// A GUARDA VEM ANTES DE LER O CORPO (401 / 403 / 404, sem gravar nada). O corpo só é aceito como JSON
// (um formulário de outro site não consegue mandar `application/json` sem pedir licença ao navegador).
// A idempotência, a janela de 24 h e "quem enviou, assumiu" moram em lib/envioDeMensagemDb.ts. Rota JSON
// e não Server Action de propósito: o identificador de uma Server Action muda a cada deploy, e uma
// mensagem parada na fila do aparelho falharia com "Failed to find Server Action".
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await atendimentoDaRota(params.id);
  if (r.erro) return r.erro;
  const { viewer, attendance } = r;
  const { officeId, id: userId } = viewer;

  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ ok: false, codigo: "INVALIDO", erro: "Pedido inválido." }, { status: 415, headers: SEM_CACHE });
  }
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, codigo: "INVALIDO", erro: "Pedido inválido." }, { status: 400, headers: SEM_CACHE });
  }
  // `modo`: ausente/"mensagem" envia ao cliente; "nota" grava a nota interna (só da equipe, NUNCA ao WhatsApp);
  // qualquer outro valor é 400. Quem decide é lib/pedidoDoChatDb.ts.
  const resposta = await despacharPedidoDoChat({ officeId, userId, autorNome: viewer.name, attendance }, corpo);
  return NextResponse.json(resposta.corpo, { status: resposta.status, headers: SEM_CACHE });
}
