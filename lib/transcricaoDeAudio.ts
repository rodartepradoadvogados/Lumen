// ============================================================================
// TRANSCRIÇÃO DE ÁUDIO DO WHATSAPP — O MÓDULO PURO.
//
// Nada aqui toca rede nem `@/lib/prisma`: é a parte que cabe num teste de mesa, e a parte que um
// componente "use client" (a bolha do áudio em components/atendimento/Conversa.tsx) pode importar
// sem risco de puxar Prisma para o bundle do navegador — a mesma armadilha que o CLAUDE.md descreve
// para lib/driveNaming.ts. O download do áudio e a chamada HTTP ao serviço de transcrição moram em
// lib/transcricao.ts, que importa este arquivo (nunca o contrário).
//
// PROTOCOLO, NÃO FORNECEDOR. Fala-se aqui o protocolo OpenAI-compatível de transcrição —
// `POST {base}/v1/audio/transcriptions`, `multipart/form-data` com `file` + `model`, um Bearer
// token, resposta JSON com `text`. A MESMA implementação atende um Whisper auto-hospedado do
// próprio escritório, a Groq ou a OpenAI — só TRANSCRICAO_URL/TRANSCRICAO_TOKEN/TRANSCRICAO_MODELO
// mudam. Não há SDK de fornecedor nenhum aqui, de propósito: uma dependência a mais amarraria o
// projeto a quem essa decisão explicitamente evita amarrar.
//
// FAIL-CLOSED. Sem TRANSCRICAO_URL **e** TRANSCRICAO_TOKEN configurados, nada é transcrito — nunca
// um "tenta mesmo assim" nem um fornecedor padrão adivinhado. O áudio continua subindo pro Drive
// normalmente (isso já existe, ver lib/whatsapp.ts F5); só a transcrição fica de fora, e a tela diz
// isso com todas as letras (ver rotuloDeTranscricaoNaTela). Mesma regra de WHATSAPP_APP_SECRET e
// ASAAS_WEBHOOK_TOKEN — ver CLAUDE.md.
// ============================================================================

export type StatusDeTranscricao = "PENDENTE" | "PRONTA" | "FALHOU";

export type ConfigDeTranscricao = { url: string; token: string; modelo: string };

/**
 * Padrão sensato quando TRANSCRICAO_MODELO não é definido: "whisper-1" é reconhecido tanto pela
 * OpenAI quanto por servidores Whisper auto-hospedados que imitam a API dela (o caso mais comum de
 * "protocolo OpenAI-compatível"). Quem usa a Groq troca só esta variável, sem tocar em código.
 */
export const MODELO_PADRAO_DE_TRANSCRICAO = "whisper-1";

/**
 * O MOTIVO fixo gravado quando a transcrição não está configurada — não é uma frase livre, é uma
 * constante comparada por igualdade (rotuloDeTranscricaoNaTela) para a tela nunca confundir "não
 * configurado" com uma falha de rede de verdade. "Não configurado" não é um quarto ESTADO (o campo
 * `status` só tem três valores) — é um MOTIVO de FALHOU, o mesmo campo que qualquer outro erro usa.
 */
export const ERRO_TRANSCRICAO_NAO_CONFIGURADA =
  "a transcrição de áudio não está configurada (faltam TRANSCRICAO_URL e/ou TRANSCRICAO_TOKEN)";

/**
 * O MOTIVO fixo gravado quando o áudio não tem uma cópia durável para ler (o upload pro Drive
 * falhou, ou o registro é de antes de o campo existir) — a transcrição roda de forma ASSÍNCRONA,
 * lendo o arquivo do Drive (não da Meta/Evolution outra vez, cuja URL já expirou a essa altura),
 * então sem essa cópia não há de onde transcrever. Ver lib/transcricaoAssincrona.ts.
 */
export const ERRO_ARQUIVO_INDISPONIVEL =
  "o áudio não pôde ser recuperado do armazenamento do escritório para ser transcrito";

/**
 * Lê a configuração da transcrição a partir de valores JÁ RESOLVIDOS (não de `process.env`
 * diretamente) — de propósito, para caber num teste de mesa sem precisar simular variável de
 * ambiente global, que vaza de um teste para o outro na mesma execução do processo.
 *
 * FAIL-CLOSED: falta QUALQUER uma das duas obrigatórias (url ou token) e a resposta é `null` — não
 * há meio-termo, e não há fornecedor padrão escolhido por adivinhação. `null` é o único jeito de
 * dizer "não transcreva" que este módulo conhece.
 */
export function lerConfigDeTranscricao(env: {
  url?: string | null;
  token?: string | null;
  modelo?: string | null;
}): ConfigDeTranscricao | null {
  const url = env.url?.trim();
  const token = env.token?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token, modelo: env.modelo?.trim() || MODELO_PADRAO_DE_TRANSCRICAO };
}

/**
 * Interpreta a resposta HTTP do endpoint de transcrição (protocolo OpenAI-compatível).
 *
 * O CORPO BRUTO NUNCA VIRA O MOTIVO GUARDADO. Um serviço mal configurado (proxy errado, servidor
 * que ecoa a requisição de volta em página de erro) pode devolver de volta cabeçalhos da própria
 * requisição — e um deles é `Authorization: Bearer <token>`. Por isso todo motivo de falha daqui é
 * um texto FIXO nosso, no máximo com o status HTTP dentro; o corpo da resposta em si nunca é
 * concatenado em lugar nenhum que vire `erro` gravado no banco ou mostrado na tela.
 */
