import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { whereDoAtendimento, veTodoOAtendimento } from "@/lib/acessoAtendimento";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { findAttendanceIdsByLooseName } from "@/lib/looseNameSearch";
import { filtroDeFase } from "@/lib/funil";
import { contagensPorFase } from "@/lib/listaDeAtendimentos";
import { ORDEM_POR_ATIVIDADE } from "@/lib/atividadeDoAtendimento";
import {
  LIMITE_DA_LISTA,
  digitosDoTermo,
  idsEsperandoResposta,
  lerFiltroDaLista,
  montarLinha,
  termoDeBusca,
} from "@/lib/conversasDoApp";
import BuscaDaLista from "@/components/atendimento-app/BuscaDaLista";
import ListaDeConversasApp from "@/components/atendimento-app/ListaDeConversasApp";
import AtualizarAoVivo from "@/components/atendimento/AtualizarAoVivo";

export const dynamic = "force-dynamic";

// CONVERSAS — a tela inicial do aplicativo (Onda A da proposta v2).
//
// O RECORTE DE ACESSO É O DO SITE (lib/acessoAtendimento.ts): toda consulta abaixo parte de
// `whereDoAtendimento(viewer)` — escritório E dono. Quem só vê os próprios atendimentos nunca traz
// para a memória do servidor a conversa do colega, nem para contar. Sem acesso: 404 (a porta).
//
// A ORDEM É A ATIVIDADE MAIS RECENTE (ORDEM_POR_ATIVIDADE, `ultimaAtividadeEm`) e o `take` vem DEPOIS
// dela: entram as 200 mais ativas, não as 200 mais novas. Antes o app ordenava por `createdAt` e a
// conversa que acabou de receber mensagem ficava embaixo de quem estava parado.
//
// Só conversa de WhatsApp (tem número ou tem mensagem). Rascunho nunca aparece; arquivados e
// recusados ficam escondidos, com o alternador embaixo (mesmo critério da Central do site).
export default async function ConversasAppPage({ searchParams }: { searchParams: { q?: string; f?: string; arq?: string } }) {
  const viewer = await exigirAcessoAoAtendimentoNaTela();
  const soOsMeus = !veTodoOAtendimento(viewer);

  const q = termoDeBusca(searchParams.q);
  const filtro = lerFiltroDaLista(searchParams.f);
  const arq = searchParams.arq === "1";
  const agora = new Date();

  const recorteDeDono = whereDoAtendimento(viewer);
  const doWhatsapp: Prisma.AttendanceWhereInput = { OR: [{ waPhone: { not: null } }, { whatsappMessages: { some: {} } }] };
  const ESCONDIDOS = ["ARQUIVADO", "RECUSADO"];
  const base: Prisma.AttendanceWhereInput = {
    AND: [recorteDeDono, { status: arq ? { not: "RASCUNHO" } : { notIn: ["RASCUNHO", ...ESCONDIDOS] } }, doWhatsapp],
  };

  // Busca por nome ou assunto (sem acento, sem caixa) e por número (só dígitos). O recorte de dono
  // entra também na busca de ids: quem só vê os próprios não acha o lead do colega pelo nome.
  let daBusca: Prisma.AttendanceWhereInput = {};
  if (q) {
    const ids = await findAttendanceIdsByLooseName(q, { AND: [recorteDeDono, { status: { not: "RASCUNHO" } }] });
    const dig = digitosDoTermo(q);
    daBusca = { OR: [{ id: { in: ids } }, ...(dig ? [{ waPhone: { contains: dig } }, { contactPhone: { contains: dig } }] : [])] };
  }
  const recorteDaConsulta: Prisma.AttendanceWhereInput = { AND: [base, daBusca] };

  const [cfg, porFase, leves, ocultos] = await Promise.all([
    prisma.whatsappConfig.findUnique({ where: { officeId: viewer.officeId }, select: { agenteNome: true } }),
    prisma.attendance.groupBy({ by: ["stage"], where: recorteDaConsulta, _count: { _all: true } }),
    // "Esperando resposta" é FATO (a última mensagem é do cliente): não dá para filtrar no banco, então
    // lê só o id e a direção da última mensagem, já na ordem por atividade.
    prisma.attendance.findMany({
      where: recorteDaConsulta,
      select: { id: true, whatsappMessages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true } } },
      orderBy: ORDEM_POR_ATIVIDADE,
      take: 1000,
    }),
    arq
      ? Promise.resolve(0)
      : prisma.attendance.count({ where: { AND: [recorteDeDono, { status: { in: ESCONDIDOS } }, doWhatsapp, daBusca] } }),
  ]);
  const nomeDoAtendente = cfg?.agenteNome?.trim() || "Atendente";
  const contagens = contagensPorFase(porFase);
  const idsEsperando = idsEsperandoResposta(leves);

  const daFiltro: Prisma.AttendanceWhereInput = filtro === "esperando" ? { id: { in: idsEsperando } } : filtroDeFase(filtro === "todas" ? null : filtro);
  const linhas = await prisma.attendance.findMany({
    where: { AND: [recorteDaConsulta, daFiltro] },
    select: {
      id: true,
      clientName: true,
      waPhone: true,
      subject: true,
      stage: true,
      convertedCaseId: true,
      createdAt: true,
      ultimaAtividadeEm: true,
      prazoDeRespostaAte: true,
      agenteResponde: true,
      agenteSilenciadoEm: true,
      responsible: { select: { name: true } },
      whatsappMessages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, body: true, porAgente: true, createdAt: true } },
    },
    orderBy: ORDEM_POR_ATIVIDADE,
    take: LIMITE_DA_LISTA,
  });

  const totalNaLista = filtro === "todas" ? contagens.TODAS : filtro === "esperando" ? idsEsperando.length : contagens[filtro] ?? 0;

  return (
    <div className="animate-fade-in">
      <h1 className="sr-only">Conversas</h1>
      <div className="bg-sf-fundo px-3 pb-2 pt-3">
        <BuscaDaLista q={q} f={filtro} arq={arq} />
      </div>
      <ListaDeConversasApp
        linhas={linhas.map((l) => montarLinha(l, agora, nomeDoAtendente))}
        contagens={contagens}
        esperando={idsEsperando.length}
        filtro={filtro}
        recorte={{ f: filtro, q, arq }}
        totalNaLista={totalNaLista}
        ocultos={ocultos}
        soOsMeus={soOsMeus}
        haConversas={contagens.TODAS > 0 || Boolean(q)}
      />
      {/* Atualiza sozinha a cada 15 s (pausa com a aba oculta): a conversa que acabou de falar sobe. */}
      <AtualizarAoVivo />
    </div>
  );
}
