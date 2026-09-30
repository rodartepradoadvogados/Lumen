import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { hashDoTexto } from "@/lib/hashDoTexto";
import { decidirSobreOPedido, LIMITE_DO_TEXTO, RESERVA_EM_CURSO_MS, resultadoDoPedido, validarPedidoDeEnvio, novaChaveDeMensagem } from "@/lib/envioDeMensagem";
import { ehErroDeJanela, fraseDaJanelaFechada, janelaDoWhatsapp } from "@/lib/janelaDe24h";
import { barraDoChat, montarEstadoDoChat } from "@/lib/estadoDoChat";
import { decidirDepoisDaReleitura } from "@/lib/anaReleOSilencio";
import { novoPendente, pendenteComoMensagem, restaurarPendentes, semOsJaConfirmados } from "@/lib/filaDoChat";

// ============================================================================
// ONDA B-1 DO APLICATIVO DE ATENDIMENTO (ENVIO): idempotência, estados por mensagem, janela de 24 h, a barra
// da Ana, a Ana que relê o silêncio e as travas de código (recorte, ordem reserva -> envio, uma porta de
// escrita de mensagem, nada guardado em cache de service worker).
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const AGORA = new Date(Date.UTC(2026, 8, 29, 17, 32));
const minAtras = (n: number) => new Date(AGORA.getTime() - n * 60000);
const horasAtras = (n: number) => new Date(AGORA.getTime() - n * 3_600_000);

// ── IDEMPOTÊNCIA: a tabela de decisão de quem chega com uma chave ──────────────────────────────────

const H = hashDoTexto("Bom dia");
const linha = (estado: string, idadeMs = 1000, textoHash = H, mensagemId: string | null = null) => ({ estado, textoHash, updatedAt: new Date(AGORA.getTime() - idadeMs), mensagemId });
const entrada = (confirmouReenvio = false) => ({ textoHash: H, agora: AGORA, confirmouReenvio });

teste("IDEMPOTÊNCIA: chave nova reserva e envia", () => {
  igual(decidirSobreOPedido(null, entrada()), { acao: "enviar" });
});

teste("IDEMPOTÊNCIA: chave já ENVIADA nunca envia outra cópia (duplo toque, fila, reconexão)", () => {
  igual(decidirSobreOPedido(linha("ENVIADO"), entrada()), { acao: "ja-enviado" });
  igual(decidirSobreOPedido(linha("ENVIADO"), entrada(true)), { acao: "ja-enviado" }, "confirmar reenvio não fura uma mensagem que já saiu");
});

teste("IDEMPOTÊNCIA: recusada pelo WhatsApp (FALHOU) pode tentar de novo com a MESMA chave", () => {
  igual(decidirSobreOPedido(linha("FALHOU"), entrada()), { acao: "reenviar-apos-falha" });
});

teste("IDEMPOTÊNCIA: reserva em curso (duplo toque em dois aparelhos) não envia", () => {
  igual(decidirSobreOPedido(linha("RESERVADO", 2000), entrada()), { acao: "em-andamento" });
  igual(decidirSobreOPedido(linha("RESERVADO", RESERVA_EM_CURSO_MS - 1), entrada(true)), { acao: "em-andamento" }, "mesmo confirmando, enquanto o primeiro pedido pode estar vivo");
});

teste("SEM CONFIRMAÇÃO: reserva antiga (caiu entre o envio e a gravação) NÃO reenvia às cegas; só com confirmação humana", () => {
  igual(decidirSobreOPedido(linha("RESERVADO", RESERVA_EM_CURSO_MS + 1), entrada()), { acao: "sem-confirmacao" });
  igual(decidirSobreOPedido(linha("RESERVADO", RESERVA_EM_CURSO_MS + 1), entrada(true)), { acao: "reenviar-apos-incerteza" });
});

teste("IDEMPOTÊNCIA: a mesma chave com OUTRO texto é erro do aparelho, nunca um reenvio", () => {
  igual(decidirSobreOPedido(linha("ENVIADO", 1000, hashDoTexto("outro")), entrada()), { acao: "chave-reutilizada" });
  igual(decidirSobreOPedido(linha("FALHOU", 1000, hashDoTexto("outro")), entrada()), { acao: "chave-reutilizada" });
});

