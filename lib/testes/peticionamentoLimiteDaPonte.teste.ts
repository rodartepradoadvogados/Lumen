import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  avaliarJanela,
  bytesDaMensagemNoCorpo,
  CORPO_MAXIMO_DA_PONTE_BYTES,
  ENVELOPE_DO_CORPO_BYTES,
  LIMITE_DE_BYTES_DA_MENSAGEM,
  LIMITE_PADRAO_CARACTERES,
  PERGUNTA_MAXIMA_DA_PONTE,
  FOLGA_ATE_A_PONTE,
} from "@/lib/peticionamentoJanelaDeContexto";
import { montarMensagemParaHermes, custoFixoDaMensagem, RESERVA_DO_AVISO_DE_RESUMO, type DadosParaPrompt } from "@/lib/peticionamentoPrompt";
import { LIMITE_DA_PERGUNTA } from "@/lib/agenteAtendimento";
import { ESPERA_MS, ESPERA_PETICIONAMENTO_MS, FalhaDoHermes, perguntarAoHermesComPerfil } from "@/lib/hermesPonte";

// ============================================================================================
// ESTE É O TESTE QUE TERIA PEGADO O DEFEITO.
//
// A trava de tamanho do peticionamento media TOKENS e parava em 128.000 (~512.000 caracteres).
// Quem recusa de verdade é a ponte, que conta CARACTERES e parava em 16.000. A trava era ~32x
// mais frouxa que o limite real: nunca disparava. Todas as suítes estavam verdes — porque
// NENHUMA comparava os dois números. O dono descobriu em produção, com
// `400 {"erro": "mensagem ausente ou longa demais"}` na tela, no primeiro uso com dois
// documentos anexados.
//
// A regra desta casa depois disto: quando um limite nosso existe POR CAUSA de um limite de outro
// sistema, o teste lê os DOIS e falha se divergirem. Não basta testar o nosso contra ele mesmo —
// foi exatamente isso que a suíte antiga fazia, e ela passou verde o defeito inteiro.
// ============================================================================================

const RAIZ = process.cwd();
const PONTE = readFileSync(join(RAIZ, "servidor-hermes", "servidor.py"), "utf8");
const LEIAME = readFileSync(join(RAIZ, "servidor-hermes", "LEIA-ME.md"), "utf8");
const FONTE_ACOES = readFileSync(join(RAIZ, "lib", "actions", "peticionamento.ts"), "utf8");
const FONTE_CONFIRMAR = readFileSync(join(RAIZ, "app", "peticionamento", "[id]", "confirmar", "page.tsx"), "utf8");

/**
 * O CÓDIGO da ponte, sem comentário nenhum — o `codigoDe` desta casa só conhece comentário de
 * JavaScript (`//`, `*`, `/*`), e `servidor.py` comenta com `#` e documenta com `"""`.
 *
 * Isto não é preciosismo: os comentários deste arquivo CITAM o código de que falam — falam de
 * `-q`, de `--query-file`, de `Argument list too long`. Uma varredura que os lesse encontraria a
 * trava dentro da explicação da trava e passaria verde com o defeito instalado. É o defeito nº 1
 * documentado em lib/testes/executar.ts, e ele já aconteceu quatro vezes numa rodada só.
 */
