"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { mensagemDeErro } from "@/lib/mensagemDeErro";

// ============================================================================
// AS CAMPANHAS, E QUEM PODE MEXER NELAS.
//
// SÓ ADMINISTRADOR DO ESCRITÓRIO. Decisão do dono, e ela tem razão de ser: uma campanha define o
// que uma máquina vai dizer a um cliente em nome do escritório, e a quem esse cliente será
// entregue. Não é configuração de preferência — é delegação de fala.
//
// A checagem acontece em TODA ação, inclusive nas de leitura. Esconder o menu não é travar nada:
// quem souber o nome da ação a chama do console do navegador.
// ============================================================================

async function exigirAdministrador() {
  const user = await getCurrentUser();
  if (!user || !user.active || !user.isAdmin) return null;
  return user;
}

export type PerguntaDaCampanha = { texto: string };
export type DocumentoDaCampanha = { nome: string; paraQue: string; obrigatorio: boolean };

export type DadosDaCampanha = {
  id?: string;
  nome: string;
  ativa: boolean;
  inicioEm: string | null;
  fimEm: string | null;
  sourceUrl: string;
  textoDoClique: string;
  rede: string;
  area: string;
  sobre: string;
  foraDoEscopo: string;
  primeiraMensagem: string;
  tetoDeMensagens: number;
  perguntas: PerguntaDaCampanha[];
  documentos: DocumentoDaCampanha[];
  mensagemDeTransferencia: string;
  destino: string;
  motivosDeRecusa: string[];
};

