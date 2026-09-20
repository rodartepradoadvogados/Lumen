import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  lerConfigDeTranscricao,
  lerRespostaDeTranscricao,
  textoParaAgente,
  rotuloDeTranscricaoNaTela,
  ERRO_TRANSCRICAO_NAO_CONFIGURADA,
  MODELO_PADRAO_DE_TRANSCRICAO,
} from "@/lib/transcricaoDeAudio";
import { chamarServicoDeTranscricao, transcricaoConfigurada } from "@/lib/transcricao";

// ============================================================================
// TRANSCRIÇÃO DE ÁUDIO DO WHATSAPP.
//
// Três camadas, na mesma ordem em que o dado passa por elas — mesmo desenho de
// lib/testes/whatsappMidia.teste.ts:
//
//   1. A CONFIGURAÇÃO E AS DECISÕES PURAS (lib/transcricaoDeAudio.ts) — fail-closed, o texto que
//      vai ao agente, o rótulo da tela. Cabem inteiras num teste de mesa.
//   2. A CHAMADA DE VERDADE (lib/transcricao.ts:chamarServicoDeTranscricao) — contra um SERVIDOR
//      DE MENTIRA LOCAL que fala o mesmo protocolo OpenAI-compatível, porque este ambiente não tem
//      acesso a um serviço de transcrição real. Cobre o caminho feliz e a falha.
//   3. AS TRAVAS DE IO QUE NÃO DÃO PRA TESTAR NA MESA (varredura de código-fonte, corpoDaFuncao) —
//      fail-closed de verdade (nunca chama a rede sem config) e o registro gravado nunca carrega
//      o corpo bruto da resposta (que poderia ecoar o token).
//
// NÃO TESTADO CONTRA UM SERVIÇO REAL: nenhuma chamada aqui saiu para a internet — Whisper
// auto-hospedado, Groq e OpenAI de verdade nunca viram este código rodar. O que está provado é o
// PROTOCOLO (o formato do pedido e da resposta), não a compatibilidade fina de um provedor
// específico.
// ============================================================================

// ── 1. Configuração e decisões puras ────────────────────────────────────────────────────────

teste("sem URL, sem token, ou sem os dois: fail-closed, nunca um meio-termo", () => {
  igual(lerConfigDeTranscricao({}), null, "nada configurado: ");
  igual(lerConfigDeTranscricao({ url: "https://x.com" }), null, "só a URL: ");
  igual(lerConfigDeTranscricao({ token: "abc" }), null, "só o token: ");
  igual(lerConfigDeTranscricao({ url: "  ", token: "abc" }), null, "URL só com espaço não conta: ");
  igual(lerConfigDeTranscricao({ url: "https://x.com", token: "  " }), null, "token só com espaço não conta: ");
});

teste("com os dois presentes, configura — barra final removida, modelo padrão aplicado", () => {
  const c = lerConfigDeTranscricao({ url: "https://x.com/whisper/", token: "abc123" });
  igual(c, { url: "https://x.com/whisper", token: "abc123", modelo: MODELO_PADRAO_DE_TRANSCRICAO });
});

teste("TRANSCRICAO_MODELO, quando definido, substitui o padrão", () => {
  const c = lerConfigDeTranscricao({ url: "https://x.com", token: "abc", modelo: "large-v3" });
  igual(c?.modelo, "large-v3");
});

teste("lerRespostaDeTranscricao aceita 200 com texto, e recorta espaço nas pontas", () => {
  igual(lerRespostaDeTranscricao(200, { text: "  bom dia, doutor  " }), { ok: true, texto: "bom dia, doutor" });
});

teste("lerRespostaDeTranscricao recusa texto vazio, ausente, ou de outro tipo", () => {
  igual(lerRespostaDeTranscricao(200, { text: "" }).ok, false, "texto vazio: ");
  igual(lerRespostaDeTranscricao(200, {}).ok, false, "sem o campo: ");
  igual(lerRespostaDeTranscricao(200, { text: 123 }).ok, false, "campo não é string: ");
  igual(lerRespostaDeTranscricao(200, null).ok, false, "corpo nulo: ");
});

