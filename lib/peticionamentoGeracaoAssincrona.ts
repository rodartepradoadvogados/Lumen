// ============================================================================================
// A GERAÇÃO DA MINUTA, FORA DA REQUISIÇÃO WEB.
//
// O DEFEITO REAL, com número de produção. O dono gerou uma minuta com dois documentos (uma
// decisão judicial em PDF e um parecer em DOCX). O registro da VPS:
//
//   subprocess.TimeoutExpired: Command '['/usr/local/bin/hermes', '-p', 'peticionamento-lumen',
//   'chat', ...]' timed out after 240 seconds
//   BrokenPipeError: [Errno 32] Broken pipe
//
// O Hermes passou de 240s SEM TERMINAR e foi MORTO. O Lúmen já havia desistido aos 230s — daí o
// cano quebrado quando a ponte tentou responder. O advogado leu "Não foi possível gerar a minuta:
// DEMORA: o Hermes não respondeu em 230s", e todo o trabalho (e o custo das chamadas de modelo)
// se perdeu.
//
// POR QUE "AUMENTAR OS TEMPOS" NÃO É CONSERTO. A corrente era Lúmen 230s < ponte 240s < nginx
// 280s < Vercel 300s, e **o teto duro é a Vercel: 300 segundos**. Nenhuma função da plataforma
// passa disso. Subir os números só empurra o mesmo corte para mais perto do teto — e uma peça a
// partir de um processo de dezenas de páginas pode legitimamente precisar de mais do que 300s.
// Limitar o agente para caber numa requisição HTTP é limitar a QUALIDADE do trabalho ao tempo de
// um cano de rede.
//
// O DESENHO, então, é o MESMO que esta casa já usa para todo trabalho que não cabe no pedido que
// o disparou — lib/transcricaoAssincrona.ts (áudio do WhatsApp) e lib/avisoFigurinha.ts:
//
//   1. `confirmarTriagemEGerar` monta a mensagem, aplica TODAS as travas de sempre, DISPARA a
//      geração na ponte (`POST /chat-async`), grava o identificador da tarefa na sessão e volta
//      NA HORA. A sessão fica em GERANDO.
//   2. A TELA acompanha (components/peticionamento/GerandoClient.tsx), perguntando de tempos em
//      tempos; quando fica pronta, a minuta é gravada e o advogado segue o caminho de sempre.
//   3. A REDE DE SEGURANÇA POR CRON (app/api/cron/minutas-pendentes) varre o que está em GERANDO
//      além da folga abaixo. É ela que faz a promessa da tela ser VERDADE: uma sessão cujo
//      advogado fechou a aba termina assim mesmo.
//
// A REIVINDICAÇÃO É ATÔMICA, e é o coração deste arquivo: a gravação da minuta é um `updateMany`
// com `status: "GERANDO"` NO PRÓPRIO `where`. Só quem CONSEGUIU MUDAR o estado grava — é o mesmo
// mecanismo de lib/avisoFigurinha.ts. Sem isso, a tela e o cron colhendo a mesma sessão ao mesmo
// tempo gravariam a minuta duas vezes (e rodariam duas vezes a sincronização de citações, que
// apaga e recria linhas de confirmação).
//
// NADA DAS TRAVAS JURÍDICAS PODE SER PULADO NO CAMINHO NOVO — o fecho garantido por código, a
// nota obrigatória e a sincronização de citações são exatamente onde elas moram. Por isso a
// gravação inteira mora numa função só (`gravarMinutaGerada`), usada pelos TRÊS caminhos: a tela,
// o cron e o caminho síncrono de compatibilidade. Um segundo lugar que gravasse minuta seria um
// segundo lugar para esquecer uma delas.
// ============================================================================================

import { prisma } from "@/lib/prisma";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { consultarGeracaoNoHermes, GeracaoPerdidaNaPonte } from "@/lib/hermesPonte";
import { interpretarRespostaHermes } from "@/lib/peticionamentoRespostaHermes";
import { garantirFecho } from "@/lib/peticionamentoFecho";
import { filtrarNotaDeRiscos, comAvisoDeContextoResumido } from "@/lib/peticionamentoRiscos";
import { sincronizarCitacoes } from "@/lib/peticionamentoCitacoesSync";
import { faixaDeGeracao, MEDICOES_CONSIDERADAS, TETO_DA_GERACAO_MS, type FaixaDeGeracao } from "@/lib/peticionamentoTempoDeGeracao";

