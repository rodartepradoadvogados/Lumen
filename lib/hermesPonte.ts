// A PONTE ATÉ O HERMES.
//
// O Hermes é um programa de linha de comando que vive numa máquina do escritório (o VPS), com os
// perfis dos inquilinos no disco dela. A rota antiga (`app/api/hermes/chat`) chamava esse programa
// com `execSync` — e isso NUNCA poderia funcionar na Vercel: a função roda num contêiner efêmero
// onde `/root/.local/bin/lumen-master` não existe, e onde não se deixa um processo de dois minutos
// de pé. Era código correto escrito para o lugar errado.
//
// Aqui a chamada vira o que atravessa a rede: uma requisição HTTP para um serviço pequeno instalado
// ao lado do Hermes, que é quem de fato executa o programa (ver a pasta `servidor-hermes/`).
//
// FECHA-SE SOZINHA. Sem `HERMES_URL` e `HERMES_TOKEN` configurados, `hermesConfigurado()` devolve
// falso e ninguém tenta falar com ninguém. É a mesma regra das outras integrações da casa: uma
// ponte sem o segredo de autenticação não é uma ponte aberta, é uma ponte que não existe.

import { mensagemDeErro } from "@/lib/mensagemDeErro";

/**
 * Quanto se espera pelo Hermes antes de desistir.
 *
 * ERA 45s, e 45s era pouco. Os 45 vinham de guardar orçamento para a reserva responder dentro da
 * mesma função — mas a reserva saiu do desenho (o dono desligou a chave da Anthropic), e o que
 * sobrou foi um corte cedo demais: no primeiro uso real, a pergunta "liste os processos com
 * título, número e cliente" morreu aqui. O agente estava trabalhando; quem desistiu fomos nós.
 *
 * 90s, com `maxDuration = 120` na rota: sobram 30s de folga para o resto do trabalho da função.
 * O serviço do outro lado e o nginx cortam depois, então esta é a trava mais curta da corrente —
 * que é onde ela deve estar, para o erro vir com explicação em vez de um corte seco.
 */
// 105s, e o número não é arbitrário: a Vercel corta a função em 120s (maxDuration), e o servidor
// da ponte, do outro lado, espera 110s pelo Hermes. Com 90s aqui, o Lúmen desistia enquanto a
// ponte ainda estava trabalhando — quinze segundos de folga real jogados fora, e uma resposta que
// já estava vindo virava erro.
//
// EXPORTADA (só a partir da revisão que achou o orçamento de tempo furado, ver
// lib/orcamentoDoPedido.ts) para `esperaParaHermes` usar este mesmo número como TETO — o Hermes
// nunca espera MAIS do que já esperava antes, mesmo quando sobra orçamento de pedido de sobra
// (ex.: mensagem de texto, sem mídia nem transcrição pela frente).
export const ESPERA_MS = Number(process.env.HERMES_TIMEOUT_MS || 105_000);

/**
 * QUANTO SE ESPERA PELO PETICIONAMENTO — e só por ele.
 *
 * Um pedido de peticionamento não é uma pergunta de chat: leva o TEXTO dos documentos anexados,
 * até 200.000 caracteres (`PERGUNTA_MAXIMA` da ponte, espelhado em
 * lib/peticionamentoJanelaDeContexto.ts). Ler algumas dezenas de páginas e redigir uma peça
 * inteira demora mais que responder "quais processos estão parados" — e os 105s de `ESPERA_MS`,
 * dimensionados para conversa, cortariam no meio da redação.
 *
 * SUBIR O TETO DE TAMANHO SEM SUBIR O DE TEMPO SERIA TROCA RUIM: o advogado deixaria de receber
 * um 400 limpo ("não cabe, faça assim") para receber um tempo esgotado depois de dois minutos de
 * espera — erro pior, porque não diz nada e ainda cobra a espera.
 *
 * É uma constante SEPARADA, e não `ESPERA_MS` aumentado, porque o caminho da Ana (atendimento,
 * WhatsApp) não pode herdar isto: lá, esperar quatro minutos por uma resposta de chat é um
 * defeito, não uma paciência. Ali o orçamento continua sendo o de lib/orcamentoDoPedido.ts.
 *
 * A CORRENTE, do mais curto para o mais longo — cada elo precisa ser menor que o próximo, para
 * quem desiste primeiro ser sempre quem sabe explicar:
 *   este número                                        230s
 *     < ponte (ESPERA_S, servidor-hermes/servidor.py)  240s
 *       < nginx (proxy_read_timeout, LEIA-ME.md)       280s
 *         < Vercel (maxDuration em
 *           app/peticionamento/[id]/confirmar/page.tsx) 300s
 */
