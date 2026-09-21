import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { assistantTools } from "@/lib/assistantTools";

// ============================================================================
// F6 — AS SETE FERRAMENTAS, VARRIDAS CONTRA AS TRÊS REGRAS QUE VALEM ACIMA DE TUDO.
//
//   1. SÓ LEITURA — nenhuma ferramenta escreve, atualiza ou apaga nada.
//   2. A REGRA INEXORÁVEL DO FINANCEIRO — dinheiro só para quem tem acesso ao financeiro do
//      escritório (e indicador só para sócio).
//   3. MULTI-TENANT — toda consulta nova filtra por officeId.
//
// As duas armadilhas de varredura já conhecidas nesta casa (ver lib/testes/executar.ts):
// comentário que cita a trava e satisfaz a busca por ela, e janela que transborda para a função
// vizinha. Por isso: `codigoDe` antes de procurar qualquer coisa, e `corpoDaFuncao` (que já isola
// só a função em questão) em vez de `readFileSync` + `includes` cru no arquivo inteiro quando o
// alvo é UMA função específica.
// ============================================================================

const RAIZ = process.cwd();
const FONTE_TOOLS = readFileSync(join(RAIZ, "lib", "assistantTools.ts"), "utf8");
const FONTE_ROTA_ASSISTENTE = readFileSync(join(RAIZ, "app", "api", "assistente", "route.ts"), "utf8");
const FONTE_ROTA_AGENTE = readFileSync(join(RAIZ, "app", "api", "agente", "ferramentas", "route.ts"), "utf8");

const VERBOS_DE_ESCRITA = [".create(", ".update(", ".upsert(", ".delete(", ".deleteMany(", ".updateMany(", ".createMany(", "$executeRaw"];

// As sete funções que executam as ferramentas do F6 (buscar_cliente já existia — foi ESTENDIDA,
// não recriada, por isso reaparece aqui como "a que ganhou um poder novo").
const FUNCOES_NOVAS_OU_ESTENDIDAS = [
  "executarConsultarEquipe",
  "executarConsultarPendencias",
  "executarConsultarDocumentos",
  "executarConsultarTarefas",
  "executarConsultarAssessorias",
  "executarHistoricoCliente",
  "executarBuscarCliente",
];

// ── Regra 3: MULTI-TENANT ────────────────────────────────────────────────────────────────────

for (const nome of FUNCOES_NOVAS_OU_ESTENDIDAS) {
  teste(`${nome}: a varredura encontra a função de verdade`, () => {
    const corpo = corpoDaFuncao(FONTE_TOOLS, nome);
    // Sem isto, um `corpoDaFuncao` que devolvesse "" faria toda checagem de ausência abaixo
    // passar verde sem examinar nada — a armadilha nº 2 do enunciado, ao contrário.
    verdade(corpo.length > 100, `corpoDaFuncao("${nome}") devolveu ${corpo.length} caracteres`);
  });

  teste(`${nome}: toda consulta filtra por officeId`, () => {
    const corpo = corpoDaFuncao(FONTE_TOOLS, nome);
    // NÃO BASTA "contém officeId em algum lugar": a ASSINATURA da função já contém a palavra (é
    // o nome do parâmetro — "officeId: string"), e um `void officeId;` solto (ou um comentário,
    // se codigoDe não tivesse sido usado) também contém a palavra sem filtrar coisa nenhuma. As
    // duas são a mesma classe de erro que o enunciado avisa: "corpoDaFuncao devolve algo, mas não
    // o que se pensa" — aqui, "a função MENCIONA officeId" não é o mesmo que "a função FILTRA por
    // officeId".
    //
    // A prova real: remove a ASSINATURA (primeira linha, que sempre tem "officeId: string") e
    // exige que o `officeId` sobrevivente apareça como CHAVE de objeto — seguido de vírgula,
    // dois-pontos ou chave de fechamento (`{ officeId, ... }`, `{ officeId: x }`, `{ ...outro,
    // officeId }`) — nunca solto num `void officeId;` ou qualquer outra referência de fachada.
    const corpoDoCorpo = codigoDe(corpo).slice(codigoDe(corpo).indexOf("{") + 1);
    const usoComoChave = /\bofficeId\s*[,:}]/.test(corpoDoCorpo);
    verdade(usoComoChave, `${nome}: officeId não aparece como chave de filtro (só na assinatura, ou solto sem uso real)`);
  });
}

