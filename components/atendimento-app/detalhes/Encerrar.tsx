"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Ban, Check, Copy, ExternalLink, Undo2 } from "lucide-react";
import { situacaoDaRecusa, enderecoDaCarta, montarCartaDeRecusa } from "@/lib/recusaDoLead";
import { recusarLead, marcarCartaEnviada, reverterRecusa } from "@/lib/actions/recusaDoLead";
import { definirArquivamento } from "@/lib/actions/detalhesDoAtendimento";
import { nomeDaLinha } from "@/lib/rotulosDaEspera";
import { Campo, Gaveta, cx, useRodar } from "./base";
import type { PropsDosDetalhes } from "./tipos";

// ENCERRAR: recusar com motivo (o fluxo do site, com a carta) e arquivar. Quem pode recusar é a mesma regra do
// site (quem vê o atendimento); DESFAZER a recusa é do nível total, como na fila de recusados. A carta NUNCA
// sai sozinha: fica pronta, com o link para copiar e o carimbo "já mandei". Arquivar pede confirmação, não
// apaga nada, e desarquivar volta a situação de antes.
export default function Encerrar({ p, pedido, aoConsumirPedido }: { p: PropsDosDetalhes; pedido: boolean; aoConsumirPedido: () => void }) {
  const c = p.conversa;
  const { rodar, pendente } = useRodar();
  const [recusando, setRecusando] = useState(false);
  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [motivoId, setMotivoId] = useState("");
  const [motivoLivre, setMotivoLivre] = useState("");
  const [observacao, setObservacao] = useState("");
  const [revisita, setRevisita] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [gerada, setGerada] = useState<{ token: string } | null>(null);
  const [arquivando, setArquivando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const podeRecusar = !p.recusa && !["CONVERTIDO", "RECUSADO"].includes(c.status);

  function abrirRecusa() {
    setPasso(1);
    setMotivoId("");
    setMotivoLivre("");
    setObservacao("");
    setRevisita("");
    setErro(null);
    setGerada(null);
    setRecusando(true);
  }

  // A proposta da Ana (bloco Triagem) pede a recusa: a gaveta abre uma vez e o pedido é consumido (fechar e
  // reabrir o bloco não a abre de novo).
  useEffect(() => {
    if (!pedido) return;
    if (podeRecusar) abrirRecusa();
    aoConsumirPedido();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido]);

  const motivoEscolhido = p.motivosDeRecusa.find((m) => m.id === motivoId)?.rotulo ?? motivoLivre.replace(/\s+/g, " ").trim();
  const carta = montarCartaDeRecusa({ nome: nomeDaLinha(c.clientName, p.telefone), escritorio: p.nomeDoEscritorio, motivo: motivoEscolhido || "…", registradaEm: new Date() });

  function continuar() {
    setErro(null);
    if (!motivoEscolhido) return setErro("Escolha ou escreva o motivo da recusa.");
    setPasso(2);
  }

  async function recusar() {
    setErro(null);
    let recusaId: string | undefined;
    const r = await rodar({
      fazer: async () => {
        const x = await recusarLead(c.id, { motivoId: motivoId || undefined, motivoLivre, observacao, revisitaEm: revisita });
        if (x.erro) return { error: x.erro };
        recusaId = x.recusaId;
        setGerada({ token: x.token ?? "" });
        return {};
      },
      ok: "Lead recusado. A carta está pronta e não sai sozinha.",
      // Desfazer é do nível total (a mesma regra da fila de recusados). Quem só vê os seus não tem o botão.
      desfazer: p.veTudo ? async () => (recusaId ? reverterRecusa(recusaId).then((x) => ({ error: x.erro })) : { error: "Não foi possível desfazer." }) : undefined,
    });
    if (r.ok) setPasso(3);
    else setErro(r.error ?? null);
  }

  async function copiar(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
      setErro("Não deu para copiar. Toque no campo do link e copie à mão.");
    }
  }

  const linkDaCarta = (token: string) => `${p.enderecoDoSite}${enderecoDaCarta(token)}`;
  const arquivado = c.status === "ARQUIVADO";
  const podeArquivar = ["NOVO", "EM_TRIAGEM", "CONVERTIDO"].includes(c.status);

  return (
    <div className="space-y-4">
      {p.recusa && (
        <div className={cx.painel} data-recusa="">
          <p className={cx.etiqueta}>Lead recusado</p>
          <p className="mt-1 break-words text-corpo font-semibold text-tx">{p.recusa.motivoTexto}</p>
          <p className="mt-0.5 text-corpo text-atd-previa">
            {situacaoDaRecusa({
              estado: p.recusa.estado,
              enviadaEm: p.recusa.enviadaEm ? new Date(p.recusa.enviadaEm) : null,
              abertaEm: p.recusa.abertaEm ? new Date(p.recusa.abertaEm) : null,
              revisitaEm: p.recusa.revisitaEm ? new Date(p.recusa.revisitaEm) : null,
            })}
            {p.recusa.aberturas > 1 ? ` · ${p.recusa.aberturas} aberturas` : ""}
            {p.recusa.porAgente ? " · recusado pelo atendente" : p.recusa.recusadaPor ? ` · por ${p.recusa.recusadaPor}` : ""}
          </p>
          {p.recusa.observacao && <p className="mt-1 whitespace-pre-wrap break-words text-corpo italic text-atd-previa">{p.recusa.observacao}</p>}

          {p.recusa.estado === "EM_ANALISE" && (
            <div className="mt-3 space-y-2">
              <label className={cx.rotulo} htmlFor="link-da-carta">
                Link da carta (para você mandar)
              </label>
              <input id="link-da-carta" readOnly value={linkDaCarta(p.recusa.token)} onFocus={(e) => e.currentTarget.select()} className={`${cx.campo} text-corpo`} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className={cx.secundario} onClick={() => copiar(linkDaCarta(p.recusa!.token))}>
                  {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copiado ? "Copiado" : "Copiar link"}
                </button>
                <a href={linkDaCarta(p.recusa.token)} target="_blank" rel="noopener noreferrer" className={cx.secundario}>
                  <ExternalLink size={16} aria-hidden="true" /> Ver a carta <span className="sr-only">(abre em outra aba)</span>
                </a>
              </div>
              {!p.recusa.enviadaEm && (
                <button
                  type="button"
                  className={cx.secundario}
                  disabled={pendente}
                  onClick={() => rodar({ fazer: () => marcarCartaEnviada(p.recusa!.id).then((x) => ({ error: x.erro })), ok: "Carta marcada como enviada." })}
                >
                  Já mandei a carta: marcar como enviada
                </button>
              )}
              <p className={cx.dica}>A carta não sai sozinha. Mande o link pelo canal que o lead já usa e marque aqui depois.</p>
              {p.veTudo ? (
                <button
                  type="button"
                  className={cx.secundario}
                  disabled={pendente}
                  onClick={() => rodar({ fazer: () => reverterRecusa(p.recusa!.id).then((x) => ({ error: x.erro })), ok: "Recusa desfeita. O lead voltou para a triagem." })}
                >
                  <Undo2 size={16} aria-hidden="true" /> Desfazer a recusa
                </button>
              ) : (
                <p className={cx.dica}>Para desfazer a recusa, peça à recepção ou a um sócio administrador.</p>
              )}
            </div>
          )}
        </div>
      )}

      {podeRecusar && (
        <div>
          <button type="button" className={cx.secundario} onClick={abrirRecusa}>
            <Ban size={16} aria-hidden="true" /> Recusar com motivo…
          </button>
          <p className={`mt-1 ${cx.dica}`}>Recusar não descarta: o lead sai das listas ativas e vai para a fila de recusados. A carta de recusa fica pronta e nunca sai sozinha.</p>
        </div>
      )}
      {!p.recusa && c.status === "CONVERTIDO" && <p className={cx.dica}>Este atendimento já virou processo ou caso; não há o que recusar.</p>}

      {arquivado && !p.recusa ? (
        <div className={cx.painel}>
          <p className="text-corpo font-semibold text-tx">Esta conversa está arquivada.</p>
          <p className={`mt-0.5 ${cx.dica}`}>Ela está em Triagem, no filtro “Arquivado”. Nada foi apagado.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={cx.primario}
              disabled={pendente}
              onClick={() =>
                rodar({
                  fazer: () => definirArquivamento(c.id, false),
                  ok: "Conversa desarquivada.",
                  desfazer: () => definirArquivamento(c.id, true),
                })
              }
            >
              <ArchiveRestore size={16} aria-hidden="true" /> Desarquivar
            </button>
            <Link href="/atendimento-app" className={cx.secundario}>
              Voltar às conversas
            </Link>
          </div>
        </div>
      ) : arquivado ? (
        <p className={cx.dica}>Arquivada junto com a recusa. Quem analisa os recusados é a recepção ou um sócio administrador.</p>
      ) : podeArquivar ? (
        <div>
          <button type="button" className={cx.secundario} onClick={() => setArquivando(true)}>
            <Archive size={16} aria-hidden="true" /> Arquivar conversa
          </button>
          <p className={`mt-1 ${cx.dica}`}>Sai das listas de trabalho. Nada é apagado e dá para desarquivar.</p>
        </div>
      ) : null}

      <Gaveta
        aberta={arquivando}
        aoFechar={() => setArquivando(false)}
        titulo="Arquivar esta conversa?"
        rodape={
          <>
            <button type="button" className={cx.secundario} onClick={() => setArquivando(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className={`${cx.primario} flex-1`}
              disabled={pendente}
              onClick={async () => {
                const antes = c.status;
                const r = await rodar({
                  fazer: () => definirArquivamento(c.id, true),
                  ok: "Conversa arquivada.",
                  desfazer: () => definirArquivamento(c.id, false, antes),
                });
                if (r.ok) setArquivando(false);
                else setErro(r.error ?? null);
              }}
            >
              {pendente ? "Arquivando…" : "Arquivar"}
            </button>
          </>
        }
      >
        <p className="text-corpo text-tx">
          <strong>{nomeDaLinha(c.clientName, p.telefone)}</strong> sai da lista de Conversas e fica em Triagem, no filtro “Arquivado”. Nada é apagado: a conversa, os anexos e as anotações continuam aqui, e você pode desarquivar a qualquer momento.
        </p>
        {erro && (
          <p role="alert" className={`mt-2 ${cx.erro}`}>
            {erro}
          </p>
        )}
      </Gaveta>

      <Gaveta
        aberta={recusando}
        aoFechar={() => (pendente ? undefined : setRecusando(false))}
        titulo="Recusar com motivo"
        rodape={
          passo === 1 ? (
            <>
              <button type="button" className={cx.secundario} onClick={() => setRecusando(false)}>
                Cancelar
              </button>
              <button type="button" className={`${cx.primario} flex-1`} onClick={continuar}>
                Continuar
              </button>
            </>
          ) : passo === 2 ? (
            <>
              <button type="button" className={cx.secundario} disabled={pendente} onClick={() => setPasso(1)}>
                Voltar
              </button>
              <button type="button" className={`${cx.primario} flex-1`} disabled={pendente} onClick={recusar}>
                {pendente ? "Recusando…" : "Recusar e gerar a carta"}
              </button>
            </>
          ) : (
            <button type="button" className={`${cx.secundario} flex-1`} onClick={() => setRecusando(false)}>
              Enviar a carta depois
            </button>
          )
        }
      >
        {passo === 1 && (
          <div className="space-y-3">
            <p className="text-corpo text-atd-previa">A recusa fica como prova de que o escritório não assumiu o caso: tem data, autor e motivo. Por isso é um ato à parte, e não só mover o funil para “Perdido”.</p>
            <Campo rotulo="Motivo" erro={erro}>
              {({ id, descricao }) => (
                <select id={id} aria-describedby={descricao} className={cx.campo} value={motivoId} onChange={(e) => setMotivoId(e.target.value)}>
                  <option value="">Escrever um motivo agora…</option>
                  {p.motivosDeRecusa.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.rotulo}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            {!motivoId && (
              <Campo rotulo="O motivo, numa frase" dica="É o que o lead vai ler na carta.">
                {({ id, descricao }) => <input id={id} aria-describedby={descricao} className={cx.campo} value={motivoLivre} maxLength={200} onChange={(e) => setMotivoLivre(e.target.value)} autoComplete="off" />}
              </Campo>
            )}
            <Campo rotulo="Voltar a olhar em (opcional)">{({ id }) => <input id={id} type="date" className={cx.campo} value={revisita} onChange={(e) => setRevisita(e.target.value)} />}</Campo>
            <Campo rotulo="Nota interna (opcional)" dica="O lead não vê.">
              {({ id, descricao }) => <textarea id={id} aria-describedby={descricao} className={`${cx.campo} min-h-20`} rows={2} value={observacao} maxLength={500} onChange={(e) => setObservacao(e.target.value)} />}
            </Campo>
          </div>
        )}

        {passo === 2 && (
          <div className="space-y-3">
            <p className="text-corpo text-tx">
              Motivo: <strong>{motivoEscolhido}</strong>
            </p>
            <ul className="list-disc space-y-1 pl-5 text-corpo text-tx">
              <li>O lead sai das listas ativas e vai para a fila de recusados. Nada é apagado.</li>
              <li>A carta de recusa fica pronta, com um link. Ela não sai sozinha: você decide quando e por onde mandar.</li>
              <li>{p.veTudo ? "Você poderá desfazer a recusa." : "Só a recepção ou um sócio administrador desfaz a recusa depois."}</li>
            </ul>
            <p className={cx.etiqueta}>Carta (prévia)</p>
            <div className="rounded-atd-balao bg-atd-pilula p-3 text-corpo text-atd-previa" data-carta-previa="">
              <p className="font-semibold text-tx">{carta.titulo}</p>
              {carta.paragrafos.map((t) => (
                <p key={t} className="mt-2">
                  {t}
                </p>
              ))}
              {carta.avisos.map((a) => (
                <p key={a.titulo} className="mt-2">
                  <strong className="text-tx">{a.titulo}.</strong> {a.texto}
                </p>
              ))}
              <p className="mt-2">{carta.fecho}</p>
            </div>
            {erro && (
              <p role="alert" className={cx.erro}>
                {erro}
              </p>
            )}
          </div>
        )}

        {passo === 3 && gerada && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-corpo font-bold text-tx">
              <Check size={18} aria-hidden="true" className="text-concluido" /> Recusa registrada
            </p>
            <p className="text-corpo text-tx">Motivo: {motivoEscolhido}. A carta está pronta e ainda não foi enviada.</p>
            <label className={cx.rotulo} htmlFor="link-gerado">
              Link da carta
            </label>
            <input id="link-gerado" readOnly value={linkDaCarta(gerada.token)} onFocus={(e) => e.currentTarget.select()} className={cx.campo} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={cx.primario} onClick={() => copiar(linkDaCarta(gerada.token))}>
                {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copiado ? "Copiado" : "Copiar link"}
              </button>
              <a href={linkDaCarta(gerada.token)} target="_blank" rel="noopener noreferrer" className={cx.secundario}>
                <ExternalLink size={16} aria-hidden="true" /> Ver a carta <span className="sr-only">(abre em outra aba)</span>
              </a>
            </div>
            <p className={cx.dica}>Envio pelo celular chega com o chat. Por enquanto, copie o link e mande pelo canal que o lead já usa.</p>
            {erro && (
              <p role="alert" className={cx.erro}>
                {erro}
              </p>
            )}
          </div>
        )}
      </Gaveta>
    </div>
  );
}