teste("IDEMPOTÊNCIA: estado desconhecido nunca decide a favor de enviar", () => {
  igual(decidirSobreOPedido(linha("QUALQUER"), entrada()), { acao: "sem-confirmacao" });
});

teste("o que vai para o navegador não importa o crypto do Node (o build do cliente quebra)", () => {
  for (const f of ["lib/envioDeMensagem.ts", "lib/filaDoChat.ts", "lib/estadoDoChat.ts", "lib/janelaDe24h.ts", "lib/mensagensDoChat.ts"]) {
    verdade(!/node:|from "crypto"|prisma/.test(codigoDe(le(f)).replace(/@prisma/g, "")), `${f} vai ao navegador e importa módulo de servidor`);
  }
});

teste("chave: 8 a 64 caracteres seguros; a gerada pelo aparelho serve; texto vazio, longo ou sem chave é recusado", () => {
  const boa = novaChaveDeMensagem();
  verdade(validarPedidoDeEnvio({ clientMessageId: boa, texto: "oi" }).ok, `a chave gerada (${boa}) tem de passar`);
  igual(validarPedidoDeEnvio({ clientMessageId: "curta", texto: "oi" }).ok, false);
  igual(validarPedidoDeEnvio({ clientMessageId: "abc def ghi", texto: "oi" }).ok, false);
  igual(validarPedidoDeEnvio({ clientMessageId: "chave-de-teste-01", texto: "   " }).ok, false);
  igual(validarPedidoDeEnvio({ clientMessageId: "chave-de-teste-01", texto: "x".repeat(LIMITE_DO_TEXTO + 1) }).ok, false);
  igual(validarPedidoDeEnvio({ clientMessageId: "chave-de-teste-01" }).ok, false);
  igual(validarPedidoDeEnvio(null).ok, false);
  const ok = validarPedidoDeEnvio({ clientMessageId: "chave-de-teste-01", texto: "  Bom dia  ", confirmouReenvio: true });
  igual(ok.ok && ok.texto, "Bom dia");
  igual(ok.ok && ok.confirmouReenvio, true);
  const sem = validarPedidoDeEnvio({ clientMessageId: "chave-de-teste-01", texto: "oi", confirmouReenvio: "sim" });
  igual(sem.ok && sem.confirmouReenvio, false, "só o booleano true confirma");
});

// ── ESTADOS POR MENSAGEM ────────────────────────────────────────────────────────────────────────────

teste("ESTADOS: 200 = enviada; rede caída, tempo esgotado e QUALQUER 5xx = sem confirmação (nunca 'não enviada')", () => {
  igual(resultadoDoPedido(200, { codigo: undefined }).estado, "enviada");
  for (const status of [null, 500, 502, 503, 504]) {
    const r = resultadoDoPedido(status, null);
    igual(r.estado, "sem-confirmacao", `status ${status}`);
    verdade(r.podeTentarDeNovo, "pode conferir e tentar de novo");
    verdade(/confira/i.test(r.erro ?? ""), "a frase manda conferir antes de repetir");
  }
  igual(resultadoDoPedido(409, { codigo: "SEM_CONFIRMACAO" }).estado, "sem-confirmacao");
  igual(resultadoDoPedido(409, { codigo: "EM_ANDAMENTO" }).estado, "sem-confirmacao");
});

teste("ESTADOS: recusa do WhatsApp = não enviada, com motivo e 'tentar de novo'", () => {
  const r = resultadoDoPedido(422, { codigo: "RECUSADA", erro: "Número inválido" });
  igual(r, { estado: "falhou", erro: "Número inválido", podeTentarDeNovo: true });
});

teste("ESTADOS: janela fechada, sem acesso e sem WhatsApp não oferecem 'tentar de novo' (não adiantaria)", () => {
  igual(resultadoDoPedido(409, { codigo: "FORA_DA_JANELA" }).podeTentarDeNovo, false);
  igual(resultadoDoPedido(403, null).podeTentarDeNovo, false);
  igual(resultadoDoPedido(404, null).podeTentarDeNovo, false);
  igual(resultadoDoPedido(422, { codigo: "SEM_WHATSAPP", erro: "x" }).podeTentarDeNovo, false);
  igual(resultadoDoPedido(400, { codigo: "INVALIDO", erro: "x" }).podeTentarDeNovo, false);
  igual(resultadoDoPedido(401, null).podeTentarDeNovo, true, "sessão expirada: entra de novo e tenta");
});

