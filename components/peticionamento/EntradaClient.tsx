"use client";

// PASSO ZERO — especificação §1: um botão Iniciar no meio; só depois dele é que se vai para a
// escolha do tipo de peça (§7, app/peticionamento/[id]/tipo). Abaixo, discreto, "ou retomar um
// rascunho" — a lista de verdade fica em app/peticionamento/rascunhos (espec. §3).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { criarSessaoPeticionamento } from "@/lib/actions/peticionamento";

export function EntradaClient({ temRascunhos }: { temRascunhos: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function comecar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await criarSessaoPeticionamento();
      if ("error" in resultado) {
        setErro(resultado.error);
        return;
      }
      router.push(`/peticionamento/${resultado.id}/tipo`);
    });
  }

  return (
    <div className="entry-cta">
      <button className="btn btn-primary" style={{ height: 52, fontSize: 15, alignSelf: "center", padding: "0 40px" }} onClick={comecar} disabled={pendente}>
        {pendente ? "Iniciando…" : "Iniciar"}
      </button>
      {erro && (
        <div className="callout callout-danger" role="alert">
          {erro}
        </div>
      )}
      {temRascunhos && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Link className="resume-pill" href="/peticionamento/rascunhos">
            ou retomar um rascunho
          </Link>
        </div>
      )}
    </div>
  );
}
