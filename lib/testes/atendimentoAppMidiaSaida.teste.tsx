import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { renderToStaticMarkup } from "react-dom/server";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  ACCEPT_DA_CAMERA_DE_SAIDA, EXTENSOES_BARRADAS, LIMITE_DA_LEGENDA, LIMITE_DA_PLATAFORMA_BYTES, LIMITE_POR_TIPO, acceptDaGaleria, acceptDoDocumento, caminhoDoTemporario, classificarArquivoDeSaida,
  extensoesDoProvedor, nomeSeguroDoArquivo, prefixoDoTemporario, temporarioEDesta, validarCaminhoDoTemporario, validarLegenda, validarPedidoDeMidia,
} from "@/lib/midiaDeSaida";
import { conferirConteudo, detectarFamiliaDeConteudo, pareceExecutavelOuPagina } from "@/lib/midiaDeSaidaConteudo";
import { enviarMidia, FalhaDaEvolution, type MidiaParaEnviar } from "@/lib/whatsappEvolution";
import { corpoDaMensagemDeMidia, enviarMidiaPelaMeta } from "@/lib/whatsappMidiaMeta";
import { processarPedidoDeMidia, type PortasDoPedidoDeMidia } from "@/lib/midiaDeSaidaServico";
import { decidirSobreOPedido, resultadoDoPedido } from "@/lib/envioDeMensagem";
import { hashDoPedidoDeMidia, MAX_MIDIAS_POR_MINUTO, PREFIXO_DO_HASH_DE_MIDIA } from "@/lib/envioDeMidiaDb";
import { novoPendente, pendenteComoMensagem, restaurarPendentes } from "@/lib/filaDoChat";
import { LIMITE_DO_ANEXO_BYTES } from "@/lib/anexoDoCelular";
import MidiaDaBolha from "@/components/atendimento-app/MidiaDaBolha";
import AnexarMidia from "@/components/atendimento-app/AnexarMidia";
import PreviaDaMidia from "@/components/atendimento-app/PreviaDaMidia";

