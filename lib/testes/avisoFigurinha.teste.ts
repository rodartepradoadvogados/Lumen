import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { ROTULO_FIGURINHA, TEXTO_FIGURINHA_PARA_AGENTE } from "@/lib/whatsapp";

// ============================================================================
// O AVISO DE FIGURINHA — fora do pedido do webhook, pelo MESMO desenho da transcrição
// assíncrona (lib/testes/transcricaoAssincrona.teste.ts é o espelho direto desta suíte).
//
// O PEDIDO DO DONO, em quatro condições, cada uma com teste próprio abaixo:
//   1. SÓ FIGURINHA — nada de texto, nenhuma outra mídia — dispara o mecanismo.
//   2. FIGURINHA COM TEXTO (ou mídia) não dispara nada — o texto/mídia já é o que importa.
//   3. MENSAGEM DE VERDADE chegando dentro da janela cancela o aviso.
//   4. FIGURINHA REPETIDA (uma leva) — aviso uma vez só, não a cada figurinha.
//
// NADA AQUI CHAMA A ROTA/FUNÇÃO DE VERDADE QUANDO ISSO TOCARIA O BANCO (Prisma): este ambiente não
// tem acesso de rede ao Postgres. Os dois caminhos de AUTORIZAÇÃO (401 sem segredo / segredo
// errado) são seguros de invocar de verdade porque retornam ANTES de tocar o banco — o resto é
// varredura de código-fonte, como a suíte-irmã da transcrição.
// ============================================================================

const avisoFonte = readFileSync("lib/avisoFigurinha.ts", "utf8");
const rotaProcessarFonte = readFileSync("app/api/whatsapp/aviso-figurinha/processar/route.ts", "utf8");
const rotaCronFonte = readFileSync("app/api/cron/avisos-de-figurinha/route.ts", "utf8");
const atendenteFonte = readFileSync("lib/atendenteResponde.ts", "utf8");
const rotaMetaFonte = readFileSync("app/api/whatsapp/route.ts", "utf8");
const rotaEvolutionFonte = readFileSync("app/api/whatsapp/evolution/route.ts", "utf8");

// ── 0. Os dois textos nunca podem ser o mesmo ────────────────────────────────────────────────

teste("ROTULO_FIGURINHA (o que a tela mostra) e TEXTO_FIGURINHA_PARA_AGENTE (o que a Ana lê) são coisas diferentes", () => {
  verdade(ROTULO_FIGURINHA.length > 0 && ROTULO_FIGURINHA.length < 20, "o rótulo da bolha deixou de ser curto");
  verdade(TEXTO_FIGURINHA_PARA_AGENTE.length > ROTULO_FIGURINHA.length, "o texto para a Ana ficou tão curto quanto o rótulo da tela — perdeu a instrução");
  verdade((TEXTO_FIGURINHA_PARA_AGENTE as string) !== (ROTULO_FIGURINHA as string), "os dois textos viraram o mesmo — a Ana leria só o rótulo cru, sem instrução nenhuma");
});

// ── 1. dispararAvisoFigurinha — fire-and-forget, fail-closed ────────────────────────────────

async function chamarRotaProcessar(headers: Record<string, string>): Promise<number> {
  const { POST } = await import("@/app/api/whatsapp/aviso-figurinha/processar/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest("http://localhost/api/whatsapp/aviso-figurinha/processar", {
    method: "POST",
    headers,
    body: JSON.stringify({ waMessageId: "wamid.NUNCA-CHEGA-A-EXISTIR" }),
  });
  const res = await POST(req);
  return res.status;
}

