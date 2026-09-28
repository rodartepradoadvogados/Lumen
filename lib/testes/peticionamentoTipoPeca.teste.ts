import { teste, igual, resumo } from "./executar";
import { TIPOS_DE_PECA, ehTipoConhecido, categoriaDoTipoDePeca, categoriaDaSessao } from "@/lib/peticionamentoTipoPeca";
import { montarNomeArquivoPeticao, dataParaNomeArquivo } from "@/lib/peticionamentoNomeArquivo";

teste("lista fechada tem os 12 itens da especificação §9, na ordem", () => {
  igual(TIPOS_DE_PECA, [
    "Inicial",
    "Contestação",
    "Réplica",
    "Apelação",
    "Contrarrazões de Apelação",
    "Agravo de Instrumento",
    "Embargos de Declaração",
    "Recurso Especial/Extraordinário",
    "Cumprimento de Sentença",
    "Petição Intermediária/Manifestação",
    "Tutela de Urgência",
    "Outra",
  ]);
});

teste("ehTipoConhecido", () => {
  igual(ehTipoConhecido("Réplica"), true);
  igual(ehTipoConhecido("Recurso Inventado"), false);
});

teste("exemplos literais do contrato-com-o-agente.md §4", () => {
  igual(categoriaDoTipoDePeca("Réplica"), "REPLICA");
  igual(categoriaDoTipoDePeca("Agravo de Instrumento"), "AGRAVO_DE_INSTRUMENTO");
  igual(categoriaDoTipoDePeca("Cumprimento de Sentença"), "CUMPRIMENTO_DE_SENTENCA");
});

teste("categoria remove acento, barra e parênteses", () => {
  igual(categoriaDoTipoDePeca("Recurso Especial/Extraordinário"), "RECURSO_ESPECIAL_EXTRAORDINARIO");
  igual(categoriaDoTipoDePeca("Petição Intermediária/Manifestação"), "PETICAO_INTERMEDIARIA_MANIFESTACAO");
});

teste("categoriaDaSessao usa o tipo fixo quando não é Outra", () => {
  igual(categoriaDaSessao("Réplica", null), "REPLICA");
});

teste('categoriaDaSessao usa o texto livre quando o tipo é "Outra" — nunca cai em OUTRA genérico', () => {
  igual(categoriaDaSessao("Outra", "Impugnação ao Cumprimento de Sentença"), "IMPUGNACAO_AO_CUMPRIMENTO_DE_SENTENCA");
});

teste('"Outra" sem texto digitado cai no rótulo padrão PETICAO — nunca fica vazio', () => {
  igual(categoriaDaSessao("Outra", null), "PETICAO");
  igual(categoriaDaSessao("Outra", "   "), "PETICAO");
});

teste("sem tipo de peça nenhum: PETICAO (nunca nome de arquivo vazio)", () => {
  igual(categoriaDaSessao(null, null), "PETICAO");
  igual(categoriaDaSessao(undefined, undefined), "PETICAO");
});

teste("nome do arquivo: [aaaa_mm_dd]_CATEGORIA.docx — exemplo literal do contrato §4", () => {
  igual(dataParaNomeArquivo(new Date(2026, 8, 21)), "2026_09_21");
  igual(montarNomeArquivoPeticao({ dataGeracao: new Date(2026, 8, 21), tipoPeca: "Réplica" }), "2026_09_21_REPLICA.docx");
});

teste("nome do arquivo usa a data de GERAÇÃO passada, nunca a de hoje implícita", () => {
  igual(montarNomeArquivoPeticao({ dataGeracao: new Date(2020, 0, 5), tipoPeca: "Inicial" }), "2020_01_05_INICIAL.docx");
});

resumo("Peticionamento — tipo de peça e nome de arquivo");
