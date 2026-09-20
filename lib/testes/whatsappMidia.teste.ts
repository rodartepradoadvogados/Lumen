import { teste, igual, verdade, resumo } from "./executar";
import {
  tipoMidiaWhatsapp,
  extensaoDoArquivo,
  montarNomeArquivoWhatsapp,
  rotuloDaMidiaWhatsapp,
} from "@/lib/driveNaming";
import { extrairMidiaMeta, parseIncoming } from "@/lib/whatsapp";
import { extrairMidiaEvolution, parseEntradaEvolution } from "@/lib/whatsappEvolution";

// ============================================================================
// F5 — MÍDIA DO WHATSAPP NO DRIVE.
//
// Três camadas testadas aqui, na mesma ordem em que o dado passa por elas:
//
//   1. O NOME DO ARQUIVO (lib/driveNaming.ts) — puro, decide "AAAA_MM_DD_WHATSAPP_TIPO-resto.ext"
//      a partir de MIME/nome original/id da mensagem. Nunca toca rede nem banco.
//   2. A LEITURA DO WEBHOOK DA META (lib/whatsapp.ts:extrairMidiaMeta/parseIncoming) — também
//      pura: um objeto JSON entra, um descritor de mídia (ou null) sai.
//   3. A LEITURA DO WEBHOOK DA EVOLUTION (lib/whatsappEvolution.ts:extrairMidiaEvolution/
//      parseEntradaEvolution) — mesma forma, provedor diferente.
//
// O download de verdade (baixarMidiaMeta/baixarMidiaEvolution) e o upload pro Drive não entram
// aqui: pedem rede/credencial de verdade, e o que neles decide algo (qual mídia, qual nome, qual
// pasta) já está coberto pelas funções puras acima — só falta a chamada em si, que é IO puro.
// ============================================================================

// ── 1. O nome do arquivo ─────────────────────────────────────────────────────────────────────

teste("o tipo é lido do MIME, ignorando parâmetro extra", () => {
  igual(tipoMidiaWhatsapp("image/jpeg"), "IMG");
  igual(tipoMidiaWhatsapp("video/mp4"), "VID");
  // Áudio de voz do WhatsApp chega assim, com o codec junto — teria que ignorar o ";codecs=opus".
  igual(tipoMidiaWhatsapp("audio/ogg; codecs=opus"), "AUD");
  igual(tipoMidiaWhatsapp("application/pdf"), "DOC");
  // Qualquer binário que não seja imagem/vídeo/áudio é "documento" — é como o cliente também chama.
  igual(tipoMidiaWhatsapp("application/zip"), "DOC");
  igual(tipoMidiaWhatsapp(""), null, "MIME vazio não é tipo nenhum: ");
});

teste("a extensão prioriza o nome original sobre o MIME", () => {
  igual(extensaoDoArquivo("application/octet-stream", "boleto.PDF"), "pdf", "maiúscula normalizada: ");
  igual(extensaoDoArquivo("image/jpeg", null), "jpg");
  igual(extensaoDoArquivo("audio/ogg; codecs=opus", null), "ogg", "parâmetro do MIME ignorado: ");
  igual(extensaoDoArquivo("application/vnd.openxmlformats-officedocument.wordprocessingml.document", null), "docx");
});

teste("MIME fora do mapa e sem nome original cai no subtipo do próprio MIME", () => {
  // Rede de segurança para um tipo de arquivo raro que o WhatsApp mande e a lista não previu —
  // sem isto o arquivo subiria sem NENHUMA extensão, o que a maioria dos sistemas trata como texto.
  igual(extensaoDoArquivo("application/x-something-weird", null), "xsomethingweird");
});

teste("o nome do arquivo segue o padrão AAAA_MM_DD_WHATSAPP_TIPO-resto.ext, exatamente como pedido", () => {
  // 20/09/2026 às 12h em Brasília (15h UTC) — bem no meio do dia, sem risco de virada de fuso.
  const nome = montarNomeArquivoWhatsapp({
    recebidoEm: "2026-09-20T15:00:00.000Z",
    mimeType: "image/jpeg",
    waMessageId: "wamid.HBgLTEST==",
    nomeOriginal: null,
  });
  verdade(nome.startsWith("2026_09_20_WHATSAPP_IMG-"), `data/canal/tipo errados: ${nome}`);
  verdade(nome.endsWith(".jpg"), `extensão errada: ${nome}`);
});

