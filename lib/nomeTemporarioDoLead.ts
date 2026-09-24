import { telefoneLegivel } from "@/lib/quemEEsteNumero";

// ============================================================================
// O NOME TEMPORÁRIO DO LEAD — F5.5, item do dono: "pasta do Lúmen atendimentos - nome do
// cliente, pois está com nome genérico".
//
// A CAUSA RAIZ. `ingestIncomingWhatsapp` (lib/whatsapp.ts) criava todo atendimento novo com
// `clientName: profileName || fromNumber` e `subject: "Atendimento via WhatsApp"` — um texto FIXO,
// igual para qualquer lead. A pasta do Drive nasce do `subject` (ver getOrCreateAttendanceFolder em
// lib/storageProvider.ts e os comentários do schema em Attendance.driveFolderId): então, sem
// nome de perfil do WhatsApp — comum na Evolution/Baileys, que nem sempre entrega o `pushName` —
// TODA pasta nova nascia com o mesmo nome genérico, e a lista do Drive virava uma fileira de pastas
// indistinguíveis.
//
// A CORREÇÃO TEM DUAS PERNAS:
//   1. Quando o WhatsApp entrega o nome de perfil (`profileName`), ele já era usado — isso
//      continua. É "o nome que apresenta no cadastro do WhatsApp do cliente" que o dono pediu.
//   2. Quando NÃO dá para decifrar o nome, este arquivo cria um nome temporário LEGÍVEL E ÚNICO
//      por telefone (não mais o número cru) — e esta mesma string, em outro lugar, se troca pelo
//      nome de verdade assim que alguém o disser (ver `agenteAtendimento.ts`: a marca
//      `[[NOME:...]]`, e `lib/atendenteResponde.ts`, que aplica a troca — reaproveitando a MESMA
//      mecânica "renomear o assunto renomeia a pasta" que `updateAttendanceSubject`
//      (lib/actions/attendance.ts) já usa para quando um humano corrige o assunto à mão).
// ============================================================================

/** O prefixo que marca um nome como temporário — nunca decidido por chute, sempre por esta função. */
export const PREFIXO_NOME_TEMPORARIO = "Novo contato";

/** O nome temporário de um lead cujo perfil do WhatsApp não trouxe nome nenhum. */
export function nomeTemporarioDoLead(telefone: string): string {
  return `${PREFIXO_NOME_TEMPORARIO} (${telefoneLegivel(telefone)})`;
}

/** Este nome ainda é o temporário que este arquivo gera — ninguém o corrigiu ainda. */
export function nomeEhTemporario(nome: string | null | undefined): boolean {
  return Boolean(nome && nome.startsWith(PREFIXO_NOME_TEMPORARIO));
}

/** O assunto padrão de um atendimento vindo do WhatsApp, com o nome (real ou temporário) junto —
 * é o que dá à pasta do Drive um nome que distingue um lead do outro desde o primeiro instante. */
export function assuntoPadraoWhatsapp(nomeDoCliente: string): string {
  return `Atendimento via WhatsApp — ${nomeDoCliente}`;
}