// O TETO DO TRABALHO (quinze minutos, espelho de HERMES_TIMEOUT_S) mora em
// lib/peticionamentoTempoDeGeracao.ts, que é PURO — a tela de geração é componente de cliente e
// precisa dele para a frase que promete o teto ao advogado; este módulo importa `prisma`, e
// arrastá-lo para o pacote do navegador quebra o build. Reexportado aqui porque é aqui que a ORDEM
// da corrente está escrita e cobrada (teto do trabalho < prazo máximo < validade da tarefa).
export { TETO_DA_GERACAO_MS };

/**
 * Quanto o cron espera antes de olhar para uma sessão em GERANDO.
 *
 * Dá tempo de a TELA colher sozinha, que é o caminho comum e o mais rápido (ela pergunta de
 * poucos em poucos segundos). Sem esta folga, o cron competiria com o advogado que está olhando —
 * de forma inofensiva, graças à reivindicação atômica, mas desperdiçando trabalho em praticamente
 * toda geração.
 *
 * DOIS MINUTOS, e eles continuam dois depois de o teto do trabalho subir para quinze minutos —
 * agora por outro motivo, e o motivo antigo não vale mais. Antes a justificativa era "o trabalho
 * todo cabe em 240s, esperar mais seria esperar mais que a geração inteira". Com o teto em 900s a
 * folga passou a ser MUITO menor que o trabalho, e a conta virou outra:
 *
 *   · o que se ganha mantendo curta: a sessão de aba fechada é colhida na PRIMEIRA varredura
 *     depois de a peça ficar pronta, e não uma rodada de cinco minutos depois;
 *   · o que se paga: enquanto a geração corre, o cron a encontra e pergunta à ponte umas duas ou
 *     três vezes, recebendo "ainda trabalhando". É uma pergunta curta à ponte, não uma chamada de
 *     modelo — e a reivindicação atômica já garante que colher duas vezes é impossível.
 *
 * Aumentar a folga para "não incomodar" trocaria custo nenhum por espera real do advogado.
 */
export const GRACA_ANTES_DO_CRON_MS = 2 * 60_000;

/**
 * Até onde para trás o cron olha. Uma sessão parada em GERANDO há mais de um dia não é
 * "processamento atrasado" — é outra coisa, e a varredura não deve tentá-la a cada cinco minutos
 * para sempre.
 *
 * VINTE E QUATRO HORAS, e não a hora de lib/avisoFigurinha.ts, porque aqui o que fica para trás
 * não é um aviso perdido: é uma TELA PARADA dizendo "gerando" ao advogado. Uma janela curta
 * deixaria sessões plantadas nesse estado para sempre, e a promessa da tela ("pode fechar a aba")
 * viraria mentira justamente no caso em que ela mais importa.
 */
export const JANELA_DE_BUSCA_DO_CRON_MS = 24 * 60 * 60_000;

/**
 * Depois de quanto tempo uma geração é dada por perdida, mesmo que a ponte ainda diga
 * "trabalhando".
 *
 * É a trava contra a espera infinita, e ela fica ACIMA do teto do trabalho (`TETO_DA_GERACAO_MS`,
 * 15 min) de propósito: uma geração que está no seu último minuto legítimo não pode ser declarada
 * perdida por este relógio. Vinte minutos deixam cinco de margem — o bastante para a ponte
 * terminar, para o `--run-budget` fechar o texto e para a varredura do cron (que corre a cada
 * cinco minutos) chegar ao menos uma vez depois de a peça estar pronta.
 *
 * E fica ABAIXO da validade das tarefas na ponte (`HERMES_TAREFA_VALIDADE_S`, 2400s por padrão),
 * para nunca declarar perdida uma tarefa que a ponte ainda tem na mão e ainda vai entregar.
 *
 * A ORDEM É A REGRA, e é ela que a suíte cobra (nunca os números):
 *   folga do cron < TETO_DA_GERACAO_MS < PRAZO_MAXIMO_DA_GERACAO_MS < validade da tarefa na ponte,
 * com a janela de busca do cron cobrindo tudo.
 */
