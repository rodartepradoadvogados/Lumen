import { teste, igual, verdade, resumo } from "./executar";
import { avaliarFonteDeCitacao, avaliarAprovacaoDeMinuta, urlOficialValida, urlSecundariaValida, type CitacaoParaAprovacao } from "../peticionamentoAprovacao";

// A GRADUAÇÃO DE FONTE (Passo 4 da skill pesquisa-jurisprudencia) e o GATE de "Aprovar minuta /
// gerar peça" — motivados originalmente (23/09/2026) pelo quadro "Citações desta minuta" que
// oferecia "Li e revisei esta citação" para três citações sem fonte nenhuma, e endurecidos em
// 26/09/2026 (docs/agentes/peticionamento-firecrawl-validacao.md): dupla validação com o link de
// CADA origem passa a ser requisito, não recomendação, e julgado sem número CNJ válido não é
// citável.

// Um número CNJ real (tabela do documento, §3.1) — usado nos textos de citação de JULGADO abaixo,
// já que o gate de aprovação agora exige isso deles.
const CNJ_VALIDO = "0001234-85.2023.5.18.0001";
const OFICIAL = "https://stj.jus.br/x";
const SECUNDARIA = "https://conjur.com.br/y";

function citacao(extra: Partial<CitacaoParaAprovacao> = {}): CitacaoParaAprovacao {
  return { confirmada: true, fonteUrl: OFICIAL, fonteSecundariaUrl: SECUNDARIA, texto: `STJ, ${CNJ_VALIDO}`, ...extra };
}

// ── Graduação de fonte — mudança de régua do §4 (26/09/2026) ────────────────────────────────────

teste("sem fonte oficial nem secundária: bloqueia", () => {
  const a = avaliarFonteDeCitacao(null, null);
  igual(a.classificacao, "sem-fonte");
  igual(a.bloqueia, true);
});

teste("com oficial e sem secundária: ANTES não bloqueava (condicional); AGORA bloqueia", () => {
  const a = avaliarFonteDeCitacao(OFICIAL, null);
  igual(a.classificacao, "condicional");
  igual(a.bloqueia, true, "a partir do §4, só oficial sem secundária passa a bloquear");
  verdade(!/valid(ado|ada)|verific/i.test(a.rotulo), `rótulo não pode soar como "validado": "${a.rotulo}"`);
});

teste("com secundária e sem oficial: tratada como inexistente — bloqueia", () => {
  const a = avaliarFonteDeCitacao(null, SECUNDARIA);
  igual(a.classificacao, "so-secundaria");
  igual(a.bloqueia, true);
});

teste("com as duas fontes, as duas de qualidade: completa — não bloqueia", () => {
  const a = avaliarFonteDeCitacao(OFICIAL, SECUNDARIA);
  igual(a.classificacao, "completa");
  igual(a.bloqueia, false);
});

// ── §4.2 — checagem de qualidade das duas URLs ──────────────────────────────────────────────────

teste("urlOficialValida: exige https e domínio *.jus.br, planalto.gov.br ou in.gov.br", () => {
  verdade(urlOficialValida("https://stj.jus.br/x"), "subdomínio de jus.br");
  verdade(urlOficialValida("https://www.planalto.gov.br/lei"), "planalto.gov.br");
  verdade(urlOficialValida("https://www.in.gov.br/x"), "in.gov.br");
  igual(urlOficialValida("http://stj.jus.br/x"), false, "http:// não é https://");
  igual(urlOficialValida("https://www.conjur.com.br/x"), false, "portal não é domínio oficial");
  igual(urlOficialValida("https://naojus.br.exemplo.com/x"), false, "não é DOMÍNIO jus.br, só contém as letras");
  igual(urlOficialValida(null), false);
});

teste("urlSecundariaValida: exige https, domínio diferente do oficial, e nunca *.jus.br", () => {
  verdade(urlSecundariaValida("https://www.conjur.com.br/y", OFICIAL), "portal independente");
  igual(urlSecundariaValida("https://outrotribunal.jus.br/y", OFICIAL), false, "outro *.jus.br não é fonte independente");
  igual(urlSecundariaValida(OFICIAL, OFICIAL), false, "mesmo domínio do oficial não conta como segunda fonte");
  igual(urlSecundariaValida("http://www.conjur.com.br/y", OFICIAL), false, "http:// não é https://");
  igual(urlSecundariaValida(null, OFICIAL), false);
});

teste("URL de busca (google./bing./?q=) nunca conta como fonte lida — nem oficial nem secundária", () => {
  igual(urlOficialValida("https://www.google.com/search?q=stj"), false);
  igual(urlSecundariaValida("https://www.bing.com/search?q=stj", OFICIAL), false);
  igual(urlSecundariaValida("https://www.conjur.com.br/busca?q=stj", OFICIAL), false, "?q= também barra fora do domínio de busca");
});

teste("as duas fontes presentes, mas a oficial não é um domínio oficial: bloqueia (url-invalida)", () => {
  const a = avaliarFonteDeCitacao("https://www.migalhas.com.br/x", SECUNDARIA);
  igual(a.classificacao, "url-invalida");
  igual(a.bloqueia, true);
});