export function lerRespostaDeTranscricao(
  status: number,
  corpo: unknown,
): { ok: true; texto: string } | { ok: false; erro: string } {
  if (status < 200 || status >= 300) {
    return { ok: false, erro: `o serviço de transcrição respondeu HTTP ${status}` };
  }
  const texto = (corpo as { text?: unknown } | null)?.text;
  if (typeof texto !== "string" || !texto.trim()) {
    return { ok: false, erro: "o serviço de transcrição não devolveu o campo \"text\"" };
  }
  return { ok: true, texto: texto.trim() };
}

// ============================================================================
// O QUE A ANA LÊ NO LUGAR DO ÁUDIO.
// ============================================================================

export type TranscricaoDaMensagem = { status: string; texto: string | null; erro: string | null } | null | undefined;

export type MensagemComTranscricao = { body: string; transcricao?: TranscricaoDaMensagem };

/**
 * O texto que entra no histórico mandado ao agente NO LUGAR da mensagem de áudio — nunca o rótulo
 * cru "[áudio]" (ou "[áudio] legenda") sozinho, que não diz nada sobre o que a pessoa falou.
 *
 * Mensagem sem transcrição vinculada (texto comum, imagem, documento, vídeo, ou um áudio de antes
 * desta funcionalidade existir) devolve o `body` como sempre devolveu — comportamento inalterado.
 *
 * PRONTA entra marcada com "[áudio transcrito]", exatamente como o dono pediu, para a Ana saber que
 * está lendo o que a pessoa FALOU, e não escreveu — a diferença importa para o tom da resposta.
 *
 * QUALQUER OUTRA COISA (FALHOU, PENDENTE, ou PRONTA sem texto por algum defeito) tem que dizer à
 * Ana que ela NÃO OUVIU NADA. Sem esta frase explícita, a mensagem viraria só o rótulo "[áudio]" —
 * e uma Ana que respondesse à pergunta anterior ou ficasse em silêncio sobre o áudio pareceria, para
 * quem está do outro lado, uma atendente que ouviu e decidiu ignorar. Ela tem que se explicar.
 */
export function textoParaAgente(msg: MensagemComTranscricao): string {
  const t = msg.transcricao;
  if (!t) return msg.body;
  if (t.status === "PRONTA" && t.texto && t.texto.trim()) {
    return `[áudio transcrito] ${t.texto.trim()}`;
  }
  return "[a pessoa mandou um áudio, mas não foi possível transcrevê-lo — você NÃO ouviu o conteúdo; se for importante, peça para a pessoa escrever o que disse]";
}

// ============================================================================
// O QUE A TELA MOSTRA.
// ============================================================================

export type RotuloDeTranscricaoNaTela = {
  /** O texto a mostrar na bolha. */
  texto: string;
  /** true só quando `texto` É a transcrição de verdade (mostrar como citação); false para um estado. */
  ehConteudo: boolean;
};

/**
 * Decide o que a bolha do áudio mostra para quem tem acesso ao atendimento — nunca para o lead
 * (a área logada já é só da equipe; ver components/atendimento/Conversa.tsx).
 *
 * `null` quando a mensagem não tem transcrição vinculada (não é áudio, ou é um áudio de antes desta
 * entrega) — a tela não mostra bloco nenhum, exatamente como hoje.
 *
 * Os TRÊS estados honestos que o pedido exige: "transcrevendo…" (PENDENTE), o texto de verdade
 * (PRONTA) e "não foi possível transcrever" (FALHOU) — e dentro de FALHOU, o caso especial de
 * "transcrição não configurada" tem rótulo PRÓPRIO (comparando o MOTIVO por igualdade, não por
 * `includes`/prefixo — ver a nota sobre armadilha de varredura em lib/testes/), porque dizer ao
 * usuário "não foi possível transcrever" quando o problema é simplesmente ninguém ter configurado a
 * variável de ambiente esconderia o que ele precisa fazer para resolver.
 */
export function rotuloDeTranscricaoNaTela(t: TranscricaoDaMensagem): RotuloDeTranscricaoNaTela | null {
  if (!t) return null;
  if (t.status === "PRONTA" && t.texto && t.texto.trim()) {
    return { texto: t.texto.trim(), ehConteudo: true };
  }
  if (t.status === "PENDENTE") {
    return { texto: "Transcrevendo…", ehConteudo: false };
  }
  if (t.erro === ERRO_TRANSCRICAO_NAO_CONFIGURADA) {
    return { texto: "Transcrição não configurada", ehConteudo: false };
  }
  return { texto: "Não foi possível transcrever este áudio", ehConteudo: false };
}

// ============================================================================
// O QUE CONFIGURAÇÕES MOSTRA.
// ============================================================================

/**
 * A linha discreta em Configurações → Atendente, dizendo se a transcrição está configurada — hoje
 * só dava pra saber isso olhando a bolha de um áudio já recebido. NUNCA inclui o token nem parte
 * dele: só o estado e, quando configurada, o endereço (que já não é segredo — é só onde o
 * escritório aponta o serviço, o segredo de verdade é o token, que fica só na env var).
 */
export function rotuloDeTranscricaoNasConfiguracoes(configurada: boolean, url?: string | null): string {
  if (!configurada) {
    return "Transcrição de áudio não configurada — o áudio continua sendo guardado no Drive normalmente, só não é transcrito.";
  }
  return url ? `Transcrição de áudio configurada (${url}).` : "Transcrição de áudio configurada.";
}