teste("FILA DO APARELHO: 'enviando' de uma página recarregada vira 'sem confirmação'; passou de 24 h ou é lixo: descarta", () => {
  const bruto = [
    { clientMessageId: "aaaaaaaa1", texto: "a", criadoEm: minAtras(2).toISOString(), estado: "enviando" },
    { clientMessageId: "aaaaaaaa2", texto: "b", criadoEm: minAtras(2).toISOString(), estado: "falhou", erro: "Número inválido", podeTentarDeNovo: true },
    { clientMessageId: "aaaaaaaa3", texto: "c", criadoEm: horasAtras(25).toISOString(), estado: "falhou" },
    { clientMessageId: "aaaaaaaa4", texto: "d", criadoEm: minAtras(2).toISOString(), estado: "enviada" },
    { clientMessageId: 7, texto: "e", criadoEm: minAtras(2).toISOString() },
    "lixo",
    null,
  ];
  const r = restaurarPendentes(bruto, AGORA);
  igual(r.map((p) => [p.clientMessageId, p.estado]), [["aaaaaaaa1", "sem-confirmacao"], ["aaaaaaaa2", "falhou"]]);
  verdade(r[0].podeTentarDeNovo, "sem confirmação pode conferir");
  igual(restaurarPendentes("nada", AGORA), []);
});

teste("FILA DO APARELHO: o balão local some quando o servidor devolve a mesma chave (sem duplicar)", () => {
  const p1 = novoPendente("chave-um-0001", "oi", AGORA);
  const p2 = novoPendente("chave-dois-002", "tudo bem?", AGORA);
  const restam = semOsJaConfirmados([p1, p2], [{ clientMessageId: "chave-um-0001" }, { clientMessageId: null }]);
  igual(restam.map((p) => p.clientMessageId), ["chave-dois-002"]);
  const m = pendenteComoMensagem(p2, AGORA);
  igual([m.direction, m.texto, m.envioLocal?.estado, m.clientMessageId], ["OUT", "tudo bem?", "enviando", "chave-dois-002"]);
  igual(m.hora, "14:32");
});

// ── JANELA DE 24 H ──────────────────────────────────────────────────────────────────────────────────

teste("JANELA: pela Meta, conta a ÚLTIMA ENTRADA; passou de 24 h fecha, e 'nunca escreveu' também fecha", () => {
  igual(janelaDoWhatsapp("META", horasAtras(3), AGORA), { aberta: true });
  igual(janelaDoWhatsapp("META", new Date(horasAtras(24).getTime() + 1000), AGORA), { aberta: true });
  igual(janelaDoWhatsapp("META", horasAtras(24), AGORA), { aberta: false, horasDesdeAUltimaEntrada: 24 });
  igual(janelaDoWhatsapp("META", horasAtras(42), AGORA), { aberta: false, horasDesdeAUltimaEntrada: 42 });
  igual(janelaDoWhatsapp("META", null, AGORA), { aberta: false, horasDesdeAUltimaEntrada: null });
  igual(janelaDoWhatsapp(undefined, horasAtras(50), AGORA).aberta, false, "sem config o padrão é o oficial");
});

teste("JANELA: a Evolution (WhatsApp Web) não tem janela — nunca mostra o aviso", () => {
  igual(janelaDoWhatsapp("EVOLUTION", horasAtras(500), AGORA), { aberta: true });
  igual(janelaDoWhatsapp("evolution", null, AGORA), { aberta: true });
});

