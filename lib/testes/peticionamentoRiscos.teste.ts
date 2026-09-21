import { teste, igual, verdade, resumo } from "./executar";
import { avaliarFraseDeRisco, filtrarNotaDeRiscos, comAvisoDeContextoResumido } from "@/lib/peticionamentoRiscos";

// "Aponta, não decide" (contrato-com-o-agente.md §3) — filtro mecânico de segunda linha, que o
// próprio decisions.md §10 avisa não ser garantia total. Testado contra o gabarito literal do
// contrato (coluna "não pode dizer").

teste("frases do gabarito 'pode dizer' passam", () => {
  igual(avaliarFraseDeRisco("Não há nos autos consultados documento que comprove X.").aceito, true);
  igual(avaliarFraseDeRisco("O prazo fatal registrado é 05/10/2026, a menos de duas semanas desta minuta.").aceito, true);
  igual(avaliarFraseDeRisco("Há uma tese não marcada nesta sessão que pode ser aplicável: inversão do ônus da prova, considerar se cabe reforçar.").aceito, true);
});

teste("HARD GATE: frases do gabarito 'não pode dizer' são rejeitadas", () => {
  igual(avaliarFraseDeRisco("Esse pedido dificilmente será deferido por falta de prova.").aceito, false);
  igual(avaliarFraseDeRisco("Não há tempo hábil para uma defesa adequada, certamente.").aceito, false);
  igual(avaliarFraseDeRisco("A tese X é mais forte e deveria substituir a apresentada.").aceito, false);
  igual(avaliarFraseDeRisco("O tipo de peça correto para este caso é Y.").aceito, false);
  igual(avaliarFraseDeRisco("A jurisprudência do STJ garante o deferimento deste pedido.").aceito, false);
});

teste("HARD GATE: percentual de chance é sempre rejeitado", () => {
  igual(avaliarFraseDeRisco("Há 70% de chance de sucesso neste pedido.").aceito, false);
  igual(avaliarFraseDeRisco("Estimamos 15% de risco de indeferimento.").aceito, false);
});

teste("HARD GATE: 'provavelmente' e variações de prognóstico são rejeitadas", () => {
  igual(avaliarFraseDeRisco("O pedido provavelmente será acolhido.").aceito, false);
  igual(avaliarFraseDeRisco("É provável que o juiz mantenha a decisão.").aceito, false);
});

teste("filtrarNotaDeRiscos separa aceitas de rejeitadas, com motivo", () => {
  const r = filtrarNotaDeRiscos([
    "Não há prova de descumprimento total — considerar juntar prova adicional.",
    "Esse pedido dificilmente será deferido.",
  ]);
  igual(r.aceitas.length, 1);
  igual(r.rejeitadas.length, 1);
  verdade(r.rejeitadas[0].motivo.length > 0, "toda rejeição precisa de motivo — nunca cortada em silêncio");
});

teste("filtrarNotaDeRiscos com lista vazia devolve as duas listas vazias", () => {
  igual(filtrarNotaDeRiscos([]), { aceitas: [], rejeitadas: [] });
});

teste("aviso de contexto resumido só entra quando a sessão de fato resumiu", () => {
  igual(comAvisoDeContextoResumido(["Risco A"], false), ["Risco A"]);
  const comAviso = comAvisoDeContextoResumido(["Risco A"], true);
  verdade(comAviso[0].includes("resumida automaticamente"), "deveria avisar sobre contexto resumido");
  verdade(comAviso[0].startsWith("Risco A"), "não deveria apagar o texto original do risco");
});

resumo("Peticionamento — nota de riscos (aponta, não decide)");
