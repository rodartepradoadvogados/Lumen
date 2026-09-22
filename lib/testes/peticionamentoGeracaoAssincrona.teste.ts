import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { motivoFalado, GRACA_ANTES_DO_CRON_MS, JANELA_DE_BUSCA_DO_CRON_MS, PRAZO_MAXIMO_DA_GERACAO_MS, MOTIVO_GERACAO_PERDIDA, MOTIVO_GERACAO_EXPIRADA } from "@/lib/peticionamentoGeracaoAssincrona";
import { ESPERA_PETICIONAMENTO_MS, GeracaoPerdidaNaPonte, PonteSemCaminhoAssincrono, FalhaDoHermes, iniciarGeracaoNoHermes, consultarGeracaoNoHermes } from "@/lib/hermesPonte";

// ============================================================================================
// A GERAÇÃO QUE NÃO CABE NUMA REQUISIÇÃO WEB.
//
// O DEFEITO, com número de produção: o Hermes passou de 240s SEM TERMINAR, foi MORTO
// (`subprocess.TimeoutExpired` ... `BrokenPipeError: [Errno 32] Broken pipe`), e o advogado leu
// "DEMORA: o Hermes não respondeu em 230s". Todo o trabalho e todo o custo, perdidos.
//
// O teto duro é a Vercel: 300 segundos. Aumentar os números só adia. As duas mudanças desta
// entrega, e o que este arquivo cobra de cada uma:
//
//   1. `--run-budget`: o agente passa a SABER que há prazo e conclui, em vez de ser morto. Aqui
//      isso é exercitado de verdade — a ponte é SUBIDA e o argv que chega ao binário é lido.
//   2. A espera sai de dentro da requisição: `POST /chat-async` + `GET /resultado/<id>` na ponte,
//      e no Lúmen o disparo, o acompanhamento pela tela e a rede de segurança por cron.
//
// POR QUE EXERCITAR A PONTE, E NÃO SÓ VARRÊ-LA. Varredura prova que o código EXISTE, nunca que
// ele FUNCIONA — esta casa já teve uma trava inteira virar `if (false)` com as 76 suítes verdes.
// E, nesta entrega, uma varredura presa a UMA GRAFIA chegou a IMPEDIR a correção que guardava: a
// lista de opções do argv passou a ser derivada, e o teste exigia a string `--query-file` dentro
// da condição. Onde dá para exercitar, é o que se faz.
// ============================================================================================

const RAIZ = process.cwd();

// ── A PONTE, SUBIDA DE VERDADE ──────────────────────────────────────────────────────────────

/**
 * O CONTRATO do harness, escrito por extenso: é o que `lib/testes/ponteHermes.harness.py` observa
 * ao subir a ponte de verdade. Escrito aqui, e não inferido, porque é ele que documenta o que
 * cada caso abaixo tem direito de exigir — e porque um campo que sumir do harness vira erro de
 * compilação, em vez de `undefined` passando verde.
 */
type Resposta = { codigo: number; corpo: Record<string, unknown> };
type Fatos = {
  espera_s: number;
  orcamento_s: number;
  folga_s: number;
  max_turns: number;
  chat_sincrono: Resposta;
  disparo: Resposta;
  resultado_sem_token: { codigo: number };
  resultado_token_errado: { codigo: number };
  resultado_pronto: Resposta;
  resultado_depois_de_lido: Resposta;
  resultado_desconhecido: Resposta;
  resultado_id_invalido: { codigo: number };
  teto_de_tarefas: { maximo: number; codigos: number[] };
  estado_enquanto_trabalha: Resposta;
  resultado_vencido: Resposta;
  tarefas_na_memoria_depois_do_vencimento: number;
  classificacoes: Record<string, { codigo: number; erro: string }>;
  sincrono_perfil_ausente: Resposta;
  assincrono_perfil_ausente: Resposta;
  sincrono_binario_velho: Resposta;
  sincrono_mensagem_grande: Resposta;
  assincrono_mensagem_grande: Resposta;
  assincrono_sem_token: { codigo: number };
  assincrono_perfil_invalido: { codigo: number };
  com_outro_teto: { espera?: number; orcamento?: number; erro?: string };
};

/** O texto de um campo do corpo, sem `as` espalhado por cada caso. */
function texto(corpo: Record<string, unknown>, chave: string): string {
  const valor = corpo[chave];
  return typeof valor === "string" ? valor : "";
}