teste("lerRespostaDeTranscricao recusa qualquer status fora de 2xx, com o status no motivo", () => {
  const r = lerRespostaDeTranscricao(500, { text: "não devia nem olhar isto" });
  igual(r.ok, false);
  verdade(!r.ok && r.erro.includes("500"), "o motivo devia citar o status HTTP");
});

teste("MUTAÇÃO-ALVO: o corpo bruto da resposta de erro NUNCA vaza para o motivo guardado — nem se ecoar o token", () => {
  // Um servidor de transcrição mal configurado (proxy errado, servidor que devolve a própria
  // requisição em página de erro) pode devolver de volta cabeçalhos, inclusive o Authorization —
  // que é o TOKEN. Simula exatamente isso: um corpo de erro carregando um valor que SERIA o
  // token, e prova que ele não aparece em lugar nenhum do motivo devolvido.
  const tokenFalso = "sk-SEGREDO-QUE-NAO-PODE-VAZAR-000111222";
  const r = lerRespostaDeTranscricao(401, { error: `Unauthorized — Authorization: Bearer ${tokenFalso}`, echoedToken: tokenFalso });
  igual(r.ok, false);
  verdade(!r.ok && !r.erro.includes(tokenFalso), `o token vazou para o motivo guardado: "${!r.ok && r.erro}"`);
  verdade(!r.ok && !r.erro.includes("Unauthorized"), "o corpo bruto do erro vazou para o motivo guardado");
});

teste("textoParaAgente devolve o body normalmente quando não há transcrição vinculada", () => {
  igual(textoParaAgente({ body: "bom dia" }), "bom dia", "mensagem de texto comum: ");
  igual(textoParaAgente({ body: "[imagem]", transcricao: null }), "[imagem]", "mídia sem transcrição (imagem, doc, vídeo): ");
});

teste("MUTAÇÃO-ALVO: com a transcrição PRONTA, o agente lê o texto FALADO, marcado como tal", () => {
  const r = textoParaAgente({ body: "[áudio]", transcricao: { status: "PRONTA", texto: "queria saber sobre um divórcio", erro: null } });
  igual(r, "[áudio transcrito] queria saber sobre um divórcio");
  // A marca "[áudio transcrito]" é o que diferencia FALA de ESCRITA para o agente — sem ela, a
  // Ana trataria a transcrição como se a pessoa tivesse digitado, o que muda o tom esperado.
  verdade(r.startsWith("[áudio transcrito]"), "a marca de transcrição sumiu");
});

teste("MUTAÇÃO-ALVO: com a transcrição FALHOU (ou PENDENTE), a Ana NUNCA finge ter ouvido", () => {
  const falhou = textoParaAgente({ body: "[áudio]", transcricao: { status: "FALHOU", texto: null, erro: "qualquer motivo" } });
  const pendente = textoParaAgente({ body: "[áudio]", transcricao: { status: "PENDENTE", texto: null, erro: null } });
  for (const r of [falhou, pendente]) {
    verdade(r !== "[áudio]", "a falha não pode virar silêncio sobre o áudio — a Ana precisa se explicar");
    verdade(!r.includes("[áudio transcrito]"), "uma transcrição que falhou não pode carregar a marca de sucesso");
    verdade(r.toLowerCase().includes("não") , `a mensagem tem que deixar claro que ela NÃO ouviu: "${r}"`);
  }
});

teste("rotuloDeTranscricaoNaTela: null quando não há transcrição (mídia comum, ou áudio de antes desta entrega)", () => {
  igual(rotuloDeTranscricaoNaTela(null), null);
  igual(rotuloDeTranscricaoNaTela(undefined), null);
});

teste("rotuloDeTranscricaoNaTela: os TRÊS estados honestos que o pedido exige", () => {
  igual(rotuloDeTranscricaoNaTela({ status: "PENDENTE", texto: null, erro: null }), { texto: "Transcrevendo…", ehConteudo: false });
  igual(
    rotuloDeTranscricaoNaTela({ status: "PRONTA", texto: "bom dia", erro: null }),
    { texto: "bom dia", ehConteudo: true },
  );
  igual(
    rotuloDeTranscricaoNaTela({ status: "FALHOU", texto: null, erro: "timeout qualquer" }),
    { texto: "Não foi possível transcrever este áudio", ehConteudo: false },
  );
});

