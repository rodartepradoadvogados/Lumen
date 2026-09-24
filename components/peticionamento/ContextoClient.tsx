"use client";

// A TELA DE CONTEXTO depois dos pedidos do dono de 22/09/2026 (itens 2, 3, 4 e 5 da lista dele).
// O desenho em uma frase: a PARTE DE CIMA é fixa e responde "o que estou fazendo" (natureza +
// matérias + o que estou procurando); o MEIO é a única coisa que rola (os resultados filtrados);
// a BARRA DE BAIXO ("Cliente confirmado… / pular questionário e continuar") fica congelada.
//
// Por que a busca vive no servidor: antes desta entrega a tela recebia 200 processos + 200
// atendimentos + 200 assessorias de uma vez e filtrava no navegador. A lista imensa era o que o
// dono pediu para acabar, e o corte por escritório tem de morar no `where` da consulta — ver
// lib/actions/peticionamento.ts:buscarContextoParaVincular.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  alternarVinculo,
  definirSessaoAvulsa,
  definirMaterias,
  adicionarMateriaDoEscritorio,
  confirmarNatureza,
  buscarContextoParaVincular,
  type CandidatoResolvido,
} from "@/lib/actions/peticionamento";
import type { TipoVinculo } from "@/lib/peticionamentoContexto";
import { NATUREZAS_DE_PROCEDIMENTO, type NaturezaDeProcedimento } from "@/lib/peticionamentoNatureza";
import {
  TIPOS_DE_BUSCA,
  SUBTIPOS_DE_ASSESSORIA,
  MINIMO_DE_CARACTERES,
  LIMITE_DE_RESULTADOS,
  naturezaSugeridaPelaBusca,
  type TipoDeBusca,
  type SubtipoDeAssessoria,
} from "@/lib/peticionamentoBusca";
import { useSaidaDoPeticionamento } from "./SaidaContext";

type Props = {
  sessaoId: string;
  vinculados: CandidatoResolvido[];
  clienteTravado: { id: string; nome: string | null } | null;
  materias: { nome: string; ehDoEscritorio: boolean }[];
  /** TODAS as matérias já marcadas nesta sessão, na ordem — a primeira é a principal. */
  materiasAtuais: string[];
  naturezaProcedimento: string | null;
  naturezaMotivo: string | null;
  naturezaConfirmadaManualmente: boolean;
};

const ROTULO_NATUREZA: Record<NaturezaDeProcedimento, string> = {
  "processo judicial": "Processo judicial",
  "processo administrativo": "Processo administrativo",
  extrajudicial: "Extrajudicial",
  consultivo: "Consultivo",
};

