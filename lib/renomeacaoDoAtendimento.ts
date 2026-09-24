import { renameDriveFolder } from "@/lib/storageProvider";

// ============================================================================
// O NÚCLEO COMPARTILHADO DE "RENOMEAR O ASSUNTO RENOMEIA A PASTA" (F5.5).
//
// `updateAttendanceSubject` (lib/actions/attendance.ts) já fazia isso à sua própria maneira, inline
// — e continua fazendo, sem usar este arquivo: é código já testado
// (lib/testes/triagemConsertos.teste.ts ancora no corpo dela chamando `renameDriveFolder` direto), e
// mexer nele para reaproveitar este núcleo trocaria um risco pequeno por nenhum ganho.
//
// Este arquivo existe para os caminhos NOVOS da F5.5, que precisam do MESMO efeito mas não têm
// usuário logado para `updateAttendanceSubject` autenticar — a Ana corrigindo o nome do lead
// sozinha (lib/atendenteResponde.ts) e as três ações do pop-up "Quem é esta pessoa"
// (lib/actions/contatoDoAtendimento.ts: definirNomeDoLead, vincularAtendimentoAoCliente,
// cadastrarContatoDoAtendimento). Em vez de cada um duplicar o try/catch best-effort do lado do
// Drive, os quatro chamam esta função.
//
// BEST-EFFORT, DE PROPÓSITO: um escritório sem Drive conectado (ou uma chamada que falhe) não pode
// impedir a correção do cadastro — a pasta fica com o nome antigo até a próxima tentativa, mas o
// resto do trabalho segue.
// ============================================================================

export async function renomearPastaSeExistir(
  driveFolderId: string | null,
  novoAssunto: string,
  assuntoAtual: string,
  officeId: string,
): Promise<void> {
  if (!driveFolderId || novoAssunto === assuntoAtual) return;
  try {
    await renameDriveFolder(driveFolderId, novoAssunto, officeId);
  } catch {
    // Best-effort — ver o comentário do arquivo.
  }
}
