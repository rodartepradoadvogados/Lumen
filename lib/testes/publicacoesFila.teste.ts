import { teste, igual, verdade, resumo } from "./executar";
import { chaveDoProcesso, ehNumeroCurto, numeroCurtoNoTexto } from "../processKey";
import { ehAvisoDeIntimacao, tipoDoAto, limiteParaAbrirOAviso } from "../classificarAto";
import { situacaoPrazo, ORDEM_FAIXA, type PrazoExtraido } from "../prazoExtraido";
import { rotuloPrazo } from "../prazoRotulo";
import { groupPublicationsByProcess, countUnreadPublicationGroups } from "../publicationGrouping";
import { parseDataOuFallback } from "../dataDaPublicacao";
import { publicacoesDaFilaWhere, JANELA_DATAJUD_DIAS } from "../publicacoesVisiveis";
import { avaliarFonte, avisoDeCapturaParada, mensagemDaFonte } from "../saudeDasFontes";
import { saoPauloDayKey } from "../publicationGrouping";

// ---------- chave do processo ----------
teste("CNJ com ou sem máscara vira a mesma chave", () => {
  igual(chaveDoProcesso("5012345-88.2024.8.09.0051"), "CNJ:50123458820248090051");
  igual(chaveDoProcesso("50123458820248090051"), "CNJ:50123458820248090051");
});
teste("número curto do Projudi-GO vira chave própria, com ponto ou hífen", () => {
  igual(chaveDoProcesso("5618319.57"), "CURTO:5618319.57");
  igual(chaveDoProcesso(" 5618319-57 "), "CURTO:5618319.57");
  igual(ehNumeroCurto("5618319.57"), true);
  igual(ehNumeroCurto("5012345-88.2024.8.09.0051"), false);
});
teste("o que não é nenhum dos dois formatos não vira chave", () => {
  igual(chaveDoProcesso(""), null);
  igual(chaveDoProcesso(null), null);
  igual(chaveDoProcesso("123"), null);
  igual(chaveDoProcesso("561831957"), null, "sem o ponto não é o formato curto");
  igual(chaveDoProcesso("5618319.571"), null);
});
teste("número curto dentro do texto do e-mail do Projudi", () => {
  igual(numeroCurtoNoTexto("informa que está disponível uma intimação/citação referente ao processo nº. 5618319.57 em sua caixa de entrada"), "5618319.57");
  igual(numeroCurtoNoTexto("Processo 5618319.57."), "5618319.57");
});
teste("número curto não é pescado de dentro de outros números, valores ou datas", () => {
  igual(numeroCurtoNoTexto("CNJ 5012345-88.2024.8.09.0051"), null);
  igual(numeroCurtoNoTexto("valor de R$ 1.234.567.89"), null);
  igual(numeroCurtoNoTexto("ip 1234567.891"), null);
  igual(numeroCurtoNoTexto("sem número nenhum"), null);
});

// ---------- aviso de intimação ----------
const AVISO_PROJUDI =
  "Sr(a). FULANO DE TAL,\n\nO Poder Judiciário do Estado de Goiás informa que está disponível uma intimação/citação referente ao processo nº. 5618319.57 em sua caixa de entrada no Sistema PROJUDI.\n\nSistema PROJUDI\n\nObs.: Esta mensagem não possui valor legal.";
teste("o e-mail do Projudi é aviso de intimação, não andamento 'só ciência'", () => {
  igual(ehAvisoDeIntimacao({ source: "PROJUDI", content: AVISO_PROJUDI, emailSubject: "[PROJUDI]Informação de intimação/citação" }), true);
  igual(tipoDoAto({ source: "PROJUDI", kind: "ANDAMENTO", content: AVISO_PROJUDI }), "AVISO_INTIMACAO");
});
teste("só o assunto já basta, com o corpo curto", () => {
  igual(ehAvisoDeIntimacao({ source: "PROJUDI", content: "Sistema PROJUDI", emailSubject: "[PROJUDI] Informação de intimação/citação" }), true);
});
teste("intimação de verdade (com teor) não é aviso, mesmo citando 'intimação'", () => {
  const teor = "Fica a parte intimada para, no prazo de 5 dias, manifestar-se sobre os documentos. ".repeat(20);
  igual(ehAvisoDeIntimacao({ source: "PROJUDI", content: teor }), false);
  igual(tipoDoAto({ source: "DJEN", kind: "PUBLICACAO", content: teor }), "INTIMACAO");
});
teste("fonte que não é sistema de tribunal nunca é aviso", () => {
  igual(ehAvisoDeIntimacao({ source: "DJE", content: "está disponível uma intimação na sua caixa de entrada", emailSubject: "Promoção" }), false);
});
teste("andamento comum é movimentação", () => {
  igual(tipoDoAto({ source: "DATAJUD", kind: "ANDAMENTO", content: "Juntada de petição" }), "MOVIMENTACAO");
});
teste("limite para abrir o aviso: 10 dias corridos do dia de Brasília do envio", () => {
  igual(limiteParaAbrirOAviso("2026-09-30T20:44:00.000Z"), "2026-10-10");
  // 23:30 em Brasília de 30/09 já é 01/10 em UTC: o dia do envio é 30/09.
  igual(limiteParaAbrirOAviso("2026-10-01T02:30:00.000Z"), "2026-10-10");
});

