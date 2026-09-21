import { teste, igual, verdade, resumo } from "./executar";
import { deduzirNatureza, ehNaturezaConhecida, NATUREZAS_DE_PROCEDIMENTO } from "../peticionamentoNatureza";

teste("sem vínculo nenhum, não deduz — pede escolha manual, motivo explícito", () => {
  const r = deduzirNatureza([]);
  igual(r.natureza, null);
  verdade(r.motivo.length > 10, "motivo vazio — a dedução nunca pode ser silenciosa (espec. §8)");
});

teste("processo com número E vara → processo judicial, motivo cita os dois sinais", () => {
  const r = deduzirNatureza([{ tipo: "case", numeroProcesso: "0001234-56.2024.8.09.0051", vara: "1ª Vara Cível" }]);
  igual(r.natureza, "processo judicial");
  verdade(r.motivo.includes("número") && r.motivo.includes("vara"), `motivo não cita os dois sinais: "${r.motivo}"`);
});

teste("processo sem vara (ou sem número) → processo administrativo, nunca judicial por engano", () => {
  const semVara = deduzirNatureza([{ tipo: "case", numeroProcesso: "PA-2024-01", vara: null }]);
  igual(semVara.natureza, "processo administrativo");
  const semNumero = deduzirNatureza([{ tipo: "case", numeroProcesso: null, vara: "1ª Vara Cível" }]);
  igual(semNumero.natureza, "processo administrativo");
});

teste("assessoria vinculada, sem processo → consultivo", () => {
  const r = deduzirNatureza([{ tipo: "assessoria" }]);
  igual(r.natureza, "consultivo");
});

teste("atendimento vinculado, sem processo nem assessoria → extrajudicial", () => {
  const r = deduzirNatureza([{ tipo: "attendance" }]);
  igual(r.natureza, "extrajudicial");
});

teste("PRIORIDADE: um processo judicial junto com atendimento/assessoria na mesma sessão vence — sinal mais forte primeiro", () => {
  const r = deduzirNatureza([
    { tipo: "attendance" },
    { tipo: "case", numeroProcesso: "0001234-56.2024.8.09.0051", vara: "1ª Vara Cível" },
  ]);
  igual(r.natureza, "processo judicial");
});

teste("PRIORIDADE: processo administrativo vence sobre assessoria/atendimento na mesma sessão", () => {
  const r = deduzirNatureza([{ tipo: "assessoria" }, { tipo: "case", numeroProcesso: "PA-01", vara: null }]);
  igual(r.natureza, "processo administrativo");
});

teste("as quatro naturezas da especificação §8, nesta ordem, e nada além disso", () => {
  igual(NATUREZAS_DE_PROCEDIMENTO, ["processo judicial", "processo administrativo", "extrajudicial", "consultivo"]);
});

teste("ehNaturezaConhecida reconhece as quatro e rejeita o resto", () => {
  for (const n of NATUREZAS_DE_PROCEDIMENTO) verdade(ehNaturezaConhecida(n), `"${n}" deveria ser conhecida`);
  verdade(!ehNaturezaConhecida("recursal"), "natureza fora da lista não deveria ser conhecida");
  verdade(!ehNaturezaConhecida(null), "null não é natureza conhecida");
});

resumo("Peticionamento — natureza do procedimento deduzida (espec. §8)");
