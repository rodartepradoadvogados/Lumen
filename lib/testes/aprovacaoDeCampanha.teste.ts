import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { podeAprovarCampanha, PAPEIS_QUE_APROVAM_CAMPANHA, MOTIVO_PAPEL_SEM_APROVACAO } from "@/lib/aprovacaoDeCampanha";

// QUEM LIBERA CAMPANHA PAGA. A especificação §6.4 dizia "qualquer login do painel mestre, sem
// papel granular"; o dono revisou depois de ver a tela pronta e nomeou quatro papéis. Ficam de
// fora Suporte N1 e Engenharia — quem entra no painel para atender chamado ou investigar defeito
// não decide sobre cobrança de cliente.

teste("os quatro papéis nomeados pelo dono aprovam", () => {
  igual(podeAprovarCampanha("SOCIO"), true);
  igual(podeAprovarCampanha("FINANCEIRO"), true);
  igual(podeAprovarCampanha("COMERCIAL"), true);
  igual(podeAprovarCampanha("MARKETING"), true);
});

teste("HARD GATE: Suporte N1 e Engenharia NÃO aprovam", () => {
  igual(podeAprovarCampanha("SUPORTE_N1"), false);
  igual(podeAprovarCampanha("ENGENHARIA"), false);
});

teste("FAIL-CLOSED: papel vazio, nulo, desconhecido ou inventado nunca aprova", () => {
  for (const papel of [null, undefined, "", "   ", "ESTAGIARIO", "ADMIN", "SOCIO_JUNIOR", "SOCI"]) {
    igual(podeAprovarCampanha(papel), false, `aceitou indevidamente "${String(papel)}" — `);
  }
});

teste("o papel é normalizado (espaço e caixa) antes de comparar — o banco guarda texto livre", () => {
  igual(podeAprovarCampanha("  socio  "), true);
  igual(podeAprovarCampanha("Financeiro"), true);
  igual(podeAprovarCampanha("mArKeTiNg"), true);
});

teste("a lista tem exatamente os quatro papéis — nem um a mais entra sem alguém vir aqui de propósito", () => {
  igual(PAPEIS_QUE_APROVAM_CAMPANHA.length, 4);
  // Um papel NOVO criado amanhã no painel começa sem poder liberar cobrança. É a ordem certa
  // para uma decisão sobre dinheiro: incluir é um ato deliberado, não um efeito colateral.
  igual(podeAprovarCampanha("PAPEL_NOVO_CRIADO_AMANHA"), false);
});

// ── A TRAVA QUE VALE É A DO SERVIDOR ────────────────────────────────────────────────────────
// Esconder o botão não impede ninguém de chamar a Server Action direto. Por isso a checagem tem
// de estar na ação, e ANTES de qualquer escrita.

const CODIGO_DA_ACAO = codigoDe(readFileSync("lib/actions/campanhasPainelMestre.ts", "utf8"));

teste("TRAVA: a ação de liberar campanha confere o papel antes de devolver quem aprovou", () => {
  const corpo = corpoDaFuncao(CODIGO_DA_ACAO, "platformMemberIdDeQuemClicou");
  verdade(corpo.length > 80, `corpoDaFuncao devolveu ${corpo.length} caracteres — varredura cega`);
  verdade(/podeAprovarCampanha\(membro\.roleKey\)/.test(corpo), "a ação deixou de conferir o papel de quem clicou");
  const posTrava = corpo.indexOf("podeAprovarCampanha");
  const posDevolve = corpo.indexOf("return { id: membro.id }");
  verdade(posTrava >= 0 && posDevolve >= 0 && posTrava < posDevolve,
    "a conferência de papel precisa vir ANTES de devolver o id de quem aprovou");
  // Conferir e seguir em frente é o mesmo que não conferir.
  verdade(/if \(!podeAprovarCampanha\(membro\.roleKey\)\) return \{ erro:/.test(corpo),
    "o veredito do papel precisa interromper, não só ser calculado");
});

teste("a tela esconde o botão, mas NUNCA a informação nem o motivo", () => {
  const tela = codigoDe(readFileSync("components/painelMestre/SolicitacoesDeCampanhaPainel.tsx", "utf8"));
  verdade(tela.includes("podeDecidir"), "a tela não recebe mais a informação de quem pode decidir");
  verdade(/Sem permissão para decidir/.test(tela), "sumiu o aviso que explica por que os botões não aparecem");
  const pagina = codigoDe(readFileSync("app/painel-mestre/campanhas/page.tsx", "utf8"));
  verdade(/podeAprovarCampanha\(/.test(pagina), "a página deixou de calcular quem pode decidir");
  verdade(/acesso\.isOwner \|\| podeAprovarCampanha/.test(pagina),
    "o dono da plataforma precisa decidir sempre, mesmo sem linha espelhada em Equipe");
  verdade(pagina.includes("MOTIVO_PAPEL_SEM_APROVACAO"), "a página não mostra o motivo a quem não pode decidir");
});

teste("o motivo é uma frase que nomeia os quatro papéis — mensagem vaga vira chamado de suporte", () => {
  for (const papel of ["Comercial", "Marketing", "Financeiro", "Sócio"]) {
    verdade(MOTIVO_PAPEL_SEM_APROVACAO.includes(papel), `o motivo não cita "${papel}"`);
  }
});

resumo("quem libera campanha paga");
