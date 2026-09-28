// QUEM PODE — especificação §4, literal:
//   - Gerar rascunho: qualquer advogado do escritório ou estagiário.
//   - Aprovar/exportar (TRAVA REAL): só advogado com OAB.
//   - Anexar documentos: mesma régua de quem usa a aba (advogado + estagiário).
//   - Recepção: sem acesso — nem para abrir a aba.
//   - Treinar/editar as skills do perfil peticionamento-lumen: só Jairo e Rodrigo Prado
//     (isPlatformOwner — ver comentário de User.isPlatformOwner em prisma/schema.prisma:
//     "Dono(a) da PLATAFORMA Lúmen (Jairo e Rodrigo)", é literalmente esta flag).
//
// Módulo PURO: recebe só os campos necessários (nunca o objeto CurrentUser inteiro, para poder
// ser testado sem tocar em lib/currentUser.ts nem em Prisma) e devolve booleano + motivo. Toda
// Server Action e toda página da aba chamam ESTAS funções — nunca reimplementam a régua com um
// `role === "Advogado"` solto, que é como uma trava real vira cinco travas divergentes.

export type PessoaParaPeticionamento = {
  role: string | null | undefined;
  oab: string | null | undefined;
  isAdmin?: boolean;
  isPlatformOwner?: boolean;
};

function papelNormalizado(role: string | null | undefined): string {
  return (role ?? "").trim().toLowerCase();
}

/**
 * Advogado ou sócio — os dois papéis que a casa já usa para dizer "é advogado" (ver
 * lib/testes/acesso.teste.ts e lib/filaDeTransferencia.ts:PAPEIS_ADVOGADO).
 *
 * ACHADO DE TESTE COM DADO REAL DE STAGING (não hipotético): o cadastro de equipe do próprio
 * escritório usa o FEMININO — "Advogada" já aparece testado em
 * lib/testes/equipeFormato.teste.ts, e a varredura em navegador desta entrega achou uma
 * estagiária de verdade cadastrada como "Estagiária" ficando bloqueada da aba inteira porque
 * este módulo só reconhecia a forma masculina. `PAPEIS_ADVOGADO` (lib/filaDeTransferencia.ts)
 * tem o MESMO buraco hoje — fora do escopo desta entrega corrigir lá, mas aqui a régua não podia
 * ficar errada para metade da equipe por causa de concordância de gênero.
 */
function ehAdvogado(role: string | null | undefined): boolean {
  const p = papelNormalizado(role);
  return p === "advogado" || p === "advogada" || p === "sócio" || p === "socio" || p === "sócia" || p === "socia";
}

function ehEstagiario(role: string | null | undefined): boolean {
  const p = papelNormalizado(role);
  return p === "estagiário" || p === "estagiario" || p === "estagiária" || p === "estagiaria";
}

function ehRecepcao(role: string | null | undefined): boolean {
  const p = papelNormalizado(role);
  return p === "recepcionista" || p === "recepcionista/secretária" || p === "recepcionista/secretaria" || p.includes("recep") || p.includes("secretár") || p.includes("secretar");
}

/** A aba inteira — recepção NUNCA entra, nem para ver o estado vazio. Fail-closed: papel desconhecido também não entra. */
export function podeAcessarAba(pessoa: PessoaParaPeticionamento): boolean {
  if (ehRecepcao(pessoa.role)) return false;
  return ehAdvogado(pessoa.role) || ehEstagiario(pessoa.role) || Boolean(pessoa.isAdmin);
}

/** Gerar rascunho e anexar documentos usam a MESMA régua (especificação §4: "a trava de responsabilidade continua na exportação, não no anexo"). */
export function podeGerarRascunho(pessoa: PessoaParaPeticionamento): boolean {
  return podeAcessarAba(pessoa);
}

export function podeAnexar(pessoa: PessoaParaPeticionamento): boolean {
  return podeAcessarAba(pessoa);
}

export type AvaliacaoDeExportacao = { pode: boolean; motivo: string | null };

/**
 * A TRAVA REAL. Só advogado (ou sócio) COM OAB cadastrada — estagiário nunca passa aqui, mesmo
 * que tenha gerado e editado a minuta inteira sozinho. `isAdmin` sozinho NÃO basta: um sócio
 * administrador sem OAB cadastrada (ex.: sócio não-advogado, financeiro) também não pode
 * confirmar/exportar — a régua é sobre habilitação profissional, não sobre cargo no escritório.
 */
export function avaliarExportacao(pessoa: PessoaParaPeticionamento): AvaliacaoDeExportacao {
  if (!ehAdvogado(pessoa.role)) {
    return { pode: false, motivo: "Só advogado com OAB pode confirmar e exportar. Estagiário pode gerar e editar a minuta, mas esta etapa fica bloqueada para ele." };
  }
  if (!pessoa.oab || pessoa.oab.trim().length === 0) {
    return { pode: false, motivo: "Cadastre a OAB deste usuário em Configurações → Equipe antes de exportar — a exportação exige advogado com OAB registrada." };
  }
  return { pode: true, motivo: null };
}

export function podeExportar(pessoa: PessoaParaPeticionamento): boolean {
  return avaliarExportacao(pessoa).pode;
}

/** Treinar/editar as skills do perfil peticionamento-lumen — só o dono da plataforma (Jairo e Rodrigo). */
export function podeTreinarSkillDoPerfil(pessoa: PessoaParaPeticionamento): boolean {
  return Boolean(pessoa.isPlatformOwner);
}
