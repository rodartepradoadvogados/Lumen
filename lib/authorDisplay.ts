export const SUPPORT_AUTHOR_LABEL = "Suporte Lúmen";

// Quando um registro (comentário, aviso...) foi criado por alguém de FORA do escritório que está
// vendo a tela, mostra um rótulo genérico em vez do nome real — cenário que só acontece durante
// uma sessão de suporte "atuar como" (o autor gravado é o usuário REAL do platform owner,
// pertencente a outro Office; ver lib/currentUser.ts). Não mexe no dado gravado — o FK authorId
// continua apontando pro usuário real, preservando a auditoria (inclusive o registro de ESCRITA
// do "Vidro Fosco", lib/prisma.ts) — só a EXIBIÇÃO muda, para a equipe do escritório-cliente não
// ver um nome que não é da própria equipe (achado A33 da revisão gauntlet).
export function authorDisplayName(author: { name: string; officeId: string }, viewerOfficeId: string): string {
  return author.officeId === viewerOfficeId ? author.name : SUPPORT_AUTHOR_LABEL;
}
