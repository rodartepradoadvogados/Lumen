"use client";

import { useState, useTransition } from "react";
import { confirmarExportacao } from "@/lib/actions/peticionamento";
import type { AvaliacaoDeExportacao } from "@/lib/peticionamentoAcesso";

const TEXTO_CIENCIA = "Li e estou ciente de que este é um rascunho gerado por IA e requer revisão profissional integral antes de qualquer protocolo.";

function baixarArquivo(nomeArquivo: string, base64: string) {
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportarModal({
  sessaoId,
  podeExportar,
  jaExportada,
  onFechar,
}: {
  sessaoId: string;
  arquivoNomeSugerido: string;
  podeExportar: AvaliacaoDeExportacao;
  jaExportada: boolean;
  onFechar: () => void;
}) {
  const [ciente, setCiente] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ driveUrl: string | null; avisoTimbrado: string | null } | null>(null);

  function exportar() {
    setErro(null);
    iniciar(async () => {
      // HARD GATE (defesa em profundidade): mesmo que o botão tenha sido habilitado no cliente
      // por engano, o servidor reconfere `ciente` e a régua de OAB antes de gerar qualquer coisa
      // — ver lib/actions/peticionamento.ts:confirmarExportacao.
      const r = await confirmarExportacao(sessaoId, ciente);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      baixarArquivo(r.arquivoNome, r.arquivoBase64);
      setResultado({ driveUrl: r.driveUrl, avisoTimbrado: r.avisoTimbrado });
    });
  }

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>Exportar para Word</h2>

        {!podeExportar.pode ? (
          <div className="callout callout-danger">{podeExportar.motivo}</div>
        ) : resultado ? (
          <>
            <div className="callout" style={{ borderColor: "var(--ok-border)", background: "var(--ok-bg)", marginBottom: 14 }}>
              Arquivo exportado e baixado. {resultado.driveUrl ? (
                <>
                  Também salvo no Drive:{" "}
                  <a href={resultado.driveUrl} target="_blank" rel="noreferrer">
                    abrir no Drive
                  </a>
                  .
                </>
              ) : (
                "Não foi possível confirmar o salvamento automático no Drive — o arquivo baixado é a cópia de verdade."
              )}
            </div>
            {resultado.avisoTimbrado && <div className="timbrado-note warn">{resultado.avisoTimbrado}</div>}
            <div className="modal-actions">
              <span />
              <button className="btn btn-primary" onClick={onFechar}>
                Fechar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="lede">Antes de gerar o arquivo, confirme que leu o aviso da minuta. Essa confirmação é registrada nos metadados do arquivo — quem confirmou e quando.</p>

            {erro && <div className="callout callout-danger" style={{ marginBottom: 12 }}>{erro}</div>}
            {jaExportada && <div className="callout callout-warn" style={{ marginBottom: 12 }}>Esta sessão já foi exportada antes — exportar de novo cria um novo registro de confirmação.</div>}

            <label className="consent-box">
              <input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} />
              <span className="txt">{TEXTO_CIENCIA}</span>
            </label>
            <p className="consent-meta">Só advogado com OAB pode confirmar e exportar; estagiário pode gerar e editar a minuta, mas esta etapa fica bloqueada para ele.</p>

            <div className="export-meta">
              <div className="row">
                <span className="k">Formato</span>
                <span className="v">Word (.docx) — único formato desta exportação</span>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onFechar}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={!ciente || pendente} onClick={exportar}>
                {pendente ? "Exportando…" : "Exportar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
