// O nome do arquivo exportado — contrato-com-o-agente.md §4: sempre "[aaaa_mm_dd]_CATEGORIA.docx",
// mesmo padrão já usado pela skill rodarte-prado-lumen no Drive do escritório (a especificação é
// explícita: não inventar uma segunda nomenclatura). `aaaa_mm_dd` é a data de GERAÇÃO da minuta
// (não a de exportação, se forem dias diferentes) — por isso quem chama passa a data explícita,
// nunca `new Date()` direto aqui (este módulo é puro e não decide "agora").

import { categoriaDaSessao } from "@/lib/peticionamentoTipoPeca";

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** AAAA_MM_DD no fuso já resolvido por quem chama (passar sempre a data de GERAÇÃO). */
export function dataParaNomeArquivo(data: Date): string {
  return `${data.getFullYear()}_${doisDigitos(data.getMonth() + 1)}_${doisDigitos(data.getDate())}`;
}

export function montarNomeArquivoPeticao(input: {
  dataGeracao: Date;
  tipoPeca: string | null | undefined;
  tipoPecaOutro?: string | null;
}): string {
  const categoria = categoriaDaSessao(input.tipoPeca, input.tipoPecaOutro);
  return `${dataParaNomeArquivo(input.dataGeracao)}_${categoria}.docx`;
}
