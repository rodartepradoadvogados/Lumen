import type { CurrentUser } from "@/lib/currentUser";

// Capacidades específicas do suporte da plataforma, separadas de `isAdmin` ("administrador
// DESTE escritório" — ver a explicação longa em lib/currentUser.ts sobre por que o suporte
// mascarado sempre entra com isAdmin: false). Sem isso, qualquer gate que exigisse `isAdmin`
// passou a barrar o suporte também, inclusive para o motivo nº 1 pelo qual ele entra:
// CONFIG_INTEGRACAO (ver lib/supportAccessConstants.ts) — conectar/reconectar Drive, DJEN,
// e-mail e WhatsApp do escritório-cliente.
//
// `viewer.supportMasked` só é `true` quando a requisição está sob o cookie de "atuar como"
// gravado por startActingAsOffice() (ver lib/officeActing.ts e lib/supportContext.ts) — nunca
// para um usuário comum do escritório. Por isso é seguro usar como sinal de "isso é uma sessão
// de suporte", sem precisar reconsultar o banco aqui.
//
// NÃO usar para nada além de configuração de integração. Equipe, Financeiro, Workflows, Blog e
// Cobrança continuam exigindo `isAdmin` puro — o mascaramento (lib/prisma.ts) já impede o
// suporte de ler dado sensível dessas áreas, mas os *gates de escrita/ação* precisam continuar
// fechados também, e isso não é automático: cada action que exigir isAdmin e não for de
// integração deve continuar exigindo isAdmin, sem passar por aqui.
// Declarado como type predicate (em vez de simplesmente `boolean`) de propósito: várias chamadas
// são do formato `if (!canConfigureIntegrations(user)) return ...;` seguido de uso de
// `user.officeId`/`user.id` seguro — o predicate deixa o TypeScript estreitar `user` para
// `CurrentUser` (não-nulo) no restante da função, igual ao que `!user?.isAdmin` já fazia antes.
export function canConfigureIntegrations(
  viewer: CurrentUser | null | undefined
): viewer is CurrentUser {
  if (!viewer) return false;
  return viewer.isAdmin || viewer.supportMasked;
}
