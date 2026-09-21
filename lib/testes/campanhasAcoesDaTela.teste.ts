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

// ── 3 · ACHADO DA SUPERVISÃO: a lista de ações acima é ESCRITA À MÃO ────────────────────────
// Uma lista fixa cobre o que existe hoje e nada do que vier depois: a ação que alguém acrescentar
// amanhã sem trava passa verde, porque ninguém lembrou de escrever o nome dela aqui. Foi
// exatamente esse o buraco encontrado nas ações de peticionamento (ver
// lib/testes/peticionamentoIsolamento.teste.ts, que deriva a lista do próprio arquivo).
// As varreduras abaixo DERIVAM a lista, e por isso caem sozinhas quando o arquivo cresce.

function acoesExportadas(codigo: string): string[] {
  return [...codigo.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
}

teste("a derivação acha as ações dos dois arquivos — lista vazia passaria verde sem provar nada", () => {
  const daTela = acoesExportadas(CODIGO_DA_TELA);
  const doPainel = acoesExportadas(CODIGO_DO_PAINEL_MESTRE);
  verdade(daTela.length >= 3, `só ${daTela.length} ação(ões) exportada(s) na tela do escritório: ${daTela.join(", ")}`);
  verdade(doPainel.length >= 4, `só ${doPainel.length} ação(ões) exportada(s) no painel mestre: ${doPainel.join(", ")}`);
  for (const esperada of ["assinarModulo", "salvarInstrucoesDoPerfilDeCampanha", "solicitarNovaCampanha"]) {
    verdade(daTela.includes(esperada), `a derivação não achou "${esperada}"`);
  }
  verdade(doPainel.includes("liberarCampanhaSlot"), 'a derivação não achou "liberarCampanhaSlot"');
});

teste("TRAVA DERIVADA: TODA ação do painel mestre checa acesso ANTES de tocar o banco", () => {
  for (const nome of acoesExportadas(CODIGO_DO_PAINEL_MESTRE)) {
    const corpo = corpoDaFuncao(CODIGO_DO_PAINEL_MESTRE, nome);
    verdade(corpo.length > 40, `corpoDaFuncao("${nome}") devolveu ${corpo.length} caracteres — varredura cega`);
    const posTrava = corpo.search(/isPlatformStaff\(\)|getPlatformMember\(\)|platformMemberIdDeQuemClicou\(\)/);
    verdade(posTrava >= 0, `"${nome}" não checa acesso ao painel mestre — qualquer visitante poderia chamá-la`);
    const posPrisma = corpo.indexOf("prisma.");
    if (posPrisma >= 0) {
      verdade(posTrava < posPrisma, `"${nome}" toca o banco antes de checar quem está pedindo`);
    }
  }
});

teste("TRAVA DERIVADA: TODA ação da tela do escritório exige administrador ANTES de tocar o banco", () => {
  for (const nome of acoesExportadas(CODIGO_DA_TELA)) {
    const corpo = corpoDaFuncao(CODIGO_DA_TELA, nome);
    verdade(corpo.length > 40, `corpoDaFuncao("${nome}") devolveu ${corpo.length} caracteres — varredura cega`);
    const posTrava = corpo.indexOf("exigirAdministrador()");
    verdade(posTrava >= 0, `"${nome}" não chama exigirAdministrador()`);
    const posPrisma = corpo.indexOf("prisma.");
    if (posPrisma >= 0) {
      verdade(posTrava < posPrisma, `"${nome}" toca o banco antes de saber quem está pedindo`);
    }
  }
});

// ── 4 · ISOLAMENTO ENTRE ESCRITÓRIOS ────────────────────────────────────────────────────────
// A trava de administrador diz QUEM é; ela não diz de QUAL escritório. Sem o corte por officeId,
// um administrador de um escritório treinaria o perfil de campanha de outro. E o officeId nunca
// pode vir de FORA: se ele for parâmetro da ação, o navegador escolhe de quem é a assinatura.

teste("TRAVA: nenhuma ação da tela recebe officeId por parâmetro — ele sai SEMPRE da sessão", () => {
  for (const nome of acoesExportadas(CODIGO_DA_TELA)) {
    const corpo = corpoDaFuncao(CODIGO_DA_TELA, nome);
    const cabecalho = corpo.slice(0, corpo.indexOf("{") + 1);
    verdade(!/officeId/.test(cabecalho), `"${nome}" aceita officeId de quem chama — o navegador escolheria de quem é a assinatura`);
  }
});

teste("TRAVA: toda consulta da tela do escritório é precedida pelo corte por user.officeId", () => {
  // A régua NÃO é "todo prisma carrega officeId": escrever por um id que veio de um registro já
  // filtrado por escritório é legítimo e é o padrão da casa (o mesmo de
  // lib/actions/peticionamento.ts). A régua é que, DENTRO DA MESMA FUNÇÃO, o escritório da sessão
  // já tenha entrado na conversa ANTES de o banco ser tocado. Tirar o `officeId` do filtro deixa
  // a função inteira sem nenhuma menção a `user.officeId` antes da escrita — e é aí que cai.
  let conferidas = 0;
  for (const nome of acoesExportadas(CODIGO_DA_TELA)) {
    const corpo = corpoDaFuncao(CODIGO_DA_TELA, nome);
    verdade(corpo.length > 40, `corpoDaFuncao("${nome}") devolveu ${corpo.length} caracteres — varredura cega`);
    for (const m of [...corpo.matchAll(/prisma\.(\w+)\.(findUnique|findFirst|findMany|update|upsert|create|count)\(/g)]) {
      // campanhaPrecoParametro é a tabela GLOBAL de preços da Lúmen, não de um escritório.
      if (m[1] === "campanhaPrecoParametro") continue;
      // Até o FIM desta chamada, e não até o começo dela: o corte normalmente mora DENTRO do
      // argumento (`where: { officeId: user.officeId }`), logo depois do `prisma.`.
      let profundidade = 0;
      let fim = corpo.length;
      for (let i = m.index! + m[0].length - 1; i < corpo.length; i++) {
        const ch = corpo[i];
        if (ch === "(" || ch === "{" || ch === "[") profundidade++;
        else if (ch === ")" || ch === "}" || ch === "]") {
          profundidade--;
          if (profundidade === 0) { fim = i + 1; break; }
        }
      }
      const posCorte = corpo.slice(0, fim).indexOf("user.officeId");
      verdade(posCorte >= 0,
        `em "${nome}", prisma.${m[1]}.${m[2]} é alcançado sem que user.officeId tenha entrado antes — escritório alheio ao alcance de quem tiver o id`);
      conferidas++;
    }
  }
  verdade(conferidas >= 3, `só ${conferidas} consulta(s) conferida(s) — a varredura não está achando o que deveria`);
});

// ── 5 · ACHADO DA SUPERVISÃO: CHAMAR NÃO É OBEDECER ─────────────────────────────────────────
// As travas acima provam que cada ação CHAMA `exigirAdministrador()`. Nenhuma provava o que essa
// função checa por dentro — e ela é a porta de todas elas. Três mutações passaram verdes:
// tirar `isAdmin` (qualquer pessoa do escritório assinaria um módulo de R$ 120/mês em nome do
// escritório), tirar `active` (usuário desligado continuaria agindo) e apagar a validação da
// forma de pagamento (uma string qualquer viraria forma de pagamento e seguiria para a cobrança).

teste("TRAVA: exigirAdministrador confere as TRÊS condições — existe, está ativo e é administrador", () => {
  const corpo = corpoDaFuncao(CODIGO_DA_TELA, "exigirAdministrador");
  verdade(corpo.length > 40, `corpoDaFuncao devolveu ${corpo.length} caracteres — varredura cega`);
  verdade(/!user\b/.test(corpo), "exigirAdministrador deixou de conferir se existe alguém logado");
  verdade(/!user\.active\b/.test(corpo), "exigirAdministrador deixou de conferir `active` — usuário desligado voltaria a agir");
  verdade(/!user\.isAdmin\b/.test(corpo),
    "exigirAdministrador deixou de conferir `isAdmin` — qualquer pessoa do escritório assinaria o módulo pago em nome dele");
  verdade(/return null/.test(corpo), "a recusa precisa devolver null — quem chama trata null como 'sem permissão'");
});

teste("TRAVA: a forma de pagamento é conferida contra a lista fechada antes de virar assinatura", () => {
  const corpo = corpoDaFuncao(CODIGO_DA_TELA, "assinarModulo");
  verdade(corpo.length > 80, `corpoDaFuncao devolveu ${corpo.length} caracteres — varredura cega`);
  verdade(/FORMAS_DE_PAGAMENTO_VALIDAS[\s\S]{0,80}\.includes\(formaDePagamento\)/.test(corpo),
    "assinarModulo deixou de conferir a forma de pagamento contra a lista fechada");
  const posChecagem = corpo.search(/FORMAS_DE_PAGAMENTO_VALIDAS/);
  const posAssinatura = corpo.indexOf("assinarModuloDeCampanhas(");
  verdade(posChecagem >= 0 && posAssinatura >= 0 && posChecagem < posAssinatura,
    "a conferência da forma de pagamento precisa vir ANTES de criar a assinatura");
  // A lista tem de ser exatamente as três formas que a especificação §2 nomeia.
  const lista = CODIGO_DA_TELA.slice(CODIGO_DA_TELA.indexOf("FORMAS_DE_PAGAMENTO_VALIDAS"));
  for (const forma of ["BOLETO", "PIX_QRCODE", "PIX_AUTOMATICO"]) {
    verdade(lista.slice(0, 200).includes(forma), `a forma de pagamento ${forma} sumiu da lista fechada`);
  }
});

resumo("varredura das ações da tela do módulo de campanhas (Frente D)");
