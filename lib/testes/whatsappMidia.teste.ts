import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  tipoMidiaWhatsapp,
  extensaoDoArquivo,
  montarNomeArquivoWhatsapp,
  rotuloDaMidiaWhatsapp,
  ehNomeDeMidiaDoWhatsapp,
} from "@/lib/driveNaming";
import { extrairMidiaMeta, parseIncoming } from "@/lib/whatsapp";
import { extrairMidiaEvolution, parseEntradaEvolution } from "@/lib/whatsappEvolution";

// ============================================================================
// F5 — MÍDIA DO WHATSAPP NO DRIVE.
//
// Quatro camadas testadas aqui, na mesma ordem em que o dado passa por elas:
//
//   1. O NOME DO ARQUIVO (lib/driveNaming.ts) — puro, decide "AAAA_MM_DD_WHATSAPP_TIPO-resto.ext"
//      a partir de MIME/nome original/id da mensagem. Nunca toca rede nem banco.
//   2. A LEITURA DO WEBHOOK DA META (lib/whatsapp.ts:extrairMidiaMeta/parseIncoming) — também
//      pura: um objeto JSON entra, um descritor de mídia (ou null) sai.
//   3. A LEITURA DO WEBHOOK DA EVOLUTION (lib/whatsappEvolution.ts:extrairMidiaEvolution/
//      parseEntradaEvolution) — mesma forma, provedor diferente.
//   4. AS TRAVAS DO LADO DE IO (download/upload) — download e upload de verdade não têm como
//      entrar num teste de mesa (pedem rede/credencial reais), mas a FORMA da chamada — "isto não
//      pode lançar sem ser pego", "sem isto não dá pra baixar nada", "a Evolution precisa da chave
//      inteira" — é uma decisão que custa caro errar e cabe em varredura de código-fonte (mesmo
//      padrão de lib/testes/funil.teste.ts/parametros.teste.ts, via corpoDaFuncao). Achado numa
//      auditoria externa a este PR: as primeiras 12 mutações desta suíte miravam só as camadas 1-3
//      (puras) e deixavam o lado de IO sem nenhuma rede de proteção — 4 mutações no lado de IO
//      passaram verdes antes desta seção existir.
// ============================================================================

// ── 1. O nome do arquivo ─────────────────────────────────────────────────────────────────

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

teste("o dia do arquivo é o de BRASÍLIA, não o de UTC — perto da meia-noite os dois divergem", () => {
  // "2026-09-21T02:30:00Z" é 20/09 às 23h30 em Brasília (UTC-3): ainda dia 20 pra quem mandou a
  // mensagem, mas já dia 21 em UTC. Um teste com hora de meio-dia (como os de cima, de propósito
  // simples) não distingue os dois fusos — só um instante depois das 21h de Brasília prova qual
  // fuso o código está usando de verdade. Mesma classe de defeito que motivou a auditoria de
  // formatDate deste projeto (ver f2adc85 no histórico).
  const nome = montarNomeArquivoWhatsapp({
    recebidoEm: "2026-09-21T02:30:00.000Z",
    mimeType: "image/jpeg",
    waMessageId: "wamid.FUSO",
    nomeOriginal: null,
  });
  verdade(nome.startsWith("2026_09_20_WHATSAPP_IMG-"), `o dia saiu no fuso errado (UTC em vez de Brasília): ${nome}`);
});

teste("o rótulo da mídia na conversa nomeia o tipo, o nome original e a legenda", () => {
  igual(rotuloDaMidiaWhatsapp("IMG", null, null), "[imagem]");
  igual(rotuloDaMidiaWhatsapp("AUD", "", null), "[áudio]", "legenda em branco não aparece: ");
  igual(rotuloDaMidiaWhatsapp("DOC", "segue o comprovante", "conta.pdf"), "[documento: conta.pdf] segue o comprovante");
  igual(rotuloDaMidiaWhatsapp("VID", "  ", null), "[vídeo]", "legenda só com espaço é tratada como ausente: ");
});

// ── 2. A leitura do webhook da Meta ────────────────────────────────────────────

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