export const PRAZO_MAXIMO_DA_GERACAO_MS = 20 * 60_000;

/**
 * QUANTO ESTA GERAÇÃO LEVOU — ou `null` quando não há como medir.
 *
 * É o número que a tela de geração passa a mostrar em vez de um chute (ver
 * lib/peticionamentoTempoDeGeracao.ts, que faz a estatística, e o contrato de
 * `PeticionamentoSessao.geracaoDuracaoMs` no schema). Mora AQUI porque é o relógio da própria
 * geração: o mesmo `geracaoIniciadaEm` que a rede de segurança por cron usa, lido com a mesma
 * régua de sanidade (`PRAZO_MAXIMO_DA_GERACAO_MS`).
 *
 * DEVOLVER `null` É METADE DO TRABALHO DESTA FUNÇÃO, e os três casos são o motivo de ela existir
 * em vez de uma subtração escrita no meio da gravação:
 *
 *   · SEM `iniciadaEm` (sessão de antes desta entrega, ou relógio perdido): não se chuta a partir
 *     de `updatedAt`. Um número chutado gravado num campo chamado "duração" volta depois como
 *     "medição do escritório" — exatamente a mentira que a medição existe para não contar;
 *   · duração zero ou negativa: relógio do servidor corrigido para trás. Não é medida de nada;
 *   · duração acima do prazo máximo: nenhuma geração legítima passa dali (o Lúmen a teria
 *     declarado perdida). É sessão que ficou plantada e foi colhida muito depois — e ela
 *     envenenaria a mediana do escritório para cima, na direção de assustar o advogado.
 */
export function duracaoDaGeracaoMs(iniciadaEm: Date | null | undefined, terminadaEm: Date): number | null {
  if (!iniciadaEm) return null;
  const ms = terminadaEm.getTime() - iniciadaEm.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  if (ms > PRAZO_MAXIMO_DA_GERACAO_MS) return null;
  return Math.round(ms);
}

/** Quantas sessões o cron colhe por rodada — o resto espera a próxima, sem problema nenhum. */
const MAXIMO_POR_RODADA = 20;

/**
 * A recusa falada de "a geração se perdeu".
 *
 * As tarefas vivem na MEMÓRIA da ponte: um reinício do serviço as apaga todas. Isso é estado
 * possível do mundo, não erro de programação — e o advogado precisa ler uma frase que diga o que
 * aconteceu e o que fazer, nunca um erro cru nem uma tela que gira para sempre.
 */
export const MOTIVO_GERACAO_PERDIDA =
  "A geração se perdeu antes de terminar — o servidor do agente foi reiniciado enquanto ela corria. " +
  "Nada do que você preencheu nesta sessão foi perdido: é só gerar de novo.";

/**
 * A recusa falada de "demorou tanto que não dá mais para esperar".
 *
 * O NÚMERO É DERIVADO do prazo, nunca escrito por extenso ao lado dele. Esta entrega inteira
 * existe porque dois números que deviam andar juntos andaram separados; repetir isso numa frase
 * de tela é o mesmo defeito em miniatura — só que aqui quem lê a mentira é o advogado.
 */
export const MOTIVO_GERACAO_EXPIRADA =
  `A geração passou de ${Math.round(PRAZO_MAXIMO_DA_GERACAO_MS / 60_000)} minutos sem terminar e foi encerrada. ` +
  "Nada do que você preencheu se perdeu — tente gerar de novo; se repetir, selecione menos documentos ou avise o suporte.";

/** Em que pé está a geração de UMA sessão, como a tela e o cron a enxergam. */
export type AndamentoDaGeracao =
  | { estado: "semGeracao" }
  | { estado: "trabalhando"; desdeMs: number }
  | { estado: "pronta" }
  | { estado: "falhou"; motivo: string };

/**
 * Traduz o erro que a PONTE devolveu numa frase que o advogado possa usar.
 *
 * A mesma disciplina do `catch` de `confirmarTriagemEGerar`: o texto cru da ponte ("falha ao
 * executar o Hermes", "o Hermes demorou demais") não diz a ninguém o que fazer, e já chegou cru à
 * tela do dono uma vez. A decisão é pela PROPRIEDADE do erro, e toda frase termina dizendo que a
 * triagem continua salva — porque é verdade, e porque é a informação que tira o susto.
 */
