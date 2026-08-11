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
  Barcode,
  Users,
  Shield,
  FileStack,
  Ban,
  Undo2,
  FileQuestion,
  UserX,
  BellRing,
  BadgeCheck,
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
      { key: "PROCESSO_COMPLETO", label: "Processo Completo", icon: FileStack },
      { key: "PETICAO", label: "Petição", icon: FileEdit },
      { key: "PETICAO_INICIAL", label: "Petição Inicial", icon: FileEdit },
      { key: "CARTA_CITACAO", label: "Carta de Citação", icon: Mail },
      { key: "CONTESTACAO", label: "Contestação", icon: Scale },
      { key: "REPLICA", label: "Réplica", icon: FileEdit },
      { key: "EMENDA_INICIAL", label: "Emenda à Inicial", icon: FileEdit },
      { key: "PETICAO_INTERLOCUTORIA", label: "Petição Interlocutória", icon: FileEdit },
      { key: "PROVAS_A_PRODUZIR", label: "Provas a Produzir", icon: FileSearch },
      { key: "TITULO_EXECUTIVO_JUDICIAL", label: "Título Executivo Judicial", icon: Gavel },
      { key: "TITULO_EXECUTIVO_EXTRAJUDICIAL", label: "Título Executivo Extrajudicial", icon: Scale },
      { key: "ATA_NOTARIAL", label: "Ata Notarial", icon: Stamp },
      { key: "EXCECAO_PRE_EXECUTIVIDADE", label: "Exceção de Pré-Executividade", icon: Ban },
      { key: "PEDIDO_RECONSIDERACAO", label: "Pedido de Reconsideração", icon: Undo2 },
      { key: "IMPUGNACAO_EDITAL", label: "Impugnação ao Edital", icon: FileQuestion },
      { key: "IMPUGNACAO_LAUDO_PERICIAL", label: "Impugnação ao Laudo Pericial", icon: FileQuestion },
      { key: "LAUDO_PERICIAL", label: "Laudo Pericial", icon: FileSearch },
      { key: "CERTIDAO", label: "Certidão", icon: Stamp },
      // Comprovante devolvido pelo sistema do tribunal/órgão ao protocolar. É o ÚNICO arquivo
      // novo que um protocolo cria (ver lib/protocolos.ts) — todo o resto do protocolo são
      // referências a documentos que já existiam. Como qualquer tipo, ganha sua própria subpasta
      // no Drive com este mesmo rótulo.
      { key: "COMPROVANTE_PROTOCOLO", label: "Comprovante de Protocolo", icon: BadgeCheck },
      { key: "PARECER", label: "Parecer", icon: ScrollText },
      { key: "REQUERIMENTO_CLIENTE", label: "Requerimento ao Cliente", icon: Mail },
      { key: "NOTIFICACAO_EXTRAJUDICIAL", label: "Notificação Extrajudicial", icon: FileWarning },
      { key: "NOTIFICACAO", label: "Notificação", icon: BellRing },
      { key: "TERMO_DECLARACAO", label: "Termo de Declaração", icon: FileSignature },
    ],
  },
  {
    group: "Decisões Judiciais",
    types: [
      { key: "SENTENCA", label: "Sentença", icon: Gavel },
      { key: "ACORDAO", label: "Acórdão", icon: ScrollText },
      { key: "DESPACHO", label: "Despacho", icon: FileEdit },
      { key: "INTIMACAO", label: "Intimação", icon: BellRing },
      { key: "OUTRA_DECISAO", label: "Outra Decisão", icon: FileQuestion },
    ],
  },
  {
    group: "Recursos",
    types: [
      { key: "APELACAO", label: "Apelação", icon: Gavel },
      { key: "CONTRARRAZOES", label: "Contrarrazões/Contraminuta", icon: ScrollText },
      { key: "EMBARGOS_DECLARACAO", label: "Embargos de Declaração", icon: ScrollText },
      { key: "EMBARGOS_INFRINGENTES", label: "Embargos Infringentes", icon: ScrollText },
      { key: "AGRAVO_INSTRUMENTO", label: "Agravo de Instrumento", icon: Gavel },
      { key: "AGRAVO_PETICAO", label: "Agravo de Petição", icon: Gavel },
      { key: "AGRAVO_REGIMENTAL", label: "Agravo Regimental", icon: Gavel },
      { key: "AGRAVO_INTERNO", label: "Agravo Interno", icon: Gavel },
      { key: "RECURSO_ESPECIAL", label: "Recurso Especial", icon: Landmark },
      { key: "AGRAVO_EM_RESP", label: "Agravo em Recurso Especial (REsp)", icon: Gavel },
      { key: "RECURSO_EXTRAORDINARIO", label: "Recurso Extraordinário", icon: Landmark },
      { key: "AGRAVO_EM_RE", label: "Agravo em Recurso Extraordinário (RE)", icon: Gavel },
      { key: "RECURSO_ADMINISTRATIVO", label: "Recurso Administrativo", icon: FileStack },
      { key: "RECURSO_VOLUNTARIO", label: "Recurso Voluntário", icon: FileStack },
    ],
  },
  {
    group: "Ações constitucionais",
    types: [
      { key: "MANDADO_SEGURANCA", label: "Mandado de Segurança", icon: Shield },
      { key: "HABEAS_CORPUS", label: "Habeas Corpus", icon: Shield },
      { key: "HABEAS_DATA", label: "Habeas Data", icon: Shield },
      { key: "MANDADO_INJUNCAO", label: "Mandado de Injunção", icon: Shield },
    ],
  },
  {
    group: "Procuração e contratação",
    types: [
      { key: "PROCURACAO", label: "Procuração", icon: Signature },
      { key: "SUBSTABELECIMENTO_COM_RESERVA", label: "Substabelecimento com Reserva", icon: Signature },
      { key: "SUBSTABELECIMENTO_SEM_RESERVA", label: "Substabelecimento sem Reserva", icon: Users },
      { key: "RENUNCIA_MANDATO", label: "Renúncia ao Mandato", icon: UserX },
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
      { key: "NOTA_FISCAL", label: "Nota Fiscal", icon: Receipt },
      { key: "BOLETO", label: "Boleto", icon: Barcode },
      { key: "PLANILHA", label: "Planilhas", icon: FileSpreadsheet },
      { key: "DEBITO_ATUALIZADO", label: "Débito Atualizado", icon: CircleDollarSign },
      { key: "EXTRATO", label: "Extrato", icon: FileSpreadsheet },
    ],
  },
  {
    group: "Outros",
    types: [
      { key: "RELATORIO", label: "Relatório", icon: ClipboardList },
      { key: "PRINT", label: "Prints diversos", icon: ImageIcon },
      { key: "OUTRO_COMPROBATORIO", label: "Outro documento comprobatório do direito", icon: FileCheck },
      { key: "OUTRO", label: "Outros documentos", icon: FileText },
    ],
  },
];

