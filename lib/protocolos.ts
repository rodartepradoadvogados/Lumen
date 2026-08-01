// Domínio dos Protocolos do Processo (aba Protocolos) — ver models ProtocoloLote e
// ProtocoloLoteItem em prisma/schema.prisma.
//
// A regra que sustenta tudo: um protocolo é uma LISTA ORDENADA DE REFERÊNCIAS a documentos que
// já existem, nunca uma cópia deles. No banco isso é ProtocoloLoteItem.attachmentId; no Drive é
// um atalho (shortcut) dentro da pasta do lote. O arquivo em si continua existindo uma única vez,
// na subpasta do tipo dele — é isso que impede duplicar documento e misturar as pastas.
//
// Este arquivo concentra a "rotina padrão" (nomes, ordem, ciclo de vida) para que a criação da
// pasta, a listagem na tela e o sync do Drive falem exatamente a mesma língua.

export type ProtocoloStatus = "EM_PREPARO" | "PRONTO" | "PROTOCOLADO" | "CANCELADO";

export const PROTOCOLO_STATUS: ProtocoloStatus[] = ["EM_PREPARO", "PRONTO", "PROTOCOLADO", "CANCELADO"];

export const PROTOCOLO_STATUS_LABELS: Record<ProtocoloStatus, string> = {
  EM_PREPARO: "Em preparo",
  PRONTO: "Pronto",
  PROTOCOLADO: "Protocolado",
  CANCELADO: "Cancelado",
};

// Um lote PROTOCOLADO é registro histórico: não se edita a lista de documentos dele, e excluir um
// anexo que faz parte dele exige confirmação extra (ver deleteAttachment em lib/actions/attachments.ts).
export function isProtocoloConcluido(status: string): boolean {
  return status === "PROTOCOLADO";
}

export function isProtocoloEditavel(status: string): boolean {
  return status === "EM_PREPARO" || status === "PRONTO";
}

// ---------------------------------------------------------------------------
// Rotina padrão de nomes no Drive
// ---------------------------------------------------------------------------

// Pasta de sistema dentro da pasta de cada processo, que agrupa as pastas de cada protocolo.
// NÃO é um tipo de documento — nada é anexado diretamente nela pelo site, e o sync reverso do
// Drive precisa ignorá-la em vez de reclamar que não reconhece a categoria (ver lib/driveSync.ts,
// isReservedCaseSubfolder logo abaixo).
export const PROTOCOLOS_FOLDER_NAME = "Protocolos";

// Subpastas dentro da pasta de um processo que são estrutura do sistema, e não uma categoria de
// tipo de documento. O sync reverso pula estas sem gerar PASTA_CATEGORIA_DESCONHECIDA e sem
// tentar registrar o conteúdo como anexo novo — o que aqui dentro existe são atalhos, e
// registrá-los criaria exatamente a duplicação que a funcionalidade inteira evita.
const RESERVED_CASE_SUBFOLDERS = new Set<string>([PROTOCOLOS_FOLDER_NAME]);

export function isReservedCaseSubfolder(folderName: string): boolean {
  return RESERVED_CASE_SUBFOLDERS.has(folderName.trim());
}

// Nome da pasta de UM protocolo: data primeiro, para a listagem do Drive já sair em ordem
// cronológica sozinha. Ex.: "2026-07-31 — Petição Inicial + documentos".
export function formatLoteFolderName(criadoEm: Date, titulo: string): string {
  const dia = ymdUtc(criadoEm);
  return `${dia} — ${sanitizeDriveName(titulo)}`;
}

// Ao concluir, o número do protocolo entra no fim do nome da pasta — ela deixa de ser área de
// trabalho e vira registro. Ex.: "2026-07-31 — Petição Inicial [nº 20260731-993217]".
export function formatLoteFolderNameProtocolado(criadoEm: Date, titulo: string, numeroProtocolo: string): string {
  const base = formatLoteFolderName(criadoEm, titulo);
  const numero = sanitizeDriveName(numeroProtocolo);
  return numero ? `${base} [nº ${numero}]` : base;
}

// Nome do atalho dentro da pasta do lote: prefixo de dois dígitos com a ordem de envio, para a
// pasta abrir já na sequência em que os arquivos serão subidos no sistema do tribunal.
// Ex.: ordem 1 -> "01 - Petição Inicial.pdf".
export function formatShortcutName(ordem: number, nomeDocumento: string): string {
  const prefixo = String(Math.max(1, Math.trunc(ordem))).padStart(2, "0");
  return `${prefixo} - ${sanitizeDriveName(nomeDocumento)}`;
}