export function motivoFalado(erroDaPonte: string): string {
  const cru = (erroDaPonte || "").trim();
  const fim = " A triagem continua salva: nada do que você preencheu se perdeu.";

  if (/demorou demais|timed out|timeout/i.test(cru)) {
    return (
      "O agente começou a redigir mas não terminou no tempo que o servidor dá a uma geração. " +
      "Selecionar menos documentos, ou dividir a peça em sessões separadas, costuma resolver." +
      fim
    );
  }
  if (/não conhece uma opção|não conhece --|atualize o binário/i.test(cru)) {
    return (
      "O servidor do agente está com uma versão antiga do programa e não entendeu o pedido. " +
      "Isto é conserto de quem cuida do servidor, não do que você preencheu — avise o suporte." + fim
    );
  }
  if (/perfil não provisionado|perfil do escritório não encontrado/i.test(cru)) {
    return (
      "O perfil do agente para peticionamento não está provisionado neste servidor. " +
      "Isto é conserto do suporte, não do que você preencheu — avise-o." + fim
    );
  }
  if (/respondeu vazio/i.test(cru)) {
    return "O agente terminou sem escrever nada. Tente gerar de novo; se repetir, avise o suporte." + fim;
  }
  if (/máximo de gerações|gerações em andamento/i.test(cru)) {
    return (
      "O servidor do agente já está com o máximo de gerações em andamento. " +
      "Espere alguns minutos e tente de novo." + fim
    );
  }
  return (
    "O agente não conseguiu concluir esta geração. Tente de novo; se repetir, avise o suporte." + fim
  );
}

/**
 * A LISTA DE "DOCUMENTOS CONSULTADOS" — a que vai à nota obrigatória, e portanto ao juiz.
 *
 * DUAS MENTIRAS QUE ELA EXISTE PARA NÃO CONTAR, as duas relatadas pelo dono:
 *
 *   · um nome ALUCINADO — o agente declara ter usado um documento que nunca recebeu. Por isso a
 *     declaração é FILTRADA contra `nomesLidos`, que é a lista do que foi de fato lido e enviado;
 *   · "todos os SELECIONADOS" — o comportamento antigo, em que um documento marcado na sessão mas
 *     nunca lido (PDF escaneado sem texto, falha ao baixar do Drive) aparecia como consultado. Por
 *     isso o socorro, quando a declaração vem vazia, é `nomesLidos` — nunca a lista de marcados.
 *
 * É FUNÇÃO PURA de propósito: assim esta régua deixa de ser provada por varredura de código (que
 * prova que ela EXISTE, nunca que ela FUNCIONA) e passa a ser exercitada de verdade em
 * lib/testes/peticionamentoDocumentosConsultados.teste.ts.
 */
export function documentosConsultados(declaradosPeloAgente: string[], nomesLidos: string[]): string[] {
  const validos = declaradosPeloAgente.filter((nome) => nomesLidos.includes(nome));
  return validos.length ? validos : nomesLidos;
}

/**
 * Marca a sessão como falha, REIVINDICANDO-A antes — só quem conseguiu mudar o estado escreve.
 *
 * Devolve `true` quando esta chamada foi a que marcou. `false` significa que outra chegou primeiro
 * (a tela e o cron podem olhar a mesma sessão), e não que deu errado.
 */
async function marcarFalhaDaGeracao(sessaoId: string, motivo: string): Promise<boolean> {
  const marcou = await prisma.peticionamentoSessao.updateMany({
    where: { id: sessaoId, status: "GERANDO" },
    data: {
      status: "FALHA_GERACAO",
      // O MOTIVO FALADO FICA GRAVADO, e é ele que a tela de minuta mostra. Sem isto o advogado
      // leria o parágrafo genérico de "o agente não respondeu", que não diz o que aconteceu nem o
      // que fazer — e o caminho novo teria nascido com o defeito que o antigo levou dois dias
      // para consertar.
      contextoBloqueadoMotivo: motivo,
      // A TAREFA MORRE COM A FALHA. Deixá-la gravada convidaria uma colheita futura a perguntar
      // por uma tarefa que já foi dada por perdida.
      hermesTarefaId: null,
      geracaoIniciadaEm: null,
      geracaoDocumentosLidos: [],
    },
  });
  return marcou.count > 0;
}