export const DOCUMENT_TYPES: DocumentType[] = DOCUMENT_TYPE_GROUPS.flatMap((g) => g.types);

const DOCUMENT_TYPE_MAP: Record<string, DocumentType> = Object.fromEntries(DOCUMENT_TYPES.map((t) => [t.key, t]));

// ============ TIPOS CRIADOS PELO ESCRITÓRIO (ver model OfficeDocumentType, prisma/schema.prisma) ============
//
// O catálogo acima é fixo no código. Além dele, cada escritório pode cadastrar os próprios tipos
// (botão "+ Novo tipo" em DocumentTypeSelect, ação em lib/actions/documentTypes.ts) — este arquivo
// continua sem importar Prisma (é lido por componentes client, como DocumentTypeSelect), então a
// composição com os tipos do escritório é feita aqui só como FUNÇÃO PURA: quem tem os dados (a
// action ou o server component que a chamou) passa a lista, este arquivo só sabe combinar.
export type OfficeDocumentTypeEntry = { chave: string; rotulo: string; secao: string };

// Ícone genérico para todo tipo criado pelo escritório — Tag, para diferenciar visualmente (no
// seletor) de um tipo nativo, que sempre tem ícone próprio escolhido a dedo.
const OFFICE_TYPE_ICON: LucideIcon = FileText;

