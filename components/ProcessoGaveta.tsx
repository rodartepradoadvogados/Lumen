"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ExternalLink, FileText, X } from "lucide-react";
import TabLink from "@/components/TabLink";
import ProcessNumberChip from "@/components/ProcessNumberChip";
import { carregarPainelDoProcesso, type PainelDoProcesso } from "@/lib/actions/painelDoProcesso";
import { dataDeBrasilia } from "@/lib/horaDeBrasilia";
import { formatCalendarDate } from "@/components/ui";
import type { TriageGroup } from "@/components/PublicationsTriage";

type Aba = "geral" | "publicacoes" | "atividades";

// Cache curto por processo: trocar de publicação com J/K e voltar não refaz a consulta. 60 s.
const CACHE = new Map<string, { em: number; painel: PainelDoProcesso }>();
const VALIDADE_MS = 60_000;

const NATUREZA: Record<string, string> = { JUDICIAL: "Judicial", ADMINISTRATIVO: "Administrativo", EXTRAJUDICIAL: "Extrajudicial", ATENDIMENTO: "Atendimento", CONSULTIVO: "Consultivo" };
const INSTANCIA: Record<string, string> = { PRIMEIRO_GRAU: "1º grau", SEGUNDO_GRAU: "2º grau", TERCEIRO_GRAU: "Tribunais superiores" };
const STATUS: Record<string, string> = { ATIVO: "Ativo", SUSPENSO: "Suspenso", ENCERRADO: "Encerrado", ARQUIVADO: "Arquivado" };

