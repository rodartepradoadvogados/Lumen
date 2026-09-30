import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { FRASES_DAS_RESPOSTAS, LIMITE_DE_RESPOSTAS_POR_ESCRITORIO, LIMITE_DO_TEXTO_RAPIDO, LIMITE_DO_TITULO, ordenarRespostas, podeMexerNaResposta, textoDepoisDeInserir, validarResposta } from "@/lib/respostasRapidas";
import { LIMITE_DO_TEXTO } from "@/lib/envioDeMensagem";
import { TAMANHO_DO_TRECHO_FIXADO, mensagemPodeSerFixada, montarFixada, trechoDaMensagem } from "@/lib/mensagemFixada";
import { montarEstadoDoChat } from "@/lib/estadoDoChat";
import { janelaDoWhatsapp } from "@/lib/janelaDe24h";
import { itensDaBarra, ehConversa, abaAtiva } from "@/lib/navegacaoDoAtendimentoApp";

// ============================================================================
// PR 10 DO APLICATIVO DE ATENDIMENTO: RESPONDER (citação local), FIXAR NO TOPO E RESPOSTAS RÁPIDAS. Prova a regra
// pura e varre o código atrás do recorte multi-tenant (escritório em toda consulta, guarda antes de tudo, dono
// para editar) e da regra "inserir nunca envia".
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");

// ── RESPOSTAS RÁPIDAS: validação ─────────────────────────────────────────────────────────────────────────

teste("VALIDAÇÃO: título e texto obrigatórios, com limite; espaços e quebras normalizados", () => {
  igual(validarResposta({ titulo: "  Boas   vindas ", texto: " Olá!\r\nComo posso ajudar? " }), { ok: true, dados: { titulo: "Boas vindas", texto: "Olá!\nComo posso ajudar?" } });
  igual(validarResposta({ titulo: "", texto: "x" }).ok, false);
  igual(validarResposta({ titulo: "x", texto: "   " }).ok, false);
  igual(validarResposta({ titulo: "x".repeat(LIMITE_DO_TITULO + 1), texto: "x" }).ok, false);
  igual(validarResposta({ titulo: "x".repeat(LIMITE_DO_TITULO), texto: "x".repeat(LIMITE_DO_TEXTO_RAPIDO) }).ok, true);
  igual(validarResposta({ titulo: "x", texto: "x".repeat(LIMITE_DO_TEXTO_RAPIDO + 1) }).ok, false);
  igual(validarResposta({ titulo: 5, texto: {} }).ok, false, "tipos errados não quebram");
  igual(validarResposta({}).ok, false);
  verdade(LIMITE_DO_TEXTO_RAPIDO <= LIMITE_DO_TEXTO, "a resposta rápida tem de caber no limite do envio");
});

teste("PERMISSÃO: o autor e o nível total editam e excluem; os demais, não (fechado por padrão)", () => {
  const admin = { id: "a", isAdmin: true, role: "advogado", recebeTransferencia: false };
  const recepcao = { id: "r", isAdmin: false, role: "secretaria", recebeTransferencia: false };
  const advogadoDaEscala = { id: "d1", isAdmin: false, role: "advogado", recebeTransferencia: true };
  const outroAdvogado = { id: "d2", isAdmin: false, role: "advogado", recebeTransferencia: true };
  igual(podeMexerNaResposta(admin, "d1"), true);
  igual(podeMexerNaResposta(recepcao, "d1"), true);
  igual(podeMexerNaResposta(advogadoDaEscala, "d1"), true, "o autor");
  igual(podeMexerNaResposta(outroAdvogado, "d1"), false, "outro do nível 'próprios'");
  igual(podeMexerNaResposta(outroAdvogado, null), false, "sem autor gravado: só o nível total");
  igual(podeMexerNaResposta({ id: "x", isAdmin: false, role: "estagiario", recebeTransferencia: false }, "x"), false, "sem acesso ao Atendimento, nem o autor mexe");
});

