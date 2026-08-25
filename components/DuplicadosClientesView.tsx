"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, FolderInput, AlertTriangle, CheckCircle2, Merge } from "lucide-react";
import {
  simularUnificacaoClientes,
  confirmarUnificacaoClientes,
  type GrupoClientesDuplicados,
  type ClienteCandidato,
  type SimulacaoUnificacao,
  type ResultadoUnificacao,
} from "@/lib/actions/clientDuplicates";
import ModalShell from "@/components/ModalShell";

function dataBR(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

// Resumo de atividade de um cadastro — mesma régua usada tanto no cartão de seleção quanto na
// simulação, pra "qual dos dois tem mais coisa" ser óbvio de bater o olho, sem precisar abrir
// nada. Ajuda a escolher o canônico: normalmente vale manter o que tem mais história.
function resumoAtividade(c: ClienteCandidato): string {
  const partes: string[] = [];
  if (c.processos) partes.push(`${c.processos} processo(s)`);
  if (c.atendimentos) partes.push(`${c.atendimentos} atendimento(s)`);
  if (c.recebiveis) partes.push(`${c.recebiveis} lançamento(s)`);
  if (c.temAssessoria) partes.push(c.temPastaDrive ? "Assessoria com pasta no Drive" : "Assessoria sem pasta");
  return partes.length > 0 ? partes.join(" · ") : "Sem nenhuma atividade registrada";
}

// Grupo já resolvido antes (grupo.pendente === false): o cadastro duplicado não foi apagado
// porque ainda tem uma Assessoria ENCERRADA presa nele (histórico), mas não sobra mais que um
// cadastro "vivo" — não há mais nada a fazer aqui. Cartão só-leitura, sem radio nem botão de
// unificar, pra não pedir ação de novo pra sempre sobre algo que já foi resolvido.
function GrupoCardHistorico({ grupo }: { grupo: GrupoClientesDuplicados }) {
  return (
    <div className="border-t-2 border-regua-forte overflow-hidden bg-sf opacity-70">
      <div className="px-4 py-3 flex items-center gap-2">
        <CheckCircle2 size={15} className="text-concluido shrink-0" />
        <span className="font-semibold text-tx text-sm">{grupo.clientes[0].nome}</span>
        <span className="text-xs text-tx-3">— já unificado, mantido como histórico</span>
      </div>
      <div className="px-4 pb-3 flex flex-wrap gap-x-4 gap-y-1">
        {grupo.clientes.map((c) => (
          <span key={c.id} className="text-[11px] text-tx-3">
            {c.nome} <span className="text-tx-3/70">({c.assessoriaStatus === "ENCERRADA" ? "Assessoria encerrada" : "cadastrado " + dataBR(c.criadoEm)})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function GrupoCard({ grupo }: { grupo: GrupoClientesDuplicados }) {
  const router = useRouter();
  const [canonicoId, setCanonicoId] = useState(grupo.clientes[0].id);
  const [alvoId, setAlvoId] = useState<string | null>(null);
  const [simulacao, setSimulacao] = useState<SimulacaoUnificacao | null>(null);
  const [resultado, setResultado] = useState<ResultadoUnificacao | null>(null);
  const [erro, setErro] = useState("");
  const [conferindo, startConferir] = useTransition();
  const [aplicando, startAplicar] = useTransition();

  const canonico = grupo.clientes.find((c) => c.id === canonicoId)!;
  const outros = grupo.clientes.filter((c) => c.id !== canonicoId);

  function abrirConferencia(id: string) {
    setAlvoId(id);
    setErro("");
    setResultado(null);
    setSimulacao(null);
    startConferir(async () => {
      const r = await simularUnificacaoClientes(canonicoId, id);
      if (r.error) setErro(r.error);
      else setSimulacao(r.simulacao ?? null);
    });
  }

  function confirmar() {
    if (!alvoId || !simulacao) return;
    const totalItens = simulacao.moveria.reduce((s, i) => s + i.quantidade, 0);
    const confirmado = window.confirm(
      `Isso vai:\n\n` +
        `• Mover ${totalItens} item(ns) de "${simulacao.duplicata.nome}" para "${simulacao.canonico.nome}".\n` +
        `• Marcar a Assessoria duplicada (se houver) como ENCERRADA — preservada como histórico, nunca apagada.\n` +
        `• Mesclar as pastas do Drive, quando as duas tiverem uma.\n\n` +
        `NADA É APAGADO DE VEZ. O que sai do lugar antigo vai para a Lixeira do Drive, reversível por 30 dias. ` +
        `Nenhum dos dois cadastros de cliente é excluído. Continuar?`
    );
    if (!confirmado) return;
    setErro("");
    startAplicar(async () => {
      const r = await confirmarUnificacaoClientes(canonicoId, alvoId);
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
    setSimulacao(null);
    setResultado(null);
    setErro("");
  }

  const alvo = alvoId ? grupo.clientes.find((c) => c.id === alvoId) : null;

  return (
    <div className="border-t-2 border-regua-forte overflow-hidden bg-sf">
      <div className="px-4 py-3 border-b-2 border-regua-forte bg-sf-apoio flex items-center gap-2">
        <Users size={15} className="text-tx-2" />
        <span className="font-semibold text-tx text-sm">{grupo.clientes[0].nome}</span>
        <span className="text-xs text-tx-3">— {grupo.clientes.length} cadastros parecidos</span>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-xs text-tx-2">
          Escolha qual cadastro é o <strong className="text-tx">correto (canônico)</strong> — os demais serão unificados
          dentro dele.
        </p>

        <div className="space-y-2">
          {grupo.clientes.map((c) => (
            <label
              key={c.id}
              className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors ${
                c.id === canonicoId ? "border-acao bg-acao-bg" : "border-regua hover:bg-sf-apoio"
              }`}
            >
              <input
                type="radio"
                name={`canonico-${grupo.chave}`}
                checked={c.id === canonicoId}
                onChange={() => {
                  setCanonicoId(c.id);
                  fechar();
                }}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-tx">{c.nome}</span>
                  {c.id === canonicoId && <span className="text-[10px] font-bold text-acao uppercase tracking-wide">Manter este</span>}
                </div>
                <p className="text-[11px] text-tx-3">Cadastrado em {dataBR(c.criadoEm)}</p>
                <p className="text-[11px] text-tx-2">{resumoAtividade(c)}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {outros.map((c) => (
            <button
              key={c.id}
              onClick={() => abrirConferencia(c.id)}
              disabled={conferindo}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-acao hover:bg-acao-hover text-acao-tx px-3 py-2 disabled:opacity-50"
            >
              <Merge size={13} /> Unificar &ldquo;{c.nome}&rdquo; em &ldquo;{canonico.nome}&rdquo;
            </button>
          ))}
        </div>
      </div>

      {alvo && (
        <ModalShell size="medio" title="Unificar cadastros" subtitle={`"${alvo.nome}" → "${canonico.nome}"`} onClose={fechar}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {conferindo && <p className="text-sm text-tx-2">Conferindo…</p>}
            {erro && <p className="text-sm text-urgente bg-urgente-bg rounded-md px-3 py-2">{erro}</p>}

            {!resultado && simulacao && (
              <>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-tx-2">Isto será movido para &ldquo;{simulacao.canonico.nome}&rdquo;</p>
                  {simulacao.moveria.length === 0 ? (
                    <p className="text-sm text-tx-3">Nada — &ldquo;{simulacao.duplicata.nome}&rdquo; não tem nenhum registro vinculado.</p>
                  ) : (
                    <ul className="text-sm text-tx divide-y divide-regua border border-regua overflow-hidden">
                      {simulacao.moveria.map((i) => (
                        <li key={i.rotulo} className="flex justify-between px-3 py-1.5">
                          <span>{i.rotulo}</span>
                          <span className="font-semibold tabular-nums">{i.quantidade}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {simulacao.avisos.map((a, i) => (
                  <p key={i} className="text-xs text-tx-2 bg-marca-bg border-l-[3px] border-marca px-3 py-2 flex gap-2">
                    <AlertTriangle size={14} className="text-marca-tx shrink-0 mt-0.5" /> {a}
                  </p>
                ))}

                {simulacao.conflitosPastaDrive && simulacao.conflitosPastaDrive.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-urgente">
                      {simulacao.conflitosPastaDrive.length} conflito(s) na pasta do Drive — não serão mexidos
                    </p>
                    <ul className="text-xs text-urgente bg-urgente-bg border border-urgente/20 rounded-md divide-y divide-urgente/20">
                      {simulacao.conflitosPastaDrive.map((c, i) => (
                        <li key={i} className="px-3 py-1.5">
                          <span className="font-mono">{c.caminho}</span> — {c.motivo}
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-tx-3">
                      Confira essas pastas direto no Drive e mescle manualmente o que fizer sentido antes (ou depois) de
                      confirmar — a unificação segue em frente sem elas, elas só não serão tocadas automaticamente.
                    </p>
                  </div>
                )}

                {simulacao.conflitosPastaDrive === null && (
                  <p className="text-[11px] text-tx-3">Nenhuma pasta física envolvida nesta unificação, ou só um dos dois lados tem pasta.</p>
                )}
              </>
            )}

            {resultado && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-concluido flex items-center gap-1.5">
                  <CheckCircle2 size={16} /> Unificação concluída
                </p>
                <ul className="text-sm text-tx divide-y divide-regua border border-regua overflow-hidden">
                  {resultado.movidos.length === 0 ? (
                    <li className="px-3 py-1.5 text-tx-3">Nada precisou ser movido.</li>
                  ) : (
                    resultado.movidos.map((i) => (
                      <li key={i.rotulo} className="flex justify-between px-3 py-1.5">
                        <span>{i.rotulo}</span>
                        <span className="font-semibold tabular-nums">{i.quantidade}</span>
                      </li>
                    ))
                  )}
                </ul>
                {resultado.pastaDuplicataEsvaziada === true && (
                  <p className="text-xs text-concluido">A pasta duplicada no Drive ficou vazia e foi enviada à Lixeira (reversível).</p>
                )}
                {resultado.pastaDuplicataEsvaziada === false && (
                  <p className="text-xs text-tx-2">A pasta duplicada no Drive ainda tem conteúdo em conflito — não foi enviada à Lixeira.</p>
                )}
                {resultado.avisos.map((a, i) => (
                  <p key={i} className="text-xs text-tx-2 bg-marca-bg border-l-[3px] border-marca px-3 py-2">
                    {a}
                  </p>
                ))}
                {resultado.conflitosPastaDrive.length > 0 && (
                  <p className="text-xs text-urgente bg-urgente-bg rounded-md px-3 py-2">
                    {resultado.conflitosPastaDrive.length} item(ns) do Drive ficaram sem mexer por conflito de nome — confira
                    e mescle manualmente.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-regua p-4 flex gap-2">
            {!resultado ? (
              <button
                onClick={confirmar}
                disabled={!simulacao || aplicando}
                className="inline-flex items-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2.5 disabled:opacity-50"
              >
                <FolderInput size={15} /> {aplicando ? "Unificando…" : "Confirmar unificação"}
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

export default function DuplicadosClientesView({ grupos }: { grupos: GrupoClientesDuplicados[] }) {
  if (grupos.length === 0) {
    return (
      <div className="border-t-2 border-regua-forte bg-sf p-6 text-center">
        <CheckCircle2 size={22} className="text-concluido mx-auto mb-2" />
        <p className="text-sm text-tx-2">Nenhum cadastro de cliente parecido com outro foi encontrado.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {grupos.map((g) => (g.pendente ? <GrupoCard key={g.chave} grupo={g} /> : <GrupoCardHistorico key={g.chave} grupo={g} />))}
    </div>
  );
}
