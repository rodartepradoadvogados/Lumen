import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import {
  EIXOS,
  EIXOS_DE_RECUSA,
  criteriosDoEixo,
  podeRecusarSozinha,
  temValorMinimo,
  conferirCriterio,
  conferirValorMinimo,
  conferirDiasDoDocumento,
  valorLegivel,
  prazoDoDocumento,
  textoDosParametros,
  TAMANHO_MAXIMO_DO_CRITERIO,
  type ParametrosDaAna,
} from "@/lib/parametrosDaAna";

// ============================================================================
// OS PARÂMETROS DE RECUSA DA ANA.
//
// O que este arquivo existe para impedir é uma coisa só, e ela é grave: uma máquina dizendo a uma
// pessoa de verdade que o escritório não vai pegar o caso dela, fora das situações em que o dono
// autorizou. Três eixos são contorno do escritório (matéria, comarca, valor) e a Ana encerra neles
// sozinha; documento NÃO é recusa, é espera com data; e fora disso ela só propõe.
// ============================================================================

const vazio: ParametrosDaAna = { valorMinimoDaCausa: null, diasParaODocumento: 15, criterios: [] };
const com = (p: Partial<ParametrosDaAna>): ParametrosDaAna => ({ ...vazio, ...p });
const criterio = (eixo: string, valor: string, ordem = 0) => ({ id: `${eixo}-${valor}`, eixo, valor, ordem });

// ── O QUE AUTORIZA A ANA ────────────────────────────────────────────────────

teste("escritório que não escreveu nada não recusa ninguém pela Ana", () => {
  // O ato consciente que autoriza a máquina a dizer não em nome do escritório é o escritório TER
  // ESCRITO o que não aceita. Nenhum padrão da plataforma entra aqui.
  igual(podeRecusarSozinha(vazio), false);
  igual(textoDosParametros(vazio)?.includes("[[RECUSAR:"), false);
});

teste("documento sozinho NÃO autoriza recusa nenhuma", () => {
  // Pedir papel é pedir, não é dizer não. Um escritório que preencheu só a lista de documentos
  // não autorizou a Ana a encerrar caso nenhum.
  const so_documento = com({ criterios: [criterio("DOCUMENTO", "carteira de trabalho")] });
  igual(podeRecusarSozinha(so_documento), false);
  verdade(!EIXOS_DE_RECUSA.includes("DOCUMENTO" as never), "DOCUMENTO virou eixo de recusa");
  igual(EIXOS_DE_RECUSA, ["MATERIA", "COMARCA"]);
  igual(EIXOS, ["MATERIA", "COMARCA", "DOCUMENTO"]);
});

teste("um contorno escrito basta, e cada um dos três basta sozinho", () => {
  igual(podeRecusarSozinha(com({ criterios: [criterio("MATERIA", "criminal")] })), true);
  igual(podeRecusarSozinha(com({ criterios: [criterio("COMARCA", "Manaus")] })), true);
  igual(podeRecusarSozinha(com({ valorMinimoDaCausa: 1_500_000 })), true);
});

teste("valor mínimo zero é 'não uso este critério', não 'aceito causa de zero real'", () => {
  // Um escritório que nunca abriu esta tela não pode passar a recusar por um piso que ninguém
  // escolheu. Nulo e zero são a mesma coisa aqui, e nenhum dos dois autoriza recusa.
  igual(temValorMinimo(com({ valorMinimoDaCausa: 0 })), false);
  igual(temValorMinimo(com({ valorMinimoDaCausa: null })), false);
  igual(temValorMinimo(com({ valorMinimoDaCausa: 1 })), true);
  igual(podeRecusarSozinha(com({ valorMinimoDaCausa: 0 })), false);
});

// ── O QUE SE DIGITA ─────────────────────────────────────────────────────────