export const ESPERA_PETICIONAMENTO_MS = Number(process.env.HERMES_TIMEOUT_PETICIONAMENTO_MS || 230_000);

/**
 * O nome do perfil do Hermes para um escritório.
 *
 * O desenho é um perfil por inquilino, `lumen-tenant-<slug>`, e é para lá que isto caminha. Mas a
 * instalação de hoje tem UM perfil só, com outro nome (`atendimento-lumen`), criado antes desta
 * convenção existir. `HERMES_PERFIL` existe para essa travessia: quando definida, ela manda, e o
 * Lúmen fala com o perfil que de fato existe.
 *
 * Isto é uma ponte entre o desenho e a realidade, e é temporária de propósito. Quando houver um
 * perfil por escritório, basta apagar a variável na Vercel — o código abaixo já faz o certo
 * sozinho, sem release nenhum. Não invente um prefixo aqui: foi exatamente um prefixo inventado
 * (`lumen-tenant-`, que nunca existiu na máquina) que manteve esta integração quebrada por dias.
 */
const PREFIXO_PERFIL = "lumen-tenant-";

export function perfilDoEscritorio(slug: string): string {
  const fixo = process.env.HERMES_PERFIL?.trim();
  if (fixo) return fixo;
  return `${PREFIXO_PERFIL}${slug}`;
}

export function hermesConfigurado(): boolean {
  return Boolean(process.env.HERMES_URL && process.env.HERMES_TOKEN);
}

export type RespostaHermes = {
  resposta: string;
  /** O id da conversa DO LADO DO HERMES, para a próxima pergunta continuar de onde parou. */
  sessao: string;
};

/** Erro que carrega o motivo em linguagem de gente, para virar registro de auditoria. */
export class FalhaDoHermes extends Error {
  readonly motivo: string;
  constructor(motivo: string) {
    super(motivo);
    this.name = "FalhaDoHermes";
    this.motivo = motivo;
  }
}

/**
 * Uma chamada qualquer à ponte, com o segredo e o tempo de espera já resolvidos.
 *
 * Existe para `perguntarAoHermes` e o provisionamento não repetirem a mesma cerimônia — e,
 * principalmente, para o tratamento de erro ser um só: quem chama recebe sempre `FalhaDoHermes`
 * com um motivo legível, nunca um erro de rede cru para traduzir na mão.
 */
async function chamar(
  caminho: string,
  opcoes: { metodo?: "GET" | "POST"; corpo?: unknown; esperaMs?: number },
): Promise<unknown> {
  const base = process.env.HERMES_URL;
  const token = process.env.HERMES_TOKEN;
  if (!base || !token) throw new FalhaDoHermes("ponte não configurada");

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), opcoes.esperaMs ?? ESPERA_MS);

  try {
    const resposta = await fetch(`${base.replace(/\/+$/, "")}${caminho}`, {
      method: opcoes.metodo ?? "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
      signal: controle.signal,
      cache: "no-store",
    });

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      throw new FalhaDoHermes(
        resposta.status === 404
          ? "perfil do escritório não encontrado no Hermes"
          : `o servidor do Hermes respondeu ${resposta.status}${corpo ? `: ${corpo.slice(0, 200)}` : ""}`,
      );
    }
    return await resposta.json();
  } catch (erro) {
    if (erro instanceof FalhaDoHermes) throw erro;
    if (erro instanceof Error && erro.name === "AbortError") {
      // DEMORA NÃO É QUEDA, e confundir as duas custou uma manhã: o dono passou o dia achando que
      // a máquina caía, porque a tela dizia "indisponível" quando o agente só estava lento.
      throw new FalhaDoHermes(
        `DEMORA: o Hermes não respondeu em ${Math.round((opcoes.esperaMs ?? ESPERA_MS) / 1000)}s`,
      );
    }
    throw new FalhaDoHermes(`não foi possível alcançar o Hermes: ${mensagemDeErro(erro)}`);
  } finally {
    clearTimeout(relogio);
  }
}

// ── PERFIS DOS ESCRITÓRIOS ──────────────────────────────────────────────────────────────────
// Um escritório sem perfil provisionado tem a caixa de conversa muda: o Hermes responde "perfil
// não encontrado" e não há nada que a pessoa possa fazer pela tela. É por isso que estas três
// funções são caminho crítico do produto, e não ferramenta de administrador.