function exercitarAPonte(): Fatos {
  const pasta = mkdtempSync(join(tmpdir(), "ponte-hermes-"));
  try {
    const saida = execFileSync("python3", [join(RAIZ, "lib", "testes", "ponteHermes.harness.py"), pasta], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
    // O registro da ponte sai por stderr; o JSON é a ÚLTIMA linha do stdout.
    const linhas = saida.trim().split("\n");
    return JSON.parse(linhas[linhas.length - 1]) as Fatos;
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

// Uma execução só, compartilhada: subir a ponte cinco vezes custaria cinco vezes mais e não
// provaria nada a mais.
const FATOS = exercitarAPonte();

teste("o exercício da ponte aconteceu de verdade — um resultado vazio passaria verde sem provar nada", () => {
  verdade(Object.keys(FATOS).length > 15, `o harness devolveu ${Object.keys(FATOS).length} fatos`);
});

// ── 1. `--run-budget`: O AGENTE CONCLUI EM VEZ DE MORRER ────────────────────────────────────

teste("EXERCITADO: o orçamento chega MESMO ao binário, no argv — não só escrito no arquivo", () => {
  const argv = texto(FATOS.chat_sincrono.corpo, "resposta");
  verdade(/^ARGV: /.test(argv), `o hermes de mentira não ecoou o argv: ${JSON.stringify(argv).slice(0, 200)}`);
  verdade(/--run-budget \d+/.test(argv), `o argv que chegou ao binário não tem --run-budget: ${argv}`);
  verdade(/--max-turns \d+/.test(argv), `o argv que chegou ao binário não tem --max-turns: ${argv}`);
  const orcamentoNoArgv = Number(argv.match(/--run-budget (\d+)/)?.[1] ?? 0);
  igual(orcamentoNoArgv, FATOS.orcamento_s, "o número no argv precisa ser o ORCAMENTO_S do arquivo: ");
  const turnosNoArgv = Number(argv.match(/--max-turns (\d+)/)?.[1] ?? 0);
  igual(turnosNoArgv, FATOS.max_turns, "o número de iterações no argv precisa ser o MAX_TURNS do arquivo: ");
});

teste("A PROPRIEDADE, não o número: o orçamento é DERIVADO da espera, e menor que ela", () => {
  // Se o orçamento fosse um segundo número solto, bastaria alguém baixar HERMES_TIMEOUT_S numa
  // máquina menor para o `subprocess` voltar a matar o agente antes de o orçamento avisá-lo — o
  // defeito de hoje, de volta, em silêncio.
  igual(
    FATOS.orcamento_s,
    Math.max(30, FATOS.espera_s - FATOS.folga_s),
    "o orçamento precisa ser ESPERA_S menos a folga (com piso), e não um número escrito à mão: ",
  );
  verdade(
    FATOS.orcamento_s < FATOS.espera_s,
    `o orçamento (${FATOS.orcamento_s}s) precisa caber com folga dentro do teto do processo (${FATOS.espera_s}s) — sem isso o agente é morto antes de conseguir entregar o que escreveu`,
  );
  // E A PROVA DE VERDADE: MOVER o teto do processo e ver o orçamento ir junto. Conferir a conta
  // com os padrões de hoje não prova derivação nenhuma — um número escrito à mão que por acaso
  // bata passa igual. O harness importa a ponte num interpretador separado, com
  // HERMES_TIMEOUT_S=120, e lê o que o orçamento virou.
  igual(FATOS.com_outro_teto.erro, undefined, "a prova de derivação não rodou: ");
  igual(FATOS.com_outro_teto.espera, 120, "o harness não conseguiu mover o teto do processo: ");
  verdade(
    (FATOS.com_outro_teto.orcamento ?? 0) < 120 && (FATOS.com_outro_teto.orcamento ?? 0) !== FATOS.orcamento_s,
    `com HERMES_TIMEOUT_S=120 o orçamento ficou ${FATOS.com_outro_teto.orcamento} — ele não se mexeu com o teto, ou seja, virou um segundo número solto (é exatamente a combinação que matou uma geração real: o processo morto antes de o agente ser avisado)`,
  );

  // A FOLGA TEM DE SER ÚTIL: depois do fim do orçamento, o agente ainda precisa de tempo para
  // escrever a resposta na saída padrão antes da machadada.
  verdade(FATOS.folga_s >= 10, `a folga entre o orçamento e a morte do processo é de ${FATOS.folga_s}s — curta demais para o agente terminar de escrever`);
  // E o aviso de conclusão (80% do orçamento) tem de sobrar tempo de verdade para concluir.
  const depoisDoAviso = FATOS.orcamento_s * 0.2 + FATOS.folga_s;
  verdade(depoisDoAviso > 30, `do aviso de conclusão até a morte do processo sobram ${Math.round(depoisDoAviso)}s — pouco para fechar uma peça`);
});

teste("o teto de iterações de ferramenta é um TETO de verdade — nem o padrão de 500, nem ilimitado", () => {
  verdade(FATOS.max_turns > 0, "sem teto, uma ferramenta em laço consome o orçamento inteiro sem escrever uma linha");
  verdade(
    FATOS.max_turns < 500,
    `o teto de iterações é ${FATOS.max_turns}, que é o padrão do binário ou mais — 500 iterações dão tempo de uma ferramenta travada gastar a geração inteira`,
  );
});

// ── 2. O CAMINHO DA ANA CONTINUA INTACTO ────────────────────────────────────────────────────
//
// REGRA, NÃO PREFERÊNCIA: o atendimento usa ESTA MESMA ponte, pelo caminho síncrono. Nada desta
// entrega pode chegar até ele.

teste("EXERCITADO: `/chat` síncrono continua devolvendo 200 com resposta e sessão", () => {
  igual(FATOS.chat_sincrono.codigo, 200, "o caminho síncrono deixou de responder 200: ");
  verdade(texto(FATOS.chat_sincrono.corpo, "resposta").length > 0, "o /chat síncrono devolveu resposta vazia");
  igual(FATOS.chat_sincrono.corpo.sessao, "sessao-de-mentira", "o /chat síncrono deixou de devolver o id da conversa do Hermes: ");
});

teste("EXERCITADO: os códigos e as frases de recusa do `/chat` são os MESMOS de antes", () => {
  // As quatro famílias que o Lúmen (e a Ana) já sabem traduzir. Se qualquer uma mudar de código
  // ou de frase, quem lê do outro lado passa a receber algo que não sabe traduzir.
  igual(FATOS.sincrono_mensagem_grande.codigo, 400, "mensagem longa demais deixou de ser 400: ");
  igual(FATOS.sincrono_mensagem_grande.corpo.erro, "mensagem ausente ou longa demais", "a frase do 400 de tamanho mudou: ");
  igual(FATOS.sincrono_perfil_ausente.codigo, 404, "perfil não provisionado deixou de ser 404 — é o diagnóstico do painel mestre: ");
  igual(FATOS.sincrono_perfil_ausente.corpo.erro, "perfil não provisionado", "a frase do 404 de perfil mudou: ");
  igual(FATOS.sincrono_binario_velho.codigo, 501, "binário velho deixou de ser 501: ");
  verdade(/atualize o binário/i.test(texto(FATOS.sincrono_binario_velho.corpo, "erro")), "o 501 precisa dizer que o conserto é atualizar o binário, não mandar procurar defeito no pedido");
});

teste("EXERCITADO: a tradução de falha é a MESMA nos dois caminhos — um defeito, uma frase", () => {
  // Duas cópias da mesma tradução divergiriam em silêncio: o mesmo defeito daria uma recusa
  // falada pelo caminho síncrono e uma frase desconhecida pelo assíncrono — e é justamente a
  // desconhecida que o Lúmen não sabe traduzir para o advogado.
  igual(
    FATOS.assincrono_perfil_ausente.corpo.erro,
    FATOS.sincrono_perfil_ausente.corpo.erro,
    "o mesmo defeito (perfil ausente) deu frases diferentes nos dois caminhos: ",
  );
  igual(FATOS.assincrono_perfil_ausente.corpo.estado, "falhou", "o caminho assíncrono precisa dizer que falhou, não ficar trabalhando para sempre: ");
});

teste("EXERCITADO: as travas de tamanho valem nas DUAS portas — a nova não é porta dos fundos", () => {
  igual(FATOS.assincrono_mensagem_grande.codigo, 400, "a rota assíncrona aceitou uma mensagem acima do teto: ");
  igual(
    FATOS.assincrono_mensagem_grande.corpo.erro,
    FATOS.sincrono_mensagem_grande.corpo.erro,
    "a recusa por tamanho mudou de frase na rota nova — o Lúmen só sabe traduzir a antiga: ",
  );
  igual(FATOS.assincrono_sem_token.codigo, 401, "a rota assíncrona deixou de exigir o segredo da ponte: ");
  igual(FATOS.assincrono_perfil_invalido.codigo, 400, "a rota assíncrona aceitou um perfil fora do formato: ");
});

// ── 3. O CAMINHO ASSÍNCRONO, EXERCITADO ─────────────────────────────────────────────────────

teste("EXERCITADO: o disparo devolve NA HORA um identificador, com 202 (aceito, não pronto)", () => {
  igual(FATOS.disparo.codigo, 202, "o disparo precisa responder 202 — 200 diria que o trabalho terminou: ");
  const tarefa = texto(FATOS.disparo.corpo, "tarefa");
  verdade(/^[A-Za-z0-9_-]{16,64}$/.test(tarefa), `o identificador devolvido não tem o formato esperado: ${JSON.stringify(tarefa)}`);
});

teste("EXERCITADO: `GET /resultado/<id>` exige a MESMA autorização de `/chat`", () => {
  // Um id vazado não pode virar porta de leitura de peça alheia.
  igual(FATOS.resultado_sem_token.codigo, 401, "sem o segredo da ponte, o resultado precisa ser recusado: ");
  igual(FATOS.resultado_token_errado.codigo, 401, "com o segredo errado, o resultado precisa ser recusado: ");
});

teste("EXERCITADO: enquanto trabalha, o resultado diz 'trabalhando' — e não vaza conteúdo nenhum", () => {
  igual(FATOS.estado_enquanto_trabalha.corpo.estado, "trabalhando", "o estado em andamento mudou de nome: ");
  igual(FATOS.estado_enquanto_trabalha.corpo.resposta, undefined, "uma geração em andamento não pode devolver resposta: ");
});

teste("EXERCITADO: a tarefa SOME depois de lida — a peça não fica na memória da ponte", () => {
  igual(FATOS.resultado_pronto.corpo.estado, "pronto", "a geração não chegou a ficar pronta: ");
  verdade(texto(FATOS.resultado_pronto.corpo, "resposta").length > 0, "o resultado veio sem a peça");
  igual(FATOS.resultado_depois_de_lido.codigo, 404, "a tarefa continuou na memória depois de entregue: ");
  igual(FATOS.resultado_depois_de_lido.corpo.estado, "desconhecida", "a segunda leitura precisa dizer 'desconhecida', não repetir a peça: ");
});

teste("EXERCITADO: tarefa desconhecida (a ponte reiniciada) tem resposta PRÓPRIA e falada", () => {
  igual(FATOS.resultado_desconhecido.codigo, 404, "uma tarefa que a ponte não conhece precisa dizer isso claramente: ");
  igual(FATOS.resultado_desconhecido.corpo.estado, "desconhecida", "o estado de tarefa desconhecida mudou de nome — é ele que o Lúmen traduz: ");
  igual(FATOS.resultado_id_invalido.codigo, 400, "um identificador fora do formato precisa ser recusado antes de qualquer busca: ");
});

teste("EXERCITADO: a memória tem TETO — cheia, a ponte RECUSA falado em vez de ficar sem memória", () => {
  const codigos = FATOS.teto_de_tarefas.codigos;
  igual(codigos.length, 3, "o exercício do teto não rodou as três tentativas: ");
  igual(codigos.filter((c) => c === 202).length, FATOS.teto_de_tarefas.maximo, "a ponte aceitou mais tarefas do que o teto: ");
  verdade(codigos.includes(503), `a tentativa acima do teto devolveu ${codigos.join(", ")} — precisa ser 503 (o servidor é que não pode agora), nunca 500 nem um aceite silencioso`);
});

teste("EXERCITADO: a tarefa VENCE por tempo — a ponte não guarda peça para sempre", () => {
  igual(FATOS.resultado_vencido.codigo, 404, "uma tarefa vencida continuou legível: ");
  igual(FATOS.tarefas_na_memoria_depois_do_vencimento, 0, "a tarefa vencida continuou ocupando memória: ");
});

teste("EXERCITADO: a tradução de erro cobre as cinco famílias, com os códigos de sempre", () => {
  const c = FATOS.classificacoes;
  igual(c.argumento_grande.codigo, 400, "argumento grande demais precisa ser 400 (pedido), nunca 500 (servidor): ");
  igual(c.argumento_grande.erro, "mensagem ausente ou longa demais", "a recusa por tamanho de argumento precisa usar a MESMA frase de tamanho que o Lúmen já traduz: ");
  igual(c.binario_velho.codigo, 501, "binário velho precisa ser 501: ");
  verdade(/--run-budget/.test(c.binario_velho.erro), "o 501 precisa NOMEAR a opção que falta — senão quem cuida do servidor sai conferindo todas");
  igual(c.perfil_ausente.codigo, 404, "perfil ausente precisa continuar 404: ");
  igual(c.tempo_esgotado.codigo, 504, "tempo esgotado precisa continuar 504: ");
  igual(c.inesperado.codigo, 500, "o balde das falhas inesperadas precisa continuar 500: ");
  igual(c.inesperado.erro, "falha ao executar o Hermes", "a frase do balde mudou — é ela que o Lúmen traduz numa recusa acionável: ");
});

// ── 4. O 501 DE BINÁRIO VELHO CONTINUA CONDICIONADO AO ERRO REAL ────────────────────────────
//
// ADAPTADO NESTA ENTREGA, e é o caso mais instrutivo dela. A versão anterior deste teste exigia a
// string `--query-file` DENTRO da condição do `raise`. Quando a ponte passou a mandar também
// `--run-budget` e `--max-turns`, a condição certa deixou de ser "procure --query-file" e passou a
// ser "procure QUALQUER opção que foi mandada" — e o teste, preso à grafia, ficou vermelho pela
// correção que ele existia para proteger. A régua agora é a PROPRIEDADE, exercitada.

teste("EXERCITADO: o 501 NÃO engole as outras falhas — perfil ausente continua 404", () => {
  // A prova real: o mesmo binário de mentira que falha com "profile not found" tem de dar 404, e
  // o que falha com "unrecognized option" tem de dar 501. Uma condição constante (`if True`)
  // transformaria os dois em 501 e mandaria quem cuida do servidor consertar o lugar errado —
  // inclusive nas falhas do atendimento, que usa esta MESMA ponte.
  igual(FATOS.sincrono_perfil_ausente.codigo, 404, "o ramo de perfil ausente deixou de ser alcançável: ");
  igual(FATOS.sincrono_binario_velho.codigo, 501, "o ramo de binário velho deixou de funcionar: ");
});

teste("A LISTA DE OPÇÕES É DERIVADA DO ARGV — uma opção nova amanhã já nasce coberta", () => {
  const ponte = readFileSync(join(RAIZ, "servidor-hermes", "servidor.py"), "utf8")
    .replace(/"""[\s\S]*?"""/g, '""" """')
    .split("\n")
    .map((l) => l.replace(/#.*$/, ""))
    .join("\n");
  verdade(ponte.length > 3_000, `a varredura da ponte devolveu ${ponte.length} caracteres — varredura cega`);
  const trecho = ponte.slice(ponte.indexOf("def executar_hermes("), ponte.indexOf("def classificar_falha("));
  verdade(trecho.length > 500, `o trecho de executar_hermes saiu com ${trecho.length} caracteres — varredura cega`);
  verdade(
    /for a in argumentos if a\.startswith\("--"\)/.test(trecho),
    "a lista de opções conferidas precisa sair do PRÓPRIO argv montado — uma lista escrita à mão esquece a próxima opção, e foi assim que este teste chegou a impedir a correção que guardava",
  );
});

// ── 5. A CORRENTE DE TEMPOS, E O TETO QUE NÃO SE MOVE ───────────────────────────────────────

teste("o teto duro da Vercel continua sendo o fim da corrente — e o caminho síncrono cabe nele", () => {
  const confirmar = readFileSync(join(RAIZ, "app", "peticionamento", "[id]", "confirmar", "page.tsx"), "utf8");
  const vercelS = Number(codigoDe(confirmar).match(/export const maxDuration\s*=\s*(\d+)/)?.[1] ?? 0);
  verdade(vercelS > 0, "sumiu o maxDuration da tela de confirmação");
  verdade(vercelS <= 300, `maxDuration = ${vercelS}: a plataforma não passa de 300s, e prometer mais é prometer o que ela não faz`);
  // O caminho SÍNCRONO de compatibilidade continua existindo e continua tendo de caber aqui.
  verdade(
    ESPERA_PETICIONAMENTO_MS / 1000 < vercelS,
    `o caminho síncrono espera ${ESPERA_PETICIONAMENTO_MS / 1000}s dentro de uma função de ${vercelS}s`,
  );
  verdade(ESPERA_PETICIONAMENTO_MS / 1000 < FATOS.espera_s, "quem desiste primeiro tem de ser o Lúmen — é o único lado capaz de explicar ao advogado");
});

teste("os relógios do acompanhamento fecham entre si — e com a validade das tarefas na ponte", () => {
  // O cron só olha DEPOIS da folga: antes disso, quem colhe é a tela.
  verdade(GRACA_ANTES_DO_CRON_MS > 0, "sem folga, o cron competiria com o advogado que está olhando a tela");
  // E a folga tem de ser MENOR que o prazo máximo, ou o cron nunca pegaria nada antes de a
  // geração já ter sido dada por perdida.
  verdade(GRACA_ANTES_DO_CRON_MS < PRAZO_MAXIMO_DA_GERACAO_MS, "a folga do cron precisa caber dentro do prazo máximo da geração");
  // O prazo máximo tem de caber na validade das tarefas da ponte: declarar perdida uma tarefa que
  // a ponte ainda tem na mão jogaria fora uma peça pronta.
  const validadeDaPonte = Number(
    readFileSync(join(RAIZ, "servidor-hermes", "servidor.py"), "utf8").match(/HERMES_TAREFA_VALIDADE_S",\s*"(\d+)"/)?.[1] ?? 0,
  );
  verdade(validadeDaPonte > 0, "HERMES_TAREFA_VALIDADE_S sumiu de servidor-hermes/servidor.py");
  verdade(
    PRAZO_MAXIMO_DA_GERACAO_MS / 1000 < validadeDaPonte,
    `o prazo máximo (${PRAZO_MAXIMO_DA_GERACAO_MS / 1000}s) precisa ser menor que a validade das tarefas na ponte (${validadeDaPonte}s)`,
  );
  // E o prazo máximo tem de ser maior que o teto do processo do lado da ponte — senão uma geração
  // normal seria declarada perdida enquanto ainda está sendo escrita.
  verdade(
    PRAZO_MAXIMO_DA_GERACAO_MS / 1000 > FATOS.espera_s,
    `o prazo máximo (${PRAZO_MAXIMO_DA_GERACAO_MS / 1000}s) é menor que o teto do processo na ponte (${FATOS.espera_s}s)`,
  );
  // A janela do cron precisa cobrir o prazo máximo, ou uma sessão vencida nunca seria varrida.
  verdade(JANELA_DE_BUSCA_DO_CRON_MS > PRAZO_MAXIMO_DA_GERACAO_MS, "a janela de busca do cron não cobre nem o prazo máximo de uma geração");
});

// ── 6. AS RECUSAS FALADAS ───────────────────────────────────────────────────────────────────

teste("EXERCITADA: a ponte reiniciada vira frase de gente, nunca erro cru nem espera infinita", () => {
  for (const frase of [MOTIVO_GERACAO_PERDIDA, MOTIVO_GERACAO_EXPIRADA]) {
    verdade(frase.length > 60, `a recusa falada tem ${frase.length} caracteres — curta demais para explicar o que fazer`);
    verdade(/não foi perdido|se perdeu|continua salva/i.test(frase), `a recusa "${frase.slice(0, 40)}…" não diz ao advogado que a triagem continua salva`);
    // E nunca despeja o vocabulário da máquina na tela.
    verdade(!/\b(504|500|Errno|subprocess|timeout|HTTP)\b/i.test(frase), `a recusa falada tem vocabulário de máquina: ${frase}`);
  }
});

teste("EXERCITADA: cada família de erro da ponte tem uma saída NOMEADA, e nenhuma é erro cru", () => {
  const casos: { erroDaPonte: string; esperado: RegExp }[] = [
    { erroDaPonte: "o Hermes demorou demais", esperado: /menos documentos|dividir a peça/i },
    { erroDaPonte: "esta instalação do hermes não conhece uma opção que a ponte usa (--run-budget) — atualize o binário", esperado: /suporte/i },
    { erroDaPonte: "perfil não provisionado", esperado: /suporte/i },
    { erroDaPonte: "o Hermes respondeu vazio", esperado: /tente gerar de novo|tente de novo/i },
    { erroDaPonte: "a ponte já está com o máximo de gerações em andamento — tente de novo em alguns minutos", esperado: /alguns minutos/i },
    { erroDaPonte: "qualquer coisa que ninguém previu", esperado: /suporte/i },
  ];
  for (const caso of casos) {
    const falado = motivoFalado(caso.erroDaPonte);
    verdade(caso.esperado.test(falado), `"${caso.erroDaPonte}" virou "${falado}", que não nomeia a saída esperada`);
    // O TEXTO CRU DA PONTE NUNCA CHEGA À TELA — foi exatamente isso que o dono leu duas vezes.
    verdade(!falado.includes(caso.erroDaPonte), `a tradução devolveu o texto cru da ponte: ${falado}`);
    verdade(/continua salva/i.test(falado), `"${falado}" não diz que a triagem continua salva — é a informação que tira o susto`);
  }
});

// ── 6-B. O CLIENTE DA PONTE, EXERCITADO CONTRA UM SERVIDOR DE MENTIRA ───────────────────────
//
// A ponte de verdade já foi exercitada lá em cima. Falta o OUTRO lado: como o Lúmen LÊ o que ela
// responde. Isto é varredura-imune de propósito — a decisão de cair no caminho síncrono e a de
// declarar a geração perdida são as duas que, se falharem, deixam o advogado com a tela girando
// para sempre ou com um erro cru; e as duas dependem de um `404` ser reconhecido pelo CÓDIGO.
//
// Um servidor HTTP mínimo, em memória, com porta efêmera: nada de rede externa, nada de esperar.

async function comPonteDeMentira<T>(
  responder: (caminho: string, autorizado: boolean) => { status: number; corpo: unknown },
  corpoDoTeste: () => Promise<T>,
): Promise<T> {
  const servidor = createServer((req, res) => {
    const autorizado = (req.headers.authorization ?? "") === "Bearer segredo-de-mentira-com-tamanho";
    const { status, corpo } = responder(req.url ?? "", autorizado);
    const dados = Buffer.from(JSON.stringify(corpo), "utf8");
    res.writeHead(status, { "content-type": "application/json", "content-length": String(dados.length) });
    res.end(dados);
  });
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const porta = (servidor.address() as AddressInfo).port;
  const urlAntes = process.env.HERMES_URL;
  const tokenAntes = process.env.HERMES_TOKEN;
  process.env.HERMES_URL = `http://127.0.0.1:${porta}`;
  process.env.HERMES_TOKEN = "segredo-de-mentira-com-tamanho";
  try {
    return await corpoDoTeste();
  } finally {
    process.env.HERMES_URL = urlAntes;
    process.env.HERMES_TOKEN = tokenAntes;
    await new Promise<void>((pronto) => servidor.close(() => pronto()));
  }
}

teste("EXERCITADO: uma ponte SEM /chat-async faz o Lúmen cair no síncrono — não quebrar", async () => {
  // O intervalo entre o deploy do Lúmen e a subida do servidor.py na VPS é real: os dois não
  // acontecem no mesmo instante. Uma ponte antiga responde 404 nessa rota.
  const erro = await comPonteDeMentira(
    () => ({ status: 404, corpo: { erro: "rota desconhecida" } }),
    async () => {
      try {
        await iniciarGeracaoNoHermes({ perfil: "peticionamento-lumen", mensagem: "x" });
        return null;
      } catch (e) {
        return e;
      }
    },
  );
  verdade(
    erro instanceof PonteSemCaminhoAssincrono,
    `um 404 em /chat-async precisa virar PonteSemCaminhoAssincrono (é ela que aciona a queda para o caminho de sempre) — veio ${erro instanceof Error ? erro.name : String(erro)}`,
  );
});

teste("EXERCITADO: o disparo lê o identificador — e uma resposta sem ele falha em vez de fingir", async () => {
  const comId = await comPonteDeMentira(
    () => ({ status: 202, corpo: { tarefa: "abcdefghijklmnopqrstuvwx" } }),
    () => iniciarGeracaoNoHermes({ perfil: "peticionamento-lumen", mensagem: "x" }),
  );
  igual(comId.tarefa, "abcdefghijklmnopqrstuvwx", "o identificador devolvido pela ponte não chegou a quem chamou: ");

  const semId = await comPonteDeMentira(
    () => ({ status: 202, corpo: {} }),
    async () => {
      try {
        await iniciarGeracaoNoHermes({ perfil: "peticionamento-lumen", mensagem: "x" });
        return null;
      } catch (e) {
        return e as Error;
      }
    },
  );
  // Sem identificador não há o que acompanhar: gravar GERANDO assim deixaria a sessão parada na
  // tela até o prazo máximo, sem ninguém nunca poder colhê-la.
  verdade(semId instanceof FalhaDoHermes, "uma resposta sem identificador precisa falhar aqui, não virar uma sessão que ninguém consegue colher");
});

teste("EXERCITADO: tarefa desconhecida vira GeracaoPerdidaNaPonte — nunca 'ainda trabalhando'", async () => {
  // A PONTE REINICIADA. Se este 404 virasse "trabalhando", a tela giraria até o prazo máximo e o
  // advogado esperaria quinze minutos por uma geração que já não existe.
  const erro = await comPonteDeMentira(
    () => ({ status: 404, corpo: { estado: "desconhecida", erro: "tarefa desconhecida" } }),
    async () => {
      try {
        await consultarGeracaoNoHermes("abcdefghijklmnopqrstuvwx");
        return null;
      } catch (e) {
        return e;
      }
    },
  );
  verdade(erro instanceof GeracaoPerdidaNaPonte, `o 404 de tarefa desconhecida precisa virar GeracaoPerdidaNaPonte — veio ${erro instanceof Error ? erro.name : String(erro)}`);

  // E um identificador fora do formato nem chega à rede: ele iria para dentro da URL.
  const invalido = await comPonteDeMentira(
    () => ({ status: 200, corpo: { estado: "pronto", resposta: "nunca deveria chegar aqui" } }),
    async () => {
      try {
        return await consultarGeracaoNoHermes("../saude");
        } catch (e) {
        return e;
      }
    },
  );
  verdade(invalido instanceof GeracaoPerdidaNaPonte, "um identificador fora do formato precisa ser recusado ANTES de virar caminho na URL da ponte");
});

teste("EXERCITADO: os três estados da ponte são lidos como são — e o vazio é falha, não resposta", async () => {
  const pronto = await comPonteDeMentira(
    () => ({ status: 200, corpo: { estado: "pronto", resposta: "  A MINUTA  ", sessao: "s-1" } }),
    () => consultarGeracaoNoHermes("abcdefghijklmnopqrstuvwx"),
  );
  igual(pronto, { estado: "pronto", resposta: "A MINUTA", sessao: "s-1" }, "o estado pronto não foi lido como esperado: ");

  const trabalhando = await comPonteDeMentira(
    () => ({ status: 200, corpo: { estado: "trabalhando" } }),
    () => consultarGeracaoNoHermes("abcdefghijklmnopqrstuvwx"),
  );
  igual(trabalhando, { estado: "trabalhando" }, "o estado em andamento não foi lido como esperado: ");

  const falhou = await comPonteDeMentira(
    () => ({ status: 200, corpo: { estado: "falhou", erro: "falha ao executar o Hermes" } }),
    () => consultarGeracaoNoHermes("abcdefghijklmnopqrstuvwx"),
  );
  igual(falhou, { estado: "falhou", erro: "falha ao executar o Hermes" }, "o estado de falha não foi lido como esperado: ");

  // Resposta vazia é falha, não resposta: sem isto a tela mostraria uma minuta em branco.
  const vazio = await comPonteDeMentira(
    () => ({ status: 200, corpo: { estado: "pronto", resposta: "   ", sessao: "s-1" } }),
    () => consultarGeracaoNoHermes("abcdefghijklmnopqrstuvwx"),
  );
  igual(vazio, { estado: "falhou", erro: "o Hermes respondeu vazio" }, "uma peça vazia precisa virar falha: ");

  // Um estado DESCONHECIDO (uma ponte mais nova) não pode virar "falhou" e jogar fora uma peça que
  // ainda está sendo escrita — quem fecha esse caminho é o prazo máximo, do lado do Lúmen.
  const estranho = await comPonteDeMentira(
    () => ({ status: 200, corpo: { estado: "algo-que-ninguem-previu" } }),
    () => consultarGeracaoNoHermes("abcdefghijklmnopqrstuvwx"),
  );
  igual(estranho, { estado: "trabalhando" }, "um estado desconhecido precisa ser lido como 'ainda trabalhando': ");
});

// ── 7. A COSTURA NO LÚMEN (varredura estrutural, como o resto da casa) ──────────────────────

const FONTE_ACOES = readFileSync(join(RAIZ, "lib", "actions", "peticionamento.ts"), "utf8");
const FONTE_GERACAO = readFileSync(join(RAIZ, "lib", "peticionamentoGeracaoAssincrona.ts"), "utf8");
const CODIGO_GERAR = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarTriagemEGerar"));
const CODIGO_GRAVAR = codigoDe(corpoDaFuncao(FONTE_GERACAO, "gravarMinutaGerada"));
const CODIGO_COLHER = codigoDe(corpoDaFuncao(FONTE_GERACAO, "colherGeracaoDaMinuta"));

teste("a varredura acha as três funções com corpo substancial — não está cega", () => {
  verdade(CODIGO_GERAR.length > 1_500, `confirmarTriagemEGerar devolveu ${CODIGO_GERAR.length} caracteres`);
  verdade(CODIGO_GRAVAR.length > 800, `gravarMinutaGerada devolveu ${CODIGO_GRAVAR.length} caracteres`);
  verdade(CODIGO_COLHER.length > 800, `colherGeracaoDaMinuta devolveu ${CODIGO_COLHER.length} caracteres`);
});

teste("TRAVA: a gravação da minuta é uma REIVINDICAÇÃO ATÔMICA — a tela e o cron nunca gravam duas vezes", () => {
  // O padrão da casa (lib/avisoFigurinha.ts): `updateMany` com o estado ANTIGO no `where`. Só
  // quem conseguiu mudar o estado é quem grava.
  const reivindicacao = CODIGO_GRAVAR.match(/updateMany\(\{[\s\S]*?\}\)/);
  verdade(Boolean(reivindicacao), "a gravação da minuta deixou de ser um updateMany — um `update` simples grava sempre, e a tela e o cron gravariam a mesma minuta duas vezes");
  const trecho = reivindicacao![0];
  verdade(
    /where:\s*\{[^}]*status:\s*"GERANDO"/.test(trecho),
    "o estado antigo saiu do `where` da reivindicação — sem ele o banco deixa de ser quem decide quem grava",
  );
  verdade(/where:\s*\{[^}]*officeId/.test(trecho), "a reivindicação perdeu o corte por escritório");
  // E o resultado da reivindicação é CONFERIDO: reivindicar sem olhar a contagem é o mesmo que
  // não reivindicar.
  verdade(
    /count === 0/.test(CODIGO_GRAVAR) || /count > 0/.test(CODIGO_GRAVAR),
    "a contagem do updateMany não é conferida — quem perdeu a corrida seguiria como se tivesse gravado",
  );
});

teste("TRAVA: nenhuma das travas jurídicas foi pulada no caminho novo", () => {
  for (const trava of ["garantirFecho(", "filtrarNotaDeRiscos(", "comAvisoDeContextoResumido(", "documentosConsultados(", "sincronizarCitacoes("]) {
    verdade(CODIGO_GRAVAR.includes(trava), `a gravação da minuta não chama ${trava} — é onde moram as travas jurídicas, e o caminho novo não pode pular nenhuma`);
  }
});

teste("TRAVA: a compatibilidade com a ponte antiga é decidida pelo TIPO do erro, nunca pela frase", () => {
  verdade(/iniciarGeracaoNoHermes\(/.test(CODIGO_GERAR), "a geração precisa DISPARAR na ponte — sem isso a espera voltou para dentro da requisição");
  verdade(
    /instanceof PonteSemCaminhoAssincrono/.test(CODIGO_GERAR),
    "a queda para o caminho síncrono precisa ser decidida pelo tipo do erro — ler a frase é a amarra invisível que esta casa já pagou caro",
  );
  // E o caminho síncrono continua existindo de verdade, com o mesmo teto de tempo de antes.
  verdade(/perguntarAoHermesComPerfil\(/.test(CODIGO_GERAR), "o caminho síncrono de compatibilidade sumiu — uma ponte antiga passaria a quebrar na cara do advogado");
  verdade(/ESPERA_PETICIONAMENTO_MS/.test(CODIGO_GERAR), "o caminho síncrono perdeu o teto de tempo próprio");
  // Os dois caminhos gravam pela MESMA função.
  verdade(/gravarMinutaGerada\(/.test(CODIGO_GERAR), "o caminho síncrono grava por fora da função compartilhada — é um segundo lugar para esquecer uma trava jurídica");
});

teste("TRAVA: o disparo grava os três campos que tornam a sessão colhível", () => {
  // ACHADO DA RODADA DE MUTAÇÃO DESTA ENTREGA. A primeira versão procurava os três nomes no
  // CORPO INTEIRO de `confirmarTriagemEGerar` — e o caminho síncrono de compatibilidade, logo
  // abaixo no mesmo corpo, também grava `geracaoIniciadaEm`. Tirar o campo do DISPARO passava
  // VERDE, e o estrago é mudo: a sessão disparada ficaria sem relógio, e a rede de segurança por
  // cron nunca a varreria — exatamente a promessa de "pode fechar a aba" deixando de valer, em
  // silêncio. É a mesma lição de sempre: a varredura precisa estar ancorada NO TRECHO de que fala.
  const inicio = CODIGO_GERAR.indexOf("iniciarGeracaoNoHermes(");
  verdade(inicio > 0, "sumiu o disparo assíncrono de confirmarTriagemEGerar — varredura cega");
  const fim = CODIGO_GERAR.indexOf("} catch (e) {", inicio);
  verdade(fim > inicio, "não achei o fim do bloco do disparo — varredura cega");
  const disparo = CODIGO_GERAR.slice(inicio, fim);
  verdade(disparo.length > 200, `o bloco do disparo saiu com ${disparo.length} caracteres — varredura cega`);
  for (const campo of ["hermesTarefaId", "geracaoIniciadaEm", "geracaoDocumentosLidos"]) {
    verdade(disparo.includes(campo), `o disparo não grava ${campo} — sem ele a sessão fica em GERANDO sem ninguém conseguir colhê-la`);
  }
  verdade(/status: "GERANDO"/.test(disparo), "o disparo precisa deixar a sessão em GERANDO — é o estado que a tela e o cron procuram");
});

teste("TRAVA: a ponte reiniciada NUNCA vira espera infinita — há prazo, e ele fecha o caminho", () => {
  // ACHADO DA RODADA DE MUTAÇÃO DESTA ENTREGA, e o mais caro dos três. A primeira versão
  // procurava `MOTIVO_GERACAO_PERDIDA` no corpo INTEIRO da colheita — e ele aparece num segundo
  // lugar (o `catch` da gravação que falha). Trocar o ramo da ponte reiniciada por "continua
  // trabalhando" passava VERDE, e o estrago é o pior possível para quem está olhando: a tela
  // giraria até o prazo máximo por uma geração que já não existe.
  const posRamo = CODIGO_COLHER.indexOf("instanceof GeracaoPerdidaNaPonte");
  verdade(posRamo > 0, "a colheita precisa reconhecer a tarefa desconhecida pelo TIPO do erro");
  const ramo = CODIGO_COLHER.slice(posRamo, posRamo + 700);
  verdade(/marcarFalhaDaGeracao\(sessaoId, MOTIVO_GERACAO_PERDIDA\)/.test(ramo),
    "o ramo da ponte reiniciada precisa MARCAR a falha com a recusa falada — sem isso a sessão continua em GERANDO e a tela gira até o prazo máximo");
  verdade(/estado: "falhou"/.test(ramo),
    "o ramo da ponte reiniciada precisa devolver 'falhou' — devolver 'trabalhando' é a espera infinita que esta entrega existe para não criar");
  verdade(/passouDoPrazo/.test(CODIGO_COLHER), "sumiu o prazo máximo — uma consulta que sempre diz 'trabalhando' deixaria a tela girando para sempre");
  // Uma falha de REDE não pode jogar fora uma geração que talvez já esteja pronta.
  verdade(
    /estado: "trabalhando"/.test(CODIGO_COLHER),
    "a colheita precisa poder devolver 'trabalhando' — transformar uma falha de rede em falha definitiva jogaria fora a peça",
  );
});

teste("TRAVA: os erros tipados da ponte são de fato subtipos — um `catch` genérico ainda os pega", () => {
  // Exercitado, não varrido: uma hierarquia errada faria `erro instanceof FalhaDoHermes` (o
  // `catch` que já existe em toda a casa) deixar de reconhecê-los.
  verdade(new PonteSemCaminhoAssincrono() instanceof FalhaDoHermes, "PonteSemCaminhoAssincrono deixou de ser uma FalhaDoHermes");
  verdade(new GeracaoPerdidaNaPonte() instanceof FalhaDoHermes, "GeracaoPerdidaNaPonte deixou de ser uma FalhaDoHermes");
  igual(new PonteSemCaminhoAssincrono().status, 404, "a decisão de cair no síncrono é pelo código 404: ");
});

// ── 8. A REDE DE SEGURANÇA POR CRON ─────────────────────────────────────────────────────────

teste("a rede de segurança por cron existe, é fail-closed e está agendada", () => {
  const rota = readFileSync(join(RAIZ, "app", "api", "cron", "minutas-pendentes", "route.ts"), "utf8");
  const codigo = codigoDe(rota);
  verdade(/varrerGeracoesDeMinutaPendentes\(/.test(codigo), "o cron não chama a varredura");
  // FAIL-CLOSED: sem CRON_SECRET, recusa — nunca "por segurança ser opcional".
  verdade(/!secret \|\| auth !== `Bearer \$\{secret\}`/.test(codigo), "o cron não é fail-closed: sem CRON_SECRET configurado ele precisa RECUSAR");
  verdade(/status: 401/.test(codigo), "a recusa do cron precisa ser 401");
  const vercel = JSON.parse(readFileSync(join(RAIZ, "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
  const agendado = vercel.crons.find((c) => c.path === "/api/cron/minutas-pendentes");
  verdade(Boolean(agendado), "o cron não está agendado em vercel.json — a promessa de 'pode fechar a aba' seria mentira");
  igual(agendado!.schedule, "*/5 * * * *", "o intervalo do cron mudou — o mesmo dos outros dois da casa: ");
});

teste("TRAVA: a varredura do cron ATRAVESSA os escritórios e tem teto por rodada", () => {
  const varredura = codigoDe(corpoDaFuncao(FONTE_GERACAO, "varrerGeracoesDeMinutaPendentes"));
  verdade(varredura.length > 400, `a varredura devolveu ${varredura.length} caracteres — varredura cega`);
  verdade(/status: "GERANDO"/.test(varredura), "o cron precisa procurar por GERANDO");
  verdade(
    !/officeId/.test(varredura),
    "o cron passou a filtrar por escritório — uma sessão em GERANDO tem de terminar seja de quem for, e é a colheita que carrega o officeId da própria linha",
  );
  verdade(/take:/.test(varredura), "sem teto por rodada, uma fila grande estouraria o maxDuration e nenhuma sessão seria colhida");
  // A sessão do caminho SÍNCRONO (sem tarefa na ponte) também precisa ser varrida — senão ela
  // fica em GERANDO para sempre quando a Vercel corta a função no meio.
  verdade(/geracaoIniciadaEm: null/.test(varredura), "as sessões sem tarefa na ponte (caminho síncrono, e as de antes desta entrega) ficariam em GERANDO para sempre");
});

// ── 9. O QUE A TELA DIZ — e por que ela pode dizer ──────────────────────────────────────────

teste("TRAVA: a tela mostra andamento, promete o que é verdade, e NÃO inventa porcentagem", () => {
  const tela = readFileSync(join(RAIZ, "components", "peticionamento", "GerandoClient.tsx"), "utf8");
  const codigo = codigoDe(tela);
  verdade(codigo.length > 800, `a varredura da tela devolveu ${codigo.length} caracteres — varredura cega`);
  verdade(/acompanharGeracaoDaMinuta\(/.test(codigo), "a tela não acompanha a geração — seria uma tela parada, indistinguível de uma tela quebrada");

  // A PROMESSA. Ela só pode ser feita porque o cron existe (conferido no caso acima).
  // NO CÓDIGO, e não no arquivo cru: o comentário do topo da tela EXPLICA a promessa ("que ele
  // PODE FECHAR A ABA sem perder o trabalho"), e uma busca no arquivo inteiro encontraria a
  // explicação da promessa e daria a promessa por feita. É o defeito nº 1 de
  // lib/testes/executar.ts, e ele já aconteceu quatro vezes numa rodada só nesta casa.
  verdade(/fechar esta aba/i.test(codigo), "a tela precisa dizer que a aba pode ser fechada — é a diferença que esta entrega entrega");

  // E NADA DE PORCENTAGEM. O sistema não sabe quanto falta; inventar número é a coisa que esta
  // casa mais evita. A régua é sobre o que a tela CALCULA, não sobre a palavra aparecer num
  // comentário — por isso `codigoDe` primeiro.
  verdade(!/%/.test(codigo.replace(/className=|style=/g, "")) || !/progres|porcentagem|percentual/i.test(codigo), "a tela calcula progresso — o sistema não sabe quanto falta");
  verdade(!/<progress/i.test(codigo), "a tela usa um <progress>, que é uma barra com escala — e não há escala nenhuma para mostrar");
  verdade(/desdeMs/.test(codigo), "o único número da tela precisa ser o tempo decorrido, que é um fato medido");
});

teste("TRAVA: a ação de acompanhamento confere acesso e escritório ANTES de olhar a sessão", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "acompanharGeracaoDaMinuta"));
  verdade(corpo.length > 120, `acompanharGeracaoDaMinuta devolveu ${corpo.length} caracteres — varredura cega`);
  const posAcesso = corpo.indexOf("exigirAcessoAba");
  const posGuarda = corpo.indexOf("carregarSessaoOuFalhar");
  const posColheita = corpo.indexOf("colherGeracaoDaMinuta");
  verdade(posAcesso >= 0 && posGuarda > posAcesso, "a ação precisa exigir acesso à aba e reconferir o escritório — o id vem do cliente");
  verdade(posGuarda < posColheita, "a colheita roda antes da guarda de escritório — um id de outro escritório leria a geração alheia");
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// ACHADO DA REVISÃO — A FALHA TAMBÉM PRECISA REIVINDICAR, E SÓ A GRAVAÇÃO ESTAVA PROVADA.
//
// A mutação M10 desta entrega tirou `status: "GERANDO"` do `where` da GRAVAÇÃO e caiu em
// vermelho, como devia. Tirei o mesmo do `where` da MARCAÇÃO DE FALHA e as 77 suítes ficaram
// VERDES. É a assimetria clássica: prova-se o caminho feliz da reivindicação e esquece-se o
// triste, que é justamente o que roda quando algo já deu errado.
//
// O estrago é grande e silencioso. Quem chega DEPOIS — a segunda aba aberta na mesma sessão, ou
// o cron passando logo após a tela ter colhido — lê a tarefa que já foi consumida (`ler_tarefa`
// faz `pop`), recebe "desconhecida" da ponte e conclui, corretamente do seu ponto de vista, que a
// geração se perdeu. Sem a reivindicação, essa conclusão sobrescreve uma sessão que já está
// GERADA: o advogado lê "a geração se perdeu" diante de uma minuta que existe, inteira, no banco.
// O texto não é apagado — o que se perde é a capacidade de chegar até ele, que dá no mesmo para
// quem está usando.
// ══════════════════════════════════════════════════════════════════════════════════════════

teste("TRAVA: marcar falha REIVINDICA — nunca sobrescreve uma sessão que já saiu de GERANDO", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_GERACAO, "marcarFalhaDaGeracao"));
  verdade(corpo.length > 150, `corpoDaFuncao("marcarFalhaDaGeracao") devolveu ${corpo.length} caracteres — varredura cega`);

  // Não exijo grafia: exijo que o `where` do updateMany que escreve FALHA_GERACAO condicione ao
  // estado anterior. Qualquer forma de escrever isso passa; nenhuma forma de omitir passa.
  const posUpdate = corpo.indexOf("updateMany(");
  verdade(posUpdate >= 0, "a marcação de falha deixou de usar updateMany — sem ele não há reivindicação possível");
  const posWhere = corpo.indexOf("where:", posUpdate);
  const posData = corpo.indexOf("data:", posUpdate);
  verdade(posWhere >= 0 && posData > posWhere, "não achei o where/data da marcação de falha");
  const clausula = corpo.slice(posWhere, posData);
  verdade(/status:\s*"GERANDO"/.test(clausula),
    `o where da marcação de falha não exige o estado anterior: \`${clausula.trim()}\` — a segunda aba (ou o cron) viraria uma sessão JÁ GERADA em "falhou", e o advogado leria "a geração se perdeu" sobre uma minuta que existe`);

  // E o resultado da reivindicação tem de ser DEVOLVIDO, senão quem chama não sabe se foi ele que
  // marcou — que é exatamente o que M11 provou para a gravação.
  verdade(/count\s*>\s*0/.test(corpo),
    "a marcação de falha não devolve mais se FOI ELA que marcou — quem chama não tem como saber que perdeu a corrida");
});

teste("TRAVA: quem decide 'perdida' respeita a resposta da reivindicação", () => {
  // Não basta reivindicar: o ramo que declara a geração perdida precisa OLHAR o resultado. Se
  // ignorar, ele conta ao advogado uma história que não aconteceu no banco.
  const corpo = codigoDe(corpoDaFuncao(FONTE_GERACAO, "colherGeracaoDaMinuta"));
  const pos = corpo.indexOf("MOTIVO_GERACAO_PERDIDA");
  verdade(pos >= 0, "sumiu o ramo de geração perdida");
  const trecho = corpo.slice(Math.max(0, pos - 400), pos + 400);
  verdade(/const\s+marcou\s*=|marcou\s*\?|if\s*\(\s*marcou/.test(trecho),
    "o ramo de geração perdida ignora o resultado da reivindicação — declararia perdida uma geração que outro caminho já concluiu");
});

resumo("Peticionamento — a geração sai de dentro da requisição web");