teste("INSERIR: acrescenta depois do que já estava escrito, sem apagar; campo vazio recebe só o texto", () => {
  igual(textoDepoisDeInserir("", "Olá"), "Olá");
  igual(textoDepoisDeInserir("   ", "Olá"), "Olá");
  igual(textoDepoisDeInserir("Bom dia,", "Olá"), "Bom dia,\nOlá");
  igual(textoDepoisDeInserir("Bom dia,\n", "Olá"), "Bom dia,\nOlá");
});

teste("ORDEM: alfabética sem acento e sem maiúscula; não altera a lista original", () => {
  const l = [{ titulo: "Ótimo" }, { titulo: "boas-vindas" }, { titulo: "Zap" }, { titulo: "Agenda" }];
  igual(ordenarRespostas(l).map((x) => x.titulo), ["Agenda", "boas-vindas", "Ótimo", "Zap"]);
  igual(l[0].titulo, "Ótimo");
});

// ── FIXAR ────────────────────────────────────────────────────────────────────────────────────────────────

teste("FIXADA: trecho de uma linha, mídia vira rótulo, cortado com reticências; mensagem local não se fixa", () => {
  igual(trechoDaMensagem("Olá,\n  tudo   bem?"), "Olá, tudo bem?");
  igual(trechoDaMensagem("[documento: contrato.pdf] segue"), "Documento: contrato.pdf · segue");
  igual(trechoDaMensagem("[imagem]"), "Imagem");
  igual(trechoDaMensagem(""), "(mensagem vazia)");
  const t = trechoDaMensagem("a".repeat(500));
  verdade(t.length <= TAMANHO_DO_TRECHO_FIXADO && t.endsWith("…"), `trecho longo: ${t.length}`);
  igual(mensagemPodeSerFixada("cmabc123"), true);
  igual(mensagemPodeSerFixada("local-xyz"), false, "o balão 'enviando' do aparelho não tem id de verdade");
  igual(mensagemPodeSerFixada("../x"), false);
  igual(mensagemPodeSerFixada(""), false);
  const f = montarFixada({ whatsappMessageId: "m1", createdAt: new Date("2026-09-29T15:00:00Z"), fixadaPorNome: "Ana" }, { direction: "IN", body: "Preciso da certidão" });
  igual(f, { mensagemId: "m1", autor: "Cliente", trecho: "Preciso da certidão", fixadaPorNome: "Ana", fixadaEm: "2026-09-29T15:00:00.000Z" });
  igual(montarFixada({ whatsappMessageId: "m2", createdAt: new Date(0), fixadaPorNome: null }, { direction: "OUT", body: "ok" }).autor, "Escritório");
});

teste("ESTADO: a fixada viaja com o estado do chat (e sem ela continua nula); montarEstadoDoChat antigo segue valendo", () => {
  const a = { agenteResponde: false, agenteSilenciadoEm: null, prazoDeRespostaAte: null, waPhone: "5562999990000" };
  const janela = janelaDoWhatsapp("META", new Date("2026-09-29T15:00:00Z"), new Date("2026-09-29T16:00:00Z"));
  igual(montarEstadoDoChat(a, "IN", true, janela).fixada, null);
  const f = { mensagemId: "m1", autor: "Cliente" as const, trecho: "x", fixadaPorNome: null, fixadaEm: "2026-09-29T15:00:00.000Z" };
  igual(montarEstadoDoChat(a, "IN", true, janela, f).fixada, f);
});

teste("NAVEGAÇÃO: /respostas-rapidas é tela do app (não id de conversa), acende 'Mais', e a barra é a de quatro alvos", () => {
  igual(ehConversa("/atendimento-app/respostas-rapidas"), false);
  igual(abaAtiva("/atendimento-app/respostas-rapidas"), "mais");
  igual(itensDaBarra("total").map((i) => i.chave), ["conversas", "funil", "triagem", "mais"]);
});

// ── TRAVAS DE CÓDIGO ─────────────────────────────────────────────────────────────────────────────────────

