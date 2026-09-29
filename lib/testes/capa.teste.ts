import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, verdade, resumo, codigoDe } from "./executar";
import { CONSENT_KEY, CONSENT_CHANGE_EVENT } from "../cookieConsent";

// ============================================================================
// CAPA (homepage pública) — auditoria de promessas e de consentimento, 29/09/2026.
//
// Duas famílias de regra que só se provam lendo o código:
//   1. A Capa não promete o que o produto não faz (conciliação bancária, "prazo fatal", "93
//      tribunais", "escrito pelo advogado"). A tabela frase a frase, com o arquivo que dá respaldo
//      a cada uma, está no plano da Capa; aqui fica só a trava contra a volta das frases falsas.
//   2. A medição de audiência (Vercel Analytics) só existe com consentimento: o layout raiz não a
//      importa direto e o interruptor lê a MESMA chave que o aviso grava.
//
// Comentários (de linha e de bloco, inclusive JSX) são removidos antes da busca — a explicação de
// uma trava cita a frase que a varredura procura (ver o topo de lib/testes/executar.ts).
// ============================================================================

const RAIZ = process.cwd();
const ler = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
const semComentarios = (fonte: string) => codigoDe(fonte.replace(/\/\*[\s\S]*?\*\//g, ""));

const PROIBIDAS: [RegExp, string][] = [
  [/concilia/i, "\"conciliação bancária\" não existe no produto (não há importação de extrato)"],
  [/prazo fatal/i, "o Lúmen sugere prazo; quem confirma é o advogado"],
  [/de cada tribunal/i, "não há calendário por tribunal (feriados nacionais, recesso e locais cadastrados)"],
  [/\b93\b/, "o número de tribunais não tem derivação no código"],
  [/escrito pelo advogado/i, "a minuta é redigida por IA (rascunho que o advogado revisa)"],
  [/teste gr[aá]tis|gratuito|sem cart[aã]o/i, "o cadastro não implementa teste grátis nem promete ausência de cobrança"],
];

for (const arquivo of ["app/page.tsx", "components/site/Faq.tsx", "components/site/SigiloDemo.tsx"]) {
  let fonte = "";
  try {
    fonte = semComentarios(ler(arquivo));
  } catch {
    continue; // o arquivo pode não existir na etapa do PR em que o teste roda
  }
  teste(`${arquivo} não contém promessa sem respaldo no código`, () => {
    for (const [padrao, motivo] of PROIBIDAS) {
      verdade(!padrao.test(fonte), `${arquivo} casa ${padrao}: ${motivo}`);
    }
  });
}

teste("o layout raiz não importa o Vercel Analytics direto (só o interruptor com consentimento)", () => {
  const layout = semComentarios(ler("app/layout.tsx"));
  verdade(!/@vercel\/analytics/.test(layout), "app/layout.tsx importa @vercel/analytics: a medição voltaria a ser incondicional");
  verdade(/AnalyticsConsentido/.test(layout), "app/layout.tsx não renderiza AnalyticsConsentido");
});

teste("AnalyticsConsentido só monta o Analytics com a escolha \"todos\" e descarta eventos depois da revogação", () => {
  const f = semComentarios(ler("components/site/AnalyticsConsentido.tsx"));
  verdade(/readConsent\(\) === "todos"/.test(f), "não compara a escolha com \"todos\"");
  verdade(/beforeSend/.test(f), "sem beforeSend: quem revoga continuaria sendo medido");
  verdade(f.includes(CONSENT_CHANGE_EVENT) || /CONSENT_CHANGE_EVENT/.test(f), "não escuta a mudança de escolha");
});

teste("o aviso de cookies grava pela mesma chave que o interruptor lê", () => {
  const aviso = semComentarios(ler("components/site/CookieConsent.tsx"));
  verdade(/saveConsent/.test(aviso), "o aviso não usa saveConsent (lib/cookieConsent.ts)");
  verdade(!aviso.includes("lumen_cookie_consent_v1"), "o aviso voltou a ter a chave escrita à mão");
  verdade(CONSENT_KEY === "lumen_cookie_consent_v1", "a chave mudou: quem já escolheu seria perguntado de novo");
});

teste("a política de privacidade declara a medição de audiência e a condição do consentimento", () => {
  const p = ler("app/privacidade/page.tsx");
  verdade(/Vercel Analytics/.test(p), "a política não cita o Vercel Analytics");
  verdade(/Aceitar a medição/.test(p) && /Somente o essencial/.test(p), "a política não descreve as duas escolhas do aviso");
});

teste("toda tela de sessão tem <main>", () => {
  verdade(/<main[\s>]/.test(semComentarios(ler("components/site/TelaSessao.tsx"))), "components/site/TelaSessao.tsx sem <main>");
});

resumo("capa");
