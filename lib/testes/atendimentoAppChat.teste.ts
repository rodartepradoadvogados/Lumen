import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { TAMANHO_DA_PAGINA, agruparMensagensPorDia, codificarCursor, filtroAntesDoCursor, lerCursor, mesclarMensagens, paginaDeMensagens, prepararMensagem } from "@/lib/mensagensDoChat";

// ============================================================================
// ONDA A DO APLICATIVO DE ATENDIMENTO, ETAPA 3 (chat em leitura): as últimas 60 mensagens, "carregar
// anteriores" por cursor, mídia e áudio como rótulo, e o recorte de acesso da conversa, dos detalhes e da
// rota JSON — regra pura + travas de código.
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const AGORA = new Date(Date.UTC(2026, 8, 29, 17, 32));
const minAtras = (n: number) => new Date(AGORA.getTime() - n * 60000);


// ── CHAT: PAGINAÇÃO ─────────────────────────────────────────────────────────────────────────────

const msgs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${String(i).padStart(4, "0")}`, createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)) }));

teste("PÁGINA: 400 mensagens -> as últimas 60, em ordem de leitura, com cursor para as anteriores", () => {
  const todas = msgs(400);
  const daConsulta = [...todas].reverse().slice(0, TAMANHO_DA_PAGINA + 1); // mais novas primeiro, limite+1
  const p = paginaDeMensagens(daConsulta);
  igual(p.mensagens.length, 60);
  igual(p.mensagens[0].id, "m0340");
  igual(p.mensagens[59].id, "m0399");
  verdade(p.temAnteriores, "há anteriores");
  igual(p.cursorDasAnteriores, codificarCursor(todas[340]));
});

teste("PÁGINA: conversa curta (<= 60) não tem 'carregar anteriores' nem cursor", () => {
  const p = paginaDeMensagens([...msgs(25)].reverse());
  igual(p.mensagens.length, 25);
  igual(p.temAnteriores, false);
  igual(p.cursorDasAnteriores, null);
  const exata = paginaDeMensagens([...msgs(60)].reverse().slice(0, 61));
  igual(exata.temAnteriores, false, "exatamente 60: nada antes");
  const vazia = paginaDeMensagens([]);
  igual(vazia.mensagens, []);
  igual(vazia.cursorDasAnteriores, null);
});

teste("PÁGINA: percorrer as anteriores em blocos de 60 até o começo, sem repetir nem pular", () => {
  const todas = msgs(400);
  let antes: { criadoEm: Date; id: string } | null = null;
  const vistas: string[] = [];
  let paginas = 0;
  for (;;) {
    const candidatas = todas.filter((m) => !antes || m.createdAt < antes.criadoEm || (m.createdAt.getTime() === antes.criadoEm.getTime() && m.id < antes.id));
    const linhas = [...candidatas].reverse().slice(0, 61);
    const p = paginaDeMensagens(linhas);
    vistas.unshift(...p.mensagens.map((m) => m.id));
    paginas++;
    if (!p.temAnteriores) break;
    antes = lerCursor(p.cursorDasAnteriores);
    verdade(antes, "cursor válido");
  }
  igual(paginas, 7);
  igual(vistas.length, 400);
  igual(new Set(vistas).size, 400);
  igual(vistas, todas.map((m) => m.id));
});

teste("PÁGINA: duas mensagens no MESMO instante não se perdem na fronteira (o id desempata)", () => {
  const t = new Date(Date.UTC(2026, 8, 1, 12));
  const dup = [{ id: "a", createdAt: t }, { id: "b", createdAt: t }, { id: "c", createdAt: t }];
  const primeira = paginaDeMensagens([...dup].reverse(), 2); // c, b (+a de sobra)
  igual(primeira.mensagens.map((m) => m.id), ["b", "c"]);
  const cur = lerCursor(primeira.cursorDasAnteriores)!;
  const f = filtroAntesDoCursor(cur) as { OR: Array<Record<string, unknown>> };
  igual(f.OR.length, 2);
  igual(f.OR[1], { createdAt: t, id: { lt: "b" } });
  igual(filtroAntesDoCursor(null), {});
});

teste("cursor da URL é palpite: só instante válido e id de formato conhecido", () => {
  verdade(lerCursor("2026-09-01T00:00:00.000Z|cmabc123"), "válido");
  igual(lerCursor(null), null);
  igual(lerCursor(""), null);
  igual(lerCursor("lixo"), null);
  igual(lerCursor("2026-09-01T00:00:00.000Z|"), null);
  igual(lerCursor("nao-e-data|abc"), null);
  igual(lerCursor("2026-09-01T00:00:00.000Z|a b'; drop"), null);
});

teste("mesclar: sem repetir, em ordem, e a versão nova de uma mensagem vence", () => {
  const m = (id: string, min: number, texto = id) => prepararMensagem({ id, direction: "IN", porAgente: false, body: texto, status: "RECEIVED", createdAt: new Date(Date.UTC(2026, 8, 29, 10, min)) }, AGORA);
  const r = mesclarMensagens([m("b", 2), m("c", 3)], [m("a", 1), m("c", 3, "c editada"), m("d", 4)]);
  igual(r.map((x) => x.id), ["a", "b", "c", "d"]);
  igual(r[2].texto, "c editada");
});

teste("mensagem preparada: horas em Brasília, dia com rótulo, áudio com transcrição, falha e envio", () => {
  const audio = prepararMensagem(
    { id: "m1", direction: "IN", porAgente: false, body: "[áudio]", status: "RECEIVED", createdAt: new Date(Date.UTC(2026, 8, 29, 13, 5)), transcricao: { status: "PRONTA", texto: "  preciso de um advogado  ", erro: null } },
    AGORA,
  );
  igual(audio.midia?.tipo, "audio");
  igual(audio.texto, "");
  igual(audio.hora, "10:05");
  igual(audio.rotuloDoDia, "Hoje");
  igual(audio.transcricao, { texto: "preciso de um advogado", ehConteudo: true });
  const pendente = prepararMensagem({ id: "m2", direction: "IN", porAgente: false, body: "[áudio]", status: "RECEIVED", createdAt: minAtras(1), transcricao: { status: "PENDENTE", texto: null, erro: null } }, AGORA);
  igual(pendente.transcricao, { texto: "Transcrevendo…", ehConteudo: false });
  const falhou = prepararMensagem({ id: "m3", direction: "OUT", porAgente: false, body: "oi", status: "FAILED", createdAt: minAtras(1) }, AGORA);
  verdade(falhou.falhou && !falhou.enviada, "falhou");
  const enviada = prepararMensagem({ id: "m4", direction: "OUT", porAgente: true, body: "oi", status: "SENT", createdAt: minAtras(1) }, AGORA);
  verdade(enviada.enviada && enviada.porAgente, "enviada pela Ana");
  const ontem = prepararMensagem({ id: "m5", direction: "IN", porAgente: false, body: "x", status: "RECEIVED", createdAt: new Date(Date.UTC(2026, 8, 28, 15)) }, AGORA);
  igual(ontem.rotuloDoDia, "Ontem");
});

teste("dia: agrupa por dia de Brasília (22h em Brasília já é o dia seguinte em UTC)", () => {
  const de = (id: string, iso: string) => prepararMensagem({ id, direction: "IN", porAgente: false, body: id, status: "RECEIVED", createdAt: new Date(iso) }, AGORA);
  const g = agruparMensagensPorDia([de("a", "2026-09-28T23:30:00Z"), de("b", "2026-09-29T01:30:00Z"), de("c", "2026-09-29T15:00:00Z")]);
  igual(g.map((x) => x.mensagens.map((m) => m.id)), [["a", "b"], ["c"]]);
  igual(g.map((x) => x.rotulo), ["Ontem", "Hoje"]);
});

// ── TRAVAS DE CÓDIGO: o recorte de acesso nas telas e rotas novas ───────────────────────────────

teste("a rota JSON de mensagens passa pela guarda ANTES de tocar em qualquer coisa, e valida o cursor", () => {
  const codigo = codigoDe(le("app/api/atendimento/[id]/mensagens/route.ts"));
  verdade(codigo.includes("atendimentoDaRota(params.id)"), "sem a guarda do Atendimento");
  verdade(codigo.indexOf("atendimentoDaRota") < codigo.indexOf("carregarPaginaDoChat"), "a guarda vem antes da leitura");
  verdade(!/officeId:\s*viewer\.officeId/.test(codigo.replace(/carregarPaginaDoChat\([^)]*\)/g, "")), "filtro só por escritório");
  verdade(codigo.includes("lerCursor"), "cursor não validado");
});

teste("a leitura de mensagens recebe o id JÁ AUTORIZADO e ainda amarra o escritório", () => {
  const codigo = codigoDe(le("lib/mensagensDoChatDb.ts"));
  verdade(/where:\s*\{\s*attendanceId,\s*officeId/.test(codigo), "o where da consulta tem de levar attendanceId E officeId");
});

teste("a conversa e os detalhes só abrem pelo recorte por dono (whereDeUmAtendimento), e a conversa alheia não vaza dado", () => {
  const dados = codigoDe(le("app/atendimento-app/(shell)/[id]/dados.ts"));
  verdade(dados.includes("whereDeUmAtendimento(viewer, id)"), "dados.ts sem o recorte");
  const detalhes = codigoDe(le("app/atendimento-app/(shell)/[id]/detalhes/page.tsx"));
  verdade(detalhes.includes("whereDeUmAtendimento(viewer, params.id)"), "detalhes sem o recorte");
  const chat = codigoDe(le("app/atendimento-app/(shell)/[id]/page.tsx"));
  verdade(chat.indexOf("carregarConversaDoApp") < chat.indexOf("carregarPaginaDoChat("), "o chat só lê mensagens depois do recorte");
  verdade(/if \(!c\) return <SemAcessoAConversa \/>/.test(chat), "chat sem o estado 'sem acesso'");
  // o componente do 'sem acesso' não recebe nem mostra dado do lead
  const sem = codigoDe(le("components/atendimento-app/SemAcessoAConversa.tsx"));
  verdade(!/props|clientName|waPhone|body/.test(sem.replace(/\(\)/g, "")), "SemAcessoAConversa não pode receber dado do lead");
});

teste("nenhum Attendance lido só por officeId nas telas novas do app", () => {
  for (const f of ["app/atendimento-app/(shell)/[id]/dados.ts", "app/atendimento-app/(shell)/[id]/detalhes/page.tsx"]) {
    const codigo = codigoDe(le(f));
    verdade(!/officeId:\s*viewer\.officeId/.test(codigo.replace(/whereDoAtendimento\([^)]*\)/g, "")) || /whereDoAtendimento|whereDeUmAtendimento/.test(codigo), `${f}: officeId cru`);
  }
});

teste("nada de hex, de fonte fora da rampa nem de sombra nos arquivos novos do app (só tokens)", () => {
  const arquivos = [
    "components/atendimento-app/ChatDaConversa.tsx",
    "components/atendimento-app/CabecalhoDaConversa.tsx",
    "components/atendimento-app/GuiasDaConversa.tsx",
    "components/atendimento-app/BarraDoChat.tsx",
    "components/atendimento-app/BolhaDaMensagem.tsx",
    "components/atendimento-app/CompositorDoChat.tsx",
    "components/atendimento-app/TelaCheiaDaConversa.tsx",
    "app/atendimento-app/(shell)/[id]/page.tsx",
    "app/atendimento-app/(shell)/[id]/layout.tsx",
  ];
  for (const f of arquivos) {
    const codigo = codigoDe(le(f));
    verdade(!/#[0-9a-fA-F]{3,8}\b/.test(codigo), `${f}: hex cru`);
    verdade(!new RegExp("text-\\[\\d+" + "px\\]").test(codigo), `${f}: tamanho de fonte fora da rampa`);
    verdade(!/\bshadow-/.test(codigo), `${f}: sombra`);
  }
});

resumo("Atendimento app, onda A — chat em leitura");
