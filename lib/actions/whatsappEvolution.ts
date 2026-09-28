"use server";

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { getAppUrl } from "@/lib/appUrl";
import { criarInstancia, conectar, estadoDaInstancia, desconectar, FalhaDaEvolution } from "@/lib/whatsappEvolution";
import { nomeDaInstancia, urlDoQr, lerEstado, type EstadoDaConexao } from "@/lib/qrDaEvolution";
import { mensagemDeErro } from "@/lib/mensagemDeErro";

// ============================================================================
// CONECTAR O WHATSAPP PELO QR.
//
// NADA DE SEGREDO SAI DAQUI PARA A TELA. A chave da API e o segredo do webhook ficam no banco e
// nunca entram numa resposta — a tela precisa saber se está conectado e qual é o QR, e mais nada.
// É por isso que não existe um "carregar configuração" que devolva o registro inteiro: a forma
// mais comum de um segredo vazar é alguém selecionar o objeto todo por conveniência.
//
// O SEGREDO DO WEBHOOK É GERADO AQUI, uma vez, e vai junto na criação da instância. A Evolution o
// devolve em cabeçalho a cada mensagem, e é o que a rota confere. Sem ele a rota recusa tudo —
// fechada por padrão, como deve ser uma porta de entrada.
// ============================================================================

// União discriminada explícita, com os campos marcados como ausentes no ramo de erro — é o que
// faz o `if (r.erro) return` estreitar o tipo na tela. Sem os `never`, o TypeScript não separa os
// dois ramos e a tela precisaria de `!` em toda leitura, que é justamente onde um nulo passa.
type ResultadoDoQr =
  | { erro: string; qr?: never; estado?: never }
  | { erro?: never; qr: string | null; estado: EstadoDaConexao };

type ResultadoDoEstado = { erro: string; estado?: never } | { erro?: never; estado: EstadoDaConexao };

async function exigirAdministrador() {
  const viewer = await getCurrentUser();
  if (!canConfigureIntegrations(viewer)) return { erro: "Apenas administradores configuram o WhatsApp do escritório." as const };
  if (!(await getOfficeModules(viewer.officeId)).whatsapp) {
    return { erro: "O módulo WhatsApp não está incluído no plano deste escritório." as const };
  }
  return { officeId: viewer.officeId };
}

/**
 * Guarda o endereço e a chave do servidor Evolution do escritório.
 *
 * Não fala com a Evolution ainda: separar "guardar o endereço" de "conectar o aparelho" é o que
 * permite corrigir um endereço digitado errado sem depender de o servidor estar no ar.
 */
export async function salvarServidorEvolution(dados: {
  baseUrl: string;
  apiKey: string;
  displayPhone?: string;
}): Promise<{ erro?: string }> {
  const quem = await exigirAdministrador();
  if (quem.erro) return { erro: quem.erro };

  const baseUrl = dados.baseUrl.trim().replace(/\/+$/, "");
  const apiKey = dados.apiKey.trim();
  if (!/^https:\/\//i.test(baseUrl)) {
    // HTTP puro levaria a chave da API e as mensagens dos clientes em texto aberto pela internet.
    return { erro: "O endereço precisa começar com https://." };
  }
  if (!apiKey) return { erro: "Informe a chave da API da Evolution." };

  const instancia = nomeDaInstancia(quem.officeId);
  const conflito = await prisma.whatsappConfig.findUnique({ where: { phoneNumberId: instancia } });
  if (conflito && conflito.officeId !== quem.officeId) {
    return { erro: "Esse nome de instância já está em uso em outro escritório." };
  }

  const atual = await prisma.whatsappConfig.findUnique({
    where: { officeId: quem.officeId },
    select: { webhookSecret: true },
  });

  await prisma.whatsappConfig.upsert({
    where: { officeId: quem.officeId },
    create: {
      officeId: quem.officeId,
      provider: "EVOLUTION",
      phoneNumberId: instancia,
      // A Evolution não usa token da Meta. O campo é obrigatório no schema (ele nasceu para a
      // Meta), então fica explícito em vez de vazio — um campo em branco parece dado faltando.
      accessToken: "evolution",
      baseUrl,
      apiKey,
      // O segredo é gerado UMA VEZ e preservado nas edições seguintes. Regerá-lo a cada "salvar"
      // derrubaria silenciosamente uma instância que já está conectada: ela continuaria mandando
      // o segredo antigo, e a rota passaria a recusar toda mensagem de cliente.
      webhookSecret: crypto.randomBytes(32).toString("hex"),
      displayPhone: dados.displayPhone?.trim() || null,
    },
    update: {
      provider: "EVOLUTION",
      phoneNumberId: instancia,
      baseUrl,
      apiKey,
      webhookSecret: atual?.webhookSecret || crypto.randomBytes(32).toString("hex"),
      displayPhone: dados.displayPhone?.trim() || null,
    },
  });

  revalidatePath("/conexoes");
  return {};
}