// Compõe DOCUMENT_TYPE_GROUPS (nativo) com os tipos do escritório, um por um, dentro do grupo cuja
// `secao` bate com o nome do grupo (OfficeDocumentType.secao é sempre um `group` já existente aqui,
// ver createOfficeDocumentType). Uma `secao` órfã (não deveria acontecer, mas o dado vem de fora)
// cai em "Outros" em vez de sumir. Nunca muta DOCUMENT_TYPE_GROUPS — devolve um array novo.
export function composeDocumentTypeGroups(officeTypes: OfficeDocumentTypeEntry[]): DocumentTypeGroup[] {
  if (officeTypes.length === 0) return DOCUMENT_TYPE_GROUPS;

  const bySecao = new Map<string, DocumentType[]>();
  for (const t of officeTypes) {
    const list = bySecao.get(t.secao) || [];
    list.push({ key: t.chave, label: t.rotulo, icon: OFFICE_TYPE_ICON });
    bySecao.set(t.secao, list);
  }

  const groups = DOCUMENT_TYPE_GROUPS.map((g) => {
    const extra = bySecao.get(g.group);
    if (!extra) return g;
    bySecao.delete(g.group);
    return { group: g.group, types: [...g.types, ...extra] };
  });

  // Sobrou alguma `secao` que não bate com nenhum grupo conhecido — não deveria acontecer (a
  // seção é escolhida a partir da mesma lista no formulário de criação), mas não descarta o tipo:
  // cai no grupo "Outros" (criando-o, se por algum motivo nem ele existir).
  const leftover = Array.from(bySecao.values()).flat();
  if (leftover.length === 0) return groups;
  const outrosIdx = groups.findIndex((g) => g.group === "Outros");
  if (outrosIdx === -1) return [...groups, { group: "Outros", types: leftover }];
  const next = [...groups];
  next[outrosIdx] = { group: next[outrosIdx].group, types: [...next[outrosIdx].types, ...leftover] };
  return next;
}

// Deriva a `chave` de um novo tipo a partir do rótulo digitado: maiúsculas, sem acento, espaços
// (e qualquer sequência de caracteres que não seja letra/número) viram um único "_", sem "_" nas
// pontas. Ex.: "Print de conversa" -> "PRINT_DE_CONVERSA". Mesmo formato dos tipos nativos (ver
// topo do arquivo), então getDocumentType/isRecursoQueEscalaInstancia/etc. tratam os dois iguais.
export function deriveDocumentTypeChave(rotulo: string): string {
  return rotulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Palavras que, ao reconstituir um rótulo a partir da chave (ver humanizeDocTypeKey abaixo), ficam
// em minúsculas — só cosmético, para "PRINT_DE_CONVERSA" virar "Print de conversa" em vez de
// "Print De Conversa". Não é usado para os tipos nativos nem para os do escritório na sessão em
// que foram criados (esses sempre têm o rótulo exato, ver DocumentTypeSelect) — só entra como
// último recurso, quando uma tela só tem a chave em mãos (ex.: getDocumentTypeLabel chamado sem o
// catálogo do escritório carregado).
const CONECTIVOS_MINUSCULOS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "com", "a", "o"]);

