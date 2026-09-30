import { NextRequest, NextResponse } from "next/server";
import { atendimentoDaRota } from "@/lib/guardaDoAtendimento";
import { enviarMidiaDoApp } from "@/lib/envioDeMidiaDb";
import { processarPedidoDeMidia } from "@/lib/midiaDeSaidaServico";

export const dynamic = "force-dynamic";
// Baixar o temporário, chamar o provedor (até 75 s na Evolution; 60 s + 30 s na Meta) e guardar a cópia no Drive. Se o processo for
// cortado no meio, a reserva fica RESERVADO e o aparelho mostra "sem confirmação" — o caso que o desenho existe para tratar.
export const maxDuration = 120;

const SEM_CACHE = { "Cache-Control": "no-store" };

// POST /api/atendimento/[id]/midia-saida — envia UM ARQUIVO (imagem, vídeo, áudio, documento) ao cliente pelo WhatsApp.
//   corpo (JSON): { clientMessageId, blobUrl, nome, legenda?, confirmouReenvio? }
//   O arquivo NÃO vem neste corpo: o aparelho o sobe antes, direto para o Vercel Blob (caminho amarrado a esta conversa e a esta chave,
//   ver ./token/route.ts), e aqui chega só o endereço. O servidor baixa, CONFERE (lista do provedor, tamanho, conteúdo), envia e APAGA.
//
// A GUARDA VEM ANTES DE LER O CORPO (401 / 403 / 404, nada gravado, nada baixado). A regra inteira está em lib/midiaDeSaidaServico.ts
// (ordem) e lib/envioDeMidiaDb.ts (idempotência, janela, limite, envio, registro).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await processarPedidoDeMidia(params.id, {
    guarda: async (id) => {
      const g = await atendimentoDaRota(id);
      if (g.erro) return { status: g.erro.status as 401 | 403 | 404 };
      return { officeId: g.viewer.officeId, userId: g.viewer.id, attendance: { id: g.attendance.id, waPhone: g.attendance.waPhone, firstResponseAt: g.attendance.firstResponseAt, subject: g.attendance.subject } };
    },
    lerCorpo: async () => {
      if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return { erro: 415 };
      try {
        return { json: await req.json() };
      } catch {
        return { erro: 400 };
      }
    },
    executar: (a, pedido) => enviarMidiaDoApp(a, pedido),
  });
  return NextResponse.json(r.corpo, { status: r.status, headers: SEM_CACHE });
}