teste("parseIncoming ignora o que não é texto, mídia nem figurinha", () => {
  igual(parseIncoming(payloadMeta({ type: "location", location: { latitude: 1, longitude: 2 } })), null, "localização: ");
  igual(parseIncoming(payloadMeta({ type: "image", image: { mime_type: "image/jpeg" } })), null, "imagem sem id pra baixar: ");
});

// F-figurinha: a figurinha DEIXOU de ser descartada como null — ela agora é reconhecida (para a
// Ana avisar, depois de esperar, que não identifica esse tipo de mensagem — ver
// lib/avisoFigurinha.ts), mas continua NUNCA virando IncomingMidia (nunca sobe pro Drive).
teste("parseIncoming reconhece a figurinha, mas ela nunca vira midia (sem texto, sem upload)", () => {
  const r = parseIncoming(payloadMeta({ type: "sticker", sticker: { id: "S1", mime_type: "image/webp" } }));
  verdade(r !== null, "uma figurinha solitária não pode mais ser descartada como null");
  igual(r?.figurinha, true);
  igual(r?.text, "");
  igual(r?.midia, undefined, "figurinha não pode virar mídia — ela não é pra subir pro Drive");
});

teste("parseIncoming continua recusando payload sem os três identificadores", () => {
  igual(parseIncoming({ entry: [{ changes: [{ value: { messages: [{ type: "text", text: { body: "oi" } }] } }] }] }), null, "sem phone_number_id nem from: ");
  igual(parseIncoming(null), null, "nulo: ");
  igual(parseIncoming("lixo"), null, "lixo: ");
});

// ── 3. A leitura do webhook da Evolution ─────────────────────────────────────────

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

// F-figurinha: mesma regra da Meta, do lado da Evolution — a Baileys nunca embrulha legenda numa
// figurinha (diferente de documentWithCaptionMessage), então só a presença do campo importa.
teste("parseEntradaEvolution reconhece a figurinha, mas ela nunca vira midia (sem texto, sem upload)", () => {
  const r = parseEntradaEvolution(eventoEvolution({ message: { stickerMessage: { mimetype: "image/webp" } } }));
  verdade(r !== null, "uma figurinha solitária não pode mais ser descartada como null");
  igual(r?.figurinha, true);
  igual(r?.text, "");
  igual(r?.midia, undefined, "figurinha não pode virar mídia — ela não é pra subir pro Drive");
});

teste("parseEntradaEvolution lê um documento com legenda, e a legenda vira o texto", () => {
  const r = parseEntradaEvolution(
    eventoEvolution({ message: { documentMessage: { mimetype: "application/pdf", fileName: "procuracao.pdf", caption: "assinada" } } }),
  );
  igual(r?.text, "assinada");
  igual(r?.midia?.nomeOriginal, "procuracao.pdf");
});

// ── 4. As travas do lado de IO (varredura de código-fonte) ─────────────────────────────
//
// As três de baixo não têm como virar teste de mesa (dependem de rede/credencial real) — o que dá
// pra testar é a FORMA da chamada, com corpoDaFuncao (mesmo padrão de funil.teste.ts/
// parametros.teste.ts). Duas armadilhas já morderam nesta suíte antes: âncora num MARCADOR
// COMENTADO (codigoDe tira comentário — devolve -1 e a fatia engole o arquivo inteiro; por isso
// nenhuma checagem abaixo procura um trecho que só existe em comentário) e ASSERÇÃO POR PREFIXO
// (checar só "midia.waMessageId" passaria verde mesmo se a CHAVE do objeto mudasse de nome — por
// isso cada checagem trava também o nome do campo, não só o valor).

const whatsappFonte = readFileSync("lib/whatsapp.ts", "utf8");
const evolutionFonte = readFileSync("lib/whatsappEvolution.ts", "utf8");

