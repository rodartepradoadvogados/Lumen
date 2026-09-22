import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  somaEstimadaOuOmissao,
  somaEstimadaAgregadaOuOmissao,
  valorEstimadoIndividual,
  MOTIVO_SOMA_ESTIMADA_OMITIDA,
  AVISO_AO_AGENTE_NAO_SOMAR,
} from "@/lib/valorEstimado";

// ============================================================================
// VALOR ESTIMADO DE ATENDIMENTO — registro de UM, indicador da SOMA.
//
// A decisão do dono (opção B): o valor de um atendimento continua visível para quem já enxerga
// aquele atendimento — não passa por régua de administrador. A SOMA de vários é indicador
// (projeção de receita futura) e só aparece para administrador; para os demais vem omitida, com
// o motivo por escrito — nunca em silêncio, nunca como R$ 0,00.
//
// O bug original tinha DUAS pontas, e este arquivo prova as duas: a Triagem somava e mostrava o
// total a qualquer um que abrisse o quadro; e o assistente estava inconsistente consigo mesmo —
// uma ferramenta devolvia `estimatedValue`, outra o excluía de propósito. As duas viram a mesma
// régua.
// ============================================================================

// ── `somaEstimadaOuOmissao` (soma em memória) ────────────────────────────────────────────────

teste("administrador vê a soma real, ignorando valores nulos/inválidos", () => {
  const r = somaEstimadaOuOmissao([1000, null, 2500, undefined, NaN, 500], { isAdmin: true });
  igual(r, { omitido: false, total: 4000, quantidade: 3 });
});

teste("não administrador recebe omissão falante, nunca a soma nem zero", () => {
  const r = somaEstimadaOuOmissao([1000, 2500, 500], { isAdmin: false }) as { omitido: true; motivo: string };
  igual(r.omitido, true);
  igual(r.motivo, MOTIVO_SOMA_ESTIMADA_OMITIDA);
  verdade(r.motivo.trim().length > 10, "a omissão saiu sem motivo de verdade");
  verdade(!("total" in r), "a omissão vazou o total mesmo estando marcada como omitida");
});

teste("lista vazia soma zero para admin — zero é resultado válido, não é omissão", () => {
  igual(somaEstimadaOuOmissao([], { isAdmin: true }), { omitido: false, total: 0, quantidade: 0 });
});

teste("não-admin é omitido mesmo com lista vazia — a régua nunca olha os valores antes do perfil", () => {
  igual(somaEstimadaOuOmissao([], { isAdmin: false }), { omitido: true, motivo: MOTIVO_SOMA_ESTIMADA_OMITIDA });
});

// ── `somaEstimadaAgregadaOuOmissao` (soma já calculada no banco) ─────────────────────────────

teste("agregado do banco também obedece à régua: admin vê, o resto é omitido", () => {
  igual(somaEstimadaAgregadaOuOmissao({ total: 9000, quantidade: 4 }, { isAdmin: true }), {
    omitido: false,
    total: 9000,
    quantidade: 4,
  });
  igual(somaEstimadaAgregadaOuOmissao({ total: 9000, quantidade: 4 }, { isAdmin: false }), {
    omitido: true,
    motivo: MOTIVO_SOMA_ESTIMADA_OMITIDA,
  });
});

teste("agregado ausente (agregação nem rodou) também é omitido, nunca vira zero disfarçado", () => {
  igual(somaEstimadaAgregadaOuOmissao(null, { isAdmin: false }), { omitido: true, motivo: MOTIVO_SOMA_ESTIMADA_OMITIDA });
});

// ── `valorEstimadoIndividual` — nunca passa por régua de admin ───────────────────────────────

teste("valor individual é normalizado, mas nunca gated por administrador", () => {
  igual(valorEstimadoIndividual(1500), 1500);
  igual(valorEstimadoIndividual(0), 0);
  igual(valorEstimadoIndividual(null), null);
  igual(valorEstimadoIndividual(undefined), null);
  igual(valorEstimadoIndividual(NaN), null);
});

// ── A TRIAGEM: o total da coluna some para quem não é administrador, com aviso ───────────────

