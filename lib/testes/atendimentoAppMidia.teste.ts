import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { FRASES_DA_MIDIA, LIMITE_DA_MIDIA_BYTES, cabecalhosDaMidia, enderecoDaMidia, idDeMensagemValido, lerFaixa, nomeSeguroParaCabecalho, tamanhoLegivel, tipoLegivel, tipoParaServir } from "@/lib/midiaDoChat";
import { decidirRespostaDaMidia, type AnexoDaMidia, type MensagemDaMidia, type PortasDaMidia, type RespostaDaMidia } from "@/lib/midiaDoChatServico";
import { lerMidia, prepararMensagem } from "@/lib/mensagensDoChat";
import { montarNomeArquivoWhatsapp, restoDoNomeDeMidiaSemNome } from "@/lib/driveNaming";

// ============================================================================
// PR 8 DO APLICATIVO DE ATENDIMENTO: A MÍDIA NO BALÃO. Prova a rota autenticada (recorte 401 / 403 / 404 sem
// vazar, mensagem só da mesma conversa, tipos, limite, Range, cabeçalhos), o vínculo mensagem -> arquivo e as
// travas de código (service worker sem cache, mídia nunca pela URL do Drive, carregar sob toque).
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");

// ── TIPOS: o que sai inline e o que só baixa ───────────────────────────────────────────────────────────