// ── Regra 1: SÓ LEITURA ──────────────────────────────────────────────────────────────────────

teste("nenhuma das sete funções novas/estendidas chama um verbo de escrita", () => {
  for (const nome of FUNCOES_NOVAS_OU_ESTENDIDAS) {
    const corpo = corpoDaFuncao(FONTE_TOOLS, nome);
    for (const verbo of VERBOS_DE_ESCRITA) {
      verdade(!corpo.includes(verbo), `${nome} contém "${verbo}"`);
    }
  }
});

teste("o ARQUIVO INTEIRO de ferramentas do assistente não chama verbo de escrita nenhum", () => {
  // Mais amplo que o teste acima de propósito: cobre também as ferramentas que já existiam antes
  // do F6, e qualquer ferramenta futura que alguém acrescente sem passar por este arquivo de
  // teste — se ela escrever, este teste primeiro.
  const semComentarios = codigoDe(FONTE_TOOLS);
  for (const verbo of VERBOS_DE_ESCRITA) {
    verdade(!semComentarios.includes(verbo), `lib/assistantTools.ts contém "${verbo}"`);
  }
});

// ── O catálogo: as sete ferramentas estão registradas, com o módulo certo ───────────────────────

const NOMES_ESPERADOS = [
  "consultar_equipe",
  "buscar_cliente",
  "consultar_pendencias",
  "consultar_documentos",
  "consultar_tarefas",
  "consultar_assessorias",
  "consultar_historico_cliente",
];

teste("as sete ferramentas do F6 estão registradas em assistantTools", () => {
  const nomesRegistrados = assistantTools.map((t) => t.spec.name);
  for (const nome of NOMES_ESPERADOS) {
    verdade(nomesRegistrados.includes(nome), `"${nome}" não está registrada em assistantTools`);
  }
});

teste("histórico do cliente e assessorias NÃO são módulo 'financeiro' — a régua é interna, não a porta inteira", () => {
  // Se um dia alguém marcar `modulo: "financeiro"` nelas por engano, a ferramenta some da lista
  // de quem não tem acesso — e ela some JUNTO o histórico inteiro (processos, atendimentos,
  // tarefas, documentos), que não é dinheiro nenhum. A régua tem de cortar só o bloco de valores,
  // por dentro da função — nunca a ferramenta inteira.
  const historico = assistantTools.find((t) => t.spec.name === "consultar_historico_cliente");
  const assessorias = assistantTools.find((t) => t.spec.name === "consultar_assessorias");
  verdade(!!historico, "consultar_historico_cliente não está registrada");
  verdade(!!assessorias, "consultar_assessorias não está registrada");
  igual(historico?.modulo !== "financeiro", true);
  igual(assessorias?.modulo !== "financeiro", true);
});

teste("a ferramenta de equipe não é módulo financeiro nem carrega nível", () => {
  const equipe = assistantTools.find((t) => t.spec.name === "consultar_equipe");
  verdade(!!equipe, "consultar_equipe não está registrada");
  igual(equipe?.modulo, "equipe");
  igual(equipe?.nivel, undefined);
});

// ── Regra 2, no ponto exato onde ela pode vazar: o bloco de dinheiro POR DENTRO de uma
// ferramenta que não é do financeiro ──────────────────────────────────────────────────────────

