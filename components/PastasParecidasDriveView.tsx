"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderOpenDot, FolderInput, CheckCircle2, Merge, Link2Off, ExternalLink } from "lucide-react";
import {
  auditarPastasAssessoriaNoDrive,
  simularMesclaDePastasNoDrive,
  confirmarMesclaDePastasNoDrive,
  type GrupoPastasParecidas,
  type PastaAssessoriaInfo,
  type ConflitoPasta,
} from "@/lib/actions/clientDuplicates";
import ModalShell from "@/components/ModalShell";

function GrupoPastasCard({ grupo }: { grupo: GrupoPastasParecidas }) {
  const router = useRouter();
  const [canonicoId, setCanonicoId] = useState(grupo.pastas[0].id);
  const [alvoId, setAlvoId] = useState<string | null>(null);
  const [conflitos, setConflitos] = useState<ConflitoPasta[] | null>(null);
  const [resultado, setResultado] = useState<{ conflitosPastaDrive: ConflitoPasta[]; pastaDuplicataEsvaziada: boolean } | null>(null);
  const [erro, setErro] = useState("");
  const [conferindo, startConferir] = useTransition();
  const [aplicando, startAplicar] = useTransition();

  const canonico = grupo.pastas.find((p) => p.id === canonicoId)!;
  const outras = grupo.pastas.filter((p) => p.id !== canonicoId);
  const alvo = alvoId ? grupo.pastas.find((p) => p.id === alvoId) : null;

  function abrirConferencia(id: string) {
    setAlvoId(id);
    setErro("");
    setResultado(null);
    setConflitos(null);
    startConferir(async () => {
      const r = await simularMesclaDePastasNoDrive(canonicoId, id);
      if (r.error) setErro(r.error);
      else setConflitos(r.conflitosPastaDrive ?? []);
    });
  }

  function confirmar() {
    if (!alvoId) return;
    const confirmado = window.confirm(
      `Isso vai mover o conteúdo de "${alvo?.nome}" para dentro de "${canonico.nome}" no Drive.\n\n` +
        `NADA É APAGADO DE VEZ: se a pasta de origem ficar vazia depois, ela vai para a Lixeira do Drive (reversível por 30 dias). Continuar?`
    );
    if (!confirmado) return;
    setErro("");
    startAplicar(async () => {
      const r = await confirmarMesclaDePastasNoDrive(canonicoId, alvoId);
      if (r.error) {
        setErro(r.error);
        return;
      }
      setResultado(r.resultado ?? null);
      router.refresh();
    });
  }

  function fechar() {
    setAlvoId(null);
    setConflitos(null);
    setResultado(null);
    setErro("");
  }

  return (
    <div className="border border-regua rounded-xl overflow-hidden bg-sf">
      <div className="px-4 py-3 border-b border-regua bg-sf-apoio flex items-center gap-2">
        <FolderOpenDot size={15} className="text-tx-2" />
        <span className="font-semibold text-tx text-sm">{grupo.pastas[0].nome}</span>
        <span className="text-xs text-tx-3">— {grupo.pastas.length} pastas parecidas</span>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-xs text-tx-2">
          Escolha qual pasta é a <strong className="text-tx">correta (canônica)</strong> — o conteúdo das demais será
          movido para dentro dela.
        </p>

        <div className="space-y-2">
          {grupo.pastas.map((p) => (
            <label
              key={p.id}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                p.id === canonicoId ? "border-acao bg-acao-bg" : "border-regua hover:bg-sf-apoio"
              }`}
            >
              <input
                type="radio"
                name={`canonico-${grupo.chave}`}
                checked={p.id === canonicoId}
                onChange={() => {
                  setCanonicoId(p.id);
                  fechar();
                }}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-tx break-all">{p.nome}</span>
                  {p.id === canonicoId && <span className="text-[10px] font-bold text-acao uppercase tracking-wide shrink-0">Manter esta</span>}
                </div>
                <p className="text-[11px] text-tx-2 flex items-center gap-1">
                  {p.vinculada ? (
                    <>Vinculada ao cadastro &ldquo;{p.clienteVinculado}&rdquo;</>
                  ) : (
                    <>
                      <Link2Off size={11} className="text-marca-tx" /> Pasta solta, sem nenhum cadastro vinculado
                    </>
                  )}
                </p>
                {p.webViewLink && (
                  <a
                    href={p.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[11px] text-acao hover:underline inline-flex items-center gap-1 mt-0.5"
                  >
                    Abrir no Drive <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {outras.map((p) => (
            <button
              key={p.id}
              onClick={() => abrirConferencia(p.id)}
              disabled={conferindo}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-acao hover:bg-acao-hover text-acao-tx rounded-lg px-3 py-2 disabled:opacity-50"
            >
              <Merge size={13} /> Mesclar &ldquo;{p.nome}&rdquo; em &ldquo;{canonico.nome}&rdquo;
            </button>
          ))}
        </div>
      </div>

      {alvo && (
        <ModalShell size="medio" title="Mesclar pastas do Drive" subtitle={`"${alvo.nome}" → "${canonico.nome}"`} onClose={fechar}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {conferindo && <p className="text-sm text-tx-2">Conferindo…</p>}
            {erro && <p className="text-sm text-urgente bg-urgente-bg rounded-lg px-3 py-2">{erro}</p>}

            {!resultado && conflitos && (
              <>
                {conflitos.length === 0 ? (
                  <p className="text-sm text-tx-3">Nenhum conflito de nome — a mesclagem pode mover tudo sem parar em nada.</p>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-urgente">
                      {conflitos.length} conflito(s) de nome — não serão mexidos
                    </p>
                    <ul className="text-xs text-urgente bg-urgente-bg border border-urgente/20 rounded-lg divide-y divide-urgente/20">
                      {conflitos.map((c, i) => (
                        <li key={i} className="px-3 py-1.5">
                          <span className="font-mono">{c.caminho}</span> — {c.motivo}
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-tx-3">
                      Confira essas pastas direto no Drive e mescle manualmente o que fizer sentido — a mesclagem segue
                      em frente sem elas.
                    </p>
                  </div>
                )}
              </>
            )}

            {resultado && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-concluido flex items-center gap-1.5">
                  <CheckCircle2 size={16} /> Mesclagem concluída
                </p>
                {resultado.pastaDuplicataEsvaziada ? (
                  <p className="text-xs text-concluido">A pasta de origem ficou vazia e foi enviada à Lixeira (reversível).</p>
                ) : (
                  <p className="text-xs text-tx-2">A pasta de origem ainda tem conteúdo em conflito — não foi enviada à Lixeira.</p>
                )}
                {resultado.conflitosPastaDrive.length > 0 && (
                  <p className="text-xs text-urgente bg-urgente-bg rounded-lg px-3 py-2">
                    {resultado.conflitosPastaDrive.length} item(ns) ficaram sem mexer por conflito de nome — confira e
                    mescle manualmente.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-regua p-4 flex gap-2">
            {!resultado ? (
              <button
                onClick={confirmar}
                disabled={!conflitos || aplicando}
                className="inline-flex items-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-4 py-2.5 disabled:opacity-50"
              >
                <FolderInput size={15} /> {aplicando ? "Mesclando…" : "Confirmar mesclagem"}
              </button>
            ) : (
              <button onClick={fechar} className="text-sm font-semibold text-tx-2 px-2">
                Fechar
              </button>
            )}
          </div>
        </ModalShell>
      )}
    </div>
  );
}

export default function PastasParecidasDriveView() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [conectado, setConectado] = useState(true);
  const [grupos, setGrupos] = useState<GrupoPastasParecidas[]>([]);
  const [pastas, setPastas] = useState<PastaAssessoriaInfo[]>([]);

  useEffect(() => {
    (async () => {
      const r = await auditarPastasAssessoriaNoDrive();
      if (r.error) setErro(r.error);
      setConectado(r.conectado);
      setGrupos(r.gruposParecidos ?? []);
      setPastas(r.pastas ?? []);
      setCarregando(false);
    })();
  }, []);

  if (carregando) return <p className="text-sm text-tx-2">Lendo as pastas do Drive…</p>;
  if (erro) return <p className="text-sm text-urgente bg-urgente-bg rounded-lg px-3 py-2">{erro}</p>;
  if (!conectado) {
    return <p className="text-sm text-tx-2 bg-sf-apoio border border-regua rounded-lg px-3 py-2">Este escritório ainda não conectou o Google Drive.</p>;
  }

  const soltas = pastas.filter((p) => !p.vinculada && !grupos.some((g) => g.pastas.some((gp) => gp.id === p.id)));

  return (
    <div className="space-y-4">
      {grupos.length === 0 && (
        <div className="border border-regua rounded-xl bg-sf p-6 text-center">
          <CheckCircle2 size={22} className="text-concluido mx-auto mb-2" />
          <p className="text-sm text-tx-2">Nenhuma pasta com nome parecido de outra foi encontrada em Assessoria.</p>
        </div>
      )}

      {grupos.map((g) => (
        <GrupoPastasCard key={g.chave} grupo={g} />
      ))}

      {soltas.length > 0 && (
        <div className="border border-regua rounded-xl bg-sf p-4 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-tx-2 flex items-center gap-1.5">
            <Link2Off size={13} /> {soltas.length} pasta(s) solta(s), sem nome parecido com nenhuma outra
          </p>
          <p className="text-[11px] text-tx-3">
            Não têm cadastro de cliente vinculado nem duplicata aparente — confira se estão certas direto no Drive.
          </p>
          <ul className="text-xs text-tx-2 divide-y divide-regua">
            {soltas.map((p) => (
              <li key={p.id} className="py-1 flex items-center justify-between gap-2">
                <span className="truncate">{p.nome}</span>
                {p.webViewLink && (
                  <a href={p.webViewLink} target="_blank" rel="noopener noreferrer" className="text-acao hover:underline inline-flex items-center gap-1 shrink-0">
                    Abrir <ExternalLink size={10} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
