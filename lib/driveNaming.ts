// Fonte ÚNICA dos nomes de pasta do armazenamento. Módulo PURO de propósito (não importa Prisma
// nem nada de servidor): a tela de configuração é um componente de cliente e monta a prévia com a
// mesma `montarNomeacao` que o servidor usa para criar as pastas — o que só é possível se este
// arquivo puder ser carregado nos dois lados. Quem lê a configuração do banco é
// lib/driveNamingOffice.ts.
//
// Vale para os três provedores (Google Drive, OneDrive, Dropbox). Antes desta entrega cada módulo
// de armazenamento cravava as mesmas strings
// ("Lúmen - Processos" e companhia), o que engessava a marca da Lúmen dentro do Drive de todo
// escritório-cliente e ainda deixava a tela de relatório de pastas repetir os literais por conta
// própria, livre para divergir do que o sistema realmente cria.
//
// Agora cada escritório escolhe a pasta-mãe e o prefixo em Configurações → Geral, e TUDO —
// criação de pasta, migração e relatório — deriva daqui.
//
// COMPATIBILIDADE: os padrões abaixo reproduzem exatamente os nomes antigos, byte a byte. Um
// escritório que nunca mexer na configuração continua com a estrutura idêntica à de sempre, sem
// migração nenhuma (ver scripts/verificarNomesPadrao.ts, que trava isso).

export const PASTA_MAE_PADRAO = "Lúmen";
export const PREFIXO_PADRAO = "Lúmen - ";

export type RaizKey =
  | "anexos"
  | "modelos"
  | "gerados"
  | "assessoria"
  | "processos"
  | "atendimentos"
  | "casos"
  | "financeiroDespesas"
  | "financeiroReceitas";

// A parte do nome que descreve a FUNÇÃO da pasta. Não é configurável de propósito: é o que o
// sistema entende ("onde ficam os processos"), enquanto o prefixo é o que identifica o escritório.
export const RAIZ_SUFIXO: Record<RaizKey, string> = {
  anexos: "Anexos",
  modelos: "Modelos de Documento",
  gerados: "Documentos Gerados",
  assessoria: "Assessoria",
  processos: "Processos",
  atendimentos: "Atendimentos",
  casos: "Casos",
  financeiroDespesas: "Financeiro - Despesas",
  financeiroReceitas: "Financeiro - Receitas",
};

export const RAIZ_ROTULO: Record<RaizKey, string> = {
  anexos: "Anexos",
  modelos: "Modelos de documento",
  gerados: "Documentos gerados",
  assessoria: "Assessoria jurídica",
  processos: "Processos",
  atendimentos: "Atendimentos",
  casos: "Casos",
  financeiroDespesas: "Financeiro — despesas",
  financeiroReceitas: "Financeiro — receitas",
};

export type NomeacaoDrive = {
  pastaMae: string;
  prefixo: string;
  raizes: Record<RaizKey, string>;
  /** Todos os nomes de raiz, na ordem de RAIZ_SUFIXO — usado pela migração da pasta-mãe. */
  todasAsRaizes: string[];
};

// Caracteres que nenhum dos três provedores aceita em nome de pasta.
const PROIBIDOS = /[\\/:*?"<>|]/;

export function validarNomeacao(pastaMae: string, prefixo: string): string | null {
  if (!pastaMae.trim()) return "O nome da pasta-mãe não pode ficar em branco.";
  if (PROIBIDOS.test(pastaMae)) return 'O nome da pasta-mãe não pode conter \\ / : * ? " < > |';
  if (PROIBIDOS.test(prefixo)) return 'O prefixo não pode conter \\ / : * ? " < > |';
  if (pastaMae.length > 60) return "O nome da pasta-mãe ficou longo demais (máximo 60 caracteres).";
  if (prefixo.length > 60) return "O prefixo ficou longo demais (máximo 60 caracteres).";
  return null;
}

export function montarNomeacao(pastaMae?: string | null, prefixo?: string | null): NomeacaoDrive {
  // `prefixo` distingue "não configurado" (null/undefined → usa o padrão) de "configurado como
  // vazio" (string vazia → pastas sem prefixo nenhum, ex.: só "Processos"). Por isso o teste é
  // contra null/undefined, e não pela verdade do valor.
  const mae = pastaMae?.trim() || PASTA_MAE_PADRAO;
  const pre = prefixo === null || prefixo === undefined ? PREFIXO_PADRAO : prefixo;

  const raizes = Object.fromEntries(
    (Object.keys(RAIZ_SUFIXO) as RaizKey[]).map((k) => [k, `${pre}${RAIZ_SUFIXO[k]}`])
  ) as Record<RaizKey, string>;

  return { pastaMae: mae, prefixo: pre, raizes, todasAsRaizes: Object.values(raizes) };
}
