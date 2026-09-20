"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Undo2, Archive, ExternalLink } from "lucide-react";
import { reverterRecusa, arquivarRecusa } from "@/lib/actions/recusaDoLead";

// ============================================================================
// OS LEADS RECUSADOS, ESPERANDO UMA SEGUNDA OPINIÃO.
//
// É UMA FILA DE TRABALHO, e não um arquivo. Cada linha existe porque alguém precisa decidir uma de
// duas coisas: trazer de volta, ou encerrar. Tudo que não exige decisão sai daqui — senão em seis
// meses isto é um cemitério que ninguém abre.
//
// AS DUAS AÇÕES TÊM PESOS DIFERENTES, e a tela diz isso. "Trazer de volta" é a que muda o rumo:
// alguém está decidindo pegar um caso que o escritório tinha recusado. "Arquivar" é a que confirma
// o que já estava decidido. Por isso a primeira é a que tem cor.
//
// A DATA DE VOLTAR A OLHAR APARECE NA LINHA, e vencida ela ganha destaque — é o único jeito de a
// promessa "vamos olhar isso em março" não morrer num campo que ninguém lê.
// ============================================================================

export type RecusadoNaLista = {
  recusaId: string;
  attendanceId: string;
  nome: string;
  assunto: string;
  motivo: string;
  observacao: string | null;
  recusadoEm: string;
  recusadoPor: string | null;
  porAgente: boolean;
  situacao: string;
  revisitaEm: string | null;
  revisitaVencida: boolean;
  revisitaLegivel: string | null;
};

export default function RecusadosParaAnalise({ lista }: { lista: RecusadoNaLista[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();

  function rodar(acao: () => Promise<{ erro?: string }>) {
    setErro(null);
    comecar(async () => {
      const r = await acao();
      if (r.erro) setErro(r.erro);
      else {
        setConfirmando(null);
        router.refresh();
      }
    });
  }

  if (lista.length === 0) {
    return (
      <div className="border border-regua bg-sf px-5 py-8">
        <p className="text-sm text-tx-2">Nenhum lead recusado esperando análise.</p>
        <p className="mt-1 text-xs text-tx-3">
          Quando um lead é recusado, ele aparece aqui até alguém trazê-lo de volta ou encerrar de vez.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="border border-regua bg-sf">
        <div className="hidden items-center gap-4 border-b border-regua bg-sf-apoio px-5 py-2 lg:flex">
          <Cabecalho className="w-[220px]">Quem</Cabecalho>
          <Cabecalho className="w-[240px]">Por que foi recusado</Cabecalho>
          <Cabecalho className="w-[190px]">A carta</Cabecalho>
          <Cabecalho className="flex-1">Voltar a olhar</Cabecalho>
          <span className="w-[250px] shrink-0" />
        </div>

        <div>
          {lista.map((r) => (
            <div
              key={r.recusaId}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-regua border-l-[3px] px-5 py-3.5 last:border-b-0 ${
                r.revisitaVencida ? "border-l-marca-tx" : "border-l-regua-forte"
              }`}
            >
              <div className="w-full min-w-0 lg:w-[220px] lg:shrink-0">
                <Link href={`/atendimento/${r.attendanceId}`} className="block truncate text-sm font-semibold text-marca-tx hover:underline">
                  {r.nome}
                </Link>
                <p className="mt-0.5 truncate text-xs text-tx-3">{r.assunto}</p>
              </div>

              <div className="w-[240px] shrink-0">
                <p className="text-sm text-tx">{r.motivo}</p>
                <p className="mt-0.5 truncate text-xs text-tx-3">
                  {r.recusadoEm}
                  {r.porAgente ? " · pelo atendente" : r.recusadoPor ? ` · ${r.recusadoPor}` : ""}
                </p>
              </div>

              <div className="w-[190px] shrink-0">
                <p className="text-xs text-tx-2">{r.situacao}</p>
              </div>

              <div className="min-w-0 flex-1">
                {r.revisitaLegivel ? (
                  <p className={`text-sm ${r.revisitaVencida ? "font-semibold text-marca-tx" : "text-tx-2"}`}>
                    {r.revisitaVencida ? "Era para olhar em " : "Olhar em "}
                    {r.revisitaLegivel}
                  </p>
                ) : (
                  <p className="text-sm text-tx-3">sem data</p>
                )}
                {r.observacao && <p className="mt-0.5 truncate text-xs italic text-tx-3">{r.observacao}</p>}
              </div>

              <div className="flex shrink-0 items-center gap-2 lg:w-[250px] lg:justify-end">
                {confirmando === r.recusaId ? (
                  <>
                    <span className="text-xs text-tx-2">Encerrar de vez?</span>
                    <button
                      type="button"
                      disabled={pendente}
                      onClick={() => rodar(() => arquivarRecusa(r.recusaId))}
                      className="min-h-11 border border-grave px-3 text-xs font-semibold text-grave-tx hover:bg-grave-bg disabled:opacity-50"
                    >
                      Encerrar
                    </button>
                    <button type="button" onClick={() => setConfirmando(null)} className="min-h-11 px-2 text-xs font-semibold text-tx-3 hover:text-tx">
                      Não
                    </button>
                  </>
                ) : (
                  <>
                    {/* A ação que muda o rumo é a que tem cor. */}
                    <button
                      type="button"
                      disabled={pendente}
                      onClick={() => rodar(() => reverterRecusa(r.recusaId))}
                      className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap bg-acao px-3.5 text-xs font-semibold text-acao-tx hover:bg-acao-hover disabled:opacity-50"
                    >
                      <Undo2 size={14} /> Trazer de volta
                    </button>
                    <button
                      type="button"
                      aria-label="Encerrar de vez"
                      title="Encerrar de vez"
                      onClick={() => { setConfirmando(r.recusaId); setErro(null); }}
                      className="inline-flex h-11 w-11 items-center justify-center text-tx-3 hover:text-tx"
                    >
                      <Archive size={15} />
                    </button>
                    <Link
                      href={`/atendimento/${r.attendanceId}?aba=ficha&bloco=processo`}
                      aria-label="Ver a recusa"
                      title="Ver a recusa e a carta"
                      className="inline-flex h-11 w-11 items-center justify-center text-tx-3 hover:text-tx"
                    >
                      <ExternalLink size={14} />
                    </Link>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {erro && <p className="mt-2 text-xs font-medium text-urgente">{erro}</p>}

      <p className="mt-3 text-xs italic text-tx-3">
        Trazer de volta devolve o lead à triagem sem reiniciar o relógio de quinze minutos — ele não está chegando agora,
        está voltando. Encerrar tira da fila e vira histórico: o lead continua achável pela busca.
      </p>
    </div>
  );
}

function Cabecalho({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`shrink-0 text-etiqueta font-bold uppercase tracking-wider text-tx-3 ${className}`}>{children}</span>;
}