teste("as duas fontes presentes, mas a secundária é OUTRA página de tribunal: bloqueia (não são independentes)", () => {
  const a = avaliarFonteDeCitacao(OFICIAL, "https://outrotribunal.jus.br/y");
  igual(a.classificacao, "url-invalida");
  igual(a.bloqueia, true);
});

// ── Gate de aprovação — as TRÊS condições, provadas separadamente ──────────────────────────────

teste("APROVAÇÃO: tudo confirmado, fontes completas e número CNJ válido — pode aprovar", () => {
  const r = avaliarAprovacaoDeMinuta({
    citacoes: [citacao(), citacao({ texto: `TST, ${CNJ_VALIDO}` })],
    haAvisoDeMolde: false,
  });
  igual(r.podeAprovar, true);
  igual(r.motivos.length, 0);
});

teste("APROVAÇÃO: uma citação NÃO confirmada — não pode aprovar (condição 1 sozinha)", () => {
  const r = avaliarAprovacaoDeMinuta({ citacoes: [citacao({ confirmada: false })], haAvisoDeMolde: false });
  igual(r.podeAprovar, false);
  verdade(r.motivos.length > 0, "precisa dizer por que não pode");
});

teste("APROVAÇÃO: confirmada, mas sem fonte nenhuma — não pode aprovar (condição 2 sozinha)", () => {
  const r = avaliarAprovacaoDeMinuta({ citacoes: [citacao({ fonteUrl: null, fonteSecundariaUrl: null })], haAvisoDeMolde: false });
  igual(r.podeAprovar, false);
  verdade(r.motivos.length > 0, "precisa dizer por que não pode");
});

teste("APROVAÇÃO: confirmada, só com fonte SECUNDÁRIA (tratada como inexistente) — bloqueia", () => {
  const r = avaliarAprovacaoDeMinuta({ citacoes: [citacao({ fonteUrl: null })], haAvisoDeMolde: false });
  igual(r.podeAprovar, false);
});

teste("APROVAÇÃO: confirmada, só com fonte OFICIAL (condicional) — a partir do §4 TAMBÉM bloqueia", () => {
  const r = avaliarAprovacaoDeMinuta({ citacoes: [citacao({ fonteSecundariaUrl: null })], haAvisoDeMolde: false });
  igual(r.podeAprovar, false, "só oficial deixou de bastar sozinho");
});

teste("APROVAÇÃO: confirmada e com as duas fontes, mas SEM número CNJ no texto — bloqueia (condição 3 sozinha)", () => {
  const r = avaliarAprovacaoDeMinuta({ citacoes: [citacao({ texto: "STJ, REsp 1.234.567/SP" })], haAvisoDeMolde: false });
  igual(r.podeAprovar, false, "'REsp 1.234.567/SP' sozinho não é número CNJ — a especificação é explícita que não basta");
  verdade(r.motivos.some((m) => /CNJ/i.test(m)), "o motivo precisa mencionar o número CNJ");
});

teste("APROVAÇÃO: julgado com número CNJ de FORMA certa mas dígito verificador errado também bloqueia", () => {
  const r = avaliarAprovacaoDeMinuta({ citacoes: [citacao({ texto: "STJ, 0001234-56.2023.5.18.0001" })], haAvisoDeMolde: false });
  igual(r.podeAprovar, false, "dígito 56 é inválido para este número (o correto é 85)");
});

teste("APROVAÇÃO: súmula com as duas fontes, SEM número CNJ (ela não tem) — libera", () => {
  const r = avaliarAprovacaoDeMinuta({ citacoes: [citacao({ texto: "Súmula 297 do STJ" })], haAvisoDeMolde: false });
  igual(r.podeAprovar, true, "súmula/tema/enunciado não têm número de processo — não exigir CNJ deles");
});

teste("APROVAÇÃO: tema repetitivo, mesma isenção de número CNJ da súmula", () => {
  const r = avaliarAprovacaoDeMinuta({ citacoes: [citacao({ texto: "Tema 990 do STJ" })], haAvisoDeMolde: false });
  igual(r.podeAprovar, true);
});

teste("APROVAÇÃO: existe aviso de molde — bloqueia mesmo sem nenhuma citação pendente", () => {
  const r = avaliarAprovacaoDeMinuta({ citacoes: [], haAvisoDeMolde: true });
  igual(r.podeAprovar, false);
  verdade(r.motivos.some((m) => /molde|exemplo/i.test(m)), "o motivo precisa mencionar molde/exemplo");
});

teste("APROVAÇÃO: sem citação nenhuma e sem aviso de molde — pode aprovar (nada para confirmar)", () => {
  const r = avaliarAprovacaoDeMinuta({ citacoes: [], haAvisoDeMolde: false });
  igual(r.podeAprovar, true);
});

resumo("Peticionamento — graduação de fonte e gate de aprovação final (dupla validação com link + número CNJ, 26/09/2026)");