teste("MUTAÇÃO-ALVO: 'transcrição não configurada' é reconhecida por IGUALDADE do motivo, não por prefixo/substring", () => {
  igual(
    rotuloDeTranscricaoNaTela({ status: "FALHOU", texto: null, erro: ERRO_TRANSCRICAO_NAO_CONFIGURADA }),
    { texto: "Transcrição não configurada", ehConteudo: false },
  );
  // ARMADILHA DE VARREDURA (a mesma que já mordeu esta casa, agora do lado da COMPARAÇÃO em vez
  // da varredura): se rotuloDeTranscricaoNaTela comparasse por `.includes(ERRO_TRANSCRICAO_
  // NAO_CONFIGURADA)` em vez de igualdade exata (`===`), um motivo que CONTÉM o texto fixo como
  // PREFIXO de uma frase maior (mas não é exatamente ele) passaria como "não configurado" mesmo
  // sendo, por exemplo, um erro de rede que citou o motivo anterior num reprocessamento.
  igual(
    rotuloDeTranscricaoNaTela({ status: "FALHOU", texto: null, erro: `${ERRO_TRANSCRICAO_NAO_CONFIGURADA} (verificado novamente às 10h)` }),
    { texto: "Não foi possível transcrever este áudio", ehConteudo: false },
    "motivo que CONTÉM o texto fixo mas não é EXATAMENTE ele não pode ser lido como 'não configurado': ",
  );
});

// ── 2. A chamada de verdade, contra um servidor de mentira local ───────────────────────────
//
// AVISO HONESTO: nenhum destes três testes fala com um serviço de transcrição de verdade — este
// ambiente não tem acesso a um Whisper auto-hospedado, à Groq nem à OpenAI. O servidor abaixo fala
// só o suficiente do protocolo OpenAI-compatível (POST /v1/audio/transcriptions, JSON com "text")
// para prová-lo — a compatibilidade fina com um provedor real fica sem cobertura automática.

function subirServidorDeMentira(
  comportamento: (info: { auth: string | null; url: string }) => { status: number; corpo: unknown },
): Promise<{ servidor: Server; url: string }> {
  return new Promise((resolve) => {
    const servidor = createServer((req, res) => {
      const pedacos: Buffer[] = [];
      req.on("data", (p) => pedacos.push(p));
      req.on("end", () => {
        const { status, corpo } = comportamento({ auth: req.headers.authorization ?? null, url: req.url ?? "" });
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(corpo));
      });
    });
    servidor.listen(0, "127.0.0.1", () => {
      const endereco = servidor.address();
      const porta = typeof endereco === "object" && endereco ? endereco.port : 0;
      resolve({ servidor, url: `http://127.0.0.1:${porta}` });
    });
  });
}

const AUDIO_DE_MENTIRA = { buffer: Buffer.from("dados de áudio de mentira, não importa o conteúdo"), mimeType: "audio/ogg", nomeArquivo: "audio.ogg" };

teste("caminho feliz: o servidor de mentira devolve o texto, e o pedido chega no formato certo", async () => {
  let recebeuAlgo = false;
  let pedidoRecebido: { auth: string | null; url: string } = { auth: null, url: "" };
  const { servidor, url } = await subirServidorDeMentira((info) => {
    recebeuAlgo = true;
    pedidoRecebido = info;
    return { status: 200, corpo: { text: "bom dia, aqui é a Maria" } };
  });
  try {
    const r = await chamarServicoDeTranscricao({ url, token: "token-de-teste-123", modelo: "whisper-1" }, AUDIO_DE_MENTIRA);
    igual(r, { ok: true, texto: "bom dia, aqui é a Maria" });
    verdade(recebeuAlgo, "o servidor de mentira não recebeu pedido nenhum");
    igual(pedidoRecebido.url, "/v1/audio/transcriptions", "o caminho do protocolo está errado: ");
    igual(pedidoRecebido.auth, "Bearer token-de-teste-123", "o cabeçalho Bearer está errado: ");
  } finally {
    servidor.close();
  }
});

