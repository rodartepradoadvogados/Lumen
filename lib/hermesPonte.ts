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

const PREFIXO_PERFIL = "lumen-tenant-";

/** O identificador do escritório vira o nome do perfil do Hermes, que é por inquilino. */
export function perfilDoEscritorio(slug: string): string {
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

export async function perguntarAoHermes(dados: {
  slug: string;
  mensagem: string;
  sessao?: string | null;
}): Promise<RespostaHermes> {
  const base = process.env.HERMES_URL;
  const token = process.env.HERMES_TOKEN;
  if (!base || !token) throw new FalhaDoHermes("ponte não configurada");

  // `AbortController` e não só o tempo de espera do servidor: sem isto, uma conexão que abre e
  // nunca responde seguraria a função até o teto da Vercel, e o usuário veria a tela parada.
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ESPERA_MS);

  try {
    const resposta = await fetch(`${base.replace(/\/+$/, "")}/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        perfil: perfilDoEscritorio(dados.slug),
        mensagem: dados.mensagem,
        sessao: dados.sessao || undefined,
      }),
      signal: controle.signal,
      cache: "no-store",
    });

    if (!resposta.ok) {
      // 404 é o caso previsto de "escritório ainda não provisionado no Hermes" — vale distinguir,
      // porque é o único que tem conserto pelo painel e não por quem cuida do servidor.
      const corpo = await resposta.text().catch(() => "");
      const detalhe = corpo.slice(0, 200);
      throw new FalhaDoHermes(
        resposta.status === 404
          ? "perfil do escritório não provisionado no Hermes"
          : `o servidor do Hermes respondeu ${resposta.status}${detalhe ? `: ${detalhe}` : ""}`,
      );
    }

    const dadosResposta = (await resposta.json()) as { resposta?: unknown; sessao?: unknown };
    const texto = typeof dadosResposta.resposta === "string" ? dadosResposta.resposta.trim() : "";
    if (!texto) throw new FalhaDoHermes("o Hermes respondeu vazio");

    return {
      resposta: texto,
      sessao: typeof dadosResposta.sessao === "string" ? dadosResposta.sessao : "",
    };
  } catch (erro) {
    if (erro instanceof FalhaDoHermes) throw erro;
    if (erro instanceof Error && erro.name === "AbortError") {
      throw new FalhaDoHermes(`o Hermes não respondeu em ${Math.round(ESPERA_MS / 1000)}s`);
    }
    throw new FalhaDoHermes(`não foi possível alcançar o Hermes: ${mensagemDeErro(erro)}`);
  } finally {
    clearTimeout(relogio);
  }
}