export function ContextoClient({
  sessaoId,
  vinculados,
  clienteTravado,
  materias: materiasIniciais,
  materiasAtuais,
  naturezaProcedimento,
  naturezaMotivo,
  naturezaConfirmadaManualmente,
}: Props) {
  const router = useRouter();
  const { marcarTrabalho } = useSaidaDoPeticionamento();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  // ── ENTRADA DESLIZANDO (pedido do dono, 24/09/2026, item 1) ────────────────────────────────────
  // `?entrando=1`: sinal de uso único que TipoPecaClient.tsx acrescenta só quando ESCOLHER uma
  // categoria empurra para cá — nunca ao reabrir esta etapa pelo rail, por um link direto ou um
  // F5 (o parâmetro é lido e removido da URL assim que a tela monta, e nunca reaparece depois).
  // Lido de window.location, não de useSearchParams: useSearchParams exigiria envolver esta
  // árvore num <Suspense> na própria page.tsx (fora de alcance aqui) — mesma razão já registrada
  // em components/SaveCaseButton.tsx.
  const [entrando, setEntrando] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("entrando") !== "1") return;
    setEntrando(true);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // ── NATUREZA (item 4) ───────────────────────────────────────────────────────────────────────
  const [naturezaLocal, setNaturezaLocal] = useState<string | null>(naturezaProcedimento);
  const [corrigindoNatureza, setCorrigindoNatureza] = useState(false);
  useEffect(() => setNaturezaLocal(naturezaProcedimento), [naturezaProcedimento]);

  const corrigirNatureza = useCallback(
    (valor: NaturezaDeProcedimento) => {
      setNaturezaLocal(valor);
      setCorrigindoNatureza(false);
      marcarTrabalho();
      iniciar(async () => {
        await confirmarNatureza(sessaoId, valor);
        router.refresh();
      });
    },
    [marcarTrabalho, router, sessaoId],
  );

  // ── MATÉRIAS (item 2) ───────────────────────────────────────────────────────────────────────
  const [materias, setMaterias] = useState(materiasIniciais);
  const [marcadas, setMarcadas] = useState<string[]>(materiasAtuais);
  const [adicionandoMateria, setAdicionandoMateria] = useState(false);
  const [novaMateria, setNovaMateria] = useState("");

  function gravarMaterias(nomes: string[], catalogo = materias) {
    setMarcadas(nomes);
    marcarTrabalho();
    iniciar(async () => {
      // A ordem da LISTA é a ordem de marcação, e a primeira é a principal — o contrato de schema
      // (PeticionamentoSessao.materiasNomes) manda gravar as duas coisas juntas, e quem faz isso
      // numa transação só é a própria ação.
      await definirMaterias(
        sessaoId,
        nomes.map((nome) => ({ nome, ehDoEscritorio: catalogo.find((m) => m.nome === nome)?.ehDoEscritorio ?? false })),
      );
    });
  }

  function alternarMateria(nome: string) {
    setErro(null);
    gravarMaterias(marcadas.includes(nome) ? marcadas.filter((n) => n !== nome) : [...marcadas, nome]);
  }

  async function confirmarNovaMateria() {
    setErro(null);
    const resultado = await adicionarMateriaDoEscritorio(novaMateria);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    const catalogo = [...materias, { nome: resultado.nome, ehDoEscritorio: true }];
    setMaterias(catalogo);
    gravarMaterias([...marcadas, resultado.nome], catalogo);
    setAdicionandoMateria(false);
    setNovaMateria("");
  }

  // ── SESSÃO VINCULADA OU AVULSA ──────────────────────────────────────────────────────────────
  const [avulsa, setAvulsa] = useState(false);

  function irParaAvulsa() {
    setAvulsa(true);
    marcarTrabalho();
    iniciar(async () => {
      await definirSessaoAvulsa(sessaoId);
      router.refresh();
    });
  }

  // ── BUSCA (item 3) ──────────────────────────────────────────────────────────────────────────
  const [tipo, setTipo] = useState<TipoDeBusca>("processo-judicial");
  const [subtipo, setSubtipo] = useState<SubtipoDeAssessoria>("assessoria");
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<CandidatoResolvido[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [filtradoPorTermo, setFiltradoPorTermo] = useState(false);
  const [buscando, setBuscando] = useState(false);

  // Cada busca carrega um número de sequência: uma resposta que chega ATRASADA, depois de o
  // advogado já ter digitado outra letra, não pode sobrescrever o resultado mais novo na tela.
  const sequencia = useRef(0);

  const buscar = useCallback(
    async (tipoAtual: TipoDeBusca, subtipoAtual: SubtipoDeAssessoria, termoAtual: string) => {
      const minha = ++sequencia.current;
      setBuscando(true);
      const resposta = await buscarContextoParaVincular(sessaoId, tipoAtual, tipoAtual === "assessoria" ? subtipoAtual : null, termoAtual);
      if (minha !== sequencia.current) return; // chegou tarde: uma busca mais nova já mandou.
      setBuscando(false);
      if ("error" in resposta) {
        setErro(resposta.error);
        setResultados([]);
        return;
      }
      setResultados(resposta.resultados);
      setTruncado(resposta.truncado);
      setFiltradoPorTermo(resposta.filtradoPorTermo);
    },
    [sessaoId],
  );

  // Espera o advogado parar de digitar antes de consultar o banco — uma consulta por tecla
  // pressionada é consulta jogada fora, e a resposta de uma tecla antiga chegando depois seria
  // resultado piscando na tela.
  useEffect(() => {
    if (avulsa) return;
    const id = setTimeout(() => void buscar(tipo, subtipo, termo), 220);
    return () => clearTimeout(id);
  }, [avulsa, tipo, subtipo, termo, buscar, vinculados]);

  function alternar(tipoVinculo: TipoVinculo, id: string, marcar: boolean) {
    setErro(null);
    // Estado otimista: o checkbox é controlado pelo que o servidor já confirmou, e entre o clique
    // e a resposta a linha continuaria desmarcada, piscando.
    setResultados((atual) => atual.map((r) => (r.id === id ? { ...r, selecionado: marcar } : r)));
    marcarTrabalho();
    iniciar(async () => {
      const resultado = await alternarVinculo(sessaoId, tipoVinculo, id, marcar);
      if ("error" in resultado) {
        setErro(resultado.error);
        setResultados((atual) => atual.map((r) => (r.id === id ? { ...r, selecionado: !marcar } : r)));
        return;
      }
      // Recarrega do servidor: a trava de cliente pode ter mudado quem fica bloqueado em TODAS as
      // outras linhas, e recalcular isso no cliente duplicaria a regra de sigilo.
      router.refresh();
      void buscar(tipo, subtipo, termo);
    });
  }

  const opcaoDeTipo = TIPOS_DE_BUSCA.find((t) => t.chave === tipo)!;
  const opcaoDeSubtipo = SUBTIPOS_DE_ASSESSORIA.find((s) => s.chave === subtipo)!;
  const explicacaoDoFiltro = tipo === "assessoria" ? opcaoDeSubtipo.explicacao : opcaoDeTipo.explicacao;
  const sugestaoDeNatureza = naturezaSugeridaPelaBusca(tipo, tipo === "assessoria" ? subtipo : null);

  return (
    <div className={`ctx-page${entrando ? " passo-entrando" : ""}`}>
      <div className="ctx-topo">
        {/* O CABEÇALHO É CURTO DE PROPÓSITO: esta parte da tela é FIXA (item 5), então cada
            linha que ela ocupa é uma linha a menos de resultado visível. O parágrafo de quatro
            linhas que morava aqui comia metade da área de resultados num notebook — a regra do
            mesmo cliente continua dita onde ela importa de verdade: na tarja do cliente travado e
            no motivo de cada item bloqueado. */}
        <div className="page-head ctx-cabecalho">
          <div>
            <h1>Vincular contexto</h1>
            <p style={{ fontSize: 12.5 }}>
              Uma ou mais matérias e, se quiser, itens já existentes no Lúmen — <strong style={{ color: "var(--tx-0)" }}>todos do mesmo cliente</strong>, por
              sigilo profissional.
            </p>
          </div>
        </div>

        <div className="ctx-topo-corpo">
          {erro && <div className="callout callout-danger">{erro}</div>}

          <div className="ctx-topo-grade">
            {/* NATUREZA — espec. §8: DEDUZIDA do vínculo, nunca perguntada do zero, e a dedução
                nunca é silenciosa. Subiu para o topo a pedido do dono (item 4), ao lado da caixa
                de seleção da busca: são perguntas VIZINHAS ("o que este vínculo É" × "o que estou
                procurando"), e vê-las juntas é o que impede responder duas vezes a mesma coisa. */}
            <section className="ctx-cartao">
              <h2>Natureza do procedimento</h2>
              {naturezaLocal ? (
                <div className="ctx-natureza-linha">
                  <span className="chip">{ROTULO_NATUREZA[naturezaLocal as NaturezaDeProcedimento] ?? naturezaLocal}</span>
                  <button className="btn btn-ghost btn-sm" disabled={pendente} onClick={() => setCorrigindoNatureza((v) => !v)}>
                    {corrigindoNatureza ? "Fechar" : "Corrigir"}
                  </button>
                </div>
              ) : (
                <p className="ctx-nota">Ainda não há vínculo para deduzir a natureza. Marque um item na busca abaixo — ou escolha aqui, se esta peça não vai ser vinculada.</p>
              )}

              {naturezaMotivo && (
                <p className="ctx-nota">
                  {naturezaConfirmadaManualmente ? (
                    "Confirmado manualmente pelo advogado."
                  ) : (
                    <>
                      Deduzido pelo Peticionamento: <strong style={{ color: "var(--tx-0)" }}>{naturezaMotivo}</strong>
                    </>
                  )}
                </p>
              )}

              {/* A SUGESTÃO DE UM CLIQUE: sem vínculo não há o que deduzir, e em vez de perguntar
                  de novo a mesma coisa, a tela reaproveita a resposta que ele já deu na caixa de
                  seleção ao lado. Nunca grava sozinha — o clique é que grava, como confirmação
                  manual, que é a verdade do que aconteceu. */}
              {!naturezaLocal && sugestaoDeNatureza && (
                <button className="btn btn-ghost btn-sm" disabled={pendente} onClick={() => corrigirNatureza(sugestaoDeNatureza)} style={{ marginTop: 8 }}>
                  Usar “{ROTULO_NATUREZA[sugestaoDeNatureza]}”, conforme o que estou procurando
                </button>
              )}

              {(corrigindoNatureza || !naturezaLocal) && (
                <div className="segmented" style={{ marginTop: 10, flexWrap: "wrap" }}>
                  {NATUREZAS_DE_PROCEDIMENTO.map((n) => (
                    <button key={n} className={naturezaLocal === n ? "active" : ""} disabled={pendente} onClick={() => corrigirNatureza(n)}>
                      {ROTULO_NATUREZA[n]}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="ctx-cartao">
              <h2>
                Matéria <span className="quiet" style={{ fontWeight: 400 }}>— uma ou mais; a primeira marcada é a principal</span>
              </h2>
              <div className="matter-grid">
                {materias.map((m) => {
                  const posicao = marcadas.indexOf(m.nome);
                  return (
                    <button key={m.nome} className={`matter-chip${posicao >= 0 ? " selected" : ""}`} onClick={() => alternarMateria(m.nome)} aria-pressed={posicao >= 0}>
                      {posicao === 0 && (
                        <span className="mono quiet" style={{ marginRight: 6 }}>
                          principal
                        </span>
                      )}
                      {m.nome}
                      {m.ehDoEscritorio && <span className="tag-local">escritório</span>}
                    </button>
                  );
                })}
                {!adicionandoMateria && (
                  <button className="matter-chip add-matter" onClick={() => setAdicionandoMateria(true)}>
                    + Adicionar matéria
                  </button>
                )}
                {adicionandoMateria && (
                  <div className="matter-add-row">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Nome da nova matéria, ex.: Direito Desportivo"
                      value={novaMateria}
                      onChange={(e) => setNovaMateria(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && confirmarNovaMateria()}
                    />
                    <button className="btn btn-primary btn-sm" onClick={confirmarNovaMateria}>
                      Adicionar
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setAdicionandoMateria(false)}>
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
              <p className="ctx-nota">
                {marcadas.length > 1
                  ? `${marcadas.length} matérias marcadas — todas vão ao agente, e a primeira (${marcadas[0]}) define a estrutura da peça.`
                  : "Matéria marcada com a etiqueta “escritório” vale só aqui — não vira opção padrão do Lúmen para os demais escritórios."}
              </p>
            </section>
          </div>

          <div className="ctx-filtro">
            <div className="ctx-filtro-linha">
              <label className="ctx-campo ctx-campo-curto">
                <span>Esta peça</span>
                <div className="segmented">
                  <button className={!avulsa ? "active" : ""} onClick={() => setAvulsa(false)}>
                    Vinculada
                  </button>
                  <button className={avulsa ? "active" : ""} onClick={irParaAvulsa}>
                    Avulsa
                  </button>
                </div>
              </label>

              {!avulsa && (
                <>
                  <label className="ctx-campo">
                    <span>O que você está procurando</span>
                    <select
                      value={tipo}
                      onChange={(e) => {
                        setTipo(e.target.value as TipoDeBusca);
                        setResultados([]);
                      }}
                    >
                      {TIPOS_DE_BUSCA.map((t) => (
                        <option key={t.chave} value={t.chave}>
                          {t.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* A SEGUNDA PERGUNTA, só quando é assessoria — pedido literal do dono. */}
                  {tipo === "assessoria" && (
                    <label className="ctx-campo">
                      <span>Dentro da assessoria</span>
                      <select
                        value={subtipo}
                        onChange={(e) => {
                          setSubtipo(e.target.value as SubtipoDeAssessoria);
                          setResultados([]);
                        }}
                      >
                        {SUBTIPOS_DE_ASSESSORIA.map((sub) => (
                          <option key={sub.chave} value={sub.chave}>
                            {sub.rotulo}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="ctx-campo ctx-campo-busca">
                    <span>Buscar</span>
                    <input
                      type="search"
                      value={termo}
                      onChange={(e) => setTermo(e.target.value)}
                      placeholder={
                        tipo === "atendimento"
                          ? "Assunto ou nome do cliente…"
                          : tipo === "assessoria"
                            ? "Empresa, licitação, demanda…"
                            : "Número do processo, título, vara ou cliente…"
                      }
                    />
                  </label>
                </>
              )}
            </div>

            {!avulsa && <p className="ctx-nota">{explicacaoDoFiltro} A natureza do procedimento, acima, é deduzida do que você marcar — não é a mesma pergunta.</p>}
          </div>
        </div>
      </div>

      {/* A ÚNICA REGIÃO QUE ROLA (item 5) — as demandas filtradas. */}
      <div className="ctx-rolagem">
        {avulsa ? (
          <div className="callout" style={{ maxWidth: 640 }}>
            <h2>Petição avulsa</h2>
            <p style={{ margin: 0, color: "var(--tx-1)", fontSize: 13, lineHeight: 1.6 }}>
              Sem processo, caso, atendimento ou assessoria vinculado. Os anexos e a minuta final desta sessão vão para uma subpasta própria dentro de{" "}
              <span className="mono">Peticionamento/</span> no Drive do escritório — nada se mistura com a pasta de nenhum cliente.
            </p>
          </div>
        ) : (
          <>
            {clienteTravado && (
              <div className="client-banner">
                Cliente desta sessão: <b>{clienteTravado.nome ?? clienteTravado.id}</b> — os demais itens seguem travados a ele até você iniciar uma nova sessão.
              </div>
            )}

            {vinculados.length > 0 && (
              <div className="ctx-bloco">
                <h3>Já vinculado a esta sessão ({vinculados.length})</h3>
                <div className="ctx-list">
                  {vinculados.map((item) => (
                    <label key={`${item.tipo}:${item.id}`} className="ctx-row">
                      <input type="checkbox" checked disabled={pendente} onChange={() => alternar(item.tipo, item.id, false)} />
                      <div className="body">
                        <div className="title-line">{item.titulo}</div>
                        <div className="sub-line">{item.subtitulo}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="ctx-bloco">
              <h3>
                Resultados{buscando ? " — buscando…" : ""}
                {!buscando && !filtradoPorTermo && resultados.length > 0 ? ` — mais recentes (digite ${MINIMO_DE_CARACTERES} letras para filtrar)` : ""}
              </h3>
              {resultados.length === 0 ? (
                <div className="empty-note">{buscando ? "Buscando…" : "Nenhum item encontrado com este filtro neste escritório."}</div>
              ) : (
                <div className="ctx-list">
                  {resultados.map((item) => (
                    <label key={`${item.tipo}:${item.id}`} className={`ctx-row${item.bloqueado ? " locked" : ""}`} title={item.motivoBloqueio ?? undefined}>
                      <input type="checkbox" checked={item.selecionado} disabled={item.bloqueado || pendente} onChange={(e) => alternar(item.tipo, item.id, e.target.checked)} />
                      <div className="body">
                        <div className="title-line">{item.titulo}</div>
                        <div className="sub-line">{item.subtitulo}</div>
                        {item.bloqueado && item.motivoBloqueio && <div className="lock-note">{item.motivoBloqueio}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {truncado && (
                <p className="ctx-nota">
                  Mostrando os {LIMITE_DE_RESULTADOS} primeiros — há mais itens que casam com este filtro. Refine a busca (número do processo, nome do cliente) em
                  vez de rolar.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* CONGELADA (item 5): não rola com os resultados. */}
      <div className="sticky-bar">
        <div className="left">
          {avulsa ? "Sessão avulsa · sem vínculo a cliente" : clienteTravado ? `Cliente confirmado: ${clienteTravado.nome}` : "Nenhum item vinculado ainda"}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => router.push(`/peticionamento/${sessaoId}/wizard`)}>
            Pular questionário
          </button>
          <button
            className="btn btn-primary"
            disabled={marcadas.length === 0}
            onClick={() => router.push(`/peticionamento/${sessaoId}/wizard`)}
            title={marcadas.length === 0 ? "Escolha ao menos uma matéria antes de continuar" : undefined}
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