teste("MUTAÇÃO-ALVO: o token nunca viaja na URL — só no cabeçalho Authorization", async () => {
  let urlRecebida = "";
  const { servidor, url } = await subirServidorDeMentira((info) => {
    urlRecebida = info.url;
    return { status: 200, corpo: { text: "ok" } };
  });
  try {
    await chamarServicoDeTranscricao({ url, token: "SEGREDO-QUE-NAO-PODE-IR-NA-URL", modelo: "whisper-1" }, AUDIO_DE_MENTIRA);
    verdade(!urlRecebida.includes("SEGREDO-QUE-NAO-PODE-IR-NA-URL"), `o token vazou na URL: ${urlRecebida}`);
  } finally {
    servidor.close();
  }
});

teste("a falha do servidor de mentira (HTTP 500) vira um resultado explicando o status, sem lançar", async () => {
  const { servidor, url } = await subirServidorDeMentira(() => ({ status: 500, corpo: { error: "serviço fora do ar" } }));
  try {
    const r = await chamarServicoDeTranscricao({ url, token: "t", modelo: "whisper-1" }, AUDIO_DE_MENTIRA);
    igual(r.ok, false);
    verdade(!r.ok && r.erro.includes("500"), `o motivo devia citar o HTTP 500: ${JSON.stringify(r)}`);
  } finally {
    servidor.close();
  }
});

teste("transcricaoConfigurada() reflete as duas variáveis de ambiente, fail-closed", () => {
  const original = { url: process.env.TRANSCRICAO_URL, token: process.env.TRANSCRICAO_TOKEN };
  try {
    delete process.env.TRANSCRICAO_URL;
    delete process.env.TRANSCRICAO_TOKEN;
    igual(transcricaoConfigurada(), false, "sem nenhuma das duas: ");

    process.env.TRANSCRICAO_URL = "https://x.com";
    igual(transcricaoConfigurada(), false, "só a URL, sem o token: ");

    process.env.TRANSCRICAO_TOKEN = "abc";
    igual(transcricaoConfigurada(), true, "com as duas: ");
  } finally {
    // Devolve o ambiente exatamente como estava — este arquivo roda no seu próprio processo
    // (ver lib/testes/todos.ts), mas não custa nada ser explícito.
    if (original.url === undefined) delete process.env.TRANSCRICAO_URL;
    else process.env.TRANSCRICAO_URL = original.url;
    if (original.token === undefined) delete process.env.TRANSCRICAO_TOKEN;
    else process.env.TRANSCRICAO_TOKEN = original.token;
  }
});

// ── 3. As travas de IO que não dão pra testar na mesa (varredura de código-fonte) ───────────
//
// Mesmas duas armadilhas de lib/testes/whatsappMidia.teste.ts: nenhuma checagem abaixo procura um
// trecho que só existe em COMENTÁRIO (codigoDe tira comentário antes de qualquer busca), e nenhuma
// checa só um PREFIXO do nome de um campo/função (para não passar verde se o símbolo virar
// "XSufixo").

const transcricaoFonte = readFileSync("lib/transcricao.ts", "utf8");
const whatsappFonte = readFileSync("lib/whatsapp.ts", "utf8");

teste("MUTAÇÃO-ALVO: sem config, transcreverAudioRecebido NUNCA chama o serviço de transcrição", () => {
  const corpo = corpoDaFuncao(transcricaoFonte, "transcreverAudioRecebido");
  verdade(corpo.length > 0, "transcreverAudioRecebido não existe mais, ou mudou de assinatura");

  const idxCheckConfig = corpo.indexOf("if (!config)");
  const idxChamada = corpo.indexOf("chamarServicoDeTranscricao(");
  verdade(idxCheckConfig >= 0, "a checagem fail-closed (`if (!config)`) sumiu de transcreverAudioRecebido");
  verdade(idxChamada > idxCheckConfig, "chamarServicoDeTranscricao é chamada ANTES (ou sem) a checagem fail-closed — quebra o fail-closed");

  // O ramo `if (!config)` tem que voltar (`return`) sem alcançar a chamada de rede — se ele só
  // registrar e continuar, o fluxo cai para baixo e chama a rede mesmo sem config.
  const trechoDoRamo = corpo.slice(idxCheckConfig, idxChamada);
  verdade(/return;/.test(trechoDoRamo), "o ramo 'sem config' não retorna — o código seguiria e chamaria o serviço mesmo sem token/URL");
});

