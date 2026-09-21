import { teste, igual, verdade, resumo } from "./executar";
import { avaliarJanela, estimarTokens, LIMITE_PADRAO_TOKENS } from "@/lib/peticionamentoJanelaDeContexto";

// "NUNCA trunca em silêncio" (especificação §8) — cada teste de resumo/bloqueio confirma que o
// aviso vem preenchido, nunca null, e que a decisão nunca é "ok" quando não cabe.

teste("cabe tudo: ação ok, sem aviso nenhum", () => {
  const r = avaliarJanela([{ id: "1", rotulo: "Documento pequeno", texto: "x".repeat(400) }]);
  igual(r.acao, "ok");
  igual(r.aviso, null);
});

teste("HARD GATE: excede o limite e cabe resumindo — aviso sempre preenchido, nunca null", () => {
  const grande = { id: "1", rotulo: "Histórico antigo", texto: "x".repeat((LIMITE_PADRAO_TOKENS + 40_000) * 4) };
  const r = avaliarJanela([grande]);
  igual(r.acao, "resumido");
  verdade(r.aviso !== null && r.aviso.length > 0, "aviso não pode ficar vazio quando resumiu");
  verdade(r.aviso!.includes("Nada foi descartado"), "precisa deixar claro que nada foi descartado");
});

teste("HARD GATE: item protegido nunca é resumido, mesmo estourando o limite sozinho", () => {
  const protegido = { id: "1", rotulo: "Contestação central", texto: "x".repeat((LIMITE_PADRAO_TOKENS + 10_000) * 4), protegido: true };
  const r = avaliarJanela([protegido]);
  igual(r.itens[0].foiResumido, false);
  igual(r.acao, "bloqueado");
  verdade(r.aviso !== null, "bloqueio sempre com aviso");
});

teste("HARD GATE: mesmo depois de resumir tudo o que dava, se ainda não cabe, bloqueia com explicação do que falta", () => {
  const itens = [
    { id: "1", rotulo: "Anexo A", texto: "x".repeat(100_000 * 4), protegido: true },
    { id: "2", rotulo: "Anexo B", texto: "x".repeat(80_000 * 4), protegido: true },
  ];
  const r = avaliarJanela(itens);
  igual(r.acao, "bloqueado");
  verdade(r.aviso!.includes("Anexo A") || r.aviso!.includes("Anexo B"), "aviso deve nomear pelo menos um dos itens pesados, não ser genérico");
  verdade(r.aviso!.length > 30, "aviso deve trazer detalhe, não uma frase genérica");
});

teste("estimarTokens é determinístico (mesmo texto, mesmo resultado)", () => {
  const t = "a".repeat(1000);
  igual(estimarTokens(t), estimarTokens(t));
  igual(estimarTokens(""), 0);
});

teste("resumo nunca reduz um item abaixo do piso de 500 tokens (nunca vira supressão)", () => {
  const r = avaliarJanela([{ id: "1", rotulo: "Item médio", texto: "x".repeat((LIMITE_PADRAO_TOKENS + 1000) * 4) }]);
  const item = r.itens.find((i) => i.id === "1")!;
  if (item.foiResumido) verdade(item.tokensAposResumo >= 500, "resumo abaixo de 500 tokens é supressão disfarçada");
});

resumo("Peticionamento — janela de contexto");
