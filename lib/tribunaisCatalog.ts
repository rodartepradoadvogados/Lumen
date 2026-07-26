// Catálogo de tribunais brasileiros — sigla, nome, sistema(s) processual(is) e link de acesso.
// Fonte: lista fornecida pelo usuário em 26/07/2026 (CNJ, TRF4 e portais oficiais). Dado de
// referência global, compartilhado por todos os escritórios — não pertence a nenhum Office.
//
// portalUrl aponta sempre para o SISTEMA processual (onde se loga para ver o processo), não
// para o site institucional do tribunal, exceto nos poucos órgãos sem sistema próprio (CJF,
// CNMP), onde só existe o site institucional mesmo.

export type TribunalCatalogEntry = {
  sigla: string;
  nome: string;
  categoria: string;
  sistemas: string;
  portalUrl: string;
  ordem: number;
};

export const CATEGORIA_ORDER = [
  "Tribunais Superiores",
  "Justiça Estadual",
  "Justiça Federal",
  "Justiça do Trabalho",
  "Justiça Eleitoral",
  "Justiça Militar",
  "Órgãos de Apoio e Plataformas",
];

export const TRIBUNAIS_CATALOG: TribunalCatalogEntry[] = [
  // ---- Tribunais Superiores ----
  { sigla: "STF", nome: "Supremo Tribunal Federal", categoria: "Tribunais Superiores", sistemas: "STF Digital — peticionamento em peticionamento.stf.jus.br", portalUrl: "https://portal.stf.jus.br", ordem: 1 },
  { sigla: "STJ", nome: "Superior Tribunal de Justiça", categoria: "Tribunais Superiores", sistemas: "eproc", portalUrl: "https://eproc.stj.jus.br", ordem: 2 },
  { sigla: "TST", nome: "Tribunal Superior do Trabalho", categoria: "Tribunais Superiores", sistemas: "PJe", portalUrl: "https://pje.tst.jus.br", ordem: 3 },
  { sigla: "TSE", nome: "Tribunal Superior Eleitoral", categoria: "Tribunais Superiores", sistemas: "PJe", portalUrl: "https://pje.tse.jus.br", ordem: 4 },
  { sigla: "STM", nome: "Superior Tribunal Militar", categoria: "Tribunais Superiores", sistemas: "eproc", portalUrl: "https://eproc.stm.jus.br", ordem: 5 },

  // ---- Justiça Comum Estadual (27 TJs) ----
  { sigla: "TJAC", nome: "Tribunal de Justiça do Acre", categoria: "Justiça Estadual", sistemas: "eproc (em migração do PJe/SAJ)", portalUrl: "https://www.tjac.jus.br", ordem: 1 },
  { sigla: "TJAL", nome: "Tribunal de Justiça de Alagoas", categoria: "Justiça Estadual", sistemas: "e-SAJ (+ PJe; adesão ao eproc)", portalUrl: "https://esaj.tjal.jus.br", ordem: 2 },
  { sigla: "TJAP", nome: "Tribunal de Justiça do Amapá", categoria: "Justiça Estadual", sistemas: "Tucujuris (+ PJe)", portalUrl: "https://tucujuris.tjap.jus.br", ordem: 3 },
  { sigla: "TJAM", nome: "Tribunal de Justiça do Amazonas", categoria: "Justiça Estadual", sistemas: "PJe (+ SAJ/Projudi legados)", portalUrl: "https://pje.tjam.jus.br", ordem: 4 },
  { sigla: "TJBA", nome: "Tribunal de Justiça da Bahia", categoria: "Justiça Estadual", sistemas: "PJe (1º grau) + e-SAJ (2º grau); adesão ao eproc em curso", portalUrl: "https://pje.tjba.jus.br", ordem: 5 },
  { sigla: "TJCE", nome: "Tribunal de Justiça do Ceará", categoria: "Justiça Estadual", sistemas: "PJe (migração do SAJ concluída no 2º grau)", portalUrl: "https://pje.tjce.jus.br", ordem: 6 },
  { sigla: "TJDFT", nome: "Tribunal de Justiça do Distrito Federal e dos Territórios", categoria: "Justiça Estadual", sistemas: "PJe", portalUrl: "https://pje.tjdft.jus.br", ordem: 7 },
  { sigla: "TJES", nome: "Tribunal de Justiça do Espírito Santo", categoria: "Justiça Estadual", sistemas: "PJe", portalUrl: "https://sistemas.tjes.jus.br/pje", ordem: 8 },
  { sigla: "TJGO", nome: "Tribunal de Justiça de Goiás", categoria: "Justiça Estadual", sistemas: "Projudi (principal) + PJD — Processo Judicial Digital", portalUrl: "https://projudi.tjgo.jus.br", ordem: 9 },
  { sigla: "TJMA", nome: "Tribunal de Justiça do Maranhão", categoria: "Justiça Estadual", sistemas: "PJe", portalUrl: "https://pje.tjma.jus.br", ordem: 10 },
  { sigla: "TJMT", nome: "Tribunal de Justiça de Mato Grosso", categoria: "Justiça Estadual", sistemas: "PJe", portalUrl: "https://pje.tjmt.jus.br", ordem: 11 },
  { sigla: "TJMS", nome: "Tribunal de Justiça de Mato Grosso do Sul", categoria: "Justiça Estadual", sistemas: "e-SAJ (adesão ao eproc)", portalUrl: "https://esaj.tjms.jus.br", ordem: 12 },
  { sigla: "TJMG", nome: "Tribunal de Justiça de Minas Gerais", categoria: "Justiça Estadual", sistemas: "eproc (migração do PJe em curso)", portalUrl: "https://eproc1g.tjmg.jus.br", ordem: 13 },
  { sigla: "TJPA", nome: "Tribunal de Justiça do Pará", categoria: "Justiça Estadual", sistemas: "PJe (+ Libra legado)", portalUrl: "https://pje.tjpa.jus.br", ordem: 14 },
  { sigla: "TJPB", nome: "Tribunal de Justiça da Paraíba", categoria: "Justiça Estadual", sistemas: "PJe", portalUrl: "https://pje.tjpb.jus.br", ordem: 15 },
  { sigla: "TJPR", nome: "Tribunal de Justiça do Paraná", categoria: "Justiça Estadual", sistemas: "Projudi + PJe; eproc em implantação (2026)", portalUrl: "https://projudi.tjpr.jus.br", ordem: 16 },
  { sigla: "TJPE", nome: "Tribunal de Justiça de Pernambuco", categoria: "Justiça Estadual", sistemas: "PJe", portalUrl: "https://pje.tjpe.jus.br", ordem: 17 },
  { sigla: "TJPI", nome: "Tribunal de Justiça do Piauí", categoria: "Justiça Estadual", sistemas: "PJe (+ Themis legado)", portalUrl: "https://pje.tjpi.jus.br", ordem: 18 },
  { sigla: "TJRJ", nome: "Tribunal de Justiça do Rio de Janeiro", categoria: "Justiça Estadual", sistemas: "eproc (PJe e DCP como legados)", portalUrl: "https://eproc1g.tjrj.jus.br", ordem: 19 },
  { sigla: "TJRN", nome: "Tribunal de Justiça do Rio Grande do Norte", categoria: "Justiça Estadual", sistemas: "PJe", portalUrl: "https://pje.tjrn.jus.br", ordem: 20 },
  { sigla: "TJRS", nome: "Tribunal de Justiça do Rio Grande do Sul", categoria: "Justiça Estadual", sistemas: "eproc", portalUrl: "https://eproc1g.tjrs.jus.br", ordem: 21 },
  { sigla: "TJRO", nome: "Tribunal de Justiça de Rondônia", categoria: "Justiça Estadual", sistemas: "PJe", portalUrl: "https://pjepg.tjro.jus.br", ordem: 22 },
  { sigla: "TJRR", nome: "Tribunal de Justiça de Roraima", categoria: "Justiça Estadual", sistemas: "Projudi (+ PJe)", portalUrl: "https://projudi.tjrr.jus.br", ordem: 23 },
  { sigla: "TJSC", nome: "Tribunal de Justiça de Santa Catarina", categoria: "Justiça Estadual", sistemas: "eproc", portalUrl: "https://eproc1g.tjsc.jus.br", ordem: 24 },
  { sigla: "TJSP", nome: "Tribunal de Justiça de São Paulo", categoria: "Justiça Estadual", sistemas: "e-SAJ (eproc em implantação)", portalUrl: "https://esaj.tjsp.jus.br", ordem: 25 },
  { sigla: "TJSE", nome: "Tribunal de Justiça de Sergipe", categoria: "Justiça Estadual", sistemas: "PJe (adesão ao eproc)", portalUrl: "https://pje.tjse.jus.br", ordem: 26 },
  { sigla: "TJTO", nome: "Tribunal de Justiça do Tocantins", categoria: "Justiça Estadual", sistemas: "eproc", portalUrl: "https://eproc1.tjto.jus.br", ordem: 27 },

  // ---- Justiça Comum Federal (6 TRFs + CJF + TNU) ----
  { sigla: "TRF1", nome: "Tribunal Regional Federal da 1ª Região", categoria: "Justiça Federal", sistemas: "PJe", portalUrl: "https://pje1g.trf1.jus.br", ordem: 1 },
  { sigla: "TRF2", nome: "Tribunal Regional Federal da 2ª Região", categoria: "Justiça Federal", sistemas: "eproc", portalUrl: "https://eproc.trf2.jus.br", ordem: 2 },
  { sigla: "TRF3", nome: "Tribunal Regional Federal da 3ª Região", categoria: "Justiça Federal", sistemas: "PJe", portalUrl: "https://pje1g.trf3.jus.br", ordem: 3 },
  { sigla: "TRF4", nome: "Tribunal Regional Federal da 4ª Região", categoria: "Justiça Federal", sistemas: "eproc (tribunal desenvolvedor do sistema)", portalUrl: "https://eproc.trf4.jus.br", ordem: 4 },
  { sigla: "TRF5", nome: "Tribunal Regional Federal da 5ª Região", categoria: "Justiça Federal", sistemas: "PJe", portalUrl: "https://pje.trf5.jus.br", ordem: 5 },
  { sigla: "TRF6", nome: "Tribunal Regional Federal da 6ª Região", categoria: "Justiça Federal", sistemas: "eproc", portalUrl: "https://eproc.trf6.jus.br", ordem: 6 },
  { sigla: "TNU", nome: "Turma Nacional de Uniformização", categoria: "Justiça Federal", sistemas: "eproc", portalUrl: "https://eproc.cjf.jus.br", ordem: 7 },
  { sigla: "CJF", nome: "Conselho da Justiça Federal", categoria: "Justiça Federal", sistemas: "Institucional (sem sistema processual próprio)", portalUrl: "https://www.cjf.jus.br", ordem: 8 },

  // ---- Justiça do Trabalho (24 TRTs, todos PJe) ----
  { sigla: "TRT1", nome: "Tribunal Regional do Trabalho da 1ª Região — Rio de Janeiro", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt1.jus.br", ordem: 1 },
  { sigla: "TRT2", nome: "Tribunal Regional do Trabalho da 2ª Região — São Paulo (capital e região)", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt2.jus.br", ordem: 2 },
  { sigla: "TRT3", nome: "Tribunal Regional do Trabalho da 3ª Região — Minas Gerais", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt3.jus.br", ordem: 3 },
  { sigla: "TRT4", nome: "Tribunal Regional do Trabalho da 4ª Região — Rio Grande do Sul", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt4.jus.br", ordem: 4 },
  { sigla: "TRT5", nome: "Tribunal Regional do Trabalho da 5ª Região — Bahia", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt5.jus.br", ordem: 5 },
  { sigla: "TRT6", nome: "Tribunal Regional do Trabalho da 6ª Região — Pernambuco", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt6.jus.br", ordem: 6 },
  { sigla: "TRT7", nome: "Tribunal Regional do Trabalho da 7ª Região — Ceará", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt7.jus.br", ordem: 7 },
  { sigla: "TRT8", nome: "Tribunal Regional do Trabalho da 8ª Região — Pará e Amapá", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt8.jus.br", ordem: 8 },
  { sigla: "TRT9", nome: "Tribunal Regional do Trabalho da 9ª Região — Paraná", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt9.jus.br", ordem: 9 },
  { sigla: "TRT10", nome: "Tribunal Regional do Trabalho da 10ª Região — Distrito Federal e Tocantins", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt10.jus.br", ordem: 10 },
  { sigla: "TRT11", nome: "Tribunal Regional do Trabalho da 11ª Região — Amazonas e Roraima", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt11.jus.br", ordem: 11 },
  { sigla: "TRT12", nome: "Tribunal Regional do Trabalho da 12ª Região — Santa Catarina", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt12.jus.br", ordem: 12 },
  { sigla: "TRT13", nome: "Tribunal Regional do Trabalho da 13ª Região — Paraíba", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt13.jus.br", ordem: 13 },
  { sigla: "TRT14", nome: "Tribunal Regional do Trabalho da 14ª Região — Rondônia e Acre", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt14.jus.br", ordem: 14 },
  { sigla: "TRT15", nome: "Tribunal Regional do Trabalho da 15ª Região — Campinas / interior de São Paulo", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt15.jus.br", ordem: 15 },
  { sigla: "TRT16", nome: "Tribunal Regional do Trabalho da 16ª Região — Maranhão", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt16.jus.br", ordem: 16 },
  { sigla: "TRT17", nome: "Tribunal Regional do Trabalho da 17ª Região — Espírito Santo", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt17.jus.br", ordem: 17 },
  { sigla: "TRT18", nome: "Tribunal Regional do Trabalho da 18ª Região — Goiás", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt18.jus.br", ordem: 18 },
  { sigla: "TRT19", nome: "Tribunal Regional do Trabalho da 19ª Região — Alagoas", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt19.jus.br", ordem: 19 },
  { sigla: "TRT20", nome: "Tribunal Regional do Trabalho da 20ª Região — Sergipe", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt20.jus.br", ordem: 20 },
  { sigla: "TRT21", nome: "Tribunal Regional do Trabalho da 21ª Região — Rio Grande do Norte", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt21.jus.br", ordem: 21 },
  { sigla: "TRT22", nome: "Tribunal Regional do Trabalho da 22ª Região — Piauí", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt22.jus.br", ordem: 22 },
  { sigla: "TRT23", nome: "Tribunal Regional do Trabalho da 23ª Região — Mato Grosso", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt23.jus.br", ordem: 23 },
  { sigla: "TRT24", nome: "Tribunal Regional do Trabalho da 24ª Região — Mato Grosso do Sul", categoria: "Justiça do Trabalho", sistemas: "PJe", portalUrl: "https://pje.trt24.jus.br", ordem: 24 },
  { sigla: "CSJT", nome: "Conselho Superior da Justiça do Trabalho", categoria: "Justiça do Trabalho", sistemas: "Institucional (sem sistema processual próprio)", portalUrl: "https://www.csjt.jus.br", ordem: 25 },

  // ---- Justiça Eleitoral (27 TREs, todos PJe) ----
  { sigla: "TRE-AC", nome: "Tribunal Regional Eleitoral do Acre", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-ac.jus.br", ordem: 1 },
  { sigla: "TRE-AL", nome: "Tribunal Regional Eleitoral de Alagoas", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-al.jus.br", ordem: 2 },
  { sigla: "TRE-AP", nome: "Tribunal Regional Eleitoral do Amapá", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-ap.jus.br", ordem: 3 },
  { sigla: "TRE-AM", nome: "Tribunal Regional Eleitoral do Amazonas", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-am.jus.br", ordem: 4 },
  { sigla: "TRE-BA", nome: "Tribunal Regional Eleitoral da Bahia", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-ba.jus.br", ordem: 5 },
  { sigla: "TRE-CE", nome: "Tribunal Regional Eleitoral do Ceará", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-ce.jus.br", ordem: 6 },
  { sigla: "TRE-DF", nome: "Tribunal Regional Eleitoral do Distrito Federal", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-df.jus.br", ordem: 7 },
  { sigla: "TRE-ES", nome: "Tribunal Regional Eleitoral do Espírito Santo", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-es.jus.br", ordem: 8 },
  { sigla: "TRE-GO", nome: "Tribunal Regional Eleitoral de Goiás", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-go.jus.br", ordem: 9 },
  { sigla: "TRE-MA", nome: "Tribunal Regional Eleitoral do Maranhão", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-ma.jus.br", ordem: 10 },
  { sigla: "TRE-MT", nome: "Tribunal Regional Eleitoral de Mato Grosso", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-mt.jus.br", ordem: 11 },
  { sigla: "TRE-MS", nome: "Tribunal Regional Eleitoral de Mato Grosso do Sul", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-ms.jus.br", ordem: 12 },
  { sigla: "TRE-MG", nome: "Tribunal Regional Eleitoral de Minas Gerais", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-mg.jus.br", ordem: 13 },
  { sigla: "TRE-PA", nome: "Tribunal Regional Eleitoral do Pará", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-pa.jus.br", ordem: 14 },
  { sigla: "TRE-PB", nome: "Tribunal Regional Eleitoral da Paraíba", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-pb.jus.br", ordem: 15 },
  { sigla: "TRE-PR", nome: "Tribunal Regional Eleitoral do Paraná", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-pr.jus.br", ordem: 16 },
  { sigla: "TRE-PE", nome: "Tribunal Regional Eleitoral de Pernambuco", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-pe.jus.br", ordem: 17 },
  { sigla: "TRE-PI", nome: "Tribunal Regional Eleitoral do Piauí", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-pi.jus.br", ordem: 18 },
  { sigla: "TRE-RJ", nome: "Tribunal Regional Eleitoral do Rio de Janeiro", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-rj.jus.br", ordem: 19 },
  { sigla: "TRE-RN", nome: "Tribunal Regional Eleitoral do Rio Grande do Norte", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-rn.jus.br", ordem: 20 },
  { sigla: "TRE-RS", nome: "Tribunal Regional Eleitoral do Rio Grande do Sul", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-rs.jus.br", ordem: 21 },
  { sigla: "TRE-RO", nome: "Tribunal Regional Eleitoral de Rondônia", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-ro.jus.br", ordem: 22 },
  { sigla: "TRE-RR", nome: "Tribunal Regional Eleitoral de Roraima", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-rr.jus.br", ordem: 23 },
  { sigla: "TRE-SC", nome: "Tribunal Regional Eleitoral de Santa Catarina", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-sc.jus.br", ordem: 24 },
  { sigla: "TRE-SP", nome: "Tribunal Regional Eleitoral de São Paulo", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-sp.jus.br", ordem: 25 },
  { sigla: "TRE-SE", nome: "Tribunal Regional Eleitoral de Sergipe", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-se.jus.br", ordem: 26 },
  { sigla: "TRE-TO", nome: "Tribunal Regional Eleitoral do Tocantins", categoria: "Justiça Eleitoral", sistemas: "PJe", portalUrl: "https://pje.tre-to.jus.br", ordem: 27 },

  // ---- Justiça Militar Estadual (STM já está em Tribunais Superiores) ----
  { sigla: "TJMSP", nome: "Tribunal de Justiça Militar de São Paulo", categoria: "Justiça Militar", sistemas: "e-SAJ", portalUrl: "https://www.tjmsp.jus.br", ordem: 1 },
  { sigla: "TJMMG", nome: "Tribunal de Justiça Militar de Minas Gerais", categoria: "Justiça Militar", sistemas: "eproc", portalUrl: "https://www.tjmmg.jus.br", ordem: 2 },
  { sigla: "TJMRS", nome: "Tribunal de Justiça Militar do Rio Grande do Sul", categoria: "Justiça Militar", sistemas: "eproc", portalUrl: "https://www.tjmrs.jus.br", ordem: 3 },

  // ---- Órgãos de Controle, Apoio e Plataformas Nacionais ----
  { sigla: "CNJ", nome: "Conselho Nacional de Justiça", categoria: "Órgãos de Apoio e Plataformas", sistemas: "PJe/SEI", portalUrl: "https://www.cnj.jus.br", ordem: 1 },
  { sigla: "CNMP", nome: "Conselho Nacional do Ministério Público", categoria: "Órgãos de Apoio e Plataformas", sistemas: "Institucional (sem sistema processual próprio)", portalUrl: "https://www.cnmp.mp.br", ordem: 2 },
  { sigla: "PDPJ-Br", nome: "Plataforma Digital do Poder Judiciário", categoria: "Órgãos de Apoio e Plataformas", sistemas: "PDPJ-Br", portalUrl: "https://www.pdpj.jus.br", ordem: 3 },
  { sigla: "DataJud", nome: "DataJud — Consulta processual unificada do CNJ", categoria: "Órgãos de Apoio e Plataformas", sistemas: "DataJud", portalUrl: "https://www.cnj.jus.br/sistemas/datajud", ordem: 4 },
  { sigla: "Domicílio-Eletrônico", nome: "Domicílio Judicial Eletrônico (CNJ)", categoria: "Órgãos de Apoio e Plataformas", sistemas: "Domicílio Judicial Eletrônico", portalUrl: "https://domicilio-eletronico.pdpj.jus.br", ordem: 5 },
  { sigla: "DJEN", nome: "Diário de Justiça Eletrônico Nacional", categoria: "Órgãos de Apoio e Plataformas", sistemas: "DJEN", portalUrl: "https://comunica.pje.jus.br", ordem: 6 },
];
