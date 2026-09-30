import type { AutorizadoDeMidia } from "@/lib/envioDeMidiaDb";
import type { RespostaDoEnvio } from "@/lib/envioDeMensagemDb";
import { validarPedidoDeMidia, type PedidoDeMidia } from "@/lib/midiaDeSaida";

// ============================================================================
// A DECISÃO DA ROTA `POST /api/atendimento/[id]/midia-saida`, sem Next e sem banco: recebe as portas por parâmetro, e por isso o teste
// prova a ORDEM com portas falsas. A rota de verdade só monta as portas reais e converte o resultado em Response.
//
// A ORDEM É O RECORTE:
//   1. GUARDA do atendimento (sessão -> acesso ao Atendimento -> dono/escritório): 401 / 403 / 404. NADA é lido antes dela:
//      nem o corpo, nem o arquivo, nem o banco. O `officeId`, o `userId` e o atendimento vêm da GUARDA, nunca do pedido.
//   2. só `application/json` (415); o corpo é validado (400).
//   3. só então o envio (lib/envioDeMidiaDb.ts).
// ============================================================================

export type GuardaDaMidiaDeSaida = { status: 401 | 403 | 404 } | AutorizadoDeMidia;

export type PortasDoPedidoDeMidia = {
  guarda: (idDaConversa: string) => Promise<GuardaDaMidiaDeSaida>;
  /** Só é chamada DEPOIS da guarda. `null` = não é JSON. */
  lerCorpo: () => Promise<{ json: unknown } | { erro: 400 | 415 }>;
  executar: (a: AutorizadoDeMidia, pedido: PedidoDeMidia) => Promise<RespostaDoEnvio>;
};

const FRASE_DA_GUARDA: Record<401 | 403 | 404, string> = { 401: "Não autenticado", 403: "Sem acesso ao Atendimento", 404: "Não encontrado" };

export type RespostaDaRotaDeMidia = { status: number; corpo: unknown };

export async function processarPedidoDeMidia(idDaConversa: string, portas: PortasDoPedidoDeMidia): Promise<RespostaDaRotaDeMidia> {
  const g = await portas.guarda(idDaConversa);
  if ("status" in g) return { status: g.status, corpo: { error: FRASE_DA_GUARDA[g.status] } };

  const lido = await portas.lerCorpo();
  if ("erro" in lido) return { status: lido.erro, corpo: { ok: false, codigo: "INVALIDO", erro: "Pedido inválido." } };
  const pedido = validarPedidoDeMidia(lido.json);
  if (!pedido.ok) return { status: 400, corpo: { ok: false, codigo: "INVALIDO", erro: pedido.erro } };

  const r = await portas.executar(g, pedido.pedido);
  return { status: r.status, corpo: r.corpo };
}