// ============================================================================
// R3 — MÍDIA DE SAÍDA PELO CELULAR (PR 14). Prova: a lista fechada por provedor e os limites (tela E servidor), a conferência do
// conteúdo (nome de imagem que é programa), o caminho temporário amarrado à conversa, os dois provedores contra servidores falsos em
// 127.0.0.1 (nunca o WhatsApp real), a ORDEM da rota (guarda antes do corpo), a idempotência (a tabela de decisão com o hash do
// arquivo), a fila do aparelho, o balão e o compositor. A prova com BANCO de verdade (6 pedidos simultâneos = 1 envio, falha,
// incerto, janela) está em scripts/provaMidiaDeSaidaComBanco.ts (precisa de Postgres local; não roda aqui).
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const bytes = (...b: number[]) => Uint8Array.from(b);
const ascii = (s: string) => Uint8Array.from(Buffer.from(s, "latin1"));
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d);
const WEBP = Uint8Array.from([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBPVP8 ")]);
const MP4 = Uint8Array.from([0, 0, 0, 0x18, ...ascii("ftypisom"), 0, 0, 2, 0]);
const M4A = Uint8Array.from([0, 0, 0, 0x18, ...ascii("ftypM4A "), 0, 0, 0, 0]);
const PDF = ascii("%PDF-1.7\n1 0 obj");
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 20, 0);
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const OGG = ascii("OggS\u0000\u0002");
const MP3 = ascii("ID3\u0004\u0000");
const EXE = ascii("MZ\u0090\u0000\u0003");
const HTML = ascii("<!DOCTYPE html><html><script>alert(1)</script>");
const SVG = ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const TXT = ascii("Bom dia, segue o resumo.\n");

const f = (name: string, size = 1000, type = "") => ({ name, size, type });
const ok = (nome: string, prov: "META" | "EVOLUTION" | null, size = 1000, type = "") => classificarArquivoDeSaida(f(nome, size, type), prov);

// ── A LISTA FECHADA POR PROVEDOR ─────────────────────────────────────────────────────────────────────

teste("LISTA (Meta): imagem jpeg/png, vídeo mp4/3gp, áudio aac/m4a/mp3/amr/ogg, documento pdf/Office/txt; webp e zip NÃO", () => {
  for (const [nome, tipo] of [["a.jpg", "imagem"], ["A.JPEG", "imagem"], ["a.png", "imagem"], ["v.mp4", "video"], ["v.3gp", "video"], ["a.aac", "audio"], ["a.m4a", "audio"], ["a.mp3", "audio"], ["a.amr", "audio"], ["a.ogg", "audio"], ["a.opus", "audio"], ["d.pdf", "documento"], ["d.doc", "documento"], ["d.docx", "documento"], ["d.xls", "documento"], ["d.xlsx", "documento"], ["d.ppt", "documento"], ["d.pptx", "documento"], ["d.txt", "documento"]] as const) {
    const c = ok(nome, "META");
    verdade(c.ok && c.tipo === tipo, `${nome} deveria ser ${tipo}: ${JSON.stringify(c)}`);
  }
  for (const nome of ["a.webp", "d.zip", "d.csv", "a.wav", "v.mov", "v.webm", "a.heic", "d.rtf", "d.odt"]) verdade(!ok(nome, "META").ok, `${nome} não é aceito pela Meta`);
});

teste("LISTA (Evolution): aceita webp, zip e csv além do que a Meta aceita; vídeo só mp4", () => {
  for (const nome of ["a.webp", "d.zip", "d.csv", "a.jpg", "v.mp4", "d.pdf", "a.mp3", "a.m4a", "a.ogg", "a.aac"]) verdade(ok(nome, "EVOLUTION").ok, `${nome} é aceito pela Evolution`);
  for (const nome of ["v.mov", "v.webm", "v.3gp", "a.amr", "a.wav", "a.heic", "d.rtf"]) verdade(!ok(nome, "EVOLUTION").ok, `${nome} não é aceito`);
  const meta = Object.keys(extensoesDoProvedor("META"));
  const evo = Object.keys(extensoesDoProvedor("EVOLUTION"));
  verdade(!meta.includes("webp") && !meta.includes("zip") && evo.includes("webp") && evo.includes("zip"), "listas diferentes");
  igual(Object.keys(extensoesDoProvedor(null)).sort(), meta.sort(), "sem provedor conhecido vale a lista mais restrita");
});

teste("BARRADOS: programa, script, página, SVG e XML por QUALQUER segmento do nome, mesmo com extensão boa no fim", () => {
  for (const ruim of ["setup.exe", "run.bat", "x.cmd", "app.msi", "s.sh", "p.ps1", "a.vbs", "s.js", "i.html", "i.htm", "i.svg", "n.xml", "m.docm", "x.jar", "a.apk", "a.lnk", "a.dll", "a.php", "a.py", "relatorio.exe.pdf", "foto.html.jpg", "foto.svg.png", "arquivo.js.txt", "x.EXE", "x.Html"]) {
    for (const prov of ["META", "EVOLUTION"] as const) {
      const c = ok(ruim, prov);
      verdade(!c.ok && c.codigo === "TIPO_NAO_PERMITIDO", `${ruim} (${prov}) tem de ser barrado`);
    }
  }
  verdade(EXTENSOES_BARRADAS.includes("exe") && EXTENSOES_BARRADAS.includes("svg") && EXTENSOES_BARRADAS.includes("html"), "lista barrada");
  // Nenhuma extensão barrada pode estar na lista de aceitas de nenhum provedor.
  for (const e of EXTENSOES_BARRADAS) verdade(!(e in extensoesDoProvedor("META")) && !(e in extensoesDoProvedor("EVOLUTION")), `${e} está nas duas listas`);
});

teste("TIPO DECLARADO pelo navegador: html, svg, xml e executável barrados; tipo que contradiz a extensão barrado; octet-stream e vazio passam", () => {
  for (const t of ["text/html", "image/svg+xml", "application/xml", "text/javascript", "application/x-msdownload", "application/x-sh", "application/java-archive"]) {
    const c = ok("arquivo.pdf", "META", 100, t);
    verdade(!c.ok, `type ${t} tem de ser barrado`);
  }
  verdade(!ok("foto.png", "META", 100, "application/pdf").ok, "foto.png declarada como pdf");
  verdade(!ok("doc.pdf", "META", 100, "image/png").ok, "doc.pdf declarado como imagem");
  verdade(!ok("musica.mp3", "META", 100, "video/mp4").ok, "áudio declarado como vídeo");
  verdade(ok("foto.jpg", "META", 100, "image/jpeg").ok && ok("doc.pdf", "META", 100, "application/pdf").ok && ok("doc.pdf", "META", 100, "application/octet-stream").ok && ok("doc.pdf", "META", 100, "").ok, "declarados coerentes passam");
  verdade(ok("a.ogg", "META", 100, "video/ogg").ok && ok("a.m4a", "META", 100, "audio/x-m4a").ok, "ogg e m4a com tipo de aparelho");
});

teste("TAMANHO por tipo: imagem 5 MB, vídeo e áudio 16 MB, documento 25 MB (teto do upload da plataforma); mensagem clara acima", () => {
  const MB = 1024 * 1024;
  igual(LIMITE_POR_TIPO, { imagem: 5 * MB, video: 16 * MB, audio: 16 * MB, documento: 25 * MB });
  igual(LIMITE_DA_PLATAFORMA_BYTES, LIMITE_DO_ANEXO_BYTES);
  verdade(ok("a.jpg", "META", 5 * MB).ok && !ok("a.jpg", "META", 5 * MB + 1).ok, "imagem");
  verdade(ok("v.mp4", "META", 16 * MB).ok && !ok("v.mp4", "META", 16 * MB + 1).ok, "vídeo");
  verdade(ok("a.mp3", "META", 16 * MB).ok && !ok("a.mp3", "META", 16 * MB + 1).ok, "áudio");
  verdade(ok("d.pdf", "META", 25 * MB).ok && !ok("d.pdf", "META", 25 * MB + 1).ok, "documento");
  const c = ok("v.mp4", "META", 20 * MB);
  verdade(!c.ok && c.codigo === "GRANDE_DEMAIS" && c.erro.includes("Este vídeo tem 20 MB") && c.erro.includes("16 MB") && /comprima/i.test(c.erro), `frase clara: ${JSON.stringify(c)}`);
  const rente = ok("a.jpg", "META", 5 * MB + 20);
  verdade(!rente.ok && rente.erro.startsWith("Esta imagem é um pouco maior que o limite de 5 MB"), `frase quando o arredondamento empata: ${JSON.stringify(rente)}`);
  verdade(!ok("d.pdf", "META", 0).ok && !ok("d.pdf", "META", Number.NaN).ok && !ok("d.pdf", "META", -5).ok, "vazio, NaN e negativo");
});

teste("NOME: sem caminho, sem controle, sem aspas nem colchetes (quebrariam o rótulo), 100 caracteres COM a extensão; câmera sem nome ganha extensão pelo tipo", () => {
  igual(nomeSeguroDoArquivo("C:\\Users\\x\\contrato final.pdf"), "contrato final.pdf");
  igual(nomeSeguroDoArquivo("../../etc/passwd.txt"), "passwd.txt");
  igual(nomeSeguroDoArquivo('a"b[c]d.pdf'), "abcd.pdf");
  igual(nomeSeguroDoArquivo("a\u0000\u202eb\r\n.pdf"), "ab.pdf");
  igual(nomeSeguroDoArquivo("...oculto.pdf"), "oculto.pdf");
  const longo = nomeSeguroDoArquivo(`${"x".repeat(300)}.pdf`);
  verdade(longo.length <= 100 && longo.endsWith(".pdf"), longo);
  const c = ok("", "META", 1000, "image/jpeg");
  verdade(c.ok && c.nome === "arquivo.jpg" && c.tipo === "imagem", JSON.stringify(c));
  const semTipo = ok("", "META", 1000, "");
  verdade(!semTipo.ok, "sem nome e sem tipo não dá para saber");
  const c2 = ok("IMG_001", "META", 1000, "image/png");
  verdade(c2.ok && c2.nome === "IMG_001.png", JSON.stringify(c2));
});

teste("LEGENDA: até 1024 caracteres, só em imagem/vídeo/documento; áudio recusa legenda; espaços cortados", () => {
  igual(validarLegenda("  oi  ", "imagem"), { ok: true, legenda: "oi" });
  igual(validarLegenda(undefined, "audio"), { ok: true, legenda: "" });
  igual(validarLegenda("   ", "audio"), { ok: true, legenda: "" });
  verdade(!validarLegenda("oi", "audio").ok, "áudio não aceita legenda");
  verdade(validarLegenda("x".repeat(LIMITE_DA_LEGENDA), "documento").ok && !validarLegenda("x".repeat(LIMITE_DA_LEGENDA + 1), "documento").ok, "limite");
  verdade(!validarLegenda(42, "imagem").ok, "não é texto");
});

teste("ACCEPT dos seletores: a Meta não oferece webp nem zip; a Evolution oferece; câmera só image/*", () => {
  verdade(!acceptDaGaleria("META").includes("webp") && acceptDaGaleria("EVOLUTION").includes("image/webp"), "galeria");
  verdade(acceptDaGaleria("META").includes("image/jpeg") && acceptDaGaleria("META").includes("video/mp4") && !acceptDaGaleria("META").includes("html") && !acceptDaGaleria("META").includes("svg"), "galeria Meta");
  verdade(acceptDoDocumento("EVOLUTION").includes(".zip") && !acceptDoDocumento("META").includes(".zip") && acceptDoDocumento("META").includes(".pdf") && acceptDoDocumento("META").includes(".mp3"), "documento e áudio");
  igual(ACCEPT_DA_CAMERA_DE_SAIDA, "image/*");
});

// ── O CONTEÚDO (o servidor não confia em nome nem em tipo declarado) ─────────────────────────────────────

teste("CONTEÚDO: assinaturas reconhecidas; o que não bate com a extensão é recusado", () => {
  igual(detectarFamiliaDeConteudo(JPEG), "jpeg");
  igual(detectarFamiliaDeConteudo(PNG), "png");
  igual(detectarFamiliaDeConteudo(WEBP), "webp");
  igual(detectarFamiliaDeConteudo(MP4), "mp4");
  igual(detectarFamiliaDeConteudo(M4A), "m4a");
  igual(detectarFamiliaDeConteudo(PDF), "pdf");
  igual(detectarFamiliaDeConteudo(ZIP), "zip");
  igual(detectarFamiliaDeConteudo(OLE), "ole");
  igual(detectarFamiliaDeConteudo(OGG), "ogg");
  igual(detectarFamiliaDeConteudo(MP3), "mp3");
  igual(detectarFamiliaDeConteudo(bytes(0xff, 0xfb, 0x90, 0)), "mp3");
  igual(detectarFamiliaDeConteudo(bytes(0xff, 0xf1, 0x50, 0)), "aac");
  igual(detectarFamiliaDeConteudo(ascii("#!AMR\n")), "amr");
  igual(detectarFamiliaDeConteudo(TXT), "texto");
  igual(detectarFamiliaDeConteudo(bytes(1, 2, 0, 3)), null);
  const jpg = ok("foto.jpg", "META");
  verdade(jpg.ok && conferirConteudo(JPEG, jpg.familias).ok, "jpeg de verdade");
  verdade(jpg.ok && !conferirConteudo(PNG, jpg.familias).ok, "png com nome de jpg");
  verdade(jpg.ok && !conferirConteudo(PDF, jpg.familias).ok, "pdf com nome de jpg");
  const docx = ok("a.docx", "META");
  verdade(docx.ok && conferirConteudo(ZIP, docx.familias).ok && !conferirConteudo(OLE, docx.familias).ok, "docx é zip; doc é ole");
  const doc = ok("a.doc", "META");
  verdade(doc.ok && conferirConteudo(OLE, doc.familias).ok, "doc é ole");
  const mp4 = ok("v.mp4", "META");
  verdade(mp4.ok && conferirConteudo(MP4, mp4.familias).ok && !conferirConteudo(M4A, mp4.familias).ok, "mp4 não é m4a");
  const m4a = ok("a.m4a", "META");
  verdade(m4a.ok && conferirConteudo(M4A, m4a.familias).ok && conferirConteudo(MP4, m4a.familias).ok, "m4a aceita a marca de áudio e o contêiner mp4");
});

teste("CONTEÚDO: programa, script, página e SVG com NOME de imagem/documento são recusados, para qualquer extensão", () => {
  const cenarios: [string, Uint8Array][] = [["foto.jpg", EXE], ["foto.png", EXE], ["doc.pdf", EXE], ["nota.txt", EXE], ["foto.jpg", HTML], ["nota.txt", HTML], ["foto.png", SVG], ["doc.txt", SVG], ["script.txt", ascii("#!/bin/sh\nrm -rf /\n")], ["x.txt", ascii("  \n<?xml version='1.0'?><a/>")], ["x.txt", Uint8Array.from([0xef, 0xbb, 0xbf, ...ascii("<html>")])], ["x.pdf", Uint8Array.from([0x7f, ...ascii("ELF")])]];
  for (const [nome, corpo] of cenarios) {
    for (const prov of ["META", "EVOLUTION"] as const) {
      const c = ok(nome, prov);
      verdade(c.ok, `${nome} passa pelo nome`);
      if (c.ok) verdade(!conferirConteudo(corpo, c.familias).ok, `${nome} com conteúdo perigoso (${prov}) tem de ser recusado`);
    }
  }
  verdade(pareceExecutavelOuPagina(TXT) === null && pareceExecutavelOuPagina(JPEG) === null && pareceExecutavelOuPagina(PDF) === null && pareceExecutavelOuPagina(ascii("#!AMR\n")) === null, "arquivos normais não são falso positivo");
  verdade(pareceExecutavelOuPagina(ascii(`${"texto normal de uma carta. ".repeat(60)}<html>`)) === null, "só o começo do arquivo conta (texto com a palavra depois do primeiro KB não é falso positivo)");
});

// ── O CAMINHO TEMPORÁRIO NO BLOB ─────────────────────────────────────────────────────────────────────────

teste("TEMPORÁRIO: só o endereço do Blob desta conversa e desta chave vale; outra conversa, outra chave, outro host e '..' não", () => {
  const conv = "cmconversa1";
  const chave = "chave-de-teste-01";
  const boa = `https://abc123.public.blob.vercel-storage.com/${caminhoDoTemporario(conv, chave, "foto.jpg")}-Xy9kQ2.jpg`;
  verdade(temporarioEDesta(boa, conv, chave), boa);
  verdade(!temporarioEDesta(boa, "cmoutraconv", chave), "outra conversa");
  verdade(!temporarioEDesta(boa, conv, "outra-chave-0002"), "outra chave");
  verdade(!temporarioEDesta(`https://abc.public.blob.vercel-storage.com/outro/${conv}/${chave}/x.jpg`, conv, chave), "outro prefixo");
  verdade(!temporarioEDesta(`https://abc.public.blob.vercel-storage.com/atd-saida/${conv}/${chave}/../../x.jpg`, conv, chave), "sobe de diretório");
  verdade(!temporarioEDesta(`https://abc.public.blob.vercel-storage.com/atd-saida/${conv}/${chave}/%2e%2e/x.jpg`, conv, chave), "sobe de diretório codificado");
  verdade(!temporarioEDesta("não é url", conv, chave), "lixo");
  verdade(!temporarioEDesta(boa, conv, "curta"), "chave fora do formato");
  verdade(!temporarioEDesta(boa, "a/b", chave), "id de conversa fora do formato");
  igual(prefixoDoTemporario(conv, chave), `atd-saida/${conv}/${chave}/`);
});

teste("TOKEN do Blob: só o caminho amarrado a ESTA conversa, sem subpasta, com nome limpo e extensão da lista do provedor", () => {
  const conv = "cmconversa1";
  const chave = "chave-de-teste-01";
  verdade(validarCaminhoDoTemporario(caminhoDoTemporario(conv, chave, "foto.jpg"), conv, "META").ok, "caminho bom");
  verdade(!validarCaminhoDoTemporario(caminhoDoTemporario("cmoutra", chave, "foto.jpg"), conv, "META").ok, "outra conversa");
  verdade(!validarCaminhoDoTemporario(`atd-saida/${conv}/${chave}/sub/foto.jpg`, conv, "META").ok, "subpasta");
  verdade(!validarCaminhoDoTemporario(`atd-saida/${conv}/${chave}/setup.exe`, conv, "META").ok, "exe");
  verdade(!validarCaminhoDoTemporario(`atd-saida/${conv}/${chave}/pagina.html`, conv, "EVOLUTION").ok, "html");
  verdade(!validarCaminhoDoTemporario(`atd-saida/${conv}/${chave}/foto.webp`, conv, "META").ok && validarCaminhoDoTemporario(`atd-saida/${conv}/${chave}/foto.webp`, conv, "EVOLUTION").ok, "webp só na Evolution");
  verdade(!validarCaminhoDoTemporario(`atd-saida/${conv}/${chave}/a"b.pdf`, conv, "META").ok, "nome com aspas");
  verdade(!validarCaminhoDoTemporario("qualquer/coisa.pdf", conv, "META").ok && !validarCaminhoDoTemporario("", conv, "META").ok, "fora do prefixo");
  const token = codigoDe(le("app/api/atendimento/[id]/midia-saida/token/route.ts"));
  verdade(token.includes('corpo.type !== "blob.generate-client-token"'), "só o pedido de token; o retorno de 'upload concluído' não passa por aqui");
  verdade(token.includes("maximumSizeInBytes: LIMITE_DA_PLATAFORMA_BYTES") && token.includes("addRandomSuffix: true") && token.includes("validUntil"), "teto, sufixo aleatório e validade curta");
});

teste("PEDIDO: corpo do envio validado (chave, endereço, nome, legenda); nada de campo a mais decide algo", () => {
  const bom = { clientMessageId: "chave-de-teste-01", blobUrl: "https://x.public.blob.vercel-storage.com/a", nome: "foto.jpg", legenda: "oi", confirmouReenvio: true };
  const v = validarPedidoDeMidia(bom);
  verdade(v.ok && v.pedido.confirmouReenvio === true && v.pedido.legenda === "oi", JSON.stringify(v));
  verdade(!validarPedidoDeMidia({ ...bom, clientMessageId: "x" }).ok && !validarPedidoDeMidia({ ...bom, blobUrl: 3 }).ok && !validarPedidoDeMidia({ ...bom, nome: "" }).ok && !validarPedidoDeMidia({ ...bom, legenda: 5 }).ok && !validarPedidoDeMidia(null).ok && !validarPedidoDeMidia("x").ok, "inválidos");
  const so = validarPedidoDeMidia({ clientMessageId: "chave-de-teste-01", blobUrl: "u", nome: "a.pdf", officeId: "OUTRO", userId: "OUTRO", attendanceId: "OUTRA" });
  verdade(so.ok && !("officeId" in so.pedido) && !("attendanceId" in so.pedido) && !("userId" in so.pedido), "escritório, usuário e conversa nunca vêm do corpo");
  verdade(validarPedidoDeMidia({ ...bom, confirmouReenvio: "sim" }).ok && (validarPedidoDeMidia({ ...bom, confirmouReenvio: "sim" }) as { pedido: { confirmouReenvio: boolean } }).pedido.confirmouReenvio === false, "só o booleano true confirma");
});

// ── OS PROVEDORES, CONTRA SERVIDORES FALSOS EM 127.0.0.1 ─────────────────────────────────────────────────

type Pedido = { metodo: string; caminho: string; cabecalhos: IncomingMessage["headers"]; corpo: Buffer };
async function servidor(tratar: (p: Pedido, res: ServerResponse) => void): Promise<{ url: string; pedidos: Pedido[]; fechar: () => Promise<void> }> {
  const pedidos: Pedido[] = [];
  const srv: Server = createServer((req, res) => {
    const partes: Buffer[] = [];
    req.on("data", (d) => partes.push(d));
    req.on("end", () => {
      const p = { metodo: req.method || "", caminho: req.url || "", cabecalhos: req.headers, corpo: Buffer.concat(partes) };
      pedidos.push(p);
      tratar(p, res);
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, pedidos, fechar: () => new Promise((r) => { srv.closeAllConnections?.(); srv.close(() => r()); }) };
}
const json = (res: ServerResponse, status: number, corpo: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(corpo));
};
const midiaDe = (tipo: MidiaParaEnviar["tipo"], nome: string, mime: string, legenda = "", buffer = Buffer.from(JPEG)): MidiaParaEnviar => ({ tipo, nome, mime, legenda, buffer });

teste("EVOLUTION: imagem, vídeo e documento vão em /message/sendMedia/{instância} (base64, mediatype, mimetype, caption, fileName); áudio em /sendWhatsAppAudio; chave no cabeçalho", async () => {
  const s = await servidor((_p, res) => json(res, 201, { key: { id: "3EB0ABCDEF" } }));
  try {
    const cfg = { baseUrl: `${s.url}/`, apiKey: "CHAVE-DE-TESTE", instancia: "inst 1" };
    const foto = midiaDe("imagem", "foto.jpg", "image/jpeg", "Segue a foto");
    igual(await enviarMidia(cfg, "+55 (62) 98128-3481", foto), "3EB0ABCDEF");
    const doc = midiaDe("documento", "contrato.pdf", "application/pdf", "", Buffer.from(PDF));
    await enviarMidia(cfg, "5562981283481", doc);
    await enviarMidia(cfg, "5562981283481", midiaDe("video", "v.mp4", "video/mp4", "olha", Buffer.from(MP4)));
    await enviarMidia(cfg, "5562981283481", midiaDe("audio", "a.mp3", "audio/mpeg", "", Buffer.from(MP3)));
    const [a, b, c, d] = s.pedidos;
    igual([a.metodo, a.caminho], ["POST", "/message/sendMedia/inst%201"]);
    igual(a.cabecalhos.apikey, "CHAVE-DE-TESTE");
    igual(JSON.parse(a.corpo.toString()), { number: "5562981283481", mediatype: "image", mimetype: "image/jpeg", caption: "Segue a foto", fileName: "foto.jpg", media: Buffer.from(JPEG).toString("base64") });
    const corpoB = JSON.parse(b.corpo.toString());
    igual([corpoB.mediatype, corpoB.fileName, corpoB.mimetype, "caption" in corpoB], ["document", "contrato.pdf", "application/pdf", false], "documento sem legenda não manda caption");
    igual(JSON.parse(c.corpo.toString()).mediatype, "video");
    igual(d.caminho, "/message/sendWhatsAppAudio/inst%201");
    igual(JSON.parse(d.corpo.toString()), { number: "5562981283481", audio: Buffer.from(MP3).toString("base64"), encoding: true });
    verdade(!JSON.stringify(s.pedidos.map((p) => p.caminho)).includes("CHAVE"), "a chave nunca vai na URL");
  } finally {
    await s.fechar();
  }
});

teste("EVOLUTION: recusa com resposta (HTTP 400) NÃO é incerta; conexão derrubada SEM resposta É incerta; chave recusada tem frase própria", async () => {
  const recusa = await servidor((_p, res) => json(res, 400, { response: { message: ["media invalida"] } }));
  try {
    const cfg = { baseUrl: recusa.url, apiKey: "k", instancia: "i" };
    try {
      await enviarMidia(cfg, "5562981283481", midiaDe("imagem", "a.jpg", "image/jpeg"));
      verdade(false, "deveria lançar");
    } catch (e) {
      verdade(e instanceof FalhaDaEvolution && e.incerta === false && e.motivo.includes("media invalida"), String(e));
    }
  } finally {
    await recusa.fechar();
  }
  const queda = await servidor((p, res) => { res.socket?.destroy(); void p; });
  try {
    try {
      await enviarMidia({ baseUrl: queda.url, apiKey: "k", instancia: "i" }, "5562981283481", midiaDe("documento", "a.pdf", "application/pdf"));
      verdade(false, "deveria lançar");
    } catch (e) {
      verdade(e instanceof FalhaDaEvolution && e.incerta === true, `sem resposta = incerta: ${String(e)}`);
    }
  } finally {
    await queda.fechar();
  }
  const negada = await servidor((_p, res) => json(res, 401, { message: "Unauthorized" }));
  try {
    await enviarMidia({ baseUrl: negada.url, apiKey: "errada", instancia: "i" }, "5562981283481", midiaDe("imagem", "a.jpg", "image/jpeg"));
    verdade(false, "deveria lançar");
  } catch (e) {
    verdade(e instanceof FalhaDaEvolution && !e.incerta && e.motivo.includes("chave"), String(e));
  } finally {
    await negada.fechar();
  }
});

function campoDoMultipart(corpo: Buffer, cabecalho: string, nome: string): string | null {
  const m = new RegExp(`name="${nome}"(?:; filename="([^"]*)")?`).exec(corpo.toString("latin1"));
  void cabecalho;
  return m ? (m[1] ?? "") : null;
}

teste("META: envia em DOIS pedidos (upload em /media, depois /messages com o id); legenda em imagem/vídeo/documento, nome do documento, áudio sem legenda", async () => {
  const s = await servidor((p, res) => {
    if (p.caminho.endsWith("/media")) json(res, 200, { id: "MEDIA-777" });
    else json(res, 200, { messages: [{ id: "wamid.SAIDA1" }] });
  });
  try {
    const cfg = { phoneNumberId: "1055", accessToken: "TOKEN-DE-TESTE" };
    const r = await enviarMidiaPelaMeta(cfg, "5562981283481", midiaDe("documento", "contrato final.pdf", "application/pdf", "Segue", Buffer.from(PDF)), s.url);
    igual(r, { ok: true, waMessageId: "wamid.SAIDA1" });
    const [up, msg] = s.pedidos;
    igual(up.caminho, "/v21.0/1055/media");
    igual(up.cabecalhos.authorization, "Bearer TOKEN-DE-TESTE");
    verdade(String(up.cabecalhos["content-type"]).startsWith("multipart/form-data"), "multipart");
    const texto = up.corpo.toString("latin1");
    verdade(texto.includes('name="messaging_product"') && texto.includes("whatsapp") && texto.includes('name="type"') && texto.includes("application/pdf"), "campos do upload");
    igual(campoDoMultipart(up.corpo, "", "file"), "contrato final.pdf", "o arquivo vai com o nome");
    verdade(texto.includes("%PDF-1.7"), "o conteúdo vai no upload");
    igual(msg.caminho, "/v21.0/1055/messages");
    igual(JSON.parse(msg.corpo.toString()), { messaging_product: "whatsapp", to: "5562981283481", type: "document", document: { id: "MEDIA-777", filename: "contrato final.pdf", caption: "Segue" } });
    verdade(!msg.corpo.toString().includes("%PDF"), "a mensagem leva só o id, não o arquivo");
  } finally {
    await s.fechar();
  }
  igual(corpoDaMensagemDeMidia("55", "M1", { tipo: "imagem", nome: "f.jpg", legenda: "" }), { messaging_product: "whatsapp", to: "55", type: "image", image: { id: "M1" } });
  igual(corpoDaMensagemDeMidia("55", "M1", { tipo: "imagem", nome: "f.jpg", legenda: "oi" }), { messaging_product: "whatsapp", to: "55", type: "image", image: { id: "M1", caption: "oi" } });
  igual(corpoDaMensagemDeMidia("55", "M1", { tipo: "video", nome: "v.mp4", legenda: "oi" }), { messaging_product: "whatsapp", to: "55", type: "video", video: { id: "M1", caption: "oi" } });
  igual(corpoDaMensagemDeMidia("55", "M1", { tipo: "audio", nome: "a.mp3", legenda: "ignorada" }), { messaging_product: "whatsapp", to: "55", type: "audio", audio: { id: "M1" } });
});

teste("META: falha no upload NÃO é incerta (nada saiu); falha SEM resposta no envio É incerta; janela de 24 h vira a frase conhecida; erro com resposta não é incerto", async () => {
  const uploadRecusado = await servidor((_p, res) => json(res, 400, { error: { message: "Tipo de mídia inválido", code: 100 } }));
  try {
    const r = await enviarMidiaPelaMeta({ phoneNumberId: "1", accessToken: "t" }, "55", midiaDe("imagem", "a.jpg", "image/jpeg"), uploadRecusado.url);
    verdade(!r.ok && !r.incerto && r.error?.includes("Tipo de mídia inválido"), JSON.stringify(r));
    igual(uploadRecusado.pedidos.length, 1, "não chegou a tentar enviar a mensagem");
  } finally {
    await uploadRecusado.fechar();
  }
  const uploadCaiu = await servidor((_p, res) => { res.socket?.destroy(); });
  try {
    const r = await enviarMidiaPelaMeta({ phoneNumberId: "1", accessToken: "t" }, "55", midiaDe("imagem", "a.jpg", "image/jpeg"), uploadCaiu.url);
    verdade(!r.ok && !r.incerto, `queda no upload não é incerta (nenhuma mensagem foi enviada): ${JSON.stringify(r)}`);
  } finally {
    await uploadCaiu.fechar();
  }
  const envioCaiu = await servidor((p, res) => { if (p.caminho.endsWith("/media")) json(res, 200, { id: "M" }); else res.socket?.destroy(); });
  try {
    const r = await enviarMidiaPelaMeta({ phoneNumberId: "1", accessToken: "t" }, "55", midiaDe("imagem", "a.jpg", "image/jpeg"), envioCaiu.url);
    verdade(!r.ok && r.incerto === true, `queda no envio = incerto: ${JSON.stringify(r)}`);
  } finally {
    await envioCaiu.fechar();
  }
  const janela = await servidor((p, res) => { if (p.caminho.endsWith("/media")) json(res, 200, { id: "M" }); else json(res, 400, { error: { code: 131047, message: "Re-engagement message" } }); });
  try {
    const r = await enviarMidiaPelaMeta({ phoneNumberId: "1", accessToken: "t" }, "55", midiaDe("imagem", "a.jpg", "image/jpeg"), janela.url);
    verdade(!r.ok && !r.incerto && /fora da janela de 24h do WhatsApp/i.test(r.error || ""), JSON.stringify(r));
  } finally {
    await janela.fechar();
  }
  const semId = await servidor((_p, res) => json(res, 200, {}));
  try {
    const r = await enviarMidiaPelaMeta({ phoneNumberId: "1", accessToken: "t" }, "55", midiaDe("imagem", "a.jpg", "image/jpeg"), semId.url);
    verdade(!r.ok && !r.incerto, "upload sem id: nada saiu");
    igual(semId.pedidos.length, 1);
  } finally {
    await semId.fechar();
  }
});

teste("PROVEDORES (código): não logam o arquivo nem o token; não baixam URL de terceiro; o arquivo vai em base64 no corpo, não em endereço", () => {
  for (const arq of ["lib/whatsappMidiaMeta.ts", "lib/envioDeMidiaDb.ts"]) {
    const c = codigoDe(le(arq));
    verdade(!/console\.(log|info|debug)/.test(c), `${arq} usa console.log`);
    for (const linha of c.split("\n").filter((l) => /console\.error/.test(l))) verdade(!/buffer|accessToken|apiKey|Authorization|base64/i.test(linha), `${arq}: log com dado sensível: ${linha.trim()}`);
  }
  const ev = codigoDe(corpoDaFuncao(le("lib/whatsappEvolution.ts"), "enviarMidia"));
  verdade(ev.includes("toString(\"base64\")") && !/url:|https?:\/\//.test(ev), "Evolution: base64, sem URL");
  const db = codigoDe(le("lib/envioDeMidiaDb.ts"));
  const fetches = db.split("\n").filter((l) => /\bfetch\(/.test(l));
  igual(fetches.length, 1, "um único fetch no envio de mídia (o download do temporário)");
  verdade(db.includes("isValidBlobUrl(url)") && db.includes('redirect: "error"'), "o download só vai ao Blob e não segue redirecionamento");
});

// ── A ROTA: A GUARDA VEM ANTES DE TUDO ───────────────────────────────────────────────────────────────────

const AUTORIZADO = { officeId: "off1", userId: "u1", attendance: { id: "att1", waPhone: "5562981283481", firstResponseAt: null, subject: "Lead" } };
function montarPortas(o: { guarda?: PortasDoPedidoDeMidia["guarda"] extends (...a: never[]) => Promise<infer R> ? R : never; corpo?: { json: unknown } | { erro: 400 | 415 } } = {}) {
  const chamadas: string[] = [];
  const portas: PortasDoPedidoDeMidia = {
    guarda: async () => { chamadas.push("guarda"); return o.guarda ?? AUTORIZADO; },
    lerCorpo: async () => { chamadas.push("corpo"); return o.corpo ?? { json: { clientMessageId: "chave-de-teste-01", blobUrl: "https://x.public.blob.vercel-storage.com/a", nome: "a.jpg" } }; },
    executar: async (a, p) => { chamadas.push(`executar:${a.officeId}:${a.attendance.id}:${p.clientMessageId}`); return { status: 200, corpo: { ok: true, jaTinhaSaido: false, mensagem: null } }; },
  };
  return { portas, chamadas };
}

teste("ROTA: 401 / 403 / 404 da guarda respondem ANTES de ler o corpo, o arquivo ou o banco (nada é gravado)", async () => {
  for (const status of [401, 403, 404] as const) {
    const { portas, chamadas } = montarPortas({ guarda: { status } });
    const r = await processarPedidoDeMidia("conv-de-outro-escritorio", portas);
    igual(r.status, status);
    igual(chamadas, ["guarda"], `com ${status} só a guarda pode ter sido chamada`);
    verdade(!JSON.stringify(r).includes("conv-de-outro") && !JSON.stringify(r).includes("off1"), "a resposta não repete o id");
  }
});

teste("ROTA: o escritório, o usuário e a conversa vêm da GUARDA, nunca do corpo; corpo que não é JSON = 415; corpo ruim = 400 sem executar", async () => {
  const a = montarPortas({ corpo: { json: { clientMessageId: "chave-de-teste-01", blobUrl: "u", nome: "a.jpg", officeId: "OUTRO", attendanceId: "OUTRA", userId: "OUTRO" } } });
  await processarPedidoDeMidia("qualquer", a.portas);
  igual(a.chamadas, ["guarda", "corpo", "executar:off1:att1:chave-de-teste-01"]);
  const b = montarPortas({ corpo: { erro: 415 } });
  igual((await processarPedidoDeMidia("x", b.portas)).status, 415);
  verdade(!b.chamadas.some((c) => c.startsWith("executar")), "não executa");
  const c = montarPortas({ corpo: { json: { clientMessageId: "curta" } } });
  igual((await processarPedidoDeMidia("x", c.portas)).status, 400);
  verdade(!c.chamadas.some((x) => x.startsWith("executar")), "não executa");
  const d = montarPortas({ corpo: { erro: 400 } });
  igual((await processarPedidoDeMidia("x", d.portas)).status, 400);
});

teste("NENHUM caminho de mídia enviada ignora a guarda do atendimento (rotas de envio, token e leitura)", () => {
  for (const arq of ["app/api/atendimento/[id]/midia-saida/route.ts", "app/api/atendimento/[id]/midia-saida/token/route.ts", "app/api/atendimento/[id]/midia/[mensagemId]/route.ts"]) {
    const c = codigoDe(le(arq));
    const iGuarda = c.indexOf("atendimentoDaRota(");
    verdade(iGuarda >= 0, `${arq} não chama atendimentoDaRota`);
    for (const antes of ["req.json(", "req.formData(", "req.text(", "req.arrayBuffer(", "req.body", "prisma."]) {
      const i = c.indexOf(antes);
      verdade(i < 0 || i > iGuarda, `${arq}: ${antes} vem antes da guarda`);
    }
    const exportados = c.match(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g) ?? [];
    verdade(exportados.length >= 1 && exportados.every((e) => /GET|POST/.test(e)), `${arq}: verbo inesperado (${exportados.join(", ")})`);
  }
  // Toda rota nova de mídia de saída fica sob /api/atendimento/[id]/, e o único lugar que envia é enviarMidiaDoApp.
  const servico = codigoDe(le("lib/midiaDeSaidaServico.ts"));
  verdade(servico.indexOf("portas.guarda(") < servico.indexOf("portas.lerCorpo(") && servico.indexOf("portas.lerCorpo(") < servico.indexOf("portas.executar("), "ordem: guarda, corpo, envio");
  const rota = codigoDe(le("app/api/atendimento/[id]/midia-saida/route.ts"));
  verdade(rota.includes("g.viewer.officeId") && rota.includes("g.viewer.id") && rota.includes("g.attendance.id"), "a rota entrega ao envio o que a guarda autorizou");
  verdade(!rota.includes("params.id,") || rota.includes("processarPedidoDeMidia(params.id"), "o id do caminho só vai à guarda");
});

teste("LEITURA: a mídia enviada sai pela MESMA rota autenticada (recorte por conversa e escritório), sem URL do Drive nem redirecionamento", () => {
  const rota = codigoDe(le("app/api/atendimento/[id]/midia/[mensagemId]/route.ts"));
  verdade(rota.includes("atendimentoDaRota(id)") && !/redirect\(|Location/i.test(rota), "guarda e sem redirect");
  const srv = codigoDe(le("lib/midiaDoChatServico.ts"));
  verdade(srv.includes('mensagem.direction === "OUT" && mensagem.attachmentId'), "saída só com o vínculo gravado");
  const db = codigoDe(le("lib/midiaDoChatDb.ts"));
  verdade(/attachment\.findFirst\(\{ where: \{ id: m\.attachmentId, attendanceId: q\.attendanceId, officeId: q\.officeId \}/.test(db), "o anexo é procurado na mesma conversa e no mesmo escritório");
});

// ── IDEMPOTÊNCIA: o hash é do CONTEÚDO, não só da legenda ────────────────────────────────────────────────

teste("HASH do pedido de mídia: muda com o arquivo, o nome, a legenda e o tipo; é o mesmo para o mesmo conteúdo; nunca colide com hash de texto", () => {
  const base = { tipo: "imagem" as const, nome: "foto.jpg", legenda: "oi", buffer: Buffer.from(JPEG) };
  const h = hashDoPedidoDeMidia(base);
  igual(hashDoPedidoDeMidia({ ...base }), h);
  verdade(h.startsWith(PREFIXO_DO_HASH_DE_MIDIA), "prefixo próprio (deixa contar os envios de arquivo por pessoa)");
  verdade(hashDoPedidoDeMidia({ ...base, buffer: Buffer.from(PNG) }) !== h, "outro arquivo");
  verdade(hashDoPedidoDeMidia({ ...base, nome: "outra.jpg" }) !== h, "outro nome");
  verdade(hashDoPedidoDeMidia({ ...base, legenda: "tchau" }) !== h, "outra legenda");
  verdade(hashDoPedidoDeMidia({ ...base, tipo: "documento" }) !== h, "outro tipo");
  verdade(hashDoPedidoDeMidia({ ...base, nome: "foto.jpgoi", legenda: "" }) !== hashDoPedidoDeMidia({ ...base, nome: "foto.jpg", legenda: "oi" }), "campos não se confundem ao concatenar");
});

teste("IDEMPOTÊNCIA (mídia): a mesma tabela de decisão do texto — ENVIADO nunca reenvia, FALHOU pode, RESERVADO antigo pede confirmação, outro conteúdo na mesma chave é erro", () => {
  const H = hashDoPedidoDeMidia({ tipo: "imagem", nome: "foto.jpg", legenda: "oi", buffer: Buffer.from(JPEG) });
  const H2 = hashDoPedidoDeMidia({ tipo: "imagem", nome: "foto.jpg", legenda: "oi", buffer: Buffer.from(PNG) });
  const AGORA = new Date(Date.UTC(2026, 8, 30, 15, 0));
  const linha = (estado: string, idadeMs = 1000, textoHash = H) => ({ estado, textoHash, updatedAt: new Date(AGORA.getTime() - idadeMs), mensagemId: null });
  const e = (confirmouReenvio = false) => ({ textoHash: H, agora: AGORA, confirmouReenvio });
  igual(decidirSobreOPedido(null, e()), { acao: "enviar" });
  igual(decidirSobreOPedido(linha("ENVIADO"), e()), { acao: "ja-enviado" });
  igual(decidirSobreOPedido(linha("ENVIADO"), e(true)), { acao: "ja-enviado" });
  igual(decidirSobreOPedido(linha("FALHOU"), e()), { acao: "reenviar-apos-falha" });
  igual(decidirSobreOPedido(linha("RESERVADO", 2000), e(true)), { acao: "em-andamento" });
  igual(decidirSobreOPedido(linha("RESERVADO", 200_000), e()), { acao: "sem-confirmacao" });
  igual(decidirSobreOPedido(linha("RESERVADO", 200_000), e(true)), { acao: "reenviar-apos-incerteza" });
  igual(decidirSobreOPedido(linha("ENVIADO", 1000, H2), e()), { acao: "chave-reutilizada" }, "outro ARQUIVO com a mesma chave");
  igual(decidirSobreOPedido(linha("FALHOU", 1000, H2), e()), { acao: "chave-reutilizada" });
});

teste("ENVIO DE MÍDIA (código): a ordem protege o cliente — confere, decide, janela, limite, RESERVA, envia, marca ENVIADO, Drive, registra, assume; o temporário sai no finally", () => {
  const fonte = le("lib/envioDeMidiaDb.ts");
  const corpo = corpoDaFuncao(fonte, "enviarMidiaDoApp");
  verdade(corpo.length > 1500, "não achou a função");
  const ordem = ["temporarioEDesta(", "portas.baixar(", "classificarArquivoDeSaida(", "conferirConteudo(", "validarLegenda(", "hashDoPedidoDeMidia(", "pedidoDeEnvioWhatsapp.findUnique(", "decidirSobreOPedido(", "janelaDaConversa(", "MAX_MIDIAS_POR_MINUTO", "pedidoDeEnvioWhatsapp.create(", "portas.enviar(", 'estado: "ENVIADO"', "gravarSaida(", "silenciarAtendente("];
  let ultimo = -1;
  for (const marca of ordem) {
    // `gravarSaida(` também aparece no ramo "já tinha saído" (completa uma gravação que faltou): o que vale aqui é o do envio novo, o último.
    const i = marca === "gravarSaida(" ? corpo.lastIndexOf(marca) : corpo.indexOf(marca);
    verdade(i > ultimo, `fora de ordem ou ausente: ${marca}`);
    ultimo = i;
  }
  verdade(/finally \{[\s\S]*portas\.apagar\(pedido\.blobUrl\)/.test(corpo), "o temporário é apagado no finally");
  const gravar = codigoDe(corpoDaFuncao(fonte, "gravarSaida"));
  verdade(gravar.indexOf("portas") >= 0 && gravar.indexOf("guardarNoDrive") < gravar.indexOf("registrarMensagem("), "a cópia no Drive vem antes do registro (o vínculo entra na mesma gravação)");
  verdade(gravar.includes('direction: "OUT"') && gravar.includes("attachmentId: copia.attachmentId") && gravar.includes("midiaMime") && gravar.includes("midiaBytes") && gravar.includes("clientMessageId: pedido.clientMessageId") && gravar.includes("rotuloDaMidiaWhatsapp("), "campos da mensagem de mídia");
  verdade(!/whatsappMessage\.create\(/.test(codigoDe(fonte)), "a única porta de escrita de mensagem é registrarMensagem");
  verdade(codigoDe(fonte).includes("MAX_MIDIAS_POR_MINUTO") && MAX_MIDIAS_POR_MINUTO >= 1 && MAX_MIDIAS_POR_MINUTO <= 20, "limite por minuto razoável");
  verdade(corpo.includes("existente.attendanceId !== a.attendance.id"), "a mesma chave em OUTRA conversa não reenvia");
  verdade(corpo.includes('config.provider === "EVOLUTION"') && corpo.includes("whatsappConfig.findUnique({ where: { officeId: a.officeId }"), "o provedor vem do escritório da guarda");
  verdade(!fonte.includes("silenciarAtendente(a.attendance.id, a.officeId);\n    return recusa"), "quem falha não assume");
});

teste("A ANA NÃO RESPONDE POR CIMA: a reserva do envio de mídia é a mesma linha que a releitura da Ana consulta (RESERVADO em curso)", () => {
  const releitura = codigoDe(le("lib/anaReleOSilencio.ts"));
  verdade(releitura.includes('estado: "RESERVADO"') && releitura.includes("pedidoDeEnvioWhatsapp.count"), "a Ana lê PedidoDeEnvioWhatsapp");
  const db = codigoDe(le("lib/envioDeMidiaDb.ts"));
  verdade(db.includes("prisma.pedidoDeEnvioWhatsapp.create(") && !/prisma\.\w*(saida|Saida|midia|Midia)\w*\.(create|update)/.test(db), "reserva na tabela de sempre, não numa nova que a Ana desconhece");
});

// ── RESULTADO NA TELA, FILA, BALÃO, COMPOSITOR ───────────────────────────────────────────────────────────

teste("RESULTADO na bolha: recusa de tipo/tamanho não tenta de novo; limite por minuto e arquivo ilegível tentam; janela diz 'arquivo'; incerto = sem confirmação", () => {
  const r = (status: number | null, codigo?: string, erro?: string) => resultadoDoPedido(status, { codigo, erro }, { midia: true });
  igual(r(200), { estado: "enviada", erro: null, podeTentarDeNovo: false });
  igual(r(415, "TIPO_NAO_PERMITIDO", "Arquivo .exe não pode"), { estado: "falhou", erro: "Arquivo .exe não pode", podeTentarDeNovo: false });
  igual(r(413, "GRANDE_DEMAIS", "Este vídeo tem 20 MB").podeTentarDeNovo, false);
  igual(r(429, "MUITOS_ENVIOS").podeTentarDeNovo, true);
  igual(r(422, "ARQUIVO_INDISPONIVEL").podeTentarDeNovo, true);
  verdade(r(409, "FORA_DA_JANELA").erro?.includes("arquivo") && !r(409, "FORA_DA_JANELA").erro?.includes("texto"), "janela fala de arquivo");
  igual(r(409, "FORA_DA_JANELA").podeTentarDeNovo, false);
  igual(r(null).estado, "sem-confirmacao");
  igual(r(502, "SEM_CONFIRMACAO").estado, "sem-confirmacao");
  igual(r(409, "SEM_CONFIRMACAO").estado, "sem-confirmacao");
  igual(r(409, "EM_ANDAMENTO").estado, "sem-confirmacao");
  igual(resultadoDoPedido(409, { codigo: "FORA_DA_JANELA" }).erro?.includes("texto"), true, "sem a opção, a frase do texto continua a de sempre");
});

teste("FILA: o pendente de mídia leva só metadados (nunca o arquivo), vira balão com rótulo e progresso, e depois de recarregar nunca reenvia", () => {
  const AGORA = new Date(Date.UTC(2026, 8, 30, 15, 0));
  const p = { ...novoPendente("chave-de-teste-01", "Segue", AGORA, false, { tipo: "documento", nome: "contrato.pdf", mime: "application/pdf", bytes: 1234 }), progresso: 42 };
  const m = pendenteComoMensagem(p, AGORA);
  igual([m.midia?.tipo, m.midia?.nome, m.midia?.legenda, m.texto, m.envioLocal?.progresso, m.direction], ["documento", "contrato.pdf", "Segue", "Segue", 42, "OUT"]);
  igual(JSON.stringify(p).includes("base64"), false);
  const guardado = JSON.parse(JSON.stringify(p));
  const lido = restaurarPendentes([guardado], AGORA);
  igual(lido.length, 1);
  igual([lido[0].estado, lido[0].podeTentarDeNovo, lido[0].aguardando, lido[0].midia?.nome], ["sem-confirmacao", false, undefined, "contrato.pdf"], "o que estava enviando vira dúvida e não se repete: o arquivo não está mais aqui");
  verdade(lido[0].erro?.includes("escolha-o outra vez"), lido[0].erro ?? "");
  const falho = restaurarPendentes([{ ...guardado, estado: "falhou", erro: "Fora da janela", podeTentarDeNovo: true }], AGORA);
  igual([falho[0].estado, falho[0].podeTentarDeNovo], ["falhou", false]);
  const forjado = restaurarPendentes([{ ...guardado, aguardando: true }], AGORA);
  igual(forjado[0].aguardando, undefined, "mídia nunca fica 'aguardando' (não sai sozinha)");
  igual(restaurarPendentes([{ ...guardado, midia: { tipo: "exe", nome: "x", mime: "x", bytes: 1 } }], AGORA).length, 0, "metadado estragado não é inventado");
  const c = codigoDe(le("components/atendimento-app/ChatDaConversa.tsx"));
  verdade(c.includes("if (p.midia) continue;"), "a volta da conexão nunca reenvia arquivo sozinha");
});

teste("BALÃO: a mídia ENVIADA e guardada abre pela rota como a recebida (frases 'enviado'); o balão 'enviando' mostra só o rótulo e o progresso", () => {
  const foto = renderToStaticMarkup(<MidiaDaBolha idDaConversa="c1" idDaMensagem="m9" midia={{ tipo: "imagem", rotulo: "Imagem", nome: "foto.jpg", legenda: "oi", bytes: 5000, mime: "image/jpeg" }} recebida doCliente={false} />);
  verdade(foto.includes('src="/api/atendimento/c1/midia/m9') && foto.includes("Imagem enviada: oi") && !foto.includes("pelo cliente"), foto);
  const audio = renderToStaticMarkup(<MidiaDaBolha idDaConversa="c1" idDaMensagem="m9" midia={{ tipo: "audio", rotulo: "Áudio", nome: "a.mp3", legenda: "", bytes: 5000, mime: "audio/mpeg" }} recebida doCliente={false} />);
  verdade(audio.includes("áudio enviado") && !audio.includes("do cliente"), audio);
  const local = renderToStaticMarkup(<MidiaDaBolha idDaConversa="c1" idDaMensagem="local-x" midia={{ tipo: "imagem", rotulo: "Imagem", nome: "foto.jpg", legenda: "", bytes: 5000, mime: "image/jpeg" }} recebida={false} doCliente={false} />);
  verdade(!local.includes("/api/atendimento") && local.includes("Imagem: foto.jpg"), "sem arquivo: rótulo");
  const b = codigoDe(le("components/atendimento-app/BolhaDaMensagem.tsx"));
  verdade(b.includes("Enviando arquivo… ${local.progresso}%"), "progresso no balão");
  verdade(!codigoDe(le("components/atendimento-app/MidiaDaBolha.tsx")).match(/drive\.google|driveUrl|storageFileId/), "o balão nunca conhece o Drive");
});

teste("COMPOSITOR: o clipe abre 'Foto ou vídeo da galeria', 'Câmera' e 'Documento ou áudio'; alvos de 44 px; a prévia tem Cancelar, Enviar e legenda", () => {
  // O menu só abre por clique (estado), então a marcação estática mostra o botão; o conteúdo da folha é conferido no código.
  const clipe = renderToStaticMarkup(<AnexarMidia provedor="EVOLUTION" desabilitado={false} aoEscolher={() => {}} />);
  verdade(clipe.includes('aria-label="Anexar arquivo"') && clipe.includes("h-11 w-11") && clipe.includes('aria-haspopup="dialog"') && clipe.includes('aria-expanded="false"'), clipe);
  verdade(clipe.includes('capture="environment"') && clipe.includes('accept="image/*"') && clipe.includes("image/webp") && clipe.includes(".zip"), "câmera traseira e lista da Evolution");
  const meta = renderToStaticMarkup(<AnexarMidia provedor="META" desabilitado={false} aoEscolher={() => {}} />);
  verdade(!meta.includes("image/webp") && !meta.includes(".zip") && meta.includes("image/jpeg"), "lista da Meta");
  verdade((clipe.match(/type="file"/g) ?? []).length === 3 && (clipe.match(/tabindex="-1"/g) ?? []).length === 3, "três seletores escondidos, fora da ordem de tabulação");
  const fonte = codigoDe(le("components/atendimento-app/AnexarMidia.tsx"));
  for (const frase of ["Foto ou vídeo da galeria", "Câmera", "Documento ou áudio"]) verdade(fonte.includes(frase), frase);
  verdade(fonte.includes("min-h-14") && fonte.includes('role="dialog"') && fonte.includes('aria-modal="true"') && fonte.includes("Escape") && fonte.includes('e.target.value = ""'), "linhas de 56 px, diálogo, Esc, zera o valor");

  const previa = (tipo: "imagem" | "audio" | "documento", nome: string) =>
    renderToStaticMarkup(<PreviaDaMidia arquivo={new File([new Uint8Array(2048)], nome)} tipo={tipo} nome={nome} legendaInicial="texto do campo" nomeDoContato="Maria" aoEnviar={() => {}} aoCancelar={() => {}} />);
  const doc = previa("documento", "contrato.pdf");
  verdade(doc.includes("Enviar documento a Maria") && doc.includes("contrato.pdf") && doc.includes("2 KB") && doc.includes("Legenda (opcional)") && doc.includes("texto do campo") && doc.includes("Cancelar") && doc.includes("Enviar</button>") && doc.includes("min-h-12"), doc);
  verdade(doc.includes('role="dialog"') && doc.includes('aria-modal="true"') && doc.includes("/1024"), "diálogo e contador da legenda");
  const aud = previa("audio", "voz.mp3");
  verdade(!aud.includes("Legenda (opcional)") && aud.includes("não aceita legenda em áudio"), "áudio sem legenda");
  const comp = codigoDe(le("components/atendimento-app/CompositorDoChat.tsx"));
  verdade(comp.includes("classificarArquivoDeSaida(") && comp.includes("estado.provedor") && comp.includes("data-erro-do-anexo") && comp.includes('role="alert"'), "o arquivo é conferido na tela e a recusa aparece com role=alert");
  verdade(comp.includes("legendaInicial: texto.current.trim()"), "o texto do campo vira a legenda");
  verdade(!/BarraDoChat|GuiasDaConversa/.test(comp.replace(/\/\/.*$/gm, "")), "o compositor não mexe nas guias nem na barra");
});

teste("CHAT: o arquivo sobe direto para o Blob (com progresso) e o servidor só recebe o endereço; a chave é reusada na nova tentativa; sem conexão não entra em fila; nada de arquivo em sessionStorage", () => {
  const c = codigoDe(le("components/atendimento-app/ChatDaConversa.tsx"));
  const corpo = corpoDaFuncao(le("components/atendimento-app/ChatDaConversa.tsx"), "enviarMidia");
  verdade(corpo.length > 100 || c.includes("const enviarMidia"), "enviarMidia existe");
  verdade(c.includes("await upload(caminhoDoTemporario(idDaConversa, p.clientMessageId, midia.nome), arquivo") && c.includes("onUploadProgress") && c.includes('handleUploadUrl: `/api/atendimento/${encodeURIComponent(idDaConversa)}/midia-saida/token`'), "upload direto, amarrado à conversa e à chave");
  verdade(c.includes("blobUrl, nome: midia.nome, legenda, confirmouReenvio"), "o POST leva só o endereço");
  verdade(c.includes("if (p.midia) void dispararMidia(p, false, p.texto)"), "tentar de novo reusa o pendente (mesma chave)");
  verdade(c.includes("navigator.onLine === false") && c.includes("Quando a internet voltar, toque em Tentar de novo"), "sem conexão: aviso, sem fila");
  verdade(c.includes("arquivos.current.set(") && !/sessionStorage|localStorage/.test(c), "o arquivo só na memória");
  const fila = codigoDe(le("lib/filaDoChat.ts"));
  verdade(!/\.arrayBuffer|FileReader|createObjectURL|base64/i.test(fila), "a fila não guarda arquivo");
  verdade(c.includes("useRef(new Set<string>())") && c.includes("emVoo.current.has(p.clientMessageId)"), "um só voo por chave (duplo toque)");
});

teste("SEM MODELOS APROVADOS e sem jargão: nada de template da Meta nesta entrega; as frases da tela não falam de plataforma", () => {
  for (const arq of ["lib/envioDeMidiaDb.ts", "lib/midiaDeSaida.ts", "components/atendimento-app/AnexarMidia.tsx", "components/atendimento-app/PreviaDaMidia.tsx", "lib/whatsappMidiaMeta.ts"]) {
    verdade(!/type:\s*"template"|"template"\s*:/.test(codigoDe(le(arq))), `${arq}: modelo aprovado está fora de escopo`);
  }
  for (const arq of ["components/atendimento-app/AnexarMidia.tsx", "components/atendimento-app/PreviaDaMidia.tsx"]) {
    const visivel = codigoDe(le(arq)).replace(/text-app-meta/g, "").replace(/provedor === "EVOLUTION"/g, "");
    verdade(!/evolution|\bAPI\b|Meta\b|rota|blob/i.test(visivel.replace(/[a-zA-Z_.]*(Meta|blob)[a-zA-Z_.]*/gi, "")), `${arq}: jargão`);
  }
});

teste("SCHEMA: esta entrega não muda o schema (usa PedidoDeEnvioWhatsapp e as colunas de mídia que já existem)", () => {
  const s = le("prisma/schema.prisma");
  verdade(/model PedidoDeEnvioWhatsapp \{[\s\S]*?textoHash\s+String/.test(s) && /attachmentId String\?/.test(s) && /midiaMime\s+String\?/.test(s) && /midiaBytes\s+Int\?/.test(s), "colunas usadas existem");
});

void resumo("R3 — mídia de saída pelo celular");