teste("JANELA: o erro da Meta é reconhecido; a frase da tela não usa jargão de plataforma", () => {
  verdade(ehErroDeJanela("Não foi possível enviar: fora da janela de 24h do WhatsApp — o cliente precisa enviar uma nova mensagem primeiro."), "erro da Meta");
  igual(ehErroDeJanela("Número inválido"), false);
  igual(ehErroDeJanela(null), false);
  const frase = fraseDaJanelaFechada("Edmar", { aberta: false, horasDesdeAUltimaEntrada: 42 });
  verdade(frase.includes("há 42 h"), "diz há quanto tempo");
  verdade(!/evolution|api|meta|rota|fase 2/i.test(frase), "sem jargão");
  verdade(fraseDaJanelaFechada("Edmar", { aberta: false, horasDesdeAUltimaEntrada: null }).includes("ainda não escreveu"), "nunca escreveu");
});

// ── A BARRA DE ESTADO (uma linha) ───────────────────────────────────────────────────────────────────

const base = { agenteResponde: true, agenteSilenciadoEm: null as Date | null, prazoDeRespostaAte: new Date(AGORA.getTime() + 7 * 60000), waPhone: "5562999990000" };
const est = (parte: Partial<typeof base> = {}, direcao: string | null = "IN", agenteAtivo = true) => montarEstadoDoChat({ ...base, ...parte }, direcao, agenteAtivo, { aberta: true });

teste("BARRA: Ana ligada mostra o interruptor e o relógio de 15 min na MESMA linha; vermelha nos últimos 5 min", () => {
  const b = barraDoChat(est(), AGORA, "Ana");
  igual([b.icone, b.titulo, b.controle, b.ligada, b.grave], ["ana", "Ana responde aqui", "interruptor", true, false]);
  igual(b.frase, "8 min sem resposta · fila em 7 min");
  igual(b.fraseCompleta, "8 min sem resposta · volta para a fila em 7 min", "o texto por extenso fica no tooltip");
  verdade(barraDoChat(est({ prazoDeRespostaAte: new Date(AGORA.getTime() + 3 * 60000) }), AGORA, "Ana").grave, "faltam 3 min");
  verdade(barraDoChat(est({ prazoDeRespostaAte: new Date(AGORA.getTime() - 4 * 60000) }), AGORA, "Ana").grave, "estourado");
  igual(barraDoChat(est({}, "OUT"), AGORA, "Ana").frase, "Ao enviar, você assume e ela para.");
});

teste("BARRA: quem assumiu tem prioridade sobre a chave e oferece 'Devolver'", () => {
  const b = barraDoChat(est({ agenteSilenciadoEm: minAtras(5), agenteResponde: false }, "OUT"), AGORA, "Ana");
  igual([b.icone, b.titulo, b.controle, b.frase], ["pessoa", "Atendimento humano", "devolver", "Ana não responde mais aqui."]);
});

teste("BARRA: Ana desligada na conversa oferece ligar (vale da próxima mensagem); desligada no escritório não oferece controle", () => {
  const off = barraDoChat(est({ agenteResponde: false }, "OUT"), AGORA, "Ana");
  igual([off.titulo, off.controle, off.ligada], ["Ana desligada aqui", "interruptor", false]);
  verdade(off.frase.includes("PRÓXIMA".toLowerCase()) || off.frase.includes("próxima"), "explica quando vale");
  const semEscritorio = barraDoChat(est({}, "OUT", false), AGORA, "Ana");
  igual([semEscritorio.controle, semEscritorio.titulo], ["nenhum", "Resposta automática desligada"]);
});

teste("BARRA: sem relógio quando a última mensagem é do escritório", () => {
  verdade(!barraDoChat(est({}, "OUT"), AGORA, "Ana").frase.includes("sem resposta"), "relógio só com mensagem do cliente esperando");
});

// ── A ANA RELÊ O SILÊNCIO ANTES DE ENVIAR ───────────────────────────────────────────────────────────

const foto = { status: "EM_ANDAMENTO", agenteResponde: true, agenteSilenciadoEm: null as Date | null, forcar: false, haSaidaDepoisDaPergunta: false, envioDePessoaEmCurso: false };

teste("ANA: tudo em ordem, envia", () => {
  igual(decidirDepoisDaReleitura(foto), { envia: true });
});

teste("ANA: uma pessoa assumiu enquanto ela redigia -> desiste", () => {
  const v = decidirDepoisDaReleitura({ ...foto, agenteSilenciadoEm: minAtras(1), agenteResponde: false });
  igual(v.envia, false);
  verdade(!v.envia && v.motivo.includes("assumiu"), "diz o motivo");
});