// TUDO NUM TESTE SÓ, DE PROPÓSITO — mesma razão da suíte-irmã: `teste()` roda todos os corpos ao
// mesmo tempo, e todos mutam a MESMA variável de ambiente global (AVISO_FIGURINHA_INTERNA_SECRET).
teste("MUTAÇÃO-ALVO: dispararAvisoFigurinha é fail-closed e dispara certo; a rota interna recusa (401) em todos os casos sem o segredo certo", async () => {
  const original = process.env.AVISO_FIGURINHA_INTERNA_SECRET;
  const fetchOriginal = global.fetch;
  try {
    const { dispararAvisoFigurinha } = await import("@/lib/avisoFigurinha");

    // 1) SEM o segredo: nem tenta disparar.
    delete process.env.AVISO_FIGURINHA_INTERNA_SECRET;
    let chamou = false;
    global.fetch = (...args: Parameters<typeof fetch>) => {
      chamou = true;
      return fetchOriginal(...args);
    };
    dispararAvisoFigurinha("wamid.QUALQUER");
    await new Promise((r) => setTimeout(r, 20));
    verdade(!chamou, "sem o segredo configurado, o disparo chamou fetch mesmo assim — a rota interna recusaria, mas nem deveria tentar");
    global.fetch = fetchOriginal;

    // 2) Ainda SEM o segredo: a rota interna de verdade recusa qualquer Authorization —
    // inclusive "Bearer undefined" (o bypass exato se a checagem explícita `if (!segredo)` sumir).
    igual(await chamarRotaProcessar({ authorization: "Bearer qualquer-coisa" }), 401, "sem o segredo configurado, com um Authorization qualquer: ");
    igual(
      await chamarRotaProcessar({ authorization: "Bearer undefined" }),
      401,
      "sem o segredo configurado, mandando literalmente 'Bearer undefined': ",
    );

    // 3) COM o segredo: o disparo manda o pedido certo — método, Authorization e corpo.
    process.env.AVISO_FIGURINHA_INTERNA_SECRET = "segredo-de-teste-456";
    let pedido: { url: string; opcoes: RequestInit } | null = null;
    // @ts-expect-error -- espião de teste
    global.fetch = (url: string, opcoes: RequestInit) => {
      pedido = { url, opcoes };
      return Promise.resolve(new Response(JSON.stringify({ received: true }), { status: 200 }));
    };
    dispararAvisoFigurinha("wamid.ABC123");
    await new Promise((r) => setTimeout(r, 20));
    verdade(pedido !== null, "com o segredo configurado, o disparo não chamou fetch nenhuma");
    const p = pedido as unknown as { url: string; opcoes: RequestInit };
    verdade(p.url.endsWith("/api/whatsapp/aviso-figurinha/processar"), `a URL do disparo está errada: ${p.url}`);
    igual(p.opcoes.method, "POST");
    const headers = p.opcoes.headers as Record<string, string>;
    igual(headers.authorization, "Bearer segredo-de-teste-456");
    igual(JSON.parse(String(p.opcoes.body)), { waMessageId: "wamid.ABC123" });
    global.fetch = fetchOriginal;

    // 4) Ainda COM o segredo certo: a rota interna de verdade recusa segredo errado e ausência de
    // Authorization.
    igual(await chamarRotaProcessar({ authorization: "Bearer segredo-errado" }), 401, "com o segredo errado: ");
    igual(await chamarRotaProcessar({}), 401, "sem cabeçalho Authorization nenhum: ");
  } finally {
    global.fetch = fetchOriginal;
    if (original === undefined) delete process.env.AVISO_FIGURINHA_INTERNA_SECRET;
    else process.env.AVISO_FIGURINHA_INTERNA_SECRET = original;
  }
});