/**
 * GRAVA A MINUTA a partir da resposta do agente — o ÚNICO lugar da casa que faz isso.
 *
 * Usado pelos três caminhos (tela, cron e o síncrono de compatibilidade) de propósito: é aqui que
 * moram as travas jurídicas, e um segundo lugar que gravasse minuta seria um segundo lugar para
 * esquecer uma delas —
 *
 *   · `garantirFecho`: o fecho literal é GARANTIDO POR CÓDIGO, nunca confiado ao modelo;
 *   · `filtrarNotaDeRiscos` + `comAvisoDeContextoResumido`: a nota de destaque é obrigatória e
 *     montada pelo SISTEMA, e o aviso de contexto resumido entra nela sempre que houve resumo;
 *   · a declaração do agente sobre quais documentos usou é FILTRADA contra o que foi de fato lido
 *     e enviado (`nomesLidos`) — um nome alucinado nunca entra, e a lista nunca "cai de volta"
 *     para todos os selecionados;
 *   · `sincronizarCitacoes`: a lista de validação uma-a-uma nasce já na primeira geração, nunca
 *     deixando a tela de minuta abrir com a lista vazia.
 *
 * Devolve `true` quando ESTA chamada foi a que gravou. `false` quando outra chegou primeiro — o
 * que não é falha nenhuma: a minuta está lá, gravada por quem venceu a corrida.
 */
export async function gravarMinutaGerada(dados: {
  sessaoId: string;
  officeId: string;
  respostaBruta: string;
  sessaoDoHermes: string;
  /** Os nomes dos documentos que FORAM lidos e enviados nesta geração. */
  nomesLidos: string[];
  contextoResumido: boolean;
  tipoPecaJaEscolhido: string | null;
  hermesSessionIdAnterior: string | null;
  /**
   * Quando esta geração COMEÇOU — o relógio da medição. `null` só nos casos em que não há relógio
   * (sessão de antes da entrega do acompanhamento), e aí a geração fica SEM duração gravada em vez
   * de com uma duração inventada.
   */
  geracaoIniciadaEm: Date | null;
}): Promise<boolean> {
  const agora = new Date();
  const estruturada = interpretarRespostaHermes(dados.respostaBruta);
  const corpoComFecho = garantirFecho(estruturada.corpo);
  const riscosFiltrados = filtrarNotaDeRiscos(estruturada.riscos);
  const riscosComAviso = comAvisoDeContextoResumido(riscosFiltrados.aceitas, dados.contextoResumido);

  // ── A REIVINDICAÇÃO ATÔMICA ───────────────────────────────────────────────────────────────
  //
  // `status: "GERANDO"` está no `where`, e não só no `data`: o banco decide, numa operação só,
  // quem grava. É o mesmo mecanismo de lib/avisoFigurinha.ts, e ele existe aqui pelo mesmo
  // motivo — a tela e o cron podem colher a MESMA sessão no mesmo instante, e gravar duas vezes
  // rodaria duas vezes a sincronização de citações, apagando e recriando linhas de confirmação
  // que o advogado talvez já tivesse assinado.
  //
  // `officeId` no `where` também, como em toda leitura/escrita de sessão desta casa.
  const gravou = await prisma.peticionamentoSessao.updateMany({
    where: { id: dados.sessaoId, officeId: dados.officeId, status: "GERANDO" },
    data: {
      status: "GERADA",
      minutaTexto: corpoComFecho,
      notaRiscos: riscosComAviso,
      jurisprudenciaCitada: estruturada.jurisprudencia as unknown as object,
      documentosBaseConsultados: documentosConsultados(estruturada.documentosUsados, dados.nomesLidos),
      tipoPecaInferido: !dados.tipoPecaJaEscolhido && !!estruturada.tipoPecaInferido,
      tipoPeca: !dados.tipoPecaJaEscolhido && estruturada.tipoPecaInferido ? estruturada.tipoPecaInferido : dados.tipoPecaJaEscolhido,
      hermesSessionId: dados.sessaoDoHermes || dados.hermesSessionIdAnterior,
      geradoEm: agora,
      // A MEDIÇÃO, gravada DENTRO da reivindicação atômica e em nenhum outro lugar.
      //
      // Aqui, e não num segundo `update` depois: quem perde a corrida do `where` não grava minuta,
      // e também não pode gravar duração — duas gravações somariam a mesma geração duas vezes na
      // estatística do escritório (e a segunda mediria até o instante da SEGUNDA colheita, que é
      // mais tarde). Um número medido que conta a mesma coisa duas vezes é um número inventado com
      // etapas extras.
      geracaoDuracaoMs: duracaoDaGeracaoMs(dados.geracaoIniciadaEm, agora),
      // A geração terminou: a tarefa não existe mais do lado da ponte, e não pode ficar aqui
      // convidando uma segunda colheita.
      hermesTarefaId: null,
      geracaoIniciadaEm: null,
      geracaoDocumentosLidos: [],
      // O motivo falado de uma tentativa ANTERIOR não pode sobreviver a uma geração que deu
      // certo: a tela leria a falha de ontem embaixo da minuta de hoje.
      contextoBloqueadoMotivo: null,
    },
  });
  if (gravou.count === 0) return false;

  // Popula a lista de validação de citações já na primeira geração — nunca deixa a tela de minuta
  // abrir com a lista vazia por falta de sincronizar.
  //
  // FORA DA REIVINDICAÇÃO de propósito: se o processo morrer entre uma coisa e outra, a lista
  // nasce vazia — e `listarCitacoesParaValidacao` e `contarCitacoesPendentes` a recalculam na
  // primeira leitura da tela de minuta, então a trava de "li e revisei" não deixa de ser cobrada.
  // Prender as duas numa transação só custaria segurar a conexão durante a sincronização inteira
  // para proteger contra uma janela que já se conserta sozinha.
  await sincronizarCitacoes(dados.sessaoId, dados.officeId);
  return true;
}

