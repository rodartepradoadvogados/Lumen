// PROVA DA MÍDIA DE SAÍDA COM BANCO DE VERDADE (R3). NÃO faz parte de `npm run testar` (precisa de um Postgres).
//
//   DATABASE_URL=postgresql://pgu@127.0.0.1:5441/lumen_r3 npx prisma db push
//   DATABASE_URL=postgresql://pgu@127.0.0.1:5441/lumen_r3 npx tsx --tsconfig tsconfig.testes.json scripts/provaMidiaDeSaidaComBanco.ts
//
// SÓ RODA CONTRA UM BANCO LOCAL (127.0.0.1 / localhost) e APAGA os dados de teste que cria. Recusa qualquer outro endereço: o
// DATABASE_URL de produção nunca pode ser usado aqui. NUNCA chama o WhatsApp real: a Evolution e a Meta são servidores falsos em
// 127.0.0.1 (a Meta, por um `fetch` que redireciona graph.facebook.com para o servidor falso). O Blob e o Drive são portas falsas.
// O que isto prova que os testes de mesa não provam: a RESERVA ÚNICA no Postgres sob concorrência (6 pedidos simultâneos = 1 envio).

import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

const url = process.env.DATABASE_URL || "";
if (!/^postgres(ql)?:\/\/[^/]*@?(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error("Recuso rodar: DATABASE_URL não é um banco local (127.0.0.1 / localhost).");
  process.exit(2);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function principal() {
  const { prisma } = await import("@/lib/prisma");
  const { enviarMidiaDoApp, PORTAS_REAIS_DA_MIDIA_DE_SAIDA, MAX_MIDIAS_POR_MINUTO } = await import("@/lib/envioDeMidiaDb");
  const { caminhoDoTemporario } = await import("@/lib/midiaDeSaida");
  const { haEnvioDePessoaEmCurso } = await import("@/lib/anaReleOSilencio");
  const { decidirRespostaDaMidia } = await import("@/lib/midiaDoChatServico");
  const { PORTAS_DE_BANCO_DA_MIDIA } = await import("@/lib/midiaDoChatDb");
  const { whereDeUmAtendimento } = await import("@/lib/acessoAtendimento");
  const { registrarMensagem } = await import("@/lib/registrarMensagem");

  let falhas = 0;
  const ok = (c: unknown, msg: string) => {
    if (c) console.log(`  ok   ${msg}`);
    else {
      falhas++;
      console.error(`  FALHOU ${msg}`);
    }
  };

  // ── OS PROVEDORES FALSOS ──────────────────────────────────────────────────────────────────────────────────
  const evo = { chamadas: [] as { caminho: string; corpo: any }[], modo: "ok" as "ok" | "recusa" | "cai", atrasoMs: 0 };
  const meta = { chamadas: [] as { caminho: string; corpo: string }[], modo: "ok" as "ok" | "cai" };
  const responder = (res: ServerResponse, status: number, corpo: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(corpo));
  };
  const srvEvo = createServer((req, res) => {
    const partes: Buffer[] = [];
    req.on("data", (d) => partes.push(d));
    req.on("end", async () => {
      let corpo: any = null;
      try { corpo = JSON.parse(Buffer.concat(partes).toString()); } catch { /* */ }
      evo.chamadas.push({ caminho: req.url || "", corpo });
      if (evo.atrasoMs) await new Promise((r) => setTimeout(r, evo.atrasoMs));
      if (evo.modo === "cai") return void res.socket?.destroy();
      if (evo.modo === "recusa") return responder(res, 400, { response: { message: ["numero invalido"] } });
      responder(res, 201, { key: { id: `EVO-${evo.chamadas.length}` } });
    });
  });
  const srvMeta = createServer((req, res) => {
    const partes: Buffer[] = [];
    req.on("data", (d) => partes.push(d));
    req.on("end", () => {
      const caminho = req.url || "";
      meta.chamadas.push({ caminho, corpo: caminho.endsWith("/messages") ? Buffer.concat(partes).toString() : "(arquivo)" });
      if (caminho.endsWith("/media")) return responder(res, 200, { id: "MEDIA-1" });
      if (meta.modo === "cai") return void res.socket?.destroy();
      responder(res, 200, { messages: [{ id: `wamid.${meta.chamadas.length}` }] });
    });
  });
  await new Promise<void>((r) => srvEvo.listen(0, "127.0.0.1", r));
  await new Promise<void>((r) => srvMeta.listen(0, "127.0.0.1", r));
  const portaEvo = (srvEvo.address() as AddressInfo).port;
  const portaMeta = (srvMeta.address() as AddressInfo).port;
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = ((input: any, init?: any) => {
    const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (u.startsWith("https://graph.facebook.com")) return fetchOriginal(u.replace("https://graph.facebook.com", `http://127.0.0.1:${portaMeta}`), init);
    if (!/^http:\/\/127\.0\.0\.1/.test(u)) throw new Error(`a prova tentou chamar a rede de verdade: ${u}`);
    return fetchOriginal(input, init);
  }) as typeof fetch;

  // ── O CENÁRIO ────────────────────────────────────────────────────────────────────────────────────────────
  const marca = `r3-${Date.now()}`;
  const office = await prisma.office.create({ data: { name: `Teste ${marca}`, slug: marca, moduloWhatsapp: true } });
  const outro = await prisma.office.create({ data: { name: `Outro ${marca}`, slug: `${marca}-b`, moduloWhatsapp: true } });
  const user = await prisma.user.create({ data: { name: "Advogada", email: `${marca}@teste.local`, officeId: office.id, isAdmin: true, role: "Admin" } });
  const cfg = await prisma.whatsappConfig.create({ data: { officeId: office.id, phoneNumberId: `inst-${marca}`, accessToken: "x", provider: "EVOLUTION", baseUrl: `http://127.0.0.1:${portaEvo}`, apiKey: "CHAVE-FALSA" } });
  const novoAtendimento = async (officeId: string, nome: string, entradaHaHoras = 1) => {
    const a = await prisma.attendance.create({ data: { officeId, clientName: nome, subject: `Lead ${nome}`, waPhone: "5562981283481" } });
    if (entradaHaHoras >= 0) await registrarMensagem({ officeId, attendanceId: a.id, direction: "IN", body: "oi", status: "RECEIVED", createdAt: new Date(Date.now() - entradaHaHoras * 3_600_000) });
    return a;
  };
  const conv = await novoAtendimento(office.id, "Maria");
  const convDeOutro = await novoAtendimento(outro.id, "João");

  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const EXE = Buffer.from("MZ\u0090\u0000\u0003\u0000\u0000\u0000", "latin1");
  const blobs = new Map<string, Buffer>();
  const apagados: string[] = [];
  let drives = 0;
  const urlDoBlob = (att: string, chave: string, nome: string, corpo: Buffer) => {
    const u = `https://abc.public.blob.vercel-storage.com/${caminhoDoTemporario(att, chave, nome)}-Zx81.${nome.split(".").pop()}`;
    blobs.set(u, corpo);
    return u;
  };
  const portas = {
    baixar: async (u: string) => (blobs.has(u) ? { ok: true as const, buffer: blobs.get(u)! as Buffer<ArrayBuffer> } : { ok: false as const, motivo: "falha" as const }),
    apagar: async (u: string) => void apagados.push(u),
    guardarNoDrive: async () => ({ attachmentId: `anexo-falso-${++drives}` }),
  };
  const autorizado = (att: { id: string }, off = office.id) => ({ officeId: off, userId: user.id, attendance: { id: att.id, waPhone: "5562981283481", firstResponseAt: null, subject: "Lead" } });
  const pedido = (att: { id: string }, chave: string, nome = "foto.jpg", corpo: Buffer = JPEG, legenda = "Segue", extra: Record<string, unknown> = {}) => ({
    clientMessageId: chave, blobUrl: urlDoBlob(att.id, chave, nome, corpo), nome, legenda, confirmouReenvio: false, ...extra,
  });
  const enviar = (att: { id: string }, p: any, opcoes: any = {}) => enviarMidiaDoApp(autorizado(att), p, { portas, ...opcoes });
  const linhas = (att: { id: string }) => prisma.whatsappMessage.count({ where: { attendanceId: att.id, direction: "OUT" } });
  const reserva = (chave: string) => prisma.pedidoDeEnvioWhatsapp.findUnique({ where: { officeId_clientMessageId: { officeId: office.id, clientMessageId: chave } } });

  try {
    console.log("\n1. EVOLUTION: 6 pedidos SIMULTÂNEOS com a mesma chave = 1 envio");
    evo.atrasoMs = 400;
    const p1 = pedido(conv, "chave-simultanea-01");
    const rs = await Promise.all(Array.from({ length: 6 }, () => enviar(conv, p1)));
    const enviadosDeVerdade = rs.filter((r) => r.status === 200 && (r.corpo as any).jaTinhaSaido === false).length;
    ok(evo.chamadas.length === 1, `a Evolution recebeu ${evo.chamadas.length} chamada(s) (esperado 1)`);
    ok(enviadosDeVerdade === 1, `${enviadosDeVerdade} resposta(s) de envio novo (esperado 1)`);
    ok(rs.filter((r) => r.status === 409).every((r) => (r.corpo as any).codigo === "EM_ANDAMENTO"), "os outros receberam EM_ANDAMENTO (ninguém enviou uma segunda cópia)");
    ok((await linhas(conv)) === 1, "1 mensagem de saída gravada");
    ok((await reserva("chave-simultanea-01"))?.estado === "ENVIADO", "reserva ENVIADO");
    ok(apagados.length === 6, `o temporário foi apagado nos 6 pedidos (${apagados.length})`);
    const c0 = evo.chamadas[0];
    ok(c0.caminho.startsWith("/message/sendMedia/") && c0.corpo.mediatype === "image" && c0.corpo.caption === "Segue" && c0.corpo.media === JPEG.toString("base64"), "corpo enviado à Evolution: sendMedia, image, legenda, base64");
    evo.atrasoMs = 0;

    console.log("\n2. Mesma chave depois: 'já tinha saído' (mesma mensagem), nenhuma cópia nova; outro CONTEÚDO na mesma chave é recusado");
    const r2 = await enviar(conv, pedido(conv, "chave-simultanea-01"));
    ok(r2.status === 200 && (r2.corpo as any).jaTinhaSaido === true && evo.chamadas.length === 1, "jaTinhaSaido=true e a Evolution não foi chamada de novo");
    const r2b = await enviar(conv, pedido(conv, "chave-simultanea-01", "foto.jpg", Buffer.concat([JPEG, Buffer.from([9])])));
    ok(r2b.status === 409 && (r2b.corpo as any).codigo === "CHAVE_REUTILIZADA" && evo.chamadas.length === 1, "outro arquivo na mesma chave = CHAVE_REUTILIZADA");
    const r2c = await enviar(conv, pedido(conv, "chave-simultanea-01", "foto.jpg", JPEG, "Outra legenda"));
    ok(r2c.status === 409 && (r2c.corpo as any).codigo === "CHAVE_REUTILIZADA", "outra legenda na mesma chave = CHAVE_REUTILIZADA");

    console.log("\n3. O que foi gravado");
    const m = await prisma.whatsappMessage.findFirst({ where: { attendanceId: conv.id, direction: "OUT" } });
    ok(!!m && m.body === "[imagem: foto.jpg] Segue" && m.status === "SENT" && m.clientMessageId === "chave-simultanea-01" && m.midiaMime === "image/jpeg" && m.midiaBytes === JPEG.length && (m.attachmentId || "").startsWith("anexo-falso"), `registro: ${JSON.stringify(m && { body: m.body, status: m.status, mime: m.midiaMime, bytes: m.midiaBytes, anexo: m.attachmentId })}`);
    const att = await prisma.attendance.findUnique({ where: { id: conv.id } });
    ok(!!att?.agenteSilenciadoEm && att.agenteResponde === false && !!att.firstResponseAt, "quem enviou assumiu (a Ana calou) e a primeira resposta foi marcada");

    console.log("\n4. Recusa do provedor (FALHOU): nada gravado, quem falha NÃO assume, e a MESMA chave pode tentar de novo");
    const conv2 = await novoAtendimento(office.id, "Ana Paula");
    evo.modo = "recusa";
    const p4 = pedido(conv2, "chave-recusada-001", "contrato.pdf", Buffer.from("%PDF-1.7\nx"));
    const r4 = await enviar(conv2, p4);
    ok(r4.status === 422 && (r4.corpo as any).codigo === "RECUSADA" && (await linhas(conv2)) === 0, "422 RECUSADA e nenhuma mensagem gravada");
    ok((await reserva("chave-recusada-001"))?.estado === "FALHOU", "reserva FALHOU");
    ok((await prisma.attendance.findUnique({ where: { id: conv2.id } }))?.agenteSilenciadoEm === null, "a falha não assumiu a conversa");
    evo.modo = "ok";
    const antes = evo.chamadas.length;
    const r4b = await enviar(conv2, pedido(conv2, "chave-recusada-001", "contrato.pdf", Buffer.from("%PDF-1.7\nx")));
    ok(r4b.status === 200 && evo.chamadas.length === antes + 1 && (await linhas(conv2)) === 1, "com a mesma chave, enviou (uma vez) e gravou");
    ok(evo.chamadas[evo.chamadas.length - 1].corpo.mediatype === "document" && evo.chamadas[evo.chamadas.length - 1].corpo.fileName === "contrato.pdf", "documento com o nome do arquivo");

    console.log("\n5. Sem resposta do provedor (INCERTO): 'sem confirmação', não reenvia sozinho, só com confirmação humana");
    const conv3 = await novoAtendimento(office.id, "Carlos");
    evo.modo = "cai";
    const r5 = await enviar(conv3, pedido(conv3, "chave-incerta-0001"));
    ok(r5.status === 502 && (r5.corpo as any).codigo === "SEM_CONFIRMACAO" && (await linhas(conv3)) === 0, "502 SEM_CONFIRMACAO e nada gravado");
    const res5 = await reserva("chave-incerta-0001");
    ok(res5?.estado === "RESERVADO" && res5.updatedAt.getTime() < 1000, "reserva RESERVADO e antiga");
    ok(!(await haEnvioDePessoaEmCurso(conv3.id, new Date())), "a Ana não considera isto 'envio em curso' (já passou dos 90 s)");
    evo.modo = "ok";
    const n5 = evo.chamadas.length;
    const r5b = await enviar(conv3, pedido(conv3, "chave-incerta-0001"));
    ok(r5b.status === 409 && (r5b.corpo as any).codigo === "SEM_CONFIRMACAO" && evo.chamadas.length === n5, "repetir sem confirmar = SEM_CONFIRMACAO e o provedor NÃO é chamado");
    const r5c = await enviar(conv3, pedido(conv3, "chave-incerta-0001", "foto.jpg", JPEG, "Segue", { confirmouReenvio: true }));
    ok(r5c.status === 200 && evo.chamadas.length === n5 + 1 && (await linhas(conv3)) === 1, "confirmando, envia (uma vez)");

    console.log("\n6. A Ana relê: enquanto o envio está em curso, há 'envio de pessoa em curso'");
    const conv4 = await novoAtendimento(office.id, "Beatriz");
    evo.atrasoMs = 600;
    const voo = enviar(conv4, pedido(conv4, "chave-em-curso-0001"));
    await new Promise((r) => setTimeout(r, 250));
    ok(await haEnvioDePessoaEmCurso(conv4.id, new Date()), "haEnvioDePessoaEmCurso = true durante a chamada ao provedor");
    await voo;
    ok(!(await haEnvioDePessoaEmCurso(conv4.id, new Date())), "e false depois de terminar");
    evo.atrasoMs = 0;

    console.log("\n7. Tipos proibidos e conteúdo falso recusados NO SERVIDOR (nada reservado, provedor não chamado)");
    const conv5 = await novoAtendimento(office.id, "Diego");
    const n7 = evo.chamadas.length;
    const casos: [string, string, Buffer][] = [
      ["chave-exe-0000001", "foto.jpg", EXE],
      ["chave-html-000001", "nota.txt", Buffer.from("<html><script>alert(1)</script>")],
      ["chave-svg-0000001", "figura.png", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
      ["chave-exe-nome-01", "setup.exe", JPEG],
      ["chave-dupla-ext-1", "relatorio.exe.pdf", Buffer.from("%PDF-1.7\nx")],
      ["chave-webp-meta-1", "x.bmp", JPEG],
      ["chave-pdf-falso-1", "contrato.pdf", JPEG],
      ["chave-vazio-00001", "vazio.pdf", Buffer.alloc(0)],
    ];
    for (const [chave, nome, corpo] of casos) {
      const r = await enviar(conv5, pedido(conv5, chave, nome, corpo));
      ok(r.status >= 400 && r.status < 500 && !(await reserva(chave)), `${nome} (${corpo.subarray(0, 4).toString("latin1").replace(/[^\x20-\x7e]/g, ".")}): ${r.status} ${(r.corpo as any).codigo}, sem reserva`);
    }
    const rGrande = await enviar(conv5, pedido(conv5, "chave-grande-0001", "foto.jpg", Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)])));
    ok(rGrande.status === 413 && (rGrande.corpo as any).codigo === "GRANDE_DEMAIS" && (rGrande.corpo as any).erro.includes("5 MB"), `imagem de 5 MB+ = 413 com frase clara: ${(rGrande.corpo as any).erro}`);
    const rAudioLegenda = await enviar(conv5, pedido(conv5, "chave-audio-leg-01", "voz.mp3", Buffer.from("ID3\u0004\u0000\u0000", "latin1"), "texto que o áudio não aceita"));
    ok(rAudioLegenda.status === 400 && !(await reserva("chave-audio-leg-01")), "legenda em áudio recusada");
    ok(evo.chamadas.length === n7, "a Evolution não recebeu nada disso");

    console.log("\n8. Recorte: endereço temporário de OUTRA conversa/chave, e a mesma chave em OUTRA conversa");
    const nAntes = evo.chamadas.length;
    const baixados: string[] = [];
    const portasEspia = { ...portas, baixar: async (u: string) => { baixados.push(u); return portas.baixar(u); } };
    const outraConv = urlDoBlob(convDeOutro.id, "chave-recorte-0001", "foto.jpg", JPEG);
    const r8 = await enviarMidiaDoApp(autorizado(conv), { clientMessageId: "chave-recorte-0001", blobUrl: outraConv, nome: "foto.jpg", legenda: "", confirmouReenvio: false }, { portas: portasEspia });
    ok(r8.status === 400 && baixados.length === 0 && !(await reserva("chave-recorte-0001")), "URL de outra conversa: 400, não baixou, não reservou");
    const r8b = await enviarMidiaDoApp(autorizado(conv), { clientMessageId: "chave-recorte-0002", blobUrl: urlDoBlob(conv.id, "chave-recorte-9999", "foto.jpg", JPEG), nome: "foto.jpg", legenda: "", confirmouReenvio: false }, { portas: portasEspia });
    ok(r8b.status === 400 && baixados.length === 0, "URL de outra CHAVE da mesma conversa: 400");
    const r8c = await enviarMidiaDoApp(autorizado(conv), { clientMessageId: "chave-recorte-0003", blobUrl: "https://evil.example.com/atd-saida/x", nome: "foto.jpg", legenda: "", confirmouReenvio: false }, { portas: portasEspia });
    ok(r8c.status === 400 && baixados.length === 0, "URL fora do Blob: 400 (sem SSRF)");
    const r8d = await enviar(conv2, pedido(conv2, "chave-simultanea-01"));
    ok(r8d.status === 409 && (r8d.corpo as any).codigo === "CHAVE_REUTILIZADA" && evo.chamadas.length === nAntes, "a chave de uma conversa usada em OUTRA = CHAVE_REUTILIZADA, sem envio");
    const noAlheio = await prisma.attendance.findFirst({ where: whereDeUmAtendimento({ id: user.id, officeId: office.id, role: "Admin", isAdmin: true } as any, convDeOutro.id) });
    ok(noAlheio === null, "o recorte de escritório da guarda (whereDeUmAtendimento) não acha a conversa de outro escritório (404)");

    console.log("\n9. Limite de envios por pessoa (por minuto)");
    const conv6 = await novoAtendimento(office.id, "Elisa");
    const agora = new Date();
    const codigos: number[] = [];
    // Os 8 pedidos anteriores desta pessoa já contam (as chaves acima); zera a conta para medir só este bloco.
    await prisma.pedidoDeEnvioWhatsapp.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 2 * 3_600_000) } });
    for (let i = 0; i < MAX_MIDIAS_POR_MINUTO + 2; i++) codigos.push((await enviar(conv6, pedido(conv6, `chave-limite-${String(i).padStart(4, "0")}`), { agora })).status);
    ok(codigos.slice(0, MAX_MIDIAS_POR_MINUTO).every((c) => c === 200) && codigos.slice(MAX_MIDIAS_POR_MINUTO).every((c) => c === 429), `primeiros ${MAX_MIDIAS_POR_MINUTO} = 200, depois 429 (${codigos.join(",")})`);
    ok(!(await reserva(`chave-limite-${String(MAX_MIDIAS_POR_MINUTO).padStart(4, "0")}`)), "o pedido barrado pelo limite não reservou nada");

    console.log("\n10. META: janela de 24 h só vale para a Meta");
    const antiga = await novoAtendimento(office.id, "Fernando", 30);
    const rEvoAntiga = await enviar(antiga, pedido(antiga, "chave-evo-antiga-01"), { agora: new Date(Date.now() + 120_000_000) });
    ok(rEvoAntiga.status === 200 || rEvoAntiga.status === 429, `Evolution com a última entrada há 30 h: não é barrada pela janela (status ${rEvoAntiga.status})`);
    await prisma.whatsappConfig.update({ where: { id: cfg.id }, data: { provider: "META", accessToken: "TOKEN-FALSO", phoneNumberId: `1055${Date.now() % 100000}` } });
    await prisma.pedidoDeEnvioWhatsapp.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 2 * 3_600_000) } });
    const rFechada = await enviar(antiga, pedido(antiga, "chave-meta-fechada1", "foto.jpg"));
    ok(rFechada.status === 409 && (rFechada.corpo as any).codigo === "FORA_DA_JANELA" && !(await reserva("chave-meta-fechada1")) && meta.chamadas.length === 0, "Meta, janela fechada: 409 FORA_DA_JANELA, sem reserva e sem chamar a Meta");
    const aberta = await novoAtendimento(office.id, "Gabriela", 1);
    const rMeta = await enviar(aberta, pedido(aberta, "chave-meta-aberta01", "contrato final.pdf", Buffer.from("%PDF-1.7\nx"), "Segue o contrato"));
    ok(rMeta.status === 200 && meta.chamadas.length === 2 && meta.chamadas[0].caminho.endsWith("/media") && meta.chamadas[1].caminho.endsWith("/messages"), `Meta, janela aberta: upload + mensagem (${meta.chamadas.map((c) => c.caminho).join(" ")})`);
    const corpoMeta = JSON.parse(meta.chamadas[1].corpo);
    ok(corpoMeta.type === "document" && corpoMeta.document.id === "MEDIA-1" && corpoMeta.document.filename === "contrato final.pdf" && corpoMeta.document.caption === "Segue o contrato", "mensagem da Meta com id, nome do documento e legenda");
    const rWebp = await enviar(aberta, pedido(aberta, "chave-meta-webp-001", "figura.webp", Buffer.from("RIFF\u0001\u0002\u0003\u0004WEBPVP8 ", "latin1")));
    ok(rWebp.status === 415 && !(await reserva("chave-meta-webp-001")), "webp é recusado pela Meta (aceito só na Evolução)");
    meta.modo = "cai";
    const rMetaIncerta = await enviar(aberta, pedido(aberta, "chave-meta-incerta1"));
    ok(rMetaIncerta.status === 502 && (rMetaIncerta.corpo as any).codigo === "SEM_CONFIRMACAO", "Meta sem resposta no envio = SEM_CONFIRMACAO");

    console.log("\n11. Leitura da mídia enviada pela rota de leitura (recorte por conversa e escritório)");
    const msgEnviada = await prisma.whatsappMessage.findFirst({ where: { attendanceId: conv.id, direction: "OUT" } });
    await prisma.attachment.create({ data: { id: msgEnviada!.attachmentId!, officeId: office.id, attendanceId: conv.id, name: "2026_09_30_WHATSAPP_IMG-foto-chave-.jpg", driveUrl: "https://drive.google.com/x", docType: "MIDIA_WHATSAPP", storageProvider: "GOOGLE_DRIVE", storageFileId: "FID" } });
    const lerComo = (idDaConversa: string, off: string, attId: string) =>
      decidirRespostaDaMidia({ idDaConversa, idDaMensagem: msgEnviada!.id, range: null, baixar: false }, { ...PORTAS_DE_BANCO_DA_MIDIA, guarda: async () => ({ officeId: off, attendanceId: attId }), baixar: async () => ({ content: JPEG, mimeType: "image/jpeg" }) });
    const leitura = await lerComo(conv.id, office.id, conv.id);
    ok(leitura.status === 200 && "headers" in leitura && leitura.headers["Content-Type"] === "image/jpeg" && leitura.headers["X-Content-Type-Options"] === "nosniff", "a conversa dona lê a mídia enviada (200, image/jpeg, nosniff)");
    ok((await lerComo(convDeOutro.id, outro.id, convDeOutro.id)).status === 404, "outro escritório: 404");
    ok((await lerComo(conv2.id, office.id, conv2.id)).status === 404, "outra conversa do mesmo escritório: 404");
  } finally {
    globalThis.fetch = fetchOriginal;
    srvEvo.closeAllConnections?.();
    srvMeta.closeAllConnections?.();
    srvEvo.close();
    srvMeta.close();
    const ids = [office.id, outro.id];
    await prisma.attachment.deleteMany({ where: { officeId: { in: ids } } });
    await prisma.pedidoDeEnvioWhatsapp.deleteMany({ where: { officeId: { in: ids } } });
    await prisma.whatsappMessage.deleteMany({ where: { officeId: { in: ids } } });
    await prisma.attendance.deleteMany({ where: { officeId: { in: ids } } });
    await prisma.whatsappConfig.deleteMany({ where: { officeId: { in: ids } } });
    await prisma.user.deleteMany({ where: { officeId: { in: ids } } });
    await prisma.office.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
  void PORTAS_REAIS_DA_MIDIA_DE_SAIDA;
  console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} verificação(ões) falharam`);
  process.exit(falhas === 0 ? 0 : 1);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
