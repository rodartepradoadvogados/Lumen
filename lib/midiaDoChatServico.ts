import { lerMidia } from "@/lib/mensagensDoChat";
import { FRASES_DA_MIDIA, LIMITE_DA_MIDIA_BYTES, cabecalhosDaMidia, idDeMensagemValido, lerFaixa, tipoParaServir } from "@/lib/midiaDoChat";

// ============================================================================
// A DECISÃO DA ROTA DE MÍDIA (GET /api/atendimento/[id]/midia/[mensagemId]), sem Next e sem banco: recebe
// as portas (guarda, consulta, download) por parâmetro, e por isso o teste consegue provar a ORDEM e o
// recorte com portas falsas. A rota de verdade só monta as portas reais e converte o resultado em Response.
//
// A ORDEM É O RECORTE:
//   1. GUARDA do atendimento (sessão -> acesso ao Atendimento -> dono/escritório): 401 / 403 / 404. Nada é
//      lido antes dela — nem a mensagem, nem o anexo.
//   2. a MENSAGEM tem de ser DESTA conversa e DESTE escritório (id palpite, formato conferido antes de ir ao
//      banco): outra conversa, outro escritório ou id inexistente = 404, o MESMO 404.
//   3. só mídia RECEBIDA e guardada (foto, áudio, vídeo, documento). Figurinha não é guardada; texto não é mídia.
//   4. o ANEXO é procurado dentro da mesma conversa e do mesmo escritório; o arquivo só é baixado depois.
//   5. limite de tamanho, tipo seguro, recorte de bytes.
// Nenhuma frase de erro contém id, endereço do Drive ou o texto do erro do provedor.
// ============================================================================

export type GuardaDaMidia = { status: 401 | 403 | 404 } | { officeId: string; attendanceId: string };

export type MensagemDaMidia = {
  id: string;
  direction: string;
  body: string;
  waMessageId: string | null;
  attachmentId: string | null;
  midiaMime: string | null;
  midiaBytes: number | null;
};

export type AnexoDaMidia = { id: string; name: string; driveUrl: string; storageProvider: string; storageFileId: string | null };

export type PortasDaMidia = {
  guarda: (idDaConversa: string) => Promise<GuardaDaMidia>;
  acharMensagem: (q: { id: string; attendanceId: string; officeId: string }) => Promise<MensagemDaMidia | null>;
  acharAnexo: (m: MensagemDaMidia, q: { attendanceId: string; officeId: string }) => Promise<AnexoDaMidia | null>;
  baixar: (a: AnexoDaMidia, officeId: string) => Promise<{ content: Buffer; mimeType: string }>;
};

export type RespostaDaMidia =
  | { status: 200 | 206; headers: Record<string, string>; corpo: Buffer }
  | { status: 401 | 403 | 404 | 413 | 416 | 502; erro: string; headers?: Record<string, string> };

const FRASE_DA_GUARDA: Record<401 | 403 | 404, string> = {
  401: "Não autenticado",
  403: "Sem acesso ao Atendimento",
  404: FRASES_DA_MIDIA.naoEncontrado,
};

export async function decidirRespostaDaMidia(
  pedido: { idDaConversa: string; idDaMensagem: string; range: string | null; baixar: boolean },
  portas: PortasDaMidia,
): Promise<RespostaDaMidia> {
  const g = await portas.guarda(pedido.idDaConversa);
  if ("status" in g) return { status: g.status, erro: FRASE_DA_GUARDA[g.status] };

  if (!idDeMensagemValido(pedido.idDaMensagem)) return { status: 404, erro: FRASES_DA_MIDIA.naoEncontrado };
  const consulta = { attendanceId: g.attendanceId, officeId: g.officeId };
  const mensagem = await portas.acharMensagem({ id: pedido.idDaMensagem, ...consulta });
  if (!mensagem) return { status: 404, erro: FRASES_DA_MIDIA.naoEncontrado };

  const midia = lerMidia(mensagem.body);
  if (!midia || midia.tipo === "figurinha" || mensagem.direction !== "IN") return { status: 404, erro: FRASES_DA_MIDIA.naoEncontrado };
  if (mensagem.midiaBytes != null && mensagem.midiaBytes > LIMITE_DA_MIDIA_BYTES) return { status: 413, erro: FRASES_DA_MIDIA.grandeDemais };

  const anexo = await portas.acharAnexo(mensagem, consulta);
  if (!anexo) return { status: 404, erro: FRASES_DA_MIDIA.indisponivel };

  let baixado: { content: Buffer; mimeType: string };
  try {
    baixado = await portas.baixar(anexo, g.officeId);
  } catch {
    return { status: 502, erro: FRASES_DA_MIDIA.falhaNoDrive };
  }
  const total = baixado.content.length;
  if (total > LIMITE_DA_MIDIA_BYTES) return { status: 413, erro: FRASES_DA_MIDIA.grandeDemais };

  const tipo = tipoParaServir(baixado.mimeType || mensagem.midiaMime, anexo.name);
  const base = cabecalhosDaMidia(tipo, midia.nome || anexo.name, pedido.baixar);
  const faixa = lerFaixa(pedido.range, total);
  if (faixa === "invalida") return { status: 416, erro: FRASES_DA_MIDIA.faixaInvalida, headers: { "Content-Range": `bytes */${total}`, "Cache-Control": "private, no-store" } };
  if (faixa) {
    const pedaco = baixado.content.subarray(faixa.inicio, faixa.fim + 1);
    return { status: 206, headers: { ...base, "Content-Length": String(pedaco.length), "Content-Range": `bytes ${faixa.inicio}-${faixa.fim}/${total}` }, corpo: pedaco };
  }
  return { status: 200, headers: { ...base, "Content-Length": String(total) }, corpo: baixado.content };
}