teste("consultar_assessorias só devolve a mensalidade através do portão valoresOuOmissao", () => {
  const corpo = corpoDaFuncao(FONTE_TOOLS, "executarConsultarAssessorias");
  verdade(corpo.includes("valoresOuOmissao(quem,"), "assessorias não usa o portão valoresOuOmissao");
  // A mensalidade (monthlyFee) só pode aparecer DENTRO da chamada ao portão — nunca solta em
  // outro campo do mesmo objeto, o que a devolveria a QUALQUER pessoa que use a ferramenta.
  const antesDoPortao = corpo.split("valoresOuOmissao(quem,")[0];
  verdade(!antesDoPortao.includes("monthlyFee"), "monthlyFee aparece fora (antes) do portão financeiro");
});

teste("consultar_historico_cliente só devolve os agregados financeiros através de valoresOuOmissao", () => {
  const corpo = corpoDaFuncao(FONTE_TOOLS, "executarHistoricoCliente");
  const ocorrencias = corpo.split("valoresOuOmissao(quem,").length - 1;
  // As DUAS metades (quem pode ver / quem não pode) passam pelo MESMO portão — nunca um caminho
  // que devolve o valor cru e outro que decide sozinho como omitir (dois portões divergem cedo
  // ou tarde; ver o comentário sobre "porta inteira" acima).
  verdade(ocorrencias >= 2, `esperava 2+ chamadas a valoresOuOmissao(quem, ..., achei ${ocorrencias}`);
  verdade(corpo.includes('podeVerNivel("registro", quem)'), "não usa podeVerNivel(\"registro\", quem) para decidir se consulta o banco");
});

teste("o histórico do cliente nunca devolve estimatedValue do atendimento (dinheiro fora da régua)", () => {
  const corpo = corpoDaFuncao(FONTE_TOOLS, "executarHistoricoCliente");
  verdade(!/\bestimatedValue\b/.test(corpo), "executarHistoricoCliente menciona estimatedValue");
});

// executarHistoricoCliente consulta SEIS tabelas (client, case, attendance, task, attachment,
// receivable, payable) — muita coisa para um "contém officeId em algum lugar" só provar. Um teste
// genérico de presença (como o de cima, para as outras seis funções) passaria verde mesmo que
// UMA das seis consultas perdesse o filtro, contanto que as outras cinco continuassem com ele —
// foi exatamente o que uma mutação real revelou aqui: a consulta de Payable perdeu officeId
// sozinha, e um teste que só pedia "pelo menos uma ocorrência na função inteira" não notou.
// Por isso cada âncora de consulta é conferida SEPARADAMENTE, na sua própria janela de texto.
teste("CADA consulta do histórico do cliente — as seis tabelas — filtra por officeId, uma por uma", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_TOOLS, "executarHistoricoCliente"));
  verdade(corpo.length > 1000, "corpoDaFuncao não achou o corpo de executarHistoricoCliente");

  // Âncoras com filtro INLINE — cada uma tem de carregar `officeId` na própria janela.
  const ancorasComFiltroInline = [
    "prisma.client.findMany({",
    "prisma.case.count({",
    "prisma.case.findMany({",
    "prisma.attendance.count({",
    "prisma.attendance.findMany({",
    "prisma.receivable.aggregate({",
    "prisma.receivable.count({",
    "prisma.payable.aggregate({",
    "prisma.payable.count({",
    // A declaração do filtro COMPARTILHADO por task e attachment — se ELA perder o officeId, as
    // quatro consultas que a usam (abaixo) perdem junto, mesmo citando o nome da variável.
    "const filtroTarefasEDocumentos = {",
  ];

  for (const ancora of ancorasComFiltroInline) {
    const i = corpo.indexOf(ancora);
    verdade(i >= 0, `âncora "${ancora}" não encontrada em executarHistoricoCliente — a consulta mudou de forma?`);
    const janela = corpo.slice(i, i + ancora.length + 260);
    verdade(/\bofficeId\s*[,:}]/.test(janela), `"${ancora}" não carrega officeId como filtro na própria janela`);
  }

  // As QUATRO consultas que usam o filtro compartilhado — task/attachment × count/findMany —
  // têm de estar usando ESSE MESMO filtro, e não um outro `where` inline sem ele.
  for (const ancora of ["prisma.task.count({", "prisma.task.findMany({", "prisma.attachment.count({", "prisma.attachment.findMany({"]) {
    const i = corpo.indexOf(ancora);
    verdade(i >= 0, `âncora "${ancora}" não encontrada em executarHistoricoCliente`);
    const janela = corpo.slice(i, i + ancora.length + 60);
    verdade(janela.includes("filtroTarefasEDocumentos"), `"${ancora}" não usa o filtro filtroTarefasEDocumentos (perdeu o recorte por officeId)`);
  }
});

