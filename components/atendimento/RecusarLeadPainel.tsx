"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Copy, Check, ExternalLink } from "lucide-react";
import { situacaoDaRecusa, enderecoDaCarta, type EstadoDaRecusa } from "@/lib/recusaDoLead";
import { recusarLead, marcarCartaEnviada } from "@/lib/actions/recusaDoLead";

// ============================================================================
// RECUSAR, E O QUE VEM DEPOIS DE RECUSAR.
//
// UM SÓ BLOCO PARA OS DOIS MOMENTOS, e é de propósito: antes da recusa ele é o formulário; depois
// dela é o estado da carta. Separar em duas telas faria a pessoa que acabou de recusar não saber
// onde foi parar o link que ela precisa mandar.
//
// O BOTÃO É CONTORNADO E NÃO VERMELHO. Recusar não é destruir — o lead continua existindo e pode
// voltar. Um botão de perigo aqui ensinaria que recusar é irreversível, que é justamente o
// contrário do que se decidiu.
//
// A CARTA NÃO SAI SOZINHA: o link fica pronto, com um botão de copiar, e quem manda escolhe o
// canal e a hora. "Marcar como enviada" é um carimbo à parte, porque o sistema não tem como saber
// que a mensagem saiu de um WhatsApp que ele não controla.
// ============================================================================

export type RecusaNaTela = {
  id: string;
  estado: EstadoDaRecusa;
  motivoTexto: string;
  observacao: string | null;
  token: string;
  enviadaEm: string | null;
  abertaEm: string | null;
  aberturas: number;
  revisitaEm: string | null;
  recusadaPor: string | null;
  porAgente: boolean;
};