teste("MUTAÇÃO-ALVO: o motivo 'não configurado' é o texto FIXO, não uma frase inventada na hora", () => {
  const corpo = corpoDaFuncao(transcricaoFonte, "transcreverAudioRecebido");
  verdade(
    /erro: ERRO_TRANSCRICAO_NAO_CONFIGURADA/.test(corpo),
    "o ramo 'sem config' parou de gravar o motivo fixo ERRO_TRANSCRICAO_NAO_CONFIGURADA — a tela não vai mais reconhecer este caso",
  );
});

teste("MUTAÇÃO-ALVO: o header de autenticação da chamada de transcrição usa Bearer, e nunca imprime o token em log/erro", () => {
  const corpo = corpoDaFuncao(transcricaoFonte, "chamarServicoDeTranscricao");
  verdade(corpo.length > 0, "chamarServicoDeTranscricao não existe mais, ou mudou de nome");
  verdade(/Authorization:\s*`Bearer \$\{config\.token\}`/.test(corpo), "o token parou de ir no cabeçalho Authorization Bearer");
  // O código não pode ter um `console.log`/`console.error` imprimindo `config.token` OU o
  // `corpo` bruto da resposta (que poderia ecoar o token de volta) — ver a nota de
  // lerRespostaDeTranscricao no schema/comentário sobre este risco.
  verdade(!/console\.(log|error|warn)\([^)]*config\.token/.test(corpo), "o token está sendo impresso em log");
});

teste("processarMidiaRecebida (Drive, F5) continua intacta — a transcrição não pode ter mexido nela", () => {
  // Rede de segurança contra um refactor que junte os dois downloads (do Drive e da transcrição)
  // sem querer e acabe removendo a trava original — ver o comentário de transcreverAudioDaMensagem
  // em lib/whatsapp.ts sobre por que os dois downloads continuam SEPARADOS de propósito.
  const proc = corpoDaFuncao(whatsappFonte, "processarMidiaRecebida");
  verdade(proc.length > 0, "processarMidiaRecebida sumiu ou mudou de assinatura");
  verdade(/if\s*\(!midia\.mediaId\)\s*return;/.test(proc), "a trava de mediaId ausente sumiu de processarMidiaRecebida");
});

teste("MUTAÇÃO-ALVO: transcreverAudioDaMensagem (o novo download, exclusivo do áudio) tem a mesma trava fail-closed da Meta", () => {
  const fn = corpoDaFuncao(whatsappFonte, "transcreverAudioDaMensagem");
  verdade(fn.length > 0, "transcreverAudioDaMensagem não existe mais, ou mudou de assinatura");
  verdade(/if\s*\(!midia\.mediaId\)\s*return;/.test(fn), "sem mediaId, baixarMidiaMeta seria chamado com id indefinido");
  verdade(/if\s*\(!config\.baseUrl \|\| !config\.apiKey \|\| !midia\.evolution\)\s*return;/.test(fn), "a trava da Evolution sumiu");
});

teste("MUTAÇÃO-ALVO: a transcrição de áudio roda dentro do `if (midia)` do ingest, nunca fora do bloco de mídia", () => {
  // Se a chamada de transcrição saísse do bloco `if (midia)` (ou perdesse o `if (midia.tipo ===
  // "AUD")`), toda mensagem de TEXTO tentaria "transcrever" um áudio inexistente.
  const inicio = whatsappFonte.indexOf("export async function ingestIncomingWhatsapp(");
  const fim = whatsappFonte.indexOf("async function processarMidiaRecebida(", inicio);
  verdade(inicio >= 0 && fim > inicio, "os marcadores de fatiamento do ingest não foram achados");
  const ingest = codigoDe(whatsappFonte.slice(inicio, fim));
  verdade(ingest.includes('midia.tipo === "AUD"'), "a checagem de tipo de mídia sumiu — todo tipo de mídia tentaria transcrever");

  const linhas = ingest.split("\n");
  const idxIfMidia = linhas.findIndex((l) => l.trim() === "if (midia) {");
  const idxIfAud = linhas.findIndex((l) => l.includes('if (midia.tipo === "AUD")'));
  verdade(idxIfMidia >= 0, "o bloco `if (midia) {` sumiu do ingest");
  verdade(idxIfAud > idxIfMidia, "a checagem de tipo de áudio some ANTES do bloco de mídia começar");

  // "DENTRO DO BLOCO" provado pela INDENTAÇÃO: a checagem de áudio precisa estar mais recuada do
  // que o `if (midia) {` que a contém — se ela saísse do bloco (mesmo nível de recuo), qualquer
  // mensagem SEM mídia também cairia nesta checagem.
  const indentMidia = linhas[idxIfMidia].match(/^\s*/)?.[0].length ?? 0;
  const indentAud = linhas[idxIfAud].match(/^\s*/)?.[0].length ?? 0;
  verdade(indentAud > indentMidia, "a checagem de tipo de áudio não está mais aninhada dentro do bloco `if (midia)`");
});

