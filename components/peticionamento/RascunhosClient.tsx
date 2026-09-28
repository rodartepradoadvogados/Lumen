"use client";

// A LISTA DE RASCUNHOS — especificação §3. Título, tipo da peça, cliente, natureza do
// procedimento, em que passo parou, e quando foi editada — nesta ordem, como a especificação
// literal pede. Botão Retomar volta ao passo exato (lib/peticionamentoPasso.ts).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MenuPeticionamento } from "./MenuPeticionamento";
import { AlternadorDeTema } from "./AlternadorDeTema";
import { excluirRascunho, type RascunhoResumo } from "@/lib/actions/peticionamento";

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * A FRASE DO QUE SE PERDE — pedido do dono ("não tem opção de excluir rascunho") lido por
 * inteiro: excluir sem dizer o que vai embora é pedir para alguém confirmar no escuro. Monta a
 * lista a partir do que a sessão REALMENTE tem (números vindos do servidor, em listarRascunhos),
 * nunca um texto genérico de "todos os dados desta sessão".
 */
function oQueSePerde(r: RascunhoResumo): string[] {
  const perdas: string[] = ["o contexto preenchido até aqui (matéria, vínculo, fatos e pedidos)"];
  if (r.temMinuta) perdas.push("a minuta já gerada por esta sessão, e as citações confirmadas nela");
  if (r.anexosCount > 0) perdas.push(`${r.anexosCount} anexo(s) desta sessão — o registro aqui; os arquivos continuam no Google Drive`);
  if (r.documentosCount > 0) perdas.push(`a seleção de ${r.documentosCount} documento(s) do Lúmen (os documentos em si não são apagados)`);
  return perdas;
}

export function RascunhosClient({ rascunhos }: { rascunhos: RascunhoResumo[] }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<RascunhoResumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function excluir(r: RascunhoResumo) {
    setErro(null);
    iniciar(async () => {
      // O `true` é a confirmação que a ação EXIGE — a trava de verdade está no servidor
      // (lib/actions/peticionamento.ts:excluirRascunho), esta tela só a alimenta.
      const resultado = await excluirRascunho(r.id, true);
      if ("error" in resultado) {
        setErro(resultado.error);
        setConfirmando(null);
        return;
      }
      setConfirmando(null);
      router.refresh();
    });
  }

  return (
    <div className="entry" style={{ gridTemplateRows: "48px 1fr auto" }}>
      <div className="entry-top">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <MenuPeticionamento rascunhosCount={rascunhos.length} />
          {/* "VOLTAR" — pedido do dono, 24/09/2026, item 2. Aqui, diferente das telas de sessão
              (components/peticionamento/Shell.tsx), é `router.back()`: Rascunhos não tem uma
              única etapa anterior fixa — chega-se aqui pelo Menu a partir de QUALQUER tela do
              módulo, então "a página anterior" É, literalmente, o histórico do navegador. */}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.back()} aria-label="Voltar à página anterior">
            <ChevronLeft size={14} aria-hidden="true" />
            Voltar
          </button>
        </div>
        <AlternadorDeTema />
      </div>

      <div style={{ padding: "32px 32px 48px", display: "flex", flexDirection: "column", gap: 22, maxWidth: 980, margin: "0 auto", width: "100%" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 30, margin: "0 0 6px" }}>Rascunhos</h1>
          <p className="quiet" style={{ margin: 0, fontSize: 13.5 }}>
            Sessões de peticionamento ainda não exportadas — {rascunhos.length} no total. Retomar volta exatamente para onde a sessão parou.
          </p>
        </div>

        {erro && <div className="callout callout-danger">{erro}</div>}

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
                <Link className="btn btn-primary btn-sm" href={r.href} style={{ marginRight: 8 }}>
                  Retomar
                </Link>
                {r.podeExcluir && (
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger-tx)" }} disabled={pendente} onClick={() => setConfirmando(r)}>
                    Excluir
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmando && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="Excluir rascunho">
          <div className="modal">
            <h2 style={{ marginTop: 0 }}>Excluir este rascunho?</h2>
            <p style={{ color: "var(--tx-1)", fontSize: 13.5, lineHeight: 1.6 }}>
              <b>{confirmando.titulo}</b>
              {confirmando.clienteNome ? ` — ${confirmando.clienteNome}` : " — sem vínculo (avulsa)"}. A exclusão é definitiva: o rascunho não vai para lugar
              nenhum depois, e não há como desfazer.
            </p>
            <p style={{ color: "var(--tx-1)", fontSize: 13, margin: "0 0 6px" }}>O que se perde:</p>
            <ul style={{ color: "var(--tx-1)", fontSize: 12.5, lineHeight: 1.6, margin: "0 0 14px", paddingLeft: 18 }}>
              {oQueSePerde(confirmando).map((linha) => (
                <li key={linha}>{linha}</li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" disabled={pendente} onClick={() => setConfirmando(null)}>
                Cancelar, manter o rascunho
              </button>
              <button className="btn btn-danger" disabled={pendente} onClick={() => excluir(confirmando)}>
                {pendente ? "Excluindo…" : "Excluir definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}

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
