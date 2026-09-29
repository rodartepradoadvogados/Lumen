import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { podeVerAtendimentos, whereDeUmAtendimento } from "@/lib/acessoAtendimento";

// O que o cabeçalho e as duas guias da conversa precisam saber dela, lido UMA vez por pedido
// (`cache` do React: o layout e as páginas chamam e a consulta roda uma só).
//
// O DONO ENTRA NO WHERE (`whereDeUmAtendimento`: id + escritório de quem pede + recorte por dono): a
// conversa do colega simplesmente não existe aqui — devolve null, e a tela diz "Sem acesso a esta
// conversa" sem nome, sem número e sem mensagem.
export const carregarConversaDoApp = cache(async (id: string) => {
  const viewer = await getCurrentUser();
  if (!viewer || !podeVerAtendimentos(viewer)) return null;
  return prisma.attendance.findFirst({
    where: whereDeUmAtendimento(viewer, id),
    select: {
      id: true,
      clientName: true,
      waPhone: true,
      contactPhone: true,
      subject: true,
      agenteResponde: true,
      agenteSilenciadoEm: true,
      prazoDeRespostaAte: true,
    },
  });
});
