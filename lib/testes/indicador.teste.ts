import { teste, igual, verdade, resumo } from "./executar";
import { podeVerNivel, motivoDaRecusa, explicacaoDaRecusa } from "@/lib/nivelFinanceiro";
import { periodoDoIndicador, periodoDeComparacao } from "@/lib/assistantTools";
import { dataEHoraDeBrasilia } from "@/lib/horaDeBrasilia";

// ============================================================================
// REGISTRO × INDICADOR.
//
// A regra do dono: "somar o que já está lançado é REGISTRO; calcular o que ainda não existe é
// INDICADOR". Registro é de quem tem acesso ao financeiro; indicador é só de sócio.
//
// O CASO QUE ESTA REGRA EXISTE PARA COBRIR é o de quem paga as contas do escritório: precisa
// saber o que vence amanhã, e não pode saber a margem de lucro da sociedade. Os dois são
// "financeiro"; só um é dele.
//
// Toda a matriz é testada — quatro combinações, e nenhuma por analogia.
// ============================================================================

const SOCIO = { financeiro: true, admin: true };
const FINANCEIRO = { financeiro: true, admin: false };
const NADA = { financeiro: false, admin: false };
// Existe de verdade: sócio a quem alguém removeu o acesso ao financeiro por engano na tela de
// Equipe. A porta do financeiro tem de fechar mesmo assim — a primeira trava não pode ser pulada
// por causa da segunda.
const SOCIO_SEM_FINANCEIRO = { financeiro: false, admin: true };

// ── A matriz inteira ─────────────────────────────────────────────────────────────────────────

teste("sócio vê os dois níveis", () => {
  igual(podeVerNivel("registro", SOCIO), true);
  igual(podeVerNivel("indicador", SOCIO), true);
});

teste("quem tem acesso ao financeiro vê o registro, e NÃO vê o indicador", () => {
  igual(podeVerNivel("registro", FINANCEIRO), true);
  igual(podeVerNivel("indicador", FINANCEIRO), false);
});

teste("quem não tem acesso ao financeiro não vê nada", () => {
  igual(podeVerNivel("registro", NADA), false);
  igual(podeVerNivel("indicador", NADA), false);
});

teste("ser sócio não abre o financeiro de quem teve o acesso removido", () => {
  igual(podeVerNivel("registro", SOCIO_SEM_FINANCEIRO), false);
  igual(podeVerNivel("indicador", SOCIO_SEM_FINANCEIRO), false);
});

// ── O motivo diz QUAL porta fechou ───────────────────────────────────────────────────────────

teste("o motivo separa as duas portas, porque elas se resolvem de formas diferentes", () => {
  igual(motivoDaRecusa("indicador", FINANCEIRO), "indicador do escritório é restrito aos sócios");
  igual(motivoDaRecusa("registro", NADA), "usuário sem acesso ao financeiro");
  igual(motivoDaRecusa("indicador", NADA), "usuário sem acesso ao financeiro");
});

teste("quem pode não recebe motivo nenhum", () => {
  igual(motivoDaRecusa("registro", FINANCEIRO), null);
  igual(motivoDaRecusa("indicador", SOCIO), null);
});

teste("a explicação ao usuário não confunde as duas recusas", () => {
  const semAcesso = explicacaoDaRecusa("registro", NADA);
  const semSociedade = explicacaoDaRecusa("indicador", FINANCEIRO);
  verdade(semAcesso !== semSociedade, "as duas recusas dizem a mesma frase");
  verdade(semSociedade.includes("sócios"), "a recusa de indicador não menciona sócios");
  verdade(
    semSociedade.includes("contas a pagar e a receber"),
    "a recusa de indicador não diz o que a pessoa AINDA pode consultar",
  );
});

// ── O período do indicador ───────────────────────────────────────────────────────────────────

// 19/09/2026, 12:00 UTC = 09:00 em Brasília.
const AGORA = new Date(Date.UTC(2026, 8, 19, 12, 0, 0));

teste("sem período informado, é o mês corrente no fuso do escritório", () => {
  const p = periodoDoIndicador(undefined, undefined, AGORA);
  igual(dataEHoraDeBrasilia(p.de), "01/09/2026 00:00");
  igual(dataEHoraDeBrasilia(p.ate), "01/10/2026 00:00");
});

teste("o fim é EXCLUSIVO: o último instante de setembro entra, o primeiro de outubro não", () => {
  const p = periodoDoIndicador(undefined, undefined, AGORA);
  verdade(new Date(p.ate.getTime() - 1) < p.ate, "sanidade");
  igual(dataEHoraDeBrasilia(new Date(p.ate.getTime() - 1)).slice(0, 10), "30/09/2026");
});

teste("no dia 1º de manhã, o período é o mês que acabou de começar", () => {
  // 01/09/2026, 08:00 em Brasília = 11:00 UTC.
  const p = periodoDoIndicador(undefined, undefined, new Date(Date.UTC(2026, 8, 1, 11)));
  igual(dataEHoraDeBrasilia(p.de), "01/09/2026 00:00");
});