// TERCEIRA ARMADILHA (achada nesta rodada, além das duas já conhecidas de codigoDe/corpoDaFuncao):
// `corpoDaFuncao` acha o fim da função pela primeira "}" na MESMA coluna do cabeçalho — e
// `ingestIncomingWhatsapp` desestrutura o parâmetro ({ fromNumber, ... }: IncomingMessage), cujo
// "}" de fechamento também cai na coluna 0, ANTES do corpo de verdade começar. `corpoDaFuncao`
// devolve só a lista de parâmetros, vazia de qualquer coisa que a função faça — e um `verdade`
// sobre esse pedaço vazio falharia por um motivo que nada tem a ver com o que se quer provar. Por
// isso esta função é fatiada à mão, do próprio cabeçalho até o cabeçalho da PRÓXIMA função (que
// não desestrutura nada, e essa sim é segura com corpoDaFuncao — ver o teste seguinte).
function corpoDeIngestIncomingWhatsapp(): string {
  const inicio = whatsappFonte.indexOf("export async function ingestIncomingWhatsapp(");
  const fim = whatsappFonte.indexOf("async function processarMidiaRecebida(", inicio);
  verdade(inicio >= 0 && fim > inicio, "os dois marcadores de fatiamento não foram achados — a função mudou de lugar ou de nome");
  return codigoDe(whatsappFonte.slice(inicio, fim));
}

teste("o upload da mídia recebida nunca pode derrubar o webhook", () => {
  // A REGRA ESTÁ ESCRITA NO TOPO DE lib/atendenteResponde.ts: o webhook nunca pode lançar, porque
  // a Meta/Evolution reenviaria a MESMA mensagem em loop e o cliente receberia a mesma resposta
  // várias vezes. `processarMidiaRecebida` é IO puro (rede + Drive) — sem o `.catch()` aqui, uma
  // falha de download/upload sobe até a rota e derruba o pedido inteiro.
  const ingest = corpoDeIngestIncomingWhatsapp();
  verdade(
    /processarMidiaRecebida\([^)]*\)\s*\.catch\(/.test(ingest),
    "a chamada de processarMidiaRecebida perdeu o .catch() — uma falha de Drive vai derrubar o webhook e causar reenvio em loop",
  );
});

// A partir da revisão que introduziu o orçamento de tempo (lib/orcamentoDoPedido.ts), o download
// deixou de acontecer DENTRO de processarMidiaRecebida — foi extraído pra baixarMidiaDoWhatsapp,
// chamada UMA VEZ SÓ em ingestIncomingWhatsapp (antes, a mídia de áudio era baixada duas vezes:
// uma pro Drive, outra pra transcrição — caro em banda e, principalmente, em TEMPO, que é escasso
// dentro do `maxDuration` da rota). A trava abaixo migrou junto, pro mesmo lugar.
teste("baixarMidiaDoWhatsapp se recusa a chamar a Meta sem o id da mídia", () => {
  const fn = corpoDaFuncao(whatsappFonte, "baixarMidiaDoWhatsapp");
  verdade(fn.length > 0, "baixarMidiaDoWhatsapp não existe mais, ou mudou de assinatura");
  verdade(
    /if\s*\(!midia\.mediaId\)\s*return null;/.test(fn),
    "sem essa trava, baixarMidiaMeta seria chamado com mediaId indefinido — sem id não há mídia nenhuma pra baixar",
  );
  verdade(
    /if\s*\(!config\.baseUrl \|\| !config\.apiKey \|\| !midia\.evolution\)\s*return null;/.test(fn),
    "sem essa trava, baixarMidiaEvolution seria chamado com config incompleto",
  );
});

