import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  orcamentoParaHermes,
  esperaParaHermes,
  PRESUPOSTO_TOTAL_DO_PEDIDO_MS,
  MARGEM_DE_SEGURANCA_MS,
  ORCAMENTO_TRANSCRICAO_MS,
  ORCAMENTO_MINIMO_PARA_HERMES_MS,
} from "@/lib/orcamentoDoPedido";
import { perguntarAoHermes, FalhaDoHermes, ESPERA_MS as ESPERA_PADRAO_DO_HERMES_MS } from "@/lib/hermesPonte";

// ============================================================================
// O ORÇAMENTO DE TEMPO DA TRANSCRIÇÃO — E POR QUE ELA SAIU DO WEBHOOK.
//
// PRIMEIRA VERSÃO (revisão 1): a transcrição rodava DENTRO do pedido do webhook. A conta não
// fechava — `maxDuration = 120` nas duas rotas de webhook, o Hermes podia esperar até 105s
// SOZINHO, e a transcrição até mais 60s: 165s de espera possível dentro de uma função que a
// plataforma mata aos 120s. Uma mutação real reproduziu o defeito: subir o ESPERA_MS da
// transcrição de 60s pra 600s passava verde, porque nada ligava aquele número ao orçamento do
// pedido inteiro.
//
// DECISÃO DO DONO (revisão 2): a transcrição sai do webhook por completo. O fluxo agora é:
//   1. Webhook recebe o áudio, sobe pro Drive, cria o registro PENDENTE, manda uma confirmação
//      FIXA (lib/confirmacaoDeAudio.ts, não passa pelo Hermes) e DISPARA o processamento sem
//      esperar (lib/transcricaoAssincrona.ts:dispararTranscricaoAssincrona). O webhook termina AQUI.
//   2. Uma rota PRÓPRIA (app/api/transcricao/processar) — com o SEU PRÓPRIO orçamento de 120s —
//      baixa o áudio do Drive, transcreve, e chama atendenteResponde DE NOVO (reavaliando tudo:
//      silêncio, módulo, se a última mensagem ainda é do cliente) antes de mandar a resposta de
//      verdade como uma segunda mensagem.
//   3. Uma rede de segurança por cron (app/api/cron/transcricoes-pendentes) pega qualquer coisa
//      que ficou PENDENTE além de alguns minutos — o disparo do passo 1 é melhor esforço.
//
// A ARITMÉTICA (transcrição + Hermes cabendo em 120s) CONTINUA EXISTINDO — só que agora é o
// orçamento da rota do PASSO 2, não mais do webhook original. Por isso lib/orcamentoDoPedido.ts
// não mudou de forma, só de dono.
//
// O QUE ESTE ARQUIVO PROVA, em quatro camadas:
//   1. A ARITMÉTICA PURA (lib/orcamentoDoPedido.ts) — cabe num teste de mesa.
//   2. A FIAÇÃO DENTRO DA ROTA NOVA (varredura de código-fonte) — ela mede o tempo e passa o que
//      sobrou; atendenteResponde usa isso pra limitar o Hermes; lib/transcricao.ts importa o mesmo
//      número que trava a transcrição, em vez de um literal solto.
//   3. QUE O WEBHOOK ORIGINAL NÃO FAZ MAIS NADA DE LENTO PARA ÁUDIO — confirmação fixa + disparo,
//      nunca Hermes nem transcrição ali.
//   4. A CHAMADA DE VERDADE — perguntarAoHermes, com um `esperaMs` curto, contra um SERVIDOR DE
//      MENTIRA LOCAL lento, tem que abortar rápido de verdade.
// ============================================================================

// ── 1. A aritmética pura ─────────────────────────────────────────────────────────────────────

teste("orcamentoParaHermes: sem nada gasto, sobra o total menos a margem", () => {
  igual(orcamentoParaHermes(0), PRESUPOSTO_TOTAL_DO_PEDIDO_MS - MARGEM_DE_SEGURANCA_MS);
});

teste("orcamentoParaHermes: desconta exatamente o que já foi gasto", () => {
  igual(orcamentoParaHermes(30_000), PRESUPOSTO_TOTAL_DO_PEDIDO_MS - MARGEM_DE_SEGURANCA_MS - 30_000);
});

teste("MUTAÇÃO-ALVO: orcamentoParaHermes nunca fica negativo — gasto além do orçamento vira zero, não dívida", () => {
  const gastoDemais = PRESUPOSTO_TOTAL_DO_PEDIDO_MS * 2;
  igual(orcamentoParaHermes(gastoDemais), 0);
});

