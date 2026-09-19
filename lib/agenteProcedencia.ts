import { prisma } from "@/lib/prisma";

// ============================================================================
// DE ONDE VEIO ESSE NÚMERO — a linha de procedência sob a resposta do Lúmen Agent.
//
// O PROBLEMA QUE ISTO RESOLVE. Um assistente que responde "você tem 112 processos ativos" pede
// uma decisão de confiança que a pessoa não tem como tomar: o número saiu do banco do escritório
// agora, ou o modelo o inventou com cara de certeza? No primeiro uso real do agente ele respondeu
// "zero cron jobs" e depois "20 processos" havendo mais de cem — e nada na tela permitia
// distinguir uma leitura de uma invenção. A linha de procedência faz essa distinção visível:
// quando ela aparece, houve consulta de verdade; quando não aparece, não houve.
//
// POR QUE SAI DA AUDITORIA E NÃO DA RESPOSTA DO AGENTE. Se a procedência viesse do texto que o
// agente devolve, ela seria só mais uma frase que ele pode escrever sem ter consultado nada — o
// mesmo problema, com aparência de solução. Aqui ela é lida do registro de uso, que é escrito pela
// rota das ferramentas no momento em que os dados saem do banco (app/api/agente/ferramentas). O
// agente não tem como fabricá-la: para a linha aparecer, ele precisa ter realmente consultado.
//
// RECUSA NÃO É PROCEDÊNCIA. Uma tentativa barrada por falta de acesso ao financeiro fica gravada,
// e deve ficar — mas nada foi lido, então não entra nesta linha. A resposta já diz à pessoa que
// não pode ver aquilo; listar "financeiro" embaixo sugeriria o contrário.
// ============================================================================

// O que cada ferramenta lê, dito no vocabulário do escritório e não no do código. O nome técnico
// (`consultar_publicacoes`) não diz nada a quem está lendo a resposta.
const ROTULOS: Record<string, string> = {
  consultar_processos: "processos do escritório",
  consultar_publicacoes: "publicações",
  consultar_agenda: "agenda",
  consultar_atendimento: "atendimentos",
  buscar_cliente: "clientes",
  consultar_financeiro: "financeiro",
};

// O Hermes se registra como "ferramenta" para a auditoria saber quem respondeu, mas ele é o
// cérebro, não uma fonte de dado. Listá-lo faria a linha dizer "consultado: o próprio agente".
const NAO_SAO_FONTE = new Set(["hermes"]);

export function rotuloDaFerramenta(nome: string): string {
  return ROTULOS[nome] ?? nome.replace(/^(consultar|buscar)_/, "").replace(/_/g, " ");
}

// Remove repetições preservando a ordem em que foram consultadas: o agente pode chamar a mesma
// ferramenta três vezes numa pergunta, e "processos · processos · processos" não informa nada.
export function rotulosDeProcedencia(nomes: string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const nome of nomes) {
    if (NAO_SAO_FONTE.has(nome)) continue;
    const rotulo = rotuloDaFerramenta(nome);
    if (vistos.has(rotulo)) continue;
    vistos.add(rotulo);
    saida.push(rotulo);
  }
  return saida;
}

// O caminho do Hermes: ele consulta de fora, por HTTP, e o único lugar deste lado que sabe o que
// ele leu é o registro de uso. `desde` é o instante imediatamente anterior à pergunta — sem ele,
// a linha da resposta de agora incluiria o que foi consultado na pergunta anterior.
//
// A busca é por (usuário, data) e não por (conversa, data) de propósito: é o índice que existe na
// tabela, e ela cresce uma linha por consulta de todo mundo, todo dia. Filtrar pela conversa
// depois é de graça; deixar o banco varrer a tabela inteira não é. A conversa entra como segundo
// filtro para não misturar duas abas abertas ao mesmo tempo pela mesma pessoa.
export async function procedenciaGravada(
  userId: string,
  sessionId: string,
  desde: Date,
): Promise<string[]> {
  const linhas = await prisma.assistantAuditLog.findMany({
    where: {
      userId,
      createdAt: { gte: desde },
      sessionId,
      acao: "FERRAMENTA",
      NOT: { detalhe: { startsWith: "recusada:" } },
    },
    select: { ferramenta: true },
    orderBy: { createdAt: "asc" },
  });
  return rotulosDeProcedencia(linhas.map((l) => l.ferramenta ?? "").filter(Boolean));
}
