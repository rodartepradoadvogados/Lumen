import { lerModoDoPedido, validarPedidoDeNota } from "@/lib/notaDaConversa";
import { salvarNotaDoApp, type RepositorioDeNotas } from "@/lib/notaDaConversaDb";
import { validarPedidoDeEnvio } from "@/lib/envioDeMensagem";
import { enviarMensagemDoApp } from "@/lib/envioDeMensagemDb";
import type { SendResult } from "@/lib/whatsapp";

// ============================================================================
// O DESPACHO DO POST DO CHAT: mensagem ao cliente OU nota interna. É aqui que o `modo` decide, e a regra é
// a que protege o cliente: SÓ o modo "mensagem" (ou ausente) chega em `enviarMensagemDoApp`. "nota" vai para
// `salvarNotaDoApp` e o provedor não é sequer tocado; modo desconhecido é 400 e não envia nada.
//
// Já vem DEPOIS de `atendimentoDaRota` (a rota chama a guarda antes de ler o corpo).
// ============================================================================

export type RespostaDoPedido = { status: number; corpo: unknown };

export async function despacharPedidoDoChat(
  a: { officeId: string; userId: string; autorNome: string; attendance: { id: string; waPhone: string | null; firstResponseAt: Date | null } },
  corpo: unknown,
  opcoes: { agora?: Date; enviar?: (officeId: string, para: string, texto: string) => Promise<SendResult>; repositorioDeNotas?: RepositorioDeNotas } = {},
): Promise<RespostaDoPedido> {
  const modo = lerModoDoPedido(corpo);
  if (modo === null) return { status: 400, corpo: { ok: false, codigo: "INVALIDO", erro: "Pedido inválido." } };

  if (modo === "nota") {
    const nota = validarPedidoDeNota(corpo);
    if (!nota.ok) return { status: 400, corpo: { ok: false, codigo: "INVALIDO", erro: nota.erro } };
    return salvarNotaDoApp(a, nota, { agora: opcoes.agora, repo: opcoes.repositorioDeNotas });
  }

  const pedido = validarPedidoDeEnvio(corpo);
  if (!pedido.ok) return { status: 400, corpo: { ok: false, codigo: "INVALIDO", erro: pedido.erro } };
  return enviarMensagemDoApp({ officeId: a.officeId, userId: a.userId, attendance: a.attendance }, pedido, { agora: opcoes.agora, enviar: opcoes.enviar });
}
