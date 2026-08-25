"use client";

import { useMemo, useState } from "react";
import { FolderSearch } from "lucide-react";
import {
  migrarPastasLegadasDoDrive,
  aplicarMigracaoPastasSelecionadas,
  type DriveFolderMigrationEntry,
  type DriveFolderMigrationResult,
} from "@/lib/actions/driveFolderMigration";
import {
  planoArquivosNaoVinculados,
  sincronizarArquivosSelecionados,
  type UnlinkedFileItem,
} from "@/lib/actions/driveUnlinkedFiles";
import ModalShell from "@/components/ModalShell";

const ACTION_LABEL: Record<DriveFolderMigrationEntry["action"], string> = {
  MOVER: "Mover para a raiz correta",
  JA_CORRETA: "Já está no lugar certo",
  CONFLITO: "Conflito — decisão manual",
  PASTA_INEXISTENTE: "Pasta não encontrada no Drive",
};

function actionBadgeClass(action: DriveFolderMigrationEntry["action"]): string {
  if (action === "CONFLITO") return "bg-urgente-bg text-urgente font-semibold rounded-sm";
  if (action === "MOVER") return "bg-aviso-bg text-aviso rounded-sm";
  return "bg-sf-apoio text-tx-2";
}

function entryKey(e: { kind: string; entityId: string }): string {
  return `${e.kind}-${e.entityId}`;
}