// GAVETA DO PROCESSO: a visão rápida que abre SOBRE o detalhe da publicação, sem sair da fila. O
// advogado quer "dar uma olhada e voltar", e abrir a página inteira do processo (cerca de 25
// consultas) era a ação mais lenta da tela. Aqui: visão geral, publicações e atividades, e as saídas
// "Abrir processo completo" e "Abrir no tribunal". Esta última SÓ existe quando o processo está
// cadastrado e tem o link do tribunal gravado: nunca se monta endereço a partir do número.
//
// Não é modal: a fila continua à esquerda e J/K continuam trocando de publicação; a gaveta acompanha.
// Esc fecha e devolve o foco. Tratar e Concluir ficam na barra de baixo do detalhe, que a gaveta não cobre.
export default function ProcessoGaveta({
  group,
  narrow,
  onFechar,
  onVincular,
}: {
  group: TriageGroup;
  narrow: boolean;
  onFechar: () => void;
  onVincular: () => void;
}) {
  const caso = group.primary.case;
  const [aba, setAba] = useState<Aba>("geral");
  const [painel, setPainel] = useState<PainelDoProcesso | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const ficha = useRef(0);
  const titulo = useRef<HTMLHeadingElement>(null);

  // Foco no título ao abrir (leitor de tela anuncia o processo).
  useEffect(() => {
    titulo.current?.focus();
  }, []);

  // Carrega (ou reaproveita) o painel do processo da publicação selecionada.
  useEffect(() => {
    setAba("geral");
    setErro(null);
    if (!caso) {
      setPainel(null);
      setCarregando(false);
      return;
    }
    const emCache = CACHE.get(caso.id);
    if (emCache && Date.now() - emCache.em < VALIDADE_MS) {
      setPainel(emCache.painel);
      setCarregando(false);
      return;
    }
    setPainel(null);
    setCarregando(true);
    const minha = ++ficha.current;
    // Pequeno atraso: com J/K em sequência só a última publicação consulta o servidor.
    const t = window.setTimeout(() => {
      carregarPainelDoProcesso(caso.id)
        .then((r) => {
          if (minha !== ficha.current) return;
          if (r.painel) {
            CACHE.set(caso.id, { em: Date.now(), painel: r.painel });
            setPainel(r.painel);
          } else setErro(r.error ?? "Não foi possível carregar o processo.");
        })
        .catch(() => {
          if (minha === ficha.current) setErro("Não foi possível carregar o processo.");
        })
        .finally(() => {
          if (minha === ficha.current) setCarregando(false);
        });
    }, 120);
    return () => window.clearTimeout(t);
  }, [caso?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const abas: { k: Aba; rotulo: string }[] = [
    { k: "geral", rotulo: "Visão geral" },
    { k: "publicacoes", rotulo: "Publicações" },
    { k: "atividades", rotulo: "Atividades" },
  ];
  const dd = "min-w-0 break-words text-tx";
  const dt = "text-xs text-tx-2";

  return (
    <aside
      role="complementary"
      aria-label="Processo, visão rápida"
      className={clsx(
        "pub-gaveta absolute z-10 flex flex-col bg-sf border-regua-forte shadow-pop",
        narrow ? "inset-x-0 bottom-0 top-[12%] border-t-2" : "inset-y-0 right-0 w-[min(34rem,100%)] border-l-2"
      )}
    >
      <div className="shrink-0 flex items-start gap-3 px-4 py-3 border-b border-regua">
        <div className="min-w-0 flex-1">
          <h2 ref={titulo} tabIndex={-1} className="text-lg font-bold text-tx leading-snug break-words outline-none">
            {caso ? painel?.titulo ?? caso.title : group.primary.processNumberRaw ? `Processo ${group.primary.processNumberRaw}` : "Processo não identificado"}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-tx-2">
            {(caso?.processNumber ?? group.primary.processNumberRaw) && <ProcessNumberChip processNumber={(caso?.processNumber ?? group.primary.processNumberRaw) as string} />}
            {(painel?.tribunalSigla ?? group.primary.tribunalDetectado) && <span>{painel?.tribunalSigla ?? group.primary.tribunalDetectado}</span>}
            {painel && <span>{STATUS[painel.status] ?? painel.status}</span>}
          </div>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar a visão rápida do processo" className="min-h-11 min-w-11 grid place-items-center text-tx-2 hover:text-tx hover:bg-sf-apoio">
          <X size={18} aria-hidden="true" />
          <kbd className="sr-only">Esc</kbd>
        </button>
      </div>

      {caso && (
        <div role="tablist" aria-label="Seções do processo" className="shrink-0 flex border-b border-regua px-2 overflow-x-auto">
          {abas.map((a) => (
            <button
              key={a.k}
              type="button"
              role="tab"
              aria-selected={aba === a.k}
              onClick={() => setAba(a.k)}
              className={clsx("min-h-11 px-3 text-sm font-semibold border-b-[3px] whitespace-nowrap", aba === a.k ? "text-tx border-marca-tx" : "text-tx-2 border-transparent hover:bg-sf-apoio")}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4" aria-busy={carregando}>
        {!caso ? (
          <div className="space-y-3 text-sm">
            <p className="border border-linha-aviso bg-aviso-bg px-3 py-2 text-tx">
              <b className="text-risco-hoje-tx">Processo não cadastrado.</b> O Lúmen só conhece o número e o tribunal deduzido dele. Não há partes, fase nem tarefas.
            </p>
            <p className="text-xs font-bold uppercase tracking-wide text-tx-2">Publicações deste número na fila</p>
            <ul className="list-none m-0 p-0 divide-y divide-regua border-y border-regua">
              {group.items.map((i) => (
                <li key={i.id} className="py-2">
                  <p className="text-xs text-tx-2">
                    {dataDeBrasilia(i.publishedAt)} · {i.source}
                  </p>
                  <p className="text-sm text-tx break-words">{i.content.replace(/\s+/g, " ").slice(0, 220)}…</p>
                </li>
              ))}
            </ul>
            <button type="button" onClick={onVincular} className="min-h-11 px-4 text-sm font-semibold bg-acao hover:bg-acao-hover text-acao-tx">
              Vincular a um processo cadastrado
            </button>
          </div>
        ) : carregando && !painel ? (
          <div className="space-y-3" role="status" aria-label="Carregando o processo">
            {[70, 100, 85, 45, 90].map((w, i) => (
              <div key={i} className="h-4 bg-sf-apoio animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : erro ? (
          <div role="alert" className="space-y-2 text-sm">
            <p className="text-risco-vencido-tx font-semibold">{erro}</p>
            <button type="button" onClick={() => { CACHE.delete(caso.id); setErro(null); setPainel(null); setCarregando(true); carregarPainelDoProcesso(caso.id).then((r) => { if (r.painel) { CACHE.set(caso.id, { em: Date.now(), painel: r.painel }); setPainel(r.painel); } else setErro(r.error ?? "Não foi possível carregar o processo."); }).finally(() => setCarregando(false)); }} className="min-h-11 px-4 font-semibold border border-regua-forte hover:bg-sf-apoio">
              Tentar de novo
            </button>
          </div>
        ) : painel ? (
          aba === "geral" ? (
            <dl className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
              <dt className={dt}>Cliente</dt>
              <dd className={dd}>{painel.cliente ?? "—"}{painel.papelDoCliente ? ` (${painel.papelDoCliente})` : ""}</dd>
              <dt className={dt}>Parte adversa</dt>
              <dd className={dd}>{painel.parteAdversa ?? "—"}</dd>
              <dt className={dt}>Natureza</dt>
              <dd className={dd}>{[NATUREZA[painel.natureza] ?? painel.natureza, painel.area, painel.acao].filter(Boolean).join(" · ")}</dd>
              <dt className={dt}>Tribunal</dt>
              <dd className={dd}>{[painel.tribunalSigla, painel.tribunalSistema, painel.instancia ? INSTANCIA[painel.instancia] ?? painel.instancia : null].filter(Boolean).join(" · ") || "—"}</dd>
              <dt className={dt}>Responsável</dt>
              <dd className={dd}>{painel.responsavel ?? "Sem responsável"}</dd>
              <dt className={dt}>Próximo prazo</dt>
              <dd className={dd}>{painel.proximoPrazo ? `${formatCalendarDate(painel.proximoPrazo.data)}${painel.proximoPrazo.hora ? ` às ${painel.proximoPrazo.hora}` : ""} · ${painel.proximoPrazo.titulo}` : "Nenhum prazo aberto"}</dd>
              <dt className={dt}>Tarefas abertas</dt>
              <dd className={dd}>{painel.tarefasAbertas}</dd>
            </dl>
          ) : aba === "publicacoes" ? (
            painel.publicacoes.length === 0 ? (
              <p className="text-sm text-tx-2">Nenhuma publicação deste processo.</p>
            ) : (
              <ul className="list-none m-0 p-0 divide-y divide-regua">
                {painel.publicacoes.map((p) => (
                  <li key={p.id} className="py-2.5">
                    <p className="text-xs text-tx-2">
                      {dataDeBrasilia(p.data)} · {p.fonte} · {p.tipo === "PUBLICACAO" ? "Publicação" : "Movimentação"}
                    </p>
                    <p className="text-sm text-tx break-words">{p.trecho}</p>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="space-y-4 text-sm">
              <section aria-label="Tarefas abertas">
                <h3 className="text-xs font-bold uppercase tracking-wide text-tx-2 mb-1.5">Tarefas abertas</h3>
                {painel.tarefas.length === 0 ? (
                  <p className="text-tx-2">Nenhuma tarefa aberta.</p>
                ) : (
                  <ul className="list-none m-0 p-0 divide-y divide-regua">
                    {painel.tarefas.map((t) => (
                      <li key={t.id} className="py-2">
                        <p className="text-tx break-words">{t.titulo}</p>
                        <p className="text-xs text-tx-2">
                          {t.tipo} · {formatCalendarDate(t.data)} · {t.responsavel ?? "sem responsável"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section aria-label="Comentários recentes">
                <h3 className="text-xs font-bold uppercase tracking-wide text-tx-2 mb-1.5">Comentários recentes</h3>
                {painel.comentarios.length === 0 ? (
                  <p className="text-tx-2">Nenhum comentário.</p>
                ) : (
                  <ul className="list-none m-0 p-0 divide-y divide-regua">
                    {painel.comentarios.map((c) => (
                      <li key={c.id} className="py-2">
                        <p className="text-xs text-tx-2">
                          {c.autor} · {dataDeBrasilia(c.data)}
                        </p>
                        <p className="text-tx break-words">{c.texto}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )
        ) : null}
      </div>

      {caso && (
        <div className="shrink-0 flex flex-wrap items-center gap-2 border-t border-regua-forte px-4 py-3">
          <TabLink href={`/processos/${caso.id}`} label={caso.title} className="min-h-11 inline-flex items-center gap-1.5 px-4 text-sm font-semibold border border-regua-forte text-tx hover:bg-sf-apoio">
            <FileText size={15} aria-hidden="true" /> Abrir processo completo
          </TabLink>
          {painel?.tribunalLink && (
            <a href={painel.tribunalLink} target="_blank" rel="noopener noreferrer" className="min-h-11 inline-flex items-center gap-1.5 px-4 text-sm font-semibold border border-regua-forte text-tx hover:bg-sf-apoio">
              <ExternalLink size={15} aria-hidden="true" /> Abrir no tribunal
            </a>
          )}
        </div>
      )}
    </aside>
  );
}