teste("esperaParaHermes: sem orçamento de pedido (botão manual), devolve undefined — usa o padrão de sempre", () => {
  igual(esperaParaHermes(undefined, ESPERA_PADRAO_DO_HERMES_MS), undefined);
});

teste("MUTAÇÃO-ALVO: esperaParaHermes NUNCA deixa o Hermes esperar mais que o padrão de hoje", () => {
  const restanteGeneroso = PRESUPOSTO_TOTAL_DO_PEDIDO_MS; // bem mais que o padrão
  igual(esperaParaHermes(restanteGeneroso, ESPERA_PADRAO_DO_HERMES_MS), ESPERA_PADRAO_DO_HERMES_MS);
});

teste("esperaParaHermes: quando sobrou menos que o padrão (a transcrição já gastou tempo), usa o que sobrou", () => {
  igual(esperaParaHermes(15_000, ESPERA_PADRAO_DO_HERMES_MS), 15_000);
});

teste("esperaParaHermes: orçamento negativo (não deveria acontecer, mas por via das dúvidas) vira zero", () => {
  igual(esperaParaHermes(-5_000, ESPERA_PADRAO_DO_HERMES_MS), 0);
});

teste("MUTAÇÃO-ALVO: a soma dos orçamentos fixos cabe no maxDuration com folga — a conta que não fechava antes", () => {
  const somaDoPiorCaso = ORCAMENTO_TRANSCRICAO_MS + MARGEM_DE_SEGURANCA_MS + ORCAMENTO_MINIMO_PARA_HERMES_MS;
  verdade(
    somaDoPiorCaso <= PRESUPOSTO_TOTAL_DO_PEDIDO_MS,
    `a fatia da transcrição (${ORCAMENTO_TRANSCRICAO_MS}ms) + a margem (${MARGEM_DE_SEGURANCA_MS}ms) + o mínimo pro Hermes ` +
      `(${ORCAMENTO_MINIMO_PARA_HERMES_MS}ms) = ${somaDoPiorCaso}ms, e isso PASSA de ${PRESUPOSTO_TOTAL_DO_PEDIDO_MS}ms — ` +
      `a própria rota nova mataria a função antes de o Hermes ter uma chance decente de responder`,
  );
  verdade(
    PRESUPOSTO_TOTAL_DO_PEDIDO_MS - somaDoPiorCaso >= PRESUPOSTO_TOTAL_DO_PEDIDO_MS / 3,
    "a folga entre o pior caso da transcrição e o teto da função está curta demais",
  );
});

// ── 2. A fiação DENTRO da rota nova (varredura de código-fonte) ────────────────────────────

const rotaProcessarFonte = readFileSync("app/api/transcricao/processar/route.ts", "utf8");
const assincronaFonte = readFileSync("lib/transcricaoAssincrona.ts", "utf8");
const atendenteFonte = readFileSync("lib/atendenteResponde.ts", "utf8");
const transcricaoFonte = readFileSync("lib/transcricao.ts", "utf8");
const hermesFonte = readFileSync("lib/hermesPonte.ts", "utf8");

function lerMaxDuration(fonte: string): number | null {
  const m = codigoDe(fonte).match(/export const maxDuration = (\d+);/);
  return m ? Number(m[1]) : null;
}

teste("MUTAÇÃO-ALVO: o maxDuration da rota nova (app/api/transcricao/processar) é exatamente o que o orçamento espera", () => {
  igual(lerMaxDuration(rotaProcessarFonte), PRESUPOSTO_TOTAL_DO_PEDIDO_MS / 1000, "app/api/transcricao/processar/route.ts: ");
});

teste("MUTAÇÃO-ALVO: processarTranscricaoAssincrona mede o relógio do próprio processamento e repassa o orçamento restante pro atendente", () => {
  const corpo = corpoDaFuncao(assincronaFonte, "processarTranscricaoAssincrona");
  verdade(corpo.length > 0, "processarTranscricaoAssincrona não existe mais, ou mudou de assinatura");
  verdade(/const inicio = Date\.now\(\);/.test(corpo), "processarTranscricaoAssincrona parou de marcar o início do próprio trabalho");
  verdade(
    /orcamentoParaHermes\(Date\.now\(\) - inicio\)/.test(corpo),
    "processarTranscricaoAssincrona parou de calcular o orçamento restante a partir do relógio do próprio processamento",
  );
  verdade(
    /atendenteResponde\(mensagem\.attendanceId,\s*\{\s*orcamentoRestanteMs\s*\}\)/.test(corpo),
    "processarTranscricaoAssincrona parou de passar orcamentoRestanteMs pra atendenteResponde — o Hermes voltaria a usar o padrão fixo de sempre, mesmo depois de baixar do Drive e transcrever gastarem tempo",
  );
});

