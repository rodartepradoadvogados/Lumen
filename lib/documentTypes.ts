import type { LucideIcon } from "lucide-react";
import {
  FileEdit,
  Gavel,
  Scale,
  Stamp,
  Signature,
  HandCoins,
  FileWarning,
  IdCard,
  Home,
  FileSignature,
  Briefcase,
  Mail,
  FileMinus,
  Receipt,
  Clock,
  CalendarClock,
  ClipboardList,
  PiggyBank,
  ShieldCheck,
  HardHat,
  Stethoscope,
  HeartPulse,
  CircleDollarSign,
  FileSpreadsheet,
  Landmark,
  Percent,
  Image as ImageIcon,
  FileCheck,
  FileText,
  ScrollText,
  Link2,
  FileSearch,
  BookOpen,
} from "lucide-react";

// Taxonomia única de tipos de documento, usada tanto pelos Anexos de Processo/Caso/Atendimento
// (Attachment.docType) quanto pelo catálogo de Documentos da Assessoria (AssessoriaDocumento.docType).
// Cada item tem um ícone próprio — antes disso todo anexo usava o mesmo ícone genérico.
export type DocumentType = { key: string; label: string; icon: LucideIcon };
export type DocumentTypeGroup = { group: string; types: DocumentType[] };

export const DOCUMENT_TYPE_GROUPS: DocumentTypeGroup[] = [
  {
    group: "Processual",
    types: [
      { key: "PETICAO", label: "Petição", icon: FileEdit },
      { key: "TITULO_EXECUTIVO_JUDICIAL", label: "Título Executivo Judicial", icon: Gavel },
      { key: "TITULO_EXECUTIVO_EXTRAJUDICIAL", label: "Título Executivo Extrajudicial", icon: Scale },
      { key: "ATA_NOTARIAL", label: "Ata Notarial", icon: Stamp },
    ],
  },
  {
    group: "Procuração e contratação",
    types: [
      { key: "PROCURACAO", label: "Procuração", icon: Signature },
      { key: "CONTRATO_HONORARIOS", label: "Contrato de Honorários", icon: HandCoins },
      { key: "DECLARACAO_HIPOSSUFICIENCIA", label: "Declaração de Hipossuficiência", icon: FileWarning },
    ],
  },
  {
    group: "Documentos pessoais e societários",
    types: [
      { key: "DOC_PESSOAL_PF_PJ", label: "CPF/RG/Contrato Social/CTPS/Passaporte/outro documento de PF ou PJ", icon: IdCard },
      { key: "COMPROVANTE_ENDERECO", label: "Comprovante de Endereço", icon: Home },
    ],
  },
  {
    group: "Contratos",
    types: [
      { key: "CONTRATO", label: "Contrato", icon: FileSignature },
      { key: "CONTRATO_TRABALHO", label: "Contrato de Trabalho", icon: Briefcase },
      { key: "CARTA_PREPOSICAO", label: "Carta de Preposição", icon: Mail },
    ],
  },
  {
    group: "Documentos trabalhistas",
    types: [
      { key: "TRCT", label: "TRCT/TQRCT", icon: FileMinus },
      { key: "FOLHA_PAGAMENTO", label: "Folha de Pagamento/Holerite", icon: Receipt },
      { key: "FOLHA_PONTO", label: "Folha de Ponto", icon: Clock },
      { key: "CARTAO_PONTO", label: "Cartões de Ponto", icon: CalendarClock },
      { key: "FICHA_REGISTRO", label: "Ficha de Registro", icon: ClipboardList },
      { key: "DOC_FGTS", label: "Documentos de FGTS", icon: PiggyBank },
      { key: "DOC_INSS", label: "Documentos de INSS", icon: ShieldCheck },
      { key: "DOC_SST", label: "Documentos de Saúde e Segurança do Trabalho (SST)", icon: HardHat },
    ],
  },
  {
    group: "Documentos médicos",
    types: [
      {
        key: "DOC_MEDICO",
        label: "Exame/Laudo/Receita Médica/Prontuário Médico/Pedido Médico/Risco Cirúrgico/outros documentos médicos",
        icon: Stethoscope,
      },
      { key: "ATESTADO_MEDICO", label: "Atestado Médico", icon: HeartPulse },
    ],
  },
  {
    group: "Financeiro e fiscal",
    types: [
      { key: "COMPROVANTE_PAGAMENTO", label: "Comprovante de Pagamento/Recibo", icon: CircleDollarSign },
      { key: "GUIA_PAGAMENTO", label: "Guia de Pagamento", icon: FileSpreadsheet },
      { key: "IMPOSTO_RENDA", label: "Imposto de Renda", icon: Landmark },
      { key: "DOC_IMPOSTOS", label: "Documentos referentes a Impostos/taxas/contribuições de melhoria", icon: Percent },
    ],
  },
  {
    group: "Outros",
    types: [
      { key: "PRINT", label: "Prints diversos", icon: ImageIcon },
      { key: "OUTRO_COMPROBATORIO", label: "Outro documento comprobatório do direito", icon: FileCheck },
      { key: "OUTRO", label: "Outros documentos", icon: FileText },
    ],
  },
];

export const DOCUMENT_TYPES: DocumentType[] = DOCUMENT_TYPE_GROUPS.flatMap((g) => g.types);

const DOCUMENT_TYPE_MAP: Record<string, DocumentType> = Object.fromEntries(DOCUMENT_TYPES.map((t) => [t.key, t]));

// Categorias antigas do catálogo de Assessoria (AssessoriaDocumento.docType, ver schema) que não
// têm mais opção equivalente nesta lista — mantidas só para exibir corretamente documentos já
// cadastrados antes desta taxonomia existir. Não aparecem como opção ao cadastrar um documento novo.
export const LEGACY_DOCUMENT_TYPES: DocumentType[] = [
  { key: "PARECER", label: "Parecer (categoria antiga)", icon: ScrollText },
  { key: "ACAO_VINCULADA", label: "Ação vinculada (categoria antiga)", icon: Link2 },
  { key: "LICITACAO", label: "Licitação (categoria antiga)", icon: FileSearch },
  { key: "REGIMENTO_INTERNO", label: "Regimento Interno (categoria antiga)", icon: BookOpen },
];

const LEGACY_MAP: Record<string, DocumentType> = Object.fromEntries(LEGACY_DOCUMENT_TYPES.map((t) => [t.key, t]));

export function getDocumentType(key: string): DocumentType {
  return DOCUMENT_TYPE_MAP[key] || LEGACY_MAP[key] || DOCUMENT_TYPE_MAP.OUTRO;
}

export function getDocumentTypeLabel(key: string): string {
  return getDocumentType(key).label;
}

export function getDocumentTypeIcon(key: string): LucideIcon {
  return getDocumentType(key).icon;
}

// Detecta a origem do link colado (Drive, Dropbox, OneDrive...) só para exibir uma etiqueta —
// não interfere no armazenamento, o link em si pode ser de qualquer serviço que gere um link.
export function getLinkSourceLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("drive.google.com") || host.includes("docs.google.com")) return "Google Drive";
    if (host.includes("dropbox.com")) return "Dropbox";
    if (host.includes("onedrive.live.com") || host.includes("1drv.ms") || host.includes("sharepoint.com")) return "OneDrive";
    return host || "Link";
  } catch {
    return "Link";
  }
}
