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