teste("o critério é uma linha, não um parágrafo", () => {
  // Este texto entra no pedido que a Ana lê. Três parágrafos de política colados aqui fariam o
  // contorno competir em volume com os limites duros.
  igual(conferirCriterio("  trabalhista  "), { ok: true, valor: "trabalhista" });
  igual(conferirCriterio("direito   do   trabalho"), { ok: true, valor: "direito do trabalho" });
  igual(conferirCriterio("").ok, false);
  igual(conferirCriterio("   ").ok, false);
  igual(conferirCriterio("x".repeat(TAMANHO_MAXIMO_DO_CRITERIO)).ok, true);
  igual(conferirCriterio("x".repeat(TAMANHO_MAXIMO_DO_CRITERIO + 1)).ok, false);
});

teste("repetido não entra — nem com acento nem com caixa diferente", () => {
  // A mesma matéria duas vezes faz a Ana ler o contorno em dobro e a lista parecer maior do que a
  // decisão que ela guarda.
  igual(conferirCriterio("Trabalhista", ["trabalhista"]).ok, false);
  igual(conferirCriterio("inventário", ["Inventario"]).ok, false);
  igual(conferirCriterio("previdenciário", ["trabalhista"]).ok, true);
});

teste("o valor é digitado como brasileiro digita dinheiro", () => {
  // Um campo que só aceita um formato faz o escritório errar o piso por uma vírgula.
  igual(conferirValorMinimo("15.000,00"), { ok: true, valor: 1_500_000 });
  igual(conferirValorMinimo("15000"), { ok: true, valor: 1_500_000 });
  igual(conferirValorMinimo("R$ 15.000"), { ok: true, valor: 1_500_000 });
  igual(conferirValorMinimo("1.500"), { ok: true, valor: 150_000 }); // mil e quinhentos, não 1,50
  igual(conferirValorMinimo("1,50"), { ok: true, valor: 150 });
  // Vazio é "não uso este critério" — e precisa ser NULO, não zero.
  igual(conferirValorMinimo(""), { ok: true, valor: null });
  igual(conferirValorMinimo("0"), { ok: true, valor: null });
  igual(conferirValorMinimo("quinze mil").ok, false);
  igual(conferirValorMinimo("15,000.00").ok, false);
});

teste("a espera do documento tem piso e teto", () => {
  igual(conferirDiasDoDocumento("15"), { ok: true, valor: 15 });
  igual(conferirDiasDoDocumento(1), { ok: true, valor: 1 });
  igual(conferirDiasDoDocumento("0").ok, false);
  igual(conferirDiasDoDocumento("-3").ok, false);
  igual(conferirDiasDoDocumento("2,5").ok, false);
  igual(conferirDiasDoDocumento("365").ok, false);
});

teste("o prazo do documento é em dias corridos, e vira o mês sozinho", () => {
  igual(prazoDoDocumento(new Date("2026-09-20T12:00:00Z"), 15).toISOString().slice(0, 10), "2026-10-05");
  igual(prazoDoDocumento(new Date("2026-02-20T12:00:00Z"), 15).toISOString().slice(0, 10), "2026-03-07");
  igual(valorLegivel(1_500_000).replace(/ /g, " "), "R$ 15.000,00");
  igual(valorLegivel(null), "sem piso");
  igual(valorLegivel(0), "sem piso");
});

// ── O QUE A ANA LÊ ──────────────────────────────────────────────────────────

teste("eixo vazio não vira título vazio no pedido", () => {
  // Um bloco com "AS MATÉRIAS QUE ESTE ESCRITÓRIO NÃO ACEITA:" e nada abaixo convida um agente
  // prestativo a preencher a lacuna com o que ele imagina que o escritório não aceita.
  const t = textoDosParametros(com({ criterios: [criterio("MATERIA", "criminal")] }))!;
  verdade(t.includes("criminal"), "a matéria escrita não chegou ao pedido");
  verdade(!t.includes("COMARCAS FORA DO ALCANCE"), "título de comarca apareceu com a lista vazia");
  verdade(!t.includes("VALOR MÍNIMO DE CAUSA"), "título de valor apareceu sem piso");
  verdade(!t.includes("DOCUMENTOS SEM OS QUAIS"), "título de documento apareceu com a lista vazia");
});

