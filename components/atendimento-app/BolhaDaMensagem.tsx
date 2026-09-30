"use client";

import { AlertTriangle, Check, CheckCheck, Clock, Ear, HelpCircle, Info, Lock, MoreVertical, Pin, RefreshCw, Trash2 } from "lucide-react";
import IconeAgente from "@/components/IconeAgente";
import MidiaDaBolha from "@/components/atendimento-app/MidiaDaBolha";
import { ROTULO_DA_ENTREGA, type EntregaDaMensagem } from "@/lib/entregaDaMensagem";
import type { MensagemDoChat } from "@/lib/mensagensDoChat";

// O BALÃO (acabamento WhatsApp, etapa 2): raio de 14 px com o canto do rabicho em 4 px, hora e ✓✓ DENTRO do balão.
// Recebida em `bg-atd-balao-in`; enviada por pessoa em `bg-atd-balao-out` (ouro suave); da Ana igual, com o nome
// dela e o ícone em cima. Quem falou nunca depende de cor: o balão tem lado, e o leitor de tela ouve "Cliente"
// ou "Escritório". MÍDIA: ver MidiaDaBolha. O ÁUDIO mostra o player e a transcrição, "para consulta da equipe".
// O CICLO DO ✓ (R2A): ✓ enviada (o WhatsApp aceitou), ✓✓ entregue (cinza), ✓✓ lida (azul --atd-lida). Vem do retorno de status
// do provedor (item 30 dos docs); sem retorno, fica "Enviada".
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
// TRACEJADA em ouro, fundo de ouro suave, cadeado e o rótulo "Nota interna · só a equipe" com autor e hora; o aviso
// é uma pílula centralizada, com ícone de informação e "Aviso do sistema · só a equipe". Rótulo e ícone dizem o
// que é; a cor só reforça.

