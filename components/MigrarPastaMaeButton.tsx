"use client";

import { useState } from "react";
import { FolderTree, FolderInput, AlertTriangle, ExternalLink, FileQuestion } from "lucide-react";
import {
  migrarPastaMaeLumen,
  type LumenMigrationResult,
  type LumenMigrationMovedEntry,
} from "@/lib/actions/driveParentMigration";

const KIND_LABEL: Record<string, string> = {
  CASE: "Processo/Caso",
  ATTENDANCE: "Atendimento",
  ASSESSORIA: "Assessoria",
  PARECER: "Parecer",
  ATTACHMENT: "Anexo",
  ASSESSORIA_DOCUMENTO: "Documento de assessoria",
  ARQUIVO_SOLTO: "Arquivo sem dono",
};

// "O que casou" (achou o registro correspondente no sistema) é --concluido; dentro desse mesmo
// grupo, um conflito de nome no destino vira --urgente — é a única cor que sinaliza que a ação
// não vai mexer em nada sozinha. Não identificado (sem registro correspondente) é --aviso, nunca
// urgente: não é erro, é só algo que só um humano sabe explicar.
function movidoRowClass(action: LumenMigrationMovedEntry["action"]): string {
  return action === "CONFLITO" ? "border-urgente bg-urgente-bg" : "border-concluido bg-concluido-bg";
}

function movidoBadgeClass(action: LumenMigrationMovedEntry["action"]): string {
  return action === "CONFLITO" ? "bg-urgente-bg text-urgente font-semibold rounded-sm" : "bg-concluido-bg text-concluido rounded-sm";
}