// Data-calendário em UTC. As datas aqui são "o dia", não um instante — mesma convenção de
// Task.dueDate (ver formatCalendarDate em components/ui.tsx): ler com os getters locais faria o
// nome da pasta cair um dia antes em Brasília (UTC-3).
function ymdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// O Drive aceita quase tudo em nome de arquivo, mas "/" costuma confundir quem lê o caminho e
// quebra a leitura da árvore em qualquer ferramenta que trate o nome como path. Também colapsa
// espaços e corta o comprimento, para o prefixo de ordem nunca ficar espremido num nome enorme.
function sanitizeDriveName(raw: string): string {
  return raw
    .replace(/[/\\]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

// ---------------------------------------------------------------------------
// Procuração — pré-requisito para marcar um lote como PRONTO/PROTOCOLADO
// ---------------------------------------------------------------------------

// Tipo de documento (ver lib/documentTypes.ts) que representa a procuração do processo. Extraído
// para uma constante porque é comparado em mais de um lugar (marcarProtocoloPronto e
// registrarProtocolo, em lib/actions/protocolos.ts) e porque a mensagem de erro precisa citar o
// mesmo nome que aparece na tela de Anexos.
export const DOC_TYPE_PROCURACAO = "PROCURACAO";

// Sem procuração anexada ao processo, protocolar é sério o bastante para BLOQUEAR (não é o padrão
// "avisar e deixar passar" do resto da aba): é a peça que credencia o escritório a atuar naquele
// processo perante o tribunal/órgão, e enviar sem ela pode gerar intimação de irregularidade de
// representação. Mesmo assim o texto do erro é sempre "anexe a procuração e tente de novo" — a
// trava nunca é permanente, só falta o documento.
export function procuracaoFaltandoErro(): string {
  return "Este processo ainda não tem uma Procuração anexada (aba Anexos). Anexe-a antes de marcar o protocolo como pronto ou registrá-lo — é o documento que credencia o escritório a atuar no processo.";
}

// ---------------------------------------------------------------------------
// Sugestão de documentos ao montar um lote novo
// ---------------------------------------------------------------------------
//
// Heurística deliberadamente simples (dois sinais, sem aprendizado nenhum):
//
// 1. "Kit de partida" quando o processo ainda não tem protocolo nenhum: um primeiro protocolo
//    quase sempre carrega a peça inicial + os documentos de habilitação (procuração, contrato de
//    honorários, documento pessoal, hipossuficiência) — DEFAULT_KICKOFF_DOC_TYPES abaixo.
// 2. Quando já existe histórico: repete os tipos de documento que mais aparecem nos protocolos
//    anteriores DESTE processo (ex.: se todo protocolo até agora levou uma Petição + o
//    comprovante de endereço, um tipo de documento que se repete é provavelmente parte da rotina
//    deste caso específico) — sempre excluindo documentos que JÁ entraram em algum protocolo
//    (preparo, pronto ou protocolado): reaproveitar o mesmo arquivo de novo é raro, sinal de erro
//    de seleção mais do que de sugestão útil.
//
// Puramente informativo: quem decide a lista final é sempre a pessoa montando o lote.

export const DEFAULT_KICKOFF_DOC_TYPES = [
  "PETICAO_INICIAL",
  DOC_TYPE_PROCURACAO,
  "CONTRATO_HONORARIOS",
  "DOC_PESSOAL_PF_PJ",
  "DECLARACAO_HIPOSSUFICIENCIA",
  "COMPROVANTE_ENDERECO",
];

// Quantos tipos de documento mais frequentes no histórico entram na sugestão — cauteloso de
// propósito (poucos tipos, bem repetidos) para não acabar sugerindo "tudo" num processo com
// poucos protocolos anteriores e pouca variedade de tipo.
const HISTORICO_TOP_N_TIPOS = 5;

export type SugestaoDocumentoInput = { id: string; docType: string };

export type SugestaoDocumentos = {
  attachmentIds: string[];
  motivo: string;
};

// Função pura (sem Prisma), para poder testar a heurística isolada da leitura do banco — quem lê
// os dados (anexos do processo, tipos já usados em algum lote, docType mais frequente no
// histórico de lotes) é sugerirDocumentosProtocolo em lib/actions/protocolos.ts.
//
// - attachments: todos os anexos do processo (candidatos).
// - attachmentIdsJaUsados: ids de anexo que já entraram em QUALQUER lote deste processo (em
//   qualquer status) — nunca sugeridos de novo.
// - docTypesHistorico: docTypeSnapshot de cada item de cada lote já criado neste processo, na
//   ordem em que foram usados — vazio quando é o primeiro protocolo do processo.
export function sugerirDocumentos(
  attachments: SugestaoDocumentoInput[],
  attachmentIdsJaUsados: string[],
  docTypesHistorico: string[]
): SugestaoDocumentos {
  const usados = new Set(attachmentIdsJaUsados);
  const candidatos = attachments.filter((a) => !usados.has(a.id));

  if (docTypesHistorico.length === 0) {
    const tipos = new Set(DEFAULT_KICKOFF_DOC_TYPES);
    return {
      attachmentIds: candidatos.filter((a) => tipos.has(a.docType)).map((a) => a.id),
      motivo: "Kit de partida para o primeiro protocolo deste processo (peça inicial + documentos de habilitação).",
    };
  }

  const frequencia = new Map<string, number>();
  for (const docType of docTypesHistorico) frequencia.set(docType, (frequencia.get(docType) ?? 0) + 1);
  const topTipos = new Set(
    [...frequencia.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, HISTORICO_TOP_N_TIPOS)
      .map(([docType]) => docType)
  );

  return {
    attachmentIds: candidatos.filter((a) => topTipos.has(a.docType)).map((a) => a.id),
    motivo: "Tipos de documento mais frequentes nos protocolos anteriores deste processo, ainda não usados em nenhum lote.",
  };
}
