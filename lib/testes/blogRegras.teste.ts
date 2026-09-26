import { teste, igual, verdade, resumo } from "./executar";
import { areaValida, validarFontes, limitesValidos, normalizarTitulo, ehDuplicata, ehOficial, ehPortalJuridico, LIMITE_TITULO, LIMITE_RESUMO, LIMITE_CONTEUDO } from "@/lib/blogRegras";

// ── Área ─────────────────────────────────────────────────────────────────────────────────────

teste("área fora da lista é recusada", () => {
  igual(areaValida("Ambiental"), false);
  igual(areaValida(""), false);
  igual(areaValida("civil"), false); // caixa errada não conta
});

teste("as 13 áreas da especificação são aceitas", () => {
  for (const a of ["Cível", "Consumerista", "Empresarial", "Tributário", "Trabalhista", "Previdenciário", "Administrativo", "Licitação", "Compliance", "Due Diligence", "Contratual", "Responsabilidade Civil", "Execuções"]) {
    verdade(areaValida(a), `"${a}" deveria ser aceita`);
  }
});

// ── Domínios ─────────────────────────────────────────────────────────────────────────────────

teste("ehOficial reconhece qualquer subdomínio de jus.br e as fontes legislativas", () => {
  verdade(ehOficial("https://stj.jus.br/algo"), "stj.jus.br");
  verdade(ehOficial("https://noticias.stf.jus.br/algo"), "noticias.stf.jus.br");
  verdade(ehOficial("https://www.planalto.gov.br/lei"), "planalto.gov.br");
  verdade(ehOficial("https://www.in.gov.br/x"), "in.gov.br");
  igual(ehOficial("https://www.migalhas.com.br/x"), false);
  igual(ehOficial("não é url"), false);
});

teste("ehPortalJuridico só aceita Jusbrasil em /noticias", () => {
  verdade(ehPortalJuridico("https://www.migalhas.com.br/quentes/algo"), "migalhas");
  verdade(ehPortalJuridico("https://www.conjur.com.br/algo"), "conjur");
  verdade(ehPortalJuridico("https://www.jusbrasil.com.br/noticias/algo"), "jusbrasil noticias");
  igual(ehPortalJuridico("https://www.jusbrasil.com.br/processos/algo"), false);
});

// ── Dupla validação de fontes ────────────────────────────────────────────────────────────────

teste("1 fonte só é recusada", () => {
  const r = validarFontes(["https://stj.jus.br/a"]);
  igual(r.ok, false);
});

teste("2 fontes do mesmo domínio são recusadas", () => {
  const r = validarFontes(["https://stj.jus.br/a", "https://stj.jus.br/b"]);
  igual(r.ok, false);
});

teste("2 portais sem nenhuma oficial são recusados", () => {
  const r = validarFontes(["https://www.migalhas.com.br/a", "https://www.conjur.com.br/b"]);
  igual(r.ok, false);
});

teste("Conjur + stj.jus.br é aceito", () => {
  const r = validarFontes(["https://www.conjur.com.br/a", "https://stj.jus.br/b"]);
  igual(r.ok, true);
});

teste("planalto.gov.br + Migalhas é aceito", () => {
  const r = validarFontes(["https://www.planalto.gov.br/lei", "https://www.migalhas.com.br/a"]);
  igual(r.ok, true);
});

teste("fonte http (não https) é recusada", () => {
  const r = validarFontes(["http://stj.jus.br/a", "https://www.conjur.com.br/b"]);
  igual(r.ok, false);
});

teste("sem nenhuma fonte é recusado", () => {
  igual(validarFontes(null).ok, false);
  igual(validarFontes(undefined).ok, false);
  igual(validarFontes([]).ok, false);
});

// ── Limites ──────────────────────────────────────────────────────────────────────────────────

teste("limites de tamanho são respeitados", () => {
  igual(limitesValidos({ title: "a".repeat(LIMITE_TITULO), summary: "b", content: "c" }).ok, true);
  igual(limitesValidos({ title: "a".repeat(LIMITE_TITULO + 1), summary: "b", content: "c" }).ok, false);
  igual(limitesValidos({ title: "a", summary: "b".repeat(LIMITE_RESUMO + 1), content: "c" }).ok, false);
  igual(limitesValidos({ title: "a", summary: "b", content: "c".repeat(LIMITE_CONTEUDO + 1) }).ok, false);
});

// ── Duplicata ────────────────────────────────────────────────────────────────────────────────

teste("título duplicado com acento/caixa diferente é detectado", () => {
  const existentes = [{ title: "STJ decide sobre reajuste de plano de saúde", sources: ["https://stj.jus.br/a"] }];
  verdade(ehDuplicata({ title: "stj decide sobre reajuste de plano de saude" }, existentes), "deveria ser duplicata (título)");
  igual(normalizarTitulo("STJ decide sobre reajuste de plano de saúde"), normalizarTitulo("stj decide sobre reajuste de plano de saude"));
});

teste("fonte já citada em outra matéria é duplicata mesmo com título diferente", () => {
  const existentes = [{ title: "Um título qualquer", sources: ["https://stj.jus.br/a", "https://www.conjur.com.br/b"] }];
  verdade(ehDuplicata({ title: "Título completamente distinto", sources: ["https://stj.jus.br/a"] }, existentes), "deveria ser duplicata (fonte)");
});

teste("título e fontes diferentes não é duplicata", () => {
  const existentes = [{ title: "Um título qualquer", sources: ["https://stj.jus.br/a"] }];
  igual(ehDuplicata({ title: "Outro assunto qualquer", sources: ["https://tst.jus.br/z"] }, existentes), false);
});

resumo("Regras do blog jurídico");
