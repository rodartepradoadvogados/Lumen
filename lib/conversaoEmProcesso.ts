import { cnjValido, normalizarCnj, formatarCnj } from "@/lib/cnjNumero";
import { nomeEhTemporario } from "@/lib/nomeTemporarioDoLead";

// ============================================================================
// TRANSFORMAR O ATENDIMENTO EM PROCESSO OU CASO — as regras, sem banco (N19).
//
// Converter cria um Case, cria ou liga o cliente, leva os anexos e a pasta do Drive e fecha o
// atendimento. NÃO HÁ COMO DESFAZER pelo Lúmen. Por isso o aplicativo mostra ANTES o que vai acontecer
// (`revisaoDaConversao`) e só converte com a pessoa ciente — e o servidor repete as travas
// (`validarConversao`) porque a tela é só a tela.
//
// AS TRAVAS (o que faltava no código de 2026-09 e a auditoria A.10 pediu):
//   • duplo toque / duas abas: atendimento que já virou processo não vira outro;
//   • número CNJ com dígito verificador que não bate não entra como "processo judicial";
//   • nome temporário ("Novo contato (…)"): o cliente do processo nasceria com o telefone como nome;
//   • lead recusado: a recusa é uma decisão — desfazê-la vem antes de pegar o caso.
// ============================================================================

export type TipoDeConversao = "CASO" | "JUDICIAL";

/** O `Case.type` que cada escolha grava ("ATENDIMENTO" é o tipo legado que a natureza lê como Caso). */
export const TIPO_DO_CASE: Record<TipoDeConversao, string> = { CASO: "ATENDIMENTO", JUDICIAL: "JUDICIAL" };

export function tipoDeConversao(valor: unknown): TipoDeConversao | null {
  return valor === "CASO" || valor === "JUDICIAL" ? valor : null;
}

export type OpcoesDaConversao = {
  /** Processo judicial só com número CNJ de verdade (dígito verificador e tribunal). */
  exigirCnj: boolean;
  bloquearNomeTemporario: boolean;
  bloquearRecusado: boolean;
};

/** O aplicativo trava tudo; o site mantém o comportamento de sempre e ganha só a trava de "já convertido". */
export const OPCOES_DO_APLICATIVO: OpcoesDaConversao = { exigirCnj: true, bloquearNomeTemporario: true, bloquearRecusado: true };
export const OPCOES_DO_SITE: OpcoesDaConversao = { exigirCnj: false, bloquearNomeTemporario: false, bloquearRecusado: false };

export type EntradaDaValidacao = {
  tipo: TipoDeConversao;
  numero?: string | null;
  nomeDoContato: string;
  status: string;
  convertedCaseId: string | null;
};

/** `null` quando pode converter; senão a frase que a pessoa lê. */
export function validarConversao(e: EntradaDaValidacao, o: OpcoesDaConversao): string | null {
  if (e.convertedCaseId || e.status === "CONVERTIDO") return "Este atendimento já virou processo ou caso.";
  if (o.bloquearRecusado && e.status === "RECUSADO") return "Este lead foi recusado. Desfaça a recusa antes de transformá-lo em processo.";
  if (o.bloquearNomeTemporario && nomeEhTemporario(e.nomeDoContato)) {
    return "O nome do contato ainda é temporário. Defina o nome de quem é antes de converter: o cliente do processo nasceria com o telefone como nome.";
  }
  if (e.tipo === "JUDICIAL" && o.exigirCnj) {
    if (!(e.numero ?? "").trim()) return "Informe o número do processo.";
    if (!cnjValido(e.numero)) return "Número fora do padrão CNJ ou com dígito verificador que não confere. Confira os dígitos.";
  }
  return null;
}

/** O número do processo como será gravado: com a máscara do CNJ quando ele é válido; senão como veio. */
export function numeroParaGravar(numero: string | null | undefined): string | null {
  const t = (numero ?? "").trim();
  if (!t) return null;
  const d = normalizarCnj(t);
  return d ? formatarCnj(d) : t;
}

export type TomDoItem = "ok" | "aviso" | "nao-desfaz";
export type ItemDaRevisao = { tom: TomDoItem; texto: string };

