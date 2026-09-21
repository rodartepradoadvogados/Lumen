// ============================================================================
// MÓDULO PAGO DE CAMPANHAS — decisões de TELA (Frente D da especificação fechada). Regras PURAS,
// sem Prisma nem JSX: o mínimo que faltava para as telas do escritório e do painel mestre não
// precisarem de um `if` decidindo negócio dentro do componente. Tudo aqui só COMPÕE o que as
// Frentes A/B/C já decidiram (lib/moduloCampanhas.ts, lib/campanhasCobranca.ts,
// lib/provisionamentoCampanhas.ts, lib/alertaMemoriaHermes.ts) — nenhuma regra de preço, carência
// ou provisionamento é recalculada aqui, só traduzida para o que a tela mostra.
// ============================================================================

import type { EstadoDaAssinatura, EstadoDoSlot } from "@/lib/moduloCampanhas";
import type { SituacaoDoProvisionamento } from "@/lib/provisionamentoCampanhas";

// ============================================================================
// 1 · NUMERAÇÃO ORDINAL (§6.1) — só a FORMATAÇÃO do número que
// lib/moduloCampanhas.ts:numeroDaProximaCampanha já calculou. "1ª", "2ª", "3ª"... nunca "1°"
// (ordinal feminino: é sempre "campanha", substantivo feminino).
// ============================================================================

export function ordinal(numero: number): string {
  return `${Math.max(1, Math.round(numero))}ª`;
}

/** A frase que explica POR QUE esta posição custa (ou não) — usada na lista de campanhas ativas
 * e no pop-up de solicitação, sempre a MESMA frase para a mesma posição. */
export function rotuloDaPosicao(numero: number): string {
  return numero <= 1 ? `${ordinal(numero)} campanha — incluída na mensalidade` : `${ordinal(numero)} campanha simultânea — cobrança adicional`;
}

// ============================================================================
// 2 · PODE SOLICITAR UMA NOVA CAMPANHA AGORA? — decisão que nem a Frente A nem a B precisavam
// (elas decidem se uma cobrança pode ser GERADA; esta decide se o BOTÃO da tela pode ser
// clicado). "SEM_ASSINATURA" é um quinto estado que só existe aqui: o escritório que nunca
// assinou o módulo não tem `EstadoDaAssinatura` nenhum gravado — não é um texto desconhecido
// (que a Frente A trataria fail-closed como DESATIVADO), é a ausência da própria linha.
// ============================================================================

export type EstadoParaSolicitacao = EstadoDaAssinatura | "SEM_ASSINATURA";

export type DecisaoDeSolicitar = { pode: boolean; motivo: string };

export function podeSolicitarNovaCampanha(estado: EstadoParaSolicitacao): DecisaoDeSolicitar {
  if (estado === "SEM_ASSINATURA") {
    return { pode: false, motivo: "Assine o módulo de campanhas antes de solicitar uma campanha simultânea." };
  }
  if (estado === "DESATIVADO") {
    return { pode: false, motivo: "A assinatura do módulo está desativada por inadimplência — regularize antes de pedir uma nova campanha." };
  }
  // ATIVO e CARENCIA autorizam: §7 é explícito — o serviço (e o direito de pedir) não para
  // durante os 10 dias de carência, só a cobrança diária automática já está rodando.
  return { pode: true, motivo: "" };
}

// ============================================================================
// 3 · O ESTADO DA ASSINATURA NA TELA — texto + tom, uma vez só, para o escritório (banner
// principal) e para o painel mestre (lista de escritórios) nunca descreverem o MESMO estado com
// palavras diferentes.
// ============================================================================

export type TomDaTela = "ok" | "warn" | "risk" | "neutro";