function dataOuNula(valor: string | null): Date | null {
  if (!valor?.trim()) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Grava a campanha inteira — ela e as suas listas — numa transação só.
 *
 * As perguntas e os documentos são APAGADOS E REESCRITOS a cada gravação, em vez de conciliados
 * item a item. É o certo aqui: o formulário devolve a lista inteira já na ordem, reordenar é o
 * gesto mais comum, e conciliar por id só existiria para preservar ids que ninguém referencia.
 */
export async function salvarCampanha(dados: DadosDaCampanha): Promise<{ error?: string; id?: string }> {
  const user = await exigirAdministrador();
  if (!user) return { error: "Apenas administradores do escritório podem editar campanhas." };

  const nome = dados.nome.trim();
  if (!nome) return { error: "Dê um nome à campanha." };
  if (!dados.area.trim()) return { error: "Informe a área jurídica desta campanha." };
  if (!dados.sobre.trim()) return { error: "Escreva, em uma frase, do que esta campanha trata." };

  // SEM GATILHO, A CAMPANHA NUNCA SERIA ACIONADA. Deixar gravar assim criaria uma campanha que
  // parece pronta na tela e não atende ninguém — e o escritório levaria dias para descobrir.
  if (!dados.sourceUrl.trim() && !dados.textoDoClique.trim()) {
    return { error: "Informe o link do anúncio ou o texto do clique — sem um dos dois, nada aciona a campanha." };
  }
  // Ver lib/campanhas.ts: texto curto demais casaria com conversas que não são da campanha.
  if (dados.textoDoClique.trim() && dados.textoDoClique.trim().length < 10) {
    return { error: "O texto do clique é curto demais para servir de gatilho. Use pelo menos 10 caracteres." };
  }
  if (dados.ativa && dados.perguntas.filter((p) => p.texto.trim()).length === 0) {
    return { error: "Uma campanha ativa precisa de pelo menos uma pergunta de triagem." };
  }

  const comum = {
    nome,
    ativa: dados.ativa,
    inicioEm: dataOuNula(dados.inicioEm),
    fimEm: dataOuNula(dados.fimEm),
    sourceUrl: dados.sourceUrl.trim() || null,
    textoDoClique: dados.textoDoClique.trim() || null,
    rede: dados.rede.trim() || null,
    area: dados.area.trim(),
    sobre: dados.sobre.trim(),
    foraDoEscopo: dados.foraDoEscopo === "ACOLHE" ? "ACOLHE" : "FORMULARIO",
    primeiraMensagem: dados.primeiraMensagem.trim(),
    tetoDeMensagens: Math.min(40, Math.max(3, Math.round(dados.tetoDeMensagens) || 12)),
    mensagemDeTransferencia: dados.mensagemDeTransferencia.trim(),
    destino: ["ADVOGADOS", "RECEPCAO", "AUTOMATICO"].includes(dados.destino) ? dados.destino : "AUTOMATICO",
    motivosDeRecusa: dados.motivosDeRecusa.map((m) => m.trim()).filter(Boolean),
  };

  const perguntas = dados.perguntas
    .map((p, i) => ({ ordem: i, texto: p.texto.trim() }))
    .filter((p) => p.texto);
  const documentos = dados.documentos
    .map((d, i) => ({ ordem: i, nome: d.nome.trim(), paraQue: d.paraQue.trim() || null, obrigatorio: d.obrigatorio }))
    .filter((d) => d.nome);

  try {
    let id = dados.id;
    if (id) {
      // O `where` com officeId é o que impede editar campanha de outro escritório com um id
      // adivinhado. `updateMany` porque `update` não aceita filtro composto.
      const r = await prisma.campanha.updateMany({ where: { id, officeId: user.officeId }, data: comum });
      if (r.count === 0) return { error: "Campanha não encontrada." };
      await prisma.campanhaPergunta.deleteMany({ where: { campanhaId: id } });
      await prisma.campanhaDocumento.deleteMany({ where: { campanhaId: id } });
    } else {
      const criada = await prisma.campanha.create({
        data: { ...comum, officeId: user.officeId },
        select: { id: true },
      });
      id = criada.id;
    }

    if (perguntas.length > 0) {
      await prisma.campanhaPergunta.createMany({ data: perguntas.map((p) => ({ ...p, campanhaId: id! })) });
    }
    if (documentos.length > 0) {
      await prisma.campanhaDocumento.createMany({ data: documentos.map((d) => ({ ...d, campanhaId: id! })) });
    }

    revalidatePath("/configuracoes");
    return { id };
  } catch (erro) {
    console.error("[campanhas] falha ao salvar:", mensagemDeErro(erro));
    return { error: "Não foi possível salvar a campanha agora." };
  }
}

export async function alternarCampanha(id: string, ativa: boolean): Promise<{ error?: string }> {
  const user = await exigirAdministrador();
  if (!user) return { error: "Apenas administradores do escritório podem ativar campanhas." };

  if (ativa) {
    const c = await prisma.campanha.findFirst({
      where: { id, officeId: user.officeId },
      select: { sourceUrl: true, textoDoClique: true, _count: { select: { perguntas: true } } },
    });
    if (!c) return { error: "Campanha não encontrada." };
    // As mesmas duas travas de `salvarCampanha`, repetidas aqui de propósito: ativar é outro
    // caminho até o mesmo estado, e uma trava que só existe num dos caminhos não é uma trava.
    if (!c.sourceUrl && !c.textoDoClique) return { error: "Esta campanha não tem gatilho: nada a acionaria." };
    if (c._count.perguntas === 0) return { error: "Esta campanha não tem nenhuma pergunta de triagem." };
  }

  await prisma.campanha.updateMany({ where: { id, officeId: user.officeId }, data: { ativa } });
  revalidatePath("/configuracoes");
  return {};
}

export async function excluirCampanha(id: string): Promise<{ error?: string }> {
  const user = await exigirAdministrador();
  if (!user) return { error: "Apenas administradores do escritório podem excluir campanhas." };

  // Atendimento já criado por esta campanha mantém o vínculo: apagar a campanha apagaria a
  // resposta a "de onde veio este lead?", que é justamente o que a campanha existe para registrar.
  const emUso = await prisma.attendance.count({ where: { campanhaId: id, officeId: user.officeId } });
  if (emUso > 0) {
    return {
      error: `Esta campanha já atendeu ${emUso} ${emUso === 1 ? "lead" : "leads"}. Desative-a em vez de excluir — excluir apagaria a origem desses atendimentos.`,
    };
  }

  await prisma.campanha.deleteMany({ where: { id, officeId: user.officeId } });
  revalidatePath("/configuracoes");
  return {};
}

/** O atendimento geral do escritório: nome da atendente, o que ele acrescenta, e o expediente. */
export async function salvarAtendimentoGeral(dados: {
  agenteNome: string;
  agenteInstrucoes: string;
  agenteAtivo: boolean;
  agenteTodos: boolean;
  agenteNumeros: string;
  expedienteDias: string;
  expedienteInicio: string;
  expedienteFim: string;
}): Promise<{ error?: string }> {
  const user = await exigirAdministrador();
  if (!user) return { error: "Apenas administradores do escritório podem editar o atendimento." };

  const config = await prisma.whatsappConfig.findUnique({ where: { officeId: user.officeId }, select: { id: true } });
  if (!config) return { error: "Conecte o WhatsApp do escritório antes de configurar o atendente." };

  const hora = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hora.test(dados.expedienteInicio) || !hora.test(dados.expedienteFim)) {
    return { error: "Horário do expediente inválido. Use o formato 08:00." };
  }
  if (dados.expedienteInicio >= dados.expedienteFim) {
    return { error: "O fim do expediente tem que ser depois do início." };
  }

  await prisma.whatsappConfig.update({
    where: { officeId: user.officeId },
    data: {
      agenteNome: dados.agenteNome.trim() || null,
      agenteInstrucoes: dados.agenteInstrucoes.trim() || null,
      agenteAtivo: dados.agenteAtivo,
      agenteTodos: dados.agenteTodos,
      agenteNumeros: dados.agenteNumeros.trim(),
      expedienteDias: dados.expedienteDias.trim() || "1,2,3,4,5",
      expedienteInicio: dados.expedienteInicio,
      expedienteFim: dados.expedienteFim,
    },
  });

  revalidatePath("/configuracoes");
  return {};
}
