import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatarEquipe, CHAVES_DO_ITEM_EQUIPE, type LinhaEquipeBruta } from "@/lib/equipeFormato";

// ============================================================================
// A TRAVA DA EQUIPE, PROVADA — nome, função e escala, e mais nada.
//
// Decisão expressa do dono: "a ferramenta de equipe NUNCA devolve telefone nem e-mail de
// ninguém". Este arquivo prova as DUAS metades da trava: a função pura (aqui, em memória, sem
// banco) e a consulta que a alimenta (por varredura de código-fonte, mais abaixo).
// ============================================================================

// Uma linha "contaminada" — como se um `include` tivesse trazido o User inteiro por engano. É
// EXATAMENTE o cenário que a trava existe para cobrir: a entrada chega suja, a saída sai limpa.
function linhaContaminada(over: Partial<LinhaEquipeBruta> = {}): LinhaEquipeBruta {
  return {
    name: "Fulana de Tal",
    role: "Advogada",
    recebeTransferencia: true,
    phone: "62999998888",
    phoneDdi: "55",
    email: "fulana@escritorio.com.br",
    passwordHash: "$2a$10$segredo-de-mentira",
    cpf: "00000000000",
    address: "Rua Sem Nome, 123",
    ...over,
  };
}

teste("as três chaves, e só elas, saem da função", () => {
  const [item] = formatarEquipe([linhaContaminada()]);
  igual(Object.keys(item).sort(), [...CHAVES_DO_ITEM_EQUIPE].sort());
});

teste("telefone e e-mail NUNCA atravessam, mesmo vindo na entrada", () => {
  const linha = linhaContaminada({ phone: "62999998888", email: "fulana@escritorio.com.br" });
  const [item] = formatarEquipe([linha]);
  const serializado = JSON.stringify(item);
  verdade(!serializado.includes("62999998888"), "o telefone vazou no item formatado");
  verdade(!serializado.includes("fulana@escritorio.com.br"), "o e-mail vazou no item formatado");
  verdade(!serializado.includes("passwordHash") && !serializado.includes("segredo-de-mentira"), "o hash de senha vazou");
  verdade(!serializado.includes("00000000000"), "o CPF vazou");
});

teste("nome, função e escala passam intactos", () => {
  const [item] = formatarEquipe([linhaContaminada({ name: "Rodrigo", role: "Sócio", recebeTransferencia: true })]);
  igual(item, { nome: "Rodrigo", funcao: "Sócio", escala: true });
});

teste("escala fora da lista/da rotação sai false", () => {
  const [item] = formatarEquipe([linhaContaminada({ recebeTransferencia: false })]);
  igual(item.escala, false);
});

teste("um valor 'quase verdadeiro' de escala não conta como estar na escala", () => {
  for (const valor of [1, "true", "sim", {}, [], "1"]) {
    const [item] = formatarEquipe([linhaContaminada({ recebeTransferencia: valor as unknown as boolean })]);
    igual(item.escala, false, `recebeTransferencia=${JSON.stringify(valor)}: `);
  }
});

teste("função ausente ou vazia vira um rótulo explícito, nunca string vazia", () => {
  for (const role of [null, "", "   "]) {
    const [item] = formatarEquipe([linhaContaminada({ role })]);
    igual(item.funcao, "Sem função definida", `role=${JSON.stringify(role)}: `);
    verdade(item.funcao.length > 0, "função saiu vazia");
  }
});

teste("função com espaço nas pontas sai aparada", () => {
  const [item] = formatarEquipe([linhaContaminada({ role: "  Advogado  " })]);
  igual(item.funcao, "Advogado");
});

teste("lista vazia devolve lista vazia, sem explodir", () => {
  igual(formatarEquipe([]), []);
});

teste("várias pessoas mantêm a ordem e cada uma só com suas três chaves", () => {
  const linhas = [
    linhaContaminada({ name: "A", role: "Advogado", recebeTransferencia: true }),
    linhaContaminada({ name: "B", role: "Estagiário", recebeTransferencia: false }),
  ];
  const itens = formatarEquipe(linhas);
  igual(itens, [
    { nome: "A", funcao: "Advogado", escala: true },
    { nome: "B", funcao: "Estagiário", escala: false },
  ]);
});

// ── A VARREDURA: a consulta que alimenta a função pura também não pede o que não pode sair ──────
//
// A função pura acima prova que o campo não SAI. Isto aqui prova que a consulta ao banco também
// não PEDE — as duas travas, cada uma no seu papel (ver o comentário de topo de
// lib/equipeFormato.ts sobre por que uma segunda trava existe mesmo com a primeira no lugar).

