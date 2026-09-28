import { teste, igual, verdade, resumo } from "./executar";
import { valoresOuOmissao, podeVerNivel, MOTIVO_OMISSAO_FINANCEIRA, type QuemPergunta } from "@/lib/nivelFinanceiro";

// ============================================================================
// O CORTE DENTRO DE UMA FERRAMENTA QUE NÃO É, INTEIRA, DO FINANCEIRO.
//
// consultar_historico_cliente e consultar_assessorias não são ferramentas do módulo "financeiro"
// — são oferecidas a todo mundo —, mas carregam um BLOCO de dinheiro por dentro. `valoresOuOmissao`
// é o portão desse bloco, e é ele que garante a regra do dono (Q15): quem não tem acesso ao
// financeiro recebe o resto da ferramenta inteiro, só que SEM o valor — e a resposta tem de DIZER
// que omitiu. As duas falhas que este arquivo existe para impedir: (1) mostrar o valor a quem não
// pode ver, e (2) omitir o valor SEM avisar — um objeto vazio ou ausente que o agente confunda com
// "não há dinheiro no caso".
// ============================================================================

const SOCIO: QuemPergunta = { financeiro: true, admin: true };
const FINANCEIRO: QuemPergunta = { financeiro: true, admin: false };
const NADA: QuemPergunta = { financeiro: false, admin: false };
const SOCIO_SEM_FINANCEIRO: QuemPergunta = { financeiro: false, admin: true };

const VALORES = { mensalidade: 1500 };

teste("quem tem acesso ao financeiro recebe os valores de verdade — sócio ou não", () => {
  igual(valoresOuOmissao(SOCIO, VALORES), VALORES);
  igual(valoresOuOmissao(FINANCEIRO, VALORES), VALORES);
});

teste("quem NÃO tem acesso ao financeiro nunca recebe o valor, nem sendo sócio", () => {
  // O caso que mais importa: sócio ao qual alguém removeu o acesso ao financeiro por engano na
  // tela de Equipe. `admin: true` sozinho não abre esta porta.
  const r1 = valoresOuOmissao(NADA, VALORES);
  const r2 = valoresOuOmissao(SOCIO_SEM_FINANCEIRO, VALORES);
  verdade(JSON.stringify(r1) !== JSON.stringify(VALORES), "NADA recebeu os valores de verdade");
  verdade(JSON.stringify(r2) !== JSON.stringify(VALORES), "sócio sem financeiro recebeu os valores de verdade");
});

teste("a omissão é FALANTE: sempre `omitido: true` com um motivo não vazio", () => {
  for (const quem of [NADA, SOCIO_SEM_FINANCEIRO]) {
    const r = valoresOuOmissao(quem, VALORES) as { omitido: true; motivo: string };
    igual(r.omitido, true);
    verdade(typeof r.motivo === "string" && r.motivo.trim().length > 0, "a omissão saiu sem motivo");
  }
});

teste("a omissão nunca é um objeto vazio nem ausente — isso pareceria 'não há dinheiro'", () => {
  const r = valoresOuOmissao(NADA, VALORES);
  verdade(r !== undefined && r !== null, "a omissão veio ausente");
  verdade(Object.keys(r as object).length > 0, "a omissão veio vazia");
  verdade("omitido" in (r as object), "a omissão não tem a marca `omitido`");
});

teste("o motivo é sempre a mesma frase publicada — auditável, não reinventada a cada chamada", () => {
  const r = valoresOuOmissao(NADA, VALORES) as { omitido: true; motivo: string };
  igual(r.motivo, MOTIVO_OMISSAO_FINANCEIRA);
  verdade(r.motivo.toLowerCase().includes("financeiro"), "o motivo não menciona financeiro");
});

teste("nunca precisa de admin: registro é sempre de quem tem financeiro, sócio ou não", () => {
  // A régua do histórico do cliente é 100% REGISTRO (Q15: "somar o que já está lançado") — nunca
  // vira indicador, então `admin` não deveria influenciar em nada este portão.
  igual(valoresOuOmissao(FINANCEIRO, VALORES), valoresOuOmissao(SOCIO, VALORES));
  igual(podeVerNivel("registro", FINANCEIRO), true);
});

teste("valores que já vêm zerados continuam sendo valores, não viram omissão por acidente", () => {
  // Um cliente sem nenhum lançamento tem soma zero — e zero é um REGISTRO válido, não ausência
  // de acesso. Confundir os dois faria "não tem nada lançado" parecer "não pode ver".
  igual(valoresOuOmissao(FINANCEIRO, { soma: 0, quantidade: 0 }), { soma: 0, quantidade: 0 });
});

void resumo("valores ou omissão");
