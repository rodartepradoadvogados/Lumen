import { DOCUMENT_TYPE_GROUPS, composeDocumentTypeGroups, type OfficeDocumentTypeEntry } from "@/lib/documentTypes";

// Contrato compartilhado entre a tela (components/relatorios/RelatorioPersonalizadoView.tsx) e as
// Server Actions (lib/actions/relatorioPersonalizado.ts) do Relatório Personalizado.
//
// REGRA CENTRAL DOS FILTROS (decisão do dono do escritório): dimensão com NENHUM valor marcado é
// DESCONSIDERADA — não filtra nada, deixa passar tudo, inclusive registros sem valor naquela
// dimensão. Não existe "lista vazia = não trazer nada" em lugar nenhum deste módulo. Quem quiser
// justamente o que está em branco marca o valor especial SEM_* (ver abaixo), que é um valor
// selecionável como outro qualquer.

// Valores especiais que representam "o campo está em branco" — selecionáveis como qualquer outro,
// para o relatório servir também de caça a cadastro incompleto (ex.: peça sem responsável).
export const SEM_ASSESSORIA = "__SEM_ASSESSORIA__";
export const SEM_RESPONSAVEL = "__SEM_RESPONSAVEL__";

export type BaseData = "PRODUCAO" | "VENCIMENTO" | "CADASTRO";

export const BASE_DATA_OPCOES: { value: BaseData; label: string; ajuda: string }[] = [
  { value: "PRODUCAO", label: "conclusão / produção", ajuda: "O que foi efetivamente feito no período — responde “quanto trabalho saiu”." },
  { value: "VENCIMENTO", label: "vencimento", ajuda: "O que vencia no período, tendo sido feito ou não." },
  { value: "CADASTRO", label: "cadastro", ajuda: "O que entrou no escritório no período." },
];

// O QUE CONTAR — cada chave liga um bloco de apuração. Marcar nenhuma = contar tudo (regra acima).
export type Contagem = "PECAS" | "COMPROMISSOS" | "PROCESSOS" | "ATENDIMENTOS" | "DEMANDAS";

export const CONTAGEM_OPCOES: { value: Contagem; label: string }[] = [
  { value: "PECAS", label: "Peças produzidas" },
  { value: "COMPROMISSOS", label: "Compromissos da agenda" },
  { value: "PROCESSOS", label: "Processos e casos" },
  { value: "ATENDIMENTOS", label: "Atendimentos" },
  { value: "DEMANDAS", label: "Demandas (pareceres)" },
];

// ORIGEM DO TRABALHO — substitui o antigo "Natureza do processo", que não comportava atendimento
// nem publicação (decisão do dono do escritório). Cobre as três frentes de onde sai trabalho:
// processo (nas três naturezas de Case), atendimento e a fila de publicações/andamentos.
export type Origem = "JUDICIAL" | "ADMINISTRATIVO" | "CASO" | "ATENDIMENTO" | "PUBLICACAO";

export const ORIGEM_OPCOES: { value: Origem; label: string }[] = [
  { value: "JUDICIAL", label: "Processo judicial" },
  { value: "ADMINISTRATIVO", label: "Processo administrativo" },
  { value: "CASO", label: "Caso (extrajudicial)" },
  { value: "ATENDIMENTO", label: "Atendimento" },
  { value: "PUBLICACAO", label: "Publicações e andamentos" },
];

export type TipoCompromisso = "TAREFA" | "EVENTO" | "AUDIENCIA" | "PERICIA" | "PRAZO";

export const TIPO_COMPROMISSO_OPCOES: { value: TipoCompromisso; label: string }[] = [
  { value: "PRAZO", label: "Prazo" },
  { value: "AUDIENCIA", label: "Audiência" },
  { value: "PERICIA", label: "Perícia" },
  { value: "TAREFA", label: "Tarefa" },
  { value: "EVENTO", label: "Evento" },
];

// A QUEM O TRABALHO É CREDITADO. Os dois critérios existem de verdade no banco e medem coisas
// diferentes — ver o comentário de `creditoDe` em lib/actions/relatorioPersonalizado.ts.
export type CriterioAutoria = "ANEXOU" | "RESPONSAVEL";

export const CRITERIO_AUTORIA_OPCOES: { value: CriterioAutoria; label: string; ajuda: string }[] = [
  {
    value: "ANEXOU",
    label: "Quem anexou / concluiu",
    ajuda: "Varia item a item — é o mais próximo de “quem executou este ato”. Recomendado para medir produção.",
  },
  {
    value: "RESPONSAVEL",
    label: "Responsável pelo processo",
    ajuda: "Atribui tudo ao dono da pasta, mesmo o que um colega produziu. Use para cobrança e carteira.",
  },
];

// Os 11 grupos do catálogo de documentos (lib/documentTypes.ts) são a unidade de filtro de peça —
// não o tipo individual (decisão do dono do escritório: filtrar por "Recursos", não por cada um
// dos 14 recursos). Tipos próprios do escritório (model OfficeDocumentType) entram no grupo em
// que foram cadastrados, então o filtro os cobre sozinho, sem lista paralela.
export const GRUPOS_PECA_PADRAO: string[] = DOCUMENT_TYPE_GROUPS.map((g) => g.group);

// Expande os grupos escolhidos na lista de chaves de tipo que o banco guarda em
// Attachment.docType / AssessoriaDocumento.docType.
export function tiposDosGrupos(grupos: string[], officeTypes: OfficeDocumentTypeEntry[]): string[] {
  const todos = composeDocumentTypeGroups(officeTypes);
  return todos.filter((g) => grupos.includes(g.group)).flatMap((g) => g.types.map((t) => t.key));
}

