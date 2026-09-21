import { teste, verdade, resumo, corpoDaFuncao, codigoDe } from "./executar";
import { readFileSync } from "node:fs";

// ============================================================================
// VARREDURA DE lib/actions/campanhasTela.ts e lib/actions/campanhasPainelMestre.ts (Frente D) —
// mesmo motivo de lib/testes/campanhasCobranca.teste.ts §7: rodar de verdade exigiria banco (e,
// no caso do painel mestre, uma sessão de PlatformMember), que este ambiente de teste não tem.
// Ancorado por regex e por corpoDaFuncao, nunca por `includes` ingênuo (as duas armadilhas
// documentadas em lib/testes/executar.ts); `codigoDe` remove comentário antes de procurar, para
// um comentário que CITA a trava não fingir que ela existe no código de verdade.
// ============================================================================

const FONTE_DA_TELA = readFileSync("lib/actions/campanhasTela.ts", "utf8");
const CODIGO_DA_TELA = codigoDe(FONTE_DA_TELA);

const FONTE_DO_PAINEL_MESTRE = readFileSync("lib/actions/campanhasPainelMestre.ts", "utf8");
const CODIGO_DO_PAINEL_MESTRE = codigoDe(FONTE_DO_PAINEL_MESTRE);

// ── 1 · A tela do escritório — hard gate de preço e checagem de administrador ────────────────

teste("assinarModulo exige administrador do escritório antes de assinar", () => {
  const corpo = corpoDaFuncao(CODIGO_DA_TELA, "assinarModulo");
  verdade(corpo.length > 80, `corpoDaFuncao devolveu ${corpo.length} caracteres — provavelmente não achou a função`);
  verdade(/exigirAdministrador\(\)/.test(corpo), "assinarModulo não chama exigirAdministrador()");
});

teste("salvarInstrucoesDoPerfilDeCampanha exige administrador antes de gravar `instrucoes`", () => {
  const corpo = corpoDaFuncao(CODIGO_DA_TELA, "salvarInstrucoesDoPerfilDeCampanha");
  verdade(corpo.length > 80, `corpoDaFuncao devolveu ${corpo.length} caracteres`);
  verdade(/exigirAdministrador\(\)/.test(corpo), "salvarInstrucoesDoPerfilDeCampanha não checa administrador");
});

teste("solicitarNovaCampanha CHECA o hard gate de preço (precoAMostrar) ANTES de criar o slot no banco", () => {
  const corpo = corpoDaFuncao(CODIGO_DA_TELA, "solicitarNovaCampanha");
  verdade(corpo.length > 200, `corpoDaFuncao devolveu ${corpo.length} caracteres — provavelmente não achou a função`);
  const iGate = corpo.indexOf("preco.configurado");
  const iCreate = corpo.indexOf("campanhaSlotPago.create");
  verdade(iGate >= 0, "solicitarNovaCampanha perdeu a checagem de preco.configurado");
  verdade(iCreate >= 0, "solicitarNovaCampanha não cria o CampanhaSlotPago em lugar nenhum — teste desatualizado");
  verdade(iGate < iCreate, "a checagem do hard gate de preço vem DEPOIS de já ter criado o slot — pedido poderia nascer sem preço configurado");
});

teste("solicitarNovaCampanha exige administrador do escritório", () => {
  const corpo = corpoDaFuncao(CODIGO_DA_TELA, "solicitarNovaCampanha");
  verdade(/exigirAdministrador\(\)/.test(corpo), "solicitarNovaCampanha não checa administrador");
});

// ── 2 · O painel mestre — nenhuma ação aprova/grava sem isPlatformStaff() ───────────────────

// liberarCampanhaSlot fica de fora desta lista: ela resolve acesso por platformMemberIdDeQuemClicou()
// (que chama getPlatformMember() por dentro), não por isPlatformStaff() direto — coberta pelo
// teste dedicado logo abaixo.
const ACOES_DO_PAINEL_MESTRE = ["salvarPrecoDoModuloDeCampanhas", "salvarLimiarDeMemoriaHermes", "tentarProvisionarPerfilAgora"];

for (const nome of ACOES_DO_PAINEL_MESTRE) {
  teste(`${nome} exige acesso ao painel mestre (isPlatformStaff ou getPlatformMember)`, () => {
    const corpo = corpoDaFuncao(CODIGO_DO_PAINEL_MESTRE, nome);
    verdade(corpo.length > 40, `corpoDaFuncao devolveu ${corpo.length} caracteres para ${nome} — provavelmente não achou a função`);
    verdade(/isPlatformStaff\(\)|getPlatformMember\(\)/.test(corpo), `${nome} não checa isPlatformStaff()/getPlatformMember() — qualquer visitante poderia chamá-la`);
  });
}

teste("liberarCampanhaSlot NUNCA fabrica um platformMemberId — usa getPlatformMember() e devolve erro se a pessoa não tem PlatformMember", () => {
  const corpo = corpoDaFuncao(CODIGO_DO_PAINEL_MESTRE, "liberarCampanhaSlot");
  verdade(corpo.length > 80, `corpoDaFuncao devolveu ${corpo.length} caracteres`);
  verdade(/platformMemberIdDeQuemClicou\(\)/.test(corpo), "liberarCampanhaSlot não resolve quem clicou por platformMemberIdDeQuemClicou()");
  verdade(!/aprovarCampanhaSlotPago\(\s*slotId\s*,\s*["']/.test(corpo), "liberarCampanhaSlot parece passar um id literal (string fixa) como aprovador — nunca pode ser inventado");
});

teste("salvarPrecoDoModuloDeCampanhas recusa preço negativo antes do upsert", () => {
  const corpo = corpoDaFuncao(CODIGO_DO_PAINEL_MESTRE, "salvarPrecoDoModuloDeCampanhas");
  const iGate = corpo.indexOf("preco < 0");
  const iUpsert = corpo.indexOf("campanhaPrecoParametro.upsert");
  verdade(iGate >= 0 && iUpsert >= 0, "salvarPrecoDoModuloDeCampanhas perdeu a checagem de preço negativo ou o upsert");
  verdade(iGate < iUpsert, "a checagem de preço negativo vem depois do upsert");
});

resumo("varredura das ações da tela do módulo de campanhas (Frente D)");
