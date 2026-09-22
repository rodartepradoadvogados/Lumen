"use client";

// A LISTA DE RASCUNHOS — especificação §3. Título, tipo da peça, cliente, natureza do
// procedimento, em que passo parou, e quando foi editada — nesta ordem, como a especificação
// literal pede. Botão Retomar volta ao passo exato (lib/peticionamentoPasso.ts).

import Link from "next/link";
import { MenuPeticionamento } from "./MenuPeticionamento";
import type { RascunhoResumo } from "@/lib/actions/peticionamento";

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function RascunhosClient({ rascunhos }: { rascunhos: RascunhoResumo[] }) {
  return (
    <div className="entry" style={{ gridTemplateRows: "48px 1fr auto" }}>
      <div className="entry-top">
        <MenuPeticionamento rascunhosCount={rascunhos.length} />
      </div>

      <div style={{ padding: "32px 32px 48px", display: "flex", flexDirection: "column", gap: 22, maxWidth: 980, margin: "0 auto", width: "100%" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 30, margin: "0 0 6px" }}>Rascunhos</h1>
          <p className="quiet" style={{ margin: 0, fontSize: 13.5 }}>
            Sessões de peticionamento ainda não exportadas — {rascunhos.length} no total. Retomar volta exatamente para onde a sessão parou.
          </p>
        </div>

        {rascunhos.length === 0 ? (
          <div className="empty-note">Nenhum rascunho salvo ainda. Ao iniciar uma peça pelo Menu, ela aparece aqui automaticamente.</div>
        ) : (
          <div className="ctx-list">
            {rascunhos.map((r) => (
              <div key={r.id} className="ctx-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                <div className="body" style={{ flex: 1 }}>
                  <div className="title-line">{r.titulo}</div>
                  <div className="sub-line">
                    {r.clienteNome ?? "Sem vínculo (avulsa)"}
                    {r.naturezaProcedimento ? ` · ${r.naturezaProcedimento}` : ""} · atualizado em {formatarData(r.atualizadoEm)} · por {r.criadoPorNome}
                  </div>
                </div>
                <span className="chip" style={{ marginRight: 14 }}>
                  {r.passoRotulo}
                </span>
                <Link className="btn btn-primary btn-sm" href={r.href}>
                  Retomar
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="entry-foot">
        <span>
          <span className="dot" style={{ display: "inline-block" }} /> Rodarte Prado Advogados · Lúmen
        </span>
        <Link className="quiet" href="/peticionamento" style={{ textDecoration: "none" }}>
          ← Voltar à tela inicial
        </Link>
      </div>
    </div>
  );
}