teste("a trava do 'fora disso você só propõe' entra SEMPRE, inclusive sem contorno nenhum", () => {
  // Sem ela, um agente que leu "encerre quando for trabalhista" generaliza para "encerre quando
  // parecer ruim". É a frase mais importante do bloco, e é a única que não depende do que o
  // escritório escreveu.
  for (const p of [vazio, com({ criterios: [criterio("MATERIA", "criminal")] }), com({ valorMinimoDaCausa: 1000 })]) {
    const t = textoDosParametros(p)!;
    verdade(t.includes("[[PROPOR_RECUSA]]"), "a proposta sumiu do pedido");
    verdade(t.includes("VOCÊ NÃO ENCERRA NENHUM CASO"), "a trava do caso não óbvio sumiu");
  }
});

teste("a recusa é sobre o ESCRITÓRIO, nunca sobre o caso da pessoa", () => {
  // O limite duro que não pode ser contornado nem para recusar: "não atuamos nessa área" é
  // contorno; "o seu caso não tem chance" é mérito, e mérito é ato de advogado.
  const t = textoDosParametros(vazio)!;
  verdade(t.includes("sempre sobre o escritório") || t.includes("SEMPRE sobre o escritório"),
    "a Ana perdeu a instrução de não falar do mérito ao recusar");
});

teste("documento manda ESPERAR, e diz com todas as letras que não é recusa", () => {
  const t = textoDosParametros(com({ criterios: [criterio("DOCUMENTO", "carteira de trabalho")], diasParaODocumento: 20 }))!;
  verdade(t.includes("[[AGUARDAR_DOCUMENTO]]"), "falta a marca de espera");
  verdade(t.includes("NÃO É RECUSA"), "a espera não está dita como não-recusa");
  verdade(t.includes("20 dias"), "a data da espera não chegou ao pedido");
  // E a lista de documentos não pode gerar marca de recusa.
  verdade(!/\[\[RECUSAR:DOCUMENTO\]\]/.test(t), "documento virou marca de recusa");
});

teste("o valor proíbe a Ana de estimar o que a pessoa não disse", () => {
  // "Parece uma causa pequena" não é um valor dito pela pessoa — é palpite, e palpite sobre valor
  // de causa é mérito.
  const t = textoDosParametros(com({ valorMinimoDaCausa: 1_500_000 }))!;
  verdade(t.includes("a própria pessoa disser"), "a Ana pode concluir o valor sozinha");
  verdade(t.includes("NÃO estime o valor você"), "falta a proibição de estimar");
});

teste("os critérios saem na ordem em que o escritório os pôs", () => {
  const p = com({
    criterios: [criterio("MATERIA", "segundo", 2), criterio("MATERIA", "primeiro", 1), criterio("COMARCA", "outro", 0)],
  });
  igual(criteriosDoEixo(p, "MATERIA").map((c) => c.valor), ["primeiro", "segundo"]);
  igual(criteriosDoEixo(p, "COMARCA").map((c) => c.valor), ["outro"]);
  igual(criteriosDoEixo(p, "DOCUMENTO"), []);
});

// ── A VARREDURA ─────────────────────────────────────────────────────────────

teste("nada aqui revoga os limites duros do agente", () => {
  // Os limites duros (não fecha contrato, não dá solução, não promete resultado) entram no pedido
  // ANTES de qualquer texto de escritório. Se um dia os parâmetros passarem na frente deles, um
  // escritório entusiasmado poderia autorizar a Ana a dizer o que ela nunca pode dizer.
  const agente = codigoDe(readFileSync("lib/agenteAtendimento.ts", "utf8"));
  const posLimites = agente.indexOf("LIMITES_DUROS.map");
  const posParametros = agente.indexOf("parametros");
  verdade(posLimites > 0, "os limites duros sumiram do pedido");
  if (posParametros > 0) {
    verdade(posLimites < posParametros, "os parâmetros do escritório passaram na frente dos limites duros");
  }
});

