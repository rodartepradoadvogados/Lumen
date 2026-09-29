"use client";

import { AlertTriangle, Check, Clock, Ear, HelpCircle, Info, Lock, MoreVertical, Pin, RefreshCw, Trash2 } from "lucide-react";
import IconeAgente from "@/components/IconeAgente";
import MidiaDaBolha from "@/components/atendimento-app/MidiaDaBolha";
import type { MensagemDoChat } from "@/lib/mensagensDoChat";

// O BALÃO. Recebida em branco; enviada por pessoa em ouro suave; da Ana com borda de ouro e o nome.
// Quem falou nunca depende de cor: a bolha tem lado, e o leitor de tela ouve "Cliente" ou "Escritório".
// MÍDIA É RÓTULO; o ÁUDIO mostra o rótulo e a transcrição, "para consulta da equipe". Toque na bolha
// não faz nada.
//
// OS ESTADOS DE ENVIO (mensagem que saiu deste aparelho e o servidor ainda não devolveu):
//   enviando        relógio + "Enviando…"
//   enviada         ✓ (o servidor gravou)
//   falhou          alerta + motivo + "Tentar de novo" e "Descartar" (sem "tentar de novo" quando não adianta)
//   sem confirmação alerta + "Pode ter sido enviada: confira antes de repetir" + "Conferir e tentar de novo"
// O ícone e o texto dizem o estado; a cor só reforça.
//
// NOTA INTERNA (`m.tipo === "nota"`) e AVISO DE SISTEMA (`"sistema"`) vêm de NotaDaConversa, não do WhatsApp:
// só a equipe vê e nunca saíram para o cliente. Nunca se confundem com mensagem ao cliente: a nota tem borda
// TRACEJADA de ardósia, cadeado e o rótulo "Nota interna · só a equipe" com autor e hora; o aviso é centralizado,
// de borda contínua, com ícone de informação e "Aviso do sistema · só a equipe". Rótulo e ícone dizem o que é;
// a cor só reforça.

