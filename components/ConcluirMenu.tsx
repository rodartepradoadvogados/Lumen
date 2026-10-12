"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import type { DesfechoDeConclusao, MotivoDeDescarte } from "@/lib/desfechosDePublicacao";

export type OpcoesDeDescarte = { bloquearProcesso: "ESCRITORIO" | "USUARIO" | null; bloquearRemetente: boolean };

// CONCLUIR: três saídas no primeiro nível, para a decisão caber numa olhada.
//   1. Visto, só para mim      — sai SÓ da fila de quem marcou; continua para as outras pessoas.
//   2. Concluir para todos…    — sai da fila do escritório inteiro, com motivo.
//   3. Descartar…              — "não é publicação" ou "não é do escritório", com opção de bloquear.
// Aviso de intimação do Projudi não tem "só ciência": o e-mail só avisa que há intimação a abrir, e a
// única conclusão honesta é "já abri no tribunal e tratei" (o servidor também recusa).
export default function ConcluirMenu({
  aberto,
  onAbrir,
  onFechar,
  ehAviso,
  temCaso,
  temRemetente,
  pilhaExtra,
  jaVisto,
  busy,
  onVisto,
  onConcluir,
  onDescartar,
  classeBotao,
}: {
  aberto: boolean;
  onAbrir: () => void;
  onFechar: () => void;
  ehAviso: boolean;
  temCaso: boolean;
  temRemetente: boolean;
  // Outros avisos abertos do MESMO processo (a pilha do Projudi).
  pilhaExtra: number;
  jaVisto: boolean;
  busy: boolean;
  onVisto: () => void;
  onConcluir: (desfecho: DesfechoDeConclusao, incluirPilha: boolean) => void;
  onDescartar: (motivo: MotivoDeDescarte, opcoes: OpcoesDeDescarte) => void;
  classeBotao: string;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const [etapa, setEtapa] = useState<"menu" | "todos" | "descartar">("menu");
  const [desfecho, setDesfecho] = useState<DesfechoDeConclusao>(ehAviso ? "TRATADO_NO_TRIBUNAL" : "SO_CIENCIA");
  const [incluirPilha, setIncluirPilha] = useState(true);
  const [motivo, setMotivo] = useState<MotivoDeDescarte>("NAO_PUBLICACAO");
  const [bloquearProcesso, setBloquearProcesso] = useState(false);
  const [escopo, setEscopo] = useState<"ESCRITORIO" | "USUARIO">("ESCRITORIO");
  const [bloquearRemetente, setBloquearRemetente] = useState(false);

  // Reinicia ao abrir (outra publicação, outra escolha).
  useEffect(() => {
    if (aberto) {
      setEtapa("menu");
      setDesfecho(ehAviso ? "TRATADO_NO_TRIBUNAL" : "SO_CIENCIA");
      setIncluirPilha(true);
      setMotivo("NAO_PUBLICACAO");
      setBloquearProcesso(false);
      setBloquearRemetente(false);
      window.requestAnimationFrame(() => raiz.current?.querySelector<HTMLElement>("[data-primeiro]")?.focus());
    }
  }, [aberto, ehAviso]);

  // Fecha ao clicar fora e com Esc.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) onFechar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onFechar();
      }
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla, true);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla, true);
    };
  }, [aberto, onFechar]);

  const item = "w-full text-left min-h-12 px-3 py-2 hover:bg-sf-apoio flex items-start justify-between gap-3 disabled:opacity-50";
  const radio = "flex items-start gap-2 py-1.5 text-sm text-tx cursor-pointer";

  return (
    <div ref={raiz} className="relative">
      <button type="button" disabled={busy} onClick={() => (aberto ? onFechar() : onAbrir())} aria-haspopup="menu" aria-expanded={aberto} aria-keyshortcuts="C" className={classeBotao}>
        Concluir <ChevronDown size={15} aria-hidden="true" /> <kbd className="max-xl:hidden text-xs border border-current px-1 opacity-70">C</kbd>
      </button>

      {aberto && (
        <div role="menu" aria-label="Concluir esta publicação" className="absolute bottom-full left-0 mb-1 z-20 w-[min(22rem,calc(100vw-1.5rem))] bg-sf border border-regua-forte shadow-pop">
          {etapa === "menu" && (
            <div className="p-1">
              <button type="button" role="menuitem" data-primeiro disabled={jaVisto} onClick={() => { onFechar(); onVisto(); }} className={item}>
                <span>
                  <span className="block text-sm font-semibold text-tx">Visto, só para mim</span>
                  <span className="block text-xs text-tx-2">Sai da sua fila. Continua para as outras pessoas.</span>
                </span>
                <kbd className="text-xs border border-regua-forte px-1 text-tx-2">L</kbd>
              </button>
              <button type="button" role="menuitem" onClick={() => setEtapa("todos")} className={item}>
                <span>
                  <span className="block text-sm font-semibold text-tx">Concluir para todos…</span>
                  <span className="block text-xs text-tx-2">{ehAviso ? "Depois de abrir e tratar a intimação no tribunal." : "Só ciência, sem providência ou duplicada."}</span>
                </span>
              </button>
              <button type="button" role="menuitem" onClick={() => setEtapa("descartar")} className={item}>
                <span>
                  <span className="block text-sm font-semibold text-tx">Descartar…</span>
                  <span className="block text-xs text-tx-2">Não é publicação ou não é do escritório, com opção de bloquear.</span>
                </span>
              </button>
            </div>
          )}

          {etapa === "todos" && (
            <div className="p-3 space-y-2">
              <p className="text-sm font-semibold text-tx">Concluir para todos</p>
              {ehAviso ? (
                <>
                  <label className={radio}>
                    <input type="radio" name="desfecho" data-primeiro className="mt-0.5 accent-[var(--acao)]" checked={desfecho === "TRATADO_NO_TRIBUNAL"} onChange={() => setDesfecho("TRATADO_NO_TRIBUNAL")} />
                    <span>
                      Já abri no tribunal e tratei
                      <span className="block text-xs text-tx-2">Fecha o aviso para todo o escritório.</span>
                    </span>
                  </label>
                  <label className={radio}>
                    <input type="radio" name="desfecho" className="mt-0.5 accent-[var(--acao)]" checked={desfecho === "DUPLICADA"} onChange={() => setDesfecho("DUPLICADA")} />
                    <span>Duplicada</span>
                  </label>
                  <p className="text-xs text-tx-2">“Só ciência” não existe para aviso de intimação: o prazo só é conhecido depois de abrir o aviso.</p>
                  {pilhaExtra > 0 && (
                    <label className={radio}>
                      <input type="checkbox" className="mt-0.5 accent-[var(--acao)]" checked={incluirPilha} onChange={(e) => setIncluirPilha(e.target.checked)} />
                      <span>Concluir também os outros {pilhaExtra} {pilhaExtra === 1 ? "aviso" : "avisos"} deste processo</span>
                    </label>
                  )}
                </>
              ) : (
                <>
                  <label className={radio}>
                    <input type="radio" name="desfecho" data-primeiro className="mt-0.5 accent-[var(--acao)]" checked={desfecho === "SO_CIENCIA"} onChange={() => setDesfecho("SO_CIENCIA")} />
                    <span>
                      Só ciência
                      <span className="block text-xs text-tx-2">Sem prazo e sem providência.</span>
                    </span>
                  </label>
                  <label className={radio}>
                    <input type="radio" name="desfecho" className="mt-0.5 accent-[var(--acao)]" checked={desfecho === "SEM_PROVIDENCIA"} onChange={() => setDesfecho("SEM_PROVIDENCIA")} />
                    <span>
                      Sem providência
                      <span className="block text-xs text-tx-2">Há prazo, mas nada a fazer.</span>
                    </span>
                  </label>
                  <label className={radio}>
                    <input type="radio" name="desfecho" className="mt-0.5 accent-[var(--acao)]" checked={desfecho === "DUPLICADA"} onChange={() => setDesfecho("DUPLICADA")} />
                    <span>
                      Duplicada
                      <span className="block text-xs text-tx-2">O mesmo ato já foi tratado em outro item.</span>
                    </span>
                  </label>
                </>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEtapa("menu")} className="min-h-10 px-3 text-sm font-semibold text-tx-2 hover:bg-sf-apoio">
                  Voltar
                </button>
                <button type="button" disabled={busy} onClick={() => { onFechar(); onConcluir(desfecho, ehAviso && incluirPilha); }} className="min-h-10 px-4 text-sm font-semibold bg-acao hover:bg-acao-hover text-acao-tx disabled:opacity-50">
                  Concluir
                </button>
              </div>
            </div>
          )}

          {etapa === "descartar" && (
            <div className="p-3 space-y-2">
              <p className="text-sm font-semibold text-tx">Descartar</p>
              <label className={radio}>
                <input type="radio" name="motivo" data-primeiro className="mt-0.5 accent-[var(--acao)]" checked={motivo === "NAO_PUBLICACAO"} onChange={() => setMotivo("NAO_PUBLICACAO")} />
                <span>Não é publicação</span>
              </label>
              <label className={radio}>
                <input type="radio" name="motivo" className="mt-0.5 accent-[var(--acao)]" checked={motivo === "NAO_DO_ESCRITORIO"} onChange={() => setMotivo("NAO_DO_ESCRITORIO")} />
                <span>Não é do escritório</span>
              </label>
              <div className={clsx("border-l-2 border-regua-forte pl-3 space-y-1")}>
                {temCaso ? (
                  <p className="text-xs text-tx-2">Processo cadastrado: não pode ser bloqueado.</p>
                ) : (
                  <>
                    <label className={radio}>
                      <input type="checkbox" className="mt-0.5 accent-[var(--acao)]" checked={bloquearProcesso} onChange={(e) => setBloquearProcesso(e.target.checked)} />
                      <span>
                        Bloquear este processo
                        <span className="block text-xs text-tx-2">As próximas publicações dele nem entram na fila.</span>
                      </span>
                    </label>
                    {bloquearProcesso && (
                      <label className="flex items-center gap-2 pl-6 text-sm text-tx">
                        Para
                        <select value={escopo} onChange={(e) => setEscopo(e.target.value as "ESCRITORIO" | "USUARIO")} aria-label="Quem deixa de receber" className="border border-regua-forte bg-sf min-h-9 px-2 text-sm">
                          <option value="ESCRITORIO">todo o escritório</option>
                          <option value="USUARIO">só para mim</option>
                        </select>
                      </label>
                    )}
                  </>
                )}
                {temRemetente && (
                  <label className={radio}>
                    <input type="checkbox" className="mt-0.5 accent-[var(--acao)]" checked={bloquearRemetente} onChange={(e) => setBloquearRemetente(e.target.checked)} />
                    <span>Bloquear o remetente do e-mail</span>
                  </label>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEtapa("menu")} className="min-h-10 px-3 text-sm font-semibold text-tx-2 hover:bg-sf-apoio">
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onFechar();
                    onDescartar(motivo, { bloquearProcesso: !temCaso && bloquearProcesso ? escopo : null, bloquearRemetente: temRemetente && bloquearRemetente });
                  }}
                  className="min-h-10 px-4 text-sm font-semibold bg-acao hover:bg-acao-hover text-acao-tx disabled:opacity-50"
                >
                  Descartar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
