"use client";

import { useState } from "react";
import { FolderSearch, FolderInput } from "lucide-react";
import { migrarPastasLegadasDoDrive, type DriveFolderMigrationEntry, type DriveFolderMigrationResult } from "@/lib/actions/driveFolderMigration";

const ACTION_LABEL: Record<DriveFolderMigrationEntry["action"], string> = {
  MOVER: "Mover para a raiz correta",
  JA_CORRETA: "Já está no lugar certo",
  CONFLITO: "Conflito — decisão manual",
  PASTA_INEXISTENTE: "Pasta não encontrada no Drive",
};

function actionBadgeClass(action: DriveFolderMigrationEntry["action"]): string {
  if (action === "CONFLITO") {
    return "bg-urgente-bg text-urgente font-semibold";
  }
  if (action === "MOVER") {
    return "bg-aviso-bg text-aviso";
  }
  if (action === "PASTA_INEXISTENTE") {
    return "bg-sf-apoio text-tx-2";
  }
  return "bg-sf-apoio text-tx-2";
}

// Duas etapas obrigatórias: primeiro simula (não escreve nada, nem no Drive nem no banco) e
// mostra o plano completo; só depois de o usuário revisar o plano é que o botão de aplicar de
// verdade aparece. Isso existe porque não há como testar contra o Drive real de dentro do
// ambiente de desenvolvimento — quem roda em produção precisa poder conferir a simulação antes
// de confiar na aplicação real.
export default function MigrarPastasLegadasButton() {
  const [checando, setChecando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState("");
  const [plano, setPlano] = useState<DriveFolderMigrationResult | null>(null);
  const [resultado, setResultado] = useState<DriveFolderMigrationResult | null>(null);

  async function verificar() {
    setChecando(true);
    setErro("");
    setResultado(null);
    const res = await migrarPastasLegadasDoDrive(true);
    setChecando(false);
    if ("error" in res) {
      setErro(res.error);
      setPlano(null);
      return;
    }
    setPlano(res);
  }

  async function aplicar() {
    if (!plano) return;
    if (
      !window.confirm(
        `Isso vai mover ${plano.movidas} pasta(s) de processo/atendimento para a raiz correta do Drive (e mandar duplicadas vazias para a Lixeira, quando houver). Os ${plano.conflitos} conflito(s) listados não serão tocados. Continuar?`
      )
    ) {
      return;
    }
    setAplicando(true);
    setErro("");
    const res = await migrarPastasLegadasDoDrive(false);
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
          onClick={verificar}
          disabled={checando || aplicando}
          className="inline-flex items-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-4 py-2.5 w-fit disabled:opacity-50"
        >
          <FolderSearch size={16} /> {checando ? "Verificando..." : "Verificar pastas do Drive fora do lugar"}
        </button>

        {plano && !resultado && (
          <button
            onClick={aplicar}
            disabled={aplicando}
            className="inline-flex items-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-4 py-2.5 w-fit disabled:opacity-50"
          >
            <FolderInput size={16} /> {aplicando ? "Aplicando..." : "Aplicar a migração"}
          </button>
        )}
      </div>

      {erro && (
        <p className="text-xs font-medium text-urgente bg-urgente-bg border border-urgente/20 rounded-lg px-3 py-2">
          {erro}
        </p>
      )}

      {exibido && (
        <div className="space-y-2">
          <p className="text-xs text-tx-2">
            {resultado ? "Resultado da aplicação" : "Simulação — nada foi alterado no Drive nem no banco"}: {exibido.movidas} pasta(s){" "}
            {resultado ? "movida(s)" : "a mover"} · {exibido.jaCorretas} já correta(s) · {exibido.conflitos} conflito(s)
          </p>

          {exibido.entries.length === 0 ? (
            <p className="text-xs text-tx-2">Nenhum processo ou atendimento com pasta no Drive encontrado.</p>
          ) : (
            <div className="border border-regua rounded-lg overflow-x-auto scrollbar-thin">
              <table className="w-full text-xs">
                <thead className="bg-sf-apoio">
                  <tr className="text-left text-[10px] uppercase tracking-wide text-tx-2">
                    <th className="px-3 py-2 font-semibold w-[8%]">Tipo</th>
                    <th className="px-3 py-2 font-semibold w-[27%]">Título</th>
                    <th className="px-3 py-2 font-semibold w-[20%]">Ação</th>
                    <th className="px-3 py-2 font-semibold">Detalhe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-regua">
                  {exibido.entries.map((e) => (
                    <tr
                      key={`${e.kind}-${e.entityId}`}
                      className={e.action === "CONFLITO" ? "bg-urgente-bg" : undefined}
                    >
                      <td className="px-3 py-2.5 align-top text-tx-2">{e.kind === "PROCESSO" ? "Processo" : "Atendimento"}</td>
                      <td className="px-3 py-2.5 align-top font-medium text-tx">{e.title}</td>
                      <td className="px-3 py-2.5 align-top">
                        <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] ${actionBadgeClass(e.action)}`}>
                          {ACTION_LABEL[e.action]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top text-tx-2">{e.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pastas com conteúdo sem nenhum processo/atendimento apontando pra elas — tanto numa
              raiz antiga quanto já dentro da raiz correta (pasta criada direto no Drive, ou
              processo com título diferente do nome da pasta). Aparecem separadas da tabela acima
              porque não têm processo a que se ligar — e nunca são movidas nem apagadas pela ação,
              só reportadas, porque só um humano sabe a que processo aquele documento pertence. */}
          {exibido.orfas.length > 0 && (
            <div className="border border-aviso/25 rounded-lg p-3 bg-aviso-bg space-y-1.5">
              <p className="text-xs font-semibold text-aviso">
                {exibido.orfas.length} pasta(s) com conteúdo e sem processo vinculado — nada foi movido nem apagado
              </p>
              <p className="text-[11px] text-tx-2">
                Abra cada uma, veja a que processo pertence e vincule os documentos pela tela de Anexos daquele processo.
              </p>
              <ul className="space-y-0.5 pt-0.5">
                {exibido.orfas.map((o) => (
                  <li key={o.folderId} className="text-xs text-tx-2">
                    {o.driveUrl ? (
                      <a href={o.driveUrl} target="_blank" rel="noopener noreferrer" className="text-marca-tx hover:underline font-medium">
                        {o.name}
                      </a>
                    ) : (
                      <span className="font-medium">{o.name}</span>
                    )}
                    <span className="text-tx-2">
                      {" "}
                      · {o.itens} item(ns) · {o.naRaizCorreta ? "já na raiz correta" : "raiz antiga"}
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