// ---------- faixa de aviso na fila ----------
const SEM_PRAZO: PrazoExtraido = { tipo: "NENHUM", confianca: 0, notas: [] };
teste("aviso nunca cai em 'só ciência' e vem logo depois dos que vencem hoje", () => {
  const s = situacaoPrazo(SEM_PRAZO, "ANDAMENTO", "2026-10-12", [], { limite: "2026-10-16" });
  igual(s.faixa, "aviso");
  igual(s.limite, "2026-10-16");
  verdade(ORDEM_FAIXA.hoje < ORDEM_FAIXA.aviso && ORDEM_FAIXA.aviso < ORDEM_FAIXA.d3, "ordem das faixas");
  // sem o parâmetro o mesmo item seria 'só ciência' (o defeito original)
  igual(situacaoPrazo(SEM_PRAZO, "ANDAMENTO", "2026-10-12").faixa, "cien");
});
teste("rótulo do aviso diz 'abrir no tribunal até dd/mm'", () => {
  const s = situacaoPrazo(SEM_PRAZO, "ANDAMENTO", "2026-10-12", [], { limite: "2026-10-16" });
  const r = rotuloPrazo({ prazo: SEM_PRAZO, situacao: s, registrado: false, tratada: false });
  igual(r.texto, "Aviso de intimação");
  igual(r.detalhe, "abrir no tribunal até 16/10");
});

// ---------- agrupamento com número curto ----------
const base = { source: "PROJUDI", read: false };
teste("avisos do Projudi do mesmo processo no mesmo dia agrupam (antes nunca agrupavam)", () => {
  const g = groupPublicationsByProcess([
    { ...base, id: "a", publishedAt: "2026-10-09T15:00:00.000Z", processNumberRaw: "5618319.57" },
    { ...base, id: "b", publishedAt: "2026-10-09T18:00:00.000Z", processNumberRaw: "5618319.57" },
    { ...base, id: "c", publishedAt: "2026-10-08T15:00:00.000Z", processNumberRaw: "5618319.57" },
  ]);
  igual(g.length, 2);
  igual(g.map((x) => x.items.length).sort(), [1, 2]);
});
teste("DJEN e e-mail do mesmo ato no mesmo dia continuam agrupando com CNJ", () => {
  const g = groupPublicationsByProcess([
    { id: "d", source: "DJEN", read: false, publishedAt: "2026-10-09T12:00:00.000Z", processNumberRaw: "5012345-88.2024.8.09.0051" },
    { id: "e", source: "JUSBRASIL_EMAIL", read: false, publishedAt: "2026-10-09T17:00:00.000Z", processNumberRaw: "50123458820248090051" },
  ]);
  igual(g.length, 1);
  igual(g[0].primary.source, "DJEN");
});
teste("selo: conta grupos, e o número curto também deduplica", () => {
  igual(
    countUnreadPublicationGroups([
      { id: "a", processNumberRaw: "5618319.57", publishedAt: "2026-10-09T15:00:00.000Z" },
      { id: "b", processNumberRaw: "5618319.57", publishedAt: "2026-10-09T18:00:00.000Z" },
      { id: "c", processNumberRaw: null, publishedAt: "2026-10-09T18:00:00.000Z" },
    ]),
    2
  );
});

