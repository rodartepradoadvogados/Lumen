"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import LumenMark from "@/components/LumenMark";

const RESEARCH_LINKS = [
  { label: "Jusbrasil — Consulta processual", href: "https://www.jusbrasil.com.br/consulta-processual/" },
  { label: "STJ — Pesquisa de Jurisprudência", href: "https://scon.stj.jus.br/SCON/" },
  { label: "STF — Pesquisa de Jurisprudência", href: "https://jurisprudencia.stf.jus.br/pages/search" },
];

const NOTE_KEYS = ["peticionar-nota-1", "peticionar-nota-2", "peticionar-nota-3", "peticionar-nota-4"];

function NoteBox({ storageKey, index }: { storageKey: string; index: number }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    // Leitura protegida: em janela privada, com dados de site bloqueados, ou durante a captura de
    // miniatura, o acessor pode lançar — e a tela inteira ia junto.
    try {
      setValue(localStorage.getItem(storageKey) || "");
    } catch {
      /* rascunho é conveniência; sem armazenamento, começa em branco */
    }
  }, [storageKey]);

  return (
    <textarea
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        try {
          localStorage.setItem(storageKey, e.target.value);
        } catch {
          /* idem */
        }
      }}
      placeholder={`Anotação ${index + 1}`}
      aria-label={`Anotação ${index + 1}`}
      className="w-full h-40 resize-none border-2 border-regua-forte bg-sf text-tx p-3 text-corpo rounded-[2px] transition-colors duration-100 ease-out focus:outline-none focus:border-marca-tx"
    />
  );
}

export default function PeticionarWorkspace({
  vinculo,
}: {
  vinculo: { rotulo: string; titulo: string; href: string } | null;
}) {
  // A tela abre por `window.open` vinda do wizard (o caso normal) ou por navegação direta, pela
  // paleta de busca. `window.close()` só funciona no primeiro caso — no segundo o navegador
  // ignora, e por isso existe o link para o Painel ao lado. Antes não havia NENHUM dos dois: o
  // diagnóstico registrou "beco sem saída absoluto", e era literal — três links externos e mais
  // nada, sem voltar, sem fechar, sem dizer do que se tratava.
  function fechar() {
    window.close();
  }

  return (
    <div className="min-h-screen bg-sf-fundo p-5 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <LumenMark size={28} />
          <div>
            <h1 className="text-destaque font-bold text-tx leading-tight">Espaço de peticionamento</h1>
            <p className="text-etiqueta text-tx-2 mt-0.5">
              Pesquisa e anotações — deixe esta aba aberta ao lado do documento
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/painel"
            className="inline-flex items-center h-9 px-3.5 border-2 border-regua-forte text-tx text-etiqueta font-semibold rounded-[2px] transition-colors duration-100 ease-out hover:bg-acao-bg"
          >
            Ir para o Painel
          </Link>
          <button
            type="button"
            onClick={fechar}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 border-2 border-regua-forte text-tx text-etiqueta font-semibold rounded-[2px] transition-colors duration-100 ease-out hover:bg-acao-bg active:translate-y-px"
          >
            <X size={14} /> Fechar aba
          </button>
        </div>
      </div>

      {/* A aba sabe de qual petição se trata. Antes abria sempre igual: duas abas abertas eram
          indistinguíveis, e quem chegasse pela paleta de busca não tinha ideia do que estava
          vendo. O rótulo é clicável — leva ao registro de origem. */}
      {vinculo && (
        <Link
          href={vinculo.href}
          className="block border-2 border-regua-forte bg-sf rounded-[2px] px-4 py-3 transition-colors duration-100 ease-out hover:border-marca-tx hover:bg-acao-bg"
        >
          <p className="text-etiqueta font-extrabold uppercase tracking-[.1em] text-tx-3">
            Peticionando em · {vinculo.rotulo}
          </p>
          <p className="text-corpo font-semibold text-tx mt-0.5">{vinculo.titulo}</p>
        </Link>
      )}

      <div className="flex gap-2 flex-wrap">
        {RESEARCH_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-corpo font-semibold text-tx bg-sf border-2 border-regua-forte px-3.5 py-2 rounded-[2px] transition-colors duration-100 ease-out hover:border-marca-tx hover:bg-acao-bg"
          >
            {link.label} <ExternalLink size={13} />
          </a>
        ))}
      </div>

      <div>
        {/* As quatro caixas gravam em chaves FIXAS do navegador (`peticionar-nota-1..4`), então o
            que foi escrito numa petição reaparece na seguinte. Isso não é bug a corrigir em
            silêncio — é rascunho de trabalho, e apagar sozinho seria pior. O que faltava era
            DIZER, e dar o botão de limpar. */}
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
          <p className="text-etiqueta text-tx-3">
            Rascunho — fica só neste navegador e continua aqui na próxima petição.
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                NOTE_KEYS.forEach((k) => localStorage.removeItem(k));
              } catch {
                /* sem armazenamento, não há o que limpar */
              }
              window.location.reload();
            }}
            className="text-etiqueta font-semibold text-marca-tx underline underline-offset-4 transition-colors duration-100 ease-out hover:text-tx"
          >
            Limpar as quatro anotações
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {NOTE_KEYS.map((key, i) => (
            <NoteBox key={key} storageKey={key} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
