// Litisconsórcio: um Case pode ter vários clientes (CaseClient) e várias partes do outro lado
// (CaseParty) — mas Case.clientId/opposingParty* seguem existindo e sempre espelham a primeira
// entrada de cada lista (ver lib/actions/cases.ts). Processos cadastrados ANTES dessa
// funcionalidade não têm nenhuma linha em CaseClient/CaseParty, só os campos legados — daí o
// fallback abaixo: usa a lista nova quando ela existe, senão reconstrói uma lista de 1 item a
// partir dos campos legados. Isso evita ter que rodar uma migração de backfill no banco.

export type EffectiveCaseClient = { id: string; name: string; role: string | null };
export type EffectiveCaseParty = { name: string; role: string | null; document: string | null; address: string | null };

export function effectiveCaseClients(c: {
  clientId: string | null;
  client: { id: string; name: string } | null;
  clientRole: string | null;
  clients: { role: string | null; client: { id: string; name: string } }[];
}): EffectiveCaseClient[] {
  if (c.clients.length > 0) return c.clients.map((cc) => ({ id: cc.client.id, name: cc.client.name, role: cc.role }));
  if (c.client) return [{ id: c.client.id, name: c.client.name, role: c.clientRole }];
  return [];
}

export function effectiveCaseParties(c: {
  opposingPartyName: string | null;
  opposingPartyRole: string | null;
  opposingPartyDocument: string | null;
  opposingPartyAddress: string | null;
  parties: { name: string; role: string; document: string | null; address: string | null }[];
}): EffectiveCaseParty[] {
  if (c.parties.length > 0) return c.parties;
  if (c.opposingPartyName) {
    return [{ name: c.opposingPartyName, role: c.opposingPartyRole, document: c.opposingPartyDocument, address: c.opposingPartyAddress }];
  }
  return [];
}

export const partyRoleLabels: Record<string, string> = {
  AUTOR: "Autor",
  REU: "Réu",
  TERCEIRO_INTERESSADO: "Terceiro Interessado",
  OUTRO: "Outro",
};

export function joinCaseNames(names: string[]): string {
  return names.filter(Boolean).join(", ");
}