export type RelatorioFiltros = {
  de: string; // YYYY-MM-DD
  ate: string; // YYYY-MM-DD (inclusivo — a apuração soma 1 dia internamente)
  baseData: BaseData;
  contar: Contagem[];
  origens: Origem[];
  assessoriaIds: string[]; // pode conter SEM_ASSESSORIA
  responsavelIds: string[]; // pode conter SEM_RESPONSAVEL
  gruposPeca: string[]; // nomes de grupo de lib/documentTypes.ts
  tiposCompromisso: TipoCompromisso[];
  criterioAutoria: CriterioAutoria;
  // Seleção manual item a item (LinhaDetalhe.id) feita na janela de conferência antes de
  // imprimir/baixar em Word (ver SelecaoItensRelatorioModal) — não é um filtro de verdade
  // (não muda o que existe no escritório), é uma curadoria pontual DESTA emissão: serve, por
  // exemplo, pra contar só uma das versões de um documento que foi reanexado, sem apagar a
  // outra. Nunca preenchido a partir da tela de filtros nem gravado num modelo salvo — só
  // populado momentos antes de imprimir/baixar (ver RelatorioPersonalizadoView.tsx).
  itensExcluidos?: string[];
};

export function filtrosPadrao(): RelatorioFiltros {
  const hoje = new Date();
  const inicioDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  return {
    de: isoDia(inicioDoMes),
    ate: isoDia(hoje),
    baseData: "PRODUCAO",
    contar: [],
    origens: [],
    assessoriaIds: [],
    responsavelIds: [],
    gruposPeca: [],
    tiposCompromisso: [],
    criterioAutoria: "ANEXOU",
    itensExcluidos: [],
  };
}

export function isoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Uma dimensão só filtra quando tem ao menos um valor marcado (regra central deste módulo).
export function dimensaoAtiva(valores: string[]): boolean {
  return valores.length > 0;
}

// ---------- Resultado ----------

// Mesma espécie de lib/actions/relatorioPersonalizado.ts:ItemNormalizado — reexportada aqui
// (contrato compartilhado com a tela) para SelecaoItensRelatorioModal recalcular os cards de
// indicador ao vivo, sem duplicar a contagem por bloco que já existe em gerarRelatorio.
export type Especie = "PECA" | "COMPROMISSO" | "PROCESSO" | "ATENDIMENTO" | "DEMANDA" | "PUBLICACAO";

export type LinhaDetalhe = {
  id: string;
  especie: Especie;
  audiencia?: boolean;
  nome: string;
  tipoLabel: string;
  // Link direto para o arquivo no armazenamento (Drive/OneDrive/Dropbox) — só existe para peça;
  // compromisso/atendimento/processo linkam para a própria tela do Lúmen (href).
  driveUrl?: string;
  href?: string;
  origemLabel?: string;
  assessoriaNome?: string;
  anexadoPor?: string;
  responsavel?: string;
  data: string; // ISO
};

export type LinhaAgregada = { chave: string; rotulo: string; pecas: number; compromissos: number; total: number; cor?: string };

export type BlocoContagem = { chave: Contagem | "PUBLICACOES" | "AUDIENCIAS"; rotulo: string; valor: number; anterior: number; detalhe?: string };

// Mesmo critério usado em gerarRelatorio (lib/actions/relatorioPersonalizado.ts) pra decidir
// quem entra em cada bloco de indicador — reaproveitado por SelecaoItensRelatorioModal pra
// recalcular os cards ao vivo conforme a seleção manual muda, sem duplicar a regra em dois
// lugares que podem divergir.
export function itemPertenceAoBloco(chave: BlocoContagem["chave"], item: { especie: Especie; audiencia?: boolean }): boolean {
  if (chave === "AUDIENCIAS") return Boolean(item.audiencia);
  if (chave === "PUBLICACOES") return item.especie === "PUBLICACAO";
  const porEspecie: Record<Contagem, Especie> = {
    PECAS: "PECA",
    COMPROMISSOS: "COMPROMISSO",
    PROCESSOS: "PROCESSO",
    ATENDIMENTOS: "ATENDIMENTO",
    DEMANDAS: "DEMANDA",
  };
  return item.especie === porEspecie[chave];
}

export type RelatorioResultado = {
  periodo: { de: string; ate: string; anteriorDe: string; anteriorAte: string };
  blocos: BlocoContagem[];
  porPessoa: LinhaAgregada[];
  porAssessoria: LinhaAgregada[];
  detalhes: LinhaDetalhe[];
  detalhesTotal: number;
  // Itens que casaram com o período/filtros mas não puderam entrar no corte por assessoria por
  // não terem vínculo nenhum (decisão nº 4 validada pelo dono do escritório: nunca esconder isso).
  semVinculoAssessoria: number;
};

export type OpcoesRelatorio = {
  assessorias: { id: string; nome: string }[];
  usuarios: { id: string; nome: string; cor: string }[];
  gruposPeca: string[];
};

// ---------- Modelos salvos ----------

export type ModeloSalvo = { id: string; nome: string; filtros: RelatorioFiltros; criadoEm: string };

// Um valor de filtro que não existe mais (assessoria excluída, usuário desativado, grupo de peça
// removido do catálogo do escritório). Alimenta o pop-up bloqueante de "Salvar modelo".
export type FiltroInexistente = { dimensao: string; valor: string };