teste("MUTAÇÃO-ALVO: atendenteResponde usa esperaParaHermes (orçamento restante + teto do padrão) antes de chamar o Hermes", () => {
  const corpo = corpoDaFuncao(atendenteFonte, "atendenteResponde");
  verdade(corpo.length > 0, "atendenteResponde não existe mais, ou mudou de assinatura");
  verdade(
    /esperaParaHermes\(opcoes\.orcamentoRestanteMs, ESPERA_PADRAO_DO_HERMES_MS\)/.test(corpo),
    "atendenteResponde parou de calcular o esperaMs a partir do orçamento restante do pedido",
  );
  verdade(
    /perguntarAoHermes\(\{\s*slug:[^}]*esperaMs\s*\}\)/.test(corpo),
    "perguntarAoHermes parou de receber o esperaMs calculado — voltaria a usar sempre o padrão fixo, quebrando o orçamento do pedido",
  );
});

teste("MUTAÇÃO-ALVO: perguntarAoHermes repassa o esperaMs recebido pra chamada de verdade (chamar)", () => {
  const corpo = corpoDaFuncao(hermesFonte, "perguntarAoHermes");
  verdade(corpo.length > 0, "perguntarAoHermes não existe mais, ou mudou de assinatura");
  verdade(
    /esperaMs:\s*dados\.esperaMs/.test(corpo),
    "perguntarAoHermes parou de repassar dados.esperaMs pra chamar() — o parâmetro existiria mas seria ignorado",
  );
});

teste("MUTAÇÃO-ALVO: lib/transcricao.ts trava a chamada com ORCAMENTO_TRANSCRICAO_MS IMPORTADO, não um literal solto de novo", () => {
  const corpo = codigoDe(transcricaoFonte);
  verdade(
    /import\s*\{\s*ORCAMENTO_TRANSCRICAO_MS\s*\}\s*from\s*"@\/lib\/orcamentoDoPedido";/.test(corpo),
    "lib/transcricao.ts parou de importar ORCAMENTO_TRANSCRICAO_MS do módulo de orçamento compartilhado",
  );
  verdade(
    /const ESPERA_MS = ORCAMENTO_TRANSCRICAO_MS;/.test(corpo),
    "lib/transcricao.ts voltou a definir o próprio timeout como um número solto, desligado do orçamento do pedido — " +
      "é EXATAMENTE a mutação que a revisão reproduziu (ESPERA_MS de 60s pra 600s passando verde)",
  );
});

// ── 3. O webhook original não faz mais nada de lento para áudio ────────────────────────────

const rotaMetaFonte = readFileSync("app/api/whatsapp/route.ts", "utf8");
const rotaEvolutionFonte = readFileSync("app/api/whatsapp/evolution/route.ts", "utf8");

for (const [nome, fonte] of [
  ["app/api/whatsapp/route.ts", rotaMetaFonte],
  ["app/api/whatsapp/evolution/route.ts", rotaEvolutionFonte],
] as const) {
  teste(`MUTAÇÃO-ALVO: ${nome} não chama o Hermes nem a transcrição para áudio — só confirma e dispara`, () => {
    const corpo = codigoDe(fonte);
    verdade(corpo.includes('midia?.tipo === "AUD"'), `${nome} perdeu a checagem de tipo de mídia — voltaria a tratar áudio como mensagem comum`);
    verdade(
      corpo.includes("confirmarRecebimentoDeAudio(attendanceId)"),
      `${nome} parou de mandar a confirmação fixa quando o áudio chega`,
    );
    verdade(
      corpo.includes("dispararTranscricaoAssincrona("),
      `${nome} parou de disparar o processamento assíncrono — o áudio nunca seria transcrito`,
    );
    // A ARMADILHA QUE ISTO EVITA: se alguém "simplificar" e chamar atendenteResponde também no
    // ramo de áudio, o Hermes voltaria a rodar dentro do webhook — exatamente o bug original.
    // Verificado pela INDENTAÇÃO: a chamada a atendenteResponde tem que estar no `else`, não
    // dentro do bloco de áudio.
    const linhas = corpo.split("\n");
    const idxAud = linhas.findIndex((l) => l.includes('midia?.tipo === "AUD"'));
    const idxElse = linhas.findIndex((l, i) => i > idxAud && l.trim().startsWith("} else"));
    const idxAtendente = linhas.findIndex((l, i) => i > idxAud && l.includes("await atendenteResponde(attendanceId)"));
    verdade(idxAud >= 0 && idxElse > idxAud, `${nome}: não achei o \`else\` depois da checagem de áudio`);
    verdade(idxAtendente > idxElse, `${nome}: atendenteResponde não está mais no ramo \`else\` (fora do áudio) — o Hermes rodaria de novo dentro do webhook`);
  });
}

