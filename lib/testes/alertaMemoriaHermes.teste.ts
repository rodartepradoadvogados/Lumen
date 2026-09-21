import { teste, igual, verdade, resumo, corpoDaFuncao, codigoDe } from "./executar";
import { readFileSync } from "node:fs";
import { deveEnviarAvisoHoje } from "@/lib/campanhasCobranca";
import { situacaoDeMemoria, deveAlertarMemoriaHoje, MOTIVO_LIMIAR_NAO_CONFIGURADO } from "@/lib/alertaMemoriaHermes";

// ============================================================================
// ALERTA DE MEMÓRIA DA VPS DO HERMES (Frente C, §4). A régua pura vive em
// lib/alertaMemoriaHermes.ts; o que só existe com Prisma/Hermes/e-mail
// (lib/actions/alertaMemoriaHermes.ts, app/api/cron/alerta-memoria-hermes) é coberto por
// VARREDURA de código-fonte, mesmo estilo de lib/testes/campanhasCobranca.teste.ts.
// ============================================================================

// ── 1 · HARD GATE — limiar nulo NUNCA dispara, com motivo legível (§4, item em aberto) ──────

teste("limiar NULO nunca dispara — o dono não decidiu o número, e nulo não é um valor inventado", () => {
  const s = situacaoDeMemoria(1_000, null);
  igual(s.dispara, false);
  verdade("motivo" in s && s.motivo === MOTIVO_LIMIAR_NAO_CONFIGURADO, "o motivo não é o texto explícito de 'ainda não configurado'");
  verdade(!("livreKB" in s), "uma situação que não dispara não deveria carregar livreKB/limiarKB");
});

teste("limiar nulo nunca dispara mesmo com memória livre baixíssima (0 KB) — nulo é 'desligado', não 'sempre crítico'", () => {
  const s = situacaoDeMemoria(0, null);
  igual(s.dispara, false);
});

// ── 2 · NÍVEL ÚNICO — dispara ou não dispara, nunca um terceiro estado intermediário ────────

teste("memória livre ACIMA do limiar não dispara", () => {
  const s = situacaoDeMemoria(2_000_000, 1_000_000);
  igual(s.dispara, false);
});

teste("memória livre ABAIXO do limiar dispara, carregando os números para o e-mail", () => {
  const s = situacaoDeMemoria(500_000, 1_000_000);
  igual(s.dispara, true);
  if (s.dispara) {
    igual(s.livreKB, 500_000);
    igual(s.limiarKB, 1_000_000);
  }
});

teste("FRONTEIRA — memória livre EXATAMENTE igual ao limiar já dispara ('cruzar' inclui tocar a linha)", () => {
  const s = situacaoDeMemoria(1_000_000, 1_000_000);
  igual(s.dispara, true, "memória livre igual ao limiar deveria disparar — a máquina não está mais folgada por estar bem em cima da linha");
});

teste("FRONTEIRA — 1 KB acima do limiar já NÃO dispara", () => {
  const s = situacaoDeMemoria(1_000_001, 1_000_000);
  igual(s.dispara, false);
});

// ── 3 · UM ALERTA POR DIA — REUTILIZA deveEnviarAvisoHoje da Frente B, não reimplementa ─────

teste("deveAlertarMemoriaHoje é literalmente deveEnviarAvisoHoje (mesma função, reexportada) — nunca uma segunda implementação que pode divergir", () => {
  verdade(deveAlertarMemoriaHoje === deveEnviarAvisoHoje, "deveAlertarMemoriaHoje deixou de ser o mesmo objeto de função que deveEnviarAvisoHoje — pode ter virado uma cópia que diverge");
});

teste("deveAlertarMemoriaHoje: nunca alertou ainda hoje deve alertar", () => {
  igual(deveAlertarMemoriaHoje(null, new Date("2026-09-15T12:00:00Z")), true);
});

teste("deveAlertarMemoriaHoje: já alertou HOJE não alerta de novo no mesmo dia", () => {
  igual(deveAlertarMemoriaHoje("2026-09-15", new Date("2026-09-15T23:00:00Z")), false);
});

// ============================================================================
// 4 · VARREDURA DE lib/actions/alertaMemoriaHermes.ts e do endpoint novo da ponte
// ============================================================================

const FONTE_ACOES = readFileSync("lib/actions/alertaMemoriaHermes.ts", "utf8");
const CODIGO_ACOES = codigoDe(FONTE_ACOES);

teste("verificarMemoriaDoHermesEAlertar checa hermesConfigurado() ANTES de qualquer leitura do banco — fail-closed sem tocar Prisma", () => {
  const corpo = corpoDaFuncao(CODIGO_ACOES, "verificarMemoriaDoHermesEAlertar");
  verdade(corpo.length > 200, `corpoDaFuncao devolveu ${corpo.length} caracteres`);
  const iChecaPonte = corpo.indexOf("if (!hermesConfigurado())");
  const iPrisma = corpo.indexOf("prisma.alertaMemoriaHermesParametro.findUnique");
  verdade(iChecaPonte >= 0 && iPrisma >= 0, "verificarMemoriaDoHermesEAlertar perdeu a checagem da ponte ou a leitura do parâmetro");
  verdade(iChecaPonte < iPrisma, "a checagem de hermesConfigurado() vem DEPOIS de já ter consultado o banco — deixa de ser fail-closed");
});