export async function listarPerfisDoHermes(): Promise<unknown> {
  return chamar("/perfis", { metodo: "GET", esperaMs: 30_000 });
}

export async function provisionarNoHermes(dados: {
  slug: string;
  officeId: string;
  nome: string;
}): Promise<unknown> {
  return chamar("/provisionar", { corpo: dados, esperaMs: 120_000 });
}

export async function desprovisionarNoHermes(slug: string): Promise<unknown> {
  return chamar("/desprovisionar", { corpo: { slug }, esperaMs: 60_000 });
}

// ── O PERFIL DE CAMPANHA (módulo pago, Frente C) ────────────────────────────────────────────
//
// Diferente de `perfilDoEscritorio` (atendimento normal, ainda preso ao perfil único
// "atendimento-lumen" da instalação de hoje — ver o comentário lá em cima), o perfil de campanha
// NÃO TEM legado nenhum para dar ponte: ele só passa a existir a partir da assinatura do módulo
// pago (§8 da especificação de campanhas — "hoje não existe nenhuma campanha sem o módulo pago").
// Por isso a convenção nasce direto no desenho final, "um perfil por escritório", sem a variável
// de ambiente de escape que `perfilDoEscritorio` precisa.
export function perfilDeCampanha(slug: string): string {
  return `lumen-campanha-${slug}`;
}

// ── MEMÓRIA DA MÁQUINA (não de um perfil) — alerta de VPS, §4 ──────────────────────────────
//
// NÃO CONFUNDIR com `EstadoDoPerfil.memoriaKB` (abaixo): aquele é o tamanho em disco do state.db
// de UM perfil; isto é RAM disponível + swap livre da MÁQUINA INTEIRA que hospeda o Hermes. Os
// dois vêm de rotas diferentes da ponte porque são perguntas diferentes — a de perfil já existia
// (lida pelo painel mestre para saber se um escritório está provisionado); esta é NOVA (rota
// `/memoria` em servidor-hermes/servidor.py), criada para o alerta de memória da §4. Exige a
// atualização do servidor da ponte na VPS — ver o passo a passo no relatório desta frente.
export type MemoriaDaMaquina = {
  /** MemAvailable de /proc/meminfo, em KB — o que o próprio kernel considera "livre para uso sem
   *  trocar para o swap" (mais correto que MemFree sozinho, que conta como ocupado boa parte do
   *  cache de disco que o kernel devolve na hora se um processo precisar). */
  ramDisponivelKB: number;
  ramTotalKB: number;
  /** SwapFree de /proc/meminfo, em KB. */
  swapLivreKB: number;
  swapTotalKB: number;
};

export async function memoriaDaMaquina(): Promise<MemoriaDaMaquina> {
  const corpo = (await chamar("/memoria", { metodo: "GET", esperaMs: 15_000 })) as Partial<
    Record<keyof MemoriaDaMaquina, unknown>
  >;
  const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    ramDisponivelKB: numero(corpo.ramDisponivelKB),
    ramTotalKB: numero(corpo.ramTotalKB),
    swapLivreKB: numero(corpo.swapLivreKB),
    swapTotalKB: numero(corpo.swapTotalKB),
  };
}

export type EstadoDoPerfil = {
  perfil: string;
  existe: boolean;
  memoriaKB: number;
  sessoes: number;
};

/**
 * O estado de vários perfis de uma vez, lido do disco da máquina.
 *
 * Numa chamada só, de propósito: o painel mestre lista todos os escritórios, e uma requisição por
 * escritório transformaria abrir a tela numa saraivada de chamadas à outra ponta.
 *
 * E é leitura de disco, não uma pergunta ao modelo. A tela antiga descobria se um escritório
 * estava provisionado mandando o agente responder "ping" — uma chamada paga por escritório, toda
 * vez que alguém abrisse a página. Saber se a pasta existe não deveria custar dinheiro.
 */
export async function estadoDosPerfis(perfis: string[]): Promise<EstadoDoPerfil[]> {
  if (perfis.length === 0) return [];
  const corpo = (await chamar("/estado", { corpo: { perfis }, esperaMs: 20_000 })) as {
    estados?: unknown;
  };
  return Array.isArray(corpo.estados) ? (corpo.estados as EstadoDoPerfil[]) : [];
}

// ── A PERGUNTA ─────────────────────────────────────────────────────────────────────────────