// ── 4. A chamada de verdade, contra um servidor de mentira LENTO ───────────────────────────
//
// Diferente do servidor de mentira de lib/testes/transcricaoDeAudio.teste.ts (que testa o
// PROTOCOLO), este testa o TEMPO: prova que `perguntarAoHermes` de produção, com um `esperaMs`
// pequeno, aborta rápido de verdade — não é varredura de texto, é a função rodando.

function subirServidorLento(atrasoMs: number, corpo: unknown): Promise<{ servidor: Server; url: string }> {
  return new Promise((resolve) => {
    const servidor = createServer((req, res) => {
      const pedacos: Buffer[] = [];
      req.on("data", (p) => pedacos.push(p));
      req.on("end", () => {
        setTimeout(() => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(corpo));
        }, atrasoMs);
      });
    });
    servidor.listen(0, "127.0.0.1", () => {
      const endereco = servidor.address();
      const porta = typeof endereco === "object" && endereco ? endereco.port : 0;
      resolve({ servidor, url: `http://127.0.0.1:${porta}` });
    });
  });
}

async function comHermesDeMentira<T>(url: string, corpo: () => Promise<T>): Promise<T> {
  const original = { url: process.env.HERMES_URL, token: process.env.HERMES_TOKEN };
  process.env.HERMES_URL = url;
  process.env.HERMES_TOKEN = "token-de-teste-nao-e-segredo-real";
  try {
    return await corpo();
  } finally {
    if (original.url === undefined) delete process.env.HERMES_URL;
    else process.env.HERMES_URL = original.url;
    if (original.token === undefined) delete process.env.HERMES_TOKEN;
    else process.env.HERMES_TOKEN = original.token;
  }
}

teste("MUTAÇÃO-ALVO: com esperaMs curto, perguntarAoHermes aborta rápido de verdade — não fica preso ao padrão de 105s", async () => {
  const { servidor, url } = await subirServidorLento(2000, { resposta: "nunca chega a tempo", sessao: "x" });
  try {
    await comHermesDeMentira(url, async () => {
      const inicio = Date.now();
      let falhou = false;
      let motivo = "";
      try {
        await perguntarAoHermes({ slug: "escritorio-de-teste", mensagem: "oi", esperaMs: 80 });
      } catch (e) {
        falhou = true;
        motivo = e instanceof FalhaDoHermes ? e.motivo : String(e);
      }
      const decorrido = Date.now() - inicio;
      verdade(falhou, "com o servidor de mentira demorando 2s e esperaMs de 80ms, a chamada deveria ter sido abortada");
      verdade(motivo.toUpperCase().includes("DEMORA"), `o motivo devia dizer DEMORA: "${motivo}"`);
      verdade(decorrido < 1000, `o abort demorou ${decorrido}ms — o esperaMs curto não está sendo respeitado de verdade`);
    });
  } finally {
    servidor.close();
  }
});

teste("controle: com esperaMs suficiente, a MESMA chamada de produção termina bem (não é 'sempre falha')", async () => {
  const { servidor, url } = await subirServidorLento(30, { resposta: "cheguei a tempo", sessao: "sessao-123" });
  try {
    await comHermesDeMentira(url, async () => {
      const r = await perguntarAoHermes({ slug: "escritorio-de-teste", mensagem: "oi", esperaMs: 2000 });
      igual(r.resposta, "cheguei a tempo");
      igual(r.sessao, "sessao-123");
    });
  } finally {
    servidor.close();
  }
});

void resumo("orçamento de tempo da transcrição assíncrona");
