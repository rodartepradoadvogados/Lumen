import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";

// ============================================================================
// A TRANSCRIÇÃO ASSÍNCRONA — fora do pedido do webhook.
//
// Ver a nota extensa em lib/orcamentoDoPedido.ts e lib/transcricaoAssincrona.ts: a transcrição e a
// resposta de verdade (via Hermes) saíram do webhook. Este arquivo testa as peças que
// lib/testes/orcamentoDoPedido.teste.ts não cobre: o disparo fire-and-forget, o fail-closed da
// rota interna e do cron, a idempotência, o tratamento de "sem cópia durável", e que a REAVALIAÇÃO
// antes da segunda mensagem é a MESMA atendenteResponde de sempre — não um atalho novo.
//
// NADA AQUI CHAMA A ROTA/FUNÇÃO DE VERDADE QUANDO ISSO TOCARIA O BANCO (Prisma): este ambiente não
// tem acesso de rede ao Postgres (só HTTPS/443), e uma chamada real ficaria pendurada. Os dois
// caminhos de AUTORIZAÇÃO (401 sem segredo / segredo errado) são seguros de invocar de verdade
// porque retornam ANTES de tocar o banco — o resto é varredura de código-fonte.
// ============================================================================

const assincronaFonte = readFileSync("lib/transcricaoAssincrona.ts", "utf8");
const rotaProcessarFonte = readFileSync("app/api/transcricao/processar/route.ts", "utf8");
const rotaCronFonte = readFileSync("app/api/cron/transcricoes-pendentes/route.ts", "utf8");
const confirmacaoFonte = readFileSync("lib/confirmacaoDeAudio.ts", "utf8");

// ── 1. dispararTranscricaoAssincrona — fire-and-forget, fail-closed ─────────────────────────

// AS DUAS CHECAGENS ABAIXO FICAM NUM TESTE SÓ, DE PROPÓSITO: `teste()` (lib/testes/executar.ts)
// dispara todos os corpos ao mesmo tempo (`Promise.all`), e os dois cenários mutam a MESMA
// variável de ambiente global (`TRANSCRICAO_INTERNA_SECRET`) e o MESMO `global.fetch` — rodando em
// testes separados, um pisaria no outro. Sequencialmente, dentro de um teste só, não há corrida.
teste("MUTAÇÃO-ALVO: dispararTranscricaoAssincrona é fail-closed sem o segredo, e dispara certo com ele", async () => {
  const original = process.env.TRANSCRICAO_INTERNA_SECRET;
  const fetchOriginal = global.fetch;
  try {
    const { dispararTranscricaoAssincrona } = await import("@/lib/transcricaoAssincrona");

    // 1) SEM o segredo: nem tenta.
    delete process.env.TRANSCRICAO_INTERNA_SECRET;
    let chamou = false;
    global.fetch = (...args: Parameters<typeof fetch>) => {
      chamou = true;
      return fetchOriginal(...args);
    };
    dispararTranscricaoAssincrona("wamid.QUALQUER");
    await new Promise((r) => setTimeout(r, 20));
    verdade(!chamou, "sem o segredo configurado, o disparo chamou fetch mesmo assim — a rota interna recusaria, mas nem deveria tentar");

    // 2) COM o segredo: dispara o pedido certo — método, Authorization e corpo.
    process.env.TRANSCRICAO_INTERNA_SECRET = "segredo-de-teste-123";
    let pedido: { url: string; opcoes: RequestInit } | null = null;
    // @ts-expect-error -- espião de teste
    global.fetch = (url: string, opcoes: RequestInit) => {
      pedido = { url, opcoes };
      return Promise.resolve(new Response(JSON.stringify({ received: true }), { status: 200 }));
    };
    dispararTranscricaoAssincrona("wamid.ABC123");
    await new Promise((r) => setTimeout(r, 20));
    verdade(pedido !== null, "com o segredo configurado, o disparo não chamou fetch nenhuma");
    const p = pedido as unknown as { url: string; opcoes: RequestInit };
    verdade(p.url.endsWith("/api/transcricao/processar"), `a URL do disparo está errada: ${p.url}`);
    igual(p.opcoes.method, "POST");
    const headers = p.opcoes.headers as Record<string, string>;
    igual(headers.authorization, "Bearer segredo-de-teste-123");
    igual(JSON.parse(String(p.opcoes.body)), { waMessageId: "wamid.ABC123" });
  } finally {
    global.fetch = fetchOriginal;
    if (original === undefined) delete process.env.TRANSCRICAO_INTERNA_SECRET;
    else process.env.TRANSCRICAO_INTERNA_SECRET = original;
  }
});