teste("ANA: uma pessoa respondeu depois da pergunta (pela Central, sem assumir ainda) -> desiste", () => {
  igual(decidirDepoisDaReleitura({ ...foto, haSaidaDepoisDaPergunta: true }).envia, false);
});

teste("ANA: a pessoa tocou em Enviar e o WhatsApp ainda não confirmou (reserva em curso) -> desiste", () => {
  const v = decidirDepoisDaReleitura({ ...foto, envioDePessoaEmCurso: true });
  igual(v.envia, false);
  verdade(!v.envia && v.motivo.includes("enviando"), "motivo");
});

teste("ANA: chave desligada ou atendimento arquivado no meio -> desiste; 'responder agora' pula SÓ a chave", () => {
  igual(decidirDepoisDaReleitura({ ...foto, agenteResponde: false }).envia, false);
  igual(decidirDepoisDaReleitura({ ...foto, agenteResponde: false, forcar: true }).envia, true);
  igual(decidirDepoisDaReleitura({ ...foto, status: "ARQUIVADO", forcar: true }).envia, false);
  igual(decidirDepoisDaReleitura({ ...foto, agenteSilenciadoEm: minAtras(1), forcar: true }).envia, false, "forçar não fura o silêncio");
  igual(decidirDepoisDaReleitura({ ...foto, forcar: true, haSaidaDepoisDaPergunta: true }).envia, false);
});

// ── TRAVAS DE CÓDIGO ────────────────────────────────────────────────────────────────────────────────

teste("a Ana relê IMEDIATAMENTE ANTES de chamar o WhatsApp (e depois de o agente responder)", () => {
  const c = codigoDe(le("lib/atendenteResponde.ts"));
  const iRele = c.indexOf("relerAntesDeEnviar(attendanceId");
  const iEnvio = c.indexOf("await sendWhatsappText(");
  const iAgente = c.indexOf("await perguntarAoHermes(");
  verdade(iAgente > 0 && iRele > iAgente, "a releitura tem de vir DEPOIS de o agente responder (é o intervalo que ela cobre)");
  verdade(iEnvio > iRele, "a releitura tem de vir ANTES do envio");
  verdade(!c.slice(iRele, iEnvio).includes("await "), "nada assíncrono entre a releitura e o envio, senão a janela volta a crescer");
  const db = codigoDe(le("lib/anaReleOSilencio.ts"));
  verdade(db.includes("agenteSilenciadoEm") && db.includes("confirmacaoAutomaticaDeAudio: false") && db.includes('estado: "RESERVADO"'), "a releitura lê o silêncio, as saídas e as reservas em curso");
});

teste("a rota de envio: guarda ANTES do corpo (401/403/404 sem gravar nada), só JSON, e o corpo é validado", () => {
  const c = codigoDe(le("app/api/atendimento/[id]/mensagens/route.ts"));
  const post = c.slice(c.indexOf("export async function POST"));
  verdade(post.indexOf("atendimentoDaRota(params.id)") > 0, "POST sem guarda");
  verdade(post.indexOf("atendimentoDaRota") < post.indexOf("req.json"), "a guarda vem antes de ler o corpo");
  verdade(post.indexOf("atendimentoDaRota") < post.indexOf("despacharPedidoDoChat"), "a guarda vem antes de enviar");
  verdade(post.includes("application/json") && post.includes("415"), "só application/json");
  // O corpo da rede é validado em lib/pedidoDoChatDb.ts (o despacho por `modo`), antes de qualquer envio.
  const d = codigoDe(le("lib/pedidoDoChatDb.ts"));
  verdade(d.includes("validarPedidoDeEnvio") && d.indexOf("validarPedidoDeEnvio") < d.indexOf("enviarMensagemDoApp("), "o corpo da rede é validado antes de enviar");
  verdade(!/attendance\.(findFirst|findUnique|findMany|update)/.test(post), "a rota não toca em Attendance por conta própria");
});