teste("MUTAÇÃO-ALVO: dispararAvisoFigurinha não espera a conclusão — nada de `await fetch`", () => {
  const corpo = corpoDaFuncao(avisoFonte, "dispararAvisoFigurinha");
  verdade(corpo.length > 0, "dispararAvisoFigurinha não existe mais, ou mudou de assinatura");
  verdade(!/await fetch\(/.test(corpo), "dispararAvisoFigurinha passou a esperar (`await`) o fetch — isso prende o pedido que chamou (o webhook)");
  verdade(/fetch\([^)]*\)[\s\S]*?\.catch\(/.test(corpo), "o fetch não tem `.catch()` — uma rejeição não tratada pode derrubar o processo");
});

// ── 2. processarAvisoFigurinha — a espera, a idempotência, a reivindicação, a reavaliação ────

teste("MUTAÇÃO-ALVO: processarAvisoFigurinha só espera quando MANDADO a esperar — o cron não deve esperar de novo", () => {
  const corpo = corpoDaFuncao(avisoFonte, "processarAvisoFigurinha");
  verdade(corpo.length > 0, "processarAvisoFigurinha não existe mais, ou mudou de assinatura");
  verdade(
    /if\s*\(opcoes\.esperarMs\)\s*\{[\s\S]*setTimeout/.test(corpo),
    "a espera de 15s deixou de ser condicional a `opcoes.esperarMs` — o cron (que chama sem isso) passaria a esperar de novo, competindo ainda mais com o disparo imediato",
  );
});

teste("MUTAÇÃO-ALVO: processarAvisoFigurinha só age sobre uma figurinha IN que ainda está RECEIVED (tripla checagem de idempotência)", () => {
  // CONDIÇÃO 2 do pedido: figurinha com texto (ou mídia) nunca teria body === ROTULO_FIGURINHA —
  // ela nem chega a disparar este caminho (ver o `else if` das rotas de webhook, mais abaixo).
  // Aqui a checagem defende contra o que PODE chegar por engano: mensagem errada, mensagem OUT,
  // ou uma figurinha que outra chamada já reivindicou.
  const corpo = corpoDaFuncao(avisoFonte, "processarAvisoFigurinha");
  verdade(
    /if\s*\(!mensagem \|\| mensagem\.direction !== "IN" \|\| mensagem\.body !== ROTULO_FIGURINHA\)\s*return;/.test(corpo),
    "a checagem de identidade (existe, é do cliente, ainda é o rótulo de figurinha) sumiu ou mudou de forma",
  );
  verdade(
    /if\s*\(mensagem\.status !== "RECEIVED"\)\s*return;/.test(corpo),
    "a checagem de idempotência por status sumiu — o disparo imediato e o cron pegando o MESMO item processariam os dois, mandando o aviso em dobro",
  );
});

teste("MUTAÇÃO-ALVO: 'ainda é a última mensagem' compara pelo ID da mensagem mais recente da conversa — é isso que cancela o aviso quando uma mensagem de verdade chega na janela, ou colapsa uma leva de figurinhas num aviso só", () => {
  // CONDIÇÕES 3 e 4 do pedido do dono. A prova é a MESMA consulta para as duas: só a mensagem que
  // ainda é a mais nova da conversa (por `createdAt desc`) passa; uma mensagem de verdade dentro
  // da janela, OU uma figurinha mais nova da mesma leva, tira essa condição de todas as
  // anteriores.
  const corpo = codigoDe(avisoFonte);
  verdade(
    corpo.includes("const maisRecente = await prisma.whatsappMessage.findFirst({"),
    "a consulta que descobre a mensagem mais recente da conversa sumiu",
  );
  verdade(/orderBy:\s*\{\s*createdAt:\s*"desc"\s*\}/.test(corpo), "a consulta parou de ordenar por createdAt desc — não acharia mais a mensagem mais recente");
  verdade(
    corpo.includes("const aindaEhAUltima = maisRecente?.id === mensagem.id;"),
    "a comparação 'ainda é a última' mudou de forma — sem ela, nada cancela o aviso quando algo mais novo chega, e uma leva de figurinhas avisaria uma vez por figurinha",
  );
});

teste("MUTAÇÃO-ALVO: a reivindicação (updateMany por status) vem ANTES de chamar atendenteResponde, nunca depois", () => {
  // A CORRIDA QUE ISTO EVITA: disparo imediato e cron pegando a MESMA figurinha seguem em
  // paralelo até aqui; sem reivindicar ANTES de mandar a mensagem de verdade, os dois passariam
  // pela checagem "ainda é a última" ao mesmo tempo e os dois chamariam atendenteResponde — o
  // cliente receberia o aviso em dobro.
  const corpo = codigoDe(avisoFonte);
  const idxReivindica = corpo.indexOf('data: { status: aindaEhAUltima ? STATUS_FIGURINHA_AVISADA : STATUS_FIGURINHA_SUPERADA }');
  const idxAtendente = corpo.indexOf("await atendenteResponde(mensagem.attendanceId);");
  verdade(idxReivindica >= 0, "a reivindicação atômica (updateMany com o status antigo no where) sumiu ou mudou de forma");
  verdade(idxAtendente > idxReivindica, "atendenteResponde é chamado ANTES (ou sem relação clara com) a reivindicação — a corrida entre disparo e cron deixou de estar fechada");
  verdade(corpo.includes("if (reivindicou.count === 0) return;"), "sem checar `count === 0`, uma reivindicação perdida não impede o código de continuar e mandar a mensagem mesmo assim");
});

teste("MUTAÇÃO-ALVO: a reavaliação é a MESMA atendenteResponde de sempre — nunca um caminho de envio paralelo", () => {
  // Pedido do dono: "passa pelas mesmas travas de sempre (limites duros, orçamento do prompt)".
  // A prova é dupla: CHAMA atendenteResponde, e NÃO manda mensagem por nenhum outro meio.
  const corpo = codigoDe(avisoFonte);
  verdade(corpo.includes("await atendenteResponde(mensagem.attendanceId)"), "processarAvisoFigurinha parou de chamar atendenteResponde — a reavaliação completa (deveResponder, silêncio, última mensagem do cliente) sumiria");
  verdade(!corpo.includes("sendWhatsappText("), "lib/avisoFigurinha.ts está chamando sendWhatsappText diretamente — isso criaria um caminho de envio paralelo, sem os limites duros nem o orçamento do prompt");
  verdade(!corpo.includes("perguntarAoHermes("), "lib/avisoFigurinha.ts está chamando o Hermes diretamente — isso pularia toda a composição de lib/agenteAtendimento.ts (limites duros, orçamento do prompt)");
});

teste("processarAvisoFigurinha nunca lança (try/catch envolvendo tudo que toca o banco)", () => {
  const corpo = corpoDaFuncao(avisoFonte, "processarAvisoFigurinha");
  verdade(corpo.length > 0, "processarAvisoFigurinha não existe mais, ou mudou de assinatura");
  const idxTry = corpo.indexOf("try {");
  const idxPrimeiraConsulta = corpo.indexOf("const mensagem = await prisma.whatsappMessage.findUnique(");
  verdade(idxTry >= 0 && idxPrimeiraConsulta > idxTry, "o `try` não envolve a primeira consulta ao banco — um erro ali derrubaria quem chamou");
  verdade(/\}\s*catch\s*\(erro\)\s*\{/.test(corpo), "o catch protetor sumiu");
});

// ── 3. A rede de segurança (cron) ───────────────────────────────────────────────────────────

teste("MUTAÇÃO-ALVO: varrerAvisosFigurinhaPendentes só pega o que ainda está RECEIVED, além da folga — e processa cada item isoladamente", () => {
  const corpo = corpoDaFuncao(avisoFonte, "varrerAvisosFigurinhaPendentes");
  verdade(corpo.length > 0, "varrerAvisosFigurinhaPendentes não existe mais, ou mudou de assinatura");
  verdade(corpo.includes('status: "RECEIVED"'), "a varredura parou de filtrar por status RECEIVED — reprocessaria figurinha já avisada ou já superada");
  verdade(corpo.includes('body: ROTULO_FIGURINHA'), "a varredura parou de filtrar por ROTULO_FIGURINHA — passaria a varrer toda mensagem IN da plataforma a cada 5 minutos");
  verdade(/createdAt:\s*\{\s*lt:\s*limite,\s*gt:\s*janela\s*\}/.test(corpo), "a varredura perdeu a folga (createdAt < limite) ou o teto de janela (createdAt > janela) — competiria com o disparo imediato, ou cresceria sem limite para sempre");
  verdade(/for\s*\([^)]*\)\s*\{[\s\S]*try\s*\{[\s\S]*catch/.test(corpo), "o laço da varredura perdeu o try/catch por item — um erro de infraestrutura no meio pararia os itens seguintes");
});

// ── 4. Fail-closed das duas rotas HTTP (só a parte que NÃO toca o banco) ──────────────────

teste("MUTAÇÃO-ALVO: a rota interna usa comparação em tempo constante (timingSafeEqual), não `===`", () => {
  const corpo = codigoDe(rotaProcessarFonte);
  verdade(corpo.includes("crypto.timingSafeEqual("), "a rota parou de usar timingSafeEqual pra comparar o segredo");
});

teste("a rota interna confere o segredo ANTES de processar qualquer coisa do corpo, e passa a espera de 15s adiante", () => {
  const corpo = codigoDe(rotaProcessarFonte);
  const idxAuth = corpo.indexOf("timingSafeEqual(");
  const idxProcessar = corpo.indexOf("processarAvisoFigurinha(");
  verdade(idxAuth >= 0 && idxProcessar > idxAuth, "a checagem de autorização não vem antes de processar o pedido");
  verdade(corpo.includes("esperarMs: ESPERA_ANTES_DE_AVISAR_MS"), "a rota parou de passar a espera de 15s para processarAvisoFigurinha — o cron passaria a ser o único caminho, sempre mais lento");
});

teste("o cron de avisos de figurinha é fail-closed: sem CRON_SECRET configurado, recusa sempre", () => {
  const corpo = codigoDe(rotaCronFonte);
  verdade(corpo.includes("process.env.CRON_SECRET"), "o cron parou de usar CRON_SECRET");
  verdade(/if\s*\(!secret \|\| auth !== `Bearer \$\{secret\}`\)/.test(corpo), "a checagem fail-closed do cron mudou de forma — confira à mão");
  verdade(corpo.includes("varrerAvisosFigurinhaPendentes()"), "o cron parou de chamar varrerAvisosFigurinhaPendentes");
});

teste("MUTAÇÃO-ALVO: o cron de avisos de figurinha está registrado no vercel.json, a cada 5 minutos", () => {
  const vercelJson = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
  const entrada = vercelJson.crons.find((c) => c.path === "/api/cron/avisos-de-figurinha");
  verdade(entrada !== undefined, "o cron app/api/cron/avisos-de-figurinha não está listado em vercel.json — a rede de segurança nunca rodaria em produção");
  igual(entrada?.schedule, "*/5 * * * *", "o intervalo do cron mudou — confira se ainda é rápido o bastante");
});

// ── 5. As DUAS rotas de webhook disparam o aviso, e NÃO respondem na hora (condição 1 do pedido) ──

for (const [nome, fonte] of [
  ["app/api/whatsapp/route.ts", rotaMetaFonte],
  ["app/api/whatsapp/evolution/route.ts", rotaEvolutionFonte],
] as const) {
  teste(`MUTAÇÃO-ALVO: ${nome} não responde a figurinha na hora — só dispara o aviso`, () => {
    const corpo = codigoDe(fonte);
    verdade(corpo.includes(".figurinha)"), `${nome} perdeu a checagem do ramo de figurinha`);
    verdade(corpo.includes("dispararAvisoFigurinha("), `${nome} parou de disparar o processamento do aviso de figurinha`);

    // MESMA técnica de lib/testes/orcamentoDoPedido.teste.ts para o ramo de áudio: prova pela
    // POSIÇÃO que `atendenteResponde` está no `else` FINAL, fora do ramo de figurinha — se
    // alguém "simplificasse" e chamasse atendenteResponde também ali, a Ana responderia na
    // hora, o oposto do que foi pedido (esperar 15s).
    const linhas = corpo.split("\n");
    const idxFigurinha = linhas.findIndex((l) => l.includes(".figurinha)"));
    const idxDispara = linhas.findIndex((l, i) => i > idxFigurinha && l.includes("dispararAvisoFigurinha("));
    const idxElseFinal = linhas.findIndex((l, i) => i > idxDispara && l.trim().startsWith("} else"));
    const idxAtendente = linhas.findIndex((l, i) => i > idxDispara && l.includes("await atendenteResponde(attendanceId)"));
    verdade(idxDispara > idxFigurinha, `${nome}: dispararAvisoFigurinha não vem depois da checagem do ramo de figurinha`);
    verdade(idxElseFinal > idxDispara, `${nome}: não achei o \`else\` final depois do ramo de figurinha`);
    verdade(idxAtendente > idxElseFinal, `${nome}: atendenteResponde não está mais fora do ramo de figurinha — a Ana responderia na hora, sem esperar os 15s`);
  });
}

// ── 6. A Ana LÊ a figurinha como instrução, não como rótulo cru (nas duas pontas do histórico) ──

teste("MUTAÇÃO-ALVO: atendenteResponde troca o rótulo de figurinha pela instrução, no histórico E na mensagem de agora", () => {
  const corpo = codigoDe(atendenteFonte);
  verdade(
    corpo.includes('texto: m.body === ROTULO_FIGURINHA ? TEXTO_FIGURINHA_PARA_AGENTE : textoParaAgente(m)'),
    "o histórico parou de trocar o rótulo de figurinha pela instrução — a Ana leria só \"[figurinha]\" sem saber que não pode vê-la",
  );
  verdade(
    corpo.includes('mensagem: ultima.body === ROTULO_FIGURINHA ? TEXTO_FIGURINHA_PARA_AGENTE : textoParaAgente(ultima)'),
    "a MENSAGEM DE AGORA parou de trocar o rótulo de figurinha pela instrução — exatamente o caso comum (a figurinha É a última mensagem quando o aviso dispara)",
  );
});

resumo("aviso de figurinha — disparo, fail-closed, idempotência, reavaliação");