teste("MUTAÇÃO-ALVO: dispararTranscricaoAssincrona não espera a conclusão — nada de `await fetch`", () => {
  // A REGRA É "MELHOR ESFORÇO, DE PROPÓSITO": esperar aqui devolveria o problema que a transcrição
  // assíncrona resolve (o webhook preso na chamada lenta). `await fetch(` (ou a função ser `async`
  // e dar `return await`) reintroduziria exatamente essa espera.
  const corpo = corpoDaFuncao(assincronaFonte, "dispararTranscricaoAssincrona");
  verdade(corpo.length > 0, "dispararTranscricaoAssincrona não existe mais, ou mudou de assinatura");
  verdade(!/await fetch\(/.test(corpo), "dispararTranscricaoAssincrona passou a esperar (`await`) o fetch — isso prende o pedido que chamou");
  verdade(/fetch\([^)]*\)[\s\S]*?\.catch\(/.test(corpo), "o fetch não tem `.catch()` — uma rejeição não tratada pode derrubar o processo");
});

// ── 2. processarTranscricaoAssincrona — idempotência, cópia indisponível, reavaliação ───────

teste("MUTAÇÃO-ALVO: processarTranscricaoAssincrona não faz nada se a transcrição já não está mais PENDENTE (idempotência)", () => {
  // Sem esta trava, o disparo imediato E o cron pegando o MESMO item processariam duas vezes —
  // duas transcrições, e pior, DUAS mensagens de resposta pro cliente.
  const corpo = corpoDaFuncao(assincronaFonte, "processarTranscricaoAssincrona");
  verdade(corpo.length > 0, "processarTranscricaoAssincrona não existe mais, ou mudou de assinatura");
  verdade(
    /if\s*\(mensagem\.transcricao\.status !== "PENDENTE"\)\s*return;/.test(corpo),
    "a checagem de idempotência (só processa quem ainda está PENDENTE) sumiu",
  );
});

teste("MUTAÇÃO-ALVO: sem storageProvider/storageFileId, marca FALHOU com o motivo certo — não tenta baixar de qualquer jeito", () => {
  const corpo = corpoDaFuncao(assincronaFonte, "processarTranscricaoAssincrona");
  const idxSemArquivo = corpo.indexOf("if (!storageProvider || !storageFileId)");
  verdade(idxSemArquivo >= 0, "a checagem de arquivo indisponível sumiu");
  const ramo = corpo.slice(idxSemArquivo, corpo.indexOf("} else {", idxSemArquivo));
  verdade(/status:\s*"FALHOU"/.test(ramo), "o ramo sem cópia durável parou de marcar FALHOU");
  verdade(/erro:\s*ERRO_ARQUIVO_INDISPONIVEL/.test(ramo), "o ramo sem cópia durável parou de usar o motivo fixo ERRO_ARQUIVO_INDISPONIVEL");
});

teste("MUTAÇÃO-ALVO: a REAVALIAÇÃO antes da segunda mensagem é a MESMA atendenteResponde de sempre — não um atalho que ignora deveResponder", () => {
  // Esta é A TRAVA MAIS IMPORTANTE desta mudança de arquitetura. atendenteResponde já confere,
  // sozinho, TUDO que precisa: deveResponder (silêncio, módulo, chave da conversa, número
  // autorizado — testado em lib/testes/atendente.teste.ts) e se a ÚLTIMA mensagem ainda é do
  // cliente (se um humano respondeu enquanto a transcrição rodava, a última mensagem é dele, e
  // atendenteResponde não manda nada). Reaproveitar em vez de reimplementar é o que garante que
  // esta segunda mensagem nunca atropela um humano.
  const corpo = codigoDe(assincronaFonte);
  verdade(corpo.includes("await atendenteResponde(mensagem.attendanceId,"), "processarTranscricaoAssincrona parou de chamar atendenteResponde — a reavaliação (deveResponder, silêncio, última mensagem do cliente) sumiria");
  // E NUNCA por um atalho que fure essa reavaliação: nenhuma chamada direta de envio aqui.
  verdade(!corpo.includes("sendWhatsappText("), "lib/transcricaoAssincrona.ts está chamando sendWhatsappText diretamente — isso pularia toda a reavaliação que atendenteResponde faz");
});

teste("processarTranscricaoAssincrona nunca lança (try/catch no corpo inteiro)", () => {
  const corpo = corpoDaFuncao(assincronaFonte, "processarTranscricaoAssincrona");
  verdade(corpo.length > 0, "processarTranscricaoAssincrona não existe mais, ou mudou de assinatura");
  const idxInicio = corpo.indexOf("const inicio = Date.now();");
  const idxTry = corpo.indexOf("try {");
  verdade(idxInicio >= 0 && idxTry > idxInicio && idxTry - idxInicio < 40, "processarTranscricaoAssincrona não começa com `const inicio` seguido logo do try/catch protetor");
  verdade(/\}\s*catch\s*\(erro\)\s*\{/.test(corpo), "o catch protetor sumiu");
});

// ── 3. A rede de segurança (cron) ────────────────────────────────────────────────────────────

teste("MUTAÇÃO-ALVO: varrerTranscricoesPendentes só pega o que está PENDENTE além da folga — e processa cada item isoladamente", () => {
  const corpo = corpoDaFuncao(assincronaFonte, "varrerTranscricoesPendentes");
  verdade(corpo.length > 0, "varrerTranscricoesPendentes não existe mais, ou mudou de assinatura");
  verdade(corpo.includes('status: "PENDENTE"'), "a varredura parou de filtrar por status PENDENTE — reprocessaria tudo, inclusive o que já terminou");
  verdade(/criadoEm:\s*\{\s*lt:\s*limite\s*\}/.test(corpo), "a varredura parou de respeitar a folga (criadoEm < limite) — competiria com o disparo imediato o tempo todo");
  verdade(/for\s*\([^)]*\)\s*\{[\s\S]*try\s*\{[\s\S]*catch/.test(corpo), "o laço da varredura perdeu o try/catch por item — um erro de infraestrutura no meio pararia os itens seguintes");
});

// ── 4. Fail-closed das duas rotas HTTP (só a parte que NÃO toca o banco) ───────────────────

async function chamarRotaProcessar(headers: Record<string, string>): Promise<number> {
  const { POST } = await import("@/app/api/transcricao/processar/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest("http://localhost/api/transcricao/processar", {
    method: "POST",
    headers,
    body: JSON.stringify({ waMessageId: "wamid.NUNCA-CHEGA-A-EXISTIR" }),
  });
  const res = await POST(req);
  return res.status;
}

// OS TRÊS CENÁRIOS ABAIXO FICAM NUM TESTE SÓ, PELO MESMO MOTIVO do disparo: mutam a MESMA
// variável de ambiente global, e `teste()` roda todos os corpos em paralelo.
teste("MUTAÇÃO-ALVO: a rota interna recusa (401) — sem segredo configurado, com segredo errado, e sem Authorization", async () => {
  const original = process.env.TRANSCRICAO_INTERNA_SECRET;
  try {
    delete process.env.TRANSCRICAO_INTERNA_SECRET;
    igual(await chamarRotaProcessar({ authorization: "Bearer qualquer-coisa" }), 401, "sem o segredo configurado, mesmo com um Authorization qualquer: ");

    process.env.TRANSCRICAO_INTERNA_SECRET = "segredo-certo";
    igual(await chamarRotaProcessar({ authorization: "Bearer segredo-errado" }), 401, "com o segredo errado: ");
    igual(await chamarRotaProcessar({}), 401, "sem cabeçalho Authorization nenhum: ");
  } finally {
    if (original === undefined) delete process.env.TRANSCRICAO_INTERNA_SECRET;
    else process.env.TRANSCRICAO_INTERNA_SECRET = original;
  }
});

teste("MUTAÇÃO-ALVO: a rota interna usa comparação em tempo constante (timingSafeEqual), não `===`", () => {
  // Comparar segredo por `===` vaza quanto do prefixo bate através do tempo de resposta — pouco
  // prático de explorar num endpoint HTTP comum, mas é a mesma disciplina que
  // lib/whatsapp.ts:verifySignature e a rota da Evolution já seguem, e não custa nada manter.
  const corpo = codigoDe(rotaProcessarFonte);
  verdade(corpo.includes("crypto.timingSafeEqual("), "a rota parou de usar timingSafeEqual pra comparar o segredo");
});

teste("a rota interna confere o segredo ANTES de processar qualquer coisa do corpo", () => {
  const corpo = codigoDe(rotaProcessarFonte);
  const idxAuth = corpo.indexOf("timingSafeEqual(");
  const idxProcessar = corpo.indexOf("processarTranscricaoAssincrona(");
  verdade(idxAuth >= 0 && idxProcessar > idxAuth, "a checagem de autorização não vem antes de processar o pedido");
});

teste("o cron de segurança segue o MESMO padrão de CRON_SECRET dos demais crons da casa (fail-closed)", () => {
  const corpo = codigoDe(rotaCronFonte);
  verdade(corpo.includes('process.env.CRON_SECRET'), "o cron parou de usar CRON_SECRET");
  verdade(/if\s*\(!secret \|\| auth !== `Bearer \$\{secret\}`\)/.test(corpo), "a checagem fail-closed do cron mudou de forma — confira à mão");
  verdade(corpo.includes("varrerTranscricoesPendentes()"), "o cron parou de chamar varrerTranscricoesPendentes");
});

// ── 5. A confirmação fixa não usa o Hermes ──────────────────────────────────────────────────

teste("MUTAÇÃO-ALVO: confirmarRecebimentoDeAudio NUNCA chama o Hermes — a frase é fixa, de propósito", () => {
  const corpo = codigoDe(confirmacaoFonte);
  verdade(!corpo.includes("perguntarAoHermes"), "confirmarRecebimentoDeAudio passou a chamar o Hermes — a frase deixaria de ser instantânea, reintroduzindo o risco de timeout que ela existe para evitar");
  verdade(corpo.includes("deveResponder("), "confirmarRecebimentoDeAudio parou de checar deveResponder — mandaria a confirmação mesmo com o atendente desligado/silenciado");
});

teste("MUTAÇÃO-ALVO: confirmarRecebimentoDeAudio RESPEITA o veredito de deveResponder — não só chama, obedece", () => {
  // A FALHA QUE ISTO PEGA: chamar deveResponder mas ignorar o resultado (não sair da função
  // quando ele diz "não") passaria no teste anterior — que só confere a CHAMADA — e mesmo assim
  // mandaria a confirmação com o atendente desligado ou a conversa silenciada.
  const corpo = corpoDaFuncao(confirmacaoFonte, "confirmarRecebimentoDeAudio");
  verdade(corpo.length > 0, "confirmarRecebimentoDeAudio não existe mais, ou mudou de assinatura");
  const idxVeredito = corpo.indexOf("const veredito = deveResponder(");
  const idxEnvio = corpo.indexOf("sendWhatsappText(");
  verdade(idxVeredito >= 0 && idxEnvio > idxVeredito, "não encontrei deveResponder antes do envio");
  const entreOsDois = corpo.slice(idxVeredito, idxEnvio);
  verdade(
    /if\s*\(!veredito\.responde\)\s*return/.test(entreOsDois),
    "deveResponder é chamado mas o veredito não é respeitado — nada impede o envio quando ele diz \"não\"",
  );
});

// ── 6. A rede de segurança está registrada de verdade (vercel.json) ────────────────────────

teste("MUTAÇÃO-ALVO: o cron de transcrições pendentes está registrado no vercel.json, a cada 5 minutos", () => {
  const vercelJson = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
  const entrada = vercelJson.crons.find((c) => c.path === "/api/cron/transcricoes-pendentes");
  verdade(entrada !== undefined, "o cron app/api/cron/transcricoes-pendentes não está listado em vercel.json — a rede de segurança nunca rodaria em produção");
  igual(entrada?.schedule, "*/5 * * * *", "o intervalo do cron mudou — confira se ainda é rápido o bastante");
});

void resumo("transcrição assíncrona — disparo, fail-closed, reavaliação");
