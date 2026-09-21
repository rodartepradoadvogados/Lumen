// A TRAVA DE CLIENTE — hard gate de sistema, não instrução de prompt. Especificação §8: "pode
// combinar processo + assessoria + atendimentos na mesma sessão, desde que do mesmo cliente";
// "bloqueio técnico: misturar contextos de clientes diferentes na mesma sessão — risco de
// vazamento de sigilo profissional entre clientes, não é questão de produtividade."
//
// Módulo PURO: recebe dados já buscados do banco (id/tipo/clienteId/clienteNome de cada
// candidato) e decide o que pode ser marcado — nunca importa @/lib/prisma, para poder ser usado
// tanto pela Server Action (que aplica a trava de verdade) quanto por um teste de mesa sem
// banco nenhum.

export type TipoVinculo = "case" | "attendance" | "assessoria";

export type ItemDeContexto = {
  id: string;
  tipo: TipoVinculo;
  clienteId: string | null;
  clienteNome: string | null;
};

export type ItemComEstado = ItemDeContexto & {
  bloqueado: boolean;
  motivoBloqueio: string | null;
};

/**
 * Dado o cliente já travado nesta sessão (null = sessão ainda sem nenhum vínculo, ou avulsa),
 * marca cada candidato como selecionável ou bloqueado. UM item sem clienteId conhecido
 * (processo/atendimento/assessoria sem cliente cadastrado) é tratado como bloqueado também —
 * fail-closed: sem saber o cliente, não dá para provar que é seguro misturar.
 */
export function avaliarCandidatos(itens: ItemDeContexto[], clienteTravado: string | null): ItemComEstado[] {
  return itens.map((item) => {
    if (clienteTravado === null) {
      // Nada travado ainda — só bloqueia quem não tem cliente identificável.
      if (!item.clienteId) {
        return { ...item, bloqueado: true, motivoBloqueio: "Sem cliente identificado — não é possível confirmar que pode ser combinado com o restante da sessão." };
      }
      return { ...item, bloqueado: false, motivoBloqueio: null };
    }
    if (item.clienteId !== clienteTravado) {
      return {
        ...item,
        bloqueado: true,
        motivoBloqueio: `Bloqueado — pertence a ${item.clienteNome ?? "outro cliente"}, cliente diferente do já selecionado nesta sessão. Misturar clientes numa mesma sessão não é permitido.`,
      };
    }
    return { ...item, bloqueado: false, motivoBloqueio: null };
  });
}

export type ResultadoValidacaoVinculo =
  | { ok: true; clienteId: string; clienteNome: string | null }
  | { ok: false; erro: string };

/**
 * A TRAVA DE VERDADE — chamada pela Server Action antes de gravar qualquer vínculo novo na
 * sessão (nunca só confiada à tela, que pode ter sido contornada por uma chamada direta à
 * action). `clienteTravado` é o que já está gravado em PeticionamentoSessao.clienteId;
 * `candidato` é o item que a pessoa está tentando adicionar agora.
 */
export function validarNovoVinculo(
  clienteTravado: { id: string; nome: string | null } | null,
  candidato: ItemDeContexto,
): ResultadoValidacaoVinculo {
  if (!candidato.clienteId) {
    return { ok: false, erro: "Este item não tem cliente identificado — não pode ser vinculado a uma sessão de peticionamento." };
  }
  if (clienteTravado && candidato.clienteId !== clienteTravado.id) {
    return {
      ok: false,
      erro: `Cliente diferente do já selecionado nesta sessão (${clienteTravado.nome ?? clienteTravado.id}). Misturar clientes numa mesma sessão não é permitido — abra uma nova sessão.`,
    };
  }
  return { ok: true, clienteId: candidato.clienteId, clienteNome: candidato.clienteNome };
}

/** Sessão "avulsa" — nenhum vínculo escolhido. Válida por definição do produto (especificação §10), nunca erro. */
export function ehSessaoAvulsa(vinculos: { caseIds: string[]; attendanceIds: string[]; assessoriaIds: string[] }): boolean {
  return vinculos.caseIds.length === 0 && vinculos.attendanceIds.length === 0 && vinculos.assessoriaIds.length === 0;
}