// ---------- data do DJEN ----------
teste("data só com dia vai para o meio-dia UTC e cai no MESMO dia em Brasília", () => {
  const d = parseDataOuFallback("2026-10-09", new Date(0));
  igual(d.toISOString(), "2026-10-09T12:00:00.000Z");
  igual(saoPauloDayKey(d), "2026-10-09");
  // o comportamento antigo caía no dia anterior:
  igual(saoPauloDayKey(new Date("2026-10-09")), "2026-10-08");
});
teste("data com hora segue como estava; lixo cai no fallback", () => {
  igual(parseDataOuFallback("2026-07-10T10:00:00.000Z", new Date(0)).toISOString(), "2026-07-10T10:00:00.000Z");
  igual(parseDataOuFallback("nao e data", new Date(5)).getTime(), 5);
  igual(parseDataOuFallback(null, new Date(7)).getTime(), 7);
});

// ---------- universo da fila ----------
teste("o universo da fila só tem estado ATIVA e só promove DataJud recente com cara de intimação", () => {
  const agora = new Date("2026-10-12T12:00:00.000Z");
  const w = publicacoesDaFilaWhere("off1", agora) as { officeId: string; estado: string; OR: Array<Record<string, unknown>> };
  igual(w.officeId, "off1");
  igual(w.estado, "ATIVA");
  igual(w.OR.length, 2);
  igual(w.OR[0], { source: { not: "DATAJUD" } });
  const datajud = w.OR[1] as { source: string; createdAt: { gte: Date }; OR: unknown[] };
  igual(datajud.source, "DATAJUD");
  igual(datajud.createdAt.gte.toISOString(), new Date(agora.getTime() - JANELA_DATAJUD_DIAS * 86400000).toISOString());
  verdade(datajud.OR.length >= 8, "termos de intimação");
});

// ---------- saúde das fontes ----------
teste("robô parado há 19 dias fica vermelho e acende o aviso", () => {
  const agora = new Date("2026-10-12T15:00:00.000Z");
  const djen = avaliarFonte({ chave: "DJEN", ultimoSucesso: new Date("2026-09-23T21:03:00.000Z"), ultimoItemNovo: new Date("2026-09-23T12:00:00.000Z"), agora });
  igual(djen.parada, true);
  igual(djen.diasSemSucesso, 18);
  const aviso = avisoDeCapturaParada([djen]);
  verdade(aviso && aviso.includes("sem captura há 18 dias") && aviso.includes("23/09"), "texto do aviso");
});
teste("sexta à noite para segunda de manhã não é falha", () => {
  const f = avaliarFonte({ chave: "DJEN", ultimoSucesso: new Date("2026-10-09T21:00:00.000Z"), ultimoItemNovo: null, agora: new Date("2026-10-12T12:00:00.000Z") });
  igual(f.parada, false);
});
teste("dois dias úteis sem sucesso é falha (12/10 é feriado nacional e não conta)", () => {
  const f = avaliarFonte({ chave: "DATAJUD", ultimoSucesso: new Date("2026-10-08T21:00:00.000Z"), ultimoItemNovo: null, agora: new Date("2026-10-13T12:00:00.000Z") });
  igual(f.parada, true);
});
teste("nunca consultou é parada; erro isolado não, falha persistente sim", () => {
  igual(avaliarFonte({ chave: "DJEN", ultimoSucesso: null, ultimoItemNovo: null, agora: new Date() }).parada, true);
  const agora = new Date("2026-10-12T15:00:00.000Z");
  const recente = new Date("2026-10-12T11:00:00.000Z");
  igual(avaliarFonte({ chave: "DJEN", ultimoSucesso: recente, ultimoItemNovo: null, agora, erro: "falhou ontem" }).parada, false);
  igual(avaliarFonte({ chave: "EMAIL", ultimoSucesso: recente, ultimoItemNovo: null, agora, erro: "invalid_grant", falhaPersistente: true }).parada, true);
});
teste("e-mail parado sozinho não acende o aviso de captura oficial", () => {
  const email = avaliarFonte({ chave: "EMAIL", ultimoSucesso: null, ultimoItemNovo: null, agora: new Date() });
  igual(avisoDeCapturaParada([email]), null);
  verdade(mensagemDaFonte(email).includes("E-mail"), "mensagem");
});

resumo("publicações: fila confiável (chave do processo, aviso de intimação, data do DJEN, universo, saúde das fontes)");