teste("documento com nome original vira o 'resto' do arquivo, sem precisar de hash", () => {
  const nome = montarNomeArquivoWhatsapp({
    recebidoEm: "2026-09-20T15:00:00.000Z",
    mimeType: "application/pdf",
    waMessageId: "wamid.QUALQUERCOISA",
    nomeOriginal: "Contrato Social.pdf",
  });
  // Determinístico: dá pra prever o nome inteiro, não só um pedaço dele.
  igual(nome, "2026_09_20_WHATSAPP_DOC-contrato-social.pdf");
});

teste("o mesmo id de mensagem sempre produz o mesmo nome (idempotente)", () => {
  const entrada = { recebidoEm: "2026-01-05T10:00:00.000Z", mimeType: "audio/ogg", waMessageId: "wamid.MESMO", nomeOriginal: null };
  igual(montarNomeArquivoWhatsapp(entrada), montarNomeArquivoWhatsapp(entrada));
});

teste("dois ids de mensagem diferentes (mesmo dia, mesmo tipo) não colidem no nome", () => {
  const base = { recebidoEm: "2026-01-05T10:00:00.000Z", mimeType: "audio/ogg", nomeOriginal: null };
  const a = montarNomeArquivoWhatsapp({ ...base, waMessageId: "wamid.UM" });
  const b = montarNomeArquivoWhatsapp({ ...base, waMessageId: "wamid.DOIS" });
  verdade(a !== b, `dois áudios do mesmo dia ficaram com o mesmo nome: ${a}`);
});

teste("o rótulo da mídia na conversa nomeia o tipo, o nome original e a legenda", () => {
  igual(rotuloDaMidiaWhatsapp("IMG", null, null), "[imagem]");
  igual(rotuloDaMidiaWhatsapp("AUD", "", null), "[áudio]", "legenda em branco não aparece: ");
  igual(rotuloDaMidiaWhatsapp("DOC", "segue o comprovante", "conta.pdf"), "[documento: conta.pdf] segue o comprovante");
  igual(rotuloDaMidiaWhatsapp("VID", "  ", null), "[vídeo]", "legenda só com espaço é tratada como ausente: ");
});

// ── 2. A leitura do webhook da Meta ──────────────────────────────────────────────────────────

teste("extrairMidiaMeta lê os quatro tipos suportados", () => {
  igual(extrairMidiaMeta({ type: "image", image: { id: "M1", mime_type: "image/jpeg", caption: "olha isso" } }), {
    tipo: "IMG",
    mimeType: "image/jpeg",
    legenda: "olha isso",
    nomeOriginal: null,
    mediaId: "M1",
  });
  igual(extrairMidiaMeta({ type: "video", video: { id: "M2", mime_type: "video/mp4" } })?.tipo, "VID");
  igual(extrairMidiaMeta({ type: "audio", audio: { id: "M3", mime_type: "audio/ogg" } })?.tipo, "AUD");
  const doc = extrairMidiaMeta({ type: "document", document: { id: "M4", mime_type: "application/pdf", filename: "peticao.pdf" } });
  igual(doc?.tipo, "DOC");
  igual(doc?.nomeOriginal, "peticao.pdf");
});

teste("extrairMidiaMeta ignora o que não é um dos quatro tipos, e mídia incompleta", () => {
  igual(extrairMidiaMeta({ type: "sticker" }), null, "figurinha não é uma das quatro: ");
  igual(extrairMidiaMeta({ type: "text", text: { body: "oi" } }), null, "mensagem de texto não tem mídia: ");
  // Sem `id` não tem como baixar depois — melhor ignorar do que tentar e falhar mais adiante.
  igual(extrairMidiaMeta({ type: "image", image: { mime_type: "image/jpeg" } }), null, "sem id: ");
  igual(extrairMidiaMeta({ type: "image", image: { id: "M1" } }), null, "sem mime_type: ");
});

function payloadMeta(message: Record<string, unknown>) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "1234567890" },
              contacts: [{ profile: { name: "Maria" } }],
              messages: [{ from: "5562999998888", id: "wamid.ABC", ...message }],
            },
          },
        ],
      },
    ],
  };
}

teste("parseIncoming continua lendo texto normalmente", () => {
  const r = parseIncoming(payloadMeta({ type: "text", text: { body: "bom dia" } }));
  igual(r?.text, "bom dia");
  igual(r?.midia, undefined, "mensagem de texto não carrega mídia: ");
});

teste("parseIncoming lê uma imagem com legenda, com a legenda virando o texto", () => {
  const r = parseIncoming(payloadMeta({ type: "image", image: { id: "M1", mime_type: "image/jpeg", caption: "segue a foto" } }));
  igual(r?.text, "segue a foto");
  igual(r?.midia, { tipo: "IMG", mimeType: "image/jpeg", nomeOriginal: null, mediaId: "M1" });
});

