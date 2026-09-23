import type { PermissaoDaPergunta } from "@/lib/agenteCredencial";
import { podeVerNivel } from "@/lib/nivelFinanceiro";
import { assistantTools, type AssistantTool } from "@/lib/assistantTools";

// ============================================================================
// A REGRA DE ACESSO ÀS FERRAMENTAS DO AGENTE — UMA SÓ FONTE DE VERDADE.
//
// Isto morava dentro de app/api/agente/ferramentas/route.ts, e foi extraído para cá quando nasceu
// o SEGUNDO lugar que decide a mesma coisa: a rota MCP (app/api/agente/mcp/route.ts), que o Hermes
// passou a falar diretamente. Duas cópias da mesma regra divergem no primeiro dia em que alguém
// mexer numa só — e a divergência é muda: nada quebra, nenhum teste avisa, um escritório
// simplesmente vê pela porta nova o que a porta velha já negava. Por isso as DUAS rotas importam
// `liberada` e `FERRAMENTAS_DO_PETICIONAMENTO` DAQUI, e nenhuma delas escreve a regra de novo.
//
// O restante do raciocínio (por que a parede do escopo vem antes da régua do financeiro, por que
// a lista é branca e nunca negra, por que cada ferramenta de fora ficou de fora) está escrito no
// comentário de `liberada`, abaixo — não duplicado aqui.
// ============================================================================

// ── A PAREDE POR ESCOPO (peticionamento) ────────────────────────────────────────────────────
//
// UMA MINUTA NÃO PRECISA DO ESCRITÓRIO INTEIRO. O agente de peticionamento recebe uma credencial
// de vida longa (até 900s+ — ver EscopoDaCredencial e lib/hermesPonte.ts:TETO_DA_PONTE_S) porque
// uma geração pode legitimamente demorar; e é exatamente por ela viver tanto que o que ela
// alcança tem de ser o MÍNIMO que redigir uma peça exige, não o catálogo inteiro do chat.
//
// LISTA BRANCA, NUNCA NEGRA. Uma ferramenta nova nasce FORA do peticionamento por padrão — quem
// criar a próxima ferramenta do escritório não precisa lembrar de excluí-la daqui; precisa decidir
// INCLUI-LA, e essa decisão é o preço de dar a uma minuta acesso a algo novo. O esquecimento
// custa um chamado de suporte ("por que a minuta não vê X"), nunca um vazamento — o MESMO
// princípio que este arquivo já aplica ao financeiro ausente (ver `liberada`, abaixo).
//
// AS SETE, e por que cada módulo de fora ficou de fora:
//
//   consultar_perfil_do_escritorio  — quem é o escritório, útil para o cabeçalho/qualificação da peça.
//   consultar_processos             — os processos vinculados à sessão, insumo direto de fatos.
//   consultar_atendimento           — o atendimento de origem, mesmo motivo.
//   buscar_cliente                  — identificar/qualificar a parte.
//   consultar_historico_cliente     — histórico do cliente (a régua financeira interna dele
//                                     continua valendo — ver lib/nivelFinanceiro.ts).
//   consultar_documentos            — os documentos do vínculo, para citar o que já existe no caso.
//   consultar_assessorias           — contexto de assessoria continuada, quando a peça nasce dali.
//
//   financeiro, indicadores   — FORA: dinheiro não é insumo de peça. Uma minuta não cobra nem
//                               presta contas; se algum dia precisar citar valor de causa, ele já
//                               vem do questionário, não de uma consulta ao caixa do escritório.
//   equipe, agenda, tarefas,
//   pendências, publicações  — FORA: não são insumo de REDAÇÃO — são gestão interna do escritório
//                               (quem trabalha, quando, o que falta fazer, o que chegou por
//                               publicação). Se um dia uma dessas entrar como insumo de peça,
//                               entra por DECISÃO — mexendo nesta lista — nunca por esquecimento.
export const FERRAMENTAS_DO_PETICIONAMENTO: ReadonlySet<string> = new Set([
  "consultar_perfil_do_escritorio",
  "consultar_processos",
  "consultar_atendimento",
  "buscar_cliente",
  "consultar_historico_cliente",
  "consultar_documentos",
  "consultar_assessorias",
]);

/**
 * A instrução de COMO MOSTRAR o resultado, e por que ela viaja com o dado.
 *
 * Ela é devolvida junto de CADA consulta — na resposta REST e no `content` de cada `tools/call`
 * do MCP —, e não só no prompt do perfil do Hermes. Um prompt mora na máquina do agente e pode
 * ser reescrito, esquecido ou trocado quando o perfil for recriado; isto chega junto de cada
 * consulta, e por isso não se perde. É o que faz o agente devolver um processo clicável em vez de
 * um número para o advogado copiar e procurar na busca.
 */
export const COMO_MOSTRAR =
  "Cada item traz um campo `link` para a tela do Lúmen. Ao citar um item, escreva-o como link " +
  "markdown — [número do processo](/processos/abc123) — para a pessoa clicar e ir direto. Nunca " +
  "invente um link: use exatamente o que veio no campo `link`.";

/**
 * Esta pessoa pode usar esta ferramenta?
 *
 * UMA função, usada pelos QUATRO lugares que decidem: a execução e o catálogo de CADA rota (REST
 * em app/api/agente/ferramentas/route.ts, e MCP em app/api/agente/mcp/route.ts). Uma trava que só
 * existe nalguns deles não é uma trava — e o catálogo é o mais fácil de esquecer, porque ele não
 * "executa" nada. Mas um catálogo que anuncia `consultar_indicadores` a quem não é sócio já
 * contou metade: diz que existe um número de margem, e convida a tentar.
 */
export function liberada(ferramenta: AssistantTool, permissao: PermissaoDaPergunta): boolean {
  // A PAREDE DO ESCOPO PRIMEIRO. Uma credencial de peticionamento só alcança a lista branca —
  // nunca "a lista branca, ou o financeiro se a pessoa tiver acesso": as duas travas são
  // independentes e NENHUMA substitui a outra (ver o cabeçalho desta seção). Escopo "conversa"
  // atravessa esta linha sem restrição — é o comportamento de sempre, provado pela suíte.
  if (permissao.escopo === "peticionamento" && !FERRAMENTAS_DO_PETICIONAMENTO.has(ferramenta.spec.name)) {
    return false;
  }
  // A REGRA DO FINANCEIRO, DEPOIS — e vale para os dois escopos: uma ferramenta financeira que por
  // engano entrasse na lista branca acima ainda seria barrada aqui, para quem não tem acesso ao
  // financeiro do escritório. Defesa em duas camadas, não uma.
  if (ferramenta.modulo !== "financeiro") return true;
  return podeVerNivel(ferramenta.nivel ?? "indicador", permissao);
}

/**
 * A lista do que esta credencial pode usar. Serve ao agente para se orientar — e serve a quem lê
 * um erro, para entender por que a ferramenta pedida não estava ali. Usada pelo 400/404 da rota
 * REST, pelo `tools/list` do MCP e por `nomesDisponiveis` de cada rota — a MESMA derivação de
 * `liberada`, e não um filtro escrito de novo.
 */
export function nomesDisponiveis(permissao: PermissaoDaPergunta): string[] {
  return assistantTools.filter((t: AssistantTool) => liberada(t, permissao)).map((t) => t.spec.name);
}