// ── AMOSTRA NÃO É UNIVERSO (a regra do topo do arquivo assistantTools.ts) também vale aqui ──────

teste("as quatro listas do histórico do cliente relatam o TOTAL real do banco, não o tamanho da amostra", () => {
  // O mesmo defeito que já custou caro nesta casa: "total: resumo.length" tem cara de resposta e
  // é a contagem da PÁGINA, não do universo. Cada lista do histórico tem sua própria contagem
  // (totalProcessos, totalAtendimentos, totalTarefas, totalDocumentos) — `total:` na resposta tem
  // de referenciar ESSAS variáveis, nunca `.length` de uma lista que já veio cortada em 20.
  const corpo = codigoDe(corpoDaFuncao(FONTE_TOOLS, "executarHistoricoCliente"));
  for (const [rotulo, variavelTotal] of [
    ["processos", "totalProcessos"],
    ["atendimentos", "totalAtendimentos"],
    ["tarefas", "totalTarefas"],
    ["documentos", "totalDocumentos"],
  ]) {
    verdade(
      new RegExp(`total:\\s*${variavelTotal}\\b`).test(corpo),
      `a lista de ${rotulo} não usa "total: ${variavelTotal}" — pode estar usando o tamanho da amostra`,
    );
  }
});

// ── A régua chega até quem executa: as DUAS rotas passam financeiro/admin no ctx ───────────────

teste("a rota do Hermes (agente/ferramentas) passa financeiro e admin para ferramenta.executar", () => {
  const corpo = corpoDaFuncao(FONTE_ROTA_AGENTE, "POST");
  verdade(corpo.length > 200, "corpoDaFuncao não achou o POST da rota do agente");
  verdade(corpo.includes("ferramenta.executar("), "a rota do agente não chama ferramenta.executar");
  const chamada = corpo.slice(corpo.indexOf("ferramenta.executar("));
  verdade(chamada.includes("financeiro: permissao.financeiro"), "a rota do agente não repassa 'financeiro' da credencial");
  verdade(chamada.includes("admin: permissao.admin"), "a rota do agente não repassa 'admin' da credencial");
});

teste("a rota da reserva (assistente) passa financeiro e admin para tool.executar", () => {
  const corpo = corpoDaFuncao(FONTE_ROTA_ASSISTENTE, "POST");
  verdade(corpo.length > 500, "corpoDaFuncao não achou o POST da rota do assistente");
  verdade(corpo.includes("tool.executar("), "a rota da reserva não chama tool.executar");
  const chamada = corpo.slice(corpo.indexOf("tool.executar("));
  verdade(chamada.includes("financeiro: quemPergunta.financeiro"), "a rota da reserva não repassa 'financeiro'");
  verdade(chamada.includes("admin: quemPergunta.admin"), "a rota da reserva não repassa 'admin'");
});

// ── O gatilho que já vazou antes nesta casa: a reserva (Claude direto) tinha um portão a menos
// que o Hermes para o nível "indicador" — corrigido nesta entrega. Provado aqui para nunca
// regredir sozinho. ──────────────────────────────────────────────────────────────────────────

teste("a lista de ferramentas da reserva usa podeVerNivel — não só o módulo — para filtrar", () => {
  const corpo = corpoDaFuncao(FONTE_ROTA_ASSISTENTE, "POST");
  verdade(
    corpo.includes('podeVerNivel(tool.nivel ?? "indicador", quemPergunta)'),
    "a rota da reserva voltou a filtrar só por módulo — consultar_indicadores vazaria para quem tem financeAccess sem ser sócio",
  );
});

void resumo("F6 — sete ferramentas");
