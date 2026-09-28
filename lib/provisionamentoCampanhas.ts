// ============================================================================
// PROVISIONAMENTO AUTOMÁTICO DO PERFIL DE CAMPANHA — regras PURAS (Frente C da especificação
// fechada, §3). Mesmo padrão de lib/moduloCampanhas.ts e lib/campanhasCobranca.ts: sem Prisma,
// sem fetch, sem `Date.now()` implícito. O trabalho de verdade (Prisma + lib/hermesPonte.ts +
// e-mail) fica em lib/actions/provisionamentoCampanhas.ts, que IMPORTA daqui — não reimplementa.
//
// O DESENHO, por extenso na nota técnica que o dono aprovou: `provisionarNoHermes` é uma chamada
// HTTP de até 120s, sem fila, sem nova tentativa e sem estado intermediário gravado. Chamá-la
// SÍNCRONA dentro do webhook de pagamento significaria que, se ela estourasse, o dinheiro teria
// entrado e ninguém saberia que o perfil não subiu — não há pessoa na frente da tela para clicar
// de novo (mesma classe do defeito da transcrição de áudio que ficou "rodando" seis minutos). Por
// isso o webhook só REGISTRA a intenção (PerfilCampanhaHermes.precisaReprovisionar, já gravado
// pela Frente B em lib/actions/campanhasCobranca.ts:confirmarPagamentoMensalidade) e um caminho À
// PARTE, com nova tentativa e estado sempre visível, é quem sobe o perfil de verdade.
// ============================================================================

// Passado este número de tentativas SEM sucesso, a régua para de tentar sozinha e avisa Jairo e
// Rodrigo (§3, item 4 da nota técnica) — nunca um loop eterno de tentativas silenciosas, e nunca
// um único erro de rede definindo "falhou pra sempre" (a VPS pode estar só ocupada num instante).
export const LIMITE_DE_TENTATIVAS_DE_PROVISIONAMENTO = 3;

/** A tentativa de número `numeroDestaTentativa` já esgota o limite? Comparação pura, sem
 * acesso a banco — quem chama decide o que fazer com o resultado (parar de tentar, avisar). */
export function tentativaEsgotouOLimite(numeroDestaTentativa: number): boolean {
  return numeroDestaTentativa >= LIMITE_DE_TENTATIVAS_DE_PROVISIONAMENTO;
}

// ============================================================================
// ESTADO REAL PARA A TELA (Frente D só precisa LER isto) — "nunca um silêncio que pareça
// sucesso": os quatro textos que a nota técnica pede, mais o caso "nem está em processo nenhum"
// (perfil nunca chegou a precisar subir, ou já subiu e não tem pendência).
// ============================================================================

export type SituacaoDoProvisionamento =
  | { situacao: "NO_AR" }
  | { situacao: "SEM_PENDENCIA" } // DESATIVADO e sem `precisaReprovisionar` — nada em andamento
  | { situacao: "PREPARANDO" } // pendente, nenhuma tentativa rodou ainda
  | { situacao: "TENTANDO_DE_NOVO"; tentativas: number; motivo: string }
  | { situacao: "FALHOU_DEFINITIVAMENTE"; tentativas: number; motivo: string };

/**
 * Traduz os campos gravados de PerfilCampanhaHermes num dos cinco estados acima — pura função de
 * leitura, a mesma que lib/actions/provisionamentoCampanhas.ts usa para decidir se ainda vale a
 * pena tentar e que uma futura tela (Frente D) usaria para mostrar o estado real, sem duplicar a
 * tradução em dois lugares.
 *
 * `estaProvisionado` já vem NORMALIZADO fail-closed por quem chama (moduloCampanhas.ts:
 * normalizarEstadoDoPerfil) — esta função não lê texto livre de estado.
 */
export function situacaoDoProvisionamento(entrada: {
  estaProvisionado: boolean;
  precisaReprovisionar: boolean;
  numeroDeTentativas: number;
  falhouDefinitivamente: boolean;
  ultimoErro: string | null;
}): SituacaoDoProvisionamento {
  if (entrada.estaProvisionado) return { situacao: "NO_AR" };
  if (!entrada.precisaReprovisionar) return { situacao: "SEM_PENDENCIA" };
  if (entrada.falhouDefinitivamente) {
    return {
      situacao: "FALHOU_DEFINITIVAMENTE",
      tentativas: entrada.numeroDeTentativas,
      motivo: entrada.ultimoErro ?? "motivo não registrado",
    };
  }
  if (entrada.numeroDeTentativas <= 0) return { situacao: "PREPARANDO" };
  return {
    situacao: "TENTANDO_DE_NOVO",
    tentativas: entrada.numeroDeTentativas,
    motivo: entrada.ultimoErro ?? "motivo não registrado",
  };
}
