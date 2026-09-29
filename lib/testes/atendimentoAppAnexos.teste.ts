import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { ACCEPT_DA_CAMERA, ACCEPT_DO_ANEXO, EXTENSOES_ACEITAS, JANELA_DO_DESFAZER_MS, LIMITE_DO_ANEXO_BYTES, nomeDoAnexo, nomeFinalDoAnexo, podeDesfazerAnexo, validarArquivoDoCelular } from "@/lib/anexoDoCelular";

// ============================================================================
// PR 9 DO APLICATIVO DE ATENDIMENTO: ENVIAR ARQUIVO/FOTO PELO CELULAR PARA OS ANEXOS DO ATENDIMENTO. Prova o
// limite (o mesmo do site), os tipos, o nome, o Desfazer e as travas de código (guarda do dono antes de tudo,
// nada de envio ao cliente).
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");

teste("LIMITE: 25 MB, o MESMO do token do Blob do site", () => {
  const rota = le("app/api/attachments/blob-token/route.ts");
  const m = /const MAX_SIZE = (\d+) \* 1024 \* 1024/.exec(rota);
  verdade(m, "a rota do token mudou de forma");
  igual(LIMITE_DO_ANEXO_BYTES, Number(m![1]) * 1024 * 1024);
  igual(validarArquivoDoCelular({ name: "a.pdf", size: LIMITE_DO_ANEXO_BYTES, type: "application/pdf" }), { ok: true });
  const grande = validarArquivoDoCelular({ name: "a.pdf", size: LIMITE_DO_ANEXO_BYTES + 1, type: "application/pdf" });
  verdade(!grande.ok && grande.erro.includes("25 MB"), "a frase tem de dizer o limite");
});

teste("VAZIO: arquivo de 0 byte ou tamanho inválido não sobe", () => {
  for (const size of [0, -5, Number.NaN, Infinity]) igual(validarArquivoDoCelular({ name: "a.pdf", size, type: "application/pdf" }).ok, false, String(size));
});

teste("TIPOS: documentos, imagens (inclusive HEIC do iPhone), áudio, vídeo e zip entram", () => {
  for (const n of ["a.pdf", "b.DOCX", "c.xlsx", "d.jpg", "e.HEIC", "f.png", "g.mp3", "h.m4a", "i.mp4", "j.mov", "k.zip", "l.txt", "m.opus"]) {
    igual(validarArquivoDoCelular({ name: n, size: 10, type: "" }).ok, true, n);
  }
});

teste("TIPOS: programa, script e página ficam de fora, com frase que diz a extensão", () => {
  for (const n of ["virus.exe", "a.bat", "b.js", "c.html", "d.htm", "e.svg", "f.apk", "g.sh", "h.php", "i.msi", "j.jar", "k.scr", "l.vbs", "m.xml"]) {
    const r = validarArquivoDoCelular({ name: n, size: 10, type: "application/pdf" });
    verdade(!r.ok, `${n} passou`);
    if (!r.ok) verdade(r.erro.includes(`.${n.split(".").pop()}`), `a frase não diz a extensão: ${r.erro}`);
  }
  // o `type` que o navegador declara não abre a porta: a extensão manda quando existe
  igual(validarArquivoDoCelular({ name: "a.exe", size: 10, type: "image/jpeg" }).ok, false);
});

teste("FOTO DA CÂMERA: sem extensão, imagem aceita pelo tipo; sem tipo conhecido, pede o nome; SVG nunca", () => {
  igual(validarArquivoDoCelular({ name: "", size: 10, type: "image/jpeg" }).ok, true);
  igual(validarArquivoDoCelular({ name: "image", size: 10, type: "image/heic" }).ok, true);
  igual(validarArquivoDoCelular({ name: "semnada", size: 10, type: "" }).ok, false);
  igual(validarArquivoDoCelular({ name: "semnada", size: 10, type: "application/octet-stream" }).ok, false);
  igual(validarArquivoDoCelular({ name: "desenho", size: 10, type: "image/svg+xml" }).ok, false);
  igual(nomeFinalDoAnexo("", { name: "", size: 10, type: "image/jpeg" }), "foto.jpg");
  igual(nomeFinalDoAnexo("", { name: "image", size: 10, type: "image/heic" }), "image.heic");
  igual(nomeFinalDoAnexo("RG frente", { name: "x.png", size: 10, type: "image/png" }), "RG frente.png");
  igual(nomeFinalDoAnexo("RG.pdf", { name: "x.png", size: 10, type: "image/png" }), "RG.pdf");
});

teste("NOME: sem caminho, sem controle, no máximo 120 caracteres com a extensão preservada", () => {
  igual(nomeDoAnexo("C:\\Users\\ana\\contrato.pdf"), "contrato.pdf");
  igual(nomeDoAnexo("../../etc/passwd.txt"), "passwd.txt");
  igual(nomeDoAnexo("a\u0000b\nc.pdf"), "abc.pdf");
  const longo = nomeDoAnexo(`${"a".repeat(300)}.pdf`);
  verdade(longo.length <= 120 && longo.endsWith(".pdf"), `nome longo: ${longo.length}`);
  igual(nomeDoAnexo("   "), "");
});