/**
 * Olha UMA sessão em GERANDO, pergunta à ponte e grava o que der para gravar.
 *
 * NUNCA ESTOURA por falha de rede: uma ponte momentaneamente fora do ar tem de devolver "ainda
 * trabalhando" (a tela pergunta de novo daqui a pouco), e não uma falha definitiva que jogaria
 * fora uma peça que talvez já esteja pronta do outro lado. Quem fecha esse caminho é o prazo
 * máximo, não uma resposta perdida.
 *
 * Chamada pela tela (através da Server Action `acompanharGeracaoDaMinuta`, que confere acesso e
 * escritório ANTES) e pelo cron (que traz a sessão de uma consulta por status, sem id de cliente
 * no meio).
 */
export async function colherGeracaoDaMinuta(sessaoId: string): Promise<AndamentoDaGeracao> {
  const sessao = await prisma.peticionamentoSessao.findUnique({
    where: { id: sessaoId },
    select: {
      id: true,
      officeId: true,
      status: true,
      hermesTarefaId: true,
      hermesSessionId: true,
      geracaoIniciadaEm: true,
      geracaoDocumentosLidos: true,
      contextoResumoAviso: true,
      contextoBloqueadoMotivo: true,
      tipoPeca: true,
      updatedAt: true,
    },
  });
  if (!sessao) return { estado: "semGeracao" };
  if (sessao.status === "GERADA" || sessao.status === "EXPORTADA") return { estado: "pronta" };
  if (sessao.status === "FALHA_GERACAO") {
    return { estado: "falhou", motivo: sessao.contextoBloqueadoMotivo ?? motivoFalado("") };
  }
  if (sessao.status !== "GERANDO") return { estado: "semGeracao" };

  // O RELÓGIO DA GERAÇÃO. `geracaoIniciadaEm` é o número certo; `updatedAt` é o socorro para as
  // sessões de antes desta entrega (e para o caminho síncrono de compatibilidade, que não abre
  // tarefa nenhuma na ponte) — sem ele, elas nunca venceriam e ficariam "gerando" para sempre.
  const inicio = (sessao.geracaoIniciadaEm ?? sessao.updatedAt).getTime();
  const desdeMs = Math.max(0, Date.now() - inicio);
  const passouDoPrazo = desdeMs > PRAZO_MAXIMO_DA_GERACAO_MS;

  // SEM TAREFA NA PONTE: ou é o caminho síncrono de compatibilidade (alguém está esperando dentro
  // da própria requisição, e vai gravar por lá), ou é uma sessão de antes desta entrega. Nos dois
  // casos não há a quem perguntar — só o prazo resolve.
  if (!sessao.hermesTarefaId) {
    if (passouDoPrazo) {
      await marcarFalhaDaGeracao(sessaoId, MOTIVO_GERACAO_EXPIRADA);
      return { estado: "falhou", motivo: MOTIVO_GERACAO_EXPIRADA };
    }
    return { estado: "trabalhando", desdeMs };
  }

  let resultado;
  try {
    resultado = await consultarGeracaoNoHermes(sessao.hermesTarefaId);
  } catch (erro) {
    if (erro instanceof GeracaoPerdidaNaPonte) {
      // A PONTE REINICIOU (ou a tarefa venceu, ou o resultado já foi lido e gravado por outro
      // caminho). O terceiro caso se resolve sozinho: se outro caminho gravou, o `status` já não
      // é GERANDO e a reivindicação abaixo não pega nada — a leitura seguinte devolve "pronta".
      const marcou = await marcarFalhaDaGeracao(sessaoId, MOTIVO_GERACAO_PERDIDA);
      if (!marcou) return { estado: "pronta" };
      return { estado: "falhou", motivo: MOTIVO_GERACAO_PERDIDA };
    }
    // Rede instável, ponte reiniciando, nginx recarregando: NÃO é motivo para jogar fora uma
    // geração. Pergunta-se de novo daqui a pouco.
    console.error(`[peticionamentoGeracao] falha ao consultar a geração da sessão ${sessaoId}:`, mensagemDeErro(erro));
    if (passouDoPrazo) {
      await marcarFalhaDaGeracao(sessaoId, MOTIVO_GERACAO_EXPIRADA);
      return { estado: "falhou", motivo: MOTIVO_GERACAO_EXPIRADA };
    }
    return { estado: "trabalhando", desdeMs };
  }

  if (resultado.estado === "trabalhando") {
    if (passouDoPrazo) {
      await marcarFalhaDaGeracao(sessaoId, MOTIVO_GERACAO_EXPIRADA);
      return { estado: "falhou", motivo: MOTIVO_GERACAO_EXPIRADA };
    }
    return { estado: "trabalhando", desdeMs };
  }

  if (resultado.estado === "falhou") {
    const motivo = motivoFalado(resultado.erro);
    const marcou = await marcarFalhaDaGeracao(sessaoId, motivo);
    if (!marcou) return { estado: "pronta" };
    return { estado: "falhou", motivo };
  }

  const nomesLidos = Array.isArray(sessao.geracaoDocumentosLidos) ? (sessao.geracaoDocumentosLidos as string[]) : [];
  try {
    await gravarMinutaGerada({
      sessaoId: sessao.id,
      officeId: sessao.officeId,
      respostaBruta: resultado.resposta,
      sessaoDoHermes: resultado.sessao,
      nomesLidos,
      // O AVISO DE RESUMO É A FONTE DA VERDADE sobre "o contexto foi resumido": ele é gravado por
      // `calcularAvaliacaoDeContexto` no mesmo instante em que a decisão é tomada, e é nulo
      // quando o contexto coube inteiro. Ler daqui é o que permite a colheita acontecer noutra
      // requisição (a do cron) sem carregar nada em memória entre uma e outra.
      contextoResumido: Boolean(sessao.contextoResumoAviso),
      tipoPecaJaEscolhido: sessao.tipoPeca,
      hermesSessionIdAnterior: sessao.hermesSessionId,
      // O RELÓGIO DA MEDIÇÃO é `geracaoIniciadaEm`, e SÓ ele — sem o socorro de `updatedAt` que
      // esta mesma função usa para decidir o prazo. Para decidir "já passou do prazo?", uma
      // aproximação serve (o erro é para o lado de esperar mais); para MEDIR, não serve: o
      // `updatedAt` é tocado por qualquer escrita na sessão, e a "duração" medida a partir dele
      // seria o tempo até a última escrita, apresentado ao advogado como tempo de produção.
      geracaoIniciadaEm: sessao.geracaoIniciadaEm,
    });
  } catch (erro) {
    // A PEÇA JÁ SAIU DA PONTE (ler um resultado final apaga a tarefa de lá) e a gravação falhou.
    // Falar a verdade é a única saída honesta: a geração se perdeu, e é só gerar de novo.
    console.error(`[peticionamentoGeracao] falha ao gravar a minuta da sessão ${sessaoId}:`, mensagemDeErro(erro));
    await marcarFalhaDaGeracao(sessaoId, MOTIVO_GERACAO_PERDIDA);
    return { estado: "falhou", motivo: MOTIVO_GERACAO_PERDIDA };
  }
  return { estado: "pronta" };
}

