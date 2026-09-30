import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { atendimentoDaRota } from "@/lib/guardaDoAtendimento";
import { prisma } from "@/lib/prisma";
import { LIMITE_DA_PLATAFORMA_BYTES, validarCaminhoDoTemporario } from "@/lib/midiaDeSaida";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

// POST /api/atendimento/[id]/midia-saida/token — a etapa 1 do envio de arquivo: o token do upload direto ao Vercel Blob (o corpo do arquivo
// nunca passa pela função: o limite de corpo da plataforma é menor que uma foto de celular).
//
// A GUARDA VEM ANTES DE LER O CORPO (401 / 403 / 404). O token só é emitido para um caminho `atd-saida/<ESTA conversa>/<chave>/<nome>`
// com extensão da lista do provedor, com o teto de 25 MB, validade curta e sufixo aleatório (o endereço não se adivinha). Só o pedido
// `blob.generate-client-token` é aceito: o retorno de "upload concluído" (`blob.upload-completed`) não passa por aqui, e um corpo
// forjado desse tipo é recusado. O servidor NUNCA envia o que está no Blob sem baixar e conferir (./route.ts).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await atendimentoDaRota(params.id);
  if (r.erro) return r.erro;
  const { viewer, attendance } = r;

  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 415, headers: SEM_CACHE });
  }
  let corpo: HandleUploadBody;
  try {
    corpo = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400, headers: SEM_CACHE });
  }
  if (!corpo || typeof corpo !== "object" || corpo.type !== "blob.generate-client-token") {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400, headers: SEM_CACHE });
  }
  if (!attendance.waPhone) return NextResponse.json({ error: "Este atendimento não tem WhatsApp vinculado." }, { status: 422, headers: SEM_CACHE });

  const config = await prisma.whatsappConfig.findUnique({ where: { officeId: viewer.officeId }, select: { provider: true } });
  const provedor = config?.provider === "EVOLUTION" ? "EVOLUTION" : "META";

  try {
    const resposta = await handleUpload({
      body: corpo,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const v = validarCaminhoDoTemporario(pathname, attendance.id, provedor);
        if (!v.ok) throw new Error(v.erro);
        return { maximumSizeInBytes: LIMITE_DA_PLATAFORMA_BYTES, addRandomSuffix: true, validUntil: Date.now() + 15 * 60_000 };
      },
    });
    return NextResponse.json(resposta, { headers: SEM_CACHE });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Não foi possível preparar o envio." }, { status: 400, headers: SEM_CACHE });
  }
}