teste("TIPOS: só imagem raster, áudio, vídeo e PDF saem inline; o resto baixa como octet-stream", () => {
  for (const [mime, esperado] of [["image/jpeg", "image/jpeg"], ["image/png", "image/png"], ["audio/ogg; codecs=opus", "audio/ogg"], ["video/mp4", "video/mp4"], ["application/pdf", "application/pdf"], ["IMAGE/WEBP", "image/webp"]] as const) {
    igual(tipoParaServir(mime, "x"), { contentType: esperado, inline: true }, mime);
  }
  for (const perigoso of ["image/svg+xml", "text/html", "application/xhtml+xml", "text/xml", "application/javascript", "application/x-msdownload", "application/zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "font/woff"]) {
    igual(tipoParaServir(perigoso, "arquivo.jpg"), { contentType: "application/octet-stream", inline: false }, `${perigoso} não pode sair inline, nem com nome de .jpg`);
  }
});

teste("TIPOS: o nome só decide quando o Drive não sabe o tipo (octet-stream ou vazio) — e só entre os tipos seguros", () => {
  igual(tipoParaServir("application/octet-stream", "2026_09_29_WHATSAPP_IMG-abc.jpg"), { contentType: "image/jpeg", inline: true });
  igual(tipoParaServir("", "2026_09_29_WHATSAPP_AUD-abc.ogg"), { contentType: "audio/ogg", inline: true });
  igual(tipoParaServir(null, "contrato.pdf"), { contentType: "application/pdf", inline: true });
  igual(tipoParaServir("application/octet-stream", "pagina.html"), { contentType: "application/octet-stream", inline: false });
  igual(tipoParaServir("application/octet-stream", "imagem.svg"), { contentType: "application/octet-stream", inline: false });
  igual(tipoParaServir("application/octet-stream", null), { contentType: "application/octet-stream", inline: false });
});

teste("CABEÇALHOS: cache privado e sem guardar, nosniff, sem sandbox só no PDF, nome sem quebra de linha", () => {
  const h = cabecalhosDaMidia({ contentType: "image/jpeg", inline: true }, 'foto"\r\nSet-Cookie: x=1.jpg', false);
  igual(h["Cache-Control"], "private, no-store");
  igual(h["X-Content-Type-Options"], "nosniff");
  igual(h["Cross-Origin-Resource-Policy"], "same-origin");
  igual(h["Referrer-Policy"], "no-referrer");
  igual(h["Vary"], "Cookie");
  igual(h["Accept-Ranges"], "bytes");
  verdade((h["Content-Security-Policy"] ?? "").includes("sandbox"), "imagem sem sandbox");
  verdade(!/[\r\n]/.test(h["Content-Disposition"]), "quebra de linha no cabeçalho (injeção)");
  verdade(h["Content-Disposition"].startsWith("inline;"), "imagem abre inline");
  const pdf = cabecalhosDaMidia({ contentType: "application/pdf", inline: true }, "a.pdf", false);
  verdade(!("Content-Security-Policy" in pdf), "o leitor de PDF não abre dentro de sandbox");
  verdade(cabecalhosDaMidia({ contentType: "application/pdf", inline: true }, "a.pdf", true)["Content-Disposition"].startsWith("attachment;"), "?baixar=1 força download");
  verdade(cabecalhosDaMidia({ contentType: "application/octet-stream", inline: false }, "a.docx", false)["Content-Disposition"].startsWith("attachment;"), "tipo fora da lista baixa");
  for (const k of Object.keys(h)) verdade(!/^set-cookie$/i.test(k) && !/^access-control-allow-origin$/i.test(k), `cabeçalho ${k} vaza`);
  igual(nomeSeguroParaCabecalho('a/b\\c"d\ne.pdf'), "a_b_c_d_e.pdf");
  igual(nomeSeguroParaCabecalho(""), "arquivo");
});

// ── RANGE ────────────────────────────────────────────────────────────────────────────────────────────────

teste("RANGE: recortes válidos, sufixo, aberto, limitado ao arquivo; inválido dá 416; sem cabeçalho dá o arquivo inteiro", () => {
  igual(lerFaixa(null, 100), null);
  igual(lerFaixa("", 100), null);
  igual(lerFaixa("items=0-5", 100), null, "outra unidade: ignora");
  igual(lerFaixa("bytes=0-0", 100), { inicio: 0, fim: 0 }, "o iPhone pede 0-1 e 0-0 para sondar");
  igual(lerFaixa("bytes=10-19", 100), { inicio: 10, fim: 19 });
  igual(lerFaixa("bytes=90-", 100), { inicio: 90, fim: 99 });
  igual(lerFaixa("bytes=-10", 100), { inicio: 90, fim: 99 });
  igual(lerFaixa("bytes=-1000", 100), { inicio: 0, fim: 99 });
  igual(lerFaixa("bytes=50-5000", 100), { inicio: 50, fim: 99 });
  igual(lerFaixa("bytes=0-1,5-9", 100), { inicio: 0, fim: 1 }, "várias faixas: só a primeira");
  for (const ruim of ["bytes=100-", "bytes=200-300", "bytes=20-10", "bytes=-", "bytes=abc", "bytes=-0", "bytes=1e3-2e3"]) igual(lerFaixa(ruim, 100), "invalida", ruim);
  igual(lerFaixa("bytes=0-1", 0), "invalida", "arquivo vazio");
});

// ── CARTÃO ───────────────────────────────────────────────────────────────────────────────────────────────

teste("CARTÃO: tamanho e tipo em português; sem dado, omite em vez de inventar", () => {
  igual(tamanhoLegivel(800), "800 B");
  igual(tamanhoLegivel(2048), "2 KB");
  igual(tamanhoLegivel(1_258_291), "1,2 MB");
  igual(tamanhoLegivel(15 * 1024 * 1024), "15 MB");
  igual(tamanhoLegivel(null), "");
  igual(tamanhoLegivel(-1), "");
  igual(tamanhoLegivel(Number.NaN), "");
  igual(tipoLegivel("application/pdf", "x"), "PDF");
  igual(tipoLegivel("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x"), "Word");
  igual(tipoLegivel(null, "planilha.xlsx"), "Planilha");
  igual(tipoLegivel(null, "sem-extensao"), "Arquivo");
});

teste("BALÃO: `prepararMensagem` leva tamanho e tipo do arquivo; sem eles, nulos", () => {
  const base = { id: "m1", direction: "IN", porAgente: false, status: "RECEIVED", createdAt: new Date("2026-09-29T15:00:00Z") };
  const comDados = prepararMensagem({ ...base, body: "[documento: contrato.pdf] segue", midiaBytes: 2048, midiaMime: "application/pdf" }, new Date("2026-09-29T16:00:00Z"));
  igual(comDados.midia, { tipo: "documento", rotulo: "Documento", nome: "contrato.pdf", legenda: "segue", bytes: 2048, mime: "application/pdf" });
  igual(prepararMensagem({ ...base, body: "[imagem]" }, new Date()).midia?.bytes, null);
  igual(prepararMensagem({ ...base, body: "oi" }, new Date()).midia, null);
  igual(lerMidia("[figurinha]")?.tipo, "figurinha");
});

teste("ENDEREÇO: só a rota autenticada, com os ids codificados; nada do Drive", () => {
  igual(enderecoDaMidia("c1", "m1"), "/api/atendimento/c1/midia/m1");
  igual(enderecoDaMidia("c1", "m1", { baixar: true }), "/api/atendimento/c1/midia/m1?baixar=1");
  verdade(enderecoDaMidia("a/b", "c?d").includes("a%2Fb") && enderecoDaMidia("a/b", "c?d").includes("c%3Fd"), "ids devem ser codificados");
  verdade(idDeMensagemValido("cmabc123_-XYZ") && !idDeMensagemValido("../x") && !idDeMensagemValido("a b") && !idDeMensagemValido("") && !idDeMensagemValido("x".repeat(65)), "formato do id");
});

// ── A ROTA: portas falsas provam a ORDEM e o recorte ─────────────────────────────────────────────────────

type Espia = { guarda: string[]; mensagem: unknown[]; anexo: unknown[]; baixar: unknown[] };

const MSG_FOTO: MensagemDaMidia = { id: "msg1", direction: "IN", body: "[imagem] olha", waMessageId: "wamid.X", attachmentId: "att1", midiaMime: "image/jpeg", midiaBytes: 4 };
const ANEXO: AnexoDaMidia = { id: "att1", name: "2026_09_29_WHATSAPP_IMG-abc.jpg", driveUrl: "https://drive.google.com/file/d/SEGREDO123/view", storageProvider: "GOOGLE_DRIVE", storageFileId: "SEGREDO123" };

function montar(o: {
  guarda?: { status: 401 | 403 | 404 } | { officeId: string; attendanceId: string };
  mensagem?: MensagemDaMidia | null;
  anexo?: AnexoDaMidia | null;
  baixar?: () => Promise<{ content: Buffer; mimeType: string }>;
} = {}) {
  const espia: Espia = { guarda: [], mensagem: [], anexo: [], baixar: [] };
  const portas: PortasDaMidia = {
    guarda: async (id) => {
      espia.guarda.push(id);
      return o.guarda ?? { officeId: "off1", attendanceId: "att-do-viewer" };
    },
    acharMensagem: async (q) => {
      espia.mensagem.push(q);
      return o.mensagem === undefined ? MSG_FOTO : o.mensagem;
    },
    acharAnexo: async (m, q) => {
      espia.anexo.push({ m: m.id, q });
      return o.anexo === undefined ? ANEXO : o.anexo;
    },
    baixar: async (a, off) => {
      espia.baixar.push({ a: a.id, off });
      return (o.baixar ?? (async () => ({ content: Buffer.from([1, 2, 3, 4]), mimeType: "image/jpeg" })))();
    },
  };
  return { portas, espia };
}

const pedido = (extra: Partial<{ idDaConversa: string; idDaMensagem: string; range: string | null; baixar: boolean }> = {}) => ({ idDaConversa: "conv-alheia", idDaMensagem: "msg1", range: null, baixar: false, ...extra });
const semSegredos = (r: RespostaDaMidia) => {
  const t = JSON.stringify("erro" in r ? r : { status: r.status, headers: r.headers });
  for (const s of ["SEGREDO123", "drive.google", "conv-alheia", "att-do-viewer", "off1", "msg1", "att1", "Bearer", "token"]) verdade(!t.includes(s), `a resposta ${r.status} vaza "${s}": ${t}`);
};

teste("ROTA 401/403/404: a guarda decide ANTES de qualquer consulta, e a frase é a mesma de sempre", async () => {
  for (const status of [401, 403, 404] as const) {
    const { portas, espia } = montar({ guarda: { status } });
    const r = await decidirRespostaDaMidia(pedido(), portas);
    igual(r.status, status);
    verdade(espia.mensagem.length === 0 && espia.anexo.length === 0 && espia.baixar.length === 0, `com ${status}, nada pode ser lido nem baixado`);
    semSegredos(r);
  }
});

teste("ROTA: quem tem acesso a OUTRA conversa recebe o 404 da guarda; e a mensagem é procurada com o atendimento e o escritório DA GUARDA, nunca do pedido", async () => {
  const { portas, espia } = montar();
  await decidirRespostaDaMidia(pedido({ idDaConversa: "conv-que-o-cliente-chutou" }), portas);
  igual(espia.mensagem, [{ id: "msg1", attendanceId: "att-do-viewer", officeId: "off1" }]);
  igual(espia.anexo, [{ m: "msg1", q: { attendanceId: "att-do-viewer", officeId: "off1" } }]);
  igual(espia.baixar, [{ a: "att1", off: "off1" }]);
});

teste("ROTA: mensagem de OUTRA conversa ou de outro escritório = 404, sem tocar no anexo nem no Drive", async () => {
  const { portas, espia } = montar({ mensagem: null });
  const r = await decidirRespostaDaMidia(pedido(), portas);
  igual(r, { status: 404, erro: FRASES_DA_MIDIA.naoEncontrado });
  verdade(espia.anexo.length === 0 && espia.baixar.length === 0, "não pode procurar anexo nem baixar");
  semSegredos(r);
});

teste("ROTA: id de mensagem fora do formato nunca chega ao banco", async () => {
  for (const ruim of ["../../etc", "a b", "", "x".repeat(200), "id;drop"]) {
    const { portas, espia } = montar();
    const r = await decidirRespostaDaMidia(pedido({ idDaMensagem: ruim }), portas);
    igual(r.status, 404, ruim);
    verdade(espia.mensagem.length === 0, `consultou o banco com "${ruim}"`);
  }
});

teste("ROTA: só mídia RECEBIDA e guardada tem arquivo (texto, mensagem nossa e figurinha = 404)", async () => {
  for (const m of [{ ...MSG_FOTO, body: "oi, bom dia" }, { ...MSG_FOTO, direction: "OUT" }, { ...MSG_FOTO, body: "[figurinha]" }]) {
    const { portas, espia } = montar({ mensagem: m });
    const r = await decidirRespostaDaMidia(pedido(), portas);
    igual(r.status, 404);
    verdade(espia.anexo.length === 0 && espia.baixar.length === 0, "não pode ir atrás do arquivo");
  }
});

teste("ROTA: anexo que não existe mais no Drive = 404 com frase de 'indisponível', sem baixar", async () => {
  const { portas, espia } = montar({ anexo: null });
  const r = await decidirRespostaDaMidia(pedido(), portas);
  igual(r, { status: 404, erro: FRASES_DA_MIDIA.indisponivel });
  igual(espia.baixar.length, 0);
});

teste("ROTA: erro do Drive vira 502 com frase fixa — nunca o texto do erro (token, endereço, id)", async () => {
  const { portas } = montar({ baixar: async () => { throw new Error("401 invalid_grant Bearer ya29.SEGREDO token drive.google.com/SEGREDO123"); } });
  const r = await decidirRespostaDaMidia(pedido(), portas);
  igual(r, { status: 502, erro: FRASES_DA_MIDIA.falhaNoDrive });
  semSegredos(r);
});

teste("LIMITE: arquivo acima de 30 MB (declarado ou medido) dá 413 e o declarado nem é baixado", async () => {
  const a = montar({ mensagem: { ...MSG_FOTO, midiaBytes: LIMITE_DA_MIDIA_BYTES + 1 } });
  igual((await decidirRespostaDaMidia(pedido(), a.portas)).status, 413);
  igual(a.espia.baixar.length, 0, "não baixa o que já se sabe grande demais");
  const b = montar({ mensagem: { ...MSG_FOTO, midiaBytes: null }, baixar: async () => ({ content: Buffer.alloc(LIMITE_DA_MIDIA_BYTES + 1), mimeType: "image/jpeg" }) });
  igual((await decidirRespostaDaMidia(pedido(), b.portas)).status, 413);
  const c = montar({ baixar: async () => ({ content: Buffer.alloc(LIMITE_DA_MIDIA_BYTES), mimeType: "image/jpeg" }) });
  igual((await decidirRespostaDaMidia(pedido(), c.portas)).status, 200, "exatamente o limite passa");
});

teste("SUCESSO: 200 com o tipo certo, tamanho, cache privado sem guardar; 206 com Range; 416 fora do arquivo", async () => {
  const { portas } = montar();
  const ok = await decidirRespostaDaMidia(pedido(), portas);
  verdade(ok.status === 200 && "corpo" in ok, "esperava 200");
  if (ok.status === 200) {
    igual(ok.headers["Content-Type"], "image/jpeg");
    igual(ok.headers["Content-Length"], "4");
    igual(ok.headers["Cache-Control"], "private, no-store");
    igual(Array.from(ok.corpo), [1, 2, 3, 4]);
  }
  const parte = await decidirRespostaDaMidia(pedido({ range: "bytes=1-2" }), portas);
  verdade(parte.status === 206 && "corpo" in parte, "esperava 206");
  if (parte.status === 206) {
    igual(Array.from(parte.corpo), [2, 3]);
    igual(parte.headers["Content-Range"], "bytes 1-2/4");
    igual(parte.headers["Content-Length"], "2");
  }
  const fora = await decidirRespostaDaMidia(pedido({ range: "bytes=10-20" }), portas);
  igual(fora.status, 416);
  igual("headers" in fora ? fora.headers?.["Content-Range"] : null, "bytes */4");
});

teste("SUCESSO: SVG ou HTML disfarçado de imagem não sai inline (anexo, octet-stream)", async () => {
  for (const mime of ["image/svg+xml", "text/html"]) {
    const { portas } = montar({ baixar: async () => ({ content: Buffer.from("<svg onload=alert(1)>"), mimeType: mime }), anexo: { ...ANEXO, name: "2026_09_29_WHATSAPP_IMG-abc.svg" }, mensagem: { ...MSG_FOTO, midiaMime: mime } });
    const r = await decidirRespostaDaMidia(pedido(), portas);
    verdade(r.status === 200 && "headers" in r, "esperava 200");
    if (r.status === 200) {
      igual(r.headers["Content-Type"], "application/octet-stream");
      verdade(r.headers["Content-Disposition"].startsWith("attachment;"), "tem de baixar, não abrir");
    }
  }
});

teste("SUCESSO: documento e vídeo também passam pela mesma decisão (PDF inline, Word baixa)", async () => {
  const pdf = montar({ mensagem: { ...MSG_FOTO, body: "[documento: contrato.pdf]" }, baixar: async () => ({ content: Buffer.from("%PDF"), mimeType: "application/pdf" }) });
  const r1 = await decidirRespostaDaMidia(pedido(), pdf.portas);
  if (r1.status === 200) igual(r1.headers["Content-Type"], "application/pdf");
  const doc = montar({ mensagem: { ...MSG_FOTO, body: "[documento: peticao.docx]" }, baixar: async () => ({ content: Buffer.from("PK"), mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }) });
  const r2 = await decidirRespostaDaMidia(pedido(), doc.portas);
  if (r2.status === 200) {
    igual(r2.headers["Content-Type"], "application/octet-stream");
    verdade(r2.headers["Content-Disposition"].includes("peticao.docx"), "o nome vem do rótulo");
  }
});

// ── VÍNCULO MENSAGEM -> ARQUIVO ──────────────────────────────────────────────────────────────────────────

teste("VÍNCULO: o nome do arquivo sem nome original termina em `-<hash da mensagem>.<ext>`, o padrão que a busca usa", () => {
  for (const wa of ["wamid.HBgLNTU2MjM", "ABGGFlA5Fpa", "3EB0C767D26A1B2F4E5D"]) {
    const nome = montarNomeArquivoWhatsapp({ recebidoEm: new Date("2026-09-29T15:00:00Z"), mimeType: "image/jpeg", waMessageId: wa, nomeOriginal: null });
    verdade(nome.includes(`-${restoDoNomeDeMidiaSemNome(wa)}.`), `${nome} não contém o resto esperado`);
  }
});

teste("INGEST: a mídia nova grava attachmentId, tipo e tamanho na mensagem; o schema tem as três colunas", () => {
  const w = codigoDe(le("lib/whatsapp.ts"));
  verdade(/whatsappMessage\s*\n?\s*\.update\(\{ where: \{ id: novaMensagem\.id \}, data: \{ attachmentId: uploadInfo\.attachmentId/.test(w), "o ingest não liga a mensagem ao anexo");
  verdade(w.includes("midiaBytes: uploadInfo.bytes") && w.includes("midiaMime"), "sem tamanho e tipo");
  const s = le("prisma/schema.prisma");
  const modelo = s.slice(s.indexOf("model WhatsappMessage {"), s.indexOf("model PedidoDeEnvioWhatsapp"));
  verdade(/attachmentId String\?/.test(modelo) && /midiaMime\s+String\?/.test(modelo) && /midiaBytes\s+Int\?/.test(modelo), "faltam colunas (opcionais: mudança aditiva)");
});

// ── TRAVAS DE CÓDIGO ─────────────────────────────────────────────────────────────────────────────────────

teste("ROTA (código): guarda atendimentoDaRota primeiro, sem prisma direto, sem endereço do Drive na resposta, sem cache público", () => {
  const r = codigoDe(le("app/api/atendimento/[id]/midia/[mensagemId]/route.ts"));
  verdade(r.includes("atendimentoDaRota(id)") && r.includes("decidirRespostaDaMidia"), "a rota não usa a guarda e a decisão");
  verdade(!/prisma/.test(r), "a rota não pode consultar o banco por conta própria (o recorte mora na decisão)");
  verdade(!/driveUrl|webViewLink|Location/.test(r), "a rota não pode redirecionar nem expor o endereço do Drive");
  verdade(!/public|max-age|s-maxage|immutable/.test(r.replace(/\bpublic\b(?=[^\n]*\/\/)/g, "")), "cache público na rota de mídia");
  verdade(/private, no-store/.test(r), "o erro também não pode ser guardado");
  const d = codigoDe(le("lib/midiaDoChatServico.ts"));
  verdade(d.indexOf("portas.guarda(") < d.indexOf("portas.acharMensagem(") && d.indexOf("portas.acharMensagem(") < d.indexOf("portas.acharAnexo(") && d.indexOf("portas.acharAnexo(") < d.indexOf("portas.baixar("), "a ordem guarda -> mensagem -> anexo -> download mudou");
});

teste("BANCO (código): toda consulta da mídia leva attendanceId E officeId no WHERE (segundo cinto)", () => {
  const c = codigoDe(le("lib/midiaDoChatDb.ts"));
  const chamadas = c.split(/prisma\.(?=whatsappMessage\.|attachment\.)/).slice(1).map((t) => t.slice(0, t.indexOf("});") + 3));
  verdade(chamadas.length === 3, `esperava 3 consultas, achei ${chamadas.length}`);
  for (const q of chamadas) verdade(/where:[^\n]*attendanceId/.test(q) && /where:[^\n]*officeId/.test(q), `consulta sem o recorte: ${q.slice(0, 160)}`);
  verdade(/achados\.length === 1/.test(c), "dois arquivos com o mesmo hash não podem servir um deles");
});

teste("SERVICE WORKER: o do Atendimento não guarda mídia nem responde por conta própria", () => {
  const sw = codigoDe(le("public/sw-atendimento.js"));
  verdade(!/\bcaches\b|cache\.put|cache\.add|CacheStorage|respondWith/.test(sw), "o SW guarda ou intercepta conteúdo");
  const c = codigoDe(le("lib/midiaDoChat.ts"));
  verdade(c.includes('"Cache-Control": "private, no-store"'), "cabeçalho de cache da mídia");
});

teste("BALÃO (código): nada baixa sozinho além da miniatura; áudio preload none; vídeo e documento sob toque; alt e aria; nada do Drive", () => {
  const c = codigoDe(le("components/atendimento-app/MidiaDaBolha.tsx"));
  verdade(/<audio[^>]*preload="none"/.test(c), "áudio precisa de preload=none");
  verdade(/videoPedido/.test(c) && /videoPedido \? \(/.test(c), "o vídeo só é montado depois do toque");
  verdade(!/<video[^>]*autoPlay[^>]*>[\s\S]*?videoPedido/.test(c), "o vídeo não pode existir antes do toque");
  verdade(/loading="lazy"/.test(c) && /alt=\{`Imagem enviada pelo cliente/.test(c), "imagem: lazy e alt");
  verdade(/aria-label=\{`Ampliar imagem/.test(c) && /role="dialog"/.test(c) && /aria-modal="true"/.test(c) && /Escape/.test(c), "ampliar: botão nomeado, diálogo e Esc");
  verdade(/role="alert"/.test(c) && /role="status"/.test(c) && /Tentar de novo/.test(c), "estados de erro e carregando com texto");
  verdade(/rel="noopener noreferrer"/.test(c) && /target="_blank"/.test(c), "documento abre em outra aba com noopener");
  verdade(!/drive\.google|driveUrl|webViewLink|storageFileId/.test(c), "o balão não pode conhecer o endereço do Drive");
  verdade(!/#[0-9a-fA-F]{3,8}\b/.test(c) && !/\bshadow-/.test(c), "hex cru ou sombra");
  verdade(!/border-l-|border-r-/.test(c), "faixa lateral colorida");
  const b = codigoDe(le("components/atendimento-app/BolhaDaMensagem.tsx"));
  verdade(b.includes("<MidiaDaBolha") && b.includes("recebida={!saiu}"), "a bolha não usa o componente de mídia");
});

resumo("Atendimento app, PR 8 — mídia no balão");
