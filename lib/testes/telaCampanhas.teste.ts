import { teste, igual, verdade, resumo } from "./executar";
import {
  ordinal,
  rotuloDaPosicao,
  podeSolicitarNovaCampanha,
  rotuloDoEstadoDaAssinatura,
  rotuloDaSituacaoDoProvisionamento,
  rotuloDoEstadoDoSlot,
  formatarKB,
} from "@/lib/telaCampanhas";
import type { SituacaoDoProvisionamento } from "@/lib/provisionamentoCampanhas";

// ============================================================================
// DECISÕES DE TELA DO MÓDULO PAGO DE CAMPANHAS (Frente D). Aqui só o que a tela decide sozinha —
// nenhuma regra de preço/carência/provisionamento é recalculada; ver lib/testes/moduloCampanhas.
// teste.ts, lib/testes/campanhasCobranca.teste.ts e lib/testes/provisionamentoCampanhas.teste.ts
// para as regras de origem.
// ============================================================================

// ── 1 · Ordinal e rótulo de posição (§6.1) ───────────────────────────────────────────────────

teste("ordinal formata 1, 2, 3 como 1ª, 2ª, 3ª", () => {
  igual(ordinal(1), "1ª");
  igual(ordinal(2), "2ª");
  igual(ordinal(3), "3ª");
});

teste("ordinal nunca desce de 1ª, mesmo com entrada inválida", () => {
  igual(ordinal(0), "1ª");
  igual(ordinal(-5), "1ª");
});

teste("a 1ª posição é rotulada como incluída na mensalidade; a 2ª em diante, como cobrança adicional", () => {
  verdade(rotuloDaPosicao(1).includes("incluída na mensalidade"), "a 1ª tem que dizer que está incluída");
  verdade(rotuloDaPosicao(2).includes("cobrança adicional"), "a 2ª tem que dizer que é cobrança adicional");
  verdade(rotuloDaPosicao(5).includes("cobrança adicional"), "a 5ª também é cobrança adicional (preço FIXO, não escalona)");
});

// ── 2 · Pode solicitar nova campanha? (§6, §7) ───────────────────────────────────────────────

teste("sem assinatura nenhuma, não pode solicitar — precisa assinar o módulo primeiro", () => {
  const d = podeSolicitarNovaCampanha("SEM_ASSINATURA");
  igual(d.pode, false);
  verdade(d.motivo.length > 0, "tem que vir com motivo legível");
});

teste("assinatura DESATIVADA não pode solicitar nova campanha", () => {
  const d = podeSolicitarNovaCampanha("DESATIVADO");
  igual(d.pode, false);
});

teste("assinatura ATIVA pode solicitar", () => {
  igual(podeSolicitarNovaCampanha("ATIVO").pode, true);
});

teste("assinatura em CARENCIA ainda pode solicitar — §7: o serviço não para nos 10 dias de carência", () => {
  igual(podeSolicitarNovaCampanha("CARENCIA").pode, true);
});

// ── 3 · Rótulo do estado da assinatura ───────────────────────────────────────────────────────

teste("ATIVO tem tom ok", () => {
  igual(rotuloDoEstadoDaAssinatura("ATIVO").tom, "ok");
});

teste("CARENCIA mostra os dias restantes quando informados", () => {
  const r = rotuloDoEstadoDaAssinatura("CARENCIA", 4);
  igual(r.tom, "warn");
  verdade(r.texto.includes("4"), "tem que citar quantos dias faltam");
});

teste("DESATIVADO tem tom risk e menciona que o treinamento continua salvo", () => {
  const r = rotuloDoEstadoDaAssinatura("DESATIVADO");
  igual(r.tom, "risk");
  verdade(r.texto.toLowerCase().includes("treinamento"), "§7: desativar não apaga o treinamento — a tela tem que lembrar isso");
});

// ── 4 · Rótulo da situação de provisionamento — os CINCO estados, nenhum silêncio ───────────

const CASOS_DE_PROVISIONAMENTO: { situacao: SituacaoDoProvisionamento; tomEsperado: string }[] = [
  { situacao: { situacao: "NO_AR" }, tomEsperado: "ok" },
  { situacao: { situacao: "SEM_PENDENCIA" }, tomEsperado: "neutro" },
  { situacao: { situacao: "PREPARANDO" }, tomEsperado: "warn" },
  { situacao: { situacao: "TENTANDO_DE_NOVO", tentativas: 2, motivo: "DEMORA: sem resposta em 120s" }, tomEsperado: "warn" },
  { situacao: { situacao: "FALHOU_DEFINITIVAMENTE", tentativas: 3, motivo: "conexão recusada" }, tomEsperado: "risk" },
];

for (const c of CASOS_DE_PROVISIONAMENTO) {
  teste(`situação de provisionamento "${c.situacao.situacao}" tem tom "${c.tomEsperado}" e texto não vazio`, () => {
    const r = rotuloDaSituacaoDoProvisionamento(c.situacao);
    igual(r.tom, c.tomEsperado);
    verdade(r.texto.trim().length > 0, "nunca um texto vazio — 'silêncio que pareça sucesso' é proibido");
  });
}

teste("FALHOU_DEFINITIVAMENTE cita o número de tentativas e o motivo no texto", () => {
  const r = rotuloDaSituacaoDoProvisionamento({ situacao: "FALHOU_DEFINITIVAMENTE", tentativas: 3, motivo: "VPS sem resposta" });
  verdade(r.texto.includes("3"), "tem que citar quantas tentativas rodaram");
  verdade(r.texto.includes("VPS sem resposta"), "tem que citar o motivo registrado, não escondê-lo");
});

// ── 5 · Rótulo do estado do slot — os cinco estados do ciclo de vida (§6) ───────────────────

teste("SOLICITADO e RECUSADO têm tons diferentes de ATIVO", () => {
  igual(rotuloDoEstadoDoSlot("SOLICITADO").tom, "warn");
  igual(rotuloDoEstadoDoSlot("ATIVO").tom, "ok");
  igual(rotuloDoEstadoDoSlot("RECUSADO").tom, "risk");
  igual(rotuloDoEstadoDoSlot("FINALIZADO").tom, "neutro");
  igual(rotuloDoEstadoDoSlot("APROVADO").tom, "ok");
});

// ── 6 · Formatação de memória ─────────────────────────────────────────────────────────────────

teste("formatarKB escolhe a unidade certa", () => {
  igual(formatarKB(512), "512 KB");
  igual(formatarKB(1024), "1.0 MB");
  igual(formatarKB(2048), "2.0 MB");
  igual(formatarKB(1024 * 1024), "1.0 GB");
  igual(formatarKB(2 * 1024 * 1024), "2.0 GB");
});

resumo("lib/telaCampanhas.ts");
