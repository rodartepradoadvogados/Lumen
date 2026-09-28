import { teste, igual, verdade, resumo } from "./executar";
import { urlDoQr, lerEstado, nomeDaInstancia } from "@/lib/qrDaEvolution";

// ============================================================================
// O QR QUE VEM DE FORA.
//
// O código chega de um servidor que não é o Lúmen e vai parar num `src` de <img>. Um `src` aceita
// muito mais do que imagem — `javascript:`, `data:text/html`, um endereço remoto — e o navegador
// obedece. O endereço desse servidor é digitado à mão numa tela de configuração: um erro de
// digitação já basta para o Lúmen passar a confiar em quem não devia.
//
// Por isso este arquivo testa principalmente o que a função RECUSA, e não o que ela aceita.
// ============================================================================

// 44 caracteres de base64 — acima do mínimo que a função exige.
const CORPO = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";

// ── O que passa ──────────────────────────────────────────────────────────────────────────────

teste("aceita o data: URL de PNG que a Evolution costuma mandar", () => {
  const entrada = `data:image/png;base64,${CORPO}`;
  igual(urlDoQr(entrada), entrada);
});

teste("aceita JPEG também", () => {
  const entrada = `data:image/jpeg;base64,${CORPO}`;
  igual(urlDoQr(entrada), entrada);
});

teste("base64 cru ganha o prefixo NOSSO, e não o dele", () => {
  igual(urlDoQr(CORPO), `data:image/png;base64,${CORPO}`);
});

teste("espaços e quebras de linha no meio não invalidam o código", () => {
  const partido = `data:image/png;base64,${CORPO.slice(0, 20)}\n  ${CORPO.slice(20)}`;
  igual(urlDoQr(partido), `data:image/png;base64,${CORPO}`);
});

// ── O que NÃO passa ──────────────────────────────────────────────────────────────────────────

teste("recusa javascript:", () => {
  igual(urlDoQr("javascript:alert(1)"), null);
  igual(urlDoQr("  JavaScript:alert(1)  "), null);
});

teste("recusa data: que não seja imagem", () => {
  igual(urlDoQr(`data:text/html;base64,${CORPO}`), null);
  igual(urlDoQr("data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+"), null);
});

teste("recusa endereço remoto — o QR não pode virar um pedido a servidor de terceiro", () => {
  igual(urlDoQr("https://servidor-qualquer.exemplo/qr.png"), null);
  igual(urlDoQr("//servidor-qualquer.exemplo/qr.png"), null);
});

teste("recusa o prefixo certo com corpo que não é base64", () => {
  igual(urlDoQr(`data:image/png;base64,<script>alert(1)</script>aaaaaaaaaaaaaaaaaaaaaaaa`), null);
  igual(urlDoQr(`data:image/png;base64,${CORPO}" onerror="alert(1)`), null);
});

teste("recusa vazio, nulo e coisa curta demais para ser um QR", () => {
  igual(urlDoQr(""), null);
  igual(urlDoQr(null), null);
  igual(urlDoQr(undefined), null);
  igual(urlDoQr("   "), null);
  igual(urlDoQr("aaa"), null);
  igual(urlDoQr("data:image/png;base64,aaa"), null);
});

teste("o que passa nunca começa por outra coisa que não data:image/", () => {
  const entradas = [
    CORPO,
    `data:image/png;base64,${CORPO}`,
    `data:image/jpeg;base64,${CORPO}`,
    "javascript:alert(1)",
    "https://x.exemplo/a.png",
    `data:text/html;base64,${CORPO}`,
  ];
  for (const e of entradas) {
    const saida = urlDoQr(e);
    if (saida !== null) verdade(saida.startsWith("data:image/"), `passou algo que não é imagem: ${saida.slice(0, 40)}`);
  }
});

// ── O estado ─────────────────────────────────────────────────────────────────────────────────

teste("só 'open' conta como conectado", () => {
  igual(lerEstado("open"), "conectado");
  igual(lerEstado("OPEN"), "conectado");
  igual(lerEstado("connecting"), "conectando");
  igual(lerEstado("close"), "desconectado");
  igual(lerEstado("closed"), "desconectado");
  igual(lerEstado("qualquer coisa"), "desconhecido");
  igual(lerEstado(null), "desconhecido");
  igual(lerEstado(""), "desconhecido");
});

// ── O nome da instância ──────────────────────────────────────────────────────────────────────

teste("o nome da instância é estável: reconectar não cria outra", () => {
  igual(nomeDaInstancia("abc123"), "lumen-abc123");
  igual(nomeDaInstancia("abc123"), nomeDaInstancia("abc123"));
  verdade(nomeDaInstancia("a") !== nomeDaInstancia("b"), "dois escritórios ganharam a mesma instância");
});

resumo("QR da Evolution");
