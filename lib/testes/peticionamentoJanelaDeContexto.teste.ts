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

// PRIORIDADE 1 (relatório da entrega "peticionamento lê documentos") — `textoFinal` é o que
// costura a decisão desta janela ao texto REALMENTE enviado ao Hermes. Sem estes testes, um
// `textoFinal` que nunca corta (ou que corta calado, sem avisar o PRÓPRIO agente) passaria
// verde no resto da suíte — nenhum outro teste desta casa olha para este campo.

teste("cabe tudo: textoFinal é EXATAMENTE o texto original, sem cortar nem anotar nada", () => {
  const r = avaliarJanela([{ id: "1", rotulo: "Fatos", texto: "Texto pequeno de fatos." }]);
  igual(r.itens[0].textoFinal, "Texto pequeno de fatos.");
});

teste("HARD GATE: item resumido tem textoFinal MENOR que o original, e o corte AVISA o próprio agente (não só a tela)", () => {
  const textoOriginal = "y".repeat((LIMITE_PADRAO_TOKENS + 40_000) * 4);
  const r = avaliarJanela([{ id: "1", rotulo: "Histórico antigo", texto: textoOriginal }]);
  const item = r.itens[0];
  igual(item.foiResumido, true);
  verdade(item.textoFinal.length < textoOriginal.length, "textoFinal deveria ser menor que o original quando resumido");
  verdade(item.textoFinal.includes("RESUMO AUTOMÁTICO"), "TRAVA: o corte precisa avisar o PRÓPRIO agente dentro do texto, não só no campo `aviso` da tela — senão o agente trata o corte como se fosse o documento inteiro");
  verdade(item.textoFinal.includes("Histórico antigo"), "o aviso embutido deveria citar o rótulo do item cortado");
});

teste("HARD GATE: item protegido NUNCA tem textoFinal diferente do original, mesmo bloqueando a janela inteira", () => {
  const textoOriginal = "z".repeat((LIMITE_PADRAO_TOKENS + 10_000) * 4);
  const r = avaliarJanela([{ id: "1", rotulo: "Contestação central", texto: textoOriginal, protegido: true }]);
  igual(r.acao, "bloqueado");
  igual(r.itens[0].textoFinal, textoOriginal, "item protegido não pode ter o texto cortado, nem quando bloqueia a janela inteira");
});

resumo("Peticionamento — janela de contexto");
