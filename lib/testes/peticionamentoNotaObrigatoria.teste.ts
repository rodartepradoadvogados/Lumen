import { teste, igual, verdade, resumo } from "./executar";
import { montarNotaObrigatoria } from "@/lib/peticionamentoNotaObrigatoria";

// HARD GATE — especificação §3: "cita jurisprudência sem indicar a fonte e sem aviso de
// validação cruzada" precisa de bloqueio técnico de sistema. Este módulo É o bloqueio: o aviso é
// ACRESCENTADO pelo código a cada precedente, nunca decidido pelo texto que o modelo escreveu.

const base = {
  precedentes: [],
  documentosBaseConsultados: [],
  contextoVinculadoDescricao: "Processo nº 5432109-87.2024.8.09.0051",
  geradoEm: new Date(2026, 8, 21, 14, 32),
  perfil: "peticionamento-lumen",
  sessaoId: "a294f1e0",
};

teste("cabeçalho literal da especificação §3", () => {
  const nota = montarNotaObrigatoria(base);
  verdade(nota.includes("MINUTA GERADA POR IA — REVISÃO OBRIGATÓRIA"), "falta o título literal");
  verdade(nota.includes("não deve ser protocolado sem revisão integral por advogado habilitado"), "falta a frase literal de revisão obrigatória");
});

teste("sem precedente nenhum: linha explícita, nunca omitida", () => {
  const nota = montarNotaObrigatoria(base);
  verdade(nota.includes("nenhum precedente citado nesta minuta"), "deveria declarar ausência de precedente");
});

teste("HARD GATE: todo precedente citado sempre carrega o aviso de validação cruzada, mesmo que o dado de entrada não tenha nada além do texto", () => {
  const nota = montarNotaObrigatoria({ ...base, precedentes: [{ texto: "STJ, REsp 1.874.782/SP (Tema 990)", fonte: "https://stj.jus.br/x" }] });
  verdade(nota.includes("requer validação cruzada"), "aviso de validação cruzada ausente");
  verdade(nota.includes("Conjur/Migalhas/Jusbrasil"), "exemplo de fonte cruzada ausente");
  verdade(nota.includes("https://stj.jus.br/x"), "fonte do precedente ausente");
});

teste("HARD GATE: precedente SEM fonte informada ainda assim recebe a linha, com aviso de ausência de fonte", () => {
  const nota = montarNotaObrigatoria({ ...base, precedentes: [{ texto: "Tema fictício sem fonte", fonte: null }] });
  verdade(nota.includes("fonte não informada"), "deveria avisar que a fonte não veio, nunca fingir que veio");
  verdade(nota.includes("requer validação cruzada"), "o aviso de validação cruzada continua, mesmo sem fonte");
});

teste("HARD GATE: dois precedentes — os DOIS recebem o aviso, não só o primeiro", () => {
  const nota = montarNotaObrigatoria({
    ...base,
    precedentes: [
      { texto: "Precedente A", fonte: "https://a.example" },
      { texto: "Precedente B", fonte: "https://b.example" },
    ],
  });
  const ocorrencias = nota.split("requer validação cruzada").length - 1;
  igual(ocorrencias, 2, "cada precedente citado deveria carregar seu PRÓPRIO aviso — nunca um aviso só para a lista inteira: ");
  verdade(nota.includes("Precedente A") && nota.includes("Precedente B"), "os dois precedentes deveriam aparecer");
});

teste("sem documento consultado: linha explícita", () => {
  const nota = montarNotaObrigatoria(base);
  verdade(nota.includes("nenhum documento consultado nesta sessão"), "deveria declarar ausência de documento");
});

teste("HARD GATE: sessão avulsa nunca fica com a linha de contexto em branco", () => {
  const nota = montarNotaObrigatoria({ ...base, contextoVinculadoDescricao: null });
  verdade(nota.includes("sem vínculo — petição avulsa"), "sessão avulsa deveria dizer isso explicitamente, nunca ficar em branco");
});

teste("rodapé sempre traz perfil e sessão", () => {
  const nota = montarNotaObrigatoria(base);
  verdade(nota.includes("Perfil: peticionamento-lumen"), "falta o perfil no rodapé");
  verdade(nota.includes("Sessão: a294f1e0"), "falta o id da sessão no rodapé");
});

resumo("Peticionamento — nota de destaque obrigatória");