teste("ler os parâmetros NÃO cria linha no banco", () => {
  // Um escritório que só abriu Configurações para olhar não pode passar a ter configuração
  // própria. É o mesmo perigo do catálogo de motivos, e é o tipo de defeito que não dá erro: a
  // linha nasce, e o escritório fica preso a uma cópia dos padrões que ninguém pediu.
  const acoes = codigoDe(readFileSync("lib/actions/parametrosDaAna.ts", "utf8"));
  // O fim é a PRÓXIMA função exportada, e não um comentário de seção: `codigoDe` tira os
  // comentários, então um marcador comentado devolve -1 e a fatia engole o arquivo inteiro — foi
  // o que aconteceu na primeira escrita deste caso, e o teste acusou gravação onde não havia.
  const inicio = acoes.indexOf("export async function lerParametros");
  const depois = acoes.indexOf("export async function", inicio + 10);
  const leitura = acoes.slice(inicio, depois > 0 ? depois : undefined);
  verdade(leitura.length > 0, "lerParametros sumiu");
  for (const escrita of ["create(", "upsert(", "update(", "createMany", "deleteMany"]) {
    verdade(!leitura.includes(escrita), `lerParametros passou a gravar: ${escrita}`);
  }
});

teste("toda escrita passa por administrador do escritório", () => {
  // O que se escreve aqui autoriza uma máquina a encerrar o atendimento de uma pessoa de verdade
  // em nome do escritório. Quem assume isso é quem responde pelo escritório.
  const acoes = codigoDe(readFileSync("lib/actions/parametrosDaAna.ts", "utf8"));
  for (const fn of ["salvarPiso", "acrescentarCriterio", "removerCriterio"]) {
    const i = acoes.indexOf(`export async function ${fn}(`);
    verdade(i > 0, `${fn} sumiu`);
    const corpo = acoes.slice(i, i + 400);
    verdade(corpo.includes("await administrador()"), `${fn} grava sem conferir quem é`);
  }
  verdade(/if \(!viewer.isAdmin\)/.test(acoes), "a porta de administrador sumiu");
});

teste("remover confere o escritório, e não só o id", () => {
  // Sem o officeId no where, um id chutado apagaria o critério de OUTRO escritório — e a Ana de lá
  // passaria a aceitar o que o escritório recusava, sem ninguém saber.
  const acoes = codigoDe(readFileSync("lib/actions/parametrosDaAna.ts", "utf8"));
  const i = acoes.indexOf("export async function removerCriterio");
  const corpo = acoes.slice(i, acoes.indexOf("export async function listarParametros"));
  verdade(/deleteMany\(\{ where: \{ id, officeId:/.test(corpo), "remover apaga por id sem conferir o escritório");
});

teste("nenhum padrão da plataforma entra nos parâmetros", () => {
  // Diferente do catálogo de motivos, que tem dois andares. Uma matéria "não aceita" vinda de
  // fábrica faria um escritório recusar causas que ele aceita, sem ninguém ter escrito nada.
  const acoes = codigoDe(readFileSync("lib/actions/parametrosDaAna.ts", "utf8"));
  verdade(!/officeId: null/.test(acoes), "apareceu camada de plataforma nos parâmetros");
  const modelo = readFileSync("prisma/schema.prisma", "utf8");
  const bloco = modelo.slice(modelo.indexOf("model CriterioDeRecusa"), modelo.indexOf("model CriterioDeRecusa") + 700);
  verdade(/officeId String\n/.test(bloco) || /officeId String$/m.test(bloco.split("\n").find((l) => l.includes("officeId String")) || ""),
    "o critério passou a aceitar escritório nulo (padrão de fábrica)");
  verdade(!bloco.includes("officeId String?"), "o critério passou a aceitar escritório nulo (padrão de fábrica)");
});

resumo("Parâmetros de recusa da Ana");