// Duas seções independentes nesta mesma janela (pedido do dono do produto): 1) pastas fora do
// lugar (migração — move a pasta inteira) e 2) arquivos já na pasta certa mas sem registro no
// banco (sincronização — cria o Attachment/AssessoriaDocumento). Cada uma simula primeiro (nada
// é escrito), mostra numa janela de 80% da tela, some o que já está certo, e só aplica o que
// ficou marcado — mas são AÇÕES SEPARADAS: cada seção tem seu próprio botão de aplicar, porque
// mover pasta e vincular arquivo são operações diferentes com consequência diferente.
export default function MigrarPastasLegadasButton() {
  const [open, setOpen] = useState(false);
  const [checando, setChecando] = useState(false);
  const [erro, setErro] = useState("");

  // Seção 1 — pastas fora do lugar
  const [aplicando, setAplicando] = useState(false);
  const [plano, setPlano] = useState<DriveFolderMigrationResult | null>(null);
  const [resultado, setResultado] = useState<DriveFolderMigrationResult | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());

  // Seção 2 — arquivos no lugar certo, sem vínculo
  const [planoVinculo, setPlanoVinculo] = useState<{ itens: UnlinkedFileItem[] } | { error: string } | null>(null);
  const [selecionadosVinculo, setSelecionadosVinculo] = useState<Set<string>>(new Set());
  const [sincronizando, setSincronizando] = useState(false);
  const [resultadoVinculo, setResultadoVinculo] = useState<{ sincronizados: number; erros: string[] } | null>(null);

  async function verificar() {
    setOpen(true);
    setChecando(true);
    setErro("");
    setResultado(null);
    setResultadoVinculo(null);
    const [res, resVinculo] = await Promise.all([migrarPastasLegadasDoDrive(true), planoArquivosNaoVinculados()]);
    setChecando(false);

    if ("error" in res) {
      setErro(res.error);
      setPlano(null);
    } else {
      setPlano(res);
      setSelecionadas(new Set(res.entries.filter((e) => e.action === "MOVER").map(entryKey)));
    }

    setPlanoVinculo(resVinculo);
    if (!("error" in resVinculo)) {
      setSelecionadosVinculo(new Set(resVinculo.itens.map((i) => i.fileId)));
    }
  }

  async function aplicar() {
    if (!plano) return;
    const alvo = plano.entries.filter((e) => e.action === "MOVER" && selecionadas.has(entryKey(e)));
    setAplicando(true);
    setErro("");
    const res = await aplicarMigracaoPastasSelecionadas(
      alvo.map((e) => ({ kind: e.kind, entityId: e.entityId, title: e.title, folderId: e.folderId }))
    );
    setAplicando(false);
    if ("error" in res) {
      setErro(res.error);
      return;
    }
    setResultado(res);
  }

  async function sincronizar() {
    if (!planoVinculo || "error" in planoVinculo) return;
    const alvo = planoVinculo.itens.filter((i) => selecionadosVinculo.has(i.fileId));
    setSincronizando(true);
    const res = await sincronizarArquivosSelecionados(alvo);
    setSincronizando(false);
    setResultadoVinculo(res);
  }

  function toggle(key: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleVinculo(fileId: string) {
    setSelecionadosVinculo((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  const exibido = resultado ?? plano;
  // Só o que está de fato fora do lugar — JA_CORRETA nunca aparece na lista (pedido explícito).
  const visiveis = useMemo(() => exibido?.entries.filter((e) => e.action !== "JA_CORRETA") ?? [], [exibido]);
  const totalSelecionavel = plano?.entries.filter((e) => e.action === "MOVER").length ?? 0;
  const itensVinculo = planoVinculo && !("error" in planoVinculo) ? planoVinculo.itens : [];

  return (
    <>
      <button
        onClick={verificar}
        disabled={checando}
        className="inline-flex items-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2.5 w-fit disabled:opacity-50"
      >
        <FolderSearch size={16} /> Verificar pastas do Drive fora do lugar
      </button>

      {open && (
        <ModalShell size="cheio" title="Pastas do Drive fora do lugar" onClose={() => setOpen(false)}>
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-6">
              {checando && <p className="text-sm text-tx-2">Verificando o Drive...</p>}

              {erro && (
                <p className="text-xs font-medium text-urgente bg-urgente-bg border border-urgente/20 px-3 py-2 rounded-md">{erro}</p>
              )}

              {/* Seção 1 — pastas fora do lugar */}
              {exibido && (
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-tx">Pastas fora do lugar</h4>
                  <p className="text-xs text-tx-2">
                    {resultado ? "Resultado da aplicação" : "Simulação — nada foi alterado no Drive nem no banco"}: {exibido.movidas} pasta(s){" "}
                    {resultado ? "movida(s)" : "a mover"} · {exibido.conflitos} conflito(s) · {exibido.jaCorretas} já correta(s) (não listada(s) abaixo)
                  </p>

                  {visiveis.length === 0 ? (
                    <p className="text-sm text-tx-2">Nenhuma pasta fora do lugar encontrada — tudo certo.</p>
                  ) : (
                    <div className="border border-regua overflow-x-auto scrollbar-thin">
                      <table className="w-full text-xs">
                        <thead className="bg-sf-apoio">
                          <tr className="text-left text-[10px] uppercase tracking-wide text-tx-2">
                            {!resultado && <th className="px-3 py-2 font-semibold w-10"></th>}
                            <th className="px-3 py-2 font-semibold w-[8%]">Tipo</th>
                            <th className="px-3 py-2 font-semibold w-[22%]">Título</th>
                            <th className="px-3 py-2 font-semibold w-[18%]">Ação</th>
                            <th className="px-3 py-2 font-semibold">Detalhe</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-regua">
                          {visiveis.map((e) => {
                            const key = entryKey(e);
                            const podeMarcar = !resultado && e.action === "MOVER";
                            return (
                              <tr key={key} className={e.action === "CONFLITO" ? "bg-urgente-bg" : undefined}>
                                {!resultado && (
                                  <td className="px-3 py-2.5 align-top">
                                    {podeMarcar && (
                                      <input
                                        type="checkbox"
                                        checked={selecionadas.has(key)}
                                        onChange={() => toggle(key)}
                                        className="h-4 w-4 accent-marca"
                                      />
                                    )}
                                  </td>
                                )}
                                <td className="px-3 py-2.5 align-top text-tx-2">{e.kind === "PROCESSO" ? "Processo" : "Atendimento"}</td>
                                <td className="px-3 py-2.5 align-top font-medium text-tx">{e.title}</td>
                                <td className="px-3 py-2.5 align-top">
                                  <span className={`inline-block px-2 py-0.5 text-[11px] ${actionBadgeClass(e.action)}`}>{ACTION_LABEL[e.action]}</span>
                                </td>
                                <td className="px-3 py-2.5 align-top text-tx-2">{e.detail}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {!resultado && plano && plano.orfas.length > 0 && (
                    <div className="border border-aviso/25 p-3 bg-aviso-bg rounded-md space-y-1.5">
                      <p className="text-xs font-semibold text-aviso">
                        {plano.orfas.length} pasta(s) com conteúdo e sem processo vinculado — nada foi movido nem apagado
                      </p>
                      <p className="text-[11px] text-tx-2">
                        Abra cada uma, veja a que processo pertence e vincule os documentos pela tela de Anexos daquele processo.
                      </p>
                      <ul className="space-y-0.5 pt-0.5">
                        {plano.orfas.map((o) => (
                          <li key={o.folderId} className="text-xs text-tx-2">
                            {o.driveUrl ? (
                              <a href={o.driveUrl} target="_blank" rel="noopener noreferrer" className="text-marca-tx hover:underline font-medium">
                                {o.name}
                              </a>
                            ) : (
                              <span className="font-medium">{o.name}</span>
                            )}
                            <span className="text-tx-2"> · {o.itens} item(ns) · {o.naRaizCorreta ? "já na raiz correta" : "raiz antiga"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {plano && !resultado && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={aplicar}
                        disabled={aplicando || selecionadas.size === 0}
                        className="inline-flex items-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2.5 disabled:opacity-50"
                      >
                        {aplicando ? "Aplicando..." : `Aplicar a migração (${selecionadas.size} de ${totalSelecionavel})`}
                      </button>
                      <span className="text-[11px] text-tx-2">Desmarque o que não quer mover agora — dá pra rodar de novo depois.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Seção 2 — arquivos já na pasta certa, sem vínculo no banco */}
              {planoVinculo && (
                <div className="space-y-3 border-t-2 border-regua-forte pt-5">
                  <h4 className="text-sm font-bold text-tx">Arquivos no lugar certo, sem vínculo no sistema</h4>
                  <p className="text-xs text-tx-2">
                    Arquivo colocado direto no Drive, já na pasta certa do processo/atendimento/empresa, mas que ainda não é um anexo/documento reconhecido pelo Lúmen.
                  </p>

                  {"error" in planoVinculo ? (
                    <p className="text-xs font-medium text-urgente bg-urgente-bg border border-urgente/20 px-3 py-2 rounded-md">{planoVinculo.error}</p>
                  ) : resultadoVinculo ? (
                    <p className="text-xs text-tx-2">
                      {resultadoVinculo.sincronizados} arquivo(s) sincronizado(s)
                      {resultadoVinculo.erros.length > 0 && ` · ${resultadoVinculo.erros.length} erro(s)`}
                    </p>
                  ) : itensVinculo.length === 0 ? (
                    <p className="text-sm text-tx-2">Nenhum arquivo pendente de vínculo — tudo certo.</p>
                  ) : (
                    <>
                      <div className="border border-regua overflow-x-auto scrollbar-thin">
                        <table className="w-full text-xs">
                          <thead className="bg-sf-apoio">
                            <tr className="text-left text-[10px] uppercase tracking-wide text-tx-2">
                              <th className="px-3 py-2 font-semibold w-10"></th>
                              <th className="px-3 py-2 font-semibold w-[10%]">Tipo</th>
                              <th className="px-3 py-2 font-semibold w-[30%]">Arquivo</th>
                              <th className="px-3 py-2 font-semibold">Sincronizar com</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-regua">
                            {itensVinculo.map((item) => (
                              <tr key={item.fileId}>
                                <td className="px-3 py-2.5 align-top">
                                  <input
                                    type="checkbox"
                                    checked={selecionadosVinculo.has(item.fileId)}
                                    onChange={() => toggleVinculo(item.fileId)}
                                    className="h-4 w-4 accent-marca"
                                  />
                                </td>
                                <td className="px-3 py-2.5 align-top text-tx-2">{item.kind === "ATTACHMENT" ? "Anexo" : "Doc. Assessoria"}</td>
                                <td className="px-3 py-2.5 align-top font-medium text-tx">{item.name}</td>
                                <td className="px-3 py-2.5 align-top text-tx-2">{item.destino}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={sincronizar}
                          disabled={sincronizando || selecionadosVinculo.size === 0}
                          className="inline-flex items-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2.5 disabled:opacity-50"
                        >
                          {sincronizando ? "Sincronizando..." : `Sincronizar (${selecionadosVinculo.size} de ${itensVinculo.length})`}
                        </button>
                        <span className="text-[11px] text-tx-2">Desmarque o que não quer vincular agora — dá pra rodar de novo depois.</span>
                      </div>
                    </>
                  )}

                  {resultadoVinculo && resultadoVinculo.erros.length > 0 && (
                    <ul className="space-y-0.5 text-xs text-urgente">
                      {resultadoVinculo.erros.slice(0, 10).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                      {resultadoVinculo.erros.length > 10 && <li>...e mais {resultadoVinculo.erros.length - 10}.</li>}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </ModalShell>
      )}
    </>
  );
}
