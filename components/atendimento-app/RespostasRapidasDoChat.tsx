"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X, Zap } from "lucide-react";
import { listarRespostasRapidas } from "@/lib/actions/respostasRapidas";
import type { RespostaRapidaDaTela } from "@/lib/respostasRapidas";

// A LISTA DE RESPOSTAS RÁPIDAS NO CAMPO DE MENSAGEM (PR 10). Um toque numa resposta a INSERE no campo e fecha a
// lista; NUNCA envia (a pessoa lê, ajusta e aperta Enviar). Busca quando há mais de seis. Criar, editar e excluir
// ficam em Mais > Respostas rápidas.

function sem(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function RespostasRapidasDoChat({ aoInserir, aoFechar }: { aoInserir: (texto: string) => void; aoFechar: () => void }) {
  const [itens, setItens] = useState<RespostaRapidaDaTela[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const fechar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let vivo = true;
    listarRespostasRapidas()
      .then((r) => {
        if (!vivo) return;
        if (r.erro !== undefined) setErro(r.erro);
        else setItens(r.itens);
      })
      .catch(() => vivo && setErro("Não foi possível carregar as respostas. Confira a internet e tente de novo."));
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    const voltarPara = document.activeElement as HTMLElement | null;
    fechar.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      voltarPara?.focus?.();
    };
  }, [aoFechar]);

  const visiveis = useMemo(() => {
    if (!itens) return [];
    const q = sem(busca.trim());
    return q ? itens.filter((i) => sem(i.titulo).includes(q) || sem(i.texto).includes(q)) : itens;
  }, [itens, busca]);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/50" onClick={aoFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="respostas-titulo" className="flex max-h-[75dvh] w-full flex-col border-t-2 border-regua-forte bg-sf p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-tx" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="respostas-titulo" className="flex items-center gap-1.5 text-destaque font-bold">
            <Zap size={16} aria-hidden="true" /> Respostas rápidas
          </h2>
          <button ref={fechar} type="button" onClick={aoFechar} aria-label="Fechar respostas rápidas" className="inline-flex h-11 w-11 items-center justify-center rounded-[2px] text-tx-2 hover:bg-sf-apoio">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="mb-2 text-etiqueta text-tx-2">Toque numa resposta para colocá-la no campo. Ela só sai quando você apertar Enviar.</p>
        {itens && itens.length > 6 && (
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar resposta rápida"
            placeholder="Buscar"
            className="mb-2 min-h-11 w-full rounded-[2px] border border-atd-campo bg-sf px-3 text-corpo text-tx placeholder:text-tx-3"
          />
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {erro ? (
            <p role="alert" className="text-corpo font-medium text-urgente">
              {erro}
            </p>
          ) : itens === null ? (
            <p role="status" className="text-corpo text-tx-2">
              Carregando…
            </p>
          ) : itens.length === 0 ? (
            <p className="text-corpo text-tx-2">
              O escritório ainda não tem respostas rápidas.{" "}
              <Link href="/atendimento-app/respostas-rapidas" className="font-semibold text-atd-ouro-texto underline">
                Criar a primeira
              </Link>
              .
            </p>
          ) : visiveis.length === 0 ? (
            <p className="text-corpo text-tx-2">Nenhuma resposta com “{busca}”.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {visiveis.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => {
                      aoInserir(i.texto);
                      aoFechar();
                    }}
                    className="flex min-h-11 w-full flex-col items-start rounded-[2px] border border-regua-forte bg-sf px-3 py-2 text-left hover:bg-sf-apoio"
                  >
                    <span className="text-corpo font-semibold text-tx">{i.titulo}</span>
                    <span className="line-clamp-2 break-words text-etiqueta text-tx-2 [overflow-wrap:anywhere]">{i.texto}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Link href="/atendimento-app/respostas-rapidas" className="mt-2 inline-flex min-h-11 items-center self-start text-corpo font-semibold text-atd-ouro-texto underline">
          Gerenciar respostas rápidas
        </Link>
      </div>
    </div>
  );
}