async function configuracaoDaEvolution(officeId: string) {
  const cfg = await prisma.whatsappConfig.findUnique({
    where: { officeId },
    select: { provider: true, baseUrl: true, apiKey: true, phoneNumberId: true, webhookSecret: true },
  });
  if (!cfg || cfg.provider !== "EVOLUTION") return null;
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.webhookSecret) return null;
  return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, instancia: cfg.phoneNumberId, segredo: cfg.webhookSecret };
}

/**
 * Pede o QR à Evolution, criando a instância na primeira vez.
 *
 * A criação é tentada SEMPRE, e o erro de "já existe" é engolido de propósito: perguntar antes se
 * existe custa uma ida a mais ao servidor e ainda assim não resolve a corrida entre duas abas.
 */
export async function pedirQrEvolution(): Promise<ResultadoDoQr> {
  const quem = await exigirAdministrador();
  if (quem.erro) return { erro: quem.erro };

  const cfg = await configuracaoDaEvolution(quem.officeId);
  if (!cfg) return { erro: "Salve primeiro o endereço e a chave do servidor Evolution." };

  try {
    try {
      await criarInstancia(cfg, { url: `${getAppUrl()}/api/whatsapp/evolution`, segredo: cfg.segredo });
    } catch (erro) {
      // "Já em uso" é o caminho normal de toda reconexão — só não pode engolir outra coisa.
      const motivo = erro instanceof FalhaDaEvolution ? erro.motivo : mensagemDeErro(erro);
      if (!/already|in use|exists/i.test(motivo)) throw erro;
    }

    const estado = lerEstado(await estadoDaInstancia(cfg));
    if (estado === "conectado") return { qr: null, estado };

    const { qrcode } = await conectar(cfg);
    return { qr: urlDoQr(qrcode), estado: lerEstado(await estadoDaInstancia(cfg)) };
  } catch (erro) {
    return { erro: erro instanceof FalhaDaEvolution ? erro.motivo : "Não foi possível falar com o servidor Evolution." };
  }
}

/** Só o estado, para a tela perguntar de tempos em tempos enquanto o QR está aberto. */
export async function estadoEvolution(): Promise<ResultadoDoEstado> {
  const quem = await exigirAdministrador();
  if (quem.erro) return { erro: quem.erro };

  const cfg = await configuracaoDaEvolution(quem.officeId);
  if (!cfg) return { erro: "O servidor Evolution não está configurado." };

  try {
    const estado = lerEstado(await estadoDaInstancia(cfg));
    if (estado === "conectado") revalidatePath("/conexoes");
    return { estado };
  } catch (erro) {
    return { erro: erro instanceof FalhaDaEvolution ? erro.motivo : "Não foi possível falar com o servidor Evolution." };
  }
}

/**
 * Desliga o aparelho da instância, mas NÃO apaga a configuração.
 *
 * São duas coisas diferentes: "o celular saiu" e "este escritório não usa mais a Evolution". Quem
 * clica em desconectar quase sempre quer a primeira — ler o QR de novo, trocar de aparelho — e
 * apagar endereço, chave e segredo junto obrigaria a refazer tudo por engano.
 */
export async function desconectarEvolution(): Promise<{ erro?: string }> {
  const quem = await exigirAdministrador();
  if (quem.erro) return { erro: quem.erro };

  const cfg = await configuracaoDaEvolution(quem.officeId);
  if (!cfg) return { erro: "O servidor Evolution não está configurado." };

  try {
    await desconectar(cfg);
    revalidatePath("/conexoes");
    return {};
  } catch (erro) {
    return { erro: erro instanceof FalhaDaEvolution ? erro.motivo : "Não foi possível falar com o servidor Evolution." };
  }
}
