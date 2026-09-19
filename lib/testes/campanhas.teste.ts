import { teste, igual, verdade, resumo } from "./executar";
import { casarCampanha, normalizarUrl, normalizarTexto } from "@/lib/campanhas";

// ============================================================================
// O CASAMENTO DA CAMPANHA.
//
// É o gatilho de tudo: errar aqui manda o lead para o roteiro errado, ou o recusa por trazer um
// assunto que era exatamente o da campanha. E é a única parte do fluxo que não dá para conferir
// olhando — ela acontece no primeiro milissegundo da conversa.
//
// O caso que mais importa é o do EMPATE ENTRE CRITÉRIOS: uma campanha nova casando por texto não
// pode vencer uma campanha velha casando por link. Link é identificação; texto é palpite.
// ============================================================================

const AGORA = new Date("2026-09-19T12:00:00Z");
const ONTEM = new Date("2026-09-18T12:00:00Z");
const SEMANA_PASSADA = new Date("2026-09-12T12:00:00Z");

function campanha(over: Partial<Parameters<typeof casarCampanha>[0][number]> = {}) {
  return {
    id: "c1",
    ativa: true,
    inicioEm: null,
    fimEm: null,
    sourceUrl: null,
    textoDoClique: null,
    createdAt: SEMANA_PASSADA,
    ...over,
  };
}

// ── Normalização ─────────────────────────────────────────────────────────────────────────────

teste("o endereço perde protocolo, www, barra final e TODA a query", () => {
  const esperado = "rodarteprado.com.br/plano-negou";
  for (const u of [
    "https://www.rodarteprado.com.br/plano-negou",
    "http://rodarteprado.com.br/plano-negou/",
    "https://rodarteprado.com.br/plano-negou?fbclid=ABC123&utm_source=ig",
    "rodarteprado.com.br/plano-negou",
    "https://WWW.RodartePrado.com.BR/plano-negou#topo",
  ]) {
    igual(normalizarUrl(u), esperado, `${u}: `);
  }
});

teste("endereços diferentes continuam diferentes", () => {
  verdade(normalizarUrl("a.com/x") !== normalizarUrl("a.com/y"), "caminhos diferentes");
  verdade(normalizarUrl("a.com/x") !== normalizarUrl("b.com/x"), "domínios diferentes");
  igual(normalizarUrl(""), "", "vazio: ");
  igual(normalizarUrl(null), "", "nulo: ");
});

teste("o texto perde acento, maiúscula e pontuação", () => {
  igual(normalizarTexto("Olá! Vi o anúncio sobre PLANO de saúde."), "ola vi o anuncio sobre plano de saude");
  igual(normalizarTexto("  espaços   demais  "), "espacos demais");
});

// ── O casamento ──────────────────────────────────────────────────────────────────────────────

teste("casa pelo link do anúncio", () => {
  const r = casarCampanha(
    [campanha({ id: "med", sourceUrl: "https://rodarteprado.com.br/plano-negou" })],
    { sourceUrl: "https://rodarteprado.com.br/plano-negou?fbclid=xyz" },
    AGORA,
  );
  igual(r, { campanhaId: "med", por: "link" });
});

teste("casa pelo texto quando não veio link", () => {
  const r = casarCampanha(
    [campanha({ id: "med", textoDoClique: "Olá, vi o anúncio sobre negativa de plano de saúde" })],
    { texto: "ola vi o anuncio sobre negativa de plano de saude" },
    AGORA,
  );
  igual(r, { campanhaId: "med", por: "texto" });
});

teste("o texto casa mesmo quando a pessoa continua escrevendo depois", () => {
  // É o lead bom: colou o texto pronto e já explicou o caso na mesma mensagem.
  const r = casarCampanha(
    [campanha({ id: "med", textoDoClique: "Vi o anúncio sobre plano de saúde" })],
    { texto: "Vi o anúncio sobre plano de saúde. Negaram minha cirurgia ontem, o que faço?" },
    AGORA,
  );
  igual(r?.campanhaId, "med");
});

teste("O LINK VENCE O TEXTO, mesmo que a campanha do texto seja mais nova", () => {
  const r = casarCampanha(
    [
      campanha({ id: "velha-link", sourceUrl: "https://x.com/a", createdAt: SEMANA_PASSADA }),
      campanha({ id: "nova-texto", textoDoClique: "quero falar sobre meu caso", createdAt: ONTEM }),
    ],
    { sourceUrl: "https://x.com/a", texto: "quero falar sobre meu caso" },
    AGORA,
  );
  igual(r, { campanhaId: "velha-link", por: "link" });
});

teste("empatando no mesmo critério, vence a mais recente", () => {
  const r = casarCampanha(
    [
      campanha({ id: "antiga", sourceUrl: "https://x.com/a", createdAt: SEMANA_PASSADA }),
      campanha({ id: "recente", sourceUrl: "https://x.com/a", createdAt: ONTEM }),
    ],
    { sourceUrl: "https://x.com/a" },
    AGORA,
  );
  igual(r?.campanhaId, "recente");
});

teste("campanha desligada ou fora do período não casa", () => {
  const base = { sourceUrl: "https://x.com/a" };
  igual(casarCampanha([campanha({ ativa: false, ...base })], base, AGORA), null, "desligada: ");
  igual(
    casarCampanha([campanha({ ...base, inicioEm: new Date("2026-10-01") })], base, AGORA),
    null,
    "ainda não começou: ",
  );
  igual(
    casarCampanha([campanha({ ...base, fimEm: new Date("2026-09-01") })], base, AGORA),
    null,
    "já terminou: ",
  );
});

teste("não casando nada, a conversa é natural — nunca recusada", () => {
  // O caminho seguro: sem campanha reconhecida o lead é atendido pelo padrão Lúmen, não barrado.
  igual(casarCampanha([campanha({ sourceUrl: "https://x.com/a" })], { sourceUrl: "https://y.com/b" }, AGORA), null);
  igual(casarCampanha([], { sourceUrl: "https://x.com/a", texto: "oi" }, AGORA), null, "sem campanha nenhuma: ");
  igual(casarCampanha([campanha()], {}, AGORA), null, "sem origem nenhuma: ");
});

teste("um texto de clique curto demais NÃO é usado como gatilho", () => {
  // "oi" cadastrado como texto do clique casaria com metade das conversas do escritório.
  const r = casarCampanha([campanha({ id: "med", textoDoClique: "oi" })], { texto: "oi, tudo bem?" }, AGORA);
  igual(r, null);
});

void resumo("campanhas");