teste("parseIncoming lê um documento sem legenda, com o texto vazio (não nulo)", () => {
  const r = parseIncoming(payloadMeta({ type: "document", document: { id: "M4", mime_type: "application/pdf", filename: "rg.pdf" } }));
  igual(r?.text, "");
  igual(r?.midia?.nomeOriginal, "rg.pdf");
});

teste("parseIncoming ignora o que não é texto nem uma das quatro mídias", () => {
  igual(parseIncoming(payloadMeta({ type: "sticker", sticker: { id: "S1" } })), null, "figurinha: ");
  igual(parseIncoming(payloadMeta({ type: "location", location: { latitude: 1, longitude: 2 } })), null, "localização: ");
  igual(parseIncoming(payloadMeta({ type: "image", image: { mime_type: "image/jpeg" } })), null, "imagem sem id pra baixar: ");
});

teste("parseIncoming continua recusando payload sem os três identificadores", () => {
  igual(parseIncoming({ entry: [{ changes: [{ value: { messages: [{ type: "text", text: { body: "oi" } }] } }] }] }), null, "sem phone_number_id nem from: ");
  igual(parseIncoming(null), null, "nulo: ");
  igual(parseIncoming("lixo"), null, "lixo: ");
});

// ── 3. A leitura do webhook da Evolution ─────────────────────────────────────────────────────

teste("extrairMidiaEvolution lê os quatro tipos, inclusive documento mandado com legenda", () => {
  igual(extrairMidiaEvolution({ imageMessage: { mimetype: "image/jpeg", caption: "chegou" } }), {
    tipo: "IMG",
    mimeType: "image/jpeg",
    legenda: "chegou",
    nomeOriginal: null,
  });
  igual(extrairMidiaEvolution({ videoMessage: { mimetype: "video/mp4" } })?.tipo, "VID");
  igual(extrairMidiaEvolution({ audioMessage: { mimetype: "audio/ogg; codecs=opus" } })?.tipo, "AUD");
  igual(extrairMidiaEvolution({ documentMessage: { mimetype: "application/pdf", fileName: "boleto.pdf" } })?.nomeOriginal, "boleto.pdf");
  // A Baileys embrulha "documento mandado COM legenda" um nível mais fundo — ver o comentário do tipo.
  igual(
    extrairMidiaEvolution({ documentWithCaptionMessage: { message: { documentMessage: { mimetype: "application/pdf", caption: "segue" } } } })
      ?.legenda,
    "segue",
  );
});

teste("extrairMidiaEvolution devolve null para mensagem sem MIME (evento de status) e para undefined", () => {
  igual(extrairMidiaEvolution({ imageMessage: {} }), null);
  igual(extrairMidiaEvolution(undefined), null);
});

function eventoEvolution(dados: Record<string, unknown> = {}) {
  return {
    event: "messages.upsert",
    instance: "lumen-rodarte-prado",
    data: {
      key: { remoteJid: "5562982490400@s.whatsapp.net", fromMe: false, id: "WA1" },
      pushName: "Rodrigo",
      ...dados,
    },
  };
}

teste("parseEntradaEvolution aceita uma imagem sozinha, sem legenda nenhuma", () => {
  // Este é EXATAMENTE o caso que a Evolution descartava antes da F5 (ver o teste histórico "mídia
  // sem texto" em whatsapp.teste.ts, que continua valendo pra mídia SEM mimetype) — com mimetype
  // presente, agora tem o que processar.
  const r = parseEntradaEvolution(eventoEvolution({ message: { imageMessage: { mimetype: "image/jpeg" } } }));
  verdade(r !== null, "uma imagem sozinha não pode mais ser descartada");
  igual(r?.text, "", "sem legenda, o texto fica vazio: ");
  igual(r?.midia?.tipo, "IMG");
  igual(r?.midia?.evolution, { remoteJid: "5562982490400@s.whatsapp.net", waMessageId: "WA1" });
});

teste("parseEntradaEvolution continua descartando mídia vazia (evento de status) sem texto", () => {
  igual(parseEntradaEvolution(eventoEvolution({ message: { imageMessage: {} } })), null);
});

teste("parseEntradaEvolution lê um documento com legenda, e a legenda vira o texto", () => {
  const r = parseEntradaEvolution(
    eventoEvolution({ message: { documentMessage: { mimetype: "application/pdf", fileName: "procuracao.pdf", caption: "assinada" } } }),
  );
  igual(r?.text, "assinada");
  igual(r?.midia?.nomeOriginal, "procuracao.pdf");
});

void resumo("whatsapp-midia (F5)");