teste("processarMidiaRecebida não baixa nada — recebe o buffer já pronto, de fora", () => {
  // Rede de segurança contra a REGRESSÃO que motivou a extração: se alguém reintroduzir um
  // download aqui dentro, o áudio volta a ser baixado duas vezes.
  const proc = corpoDaFuncao(whatsappFonte, "processarMidiaRecebida");
  verdade(proc.length > 0, "processarMidiaRecebida não existe mais, ou mudou de assinatura");
  verdade(
    !/await baixarMidia(Meta|Evolution)\(/.test(proc),
    "processarMidiaRecebida voltou a baixar mídia sozinha — o download deveria vir de fora, já pronto",
  );
});

teste("MUTAÇÃO-ALVO: o áudio é baixado UMA VEZ SÓ — o mesmo buffer sobe pro Drive, e a transcrição lê o Drive depois", () => {
  // A transcrição de verdade não roda mais aqui (ver lib/transcricaoAssincrona.ts) — ela lê o
  // áudio do DRIVE depois, fora deste pedido. Então "baixado uma vez só" hoje significa:
  // ingestIncomingWhatsapp chama baixarMidiaDoWhatsapp (Meta/Evolution) EXATAMENTE uma vez, e o
  // resultado do upload (que é o que a transcrição vai reler) sai do MESMO `baixado`.
  const inicio = whatsappFonte.indexOf("export async function ingestIncomingWhatsapp(");
  const fim = whatsappFonte.indexOf("async function processarMidiaRecebida(", inicio);
  verdade(inicio >= 0 && fim > inicio, "os marcadores de fatiamento do ingest não foram achados");
  const ingest = codigoDe(whatsappFonte.slice(inicio, fim));

  verdade(
    (ingest.match(/baixarMidiaDoWhatsapp\(/g) || []).length === 1,
    "ingestIncomingWhatsapp chama baixarMidiaDoWhatsapp mais de uma vez (ou nenhuma) — o download deixou de ser único",
  );
  verdade(
    ingest.includes("processarMidiaRecebida(officeId, attendance.id, attendance.subject, waMessageId, midia, recebidoEm, baixado)"),
    "processarMidiaRecebida parou de receber o `baixado` compartilhado",
  );
  verdade(
    ingest.includes("storageProvider: uploadInfo?.storageProvider ?? null") && ingest.includes("storageFileId: uploadInfo?.storageFileId ?? null"),
    "o registro de transcrição parou de guardar onde o Drive salvou o MESMO arquivo — a transcrição assíncrona não teria de onde ler depois",
  );
});

teste("MUTAÇÃO-ALVO: figurinha grava o rótulo curto e NUNCA entra no bloco de upload de mídia (F-figurinha)", () => {
  // Achado de propósito, ANTES de existir código: se `figurinha` virasse `midia` (ou se o `body`
  // esquecesse o ternário), a figurinha tentaria subir pro Drive como se fosse uma das quatro
  // mídias suportadas — e ninguém pediu isso; o pedido é só um aviso da Ana, sem arquivo nenhum.
  const ingest = corpoDeIngestIncomingWhatsapp();
  verdade(/^\s*figurinha,?\s*$/m.test(ingest), "ingestIncomingWhatsapp parou de receber `figurinha` da desestruturação — o rótulo nunca seria gravado");
  verdade(
    /body:\s*figurinha\s*\?\s*ROTULO_FIGURINHA\s*:/.test(ingest),
    "o `body` da figurinha parou de usar o ternário `figurinha ? ROTULO_FIGURINHA : ...` — o rótulo curto pode ter sumido ou trocado de forma",
  );
});

teste("o pedido de download à Evolution leva a chave INTEIRA da mensagem, não só um pedaço dela", () => {
  // A Evolution identifica a mídia pela chave da mensagem (remoteJid + id) — ver o comentário de
  // baixarMidiaEvolution. Faltando qualquer um dos dois campos, a Evolution não acha a mídia (ou
  // pior, acha a mídia ERRADA, de outra conversa com o mesmo id — remoteJid é o que desambigua).
  const baixar = corpoDaFuncao(evolutionFonte, "baixarMidiaEvolution");
  verdade(baixar.length > 0, "baixarMidiaEvolution não existe mais, ou mudou de assinatura");
  verdade(baixar.includes("id: midia.waMessageId"), "o id da mensagem sumiu do pedido de download");
  verdade(baixar.includes("remoteJid: midia.remoteJid"), "o remoteJid sumiu do pedido de download");
});

// ── DEFEITO DE PRODUÇÃO, visto pelo dono na Central de Alertas ──────────────────────────
// Cada áudio e cada imagem recebidos pelo WhatsApp viravam uma pendência "INCONSISTÊNCIA NO
// DRIVE — o arquivo está solto dentro de Atendimento via WhatsApp, fora de qualquer subpasta de
// tipo de documento", com o conselho "mova para a subpasta do tipo correto — não é possível saber
// automaticamente qual tipo é". O conselho denuncia o defeito: NÃO EXISTE tipo. Mídia de conversa
// não é Petição nem Procuração, e por decisão do dono ela mora na RAIZ da pasta do atendimento.
// Uma conversa com dez áudios virava dez pendências que ninguém pode resolver — e pendência que
// não se resolve ensina a ignorar a Central de Alertas inteira.

teste("o reconhecedor aceita TODO nome que a própria montarNomeArquivoWhatsapp gera", () => {
  // Gerado com a função de verdade, não com strings escritas à mão: é isso que impede o padrão
  // do nome e o reconhecedor de divergirem em silêncio no dia em que alguém mexer num dos dois.
  const casos = [
    { mimeType: "audio/ogg; codecs=opus", nomeOriginal: null },
    { mimeType: "image/jpeg", nomeOriginal: null },
    { mimeType: "video/mp4", nomeOriginal: null },
    { mimeType: "application/pdf", nomeOriginal: "Contrato do cliente.pdf" },
    { mimeType: "application/pdf", nomeOriginal: "acentuação e çedilha — traço.pdf" },
    { mimeType: "image/png", nomeOriginal: "print da conversa.PNG" },
  ];
  for (const c of casos) {
    const nome = montarNomeArquivoWhatsapp({
      mimeType: c.mimeType,
      nomeOriginal: c.nomeOriginal,
      recebidoEm: new Date("2026-09-20T18:30:00Z"),
      waMessageId: "wamid.TESTE123",
    });
    verdade(ehNomeDeMidiaDoWhatsapp(nome), `o reconhecedor recusou um nome que ele mesmo gerou: "${nome}"`);
  }
});

teste("o reconhecedor NÃO aceita documento comum — senão o auditor pararia de acusar de verdade", () => {
  for (const nome of [
    "Petição inicial.pdf",
    "2026_09_20_CONTRATO-abc.pdf",
    "WHATSAPP.pdf",
    "2026_09_20_WHATSAPP_IMG",
    "2026_09_20_WHATSAPP_XYZ-abc.jpg",
    "20260920_WHATSAPP_IMG-abc.jpg",
    "relatorio_WHATSAPP_AUD-x.ogg",
    // O reconhecedor é uma LICENÇA PARA PULAR A AUDITORIA: tudo que ele aceitar por engano deixa
    // de ser conferido no Drive. Por isso as três formas de afrouxaá-lo têm caso próprio — um
    // documento qualquer que só CONTENHA o padrão no meio do nome, um nome sem extensão, e um
    // ano de dois dígitos. Sem estes, dá para tirar a âncora do começo, a exigência de extensão
    // ou o tamanho do ano e a suíte continua verde.
    "copia de 2026_09_20_WHATSAPP_AUD-s2ghu5.ogg",
    "backup 2026_09_20_WHATSAPP_IMG-rxw1tx.jpg",
    "2026_09_20_WHATSAPP_IMG-rxw1tx",
    "26_09_20_WHATSAPP_IMG-rxw1tx.jpg",
    "",
  ]) {
    igual(ehNomeDeMidiaDoWhatsapp(nome), false, `aceitou indevidamente: "${nome}" — `);
  }
});

teste("o auditor do Drive consulta o reconhecedor ANTES de abrir a pendência", () => {
  const fonte = readFileSync("lib/driveSync.ts", "utf8");
  const corpo = codigoDe(corpoDaFuncao(fonte, "processContainerChild"));
  verdade(corpo.length > 300, `corpoDaFuncao devolveu ${corpo.length} caracteres — varredura cega`);
  const posReconhecedor = corpo.indexOf("ehNomeDeMidiaDoWhatsapp(");
  const posPendencia = corpo.indexOf("ARQUIVO_SOLTO_SEM_CATEGORIA");
  verdade(posReconhecedor >= 0, "o auditor deixou de consultar ehNomeDeMidiaDoWhatsapp — a mídia do WhatsApp volta a virar pendência insolúvel");
  verdade(posPendencia >= 0, "não achei ARQUIVO_SOLTO_SEM_CATEGORIA no auditor — a varredura está mirando errado");
  verdade(posReconhecedor < posPendencia, "a consulta ao reconhecedor precisa vir ANTES de a pendência ser aberta");
  // E a saída tem de ser um `return`: só calcular e seguir em frente abriria a pendência do mesmo jeito.
  verdade(/if \(ehNomeDeMidiaDoWhatsapp\(child\.name\)\) return/.test(corpo),
    "o reconhecedor é consultado mas não interrompe a abertura da pendência");
});


void resumo("whatsapp-midia (F5)");
