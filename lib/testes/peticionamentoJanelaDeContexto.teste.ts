import { teste, igual, verdade, resumo } from "./executar";
import {
  avaliarJanela,
  estimarTokens,
  LIMITE_PADRAO_CARACTERES,
  PISO_DO_RESUMO_CARACTERES,
} from "@/lib/peticionamentoJanelaDeContexto";

// "NUNCA trunca em silêncio" (especificação §8) — cada teste de resumo/bloqueio confirma que o
// aviso vem preenchido, nunca null, e que a decisão nunca é "ok" quando não cabe.
//
// ADAPTADO NESTA ENTREGA, DE TOKEN PARA CARACTERE. Esta suíte media tudo em tokens, contra
// LIMITE_PADRAO_TOKENS (128.000). Ela estava verde e o produto estava quebrado: quem recusa de
// verdade é a ponte (`servidor-hermes/servidor.py`), que conta CARACTERES. Medir na unidade
// errada não é detalhe de apresentação — era o defeito. Os casos continuam os mesmos, um a um; o
// que mudou foi a régua. A comparação entre os DOIS lados, que é o que teria pego isto, mora
// agora em lib/testes/peticionamentoLimiteDaPonte.teste.ts.

teste("cabe tudo: ação ok, sem aviso nenhum", () => {
  const r = avaliarJanela([{ id: "1", rotulo: "Documento pequeno", texto: "x".repeat(400) }]);
  igual(r.acao, "ok");
  igual(r.aviso, null);
});

teste("HARD GATE: excede o limite e cabe resumindo — aviso sempre preenchido, nunca null", () => {
  const grande = { id: "1", rotulo: "Histórico antigo", texto: "x".repeat(LIMITE_PADRAO_CARACTERES + 40_000) };
  const r = avaliarJanela([grande]);
  igual(r.acao, "resumido");
  verdade(r.aviso !== null && r.aviso.length > 0, "aviso não pode ficar vazio quando resumiu");
  // ADAPTADO: o aviso antigo dizia "Nada foi descartado, apenas condensado". Era MENTIRA — o
  // "resumo" deste módulo é o COMEÇO do texto, e o resto não vai ao agente. A frase tranquilizava
  // o advogado sobre uma perda que existe. O aviso agora diz o que de fato acontece.
  verdade(!/[Nn]ada foi descartado/.test(r.aviso!), "o aviso não pode afirmar que nada se perdeu — o corte descarta o final do texto");
  verdade(r.aviso!.includes("COMEÇO"), "o advogado precisa saber QUE PARTE do texto sobreviveu ao corte");
});

teste("HARD GATE: item protegido nunca é resumido, mesmo estourando o limite sozinho", () => {
  const protegido = { id: "1", rotulo: "Contestação central", texto: "x".repeat(LIMITE_PADRAO_CARACTERES + 10_000), protegido: true };
  const r = avaliarJanela([protegido]);
  igual(r.itens[0].foiResumido, false);
  igual(r.acao, "bloqueado");
  verdade(r.aviso !== null, "bloqueio sempre com aviso");
});