export function rotuloDoEstadoDaAssinatura(
  estado: EstadoDaAssinatura,
  diasRestantesDeCarencia?: number,
): { texto: string; tom: TomDaTela } {
  if (estado === "ATIVO") return { texto: "Assinatura em dia", tom: "ok" };
  if (estado === "CARENCIA") {
    const dias = diasRestantesDeCarencia ?? null;
    const restante = dias != null ? Math.max(0, dias) : null;
    return {
      texto: restante != null ? `Em carência — faltam ${restante} dia(s) até a desativação` : "Em carência",
      tom: "warn",
    };
  }
  return { texto: "Desativada por inadimplência — treinamento preservado", tom: "risk" };
}

// ============================================================================
// 4 · O ESTADO DO PROVISIONAMENTO NA TELA — traduz os cinco casos de
// lib/provisionamentoCampanhas.ts:SituacaoDoProvisionamento (a régua PROÍBE "silêncio que pareça
// sucesso" — por isso os cinco têm texto próprio, nenhum cai num "..." genérico).
// ============================================================================

export function rotuloDaSituacaoDoProvisionamento(situacao: SituacaoDoProvisionamento): { texto: string; tom: TomDaTela } {
  switch (situacao.situacao) {
    case "NO_AR":
      return { texto: "Perfil no ar no Hermes", tom: "ok" };
    case "SEM_PENDENCIA":
      return { texto: "Perfil desativado — sem provisionamento pendente", tom: "neutro" };
    case "PREPARANDO":
      return { texto: "Perfil sendo preparado no Hermes…", tom: "warn" };
    case "TENTANDO_DE_NOVO":
      return {
        texto: `Falhou, tentando de novo (tentativa ${situacao.tentativas}) — ${situacao.motivo}`,
        tom: "warn",
      };
    case "FALHOU_DEFINITIVAMENTE":
      return {
        texto: `Falhou definitivamente após ${situacao.tentativas} tentativa(s) — ${situacao.motivo}`,
        tom: "risk",
      };
  }
}

// ============================================================================
// 5 · O ESTADO DE UM SLOT NA TELA — o ciclo de vida SOLICITADO → APROVADO → ATIVO → FINALIZADO,
// mais RECUSADO (§6). Usado nas duas pontas: a lista de campanhas do escritório e a fila de
// aprovação do painel mestre.
// ============================================================================

export function rotuloDoEstadoDoSlot(estado: EstadoDoSlot): { texto: string; tom: TomDaTela } {
  switch (estado) {
    case "SOLICITADO":
      return { texto: "Aguardando aprovação do Lúmen", tom: "warn" };
    case "APROVADO":
      return { texto: "Aprovado", tom: "ok" };
    case "ATIVO":
      return { texto: "Ativa — cobrança recorrente em dia", tom: "ok" };
    case "FINALIZADO":
      return { texto: "Finalizada", tom: "neutro" };
    case "RECUSADO":
      return { texto: "Recusada pelo painel mestre", tom: "risk" };
  }
}

// ============================================================================
// 6 · MEMÓRIA EM KB → TEXTO LEGÍVEL (painel mestre, §4). Só formatação — a decisão de disparar ou
// não o alerta é de lib/alertaMemoriaHermes.ts:situacaoDeMemoria, nunca recalculada aqui.
// ============================================================================

// ============================================================================
// 7 · RÓTULO DE CADA CHAVE DE PREÇO DO MÓDULO (§2, item em aberto) — vive aqui (módulo comum,
// sem "use server") e não em lib/actions/campanhasPainelMestre.ts porque um arquivo "use server"
// só pode exportar funções assíncronas; a TELA (app/painel-mestre/campanhas/page.tsx) e a ação
// que grava o preço (lib/actions/campanhasPainelMestre.ts:salvarPrecoDoModuloDeCampanhas) leem o
// MESMO rótulo daqui, para nunca divergir entre o que a tela mostra e o que a ação grava na
// primeira vez que a linha é criada.
// ============================================================================

export const ROTULO_DO_PRECO_POR_CHAVE: Record<string, string> = {
  MENSALIDADE_MODULO: "Mensalidade do módulo de campanhas",
  SLOT_EXTRA: "Campanha simultânea adicional (valor fixo por slot)",
};

export function formatarKB(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(1)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
}