/**
 * A REDE DE SEGURANÇA (app/api/cron/minutas-pendentes).
 *
 * É ELA que torna verdadeira a frase que a tela mostra ao advogado — "pode fechar a aba". Sem
 * esta varredura, uma sessão em GERANDO que ninguém mais acompanha ficaria parada para sempre: a
 * peça pronta venceria na memória da ponte, e o advogado voltaria no dia seguinte para uma tela
 * que ainda diz "gerando".
 *
 * Cada item no seu próprio try/catch (`colherGeracaoDaMinuta` já quase nunca estoura, mas a dupla
 * proteção custa três linhas e evita que um erro no meio do laço engula os itens seguintes).
 */
export async function varrerGeracoesDeMinutaPendentes(): Promise<{ colhidas: number; falharam: number; aindaTrabalhando: number }> {
  const agora = Date.now();
  const limite = new Date(agora - GRACA_ANTES_DO_CRON_MS);
  const janela = new Date(agora - JANELA_DE_BUSCA_DO_CRON_MS);

  const pendentes = await prisma.peticionamentoSessao.findMany({
    where: {
      status: "GERANDO",
      OR: [
        { geracaoIniciadaEm: { lt: limite, gt: janela } },
        // Sessões de antes desta entrega, e as do caminho síncrono de compatibilidade: não têm
        // `geracaoIniciadaEm`. O relógio delas é o `updatedAt`, que a gravação de GERANDO tocou.
        { geracaoIniciadaEm: null, updatedAt: { lt: limite, gt: janela } },
      ],
    },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: MAXIMO_POR_RODADA,
  });

  let colhidas = 0;
  let falharam = 0;
  let aindaTrabalhando = 0;
  for (const sessao of pendentes) {
    try {
      const andamento = await colherGeracaoDaMinuta(sessao.id);
      if (andamento.estado === "pronta") colhidas++;
      else if (andamento.estado === "falhou") falharam++;
      else aindaTrabalhando++;
    } catch (e) {
      falharam++;
      console.error("[minutas-pendentes] falha ao colher item da varredura:", mensagemDeErro(e));
    }
  }
  return { colhidas, falharam, aindaTrabalhando };
}