teste("QuadroDoFunil calcula a soma da coluna pela régua, não por reduce cru", () => {
  const fonte = codigoDe(readFileSync("components/atendimento/QuadroDoFunil.tsx", "utf8"));
  verdade(fonte.includes("somaEstimadaOuOmissao("), "o quadro parou de usar a régua de valor estimado");
  verdade(!/\.reduce\(\(acc, c\) => acc \+ \(c\.estimatedValue/.test(fonte), "o quadro voltou a somar estimatedValue direto com reduce");
  // `{ isAdmin }` abreviado, não uma constante: a régua tem de receber o `isAdmin` de verdade que
  // chegou por prop, nunca `{ isAdmin: true }` (que abriria a soma para todo mundo).
  verdade(/somaEstimadaOuOmissao\(\s*doEstagio\.map\(\(c\) => c\.estimatedValue\),\s*\{\s*isAdmin\s*\}/.test(fonte), "a chamada parou de repassar o isAdmin de verdade (virou uma constante cravada)");
});

teste("QuadroDoFunil nunca mostra R$ 0,00 no lugar do total omitido, e diz que omitiu", () => {
  const corpo = corpoDaFuncao(readFileSync("components/atendimento/QuadroDoFunil.tsx", "utf8"), "QuadroDoFunil");
  verdade(corpo.length > 200, "corpoDaFuncao não achou QuadroDoFunil");
  const semComentarios = codigoDe(corpo);
  // A CONDIÇÃO TEM DE COMEÇAR EXATAMENTE ASSIM — não `{false && somaEstimada.omitido...}` nem
  // qualquer outro guarda-extra na frente, que deixaria o aviso escrito no arquivo e nunca na
  // tela (a mesma armadilha, já vista nesta casa, da recusa de Perdido que existia no código e
  // nunca chegava ao navegador).
  verdade(semComentarios.includes("{somaEstimada.omitido &&"), "o aviso de omissão ganhou uma guarda extra e pode nunca renderizar");
  verdade(semComentarios.includes("só para administrador"), "a coluna deixou de avisar que a soma é restrita a administrador");
});

teste("a Triagem recebe `isAdmin` de quem está logado, não de um valor cravado", () => {
  const pagina = codigoDe(readFileSync("app/(app)/atendimento/funil/page.tsx", "utf8"));
  verdade(/<QuadroDoFunil[\s\S]{0,120}isAdmin=\{Boolean\(viewer\.isAdmin\)\}/.test(pagina), "a página parou de repassar isAdmin do usuário logado ao quadro");
});

// ── RELATÓRIOS: a mesma régua na seção "Funil Comercial" ─────────────────────────────────────

teste("a seção Funil dos Relatórios também usa a régua, não soma estimatedValue cru", () => {
  const fonte = codigoDe(readFileSync("app/(app)/relatorios/page.tsx", "utf8"));
  verdade(fonte.includes("somaEstimadaOuOmissao("), "a seção de relatórios parou de usar a régua de valor estimado");
  verdade(!/\.reduce\(\(x, a\) => x \+ \(a\.estimatedValue/.test(fonte), "os relatórios voltaram a somar estimatedValue direto com reduce");
  // O PERFIL TEM DE SER O DE VERDADE, não uma constante cravada: `{ isAdmin }` (abreviado) é o
  // único jeito de garantir que quem chama a régua é o `isAdmin` que veio de `viewer`, e não um
  // `{ isAdmin: true }` esquecido de um teste manual que faria a soma aparecer para todo mundo.
  verdade(fonte.includes("somaEstimadaOuOmissao(items.map((a) => a.estimatedValue), { isAdmin })"), "a chamada parou de repassar o isAdmin de verdade (virou uma constante cravada)");
  verdade(/<FunilSection[\s\S]{0,150}isAdmin=\{Boolean\(viewer\.isAdmin\)\}/.test(fonte), "a página de relatórios parou de repassar isAdmin do usuário logado à seção Funil");
});

// ── O AGENTE: nunca soma por conta própria, e a régua é a mesma nas duas ferramentas ─────────

teste("consultar_atendimento devolve o valor individual e um total já gated (nunca soma no `resumo`)", () => {
  const corpo = corpoDaFuncao(readFileSync("lib/assistantTools.ts", "utf8"), "executarConsultarAtendimento");
  verdade(corpo.length > 200, "corpoDaFuncao não achou executarConsultarAtendimento");
  const semComentarios = codigoDe(corpo);
  verdade(semComentarios.includes("valorEstimadoIndividual(a.estimatedValue)"), "o item individual parou de usar a régua de valor estimado");
  verdade(semComentarios.includes("somaEstimadaAgregadaOuOmissao("), "a ferramenta parou de calcular o total pela régua");
  // A soma do universo, nunca da amostra de 20 — o mesmo aviso que vale para `total`/`mostrados`.
  verdade(semComentarios.includes("prisma.attendance.aggregate("), "a ferramenta deixou de agregar no banco e arrisca somar só a amostra");
});

teste("consultar_historico_cliente não exclui mais o valor estimado do atendimento — é registro, não indicador", () => {
  const corpo = corpoDaFuncao(readFileSync("lib/assistantTools.ts", "utf8"), "executarHistoricoCliente");
  verdade(corpo.length > 200, "corpoDaFuncao não achou executarHistoricoCliente");
  const semComentarios = codigoDe(corpo);
  verdade(semComentarios.includes("estimatedValue: true"), "o select de atendimentos voltou a excluir estimatedValue");
  verdade(semComentarios.includes("valorEstimadoIndividual(a.estimatedValue)"), "o histórico do cliente parou de expor o valor individual pela régua");
});

teste("as duas ferramentas usam a MESMA régua — não duas funções que podem divergir", () => {
  const fonte = codigoDe(readFileSync("lib/assistantTools.ts", "utf8"));
  const ocorrencias = (fonte.match(/from "@\/lib\/valorEstimado"/g) || []).length;
  verdade(ocorrencias === 1, "lib/assistantTools.ts importa lib/valorEstimado mais de uma vez — sinal de régua duplicada");
});

// ── ACHADOS DA SUPERVISÃO ────────────────────────────────────────────────────────────────────

teste("agregação que NÃO rodou nunca vira R$ 0,00 — nem para administrador", () => {
  // O caso que faltava: administrador (portanto com direito ao total) + agregação ausente.
  // Trocar a guarda por `agregado?.total ?? 0` passava verde e mostrava "R$ 0,00" a um
  // administrador como se fosse um total de verdade. "Não sei" e "é zero" são respostas
  // diferentes, e confundi-las aqui é dizer ao sócio que o funil não vale nada.
  const r = somaEstimadaAgregadaOuOmissao(null, { isAdmin: true });
  igual(r.omitido, true, "administrador com agregação ausente deveria receber omissão, não zero — ");
});

teste("o motivo da omissão EXPLICA — mensagem vaga é tão ruim quanto silêncio", () => {
  // Trocar o motivo por "Indisponível." passava verde. Quem lê "Indisponível" abre chamado;
  // quem lê a frase inteira entende que não é defeito, é régua.
  for (const palavra of ["projeção", "indicador", "administrador"]) {
    verdade(MOTIVO_SOMA_ESTIMADA_OMITIDA.toLowerCase().includes(palavra.toLowerCase()),
      `o motivo da omissão não diz "${palavra}"`);
  }
});

teste("TRAVA: a proibição de o AGENTE somar por conta própria viaja junto com a omissão", () => {
  // A régua trava o SISTEMA de somar. Mas a ferramenta devolve até vinte valores individuais —
  // cada um legítimo por si — e nada impede o agente de somá-los e apresentar o total a quem não
  // é administrador. Numa tela isso exigiria somar à mão, card por card; para o agente é de
  // graça. Por isso a instrução acompanha o dado que ele lê.
  verdade(AVISO_AO_AGENTE_NAO_SOMAR.includes(MOTIVO_SOMA_ESTIMADA_OMITIDA.slice(0, 40)),
    "o aviso ao agente perdeu o motivo original da omissão");
  verdade(/[Nn]ão some/.test(AVISO_AO_AGENTE_NAO_SOMAR), "o aviso ao agente deixou de proibir a soma por conta própria");
  verdade(/administrador/i.test(AVISO_AO_AGENTE_NAO_SOMAR), "o aviso não diz ao agente o que responder se pedirem o total");

  const fonte = codigoDe(readFileSync("lib/assistantTools.ts", "utf8"));
  verdade(fonte.includes("AVISO_AO_AGENTE_NAO_SOMAR"),
    "a ferramenta parou de mandar o aviso junto com a omissão — a régua volta a valer só para o sistema");
});


resumo("Valor estimado — registro do card, indicador da soma");