export type EntradaDaRevisao = {
  tipo: TipoDeConversao;
  numero: string | null;
  vara: string | null;
  assunto: string;
  nomeDoContato: string;
  /** Como o cliente do processo nasce. */
  cliente: "vinculado" | "mesmoNome" | "novo";
  materia: string | null;
  responsavel: string | null;
  temRelato: boolean;
  anexos: number;
  temPastaNoDrive: boolean;
  anotacoesDoUsuario: number;
  pendenciasAbertas: number;
  tarefasAbertas: number;
  honorario: { valor: number | null; modo: string | null } | null;
};

const rotuloDoTipo = (t: TipoDeConversao) => (t === "JUDICIAL" ? "processo judicial" : "caso");

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * "O que vai acontecer", em frases curtas, na ordem: o que é CRIADO, o que é COPIADO ou MOVIDO, o que
 * FICA e o aviso final. Diz também o que NÃO acontece (anotações pessoais não vão junto) — a promessa do
 * aplicativo é a do código.
 */
export function revisaoDaConversao(e: EntradaDaRevisao): ItemDaRevisao[] {
  const alvo = rotuloDoTipo(e.tipo);
  const itens: ItemDaRevisao[] = [];

  const dados = [`título “${e.assunto}”`];
  if (e.materia) dados.push(`matéria ${e.materia}`);
  if (e.responsavel) dados.push(`responsável ${e.responsavel}`);
  if (e.temRelato) dados.push("o relato do atendimento como descrição");
  if (e.tipo === "JUDICIAL" && e.numero) dados.push(`nº ${numeroParaGravar(e.numero)}`);
  if (e.tipo === "JUDICIAL" && e.vara?.trim()) dados.push(e.vara.trim());
  itens.push({ tom: "ok", texto: `Cria o ${alvo} com ${dados.join(", ")}.` });

  itens.push({
    tom: "ok",
    texto:
      e.cliente === "vinculado"
        ? `Liga ao cadastro do cliente “${e.nomeDoContato}”, que já está vinculado a este atendimento.`
        : e.cliente === "mesmoNome"
          ? `Liga ao cadastro que já existe com o nome “${e.nomeDoContato}”.`
          : `Cria o cliente “${e.nomeDoContato}” (pessoa física) e o liga ao ${alvo}.`,
  });

  itens.push({
    tom: "ok",
    texto:
      e.anexos > 0
        ? `${plural(e.anexos, "anexo passa", "anexos passam")} a pertencer ao ${alvo}.${e.temPastaNoDrive ? " A pasta do Drive é renomeada e movida, sem duplicar." : ""}`
        : "Nenhum anexo para levar.",
  });

  if (e.honorario) {
    const valor = e.honorario.valor != null ? ` (${e.honorario.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})` : "";
    itens.push({
      tom: "ok",
      texto: `O honorário pretendido${valor} pré-preenche o “Lançar honorários” do ${alvo}, no site. Nada é cobrado sozinho.`,
    });
  }

  itens.push({
    tom: "aviso",
    texto:
      e.anotacoesDoUsuario > 0
        ? `${plural(e.anotacoesDoUsuario, "anotação sua continua", "anotações suas continuam")} neste atendimento. Anotações pessoais não são copiadas para o ${alvo}.`
        : "Anotações pessoais não são copiadas para o processo; ficam neste atendimento.",
  });

  const ficam: string[] = ["a conversa"];
  if (e.pendenciasAbertas > 0) ficam.push(plural(e.pendenciasAbertas, "pendência aberta", "pendências abertas"));
  if (e.tarefasAbertas > 0) ficam.push(plural(e.tarefasAbertas, "tarefa aberta", "tarefas abertas"));
  itens.push({ tom: "aviso", texto: `Continuam registradas aqui: ${ficam.join(", ")}. Nada é cancelado.` });

  itens.push({ tom: "ok", texto: "A situação do atendimento vira “Convertido”. A fase do funil não muda." });
  itens.push({ tom: "nao-desfaz", texto: "Não há como desfazer pelo Lúmen. Confira antes." });
  return itens;
}