// Componente cliente da Tarefa A: dá interface à ação de servidor `migrarPastaMaeLumen`, que já
// existia completa mas sem nenhum botão que a chamasse. Mesmo desenho de duas etapas obrigatórias
// de MigrarPastasLegadasButton.tsx (e da mesma ação-molde, driveFolderMigration.ts): primeiro
// `simulacao: true`, só relatório, nada é alterado; só depois de o usuário conferir é que o botão
// de aplicar de verdade (`simulacao: false`) aparece, atrás de uma confirmação explícita.
export default function MigrarPastaMaeButton() {
  const [conferindo, setConferindo] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState("");
  const [plano, setPlano] = useState<LumenMigrationResult | null>(null);
  const [resultado, setResultado] = useState<LumenMigrationResult | null>(null);

  async function conferir() {
    setConferindo(true);
    setErro("");
    setResultado(null);
    const res = await migrarPastaMaeLumen(true);
    setConferindo(false);
    if ("error" in res) {
      setErro(res.error);
      setPlano(null);
      return;
    }
    setPlano(res);
  }

  async function confirmarEMover() {
    if (!plano) return;
    const totalRaizesLumen = plano.raizesLumenEncontradasSoltas.length;
    const confirmado = window.confirm(
      `Isso vai:\n\n` +
        `• Mover ${totalRaizesLumen} raiz(es) "Lúmen - *" que estão soltas para dentro da pasta-mãe "Lúmen".\n` +
        `• Mover ${plano.totalMovidos} item(ns) identificado(s) das pastas antigas "RP Financeiro - *" para o lugar certo.\n` +
        `• Deixar ${plano.totalConflitos} conflito(s) e ${plano.totalNaoIdentificados} item(ns) não identificado(s) sem tocar em nada.\n\n` +
        `NADA É APAGADO. O que sai do lugar antigo vai para a Lixeira do Drive, reversível por 30 dias. Continuar?`
    );
    if (!confirmado) return;
    setAplicando(true);
    setErro("");
    const res = await migrarPastaMaeLumen(false);
    setAplicando(false);
    if ("error" in res) {
      setErro(res.error);
      return;
    }
    setResultado(res);
    setPlano(res);
  }

  const exibido = resultado ?? plano;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={conferir}
          disabled={conferindo || aplicando}
          className="inline-flex items-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2.5 w-fit disabled:opacity-50"
        >
          <FolderTree size={16} /> {conferindo ? "Conferindo..." : "1. Conferir migração da pasta-mãe"}
        </button>

        {plano && !resultado && (
          <button
            onClick={confirmarEMover}
            disabled={aplicando}
            className="inline-flex items-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2.5 w-fit disabled:opacity-50"
          >
            <FolderInput size={16} /> {aplicando ? "Movendo..." : "2. Confirmar e mover"}
          </button>
        )}
      </div>

      <p className="text-[11px] text-tx-3">
        Move as raízes &ldquo;Lúmen - *&rdquo; soltas para dentro da pasta-mãe &ldquo;Lúmen&rdquo; e organiza o que restou das
        pastas antigas &ldquo;RP Financeiro - *&rdquo;. Nada é apagado — o que sai do lugar vai para a Lixeira do Drive,
        reversível por 30 dias.
      </p>

      {erro && (
        <p className="text-xs font-medium text-urgente bg-urgente-bg border border-urgente/20 px-3 py-2 rounded-md">
          {erro}
        </p>
      )}

      {exibido && (
        <div className="space-y-3">
          <p className="text-xs text-tx-2">
            {resultado ? "Resultado da aplicação" : "Simulação — nada foi alterado no Drive"}: {exibido.totalMovidos}{" "}
            item(ns) {resultado ? "movido(s)" : "a mover"} · {exibido.totalConflitos} conflito(s) · {exibido.totalNaoIdentificados}{" "}
            não identificado(s)
          </p>

          {exibido.truncado && (
            <p className="flex items-center gap-2 text-xs font-semibold text-urgente bg-urgente-bg border border-urgente/25 px-3 py-2 rounded-md">
              <AlertTriangle size={14} className="shrink-0" /> A varredura parou antes de terminar (Drive muito grande). Rode a
              conferência de novo depois de tratar o que já apareceu — itens ainda não vistos não estão neste relatório.
            </p>
          )}

          {/* Etapa (a): raízes "Lúmen - *" soltas na raiz do Drive */}
          <div className="border border-regua p-3 space-y-1.5">
            <p className="text-xs font-semibold text-tx">Raízes &ldquo;Lúmen - *&rdquo; soltas na raiz do Drive</p>
            {exibido.raizesLumenEncontradasSoltas.length === 0 ? (
              <p className="text-xs text-tx-2">Nenhuma — todas já estão dentro da pasta-mãe &ldquo;Lúmen&rdquo;.</p>
            ) : (
              <ul className="space-y-1">
                {exibido.raizesLumenEncontradasSoltas.map((nome) => {
                  const movida = resultado ? resultado.raizesLumenMovidas.includes(nome) : false;
                  return (
                    <li key={nome} className="flex items-center gap-2 text-xs">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${resultado ? (movida ? "bg-concluido" : "bg-urgente") : "bg-aviso"}`} />
                      <span className="text-tx">{nome}</span>
                      <span className="text-tx-3">
                        {resultado ? (movida ? "— movida para dentro de \"Lúmen\"" : "— não foi possível mover, tente de novo") : "— será movida para dentro de \"Lúmen\""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Etapa (b): raízes legadas encontradas + auditoria */}
          <div className="border border-regua p-3 space-y-1.5">
            <p className="text-xs font-semibold text-tx">Pastas antigas &ldquo;RP Financeiro - *&rdquo; encontradas</p>
            {exibido.raizesLegadasEncontradas.length === 0 ? (
              <p className="text-xs text-tx-2">Nenhuma pasta antiga encontrada na raiz do Drive.</p>
            ) : (
              <ul className="space-y-0.5">
                {exibido.raizesLegadasEncontradas.map((nome) => (
                  <li key={nome} className="text-xs text-tx-2">
                    {nome}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* O que casou com um registro do sistema */}
          {exibido.movidos.length > 0 && (
            <div className="border border-regua overflow-x-auto scrollbar-thin">
              <table className="w-full text-xs">
                <thead className="bg-sf-apoio">
                  <tr className="text-left text-[10px] uppercase tracking-wide text-tx-2">
                    <th className="px-3 py-2 font-semibold w-[13%]">Tipo</th>
                    <th className="px-3 py-2 font-semibold w-[18%]">Registro</th>
                    <th className="px-3 py-2 font-semibold w-[22%]">Origem no Drive</th>
                    <th className="px-3 py-2 font-semibold w-[12%]">Situação</th>
                    <th className="px-3 py-2 font-semibold">Detalhe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-regua">
                  {exibido.movidos.map((m, i) => (
                    <tr key={`${m.driveFileId}-${i}`} className={`border-l-[3px] ${movidoRowClass(m.action)}`}>
                      <td className="px-3 py-2.5 align-top text-tx-2">{KIND_LABEL[m.kind] ?? m.kind}</td>
                      <td className="px-3 py-2.5 align-top font-medium text-tx">{m.label}</td>
                      <td className="px-3 py-2.5 align-top text-tx-2 break-all">{m.path}</td>
                      <td className="px-3 py-2.5 align-top">
                        <span className={`inline-block px-2 py-0.5 text-[11px] ${movidoBadgeClass(m.action)}`}>
                          {m.action === "CONFLITO" ? "Conflito — decisão manual" : resultado ? "Movido" : "Será movido"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top text-tx-2">{m.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* O que não foi identificado — nunca apagado, só relatado */}
          {exibido.naoIdentificados.length > 0 && (
            <div className="border-l-[3px] border-aviso bg-aviso-bg rounded-md p-3 space-y-1.5">
              <p className="flex items-center gap-2 text-xs font-semibold text-aviso">
                <FileQuestion size={14} className="shrink-0" /> {exibido.naoIdentificados.length} item(ns) não identificado(s) — nada
                foi movido nem apagado
              </p>
              <p className="text-[11px] text-tx-2">
                Não correspondem a nenhum registro do sistema. Abra cada um no Drive para decidir manualmente o que fazer.
              </p>
              <ul className="space-y-1 pt-0.5">
                {exibido.naoIdentificados.map((n, i) => (
                  <li key={`${n.driveFileId}-${i}`} className="text-xs text-tx-2">
                    {n.webViewLink ? (
                      <a
                        href={n.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-marca-tx hover:underline font-medium"
                      >
                        {n.name} <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span className="font-medium text-tx">{n.name}</span>
                    )}
                    <span className="text-tx-3">
                      {" "}
                      · {n.isFolder ? "pasta" : "arquivo"} · {n.path}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