// O CICLO DE ENTREGA (R2A): ✓ Enviada · ✓✓ Entregue (cinza, o tom da hora) · ✓✓ Lida (azul `--atd-lida`, traço mais grosso). Nunca só
// cor: o número de marcas (1 ou 2), o traço mais grosso da "lida", o `title` e o texto do leitor de tela ("Enviada", "Entregue",
// "Lida") dizem o estado. "Lida" revela que o cliente leu (docs, item 30). Nota interna só tem "Salva".
function MarcaDeEntrega({ ehNota, entrega }: { ehNota: boolean; entrega: EntregaDaMensagem }) {
  if (ehNota) {
    return (
      <span className="inline-flex items-center" title="Salva">
        <Check size={14} aria-hidden="true" />
        <span className="sr-only">Salva</span>
      </span>
    );
  }
  const rotulo = ROTULO_DA_ENTREGA[entrega];
  return (
    <span className={`inline-flex items-center ${entrega === "lida" ? "text-atd-lida" : ""}`} title={rotulo} data-entrega={entrega}>
      {entrega === "enviada" ? <Check size={15} aria-hidden="true" /> : <CheckCheck size={15} strokeWidth={entrega === "lida" ? 3 : 2} aria-hidden="true" />}
      <span className="sr-only">{rotulo}</span>
    </span>
  );
}

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
  const alerta = falhou || duvida;
  const foto = !!m.midia && m.midia.tipo === "imagem" && !saiu && !ehNota;

  if (m.tipo === "sistema") {
    // "A Ana não respondeu: <motivo>." — o começo em destaque, o motivo em tom normal (o texto é o mesmo).
    const marca = "A Ana não respondeu:";
    const comMarca = m.texto.startsWith(marca);
    return (
      <div className="flex justify-center py-0.5" data-mensagem={m.id} data-tipo="sistema">
        <div className="max-w-[92%] break-words rounded-atd-balao bg-atd-pilula px-3.5 py-1.5 text-center [overflow-wrap:anywhere]">
          <span className="sr-only">Aviso do sistema, só da equipe: </span>
          <p className="mb-0.5 flex items-center justify-center gap-1.5 text-app-meta font-medium text-atd-terciario">
            <Info size={12} aria-hidden="true" />
            Aviso do sistema · só a equipe
          </p>
          <p className="whitespace-pre-wrap text-app-previa text-atd-previa">
            {comMarca ? (
              <>
                <b className="font-semibold text-atd-tinta">{marca}</b>
                {m.texto.slice(marca.length)}
              </>
            ) : (
              m.texto
            )}
          </p>
          <p className="mt-0.5 text-app-meta tabular-nums text-atd-terciario">
            <time dateTime={m.criadoEm}>{m.hora}</time>
          </p>
        </div>
      </div>
    );
  }

  // As cores do balão: o de alerta (não enviada / sem confirmação) usa o vermelho/âmbar suave do sistema; a nota, o ouro
  // suave tracejado; o resto, o par dentro/fora do acabamento. `sec` é o tom da hora e das linhas de apoio.
  const superficie = falhou
    ? "border border-urgente bg-urgente-bg text-tx"
    : duvida
      ? "border border-aviso bg-aviso-bg text-tx"
      : ehNota
        ? "border-[1.5px] border-dashed border-atd-nota-borda bg-atd-nota text-atd-tinta"
        : saiu
          ? "bg-atd-balao-out text-atd-balao-out-tx rounded-br-[4px]"
          : "bg-atd-balao-in text-atd-tinta rounded-bl-[4px]";
  const sec = alerta ? "text-tx-2" : ehNota ? "text-atd-previa" : saiu ? "text-atd-balao-out-sec" : "text-atd-terciario";

  // Hora, autor da nota, estado do envio, ✓✓ e "Fixada": tudo dentro do balão, no canto de baixo à direita.
  const meta = (
    <>
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
      {fixada && (
        <span className="inline-flex items-center gap-0.5 font-semibold">
          <Pin size={12} aria-hidden="true" /> Fixada
        </span>
      )}
      <time dateTime={m.criadoEm}>{m.hora}</time>
      {(m.enviada || local?.estado === "enviada") && <MarcaDeEntrega ehNota={ehNota} entrega={m.enviada ? (m.entrega ?? "enviada") : "enviada"} />}
    </>
  );
  const classeDaMeta = `inline-flex items-center gap-1.5 text-app-meta leading-none tabular-nums ${sec}`;

  return (
    <div className={`flex flex-col ${saiu ? "items-end" : "items-start"}`} data-mensagem={m.id} data-tipo={ehNota ? "nota" : undefined} data-envio={local?.estado ?? (m.enviada ? "enviada" : undefined)}>
      <div className={`flex w-full items-end gap-0.5 ${saiu ? "flex-row-reverse" : ""}`}>
      <div
        className={`min-w-0 max-w-[84%] break-words rounded-atd-balao [overflow-wrap:anywhere] ${foto ? "min-w-[15rem] p-[3px] pb-1" : "px-2.5 pb-1.5 pt-1.5"} ${superficie}`}
      >
        <span className="sr-only">{ehNota ? `Nota interna, só da equipe, de ${m.autor || "você"}: ` : `${autor} disse: `}</span>
        {ehNota && (
          <p className="mb-0.5 flex items-center gap-1.5 text-app-meta font-semibold text-atd-texto-ouro">
            <Lock size={13} aria-hidden="true" />
            Nota interna · só a equipe
          </p>
        )}
        {saiu && m.porAgente && (
          <p className="mb-0.5 flex items-center gap-1.5 text-app-meta font-semibold text-atd-texto-ouro">
            <IconeAgente size={12} className="text-atd-texto-ouro" />
            {nomeDoAtendente}
          </p>
        )}
        {m.midia && <MidiaDaBolha idDaConversa={idDaConversa} idDaMensagem={m.id} midia={m.midia} recebida={!saiu} />}
        {m.texto && (
          <p className="whitespace-pre-wrap text-corpo leading-[1.35]">
            {m.texto}
            {/* A hora flutua à direita da última linha (como no WhatsApp); se não cabe, desce para a linha de baixo. */}
            {!ehNota && <span className={`float-right ml-2.5 mt-1.5 ${classeDaMeta}`}>{meta}</span>}
          </p>
        )}
        {m.transcricao && (
          <div className="mt-1.5 rounded-atd-etiqueta border border-atd-pilula-borda px-2 py-1.5">
            <p className={`mb-0.5 flex items-center gap-1.5 text-app-meta font-semibold ${saiu ? "text-atd-balao-out-sec" : "text-atd-previa"}`}>
              <Ear size={13} aria-hidden="true" />
              Transcrição do áudio, para consulta da equipe
            </p>
            <p className={`whitespace-pre-wrap text-app-previa ${m.transcricao.ehConteudo ? "italic" : ""}`}>
              {m.transcricao.ehConteudo ? `“${m.transcricao.texto}”` : m.transcricao.texto}
            </p>
          </div>
        )}
        {(!m.texto || ehNota || m.transcricao) && <p className={`mt-0.5 flex justify-end ${classeDaMeta} w-full`}>{meta}</p>}
        {!!m.texto && !ehNota && !m.transcricao && <span className="clear-both block" aria-hidden="true" />}
      </div>
      {aoAbrirAcoes && !local && !m.id.startsWith("local-") && (
        <button type="button" onClick={() => aoAbrirAcoes(m)} aria-label={`Mais ações da mensagem de ${autor}, ${m.hora}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-atd-terciario hover:bg-atd-linha-hover hover:text-atd-tinta">
          <MoreVertical size={16} aria-hidden="true" />
        </button>
      )}
      </div>

      {local && (falhou || duvida) && chave && (
        <div role="alert" className="mt-1 flex max-w-[92%] flex-col items-end gap-1.5 text-right">
          <p className={`text-corpo font-semibold ${falhou ? "text-urgente" : "text-atd-tinta"}`}>{falhou ? `${ehNota ? "Não salva" : "Não enviada"} · ${local.erro ?? "erro desconhecido"}` : (local.erro ?? "Pode ter sido enviada: confira antes de repetir.")}</p>
          {confirmandoReenvio ? (
            <div className="flex flex-col items-end gap-1.5">
              <p className="text-corpo text-atd-tinta">Não dá para saber se saiu. Enviar de novo pode chegar duas vezes ao cliente.</p>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={aoCancelarReenvio} className="inline-flex min-h-11 items-center rounded-atd-pilula bg-atd-pilula-2 px-4 text-corpo font-semibold text-atd-tinta">
                  Cancelar
                </button>
                <button type="button" onClick={() => aoConfirmarReenvio?.(chave)} className="inline-flex min-h-11 items-center gap-1.5 rounded-atd-pilula bg-atd-ouro px-4 text-corpo font-semibold text-atd-ouro-tx">
                  <RefreshCw size={15} aria-hidden="true" /> Enviar mesmo assim
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {local.podeTentarDeNovo && (
                <button type="button" onClick={() => aoTentarDeNovo?.(chave)} className="inline-flex min-h-11 items-center gap-1.5 rounded-atd-pilula bg-atd-pilula-2 px-4 text-corpo font-semibold text-atd-tinta">
                  <RefreshCw size={15} aria-hidden="true" /> {duvida ? "Conferir e tentar de novo" : "Tentar de novo"}
                </button>
              )}
              <button type="button" onClick={() => aoDescartar?.(chave)} className="inline-flex min-h-11 items-center gap-1.5 rounded-atd-pilula bg-atd-pilula px-4 text-corpo font-semibold text-atd-previa">
                <Trash2 size={15} aria-hidden="true" /> Descartar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
