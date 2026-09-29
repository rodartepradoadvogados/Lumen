"use client";

import { AlertTriangle, Check, Clock, Ear, FileText, HelpCircle, Image as ImageIcon, Mic, RefreshCw, Smile, Trash2, Video } from "lucide-react";
import IconeAgente from "@/components/IconeAgente";
import type { MensagemDoChat, MidiaDaMensagem } from "@/lib/mensagensDoChat";

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

const ICONE_DA_MIDIA: Record<MidiaDaMensagem["tipo"], typeof FileText> = {
  imagem: ImageIcon,
  documento: FileText,
  audio: Mic,
  video: Video,
  figurinha: Smile,
};

export default function BolhaDaMensagem({
  m,
  nomeDoAtendente,
  aoTentarDeNovo,
  aoDescartar,
  confirmandoReenvio,
  aoConfirmarReenvio,
  aoCancelarReenvio,
}: {
  m: MensagemDoChat;
  nomeDoAtendente: string;
  aoTentarDeNovo?: (clientMessageId: string) => void;
  aoDescartar?: (clientMessageId: string) => void;
  confirmandoReenvio?: boolean;
  aoConfirmarReenvio?: (clientMessageId: string) => void;
  aoCancelarReenvio?: () => void;
}) {
  const saiu = m.direction === "OUT";
  const autor = saiu ? (m.porAgente ? nomeDoAtendente : "Escritório") : "Cliente";
  const Icone = m.midia ? ICONE_DA_MIDIA[m.midia.tipo] : null;
  const local = m.envioLocal;
  const falhou = m.falhou || local?.estado === "falhou";
  const duvida = local?.estado === "sem-confirmacao";
  const enviando = local?.estado === "enviando";
  const chave = m.clientMessageId;

  return (
    <div className={`flex flex-col ${saiu ? "items-end" : "items-start"}`} data-mensagem={m.id} data-envio={local?.estado ?? (m.enviada ? "enviada" : undefined)}>
      <div
        className={`max-w-[84%] break-words rounded-[2px] border px-2.5 pb-1 pt-1.5 [overflow-wrap:anywhere] ${
          falhou ? "border-urgente bg-urgente-bg" : duvida ? "border-aviso bg-aviso-bg" : `${saiu ? "bg-atd-bolha-out" : "bg-atd-bolha-in"} ${m.porAgente ? "border-ouro-acento" : saiu ? "border-atd-borda-out" : "border-atd-borda-in"}`
        }`}
      >
        <span className="sr-only">{autor} disse: </span>
        {saiu && m.porAgente && (
          <p className="mb-0.5 flex items-center gap-1.5 text-etiqueta font-bold text-tx-2">
            <IconeAgente size={12} className="text-tx-3" />
            {nomeDoAtendente}
          </p>
        )}
        {m.midia && Icone && (
          <p className="mb-1 flex items-center gap-2 rounded-[2px] border border-regua bg-sf-apoio px-2 py-1.5 text-corpo font-semibold text-tx">
            <Icone size={18} aria-hidden="true" className="shrink-0 text-tx-2" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{m.midia.nome ? `${m.midia.rotulo}: ${m.midia.nome}` : m.midia.rotulo}</span>
          </p>
        )}
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
          {enviando && (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} aria-hidden="true" /> Enviando…
            </span>
          )}
          {falhou && (
            <span className="inline-flex items-center gap-1 font-semibold text-urgente">
              <AlertTriangle size={12} aria-hidden="true" /> Não enviada
            </span>
          )}
          {duvida && (
            <span className="inline-flex items-center gap-1 font-semibold text-tx">
              <HelpCircle size={12} aria-hidden="true" /> Sem confirmação
            </span>
          )}
          {(m.enviada || local?.estado === "enviada") && (
            <span className="inline-flex items-center gap-0.5" title="Enviada">
              <Check size={12} aria-hidden="true" />
              <span className="sr-only">Enviada</span>
            </span>
          )}
          <time dateTime={m.criadoEm}>{m.hora}</time>
        </p>
      </div>

      {local && (falhou || duvida) && chave && (
        <div role="alert" className="mt-1 flex max-w-[92%] flex-col items-end gap-1.5 text-right">
          <p className={`text-corpo font-semibold ${falhou ? "text-urgente" : "text-tx"}`}>{falhou ? `Não enviada · ${local.erro ?? "erro desconhecido"}` : (local.erro ?? "Pode ter sido enviada: confira antes de repetir.")}</p>
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