teste("INPUTS: o seletor filtra pelas mesmas extensões; a câmera pede só imagem", () => {
  for (const e of EXTENSOES_ACEITAS) verdade(ACCEPT_DO_ANEXO.includes(`.${e}`), e);
  igual(ACCEPT_DA_CAMERA, "image/*");
  verdade(!/\.(exe|html|svg|js)\b/.test(ACCEPT_DO_ANEXO), "o seletor oferece tipo barrado");
});

teste("DESFAZER: só quem enviou, em 10 minutos, e nunca a mídia do cliente", () => {
  const agora = new Date("2026-09-29T18:00:00Z");
  const anexo = (o: Partial<{ uploadedById: string | null; createdAt: Date; docType: string }> = {}) => ({ uploadedById: "u1", createdAt: new Date(agora.getTime() - 60_000), docType: "OUTRO", ...o });
  igual(podeDesfazerAnexo(anexo(), { id: "u1" }, agora), true);
  igual(podeDesfazerAnexo(anexo({ uploadedById: "u2" }), { id: "u1" }, agora), false, "de outra pessoa");
  igual(podeDesfazerAnexo(anexo({ uploadedById: null }), { id: "u1" }, agora), false, "sem autor");
  igual(podeDesfazerAnexo(anexo({ createdAt: new Date(agora.getTime() - JANELA_DO_DESFAZER_MS - 1) }), { id: "u1" }, agora), false, "passou da janela");
  igual(podeDesfazerAnexo(anexo({ createdAt: new Date(agora.getTime() - JANELA_DO_DESFAZER_MS) }), { id: "u1" }, agora), true, "no limite");
  igual(podeDesfazerAnexo(anexo({ createdAt: new Date(agora.getTime() + 60_000) }), { id: "u1" }, agora), false, "data no futuro");
  igual(podeDesfazerAnexo(anexo({ docType: "MIDIA_WHATSAPP" }), { id: "u1" }, agora), false, "mídia do cliente não se desfaz");
});

teste("AÇÕES (código): guarda do dono ANTES de tudo; escopo do anexo é o atendimento e o escritório; nada vai ao cliente", () => {
  const f = le("lib/actions/detalhesDoAtendimento.ts");
  for (const nome of ["anexarArquivoDoCelular", "desfazerAnexoDoCelular"]) {
    const c = corpoDaFuncao(f, nome);
    verdade(c.length > 100, `${nome} não encontrada`);
    const guarda = c.indexOf("await atendimentoDaAcao(id)");
    verdade(guarda > 0 && guarda < 400 && !/prisma\./.test(c.slice(0, guarda)), `${nome} não começa pela guarda`);
    verdade(!/sendWhatsapp|registrarMensagem|enviarMensagemDoApp/.test(c), `${nome} envia ao cliente`);
  }
  const anexar = corpoDaFuncao(f, "anexarArquivoDoCelular");
  verdade(anexar.indexOf("atendimentoDaAcao") < anexar.indexOf("validarArquivoDoCelular") && anexar.indexOf("validarArquivoDoCelular") < anexar.indexOf("finalizeAttachmentUpload"), "ordem guarda -> validação -> Drive");
  verdade(anexar.includes("isValidBlobUrl") && anexar.includes("attendanceId: attendance.id"), "URL do Blob validada e anexo preso ao atendimento AUTORIZADO (não ao id do pedido)");
  const desfazer = corpoDaFuncao(f, "desfazerAnexoDoCelular");
  verdade(/where: \{ id: String\(anexoId\), attendanceId: attendance\.id, officeId: viewer\.officeId \}/.test(desfazer), "o anexo a desfazer precisa ser deste atendimento e deste escritório");
  verdade(desfazer.includes("podeDesfazerAnexo"), "Desfazer sem a regra");
});

teste("TELA (código): dois botões (câmera e arquivo), progresso, erro com role=alert, Desfazer, nada de 'próxima etapa'", () => {
  const c = codigoDe(le("components/atendimento-app/detalhes/Anexos.tsx"));
  verdade(/capture="environment"/.test(c) && /accept=\{ACCEPT_DA_CAMERA\}/.test(c) && /accept=\{ACCEPT_DO_ANEXO\}/.test(c), "inputs de câmera e arquivo");
  verdade(/onUploadProgress/.test(c) && /role="progressbar"/.test(c) && /aria-valuenow/.test(c), "progresso");
  verdade(/role="alert"/.test(c) && /desfazer:/.test(c) && /desfazerAnexoDoCelular/.test(c), "erro e Desfazer");
  verdade(/disabled=\{Boolean\(andamento\)\}/.test(c), "botões desligados durante o envio (duplo toque)");
  verdade(/Não é enviado ao cliente/.test(c), "a tela diz que não vai ao cliente");
  verdade(!/próxima etapa/.test(c), "sobrou o aviso antigo");
  verdade(!/#[0-9a-fA-F]{3,8}\b/.test(c) && !/\bshadow-/.test(c), "hex ou sombra");
});

resumo("Atendimento app, PR 9 — anexos pelo celular");