teste("verificarMemoriaDoHermesEAlertar usa situacaoDeMemoria (a régua pura) para decidir — não reimplementa a comparação com o limiar", () => {
  verdade(/import\s*\{[^}]*\bsituacaoDeMemoria\b[^}]*\}\s*from\s*["']@\/lib\/alertaMemoriaHermes["']/.test(FONTE_ACOES), "situacaoDeMemoria não é importada de lib/alertaMemoriaHermes");
  const corpo = corpoDaFuncao(CODIGO_ACOES, "verificarMemoriaDoHermesEAlertar");
  verdade(/situacaoDeMemoria\(/.test(corpo), "verificarMemoriaDoHermesEAlertar não chama situacaoDeMemoria — pode ter reimplementado a comparação com o limiar");
  const iSituacao = corpo.indexOf("situacaoDeMemoria(");
  const iEmail = corpo.indexOf("sendAlertaMemoriaHermesEmail(");
  verdade(iSituacao >= 0 && iEmail >= 0, "perdeu a chamada de situacaoDeMemoria ou o envio do e-mail");
  verdade(iSituacao < iEmail, "o e-mail pode estar sendo enviado sem checar situacaoDeMemoria.dispara antes");
});

teste("verificarMemoriaDoHermesEAlertar trava o dia ANTES de mandar os e-mails, com o `where` repetindo o valor lido (mesmo padrão de enviarAvisoDiarioDeAssinatura)", () => {
  const corpo = corpoDaFuncao(CODIGO_ACOES, "verificarMemoriaDoHermesEAlertar");
  const iGuarda = corpo.indexOf("updateMany");
  const iEmail = corpo.indexOf("sendAlertaMemoriaHermesEmail(");
  verdade(iGuarda >= 0 && iEmail >= 0, "perdeu a trava de dia (updateMany) ou o envio de e-mail");
  verdade(iGuarda < iEmail, "o e-mail é enviado ANTES de gravar a trava do dia — duas execuções concorrentes do cron mandariam o alerta em dobro");
  verdade(/ultimoAlertaDiarioEm:\s*ultimoAlertaGravado/.test(corpo), "a trava não repete o valor LIDO no `where` — sem isso a condição de corrida não é fechada");
});

teste("os destinatários são donosDaPlataforma() (Jairo e Rodrigo) — nunca o escritório-cliente", () => {
  const corpo = corpoDaFuncao(CODIGO_ACOES, "verificarMemoriaDoHermesEAlertar");
  verdade(/donosDaPlataforma\(\)/.test(corpo), "verificarMemoriaDoHermesEAlertar não busca mais os donos da plataforma para avisar");
});

teste("o cron de alerta-memoria-hermes é fail-closed: sem CRON_SECRET configurado, recusa sempre", () => {
  const fonte = readFileSync("app/api/cron/alerta-memoria-hermes/route.ts", "utf8");
  const corpo = corpoDaFuncao(codigoDe(fonte), "GET");
  verdade(corpo.length > 80, `corpoDaFuncao devolveu ${corpo.length} caracteres para o GET do cron`);
  verdade(/if\s*\(\s*!secret\s*\|\|/.test(corpo), "o cron não recusa explicitamente quando CRON_SECRET está ausente");
});

// ============================================================================
// 5 · A ROTA NOVA DA PONTE (/memoria) — exige autorização, como as demais rotas autenticadas do
// servidor da ponte (nunca "sem segredo configurado = aceita tudo").
// ============================================================================

teste("servidor-hermes/servidor.py: a rota /memoria exige autorização, como /perfis e /estado", () => {
  const fonte = readFileSync("servidor-hermes/servidor.py", "utf8");
  const iRota = fonte.indexOf('self.path == "/memoria"');
  verdade(iRota >= 0, "a rota /memoria não existe mais em servidor.py");
  const trecho = fonte.slice(iRota, iRota + 400);
  verdade(/self\._autorizado\(\)/.test(trecho), "a rota /memoria não chama self._autorizado() — ficaria aberta sem segredo, ao contrário de /perfis e /estado");
});

teste("servidor-hermes/servidor.py: memoria_da_maquina lê MemAvailable e SwapFree de /proc/meminfo (RAM+swap da MÁQUINA, não de um perfil)", () => {
  const fonte = readFileSync("servidor-hermes/servidor.py", "utf8");
  const iFuncao = fonte.indexOf("def memoria_da_maquina()");
  verdade(iFuncao >= 0, "memoria_da_maquina não existe mais em servidor.py");
  const corpo = fonte.slice(iFuncao, iFuncao + 1200);
  verdade(corpo.includes("/proc/meminfo"), "memoria_da_maquina não lê /proc/meminfo");
  verdade(corpo.includes("MemAvailable"), "memoria_da_maquina não lê MemAvailable (RAM disponível)");
  verdade(corpo.includes("SwapFree"), "memoria_da_maquina não lê SwapFree (swap livre)");
});

void resumo("módulo pago de campanhas — alerta de memória da VPS (Frente C, §4)");
