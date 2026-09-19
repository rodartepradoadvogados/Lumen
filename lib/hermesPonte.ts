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
 * Quanto se espera pelo Hermes antes de desistir e cair na reserva.
 *
 * 45s e não os 120s que o programa aceita: depois de desistir ainda é preciso tempo para o Claude
 * responder DENTRO da mesma função (ver `maxDuration` na rota). Um tempo de espera que consome o
 * orçamento inteiro transforma a reserva em enfeite — ela nunca chegaria a rodar.
 */
const ESPERA_MS = Number(process.env.HERMES_TIMEOUT_MS || 45_000);

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
      throw new FalhaDoHermes(`o Hermes não respondeu em ${Math.round((opcoes.esperaMs ?? ESPERA_MS) / 1000)}s`);
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
}): Promise<RespostaHermes> {
  const corpo = (await chamar("/chat", {
    corpo: {
      perfil: perfilDoEscritorio(dados.slug),
      mensagem: dados.mensagem,
      // O id da conversa do lado do Hermes. Ausente na primeira pergunta — é ele quem devolve.
      sessao: dados.sessao || undefined,
      ferramentas: dados.ferramentas,
    },
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