teste("RESPOSTAS (código): toda ação exige sessão e acesso ao Atendimento; toda consulta e escrita leva officeId", () => {
  const f = le("lib/actions/respostasRapidas.ts");
  const c = codigoDe(f);
  verdade(c.includes("podeVerAtendimentos(viewer)") && c.includes("getCurrentUser()"), "sem a porta de acesso");
  for (const nome of ["listarRespostasRapidas", "salvarRespostaRapida", "excluirRespostaRapida"]) {
    const corpo = corpoDaFuncao(f, nome);
    verdade(corpo.length > 80, `${nome} não encontrada`);
    const porta = corpo.indexOf("await quemPode()");
    const primeiraConsulta = corpo.indexOf("prisma.");
    verdade(porta > 0 && porta < primeiraConsulta, `${nome}: a porta de acesso precisa vir antes de qualquer consulta`);
  }
  const consultas = c.split(/prisma\.respostaRapida\./).slice(1).map((t) => t.slice(0, t.indexOf("\n") > 0 ? Math.max(t.indexOf(");"), 120) : 120));
  verdade(consultas.length >= 7, `esperava as consultas de todas as ações, achei ${consultas.length}`);
  for (const q of consultas) verdade(/officeId/.test(q), `consulta/escrita sem officeId: ${q.slice(0, 140)}`);
  verdade(/updateMany\(\{ where: \{ id: atual\.id, officeId: viewer\.officeId \}/.test(c) && /deleteMany\(\{ where: \{ id: atual\.id, officeId: viewer\.officeId \}/.test(c), "escrita sem o escritório no WHERE (id de outro escritório tocaria nada)");
  verdade(/podeMexerNaResposta\(viewer, atual\.criadaPorId\)/.test(c), "editar e excluir sem conferir o autor");
  verdade(/LIMITE_DE_RESPOSTAS_POR_ESCRITORIO/.test(c) && /repetida/.test(c), "limite por escritório e título repetido");
  verdade(LIMITE_DE_RESPOSTAS_POR_ESCRITORIO === 100 && FRASES_DAS_RESPOSTAS.cheio.includes("100"), "o limite e a frase divergem");
});

teste("RESPOSTAS (código): a página lê só do escritório; o chat INSERE e nunca envia", () => {
  const p = codigoDe(le("app/atendimento-app/(shell)/respostas-rapidas/page.tsx"));
  verdade(p.includes("exigirAcessoAoAtendimentoNaTela()") && /where: \{ officeId: viewer\.officeId \}/.test(p), "a página precisa da porta e do recorte do escritório");
  const r = codigoDe(le("components/atendimento-app/RespostasRapidasDoChat.tsx"));
  verdade(!/aoEnviar|enviar\(|fetch\(|sendWhatsapp/.test(r), "a lista de respostas não pode enviar");
  verdade(/aoInserir\(i\.texto\)/.test(r) && /role="dialog"/.test(r) && /aria-modal="true"/.test(r) && /Escape/.test(r), "inserção, diálogo e Esc");
  const c = corpoDaFuncao(codigoDe(le("components/atendimento-app/CompositorDoChat.tsx")), "inserir");
  verdade(c.length > 50 && !/aoEnviar/.test(c), "inserir não pode chamar o envio");
  const m = codigoDe(le("components/atendimento-app/ManterRespostasRapidas.tsx"));
  verdade(/Excluir “\{i\.titulo\}” para todo o escritório\?/.test(m) && /role="alert"/.test(m) && /maxLength=\{LIMITE_DO_TITULO\}/.test(m), "confirmação de exclusão, erro e limites");
});

teste("FIXAR (código): guarda atendimentoDaAcao antes de tudo; a mensagem tem de ser DESTE atendimento e escritório; leitura confere de novo", () => {
  const f = le("lib/actions/mensagemFixada.ts");
  for (const nome of ["fixarMensagem", "desafixarMensagem"]) {
    const c = corpoDaFuncao(f, nome);
    const guarda = c.indexOf("await atendimentoDaAcao(idDoAtendimento)");
    verdade(guarda > 0 && guarda < 350 && !/prisma\./.test(c.slice(0, guarda)), `${nome} não começa pela guarda`);
  }
  const fixar = corpoDaFuncao(f, "fixarMensagem");
  verdade(/where: \{ id: idDaMensagem, attendanceId: attendance\.id, officeId: viewer\.officeId \}/.test(fixar), "a mensagem a fixar precisa ser deste atendimento e deste escritório");
  verdade(/where: \{ attendanceId: attendance\.id \}/.test(fixar), "uma fixada por atendimento (upsert pelo atendimento AUTORIZADO)");
  verdade(/where: \{ attendanceId: attendance\.id, officeId: viewer\.officeId \}/.test(corpoDaFuncao(f, "desafixarMensagem")), "desafixar sem o escritório");
  const db = codigoDe(le("lib/mensagemFixadaDb.ts"));
  verdade(/mensagemFixada\.findFirst\(\{ where: \{ attendanceId, officeId \}/.test(db) && /whatsappMessage\.findFirst\(\{ where: \{ id: f\.whatsappMessageId, attendanceId, officeId \}/.test(db), "a leitura confere a mensagem no atendimento e no escritório");
  verdade(/lerFixadaDoAtendimento/.test(codigoDe(le("lib/estadoDoChatDb.ts"))), "o estado do chat (a atualização de 15 s) precisa trazer a fixada, para a equipe ver");
});

teste("SCHEMA: os dois modelos novos são aditivos, com escritório e índice; a fixada é única por atendimento", () => {
  const s = le("prisma/schema.prisma");
  const fix = s.slice(s.indexOf("model MensagemFixada {"), s.indexOf("model RespostaRapida {"));
  verdade(/attendanceId\s+String\s+@unique/.test(fix) && /officeId\s+String/.test(fix) && /onDelete: Cascade/.test(fix), "MensagemFixada");
  const rr = s.slice(s.indexOf("model RespostaRapida {"), s.indexOf("model NotaDaConversa {"));
  verdade(/officeId\s+String/.test(rr) && /@@index\(\[officeId, titulo\]\)/.test(rr) && !/@relation/.test(rr), "RespostaRapida");
  verdade(/mensagemFixada\s+MensagemFixada\?/.test(s), "relação de volta no Attendance");
});

teste("RESPONDER (código): a citação é só local — o envio não recebe a citação e o contrato de idempotência não mudou", () => {
  const chat = codigoDe(le("components/atendimento-app/ChatDaConversa.tsx"));
  verdade(/aoEnviar=\{enviar\}/.test(chat) && !/citando[^\n]*clientMessageId|texto: `[^`]*citando/.test(chat), "a citação não pode entrar no texto enviado");
  const envio = codigoDe(le("lib/envioDeMensagemDb.ts"));
  verdade(!/citando|contextoDe|replyTo|quoted|context:/.test(envio), "o envio não conhece citação");
  const comp = codigoDe(le("components/atendimento-app/CompositorDoChat.tsx"));
  verdade(/Só você vê esta citação/.test(comp) && /aoLimparCitacao\?\.\(\)/.test(comp), "a barra diz que é local e some ao enviar");
  const menu = codigoDe(le("components/atendimento-app/AcoesDaMensagem.tsx"));
  verdade(/O cliente não a vê/.test(menu), "o menu diz que o cliente não vê");
});

teste("TELA (código): alvos de 44 px, sem faixa lateral, sem hex, sem sombra nos arquivos novos do PR 10", () => {
  for (const f of ["AcoesDaMensagem", "FixadaDoChat", "RespostasRapidasDoChat", "ManterRespostasRapidas"]) {
    const c = codigoDe(le(`components/atendimento-app/${f}.tsx`));
    verdade(!/#[0-9a-fA-F]{3,8}\b/.test(c), `${f}: hex cru`);
    verdade(!/\bshadow-/.test(c), `${f}: sombra`);
    verdade(!/border-l-|border-r-/.test(c), `${f}: faixa lateral`);
    verdade(!new RegExp("text-\\[\\d+" + "px\\]").test(c), `${f}: fonte fora da rampa`);
    verdade(/min-h-11|h-11/.test(c), `${f}: sem alvo de 44 px`);
  }
  const b = codigoDe(le("components/atendimento-app/BolhaDaMensagem.tsx"));
  verdade(/aria-label=\{`Mais ações da mensagem/.test(b) && /h-11 w-11/.test(b), "o botão do menu da mensagem: nome e 44 px");
});

resumo("Atendimento app, PR 10 — responder, fixar e respostas rápidas");
