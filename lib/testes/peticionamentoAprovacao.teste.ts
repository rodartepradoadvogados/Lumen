import { teste, igual, verdade, resumo } from "./executar";
import { avaliarFonteDeCitacao, avaliarAprovacaoDeMinuta } from "../peticionamentoAprovacao";

// A GRADUAÇÃO DE FONTE (Passo 4 da skill pesquisa-jurisprudencia) e o GATE de "Aprovar minuta /
// gerar peça" (decisão do dono, 23/09/2026) — motivados pelo quadro "Citações desta minuta" que
// oferecia "Li e revisei esta citação" para três citações sem fonte nenhuma.

// ── Graduação de fonte — item 2 do pedido ────────────────────────────────────────────────────

teste("sem fonte oficial nem secundária: bloqueia", () => {
  const a = avaliarFonteDeCitacao(null, null);
  igual(a.classificacao, "sem-fonte");
  igual(a.bloqueia, true);
});

teste("com oficial e sem secundária: condicional — NÃO bloqueia, mas não se apresenta como validada", () => {
  const a = avaliarFonteDeCitacao("https://stj.jus.br/x", null);
  igual(a.classificacao, "condicional");
  igual(a.bloqueia, false);
  verdade(!/valid(ado|ada)|verific/i.test(a.rotulo), `rótulo não pode soar como "validado": "${a.rotulo}"`);
});

teste("com secundária e sem oficial: tratada como inexistente — bloqueia", () => {
  const a = avaliarFonteDeCitacao(null, "https://conjur.com.br/y");
  igual(a.classificacao, "so-secundaria");
  igual(a.bloqueia, true);
});

teste("com as duas fontes: completa — não bloqueia", () => {
  const a = avaliarFonteDeCitacao("https://stj.jus.br/x", "https://conjur.com.br/y");
  igual(a.classificacao, "completa");
  igual(a.bloqueia, false);
});

// ── Gate de aprovação — item 4 do pedido. As DUAS condições, provadas separadamente: o teste
// reprova se qualquer uma das duas sumir (ver instrução do dono, literal). ─────────────────────

teste("APROVAÇÃO: tudo confirmado e nada bloqueante — pode aprovar", () => {
  const r = avaliarAprovacaoDeMinuta({
    citacoes: [
      { confirmada: true, fonteUrl: "https://stj.jus.br/x", fonteSecundariaUrl: "https://conjur.com.br/y" },
      { confirmada: true, fonteUrl: "https://stj.jus.br/z", fonteSecundariaUrl: null },
    ],
    haAvisoDeMolde: false,
  });
  igual(r.podeAprovar, true);
  igual(r.motivos.length, 0);
});

teste("APROVAÇÃO: uma citação NÃO confirmada, mesmo sem nenhuma bloqueante — não pode aprovar (condição 1 sozinha)", () => {
  // Se a implementação um dia deixar de checar confirmação (só checar fonte), este teste reprova.
  const r = avaliarAprovacaoDeMinuta({
    citacoes: [{ confirmada: false, fonteUrl: "https://stj.jus.br/x", fonteSecundariaUrl: "https://conjur.com.br/y" }],
    haAvisoDeMolde: false,
  });
  igual(r.podeAprovar, false);
  verdade(r.motivos.length > 0, "precisa dizer por que não pode");
});

teste("APROVAÇÃO: tudo confirmado, mas uma citação SEM fonte oficial — não pode aprovar (condição 2 sozinha)", () => {
  // Se a implementação um dia deixar de checar bloqueio (só checar confirmação), este teste reprova.
  const r = avaliarAprovacaoDeMinuta({
    citacoes: [{ confirmada: true, fonteUrl: null, fonteSecundariaUrl: null }],
    haAvisoDeMolde: false,
  });
  igual(r.podeAprovar, false);
  verdade(r.motivos.length > 0, "precisa dizer por que não pode");
});

teste("APROVAÇÃO: citação confirmada mas só com fonte SECUNDÁRIA (tratada como inexistente) também bloqueia", () => {
  const r = avaliarAprovacaoDeMinuta({
    citacoes: [{ confirmada: true, fonteUrl: null, fonteSecundariaUrl: "https://conjur.com.br/y" }],
    haAvisoDeMolde: false,
  });
  igual(r.podeAprovar, false);
});

teste("APROVAÇÃO: citação confirmada só com fonte oficial (condicional) NÃO bloqueia sozinha", () => {
  const r = avaliarAprovacaoDeMinuta({
    citacoes: [{ confirmada: true, fonteUrl: "https://stj.jus.br/x", fonteSecundariaUrl: null }],
    haAvisoDeMolde: false,
  });
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

resumo("Peticionamento — graduação de fonte e gate de aprovação final (decisão do dono, 23/09/2026)");
