// Vocabulário de status do Atendimento — rótulos em Caixa Título, compartilhados entre server e
// client components (por isso mora aqui, não num arquivo "use client" — mesmo motivo documentado
// em lib/funil.ts:1-11). Antes cada tela tinha a própria cópia parcial ou o próprio fallback
// cru (`s.replace("_", " ")`), e elas divergiram: o site mostrava "NOVO"/"EM TRIAGEM" em caixa
// alta crua na barra de filtros enquanto o app mostrava "Novo"/"Em Triagem" corretamente (achado
// A53 da revisão gauntlet).

export const attendanceStatusLabels: Record<string, string> = {
  NOVO: "Novo",
  EM_TRIAGEM: "Em Triagem",
  CONVERTIDO: "Convertido",
  ARQUIVADO: "Arquivado",
  // RECUSADO não é um status que se escolhe num seletor: ele é posto pelo ato de recusar (ver
  // lib/actions/recusaDoLead.ts) e tirado pelo ato de desfazer. Está aqui só para que as telas
  // saibam escrevê-lo — um status sem rótulo aparece como o valor cru do banco.
  RECUSADO: "Recusado",
  RASCUNHO: "Rascunho",
};