teste("MUTAÇÃO-ALVO: a falha ao transcrever é logada (nunca silenciosa) e nunca derruba o webhook (tem `.catch`)", () => {
  const inicio = whatsappFonte.indexOf("export async function ingestIncomingWhatsapp(");
  const fim = whatsappFonte.indexOf("async function processarMidiaRecebida(", inicio);
  const ingest = codigoDe(whatsappFonte.slice(inicio, fim));
  verdade(
    /transcreverAudioDaMensagem\([^)]*\)\s*\.catch\(/.test(ingest),
    "a chamada de transcreverAudioDaMensagem perdeu o `.catch()` — uma falha de rede vai derrubar o webhook",
  );
});

teste("MUTAÇÃO-ALVO: a transcrição é ligada ao ID DA MENSAGEM NO BANCO (cuid), não ao waMessageId do provedor", () => {
  // TranscricaoDeAudio.whatsappMessageId aponta para WhatsappMessage.id (a chave primária), não
  // para o identificador que a Meta/Evolution deu à mensagem — os dois são strings parecidas, e
  // trocar um pelo outro faria o `upsert` de lib/transcricao.ts nunca achar a linha certa (ou
  // pior, ligar a transcrição a NENHUMA mensagem, porque whatsappMessageId é a chave estrangeira).
  const inicio = whatsappFonte.indexOf("export async function ingestIncomingWhatsapp(");
  const fim = whatsappFonte.indexOf("async function processarMidiaRecebida(", inicio);
  const ingest = codigoDe(whatsappFonte.slice(inicio, fim));
  verdade(
    /transcreverAudioDaMensagem\(officeId, novaMensagem\.id, midia\)/.test(ingest),
    "transcreverAudioDaMensagem parou de receber novaMensagem.id (o id de verdade da mensagem no banco)",
  );
});

teste("MUTAÇÃO-ALVO: ao FALHAR, transcreverAudioRecebido grava FALHOU (nunca PRONTA com texto vazio/inventado)", () => {
  const corpo = corpoDaFuncao(transcricaoFonte, "transcreverAudioRecebido");
  verdade(corpo.length > 0, "transcreverAudioRecebido não existe mais, ou mudou de assinatura");
  const idxSenao = corpo.indexOf("} else {");
  verdade(idxSenao > 0, "o ramo de falha (else) sumiu de transcreverAudioRecebido");
  const ramoDeFalha = corpo.slice(idxSenao);
  verdade(/status:\s*"FALHOU"/.test(ramoDeFalha), "o ramo de falha parou de gravar status FALHOU");
  verdade(/erro:\s*resultado\.erro/.test(ramoDeFalha), "o ramo de falha parou de gravar o motivo devolvido por chamarServicoDeTranscricao");
  verdade(!/status:\s*"PRONTA"/.test(ramoDeFalha), "o ramo de falha está gravando PRONTA — a Ana leria isto como sucesso");
});

// ── O restante do pedido: histórico do agente e a tela ──────────────────────────────────────
//
// As duas checagens abaixo são a garantia de que as peças que ESTE teste não consegue exercitar
// de ponta a ponta (a chamada de verdade ao Hermes, a renderização de React) pelo menos não
// perderam a FIAÇÃO que liga a transcrição a elas — sem isto, um `textoParaAgente` perfeitamente
// testado acima poderia, mesmo assim, nunca ser chamado de dentro de atendenteResponde.ts.