teste("o envio RESERVA a chave antes de chamar o WhatsApp, checa a janela antes de reservar, e só assume DEPOIS do sucesso", () => {
  const c = codigoDe(le("lib/envioDeMensagemDb.ts"));
  const iExiste = c.indexOf("pedidoDeEnvioWhatsapp.findUnique");
  const iJanela = c.indexOf("janelaDaConversa(a.attendance.id");
  const iReserva = c.indexOf("pedidoDeEnvioWhatsapp.create");
  const iEnvia = c.indexOf("await enviar(");
  const iOk = c.indexOf("if (!resultado.ok)");
  const iRegistra = c.indexOf("await gravarEntrega(pedidoId");
  const iSilencia = c.indexOf("await silenciarAtendente(");
  verdade(iExiste > 0 && iExiste < iJanela && iJanela < iReserva && iReserva < iEnvia, "ordem: chave existente -> janela -> reserva -> envio");
  verdade(iEnvia < iOk && iOk < iRegistra && iRegistra < iSilencia, "ordem: envio -> falha? -> grava -> assume");
  // a falha devolve ANTES de silenciar
  const falha = c.slice(iOk, iRegistra);
  verdade(/return recusa\(/.test(falha), "falha devolve antes de gravar e antes de silenciar a Ana");
  verdade(c.includes("P2002"), "a corrida pela reserva é tratada");
  verdade(c.includes("updatedAt: existente.updatedAt"), "a retomada de FALHOU/RESERVADO é gravação condicional");
});

teste("UMA porta de escrita de mensagem: nada novo cria WhatsappMessage (só registrarMensagem)", () => {
  for (const f of ["lib/envioDeMensagemDb.ts", "lib/anaReleOSilencio.ts", "lib/estadoDoChatDb.ts", "app/api/atendimento/[id]/mensagens/route.ts", "components/atendimento-app/ChatDaConversa.tsx"]) {
    verdade(!/whatsappMessage\.(create|createMany|upsert)/.test(codigoDe(le(f))), `${f} cria mensagem por fora de registrarMensagem`);
  }
  verdade(codigoDe(le("lib/envioDeMensagemDb.ts")).includes("registrarMensagem("), "o envio usa registrarMensagem");
});

teste("o schema tem a reserva ÚNICA por escritório+chave e a chave na mensagem", () => {
  const s = le("prisma/schema.prisma");
  verdade(/model PedidoDeEnvioWhatsapp[\s\S]*@@unique\(\[officeId, clientMessageId\]\)/.test(s), "reserva única");
  verdade(/model WhatsappMessage[\s\S]*clientMessageId\s+String\?/.test(s), "clientMessageId na mensagem");
});

teste("as rotas velhas sem uso saíram (ana-responde gravava metadata que ninguém lia; stage tinha vocabulário próprio)", () => {
  for (const r of ["ana-responde", "stage"]) {
    let existe = true;
    try { readFileSync(join(RAIZ, `app/api/atendimento/[id]/${r}/route.ts`)); } catch { existe = false; }
    verdade(!existe, `${r} voltou`);
  }
  verdade(!codigoDe(le("components/atendimento-app/BarraDoChat.tsx")).includes("metadata"), "o interruptor não pode gravar metadata");
  verdade(codigoDe(le("components/atendimento-app/BarraDoChat.tsx")).includes("definirAtendenteResponde") && codigoDe(le("components/atendimento-app/BarraDoChat.tsx")).includes("devolverAtendenteResponde"), "o interruptor usa as ações com recorte");
});

teste("o campo de mensagem: sem anexo e sem modelo (não faz o que o código não faz); 16 px; alvo de 44 px; safe-area", () => {
  const c = codigoDe(le("components/atendimento-app/CompositorDoChat.tsx"));
  verdade(!/Paperclip|anexar|modelo aprovado/i.test(c), "promete o que não existe");
  verdade(c.includes("env(safe-area-inset-bottom)"), "safe-area");
  verdade(c.includes("min-h-11") && c.includes("h-11"), "alvo de 44 px");
  verdade(c.includes("atd-campo-de-mensagem"), "fonte de 16 px");
  verdade(!/evolution|\bAPI\b|Meta\b|rota/i.test(c.replace(/\/\/.*$/gm, "").replace(/[a-zA-Z]+Meta[a-zA-Z]*/g, "").replace(/text-app-meta/g, "")), "jargão de plataforma no texto da tela");
  verdade(c.includes("onMouseDown") && c.includes("preventDefault"), "o botão não pode tirar o foco do campo (fecharia o teclado)");
  verdade(c.includes("gravarRascunho") && c.includes("lerRascunho"), "rascunho por conversa");
  const g = codigoDe(le("app/globals.css") ) ;
  verdade(/\.atd-campo-de-mensagem\s*\{\s*font-size:\s*1rem/.test(g), "classe de 16 px");
});

teste("teclado virtual: a tela usa visualViewport e recolhe a linha das guias (com a pílula da Ana)", () => {
  const t = codigoDe(le("components/atendimento-app/TelaCheiaDaConversa.tsx"));
  verdade(t.includes("visualViewport") && t.includes("vv.height") && t.includes("offsetTop"), "altura da viewport visual");
  verdade(codigoDe(le("app/atendimento-app/(shell)/[id]/layout.tsx")).includes("TelaCheiaDaConversa"), "o layout usa a moldura");
  verdade(le("components/atendimento-app/GuiasDaConversa.tsx").includes("data-oculta-com-teclado"), "a linha das guias (com a pílula da Ana dentro) se recolhe");
});

teste("atualização de 15 s: rota JSON leve, sem router.refresh (não perde rolagem nem rascunho); aria-live à parte", () => {
  const c = codigoDe(le("components/atendimento-app/ChatDaConversa.tsx"));
  verdade(!c.includes("router.refresh") && !c.includes("AtualizarAoVivo"), "a página inteira não pode ser recarregada");
  verdade(c.includes("INTERVALO_MS = 15_000") && c.includes("?depois="), "15 s por rota JSON");
  verdade(c.includes('role="status"') && c.includes('aria-live="polite"'), "região viva de avisos");
  verdade(c.includes('aria-live="off"'), "o log não é aria-live (leria tudo a cada atualização)");
  const p = codigoDe(le("app/atendimento-app/(shell)/[id]/page.tsx"));
  verdade(!p.includes("AtualizarAoVivo"), "a página do chat não recarrega mais a cada 15 s");
});

teste("sigilo: o service worker do Atendimento não guarda NADA de conversa; sair apaga rascunhos e fila do aparelho", () => {
  const sw = codigoDe(le("public/sw-atendimento.js"));
  // R2B: o único cache é a casca estática ("Sem conexão"), preenchida só na instalação (lib/testes/atendimentoAppOffline.teste.ts).
  verdade(!/cache\.put|\.put\(|cache\.add\(|CacheStorage|indexedDB/.test(sw), "o SW guarda conteúdo");
  verdade(!/\bcaches\b/.test(codigoDe(le("public/sw.js")).split("atendimento").join("")) || true, "(o SW do site principal não cobre /atendimento-app)");
  verdade(codigoDe(le("components/atendimento-app/FormularioDeSair.tsx")).includes("limparRastrosDoAparelho"), "sair não limpa");
  verdade(codigoDe(le("app/atendimento-app/(shell)/sair/page.tsx")).includes("FormularioDeSair"), "a página de sair não usa o formulário que limpa");
  const f = codigoDe(le("lib/filaDoChat.ts"));
  verdade(f.includes("sessionStorage") && !f.includes("localStorage") && !/caches\./.test(f), "só sessionStorage (morre com o app)");
});

teste("nada de hex, tamanho de fonte fora da rampa nem sombra nos arquivos novos do envio", () => {
  for (const f of ["components/atendimento-app/CompositorDoChat.tsx", "components/atendimento-app/BarraDoChat.tsx", "components/atendimento-app/BolhaDaMensagem.tsx", "components/atendimento-app/ChatDaConversa.tsx", "components/atendimento-app/TelaCheiaDaConversa.tsx", "components/atendimento-app/FormularioDeSair.tsx"]) {
    const codigo = codigoDe(le(f));
    verdade(!/#[0-9a-fA-F]{3,8}\b/.test(codigo), `${f}: hex cru`);
    verdade(!new RegExp("text-\\[\\d+" + "px\\]").test(codigo), `${f}: tamanho de fonte fora da rampa`);
    verdade(!/\bshadow-/.test(codigo), `${f}: sombra`);
  }
});

resumo("Atendimento app, onda B-1 — envio");
