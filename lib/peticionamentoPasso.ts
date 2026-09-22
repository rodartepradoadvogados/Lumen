// EM QUE PASSO A SESSÃO PAROU — especificação §3 da adequação de 21/09/2026: a lista de
// rascunhos mostra "em que passo parou" e o botão Retomar volta ao passo exato, na MESMA ordem
// dos seis cartões do pop-up "Como usar o módulo" (espec. §6): tipo da peça · contexto ·
// questionário · documentos · confirmação · minuta.
//
// FONTE DA VERDADE: `PeticionamentoSessao.passoAtual`, gravado a cada navegação dentro da sessão
// (uma escrita por página visitada — ver as seis páginas em app/peticionamento/[id]/*). Antes
// deste campo existir o passo era só DEDUZIDO do que já estava preenchido — acertava quase
// sempre, e "quase sempre" numa tela que promete "retomar de onde parou" é o bastante para a
// promessa soar falsa exatamente quando erra (ex.: avançou até documentos, voltou para revisar a
// matéria, fechou a aba ali — a dedução manda para documentos; a pessoa estava no contexto).
//
// A dedução não morreu: é o PLANO B, ainda deste módulo PURO, para dois casos em que o valor
// gravado não serve — sessão antiga (nasceu antes de `passoAtual` existir, valor é null) e valor
// gravado inválido (texto torto, ou passo que a lista de hoje não conhece mais). Nos dois,
// fail-closed para "até onde os dados preenchidos já foram", nunca para uma tela quebrada ou
// inexistente. Ver `passoParaRetomar`, abaixo — é ela, não mais `passoDaSessao` sozinha, que o
// resto do sistema deve chamar para o botão Retomar.

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

/** Confere se um valor de texto (o que veio do banco, ou o que a tela mandou gravar) é um dos seis passos que existem hoje. */
export function ehPassoValido(valor: string | null | undefined): valor is PassoDaSessao {
  return typeof valor === "string" && (PASSOS_DA_SESSAO as readonly string[]).includes(valor);
}

/**
 * O passo para o botão Retomar usar — GRAVADO tem prioridade sobre deduzido (espec. da adequação
 * "retomar volta ao passo certo"): a dedução olha só o que está preenchido e erra exatamente no
 * caso em que a pessoa AVANÇOU e depois VOLTOU para revisar algo já preenchido — a navegação real
 * é a única fonte que sabe disso.
 *
 * Dois motivos levam de volta à dedução (plano B), nunca a uma tela quebrada ou inexistente:
 * sessão antiga (nasceu antes deste campo existir, `passoGravado` é null) e passo gravado
 * inválido (texto torto, ou um passo que a lista de hoje não conhece mais) — fail-closed para a
 * heurística de sempre, nunca "manda pra lugar nenhum".
 */
export function passoParaRetomar(dados: DadosParaPasso, passoGravado: string | null | undefined): PassoDaSessao {
  if (ehPassoValido(passoGravado)) return passoGravado;
  return passoDaSessao(dados);
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