const FONTE = readFileSync(join(process.cwd(), "lib", "assistantTools.ts"), "utf8");

teste("a varredura acha a função de verdade (senão ela passaria vazia sempre)", () => {
  const corpo = corpoDaFuncao(FONTE, "executarConsultarEquipe");
  // Limite baixo o bastante para pegar uma função vazia por engano, alto o bastante para não
  // acusar uma função real e pequena — ver o AVISO de corpoDaFuncao sobre nunca confiar às cegas.
  verdade(corpo.length > 200, `corpoDaFuncao devolveu ${corpo.length} caracteres — varredura vazia passaria sempre`);
});

teste("a consulta de equipe não pede telefone nem e-mail ao banco", () => {
  const corpo = corpoDaFuncao(FONTE, "executarConsultarEquipe");
  // Fronteira de palavra: "telephoneDdi" ou "emailSendProvider" não deveriam existir aqui, mas se
  // existissem um dia não podem passar por `includes` de prefixo — ver o aviso do enunciado sobre
  // XSufixo.
  verdade(!/\bphone\b/i.test(codigoDe(corpo)), "a consulta de equipe menciona 'phone'");
  verdade(!/\bemail\b/i.test(codigoDe(corpo)), "a consulta de equipe menciona 'email'");
});

teste("a ferramenta de equipe filtra por officeId", () => {
  const corpo = corpoDaFuncao(FONTE, "executarConsultarEquipe");
  verdade(corpo.includes("officeId"), "a consulta de equipe perdeu o filtro por officeId");
});

teste("a ferramenta de equipe não escreve no banco", () => {
  const corpo = corpoDaFuncao(FONTE, "executarConsultarEquipe");
  for (const verbo of [".create(", ".update(", ".upsert(", ".delete(", ".deleteMany(", ".updateMany(", ".createMany(", "$executeRaw"]) {
    verdade(!corpo.includes(verbo), `a ferramenta de equipe chama ${verbo}`);
  }
});

void teste("a consulta da equipe tem select EXPLÍCITO — a trava nº 1 não pode se apagar em silêncio", () => {
  // Achado por mutação na revisão. Tirar a linha do `select` inteira deixava a suíte VERDE: sem
  // ela o Prisma devolve TODOS os campos escalares do User — telefone, e-mail, CPF, endereço e o
  // hash de senha — e o registro inteiro passa a trafegar até a memória do processo.
  //
  // Nada vazava para o agente, porque a trava nº 2 (formatarEquipe) descarta o que não conhece, e
  // é exatamente para isso que ela existe. Mas defesa em profundidade só é profunda enquanto as
  // duas camadas estão de pé: com a primeira apagada, a segunda vira a única, e ninguém fica
  // sabendo. O comentário do código chama aquela linha de "TRAVA Nº 1" — este caso é o que faz o
  // nome ser verdade.
  const fonte = codigoDe(readFileSync("lib/assistantTools.ts", "utf8"));
  const i = fonte.indexOf('name: "consultar_equipe"');
  verdade(i > 0, "a ferramenta de equipe sumiu");

  // A consulta fica ANTES da definição da ferramenta no arquivo; pega-se o trecho do executor.
  const inicio = fonte.lastIndexOf("prisma.user.findMany(", i) >= 0
    ? fonte.lastIndexOf("prisma.user.findMany(", i)
    : fonte.indexOf("prisma.user.findMany(");
  verdade(inicio > 0, "a consulta da equipe sumiu");
  const consulta = fonte.slice(inicio, inicio + 400);

  verdade(/select:\s*\{[^}]*name:\s*true/.test(consulta),
    "a consulta da equipe perdeu o select explícito — o Prisma passa a devolver o User inteiro, com telefone, e-mail e hash de senha");
  verdade(/recebeTransferencia:\s*true/.test(consulta), "a escala saiu do select da equipe");
  verdade(!/include:/.test(consulta), "a consulta da equipe passou a usar include");
  // E os campos proibidos não podem ser pedidos nem por engano.
  for (const proibido of ["phone", "email", "passwordHash", "cpf"]) {
    verdade(!new RegExp(`${proibido}:\\s*true`).test(consulta),
      `a consulta da equipe passou a pedir ${proibido} ao banco`);
  }
});

resumo("formatação da equipe");