// ── O TERCEIRO PERFIL: peticionamento-lumen ─────────────────────────────────────────────────
//
// A especificação da aba de Peticionamento (seção 1 e 6) nomeia um perfil PRÓPRIO,
// `peticionamento-lumen`, ao lado dos dois que já existem (`default`, `atendimento-lumen`) — e
// diz que o desenho final é "um perfil por escritório", mas que a instalação de hoje tem só um
// perfil de cada tipo na máquina (mesma situação, mesma solução, de `atendimento-lumen` acima:
// ver o comentário de `perfilDoEscritorio`). Por isso este perfil é resolvido pelo MESMO
// raciocínio — nome fixo por padrão, com uma variável de ambiente como escape hatch para o dia
// em que a instalação migrar para um perfil por escritório — em vez de reusar
// `perfilDoEscritorio` (que resolveria para `atendimento-lumen`, o perfil ERRADO: peticionar e
// atender são conversas com regras e travas completamente diferentes, nunca a mesma sessão).
const PERFIL_PETICIONAMENTO_PADRAO = "peticionamento-lumen";

export function perfilDePeticionamento(): string {
  return process.env.HERMES_PERFIL_PETICIONAMENTO?.trim() || PERFIL_PETICIONAMENTO_PADRAO;
}

/**
 * Mesma pergunta de `perguntarAoHermes`, mas com o NOME DO PERFIL escolhido por quem chama, em
 * vez de derivado do slug do escritório — usada só pelo Peticionamento, cujo perfil não é "um
 * por escritório" na instalação de hoje (ver `perfilDePeticionamento` acima). Reaproveita o
 * mesmo tratamento de erro de `chamar` (nunca um erro de rede cru para quem chama traduzir na
 * mão) e o mesmo teto de tempo (`ESPERA_MS`).
 */
export async function perguntarAoHermesComPerfil(dados: {
  perfil: string;
  mensagem: string;
  sessao?: string | null;
  ferramentas?: { url: string; credencial: string };
  esperaMs?: number;
}): Promise<RespostaHermes> {
  const corpo = (await chamar("/chat", {
    corpo: {
      perfil: dados.perfil,
      mensagem: dados.mensagem,
      sessao: dados.sessao || undefined,
      ferramentas: dados.ferramentas,
    },
    esperaMs: dados.esperaMs,
  })) as { resposta?: unknown; sessao?: unknown };

  const texto = typeof corpo.resposta === "string" ? corpo.resposta.trim() : "";
  if (!texto) throw new FalhaDoHermes("o Hermes respondeu vazio");

  return { resposta: texto, sessao: typeof corpo.sessao === "string" ? corpo.sessao : "" };
}

export async function perguntarAoHermes(dados: {
  slug: string;
  mensagem: string;
  sessao?: string | null;
  /**
   * Onde o agente busca os dados do escritório, e com que credencial.
   *
   * Vai JUNTO COM A PERGUNTA, e não gravado no servidor do Hermes, porque a credencial é daquela
   * pergunta: ela carrega quem perguntou e o que essa pessoa pode ver (ver lib/agenteCredencial).
   * Um token guardado no servidor seria do escritório inteiro, e aí o financeiro de um sócio
   * vazaria para um estagiário que soubesse formular a pergunta.
   */
  ferramentas?: { url: string; credencial: string };
  /**
   * Quanto esperar por ESTA pergunta, substituindo o padrão (`ESPERA_MS`) — usado pelo webhook do
   * WhatsApp para nunca esperar mais do que sobrou do orçamento do PEDIDO inteiro (ver
   * lib/orcamentoDoPedido.ts:esperaParaHermes). `undefined` mantém o padrão de sempre — é o que os
   * outros dois chamadores (app/api/admin/hermes, app/api/assistente) continuam fazendo.
   */
  esperaMs?: number;
}): Promise<RespostaHermes> {
  const corpo = (await chamar("/chat", {
    corpo: {
      perfil: perfilDoEscritorio(dados.slug),
      mensagem: dados.mensagem,
      // O id da conversa do lado do Hermes. Ausente na primeira pergunta — é ele quem devolve.
      sessao: dados.sessao || undefined,
      ferramentas: dados.ferramentas,
    },
    esperaMs: dados.esperaMs,
  })) as { resposta?: unknown; sessao?: unknown };

  const texto = typeof corpo.resposta === "string" ? corpo.resposta.trim() : "";
  // Resposta vazia é falha, não resposta: sem isto a tela mostraria um balão em branco e o
  // usuário ficaria sem saber se perguntou errado ou se o assistente quebrou.
  if (!texto) throw new FalhaDoHermes("o Hermes respondeu vazio");

  return {
    resposta: texto,
    sessao: typeof corpo.sessao === "string" ? corpo.sessao : "",
  };
}
