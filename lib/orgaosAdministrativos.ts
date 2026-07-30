// Catálogo de órgãos administrativos — mesmo espírito de lib/tribunaisCatalog.ts (dado de
// referência estático, sem officeId, compartilhado por todos os escritórios), mas para o outro
// ramo da taxonomia: processo que tramita em órgão administrativo (tribunal de contas,
// contencioso tributário, licitação, processo eletrônico), não no Poder Judiciário.
//
// esferaPadrao/materiaPadrao pré-preenchem Case.adminEsfera/Case.adminMateria quando o usuário
// escolhe o órgão no cadastro (ver OrgaoAdministrativoPicker.tsx) — continuam livremente
// editáveis depois, mesma lógica de "seleciona e desgruda do catálogo" que TribunalFields já usa
// para tribunalSigla/tribunalNome/tribunalSistema/tribunalLink.

export type OrgaoAdministrativoCatalogEntry = {
  sigla: string;
  nome: string;
  categoria: string;
  sistemas: string;
  portalUrl: string;
  esferaPadrao: string; // FEDERAL | ESTADUAL | MUNICIPAL
  materiaPadrao: string; // ver MATERIAS_ADMIN em lib/caseNatureza.ts
};

export const CATEGORIA_ORDER_ADMIN = [
  "Tribunais de Contas",
  "Contencioso Tributário",
  "Licitações e Contratos",
  "Processo Eletrônico",
];

export const ORGAOS_ADMINISTRATIVOS: OrgaoAdministrativoCatalogEntry[] = [
  // ---- Tribunais de Contas ----
  {
    sigla: "TCU",
    nome: "Tribunal de Contas da União",
    categoria: "Tribunais de Contas",
    sistemas: "e-TCU / Conecta-TCU",
    portalUrl: "https://portal.tcu.gov.br",
    esferaPadrao: "FEDERAL",
    materiaPadrao: "CONTAS",
  },
  {
    sigla: "TCE-GO",
    nome: "Tribunal de Contas do Estado de Goiás",
    categoria: "Tribunais de Contas",
    sistemas: "e-TCE",
    portalUrl: "https://portal.tce.go.gov.br",
    esferaPadrao: "ESTADUAL",
    materiaPadrao: "CONTAS",
  },
  {
    sigla: "TCM-GO",
    nome: "Tribunal de Contas dos Municípios do Estado de Goiás",
    categoria: "Tribunais de Contas",
    sistemas: "Portal TCM-GO",
    portalUrl: "https://www.tcm.go.gov.br",
    esferaPadrao: "ESTADUAL",
    materiaPadrao: "CONTAS",
  },
  {
    sigla: "TCM-SP",
    nome: "Tribunal de Contas do Município de São Paulo",
    categoria: "Tribunais de Contas",
    sistemas: "Portal TCM-SP",
    portalUrl: "https://www.tcm.sp.gov.br",
    esferaPadrao: "MUNICIPAL",
    materiaPadrao: "CONTAS",
  },
  {
    sigla: "TCM-RJ",
    nome: "Tribunal de Contas do Município do Rio de Janeiro",
    categoria: "Tribunais de Contas",
    sistemas: "Portal TCM-RJ",
    portalUrl: "https://www.tcm.rj.gov.br",
    esferaPadrao: "MUNICIPAL",
    materiaPadrao: "CONTAS",
  },

  // ---- Contencioso Tributário ----
  {
    sigla: "CARF",
    nome: "Conselho Administrativo de Recursos Fiscais",
    categoria: "Contencioso Tributário",
    sistemas: "e-Processo",
    portalUrl: "https://carf.fazenda.gov.br",
    esferaPadrao: "FEDERAL",
    materiaPadrao: "TRIBUTARIO",
  },
  {
    sigla: "RFB",
    nome: "Receita Federal do Brasil — Delegacia de Julgamento",
    categoria: "Contencioso Tributário",
    sistemas: "e-CAC",
    portalUrl: "https://cav.receita.fazenda.gov.br",
    esferaPadrao: "FEDERAL",
    materiaPadrao: "TRIBUTARIO",
  },
  {
    sigla: "CAT-GO",
    nome: "Conselho Administrativo Tributário de Goiás",
    categoria: "Contencioso Tributário",
    sistemas: "PAT-e",
    portalUrl: "https://www.sefaz.go.gov.br/cat",
    esferaPadrao: "ESTADUAL",
    materiaPadrao: "TRIBUTARIO",
  },
  {
    sigla: "CTF-GYN",
    nome: "Conselho Tributário Fiscal de Goiânia",
    categoria: "Contencioso Tributário",
    sistemas: "Portal CTF",
    portalUrl: "https://www.goiania.go.gov.br/sefaz",
    esferaPadrao: "MUNICIPAL",
    materiaPadrao: "TRIBUTARIO",
  },

  // ---- Licitações e Contratos ----
  {
    sigla: "PNCP",
    nome: "Portal Nacional de Contratações Públicas",
    categoria: "Licitações e Contratos",
    sistemas: "PNCP",
    portalUrl: "https://pncp.gov.br",
    esferaPadrao: "FEDERAL",
    materiaPadrao: "LICITACAO",
  },
  {
    sigla: "COMPRAS-GOV",
    nome: "Compras.gov.br",
    categoria: "Licitações e Contratos",
    sistemas: "SIASG",
    portalUrl: "https://compras.gov.br",
    esferaPadrao: "FEDERAL",
    materiaPadrao: "LICITACAO",
  },

  // ---- Processo Eletrônico ----
  {
    sigla: "SEI-GO",
    nome: "SEI Goiás",
    categoria: "Processo Eletrônico",
    sistemas: "SEI",
    portalUrl: "https://sei.goias.gov.br",
    esferaPadrao: "ESTADUAL",
    materiaPadrao: "OUTRO",
  },
  {
    sigla: "SEI-FED",
    nome: "SEI Governo Federal",
    categoria: "Processo Eletrônico",
    sistemas: "SEI",
    portalUrl: "https://sei.gov.br",
    esferaPadrao: "FEDERAL",
    materiaPadrao: "OUTRO",
  },
];

export function findOrgaoBySigla(sigla: string): OrgaoAdministrativoCatalogEntry | undefined {
  return ORGAOS_ADMINISTRATIVOS.find((o) => o.sigla === sigla);
}