const atendenteFonte = readFileSync("lib/atendenteResponde.ts", "utf8");
const conversaFonte = readFileSync("components/atendimento/Conversa.tsx", "utf8");

teste("MUTAÇÃO-ALVO: atendenteResponde.ts busca a transcrição no banco E a usa para montar o histórico e a mensagem de agora", () => {
  const corpo = corpoDaFuncao(atendenteFonte, "atendenteResponde");
  verdade(corpo.length > 0, "atendenteResponde não existe mais, ou mudou de assinatura");
  verdade(
    /select:\s*\{\s*direction:\s*true,\s*body:\s*true,\s*transcricao:\s*\{\s*select:/.test(corpo),
    "a consulta das mensagens parou de trazer a transcrição junto (select sem `transcricao`) — o histórico nunca vai vê-la",
  );
  verdade(/texto:\s*textoParaAgente\(m\)/.test(corpo), "o histórico (historico.map) parou de passar cada mensagem por textoParaAgente");
  verdade(/mensagem:\s*textoParaAgente\(ultima\)/.test(corpo), "a MENSAGEM DE AGORA parou de passar por textoParaAgente — se a ÚLTIMA mensagem for o áudio, a Ana perguntaria sem ter ouvido nada");
});

teste("MUTAÇÃO-ALVO: sendWhatsappText nunca é chamado com nada vindo de uma transcrição — só com o texto do Hermes", () => {
  // Não é a trava que impede o envio (essa é ESTRUTURAL: TranscricaoDeAudio não é uma
  // WhatsappMessage, e nenhum código de envio lê esse modelo — ver o comentário do modelo em
  // prisma/schema.prisma). Esta é uma rede de segurança ADICIONAL contra alguém, no futuro,
  // "simplificar" atendenteResponde.ts fazendo `resposta` vir de `ultima.transcricao` por engano.
  const corpo = corpoDaFuncao(atendenteFonte, "atendenteResponde");
  verdade(corpo.includes("sendWhatsappText(atendimento.officeId, atendimento.waPhone, resposta)"), "a chamada de envio mudou de forma — confira à mão");
  verdade(!/resposta\s*=[^;]*transcricao/.test(corpo), "a variável `resposta` (o que vai pro WhatsApp do cliente) está sendo atribuída a partir de uma transcrição");

  for (const arquivo of ["lib/whatsapp.ts", "lib/whatsappEvolution.ts"]) {
    const fonte = codigoDe(readFileSync(arquivo, "utf8"));
    verdade(
      !/send(WhatsappText|Texto)\([^)]*[Tt]ranscri/.test(fonte),
      `${arquivo}: uma chamada de envio ao WhatsApp parece referenciar uma transcrição diretamente`,
    );
  }
});

teste("MUTAÇÃO-ALVO: a bolha do áudio mostra a transcrição visualmente DISTINTA de mensagem de verdade, com o aviso de que o cliente não vê", () => {
  verdade(conversaFonte.includes("rotuloDeTranscricaoNaTela"), "Conversa.tsx parou de usar rotuloDeTranscricaoNaTela — a bolha nunca mostraria a transcrição");
  // O bloco da transcrição tem que estar DENTRO da mesma bolha (não uma bolha nova, à parte —
  // senão pareceria uma segunda MENSAGEM), mas com classe/estilo PRÓPRIO, diferente de
  // `text-sm text-tx` (o texto de mensagem de verdade) — aqui checado pela presença de
  // `border-marca` (o filete que marca o bloco como algo à parte).
  verdade(conversaFonte.includes("border-marca"), "o bloco de transcrição perdeu o filete que o distingue visualmente de uma mensagem");
  verdade(
    conversaFonte.toLowerCase().includes("o cliente nunca vê isto") || conversaFonte.toLowerCase().includes("o cliente não vê"),
    "a tela parou de avisar, por escrito, que o cliente nunca vê a transcrição",
  );
});

void resumo("transcrição de áudio do WhatsApp");