/**
 * A FAIXA MEDIDA DESTE ESCRITÓRIO — o que a tela mostra em vez de um tempo chutado.
 *
 * `officeId` no `where`, como toda leitura desta casa. Só gerações que TERMINARAM bem entram: uma
 * falha não é medida de tempo de produção, e uma sessão ainda em GERANDO não tem duração nenhuma (o
 * campo só é escrito na gravação da minuta).
 *
 * As mais RECENTES, e não todas: a máquina, o tamanho típico dos processos e o próprio orçamento do
 * agente mudam com o tempo, e uma média histórica descreveria um servidor que já não existe.
 *
 * A ESTATÍSTICA NÃO ESTÁ AQUI — está em `faixaDeGeracao`, que é pura e exercitada. Aqui só a
 * leitura: é a divisão que permite provar o critério sem banco de mentira.
 */
export async function faixaDeGeracaoDoEscritorio(officeId: string): Promise<FaixaDeGeracao> {
  const linhas = await prisma.peticionamentoSessao.findMany({
    where: { officeId, geracaoDuracaoMs: { not: null }, status: { in: ["GERADA", "EXPORTADA"] } },
    orderBy: { geradoEm: "desc" },
    take: MEDICOES_CONSIDERADAS,
    select: { geracaoDuracaoMs: true },
  });
  return faixaDeGeracao(linhas.map((l) => l.geracaoDuracaoMs));
}