teste("no último dia à noite, o período ainda é o mês que está acabando", () => {
  // 30/09/2026, 22:00 em Brasília = 01/10/2026, 01:00 UTC — em UTC já virou o mês.
  const p = periodoDoIndicador(undefined, undefined, new Date(Date.UTC(2026, 9, 1, 1)));
  igual(dataEHoraDeBrasilia(p.de), "01/09/2026 00:00");
});

teste('"2026-08" nas duas pontas cobre agosto inteiro, e não um instante', () => {
  const p = periodoDoIndicador("2026-08", "2026-08", AGORA);
  const duracaoEmDias = (p.ate.getTime() - p.de.getTime()) / 86_400_000;
  verdade(duracaoEmDias > 30 && duracaoEmDias < 32, `agosto ficou com ${duracaoEmDias} dias`);
});

teste("só o início informado quer dizer AQUELE mês, e não daqui em diante", () => {
  const p = periodoDoIndicador("2026-03", undefined, AGORA);
  igual(dataEHoraDeBrasilia(p.ate), "01/04/2026 00:00");
});

teste("só o fim informado abre no começo daquele mês", () => {
  const p = periodoDoIndicador(undefined, "2026-03", AGORA);
  igual(dataEHoraDeBrasilia(p.de), "01/03/2026 00:00");
  igual(dataEHoraDeBrasilia(p.ate), "01/04/2026 00:00");
});

teste("um dia único é um dia inteiro, e não um instante", () => {
  const p = periodoDoIndicador("2026-09-15", "2026-09-15", AGORA);
  igual(dataEHoraDeBrasilia(p.de), "15/09/2026 00:00");
  igual(dataEHoraDeBrasilia(p.ate), "16/09/2026 00:00");
});

teste("dezembro fecha em janeiro do ano seguinte", () => {
  igual(dataEHoraDeBrasilia(periodoDoIndicador("2026-12", "2026-12", AGORA).ate), "01/01/2027 00:00");
});

teste("texto inválido cai no mês corrente em vez de produzir um período torto", () => {
  for (const ruim of ["2026-13", "2026-02-30", "setembro", "2026", ""]) {
    const p = periodoDoIndicador(ruim, ruim, AGORA);
    igual(dataEHoraDeBrasilia(p.de), "01/09/2026 00:00", `${ruim}: `);
    igual(dataEHoraDeBrasilia(p.ate), "01/10/2026 00:00", `${ruim}: `);
  }
});

teste("o período nunca sai invertido", () => {
  const casos: [string | undefined, string | undefined][] = [
    [undefined, undefined],
    ["2026-01", "2026-12"],
    ["2026-03", undefined],
    [undefined, "2026-03"],
    ["2026-09-15", "2026-09-15"],
  ];
  for (const [de, ate] of casos) {
    const p = periodoDoIndicador(de, ate, AGORA);
    verdade(p.de < p.ate, `período invertido para (${de}, ${ate})`);
  }
});

// ── Com o que se compara ─────────────────────────────────────────────────────────────────────

teste("mês inteiro compara com o MÊS anterior, e não com trinta dias antes", () => {
  const setembro = periodoDoIndicador("2026-09", "2026-09", AGORA);
  const c = periodoDeComparacao(setembro);
  igual(dataEHoraDeBrasilia(c.de), "01/08/2026 00:00");
  igual(dataEHoraDeBrasilia(c.ate), "01/09/2026 00:00");
  // Agosto tem 31 dias; a comparação por duração igual teria começado em 2 de agosto e deixado
  // um dia de fora — mostrando uma queda que não aconteceu.
  igual(Math.round((c.ate.getTime() - c.de.getTime()) / 86_400_000), 31);
});

teste("janeiro compara com dezembro do ano anterior", () => {
  const c = periodoDeComparacao(periodoDoIndicador("2026-01", "2026-01", AGORA));
  igual(dataEHoraDeBrasilia(c.de), "01/12/2025 00:00");
  igual(dataEHoraDeBrasilia(c.ate), "01/01/2026 00:00");
});

teste("março compara com fevereiro, que é mais curto — e isso é o certo", () => {
  const c = periodoDeComparacao(periodoDoIndicador("2026-03", "2026-03", AGORA));
  igual(dataEHoraDeBrasilia(c.de), "01/02/2026 00:00");
  igual(Math.round((c.ate.getTime() - c.de.getTime()) / 86_400_000), 28);
});

teste("período que NÃO é mês inteiro compara com a mesma duração encostada antes", () => {
  const umDia = periodoDoIndicador("2026-09-15", "2026-09-15", AGORA);
  const c = periodoDeComparacao(umDia);
  igual(dataEHoraDeBrasilia(c.de), "14/09/2026 00:00");
  igual(dataEHoraDeBrasilia(c.ate), "15/09/2026 00:00");
});

teste("a comparação termina exatamente onde o período começa, sem buraco nem sobreposição", () => {
  for (const mes of ["2026-01", "2026-02", "2026-07", "2026-12"]) {
    const p = periodoDoIndicador(mes, mes, AGORA);
    const c = periodoDeComparacao(p);
    igual(c.ate.getTime(), p.de.getTime(), `${mes}: `);
    verdade(c.de < c.ate, `${mes}: comparação invertida`);
  }
});

resumo("Registro × indicador");