export default function BolhaDaMensagem({
  m,
  idDaConversa,
  nomeDoAtendente,
  fixada,
  aoAbrirAcoes,
  aoTentarDeNovo,
  aoDescartar,
  confirmandoReenvio,
  aoConfirmarReenvio,
  aoCancelarReenvio,
}: {
  m: MensagemDoChat;
  /** A conversa: a mídia do balão vem da rota autenticada dela (PR 8). */
  idDaConversa: string;
  nomeDoAtendente: string;
  /** Esta é a mensagem fixada no topo (PR 10). */
  fixada?: boolean;
  /** Abre o menu Responder / Fixar (PR 10); só existe para mensagem que o servidor já gravou. */
  aoAbrirAcoes?: (m: MensagemDoChat) => void;
  aoTentarDeNovo?: (clientMessageId: string) => void;
  aoDescartar?: (clientMessageId: string) => void;
  confirmandoReenvio?: boolean;
  aoConfirmarReenvio?: (clientMessageId: string) => void;
  aoCancelarReenvio?: () => void;
}) {
  const saiu = m.direction === "OUT";
  const autor = saiu ? (m.porAgente ? nomeDoAtendente : "Escritório") : "Cliente";
  const local = m.envioLocal;
  const falhou = m.falhou || local?.estado === "falhou";
  const duvida = local?.estado === "sem-confirmacao";
  const enviando = local?.estado === "enviando";
  const chave = m.clientMessageId;
  const ehNota = m.tipo === "nota";

  if (m.tipo === "sistema") {
    return (
      <div className="flex justify-center py-0.5" data-mensagem={m.id} data-tipo="sistema">
        <div className="max-w-[92%] break-words rounded-[2px] border border-regua-forte bg-sf-apoio px-2.5 py-1.5 text-center [overflow-wrap:anywhere]">
          <span className="sr-only">Aviso do sistema, só da equipe: </span>
          <p className="mb-0.5 flex items-center justify-center gap-1.5 text-etiqueta font-bold text-tx-2">
            <Info size={12} aria-hidden="true" />
            Aviso do sistema · só a equipe
          </p>
          <p className="whitespace-pre-wrap text-corpo text-tx">{m.texto}</p>
          <p className="mt-0.5 text-etiqueta tabular-nums text-tx-2">
            <time dateTime={m.criadoEm}>{m.hora}</time>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${saiu ? "items-end" : "items-start"}`} data-mensagem={m.id} data-tipo={ehNota ? "nota" : undefined} data-envio={local?.estado ?? (m.enviada ? "enviada" : undefined)}>
      <div className={`flex w-full items-end gap-0.5 ${saiu ? "flex-row-reverse" : ""}`}>
      <div
        className={`min-w-0 max-w-[84%] break-words rounded-[2px] border px-2.5 pb-1 pt-1.5 [overflow-wrap:anywhere] ${
          falhou ? "border-urgente bg-urgente-bg" : duvida ? "border-aviso bg-aviso-bg" : ehNota ? "border-dashed border-atd-ardosia bg-atd-ardosia-bg" : `${saiu ? "bg-atd-bolha-out" : "bg-atd-bolha-in"} ${m.porAgente ? "border-ouro-acento" : saiu ? "border-atd-borda-out" : "border-atd-borda-in"}`
        }`}
      >
        <span className="sr-only">{ehNota ? `Nota interna, só da equipe, de ${m.autor || "você"}: ` : `${autor} disse: `}</span>
        {ehNota && (
          <p className="mb-0.5 flex items-center gap-1.5 text-etiqueta font-bold text-atd-ardosia">
            <Lock size={12} aria-hidden="true" />
            Nota interna · só a equipe
          </p>
        )}
        {saiu && m.porAgente && (
          <p className="mb-0.5 flex items-center gap-1.5 text-etiqueta font-bold text-tx-2">
            <IconeAgente size={12} className="text-tx-3" />
            {nomeDoAtendente}
          </p>
        )}
        {m.midia && <MidiaDaBolha idDaConversa={idDaConversa} idDaMensagem={m.id} midia={m.midia} recebida={!saiu} />}
        {m.texto && <p className="whitespace-pre-wrap text-corpo text-tx">{m.texto}</p>}
        {m.transcricao && (
          <div className="mt-1.5 rounded-[2px] border border-regua bg-atd-ardosia-bg px-2 py-1.5">
            <p className="mb-0.5 flex items-center gap-1.5 text-etiqueta font-bold text-atd-ardosia">
              <Ear size={13} aria-hidden="true" />
              Transcrição do áudio, para consulta da equipe
            </p>
            <p className={`whitespace-pre-wrap text-corpo text-tx-2 ${m.transcricao.ehConteudo ? "italic" : ""}`}>
              {m.transcricao.ehConteudo ? `“${m.transcricao.texto}”` : m.transcricao.texto}
            </p>
          </div>
        )}
        <p className="mt-0.5 flex items-center justify-end gap-1.5 text-etiqueta tabular-nums text-tx-2">
          {ehNota && <span className="min-w-0 truncate font-semibold">{m.autor || "Você"} ·</span>}
          {enviando && (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} aria-hidden="true" /> Enviando…
            </span>
          )}
          {falhou && (
            <span className="inline-flex items-center gap-1 font-semibold text-urgente">
              <AlertTriangle size={12} aria-hidden="true" /> {ehNota ? "Não salva" : "Não enviada"}
            </span>
          )}
          {duvida && (
            <span className="inline-flex items-center gap-1 font-semibold text-tx">
              <HelpCircle size={12} aria-hidden="true" /> Sem confirmação
            </span>
          )}
          {(m.enviada || local?.estado === "enviada") && (
            <span className="inline-flex items-center gap-0.5" title={ehNota ? "Salva" : "Enviada"}>
              <Check size={12} aria-hidden="true" />
              <span className="sr-only">{ehNota ? "Salva" : "Enviada"}</span>
            </span>
          )}
          {fixada && (
            <span className="inline-flex items-center gap-0.5 font-semibold">
              <Pin size={12} aria-hidden="true" /> Fixada
            </span>
          )}
          <time dateTime={m.criadoEm}>{m.hora}</time>
        </p>
      </div>
      {aoAbrirAcoes && !local && !m.id.startsWith("local-") && (
        <button type="button" onClick={() => aoAbrirAcoes(m)} aria-label={`Mais ações da mensagem de ${autor}, ${m.hora}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] text-tx-3 hover:bg-sf-apoio hover:text-tx">
          <MoreVertical size={16} aria-hidden="true" />
        </button>
      )}
      </div>

      {local && (falhou || duvida) && chave && (
        <div role="alert" className="mt-1 flex max-w-[92%] flex-col items-end gap-1.5 text-right">
          <p className={`text-corpo font-semibold ${falhou ? "text-urgente" : "text-tx"}`}>{falhou ? `${ehNota ? "Não salva" : "Não enviada"} · ${local.erro ?? "erro desconhecido"}` : (local.erro ?? "Pode ter sido enviada: confira antes de repetir.")}</p>
          {confirmandoReenvio ? (
            <div className="flex flex-col items-end gap-1.5">
              <p className="text-corpo text-tx">Não dá para saber se saiu. Enviar de novo pode chegar duas vezes ao cliente.</p>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={aoCancelarReenvio} className="inline-flex min-h-11 items-center rounded-[2px] border border-regua-forte bg-sf px-3 text-corpo font-semibold text-tx">
                  Cancelar
                </button>
                <button type="button" onClick={() => aoConfirmarReenvio?.(chave)} className="inline-flex min-h-11 items-center gap-1.5 rounded-[2px] bg-acao px-3 text-corpo font-semibold text-acao-tx hover:bg-acao-hover">
                  <RefreshCw size={15} aria-hidden="true" /> Enviar mesmo assim
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {local.podeTentarDeNovo && (
                <button type="button" onClick={() => aoTentarDeNovo?.(chave)} className="inline-flex min-h-11 items-center gap-1.5 rounded-[2px] border border-regua-forte bg-sf px-3 text-corpo font-semibold text-tx">
                  <RefreshCw size={15} aria-hidden="true" /> {duvida ? "Conferir e tentar de novo" : "Tentar de novo"}
                </button>
              )}
              <button type="button" onClick={() => aoDescartar?.(chave)} className="inline-flex min-h-11 items-center gap-1.5 rounded-[2px] border border-regua-forte bg-sf px-3 text-corpo font-semibold text-tx-2">
                <Trash2 size={15} aria-hidden="true" /> Descartar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