function codigoPythonDe(fonte: string): string {
  return fonte
    .replace(/"""[\s\S]*?"""/g, '""" """') // docstrings: fora
    .split("\n")
    .map((linha) => linha.replace(/#.*$/, "")) // comentário de linha inteira E de fim de linha
    .join("\n");
}

const CODIGO_PONTE = codigoPythonDe(PONTE);

teste("a varredura do servidor.py não está cega — e não enxerga os próprios comentários", () => {
  verdade(CODIGO_PONTE.length > 3_000, `codigoPythonDe(servidor.py) devolveu ${CODIGO_PONTE.length} caracteres`);
  verdade(/def executar_hermes\(/.test(CODIGO_PONTE), "sumiu executar_hermes do trecho varrido");
  verdade(
    !/MAX_ARG_STRLEN/.test(CODIGO_PONTE),
    "a varredura ainda enxerga comentário: MAX_ARG_STRLEN só aparece em comentário, e se ela o lê, ela lê qualquer explicação como se fosse código",
  );
});

function numeroDaPonte(nome: string): number {
  const achado = PONTE.match(new RegExp(`^${nome}\\s*=\\s*([\\d_ *]+)`, "m"));
  verdade(Boolean(achado), `${nome} sumiu de servidor-hermes/servidor.py`);
  const bruto = (achado?.[1] ?? "0").replace(/_/g, "").trim();
  // Aceita "512 * 1024" além de "200000": é assim que CORPO_MAXIMO está escrito lá.
  const partes = bruto.split("*").map((p) => Number(p.trim()));
  const valor = partes.reduce((a, b) => a * b, 1);
  verdade(Number.isFinite(valor) && valor > 0, `não deu para ler ${nome} de servidor.py`);
  return valor;
}

// ── 1. OS DOIS NÚMEROS SÃO O MESMO NÚMERO ───────────────────────────────────────────────────

teste("O TESTE QUE FALTAVA: o limite do Lúmen é EXATAMENTE o PERGUNTA_MAXIMA da ponte", () => {
  const daPonte = numeroDaPonte("PERGUNTA_MAXIMA");
  igual(
    PERGUNTA_MAXIMA_DA_PONTE,
    daPonte,
    `PERGUNTA_MAXIMA_DA_PONTE (${PERGUNTA_MAXIMA_DA_PONTE}) precisa espelhar servidor.py (${daPonte}) — ` +
      "mudar um lado só é EXATAMENTE como este defeito chegou à produção",
  );
});

teste("o limite que o Lúmen aplica é MENOR que o da ponte — a recusa tem de ser nossa, e falada", () => {
  verdade(
    LIMITE_PADRAO_CARACTERES < PERGUNTA_MAXIMA_DA_PONTE,
    `o nosso limite (${LIMITE_PADRAO_CARACTERES}) precisa caber no da ponte (${PERGUNTA_MAXIMA_DA_PONTE})`,
  );
  verdade(FOLGA_ATE_A_PONTE > 0, "sem folga nenhuma, um caractere a mais na serialização vira 400 cru na tela do advogado");
});

teste("a unidade é CARACTERE, não token — o defeito nasceu de medir numa unidade e recusar em outra", () => {
  const fonte = readFileSync(join(RAIZ, "lib", "peticionamentoJanelaDeContexto.ts"), "utf8");
  const codigo = codigoDe(fonte);
  verdade(codigo.length > 1000, "a varredura não encontrou o módulo da janela — não está cega?");
  verdade(!/LIMITE_PADRAO_TOKENS/.test(codigo), "o limite em TOKENS não pode voltar: a ponte conta caracteres");
  verdade(/caracteresTotaisFinais/.test(codigo), "a avaliação precisa reportar o total em caracteres");
});

// ADAPTADO NESTA ENTREGA (não afrouxado — apertado). A versão anterior conferia
// `CORPO_MAXIMO >= PERGUNTA_MAXIMA * 1,5`, com o comentário "1,5 byte por caractere é margem de
// sobra". Isso é uma RAZÃO CHUTADA, e razão chutada não é medição: é a mesma família de conta
// que deixou um teto de 200.000 conviver, por uma entrega inteira, com um limite real de
// ~125.000. Agora a conta é feita com uma string de português DE VERDADE, serializada pelo mesmo
// `JSON.stringify` que a chamada usa, e medida em BYTES UTF-8 — que é byte a byte o que o
// `content-length` vai declarar.
teste("MEDIDO, não estimado: a maior pergunta que a ponte aceita cabe no corpo que ela aceita", () => {
  const corpo = numeroDaPonte("CORPO_MAXIMO");
  igual(
    CORPO_MAXIMO_DA_PONTE_BYTES,
    corpo,
    `CORPO_MAXIMO_DA_PONTE_BYTES (${CORPO_MAXIMO_DA_PONTE_BYTES}) precisa espelhar servidor.py (${corpo}) — ` +
      "é a segunda metade da corrente de tamanho, e ela também quebra se um lado só mudar",
  );

  // Português de peça jurídica: acento em quantidade, aspas e quebras de linha (que o JSON
  // escapa). Repetido até bater EXATAMENTE o teto de caracteres da ponte.
  const trecho = 'Ação de obrigação de fazer c/c indenização por danos morais — negativa de cobertura.\nO "rol da ANS" é exemplificativo, à luz do Tema 1.365/STJ; não há óbice à concessão da tutela.\n';
  const mensagem = trecho.repeat(Math.ceil(PERGUNTA_MAXIMA_DA_PONTE / trecho.length)).slice(0, PERGUNTA_MAXIMA_DA_PONTE);
  igual(mensagem.length, PERGUNTA_MAXIMA_DA_PONTE, "premissa: a mensagem do teste tem de ter o tamanho máximo que a ponte aceita");

  // O CORPO DE VERDADE, com os campos que `perguntarAoHermesComPerfil` manda.
  const corpoReal = JSON.stringify({
    perfil: "peticionamento-lumen",
    mensagem,
    sessao: "s".repeat(128),
    ferramentas: { url: `https://exemplo.com.br/${"u".repeat(200)}`, credencial: "c".repeat(2_000) },
  });
  const bytes = Buffer.byteLength(corpoReal, "utf8");

  verdade(
    bytes > PERGUNTA_MAXIMA_DA_PONTE,
    `premissa do teste: ${PERGUNTA_MAXIMA_DA_PONTE} caracteres de português TÊM de pesar mais que ${PERGUNTA_MAXIMA_DA_PONTE} bytes ` +
      `(saiu ${bytes}) — se pesassem o mesmo, este teste não estaria medindo unidade nenhuma`,
  );
  verdade(
    bytes < corpo,
    `o corpo da maior pergunta possível sai com ${bytes} bytes e CORPO_MAXIMO é ${corpo} — ` +
      "a trava de corpo recusaria com 413, sem explicar nada, o pedido que a trava de pergunta acabou de aprovar",
  );
});

// ── A TRAVA DE BYTES DO LÚMEN ──────────────────────────────────────────────────────────────

teste("a trava de BYTES do Lúmen dispara antes do 413 da ponte, e mede o corpo serializado", () => {
  verdade(
    LIMITE_DE_BYTES_DA_MENSAGEM < CORPO_MAXIMO_DA_PONTE_BYTES,
    "o nosso teto de bytes precisa ser menor que o da ponte — quem recusa tem de ser quem sabe explicar",
  );
  igual(
    LIMITE_DE_BYTES_DA_MENSAGEM,
    CORPO_MAXIMO_DA_PONTE_BYTES - ENVELOPE_DO_CORPO_BYTES,
    "o teto de bytes da mensagem é o do corpo menos o que o resto do corpo ocupa",
  );

  // MEDIÇÃO, não estimativa: `bytesDaMensagemNoCorpo` tem de contar os ESCAPES e os ACENTOS.
  const comAcento = "ação";
  verdade(
    bytesDaMensagemNoCorpo(comAcento) > comAcento.length,
    `"${comAcento}" tem ${comAcento.length} caracteres e ${bytesDaMensagemNoCorpo(comAcento)} bytes no corpo — ` +
      "se der o mesmo número, a medição voltou a ser em caracteres, que é o erro de unidade desta entrega inteira",
  );
  const comAspas = 'diz "sim"\ne sai';
  verdade(
    // A conta, explícita: duas aspas escapadas (+2), uma quebra de linha virando `\\n` (+1) e as
    // duas aspas que envolvem a string inteira (+2) — cinco bytes que o corpo carrega e que
    // `.length` da mensagem não enxerga.
    bytesDaMensagemNoCorpo(comAspas) === Buffer.byteLength(comAspas, "utf8") + 5,
    `o escape do JSON não está sendo contado: a mensagem tem ${Buffer.byteLength(comAspas, "utf8")} bytes e sai com ${bytesDaMensagemNoCorpo(comAspas)} no corpo`,
  );

  // O ENVELOPE tem de cobrir o que o corpo gasta FORA da mensagem — senão o teto é otimista.
  const semMensagem = JSON.stringify({
    perfil: "p".repeat(63),
    mensagem: "",
    sessao: "s".repeat(128),
    ferramentas: { url: `https://exemplo.com.br/${"u".repeat(200)}`, credencial: "c".repeat(2_000) },
  });
  verdade(
    ENVELOPE_DO_CORPO_BYTES >= Buffer.byteLength(semMensagem, "utf8"),
    `o resto do corpo pesa ${Buffer.byteLength(semMensagem, "utf8")} bytes no pior caso e a reserva é de ${ENVELOPE_DO_CORPO_BYTES} — ` +
      "sem reserva suficiente, a trava aprova um pedido que a ponte recusa com 413",
  );
});

// ── 1-B. A PERGUNTA NÃO VIAJA MAIS PELA LINHA DE COMANDO ────────────────────────────────────
//
// O SEGUNDO DEFEITO QUE A PRODUÇÃO REVELOU, e a razão de esta seção existir.
//
// A entrega anterior subiu PERGUNTA_MAXIMA para 200.000 e o número era INALCANÇÁVEL: a ponte
// mandava a pergunta como UM argumento de linha de comando (`-q <mensagem>`), e o Linux limita um
// único argumento a MAX_ARG_STRLEN = 32 páginas = 131.072 BYTES. Em português com acento isso são
// ~110.000 a ~125.000 caracteres. O registro real da VPS, com 160.059 caracteres:
//
//   [ponte-hermes] pergunta para peticionamento-lumen (160059 caracteres, nova conversa, ...)
//   [ponte-hermes] falha ao executar o Hermes: [Errno 7] Argument list too long
//
// Nove milésimos de segundo; nunca chegou ao Hermes. E o Lúmen aprovava (a trava dele é 190.000),
// então o advogado recebia `500 {"erro": "falha ao executar o Hermes"}` na tela — PIOR que o 400
// que existia antes, porque não diz o que fazer.
//
// O conserto não foi baixar o teto: `hermes chat` aceita `--query-file PATH`, e `-` lê da entrada
// padrão. Com a pergunta fora do argv, MAX_ARG_STRLEN deixa de ser teto do produto. Estes testes
// guardam justamente isso — que ela não VOLTE para lá.

/** MAX_ARG_STRLEN: 32 × tamanho de página. 4 KiB é a página de todo x86-64, e é o PISO. */
const TETO_DE_ARGUMENTO_BYTES = 32 * 4096;

teste("O TESTE QUE FALTAVA (segunda parte): a pergunta NÃO vai no argv — vai pela entrada padrão", () => {
  // ADAPTADO NA ENTREGA DA GERAÇÃO ASSÍNCRONA: o argv passou a ser montado em VÁRIAS LINHAS,
  // porque ganhou `--run-budget` e `--max-turns` (o agente precisa SABER que há prazo, em vez de
  // ser morto no meio da redação). A regra não mudou — a pergunta continua fora do argv —, mas a
  // busca presa a `[HERMES_BIN` numa linha só deixou de achar a montagem e passou a acusar
  // "varredura cega". Agora ela encontra a lista inteira, em quantas linhas ela estiver.
  const argv = CODIGO_PONTE.match(/argumentos = \[[\s\S]*?\]/);
  verdade(Boolean(argv), "não achei a montagem do argv em servidor.py — varredura cega");
  const linha = argv![0];

  verdade(/--query-file/.test(linha), `o argv não usa --query-file: \`${linha}\``);
  verdade(
    !/"-q"/.test(linha) && !/'-q'/.test(linha),
    `\`-q\` voltou ao argv: \`${linha}\` — é ele que põe a pergunta inteira num argumento só e estoura MAX_ARG_STRLEN`,
  );
  verdade(
    !/\bmensagem\b/.test(linha),
    `a variável \`mensagem\` voltou para a linha de comando: \`${linha}\` — é exatamente o defeito que esta entrega conserta`,
  );
  // `-q` e `--query-file` são MUTUAMENTE EXCLUSIVOS: mandar os dois é erro de uso do binário.
  verdade(
    /input=mensagem/.test(CODIGO_PONTE),
    "a pergunta precisa entrar por `input=` do subprocess — é o outro lado de `--query-file -`, e sem ele o Hermes fica esperando uma entrada que nunca vem",
  );
  // ACHADO DA RODADA DE MUTAÇÃO DESTA ENTREGA. A versão anterior desta linha procurava
  // `encoding="utf-8"` no ARQUIVO INTEIRO — e `servidor.py` já abre `/proc/meminfo` com
  // `encoding="utf-8"`. Tirar o encoding do `subprocess.run` passava VERDE, e o estrago é mudo:
  // numa VPS com `LANG=C` a pergunta sairia em ASCII e quebraria no primeiro "ção", sem nada no
  // registro dizer por quê. A varredura precisa estar ancorada NA CHAMADA de que fala.
  const chamadaDoSubprocesso = CODIGO_PONTE.match(/subprocess\.run\(\s*argumentos,[\s\S]*?\n    \)/);
  verdade(Boolean(chamadaDoSubprocesso), "não achei a chamada do subprocesso em executar_hermes — varredura cega");
  const chamada = chamadaDoSubprocesso![0];
  verdade(chamada.length > 100, `a chamada do subprocesso saiu com ${chamada.length} caracteres — varredura cega`);
  verdade(
    /input=mensagem/.test(chamada),
    "a pergunta precisa entrar pelo `input=` DESTA chamada — não adianta existir noutro lugar do arquivo",
  );
  verdade(
    /encoding="utf-8"/.test(chamada),
    'a codificação DESTA chamada precisa ser UTF-8 explícita — numa VPS com LANG=C o padrão do Python quebraria no primeiro "ção"',
  );
});

teste("a conta explícita: o argv que sobrou cabe com folga em MAX_ARG_STRLEN", () => {
  // Cada peça do argv no PIOR caso que a própria ponte admite, mais o byte nulo com que o
  // sistema termina cada argumento.
  const pecas: { o_que: string; bytes: number }[] = [
    { o_que: "HERMES_BIN (caminho do binário, folgado)", bytes: 256 },
    { o_que: '"-p"', bytes: 2 },
    { o_que: "perfil (PERFIL_VALIDO: até 63 caracteres)", bytes: 63 },
    { o_que: '"chat"', bytes: 4 },
    { o_que: '"--query-file"', bytes: 12 },
    { o_que: '"-" (entrada padrão)', bytes: 1 },
    { o_que: '"--oneshot"', bytes: 9 },
    { o_que: '"-Q"', bytes: 2 },
    // ACRESCENTADOS NA ENTREGA DA GERAÇÃO ASSÍNCRONA: `--run-budget` faz o agente CONCLUIR em vez
    // de ser morto no meio da redação, e `--max-turns` impede uma ferramenta em laço de consumir
    // o orçamento inteiro sem escrever nada. Entram nesta conta porque ela é a conta do argv REAL
    // — deixá-los de fora faria este caso medir um comando que não existe mais.
    { o_que: '"--run-budget"', bytes: 13 },
    { o_que: "o número de segundos do orçamento", bytes: 6 },
    { o_que: '"--max-turns"', bytes: 12 },
    { o_que: "o número de iterações", bytes: 6 },
    // O ESQUECIDO: só aparece ao CONTINUAR uma conversa, que é o caminho menos testado.
    { o_que: '"--resume"', bytes: 8 },
    { o_que: "id da sessão (SESSAO_VALIDA: até 128 caracteres)", bytes: 128 },
  ];
  const nulos = pecas.length; // um byte nulo por argumento
  const total = pecas.reduce((s, p) => s + p.bytes, 0) + nulos;

  verdade(
    total < TETO_DE_ARGUMENTO_BYTES,
    `o argv soma ${total} bytes e o teto de um argumento é ${TETO_DE_ARGUMENTO_BYTES}: ${pecas.map((p) => `${p.o_que}=${p.bytes}`).join(" + ")} + ${nulos} nulos`,
  );
  // E sobra tanto que a folga da ponte (FOLGA_DO_ARGV_BYTES) ainda cobre o argv inteiro.
  const folga = numeroDaPonte("FOLGA_DO_ARGV_BYTES");
  verdade(
    total < folga,
    `o argv (${total} bytes) precisa caber até dentro da própria FOLGA da ponte (${folga}) — ` +
      "se não couber, o número que sobra para a pergunta deixou de ser o que este arquivo diz que é",
  );
  igual(numeroDaPonte("TETO_DE_ARGUMENTO_BYTES"), TETO_DE_ARGUMENTO_BYTES, "MAX_ARG_STRLEN é 32 × 4096 dos dois lados");
});

teste("TRAVA: a ponte recusa por tamanho ANTES de executar — nunca deixa o exec estourar com E2BIG", () => {
  const corpo = CODIGO_PONTE.slice(CODIGO_PONTE.indexOf("def executar_hermes("));
  verdade(corpo.length > 500, `o trecho de executar_hermes saiu com ${corpo.length} caracteres — varredura cega`);

  const posConferencia = corpo.indexOf("checar_argumentos(argumentos)");
  const posExecucao = corpo.indexOf("subprocess.run(");
  verdade(posConferencia > 0, "sumiu a conferência de tamanho do argv de executar_hermes");
  verdade(posExecucao > 0, "sumiu a execução de executar_hermes — varredura cega");
  verdade(
    posConferencia < posExecucao,
    "a conferência de tamanho roda DEPOIS do subprocess.run — conferir depois não impede nada, e o exec já estourou com [Errno 7]",
  );

  // A conferência mede BYTES, não caracteres: MAX_ARG_STRLEN é um limite de bytes, e medir em
  // caracteres foi o erro de unidade que fez 200.000 parecer alcançável.
  const conferencia = CODIGO_PONTE.slice(CODIGO_PONTE.indexOf("def checar_argumentos("), CODIGO_PONTE.indexOf("def executar_hermes("));
  verdade(conferencia.length > 200, `o trecho de checar_argumentos saiu com ${conferencia.length} caracteres — varredura cega`);
  verdade(
    /encode\("utf-8"\)/.test(conferencia),
    "a conferência do argv precisa medir BYTES UTF-8 — `len()` de string em Python conta caracteres, que é a unidade errada para MAX_ARG_STRLEN",
  );

  // E a recusa vira 400 FALADO, com a MESMA frase que o Lúmen já sabe traduzir.
  //
  // ADAPTADO NA ENTREGA DA GERAÇÃO ASSÍNCRONA. Esta parte procurava `except ArgumentoGrandeDemais`
  // dentro da rota e, logo depois dele, `self._responder(400`. A tradução de erro saiu de dentro
  // da rota: com o caminho assíncrono passou a existir um SEGUNDO lugar que precisa exatamente
  // das mesmas frases (a tarefa que roda na thread não tem requisição aberta para responder), e
  // duas cópias divergiriam em silêncio. Hoje ela mora em `classificar_falha`, que os dois
  // caminhos chamam.
  //
  // A RÉGUA FICOU MAIS FORTE, não mais fraca: o mapeamento inteiro (400/501/404/504/500 e as
  // frases de cada um) é EXERCITADO de verdade, com a ponte subida, em
  // lib/testes/peticionamentoGeracaoAssincrona.teste.ts. Aqui fica só a costura: a rota delega, e
  // a tradução existe.
  verdade(
    /def classificar_falha\(/.test(CODIGO_PONTE),
    "sumiu a tradução de falha da ponte — sem ela, cada caminho traduziria o mesmo defeito de um jeito, e o Lúmen só sabe traduzir um deles",
  );
  const traducao = CODIGO_PONTE.slice(CODIGO_PONTE.indexOf("def classificar_falha("));
  verdade(
    /ArgumentoGrandeDemais/.test(traducao.slice(0, 1_200)) && /"mensagem ausente ou longa demais"/.test(traducao.slice(0, 1_200)),
    "a recusa por tamanho de argumento precisa usar a MESMA frase de tamanho que já existe — uma frase nova é um caminho novo para o advogado ficar sem instrução",
  );
  verdade(
    /return 400, \{"erro": "mensagem ausente ou longa demais"\}/.test(traducao.slice(0, 1_200)),
    "a recusa por tamanho tem de ser 400 (pedido) e não 500 (servidor) — um 500 diz ao advogado que a culpa é da máquina e que não há o que ele faça",
  );
  // E a rota do `/chat` DELEGA a esta tradução, em vez de escrever a sua própria ao lado.
  const rotaSincrona = CODIGO_PONTE.slice(CODIGO_PONTE.indexOf("def _chat_sincrono("));
  verdade(rotaSincrona.length > 200, `o trecho de _chat_sincrono saiu com ${rotaSincrona.length} caracteres — varredura cega`);
  verdade(
    /classificar_falha\(erro, perfil\)/.test(rotaSincrona.slice(0, 900)),
    "o caminho síncrono (o da Ana) parou de usar a tradução compartilhada — é assim que as duas cópias começam a divergir",
  );
});

// ── 2. O CAMINHO DA ANA NÃO PODE AFROUXAR ───────────────────────────────────────────────────

teste("subir o teto da ponte NÃO afrouxou o orçamento do atendimento (Ana)", () => {
  igual(LIMITE_DA_PERGUNTA, 7_500, "o orçamento da Ana é dela e continua valendo — não se mexe nele para caber peticionamento");
  verdade(LIMITE_DA_PERGUNTA < PERGUNTA_MAXIMA_DA_PONTE, "o pedido da Ana continua cabendo no teto de CARACTERES da ponte");
  // ADAPTADO NESTA ENTREGA: a linha acima compara caractere com caractere e está certa, mas
  // sozinha ela não provava que o pedido da Ana cabe no teto de BYTES do corpo — e foi comparar
  // grandezas de unidades diferentes, achando que provava algo, o defeito desta entrega. Um
  // caractere custa no máximo 4 bytes em UTF-8; é esse o pior caso, e é ele que tem de caber.
  verdade(
    LIMITE_DA_PERGUNTA * 4 < LIMITE_DE_BYTES_DA_MENSAGEM,
    `no PIOR caso de UTF-8 o pedido da Ana pesa ${LIMITE_DA_PERGUNTA * 4} bytes, e o teto de bytes é ${LIMITE_DE_BYTES_DA_MENSAGEM}`,
  );
  igual(ESPERA_MS, 105_000, "a espera do caminho de conversa continua 105s — esperar quatro minutos por uma resposta de chat é defeito, não paciência");
});

// ── 3. A CORRENTE DE TEMPOS ─────────────────────────────────────────────────────────────────
//
// Cada elo tem de ser menor que o seguinte. Se a espera não comportar o pedido maior, trocamos um
// 400 limpo por um tempo esgotado — que é pior: não diz nada e ainda cobra a espera.

teste("a corrente de tempos é crescente: Lúmen < ponte < nginx < Vercel", () => {
  // ESPERA_S vem de `int(os.environ.get("HERMES_TIMEOUT_S", "240"))` — o número que vale quando
  // ninguém define a variável é o que precisa entrar na corrente.
  const espera = PONTE.match(/HERMES_TIMEOUT_S",\s*"(\d+)"/);
  verdade(Boolean(espera), "HERMES_TIMEOUT_S sumiu de servidor-hermes/servidor.py");
  const ponteS = Number(espera?.[1] ?? 0);
  const nginx = LEIAME.match(/proxy_read_timeout\s+(\d+)s/);
  verdade(Boolean(nginx), "proxy_read_timeout sumiu do LEIA-ME.md da ponte");
  const nginxS = Number(nginx?.[1] ?? 0);
  const vercel = FONTE_CONFIRMAR.match(/export const maxDuration\s*=\s*(\d+)/);
  verdade(Boolean(vercel), "a tela de confirmação precisa de maxDuration — é dela que sai a Server Action que fala com o Hermes");
  const vercelS = Number(vercel?.[1] ?? 0);

  const lumenS = ESPERA_PETICIONAMENTO_MS / 1000;
  verdade(lumenS < ponteS, `o Lúmen (${lumenS}s) precisa desistir antes da ponte (${ponteS}s) — é ele quem sabe explicar ao advogado`);
  verdade(ponteS < nginxS, `a ponte (${ponteS}s) precisa responder antes de o nginx cortar (${nginxS}s)`);
  verdade(nginxS < vercelS, `o nginx (${nginxS}s) precisa cortar antes de a Vercel matar a função (${vercelS}s)`);
});

teste("a espera do peticionamento comporta o pedido maior — não se sobe o teto de tamanho sem subir o de tempo", () => {
  verdade(
    ESPERA_PETICIONAMENTO_MS > ESPERA_MS,
    "um pedido com dezenas de páginas de documento não cabe no tempo dimensionado para uma pergunta de chat",
  );
});

// ── 4. A TRAVA MEDE A MENSAGEM FINAL, NÃO UM SUBCONJUNTO ────────────────────────────────────

function dados(documentos: { nome: string; texto: string }[], fatos: string): DadosParaPrompt {
  return {
    materias: ["Direito Médico e Saúde Suplementar"],
    categoriaPeca: "Petição",
    tipoPeca: "Ação de obrigação de fazer com pedido de tutela de urgência",
    tipoPecaOutro: null,
    contextoDescricao: "Processo nº 0000000-00.0000.0.00.0000 — TJGO · Atendimento — negativa de cobertura",
    fatos,
    pedidos: ["Tutela de urgência para autorização imediata do procedimento", "Condenação em danos morais"],
    // Prazo ausente e não preclusivo: os valores que NÃO ligam a seção nova do prompt, para
    // estas medições de tamanho continuarem medindo o mesmo pedido de antes.
    prazoFatal: null,
    prazoPreclusivo: false,
    teses: ["Rol da ANS exemplificativo", "Tema 1.365/STJ"],
    observacoes: "Cliente internada; urgência confirmada por relatório médico.",
    documentos,
    contextoFoiResumido: false,
    avisoDeResumo: null,
  };
}

/** Faz o caminho REAL: custo fixo → janela → mensagem montada. Devolve o tamanho final. */
function pedidoReal(documentos: { nome: string; texto: string }[], fatos: string) {
  const base = dados(
    documentos.map((d) => ({ nome: d.nome, texto: "" })),
    fatos,
  );
  const custoFixo = custoFixoDaMensagem(base);
  const avaliacao = avaliarJanela(
    [
      { id: "fatos", rotulo: "Fatos descritos pelo advogado", texto: fatos },
      ...documentos.map((d, i) => ({ id: `d${i}`, rotulo: d.nome, texto: d.texto, protegido: true })),
    ],
    { custoFixo },
  );
  const porId = new Map(avaliacao.itens.map((i) => [i.id, i]));
  const mensagem = montarMensagemParaHermes({
    ...base,
    fatos: porId.get("fatos")?.textoFinal ?? fatos,
    documentos: documentos.map((d, i) => ({ nome: d.nome, texto: porId.get(`d${i}`)?.textoFinal ?? d.texto })),
    contextoFoiResumido: avaliacao.acao === "resumido",
    avisoDeResumo: avaliacao.aviso,
  });
  return { avaliacao, mensagem };
}

teste("O DEFEITO Nº 2: a trava contava menos do que era enviado — agora o que ela aprova SEMPRE cabe na ponte", () => {
  // Documentos calibrados para caber por pouco se a conta for só a deles, e NÃO caber quando se
  // somam instruções, matéria, pedidos, teses, observações, cercas e marcadores. É o caso exato
  // que a trava antiga aprovava e a ponte recusava com 400.
  const metade = Math.floor(LIMITE_PADRAO_CARACTERES / 2);
  const { avaliacao, mensagem } = pedidoReal(
    [
      { nome: "Contestação da operadora.pdf", texto: "c".repeat(metade) },
      { nome: "Relatório médico.pdf", texto: "r".repeat(metade - 500) },
    ],
    "f".repeat(400),
  );
  igual(avaliacao.acao, "bloqueado", "o pedido inteiro passa do limite — aprovar isto é o defeito que o dono viu na tela");
  verdade(
    mensagem.length > LIMITE_PADRAO_CARACTERES,
    "confere a premissa do teste: a mensagem montada de fato estoura — se ela coubesse, o caso não provaria nada",
  );
});

teste("quando a trava diz OK, a mensagem final cabe DE VERDADE no teto da ponte", () => {
  for (const fatia of [0.2, 0.45, 0.6, 0.8, 0.9]) {
    const tamanho = Math.floor(LIMITE_PADRAO_CARACTERES * fatia);
    const { avaliacao, mensagem } = pedidoReal([{ nome: "Contrato.pdf", texto: "x".repeat(tamanho) }], "f".repeat(2_000));
    if (avaliacao.acao === "bloqueado") continue;
    verdade(
      mensagem.length <= PERGUNTA_MAXIMA_DA_PONTE,
      `com documento de ${tamanho} caracteres a decisão foi "${avaliacao.acao}" e a mensagem saiu com ${mensagem.length} — acima do teto da ponte (${PERGUNTA_MAXIMA_DA_PONTE})`,
    );
  }
});

teste("o custo fixo cresce com a lista de documentos — o NOME de cada anexo também ocupa lugar no pedido", () => {
  const um = custoFixoDaMensagem(dados([{ nome: "Um documento com nome razoavelmente comprido.pdf", texto: "" }], "fatos"));
  const vinte = custoFixoDaMensagem(
    dados(
      Array.from({ length: 20 }, (_, i) => ({ nome: `Documento número ${i} com nome razoavelmente comprido.pdf`, texto: "" })),
      "fatos",
    ),
  );
  verdade(vinte > um + 1_000, "vinte anexos de nome comprido são meia página de cercas — ignorar isso é subestimar a mensagem de novo");
});

// ── 5. A RECUSA É FALADA E ACIONÁVEL ────────────────────────────────────────────────────────

teste("HARD GATE: o bloqueio diz quanto passou, quem pesa e QUAL documento deixar de fora", () => {
  const { avaliacao } = pedidoReal(
    [
      { nome: "Autos completos.pdf", texto: "a".repeat(LIMITE_PADRAO_CARACTERES) },
      { nome: "Relatório médico.pdf", texto: "r".repeat(20_000) },
    ],
    "f".repeat(1_000),
  );
  igual(avaliacao.acao, "bloqueado");
  const aviso = avaliacao.aviso ?? "";
  verdade(aviso.includes("Autos completos.pdf"), "a recusa precisa NOMEAR o documento que pesa — 'selecione menos documentos' não é instrução");
  verdade(/a mais que o limite/.test(aviso), "a recusa precisa dizer QUANTO passou");
  verdade(/deixar de fora/.test(aviso), "a recusa precisa dizer O QUE FAZER para caber");
  verdade(/página/.test(aviso), "o tamanho precisa vir em páginas — caractere não é unidade que o advogado enxergue");
  verdade(aviso.length > 200, "recusa curta demais para ser acionável");
});

teste("HARD GATE: quando nem sem documento nenhum cabe, a recusa diz isso — e não manda remover documento à toa", () => {
  // Fatos grandes a ponto de NEM resumidos caberem (o resumo leva o item a 15% do próprio
  // tamanho): aí não há documento nenhum cuja remoção resolva, e mandar remover um seria mandar
  // o advogado fazer algo inútil.
  const { avaliacao } = pedidoReal([{ nome: "Anexo pequeno.pdf", texto: "a".repeat(1_000) }], "f".repeat(LIMITE_PADRAO_CARACTERES * 8));
  igual(avaliacao.acao, "bloqueado");
  verdade(
    /Mesmo deixando TODOS os documentos de fora/.test(avaliacao.aviso ?? ""),
    "com os fatos sozinhos estourando o limite, mandar remover documento seria mandar o advogado para um beco",
  );
});

// ── 6. A COSTURA NO CÓDIGO DA AÇÃO (varredura estrutural, como o resto da casa) ─────────────

const CORPO_GERAR = corpoDaFuncao(FONTE_ACOES, "confirmarTriagemEGerar");
const CODIGO_GERAR = codigoDe(CORPO_GERAR);
const CORPO_CALCULAR = corpoDaFuncao(FONTE_ACOES, "calcularAvaliacaoDeContexto");
const CODIGO_CALCULAR = codigoDe(CORPO_CALCULAR);

teste("a varredura acha as duas funções com corpo substancial — não está cega", () => {
  verdade(CORPO_GERAR.length > 1_500, `corpoDaFuncao("confirmarTriagemEGerar") devolveu ${CORPO_GERAR.length} caracteres`);
  verdade(CORPO_CALCULAR.length > 800, `corpoDaFuncao("calcularAvaliacaoDeContexto") devolveu ${CORPO_CALCULAR.length} caracteres`);
});

teste("TRAVA: a avaliação recebe o CUSTO FIXO do pedido — nunca mede só os documentos de novo", () => {
  verdade(/custoFixoDaMensagem\(/.test(CODIGO_CALCULAR), "calcularAvaliacaoDeContexto precisa medir o resto do pedido com o montador de verdade");
  verdade(/avaliarJanela\(itens,\s*\{\s*custoFixo\s*\}\)/.test(CODIGO_CALCULAR), "o custo fixo precisa chegar à janela — sem ele a trava volta a aprovar o que a ponte recusa");
});

teste("TRAVA: a última palavra é a MEDIÇÃO DA MENSAGEM PRONTA, contra o limite único", () => {
  verdade(
    /if \(mensagem\.length > LIMITE_PADRAO_CARACTERES\)/.test(CODIGO_GERAR),
    "a mensagem montada precisa ser medida antes de sair — a conta de orçamento é previsão, esta é o fato",
  );
});

teste("TRAVA: o 400 cru da ponte NUNCA chega à tela do advogado", () => {
  verdade(
    /mensagem ausente ou longa demais/.test(CODIGO_GERAR),
    "o erro da ponte precisa ser traduzido aqui — foi o texto cru dele que o dono leu na tela, e ele não diz o que fazer",
  );
  verdade(/contextoExcedido: true/.test(CODIGO_GERAR), "a recusa por tamanho precisa marcar o campo que leva o advogado à tela de limite");
});

// ── 6-B. O 500 CRU TAMBÉM NÃO CHEGA — a rede de segurança que faltava ───────────────────────
//
// No segundo dia do defeito o que chegou à tela NÃO foi o 400: foi
// `500 {"erro": "falha ao executar o Hermes"}`, porque o `exec` estourava com E2BIG antes de o
// Hermes existir. O `catch` traduzia só as duas frases de TAMANHO e deixava essa passar crua.
// A causa está consertada na raiz (a pergunta saiu do argv), mas a tradução fica: "falha ao
// executar o Hermes" é o balde onde a ponte joga TODA exceção inesperada, e um 500 opaco não
// pode ser o que o advogado lê, qualquer que seja a causa.

teste("TRAVA: o 500 cru da ponte (e o E2BIG do sistema) também viram recusa falada e acionável", () => {
  // A PROPRIEDADE, não a grafia: o que importa é que a frase de cada erro seja reconhecida pela
  // tradução — não que a condição esteja escrita com esta ou aquela regex.
  const traducao = CODIGO_GERAR.match(/if \(\/([^/]+)\/i\.test\(motivo\)\)/);
  verdade(Boolean(traducao), "sumiu a tradução do erro da ponte em confirmarTriagemEGerar — varredura cega");
  const padrao = new RegExp(traducao![1], "i");

  const frasesDaPonte = [
    "mensagem ausente ou longa demais",
    "corpo ausente ou grande demais",
    "falha ao executar o Hermes",
    "[Errno 7] Argument list too long: '/usr/local/bin/hermes'",
  ];
  for (const frase of frasesDaPonte) {
    verdade(
      padrao.test(frase),
      `a tradução não reconhece \`${frase}\` — este texto chegaria cru à tela do advogado, que foi exatamente o que aconteceu em produção`,
    );
  }

  // E o que NÃO é erro de envio continua fora: traduzir tudo como "reduza o tamanho" mandaria o
  // advogado mexer no que não é o problema.
  for (const frase of ["DEMORA: o Hermes não respondeu em 230s", "o Hermes respondeu vazio", "perfil do escritório não encontrado no Hermes"]) {
    verdade(!padrao.test(frase), `a tradução de tamanho engoliu \`${frase}\`, que é outro problema e tem outra saída`);
  }

  // A recusa leva à tela de limite (campo, nunca frase) e não afirma causa que não conhece.
  const depois = CODIGO_GERAR.slice(CODIGO_GERAR.search(/if \(\/[^/]+\/i\.test\(motivo\)\)/));
  verdade(/contextoExcedido: true/.test(depois.slice(0, 1_800)), "a recusa traduzida precisa marcar contextoExcedido — é ele que dá ao advogado os botões de saída");
  verdade(
    /suporte/i.test(depois.slice(0, 1_800)),
    "quando o pedido é pequeno, tamanho não é a causa — a recusa precisa nomear a outra saída em vez de mandar o advogado encurtar o que já é curto",
  );
});

// ── 6-C. AS DUAS UNIDADES, LADO A LADO, NA MESMA FUNÇÃO ────────────────────────────────────

teste("TRAVA: a geração aplica as DUAS travas — a de CARACTERES e a de BYTES", () => {
  verdade(
    /if \(mensagem\.length > LIMITE_PADRAO_CARACTERES\)/.test(CODIGO_GERAR),
    "sumiu a trava de CARACTERES — é ela que espelha PERGUNTA_MAXIMA, que é um teto de caracteres",
  );
  verdade(
    /bytesDaMensagemNoCorpo\(mensagem\)/.test(CODIGO_GERAR),
    "sumiu a trava de BYTES — sem ela o 413 da ponte (\"corpo ausente ou grande demais\") chega cru à tela",
  );
  verdade(
    /> LIMITE_DE_BYTES_DA_MENSAGEM/.test(CODIGO_GERAR),
    "a trava de bytes precisa comparar contra o teto de BYTES, e não contra o de caracteres — é a troca de unidade que esta entrega existe para não repetir",
  );

  // E a medição de bytes é BYTES DE VERDADE, em nenhum lugar `.length` de string.
  const modulo = codigoDe(readFileSync(join(RAIZ, "lib", "peticionamentoJanelaDeContexto.ts"), "utf8"));
  verdade(modulo.length > 1_000, "a varredura não encontrou o módulo da janela — não está cega?");
  const fn = modulo.slice(modulo.indexOf("export function bytesDaMensagemNoCorpo"));
  verdade(fn.length > 80, `bytesDaMensagemNoCorpo não foi encontrada — varredura cega (${fn.length})`);
  verdade(
    /Buffer\.byteLength\(JSON\.stringify\(mensagem\), "utf8"\)/.test(fn.slice(0, 300)),
    "a contagem de bytes precisa ser Buffer.byteLength do JSON serializado — `.length` de string conta caracteres, e em português erra de 10% a 15%",
  );
});

// ACHADO DA RODADA DE MUTAÇÃO DESTA ENTREGA, e é o mais instrutivo dela.
//
// A primeira versão deste caso era só varredura: procurava `Buffer.byteLength(textoDoCorpo,
// "utf8")` e `CORPO_MAXIMO_DA_PONTE_BYTES` dentro de `chamar`, e conferia a ordem. Mutei a
// CONDIÇÃO — `if (bytes > CORPO_MAXIMO_DA_PONTE_BYTES)` virou `if (false)` — e as 76 suítes
// ficaram VERDES: as duas cadeias continuavam lá, escritas, e a trava não fazia mais nada.
//
// A lição é a mesma que esta casa já aprendeu com a grafia de `itensPorId.get("fatos")`: varrer
// o texto prova que o código EXISTE, nunca que ele FUNCIONA. Onde dá para exercitar o caminho de
// verdade, é o caminho de verdade que tem de ser exercitado. Aqui dá: a trava roda antes de
// qualquer rede, então basta chamar com um corpo grande e ver a recusa chegar.
teste("TRAVA (exercitada, não varrida): corpo acima do teto é recusado ANTES de a requisição sair", async () => {
  const urlAntes = process.env.HERMES_URL;
  const tokenAntes = process.env.HERMES_TOKEN;
  // Endereço que NÃO existe de propósito: se a trava deixar de funcionar, a chamada tenta a rede
  // e o erro que volta é outro — que é exatamente o que este caso precisa distinguir.
  process.env.HERMES_URL = "https://ponte.invalida.exemplo";
  process.env.HERMES_TOKEN = "t".repeat(40);
  try {
    const gigante = "x".repeat(CORPO_MAXIMO_DA_PONTE_BYTES + 1);
    let recusa = "";
    try {
      // `esperaMs` curto: sem a trava, a tentativa de rede morre depressa em vez de segurar a
      // suíte — e morre com OUTRA frase, que é o que faz este caso falhar quando deve falhar.
      await perguntarAoHermesComPerfil({ perfil: "peticionamento-lumen", mensagem: gigante, esperaMs: 50 });
    } catch (e) {
      recusa = e instanceof FalhaDoHermes ? e.motivo : String(e);
    }
    verdade(
      /corpo ausente ou grande demais/.test(recusa),
      `a chamada devia ter sido recusada pelo tamanho do corpo, antes de tocar a rede — voltou: "${recusa}"`,
    );
    verdade(
      new RegExp(String(CORPO_MAXIMO_DA_PONTE_BYTES)).test(recusa),
      `a recusa precisa dizer contra que teto ela mediu — voltou: "${recusa}"`,
    );

    // E o corpo que CABE não é recusado por esta trava: ela chega à rede (e falha lá, que é o
    // esperado com um endereço inválido). Sem esta metade, uma trava que recusasse TUDO passaria.
    let comCorpoQueCabe = "";
    try {
      await perguntarAoHermesComPerfil({ perfil: "peticionamento-lumen", mensagem: "uma pergunta curta", esperaMs: 50 });
    } catch (e) {
      comCorpoQueCabe = e instanceof FalhaDoHermes ? e.motivo : String(e);
    }
    verdade(
      !/corpo ausente ou grande demais/.test(comCorpoQueCabe),
      `a trava de corpo recusou um pedido pequeno: "${comCorpoQueCabe}" — recusar tudo não é proteger nada`,
    );
  } finally {
    if (urlAntes === undefined) delete process.env.HERMES_URL;
    else process.env.HERMES_URL = urlAntes;
    if (tokenAntes === undefined) delete process.env.HERMES_TOKEN;
    else process.env.HERMES_TOKEN = tokenAntes;
  }
});

teste("TRAVA: a medição do corpo roda antes do envio, e mede o corpo serializado", () => {
  const fonte = readFileSync(join(RAIZ, "lib", "hermesPonte.ts"), "utf8");
  const corpo = codigoDe(corpoDaFuncao(fonte, "chamar"));
  verdade(corpo.length > 800, `corpoDaFuncao("chamar") devolveu ${corpo.length} caracteres — varredura cega`);
  verdade(
    /Buffer\.byteLength\(textoDoCorpo, "utf8"\)/.test(corpo),
    "o corpo serializado precisa ser medido em BYTES aqui — é `content-length` o que a ponte recusa com 413",
  );
  const posMedicao = corpo.indexOf("Buffer.byteLength(textoDoCorpo");
  const posEnvio = corpo.indexOf("await fetch(");
  verdade(posMedicao >= 0 && posEnvio >= 0 && posMedicao < posEnvio, "medir depois de mandar não impede nada");
});

// ADAPTADO NA REVISÃO (não afrouxado): a versão anterior exigia a GRAFIA
// `itensPorId.get("fatos")?.textoFinal`, com o `?.` — e o `?.` era metade do defeito, porque o
// `??` que vinha depois dele devolvia o texto cru quando a casação falhava. Um teste que exige
// uma grafia impede a correção dela. O que importa não é como está escrito: é que os fatos que
// entram na mensagem venham da AVALIAÇÃO, e de nenhuma outra fonte.
teste("TRAVA: os FATOS também passam pela janela antes de virar mensagem", () => {
  // Ancorado NA CHAMADA que monta a mensagem — não no primeiro `fatos:` da função, que é o do
  // esqueleto (`fatos: sessao.fatos ?? ""`) e passaria a impressão errada nos dois sentidos.
  const inicioDaChamada = CODIGO_GERAR.indexOf("montarMensagemParaHermes(");
  verdade(inicioDaChamada > 0, "não achei a montagem da mensagem — varredura cega");
  const atribuicao = CODIGO_GERAR.slice(inicioDaChamada).match(/fatos:\s*([^,\n]+)/);
  verdade(!!atribuicao, "sumiu a atribuição dos fatos na montagem da mensagem");
  verdade(/itensPorId/.test(atribuicao![1]) && /textoFinal/.test(atribuicao![1]),
    `os fatos da mensagem não vêm mais da avaliação da janela: \`${atribuicao![1].trim()}\` — quando a janela os corta, o corte não chega à mensagem`);
  verdade(!/\?\?/.test(atribuicao![1]),
    `os fatos voltaram a ter socorro para o texto cru: \`${atribuicao![1].trim()}\``);
});

// ── 7. DUAS FALHAS QUE A RODADA DE MUTAÇÃO DESTA ENTREGA ACHOU ─────────────────────────────
//
// Mutação que passa verde é achado, não vitória. Estas duas passaram, e por isso existem:
//   · trocar o campo `contextoExcedido` de volta por "procurar as palavras no texto do erro"
//     não quebrava nada — e é uma amarra invisível: basta reescrever a frase de recusa (que foi
//     o que esta entrega fez) para o advogado ficar preso na tela de confirmação, sem os botões
//     de saída que a tela de limite oferece;
//   · zerar a reserva do aviso de resumo não quebrava nada — e é ela que impede a mensagem de
//     crescer, DEPOIS de o orçamento já ter sido distribuído, pelo tamanho do próprio aviso.

teste("TRAVA: a tela leva à tela de limite pelo CAMPO contextoExcedido, nunca lendo o texto do erro", () => {
  const cliente = readFileSync(join(RAIZ, "components", "peticionamento", "ConfirmarClient.tsx"), "utf8");
  const codigo = codigoDe(cliente);
  verdade(codigo.length > 800, "a varredura não encontrou o ConfirmarClient — não está cega?");
  verdade(/resultado\.contextoExcedido/.test(codigo), "o desvio para a tela de limite precisa vir do campo, não de uma frase");
  verdade(
    !/resultado\.error\.toLowerCase\(\)\.includes/.test(codigo),
    "ler as palavras do erro amarra a tela à redação da mensagem de recusa — reescrever a frase deixaria o advogado sem saída",
  );
});

teste("TRAVA: a reserva do aviso de resumo cobre o bloco que o aviso de fato acrescenta à mensagem", () => {
  // Uma avaliação "resumido" de verdade, com o aviso que ela mesma escreve.
  const avaliacao = avaliarJanela([{ id: "1", rotulo: "Histórico do processo.pdf", texto: "x".repeat(LIMITE_PADRAO_CARACTERES + 40_000) }]);
  igual(avaliacao.acao, "resumido", "premissa do caso: precisa ser um resumo de verdade para haver aviso");

  const base = dados([{ nome: "Histórico do processo.pdf", texto: "" }], "fatos");
  const sem = montarMensagemParaHermes(base).length;
  const com = montarMensagemParaHermes({ ...base, contextoFoiResumido: true, avisoDeResumo: avaliacao.aviso }).length;
  verdade(
    RESERVA_DO_AVISO_DE_RESUMO >= com - sem,
    `o aviso de resumo acrescenta ${com - sem} caracteres à mensagem, e a reserva é de ${RESERVA_DO_AVISO_DE_RESUMO} — ` +
      "o orçamento é distribuído ANTES de o aviso existir, então sem reserva a mensagem cresce depois da decisão",
  );
});


// ══════════════════════════════════════════════════════════════════════════════════════════
// ACHADO DA REVISÃO — A ESCOTILHA SILENCIOSA QUE DESFAZIA ESTA ENTREGA INTEIRA.
//
// `confirmarTriagemEGerar` casa `avaliacao.itens` com os documentos pelo id. A versão revisada
// caía, quando a casação falhava, num `?? doc.resultado.texto` — o texto INTEIRO, sem corte.
// Mutei o mapa para casar por `rotulo` em vez de `id` e as 71 suítes ficaram VERDES: o único jeito
// de a casação dar errado desfazia exatamente o que esta entrega conserta, sem ruído nenhum.
//
// O estrago não é mandar demais — a última trava mede a mensagem pronta e recusa. É a MENTIRA:
// `contextoFoiResumido`/`avisoDeResumo` continuam vindo da avaliação, então a tela diria
// "resumimos automaticamente" e o pedido diria ao agente que o contexto foi condensado, enquanto
// o texto inteiro foi junto. Afirmação falsa nas duas pontas.
// ══════════════════════════════════════════════════════════════════════════════════════════

teste("TRAVA: o texto que vai ao agente vem SEMPRE da avaliação — nenhum `??` devolve o texto cru", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarTriagemEGerar"));
  verdade(corpo.length > 800, `corpoDaFuncao("confirmarTriagemEGerar") devolveu ${corpo.length} caracteres — varredura cega`);
  verdade(!/itensPorId\.get\([^)]*\)\?\.textoFinal\s*\?\?/.test(corpo),
    "voltou o `?? texto cru` no caminho do documento ou dos fatos — quando a casação por id falha, o texto INTEIRO vai ao agente enquanto a tela diz que foi resumido");
  verdade(!/\?\?\s*doc\.resultado\.texto/.test(corpo),
    "o documento voltou a ter socorro para o texto integral — é a escotilha que desfaz a trava de tamanho em silêncio");
  verdade(!/\?\?\s*dadosDoPrompt\.fatos/.test(corpo),
    "os fatos voltaram a ter socorro para o texto integral");
});

teste("TRAVA: a casação é pelo ID — é ele que `calcularAvaliacaoDeContexto` usa para nomear os itens", () => {
  // Isto NÃO é preferência de grafia: o id é a junção entre as duas funções. `calcularAvaliacaoDe-
  // Contexto` nomeia os itens com "fatos" e com `d.id`; aqui se lê pelos mesmos nomes. Trocar a
  // chave por `rotulo` (que é o NOME do arquivo, não o id) não quebra mais nada perigoso desde
  // que a conferência acima existe — a geração passa a recusar, fechada e falada, em vez de
  // mandar o texto cru dizendo que resumiu. Mas recusar TUDO também não é o que se quer, e o
  // erro é de uma palavra só.
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarTriagemEGerar"));
  verdade(/new Map\(avaliacao\.itens\.map\(\(item\) => \[item\.id, item\]\)\)/.test(corpo),
    "o mapa da avaliação deixou de ser chaveado por `item.id` — os ids nascem em calcularAvaliacaoDeContexto e são a junção entre as duas funções");
});

teste("TRAVA: item sem par na avaliação falha FECHADO e falado — nunca segue com o texto cru", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarTriagemEGerar"));
  verdade(/itensPorId\.has\(/.test(corpo),
    "sumiu a conferência de que todo documento lido tem par na avaliação — sem ela a falha volta a ser silenciosa");
  verdade(/itensPorId\.has\("fatos"\)/.test(corpo),
    "a conferência não cobre os FATOS — eles também passam pela janela e também tinham socorro para o texto cru");
  // E a recusa tem de vir ANTES de montar/mandar a mensagem: conferir depois não impede nada.
  const posConferencia = corpo.indexOf("itensPorId.has(");
  const posMontagem = corpo.indexOf("montarMensagemParaHermes(");
  verdade(posConferencia >= 0 && posMontagem >= 0 && posConferencia < posMontagem,
    "a conferência de casação roda depois de montar a mensagem — não impede o envio do texto cru");
});


// ══════════════════════════════════════════════════════════════════════════════════════════
// ACHADO DA REVISÃO — UMA DETECÇÃO ANSIOSA DERRUBA A ANA JUNTO.
//
// `executar_hermes` classifica o erro do binário em três: "não conhece --query-file" (501,
// conserto é atualizar o Hermes), "perfil não provisionado" (404, conserto é pelo Painel Mestre)
// e o resto (500). Troquei a condição do PRIMEIRO por `if True:` e as 31 asserções ficaram VERDES.
//
// O estrago não é o 501 errado em si. É que ESTA PONTE É COMPARTILHADA: a Ana do atendimento
// passa pela mesma função. Com a condição sempre verdadeira, toda falha do Hermes — provedor
// fora do ar, perfil inexistente, o que for — vira "atualize o binário", mandando quem cuida do
// servidor consertar o lugar errado. E o ramo do perfil ausente, logo abaixo, deixa de ser
// alcançável para sempre: o diagnóstico de escritório não provisionado morre em silêncio.
//
// A trava abaixo NÃO exige uma grafia (foi assim que um teste desta casa já impediu a correção
// do defeito que ele guardava). Ela exige a PROPRIEDADE: a condição precisa olhar para o nome da
// opção e para alguma frase de "opção desconhecida", e os ramos seguintes precisam continuar
// alcançáveis.
// ══════════════════════════════════════════════════════════════════════════════════════════

teste("TRAVA: o 501 de binário velho é condicionado ao erro REAL — nunca engole as outras falhas", () => {
  const posRaise = CODIGO_PONTE.indexOf("raise HermesDesatualizado");
  verdade(posRaise > 0, "sumiu o ramo de binário desatualizado — varredura cega");

  // A condição é o `if` imediatamente anterior ao raise.
  const antes = CODIGO_PONTE.slice(0, posRaise);
  const posIf = antes.lastIndexOf("if ");
  verdade(posIf > 0, "não achei a condição que protege o raise de binário desatualizado");
  const condicao = antes.slice(posIf, antes.indexOf(":", posIf));

  // ADAPTADO NA ENTREGA DA GERAÇÃO ASSÍNCRONA — e este é o caso mais instrutivo dela.
  //
  // Esta linha exigia a string `--query-file` DENTRO da condição. Quando a ponte passou a mandar
  // TAMBÉM `--run-budget` e `--max-turns`, a condição certa deixou de ser "procure --query-file" e
  // passou a ser "procure QUALQUER opção que foi mandada" — senão um Hermes que não conhecesse
  // uma das duas novas cairia no balde do 500 genérico, e quem cuida do servidor iria procurar
  // defeito no lugar errado. O teste, preso à grafia, ficou vermelho POR CAUSA da correção que
  // ele existia para proteger. Isso é o defeito descrito no comentário logo acima, acontecendo.
  //
  // A regra que sobra é a mesma de sempre, escrita como PROPRIEDADE: a condição olha para o nome
  // de uma opção que de fato foi mandada. Que a lista seja derivada do argv (e não escrita à mão)
  // é cobrado em lib/testes/peticionamentoGeracaoAssincrona.teste.ts, junto com o exercício real
  // dos dois ramos — 404 para perfil ausente, 501 para opção desconhecida.
  verdade(/desconhecida|--[a-z-]+/.test(condicao),
    `a condição do 501 não olha mais para o nome da opção: \`${condicao.trim()}\` — toda falha do Hermes viraria "atualize o binário", inclusive as do atendimento, que usa esta MESMA ponte`);
  verdade(/unrecognized|no such option|invalid/.test(condicao),
    `a condição do 501 não olha mais para a frase de opção desconhecida: \`${condicao.trim()}\``);
  verdade(!/\bif\s+(True|1)\s*$/.test(condicao.trim()),
    "a condição do 501 virou constante — engoliria todos os outros erros");
});

teste("TRAVA: o ramo de PERFIL AUSENTE continua alcançável depois do ramo do binário velho", () => {
  const posBinario = CODIGO_PONTE.indexOf("raise HermesDesatualizado");
  const posPerfil = CODIGO_PONTE.indexOf("raise PerfilAusente");
  verdade(posPerfil > 0, "sumiu o ramo de perfil não provisionado — é o 404 que o Painel Mestre usa para diagnosticar escritório sem provisionamento");
  verdade(posPerfil > posBinario, "a ordem dos ramos mudou — confira qual passou a capturar primeiro");
  // Entre um e outro não pode haver `raise` fora de condição, nem um `return` que corte o caminho.
  const entre = CODIGO_PONTE.slice(posBinario, posPerfil);
  verdade(!/\n\s{8}raise\b(?!\s+HermesDesatualizado)/.test(entre),
    "apareceu um raise incondicional entre os dois ramos — o de perfil ausente deixou de ser alcançável");
});

resumo("Peticionamento — o limite é o da ponte (o teste que faltava)");