export default function RecusarLeadPainel({
  attendanceId,
  motivos,
  recusa,
  enderecoDoSite,
}: {
  attendanceId: string;
  motivos: { id: string; rotulo: string }[];
  recusa: RecusaNaTela | null;
  enderecoDoSite: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivoId, setMotivoId] = useState("");
  const [motivoLivre, setMotivoLivre] = useState("");
  const [observacao, setObservacao] = useState("");
  const [revisitaEm, setRevisitaEm] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendente, comecar] = useTransition();

  function recusar() {
    setErro(null);
    comecar(async () => {
      const r = await recusarLead(attendanceId, { motivoId: motivoId || undefined, motivoLivre, observacao, revisitaEm });
      if (r.erro) setErro(r.erro);
      else {
        setAberto(false);
        router.refresh();
      }
    });
  }

  if (recusa) {
    const link = `${enderecoDoSite}${enderecoDaCarta(recusa.token)}`;
    return (
      <div className="border border-regua bg-sf-apoio p-4">
        <p className="text-etiqueta font-bold uppercase tracking-wider text-tx-3">Lead recusado</p>
        <p className="mt-1.5 text-sm font-semibold text-tx">{recusa.motivoTexto}</p>
        <p className="mt-0.5 text-xs text-tx-2">
          {situacaoDaRecusa({
            estado: recusa.estado,
            enviadaEm: recusa.enviadaEm ? new Date(recusa.enviadaEm) : null,
            abertaEm: recusa.abertaEm ? new Date(recusa.abertaEm) : null,
            revisitaEm: recusa.revisitaEm ? new Date(recusa.revisitaEm) : null,
          })}
          {recusa.aberturas > 1 ? ` · ${recusa.aberturas} aberturas` : ""}
          {recusa.porAgente ? " · recusado pelo atendente" : recusa.recusadaPor ? ` · por ${recusa.recusadaPor}` : ""}
        </p>
        {recusa.observacao && <p className="mt-2 text-xs italic text-tx-3">{recusa.observacao}</p>}

        {recusa.estado === "EM_ANALISE" && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/* Só leitura e selecionável: o link é para copiar e mandar, não para editar. */}
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 border border-regua bg-sf px-3 py-2 text-xs text-tx-2"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(link);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2000);
                }}
                className="inline-flex min-h-11 items-center gap-1.5 border border-regua-forte bg-sf px-3 text-xs font-semibold text-tx-2 hover:bg-sf-apoio hover:text-tx"
              >
                {copiado ? <Check size={14} /> : <Copy size={14} />}
                {copiado ? "Copiado" : "Copiar link"}
              </button>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 px-2 text-xs font-semibold text-tx-3 hover:text-tx"
              >
                <ExternalLink size={13} /> Ver a carta
              </a>
            </div>

            {!recusa.enviadaEm && (
              <button
                type="button"
                disabled={pendente}
                onClick={() => {
                  setErro(null);
                  comecar(async () => {
                    const r = await marcarCartaEnviada(recusa.id);
                    if (r.erro) setErro(r.erro);
                    else router.refresh();
                  });
                }}
                className="mt-2 inline-flex min-h-11 items-center px-2 text-xs font-semibold text-marca-tx hover:text-tx disabled:opacity-50"
              >
                Já mandei a carta — marcar como enviada
              </button>
            )}

            <p className="mt-2 text-xs italic text-tx-3">
              A carta não sai sozinha. Mande o link pelo canal que o lead já usa, e marque aqui depois.
            </p>
          </>
        )}

        {erro && <p className="mt-2 text-xs font-medium text-urgente">{erro}</p>}
      </div>
    );
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => { setAberto(true); setErro(null); }}
        className="inline-flex min-h-11 items-center gap-1.5 border border-regua-forte bg-sf px-4 text-sm font-semibold text-tx-2 transition-colors hover:bg-sf-apoio hover:text-tx"
      >
        <Ban size={15} /> Recusar e manter no radar
      </button>
    );
  }

  return (
    <div className="border border-regua bg-sf-apoio p-4">
      <p className="text-sm font-semibold text-tx">Recusar este lead</p>
      <p className="mt-1 text-xs text-tx-2">
        Ele sai das listas ativas e vai para a fila de recusados, onde pode voltar. Nada é apagado.
      </p>

      <label className="mt-3 block text-xs font-semibold text-tx-2">
        Motivo
        <select
          value={motivoId}
          onChange={(e) => setMotivoId(e.target.value)}
          className="mt-1 block w-full border border-regua-forte bg-sf px-3 py-2 text-sm text-tx"
        >
          <option value="">Escrever um motivo agora…</option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.rotulo}
            </option>
          ))}
        </select>
      </label>

      {!motivoId && (
        <input
          value={motivoLivre}
          onChange={(e) => setMotivoLivre(e.target.value)}
          placeholder="O motivo, numa frase — é o que o lead vai ler"
          className="mt-2 block w-full border border-regua-forte bg-sf px-3 py-2 text-sm text-tx"
        />
      )}

      <label className="mt-3 block text-xs font-semibold text-tx-2">
        Voltar a olhar em (opcional)
        <input
          type="date"
          value={revisitaEm}
          onChange={(e) => setRevisitaEm(e.target.value)}
          className="mt-1 block w-full border border-regua-forte bg-sf px-3 py-2 text-sm text-tx"
        />
      </label>

      <label className="mt-3 block text-xs font-semibold text-tx-2">
        Nota interna (opcional) — o lead não vê
        <textarea
          rows={2}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          className="mt-1 block w-full resize-none border border-regua-forte bg-sf px-3 py-2 text-sm text-tx"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pendente}
          onClick={recusar}
          className="inline-flex min-h-11 items-center gap-1.5 bg-acao px-4 text-sm font-semibold text-acao-tx hover:bg-acao-hover disabled:opacity-50"
        >
          {pendente ? "Recusando…" : "Recusar e gerar a carta"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="min-h-11 px-3 text-xs font-semibold text-tx-3 hover:text-tx">
          Cancelar
        </button>
      </div>

      {erro && <p className="mt-2 text-xs font-medium text-urgente">{erro}</p>}
    </div>
  );
}