teste("HARD GATE: mesmo depois de resumir tudo o que dava, se ainda não cabe, bloqueia com explicação do que falta", () => {
  const itens = [
    { id: "1", rotulo: "Anexo A", texto: "x".repeat(150_000), protegido: true },
    { id: "2", rotulo: "Anexo B", texto: "x".repeat(120_000), protegido: true },
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

teste("resumo nunca reduz um item abaixo do piso (nunca vira supressão)", () => {
  const r = avaliarJanela([{ id: "1", rotulo: "Item médio", texto: "x".repeat(LIMITE_PADRAO_CARACTERES + 1_000) }]);
  const item = r.itens.find((i) => i.id === "1")!;
  if (item.foiResumido) verdade(item.caracteresFinais >= PISO_DO_RESUMO_CARACTERES, "resumo abaixo do piso é supressão disfarçada");
});

// O CUSTO FIXO DO PEDIDO — o segundo defeito desta entrega. A avaliação media `fatos` + os
// documentos, mas o que a ponte conta é a MENSAGEM INTEIRA (instruções, matéria, pedidos, teses,
// cercas de documento…). Sem estes casos, um `custoFixo` ignorado passaria verde.

teste("HARD GATE: o custo fixo do pedido entra na conta — o que sobra é que se distribui entre os itens", () => {
  const texto = "x".repeat(100_000);
  const semCusto = avaliarJanela([{ id: "1", rotulo: "Documento", texto, protegido: true }]);
  igual(semCusto.acao, "ok");
  const comCusto = avaliarJanela([{ id: "1", rotulo: "Documento", texto, protegido: true }], { custoFixo: LIMITE_PADRAO_CARACTERES - 50_000 });
  igual(comCusto.acao, "bloqueado", "com o resto do pedido ocupando o orçamento, este documento deixa de caber");
});

teste("o total reportado é o da MENSAGEM, custo fixo incluído — nunca só a soma dos itens", () => {
  const r = avaliarJanela([{ id: "1", rotulo: "Documento", texto: "x".repeat(1_000) }], { custoFixo: 5_000 });
  igual(r.caracteresTotaisOriginais, 6_000);
  igual(r.caracteresTotaisFinais, 6_000);
  igual(r.custoFixo, 5_000);
});

// `textoFinal` é o que costura a decisão desta janela ao texto REALMENTE enviado ao Hermes. Sem
// estes testes, um `textoFinal` que nunca corta (ou que corta calado, sem avisar o PRÓPRIO
// agente) passaria verde no resto da suíte — nenhum outro teste desta casa olha para este campo.

teste("cabe tudo: textoFinal é EXATAMENTE o texto original, sem cortar nem anotar nada", () => {
  const r = avaliarJanela([{ id: "1", rotulo: "Fatos", texto: "Texto pequeno de fatos." }]);
  igual(r.itens[0].textoFinal, "Texto pequeno de fatos.");
});

teste("HARD GATE: item resumido tem textoFinal MENOR que o original, e o corte AVISA o próprio agente (não só a tela)", () => {
  const textoOriginal = "y".repeat(LIMITE_PADRAO_CARACTERES + 40_000);
  const r = avaliarJanela([{ id: "1", rotulo: "Histórico antigo", texto: textoOriginal }]);
  const item = r.itens[0];
  igual(item.foiResumido, true);
  verdade(item.textoFinal.length < textoOriginal.length, "textoFinal deveria ser menor que o original quando resumido");
  verdade(item.textoFinal.includes("RESUMO AUTOMÁTICO"), "TRAVA: o corte precisa avisar o PRÓPRIO agente dentro do texto, não só no campo `aviso` da tela — senão o agente trata o corte como se fosse o documento inteiro");
  verdade(item.textoFinal.includes("Histórico antigo"), "o aviso embutido deveria citar o rótulo do item cortado");
});

teste("HARD GATE: o tamanho contado de um item resumido é o do texto QUE VAI SAIR, aviso embutido incluído", () => {
  const r = avaliarJanela([{ id: "1", rotulo: "Histórico antigo", texto: "y".repeat(LIMITE_PADRAO_CARACTERES + 40_000) }]);
  const item = r.itens[0];
  igual(item.caracteresFinais, item.textoFinal.length, "contar o alvo do corte e enviar o alvo MAIS a nota do corte é subestimar a mensagem de novo");
});

teste("HARD GATE: item protegido NUNCA tem textoFinal diferente do original, mesmo bloqueando a janela inteira", () => {
  const textoOriginal = "z".repeat(LIMITE_PADRAO_CARACTERES + 10_000);
  const r = avaliarJanela([{ id: "1", rotulo: "Contestação central", texto: textoOriginal, protegido: true }]);
  igual(r.acao, "bloqueado");
  igual(r.itens[0].textoFinal, textoOriginal, "item protegido não pode ter o texto cortado, nem quando bloqueia a janela inteira");
});

resumo("Peticionamento — janela de contexto");
