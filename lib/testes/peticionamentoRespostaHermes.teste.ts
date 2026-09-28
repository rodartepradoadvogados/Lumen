import { teste, igual, verdade, resumo } from "./executar";
import { interpretarRespostaHermes } from "@/lib/peticionamentoRespostaHermes";
import { MARCADORES_RESPOSTA_HERMES as M } from "@/lib/peticionamentoPrompt";

teste("resposta bem formatada: separa as quatro seções", () => {
  const bruto = [
    M.corpo,
    "EXCELENTÍSSIMO... corpo da peça.\n\nTermos em que pede deferimento.",
    M.jurisprudencia,
    "STJ, REsp 1.874.782/SP (Tema 990) || https://stj.jus.br/x",
    M.riscos,
    "Não há prova de X — considerar.",
    M.documentos,
    "2026_08_14_LIMINAR.pdf",
  ].join("\n");
  const r = interpretarRespostaHermes(bruto);
  igual(r.formatoInesperado, false);
  verdade(r.corpo.includes("Termos em que pede deferimento"), "corpo deveria conter o fecho");
  igual(r.jurisprudencia.length, 1);
  igual(r.jurisprudencia[0].texto, "STJ, REsp 1.874.782/SP (Tema 990)");
  igual(r.jurisprudencia[0].fonte, "https://stj.jus.br/x");
  igual(r.riscos, ["Não há prova de X — considerar."]);
  igual(r.documentosUsados, ["2026_08_14_LIMINAR.pdf"]);
});

teste("precedente sem fonte (sem '||'): texto inteiro vira o texto, fonte null", () => {
  const bruto = `${M.corpo}\ncorpo\n${M.jurisprudencia}\nTema fictício sem link`;
  const r = interpretarRespostaHermes(bruto);
  igual(r.jurisprudencia[0].fonte, null);
  igual(r.jurisprudencia[0].texto, "Tema fictício sem link");
});

teste("precedente com as DUAS fontes (terceiro campo '||'): fonte E fonteSecundaria preenchidas — lista de validação de citações", () => {
  const bruto = `${M.corpo}\ncorpo\n${M.jurisprudencia}\nSTJ, REsp 1.874.782/SP (Tema 990) || https://stj.jus.br/x || https://conjur.com.br/y`;
  const r = interpretarRespostaHermes(bruto);
  igual(r.jurisprudencia[0].fonte, "https://stj.jus.br/x");
  igual(r.jurisprudencia[0].fonteSecundaria, "https://conjur.com.br/y");
});

teste("precedente com fonte única (dois campos '||'): fonteSecundaria fica null, nunca undefined silencioso", () => {
  const bruto = `${M.corpo}\ncorpo\n${M.jurisprudencia}\nTema 990 || https://stj.jus.br/x`;
  const r = interpretarRespostaHermes(bruto);
  igual(r.jurisprudencia[0].fonte, "https://stj.jus.br/x");
  igual(r.jurisprudencia[0].fonteSecundaria, null);
});

teste("seções vazias (só o placeholder entre parênteses) viram lista vazia, nunca um item fantasma", () => {
  const bruto = `${M.corpo}\ncorpo\n${M.jurisprudencia}\n(nenhum precedente citado)\n${M.riscos}\n(nada a apontar)`;
  const r = interpretarRespostaHermes(bruto);
  igual(r.jurisprudencia, []);
  igual(r.riscos, []);
});

teste("NUNCA falha: resposta sem NENHUM marcador vira corpo inteiro, com aviso de formato inesperado", () => {
  const bruto = "O Hermes simplesmente escreveu a petição inteira aqui, sem seguir o formato pedido.";
  const r = interpretarRespostaHermes(bruto);
  igual(r.formatoInesperado, true);
  igual(r.corpo, bruto);
  igual(r.jurisprudencia, []);
  igual(r.riscos, []);
});

teste("tipo de peça inferido: extrai a primeira linha da seção", () => {
  const bruto = `${M.corpo}\ncorpo\n${M.tipoPecaInferido}\nRéplica`;
  const r = interpretarRespostaHermes(bruto);
  igual(r.tipoPecaInferido, "Réplica");
});

teste("tipo de peça inferido ausente vira null, nunca string vazia enganosa", () => {
  const bruto = `${M.corpo}\ncorpo`;
  const r = interpretarRespostaHermes(bruto);
  igual(r.tipoPecaInferido, null);
});

resumo("Peticionamento — leitura da resposta do Hermes");
