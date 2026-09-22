import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  avaliarJanela,
  LIMITE_PADRAO_CARACTERES,
  PERGUNTA_MAXIMA_DA_PONTE,
  FOLGA_ATE_A_PONTE,
} from "@/lib/peticionamentoJanelaDeContexto";
import { montarMensagemParaHermes, custoFixoDaMensagem, RESERVA_DO_AVISO_DE_RESUMO, type DadosParaPrompt } from "@/lib/peticionamentoPrompt";
import { LIMITE_DA_PERGUNTA } from "@/lib/agenteAtendimento";
import { ESPERA_MS, ESPERA_PETICIONAMENTO_MS } from "@/lib/hermesPonte";

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

teste("o corpo HTTP da ponte comporta a maior pergunta que ela mesma aceita", () => {
  const corpo = numeroDaPonte("CORPO_MAXIMO");
  // Português com acento em UTF-8 e os escapes do JSON: 1,5 byte por caractere é margem de sobra.
  verdade(
    corpo >= PERGUNTA_MAXIMA_DA_PONTE * 1.5,
    `CORPO_MAXIMO (${corpo} bytes) precisa comportar ${PERGUNTA_MAXIMA_DA_PONTE} caracteres em JSON — ` +
      "senão a trava de corpo recusa com 413, sem explicar nada, o pedido que a trava de pergunta aprovou",
  );
});

// ── 2. O CAMINHO DA ANA NÃO PODE AFROUXAR ───────────────────────────────────────────────────

teste("subir o teto da ponte NÃO afrouxou o orçamento do atendimento (Ana)", () => {
  igual(LIMITE_DA_PERGUNTA, 7_500, "o orçamento da Ana é dela e continua valendo — não se mexe nele para caber peticionamento");
  verdade(LIMITE_DA_PERGUNTA < PERGUNTA_MAXIMA_DA_PONTE, "o pedido da Ana continua cabendo no teto da ponte");
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

resumo("Peticionamento — o limite é o da ponte (o teste que faltava)");
