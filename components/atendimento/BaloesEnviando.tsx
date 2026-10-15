"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Clock } from "lucide-react";

// ENVIO OTIMISTA FORA DO APP (DESIGN.md §9, 15/10/2026) — a Central do site e o /m/atendimento.
//
// A conversa dessas telas é do servidor (components/atendimento/Conversa.tsx): a mensagem que você
// mandou só aparecia depois que o envio voltava E a página rerenderizava, com o botão parado em
// "Enviando…" no meio. Agora a caixa de resposta (WhatsappReplyBox, acabamento "app") anuncia o
// envio por um evento da janela e este componente, no pé da conversa, mostra o balão NA HORA, com
// relógio; quando o servidor confirma, o tique se desenha; quando a página traz a mensagem de
// verdade, o balão provisório sai. Se o envio falhar, o balão some e o texto volta para a caixa —
// a mensagem nunca fica parecendo enviada sem ter sido.
//
// Por evento, e não por estado compartilhado: a caixa de resposta e a conversa moram em regiões
// diferentes da tela (uma rola, a outra não), e as duas já são montadas pelo servidor.

export const EVENTO_DO_ENVIO = "atd:envio";

export type AvisoDeEnvio = {
  attendanceId: string;
  id: string;
  texto?: string;
  estado: "enviando" | "enviada" | "remover" | "limpar";
};

export function avisarEnvio(aviso: AvisoDeEnvio) {
  window.dispatchEvent(new CustomEvent<AvisoDeEnvio>(EVENTO_DO_ENVIO, { detail: aviso }));
}

type Provisorio = { id: string; texto: string; estado: "enviando" | "enviada"; hora: string };

function horaAgora() {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date());
}

export default function BaloesEnviando({ attendanceId }: { attendanceId: string }) {
  const [lista, setLista] = useState<Provisorio[]>([]);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function ouvir(ev: Event) {
      const a = (ev as CustomEvent<AvisoDeEnvio>).detail;
      if (!a || a.attendanceId !== attendanceId) return;
      setLista((atual) => {
        if (a.estado === "enviando") return [...atual, { id: a.id, texto: a.texto ?? "", estado: "enviando", hora: horaAgora() }];
        if (a.estado === "enviada") return atual.map((p) => (p.id === a.id ? { ...p, estado: "enviada" } : p));
        if (a.estado === "remover") return atual.filter((p) => p.id !== a.id);
        return atual.filter((p) => p.estado !== "enviada");
      });
    }
    window.addEventListener(EVENTO_DO_ENVIO, ouvir);
    return () => window.removeEventListener(EVENTO_DO_ENVIO, ouvir);
  }, [attendanceId]);

  useEffect(() => {
    if (lista.length > 0) fim.current?.scrollIntoView({ block: "end" });
  }, [lista.length]);

  if (lista.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-2" data-baloes-enviando="">
      {lista.map((p) => (
        <div key={p.id} className="flex justify-end">
          <div className="atd-sai max-w-[min(560px,85%)] rounded-atd-balao rounded-br-[4px] bg-atd-balao-out px-3.5 pb-1.5 pt-2.5 text-atd-balao-out-tx">
            <p className="whitespace-pre-wrap break-words text-corpo">{p.texto}</p>
            <div className="mt-1 flex items-center justify-end gap-1.5 text-app-meta tabular-nums text-atd-balao-out-sec">
              {p.hora}
              {p.estado === "enviando" ? (
                <span className="inline-flex items-center gap-1" title="Enviando">
                  <Clock size={13} aria-hidden="true" />
                  <span className="sr-only">Enviando</span>
                </span>
              ) : (
                <span className="inline-flex items-center" title="Enviada">
                  <Check size={15} aria-hidden="true" className="atd-desenha" />
                  <span className="sr-only">Enviada</span>
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
      <div ref={fim} />
    </div>
  );
}
