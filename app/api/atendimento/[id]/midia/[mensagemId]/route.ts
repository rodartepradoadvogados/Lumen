import { NextRequest, NextResponse } from "next/server";
import { atendimentoDaRota } from "@/lib/guardaDoAtendimento";
import { decidirRespostaDaMidia } from "@/lib/midiaDoChatServico";
import { PORTAS_DE_BANCO_DA_MIDIA } from "@/lib/midiaDoChatDb";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/atendimento/[id]/midia/[mensagemId] — o ARQUIVO de uma mídia que o cliente mandou (foto, áudio,
// vídeo, documento), para o balão do aplicativo de Atendimento. A regra inteira está em
// lib/midiaDoChatServico.ts (guarda primeiro: 401 / 403 / 404; mensagem e anexo só dentro da mesma conversa e do
// mesmo escritório; tipo seguro; limite de tamanho; Range). Aqui só se monta a guarda real e se converte o
// resultado em Response. `?baixar=1` força "salvar" em vez de abrir. Cache: private, no-store.
//
// O corpo sai em pedaços (ReadableStream): o arquivo já está na memória da função (o Drive entrega inteiro),
// mas a resposta não precisa ser montada de uma vez.
const PEDACO = 64 * 1024;

function emPedacos(corpo: Buffer): ReadableStream<Uint8Array> {
  let pos = 0;
  return new ReadableStream<Uint8Array>({
    pull(controle) {
      if (pos >= corpo.length) return controle.close();
      controle.enqueue(new Uint8Array(corpo.subarray(pos, pos + PEDACO)));
      pos += PEDACO;
    },
  });
}

// Quem abre o "Abrir" numa aba nova (navegação de documento) não lê JSON: recebe uma frase.
function paginaDeErro(frase: string, status: number): Response {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Arquivo indisponível</title></head><body style="font:16px system-ui,sans-serif;padding:24px;max-width:32rem"><p>${frase.replace(/[<>&]/g, "")}</p></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function GET(req: NextRequest, { params }: { params: { id: string; mensagemId: string } }) {
  const r = await decidirRespostaDaMidia(
    { idDaConversa: params.id, idDaMensagem: params.mensagemId, range: req.headers.get("range"), baixar: req.nextUrl.searchParams.get("baixar") === "1" },
    {
      ...PORTAS_DE_BANCO_DA_MIDIA,
      guarda: async (id) => {
        const g = await atendimentoDaRota(id);
        if (g.erro) return { status: (g.erro.status as 401 | 403 | 404) };
        return { officeId: g.viewer.officeId, attendanceId: g.attendance.id };
      },
    },
  );

  if ("corpo" in r) {
    return new Response(emPedacos(r.corpo), { status: r.status, headers: r.headers });
  }
  if (req.headers.get("sec-fetch-dest") === "document") return paginaDeErro(r.erro, r.status);
  return NextResponse.json({ error: r.erro }, { status: r.status, headers: { "Cache-Control": "private, no-store", ...(r.headers ?? {}) } });
}