function humanizeDocTypeKey(key: string): string {
  return key
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word, i) => (i > 0 && CONECTIVOS_MINUSCULOS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

// Categorias antigas do catálogo de Assessoria (AssessoriaDocumento.docType, ver schema) que não
// têm mais opção equivalente nesta lista — mantidas só para exibir corretamente documentos já
// cadastrados antes desta taxonomia existir. Não aparecem como opção ao cadastrar um documento novo.
export const LEGACY_DOCUMENT_TYPES: DocumentType[] = [
  { key: "ACAO_VINCULADA", label: "Ação vinculada (categoria antiga)", icon: Link2 },
  { key: "LICITACAO", label: "Licitação (categoria antiga)", icon: FileSearch },
  { key: "REGIMENTO_INTERNO", label: "Regimento Interno (categoria antiga)", icon: BookOpen },
];

const LEGACY_MAP: Record<string, DocumentType> = Object.fromEntries(LEGACY_DOCUMENT_TYPES.map((t) => [t.key, t]));

// Resolve um docType para {label, icon}. Cobre, nesta ordem: catálogo nativo, catálogo legado, e
// só então um tipo criado pelo escritório (ver OfficeDocumentTypeEntry acima) — quando a tela que
// chamou já carregou esse catálogo (officeTypes) e passa aqui. Sem isso (a maioria das telas hoje,
// que só têm a chave em mãos), cai num rótulo reconstituído a partir da própria chave em vez de
// "Outros documentos": como a chave É derivada do rótulo (deriveDocumentTypeChave), o resultado
// normalmente bate ou chega muito perto do nome original digitado ao criar o tipo.
export function getDocumentType(key: string, officeTypes?: OfficeDocumentTypeEntry[]): DocumentType {
  const native = DOCUMENT_TYPE_MAP[key] || LEGACY_MAP[key];
  if (native) return native;
  const fromOffice = officeTypes?.find((t) => t.chave === key);
  if (fromOffice) return { key: fromOffice.chave, label: fromOffice.rotulo, icon: OFFICE_TYPE_ICON };
  if (key && key !== "OUTRO" && key !== "TODOS") return { key, label: humanizeDocTypeKey(key), icon: OFFICE_TYPE_ICON };
  return DOCUMENT_TYPE_MAP.OUTRO;
}

export function getDocumentTypeLabel(key: string, officeTypes?: OfficeDocumentTypeEntry[]): string {
  return getDocumentType(key, officeTypes).label;
}

export function getDocumentTypeIcon(key: string, officeTypes?: OfficeDocumentTypeEntry[]): LucideIcon {
  return getDocumentType(key, officeTypes).icon;
}

// Tipos do grupo "Recursos" que NÃO fazem o processo subir de instância — ficam no mesmo juízo
// (Embargos de Declaração é sempre julgado por quem proferiu a decisão) ou, no caso de
// Contrarrazões/Contraminuta, são resposta ao recurso do OUTRO lado, não iniciativa nossa; Embargos
// Infringentes normalmente são julgados pelo mesmo tribunal, só muda a composição do colegiado.
// Pedido de Reconsideração já não está no grupo "Recursos" (fica em "Processual"), por isso nem
// precisa entrar aqui. Ver proposta aprovada em 2026-08-07, pop-up "vincular a tribunal superior"
// ao anexar um recurso (components/processo/RecursoEscalaPrompt.tsx).
const RECURSOS_QUE_NAO_ESCALAM = new Set(["EMBARGOS_DECLARACAO", "EMBARGOS_INFRINGENTES", "CONTRARRAZOES"]);

// true quando o tipo de documento anexado é um recurso que tipicamente faz o processo subir de
// instância — dispara o pop-up "vincular a um tribunal superior?" (ver F em AttachmentList.tsx).
export function isRecursoQueEscalaInstancia(docTypeKey: string): boolean {
  const grupo = DOCUMENT_TYPE_GROUPS.find((g) => g.group === "Recursos");
  if (!grupo) return false;
  if (!grupo.types.some((t) => t.key === docTypeKey)) return false;
  return !RECURSOS_QUE_NAO_ESCALAM.has(docTypeKey);
}

// Detecta a origem do link colado (Drive, Dropbox, OneDrive...) só para exibir uma etiqueta —
// não interfere no armazenamento, o link em si pode ser de qualquer serviço que gere um link.
export function getLinkSourceLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("drive.google.com") || host.includes("docs.google.com")) return "Drive";
    if (host.includes("dropbox.com")) return "Dropbox";
    if (host.includes("onedrive.live.com") || host.includes("1drv.ms") || host.includes("sharepoint.com")) return "OneDrive";
    return host || "Link";
  } catch {
    return "Link";
  }
}
