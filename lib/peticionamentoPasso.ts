// EM QUE PASSO A SESSÃO PAROU — especificação §3 da adequação de 21/09/2026: a lista de
// rascunhos mostra "em que passo parou" e o botão Retomar volta ao passo exato. O banco não guarda
// um "passo atual" explícito (as etapas contexto/questionário/documentos convivem sob o mesmo
// status "CONTEXTO" — só muda quando a minuta é gerada ou exportada), então este módulo PURO
// deriva o passo mais avançado que os dados já alcançaram, na MESMA ordem dos seis cartões do
// pop-up "Como usar o módulo" (espec. §6): tipo da peça · contexto · questionário · documentos ·
// confirmação · minuta.
//
// É heurística, documentada de propósito: sem um campo dedicado de "página em que o advogado
// estava", a melhor aproximação honesta é "até onde os dados preenchidos já foram" — o "Retomar"
// leva para lá, nunca para um passo que ainda falta preencher.

import { avaliarProntidao } from "@/lib/peticionamentoMinimo";

export const PASSOS_DA_SESSAO = ["tipo-de-peca", "contexto", "questionario", "documentos", "confirmacao", "minuta"] as const;

export type PassoDaSessao = (typeof PASSOS_DA_SESSAO)[number];

export const ROTULO_DO_PASSO: Record<PassoDaSessao, string> = {
  "tipo-de-peca": "Tipo da peça",
  contexto: "Contexto",
  questionario: "Questionário",
  documentos: "Documentos",
  confirmacao: "Confirmação",
  minuta: "Minuta",
};

export type DadosParaPasso = {
  status: string;
  categoriaPeca: string | null | undefined;
  materiaNome: string | null | undefined;
  contextoDecidido: boolean; // true assim que a sessão vinculou algo OU escolheu avulsa explicitamente (PeticionamentoSessao.contextoDecidido)
  fatos: string | null | undefined;
  pedidos: (string | null | undefined)[] | null | undefined;
  temDocumento: boolean; // documento existente selecionado OU anexo novo desta sessão
};

/** O caminho de página para "Retomar" — o MESMO padrão de rota usado pelas páginas da árvore [id]. */
export function hrefDoPasso(sessaoId: string, passo: PassoDaSessao): string {
  const rota: Record<PassoDaSessao, string> = {
    "tipo-de-peca": `/peticionamento/${sessaoId}/tipo`,
    contexto: `/peticionamento/${sessaoId}/contexto`,
    questionario: `/peticionamento/${sessaoId}/wizard`,
    documentos: `/peticionamento/${sessaoId}/documentos`,
    confirmacao: `/peticionamento/${sessaoId}/confirmar`,
    minuta: `/peticionamento/${sessaoId}/minuta`,
  };
  return rota[passo];
}

export function passoDaSessao(dados: DadosParaPasso): PassoDaSessao {
  if (dados.status === "GERANDO" || dados.status === "GERADA" || dados.status === "FALHA_GERACAO") return "minuta";

  const pronto = avaliarProntidao({ fatos: dados.fatos, pedidos: dados.pedidos }).pronto;
  if (pronto) return "confirmacao";

  if (!dados.categoriaPeca) return "tipo-de-peca";
  if (!dados.materiaNome && !dados.contextoDecidido) return "contexto";

  // Chegou a anexar/selecionar documento antes de fechar fatos+pedidos: mostra "documentos" em
  // vez de "questionário" porque foi ali que a última ação de verdade aconteceu.
  const temAlgumFatoOuPedido = (dados.fatos ?? "").trim().length > 0 || (dados.pedidos ?? []).some((p) => (p ?? "").trim().length > 0);
  if (dados.temDocumento && !temAlgumFatoOuPedido) return "documentos";

  return "questionario";
}

/** "Numa sessão vazia, sair é sair" (espec. §4) — a MESMA conta decide quando o pop-up de saída aparece. */
export function sessaoTemTrabalhoEmAndamento(dados: {
  categoriaPeca: string | null | undefined;
  materiaNome: string | null | undefined;
  contextoDecidido: boolean;
  fatos: string | null | undefined;
  pedidos: (string | null | undefined)[] | null | undefined;
  temDocumento: boolean;
  minutaTexto: string | null | undefined;
}): boolean {
  if (dados.categoriaPeca) return true;
  if (dados.materiaNome) return true;
  if (dados.contextoDecidido) return true;
  if ((dados.fatos ?? "").trim().length > 0) return true;
  if ((dados.pedidos ?? []).some((p) => (p ?? "").trim().length > 0)) return true;
  if (dados.temDocumento) return true;
  if ((dados.minutaTexto ?? "").trim().length > 0) return true;
  return false;
}
