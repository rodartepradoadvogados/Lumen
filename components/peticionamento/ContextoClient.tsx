"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { alternarVinculo, definirSessaoAvulsa, definirMateria, adicionarMateriaDoEscritorio } from "@/lib/actions/peticionamento";
import type { TipoVinculo } from "@/lib/peticionamentoContexto";

type Candidato = {
  id: string;
  tipo: TipoVinculo;
  titulo: string;
  subtitulo: string;
  bloqueado: boolean;
  motivoBloqueio: string | null;
  selecionado: boolean;
};

type Props = {
  sessaoId: string;
  candidatos: { processos: Candidato[]; atendimentos: Candidato[]; assessorias: Candidato[]; clienteTravado: { id: string; nome: string | null } | null };
  materias: { nome: string; ehDoEscritorio: boolean }[];
  materiaAtual: string | null;
};

export function ContextoClient({ sessaoId, candidatos, materias: materiasIniciais, materiaAtual }: Props) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [avulsa, setAvulsa] = useState<boolean>(false); // default visual: começa sempre em "Vincular"
  const [aba, setAba] = useState<TipoVinculo>("case");
  // `candidatos` vem direto da prop (Server Component), de propósito: depois de
  // alternar/desmarcar um vínculo, `router.refresh()` busca o estado de verdade no servidor —
  // guardar uma cópia em useState aqui faria essa atualização ficar presa no valor do
  // primeiro carregamento (useState só lê o valor inicial na primeira renderização).
  const [materias, setMaterias] = useState(materiasIniciais);
  const [materia, setMateria] = useState(materiaAtual ?? "");
  const [adicionandoMateria, setAdicionandoMateria] = useState(false);
  const [novaMateria, setNovaMateria] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // Estado otimista do checkbox: o checkbox é CONTROLADO pela prop `selecionado` (verdade do
  // servidor), e entre o clique e o `router.refresh()` terminar de trazer o dado novo, a prop
  // continua com o valor antigo por um instante — sem isto, o React prende o checkbox de volta
  // no valor antigo assim que o clique termina, e ele "pisca" desmarcado (foi exatamente o que
  // um teste automatizado pegou: "Clicking the checkbox did not change its state"). O override
  // cai sozinho assim que a prop de verdade alcança o valor otimista.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOverrides((atual) => {
      const todos = [...candidatos.processos, ...candidatos.atendimentos, ...candidatos.assessorias];
      const proximo = { ...atual };
      let mudou = false;
      for (const item of todos) {
        if (item.id in proximo && proximo[item.id] === item.selecionado) {
          delete proximo[item.id];
          mudou = true;
        }
      }
      return mudou ? proximo : atual;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatos]);

  function selecionarMateria(nome: string, ehDoEscritorio: boolean) {
    setMateria(nome);
    iniciar(async () => {
      await definirMateria(sessaoId, nome, ehDoEscritorio);
    });
  }

  async function confirmarNovaMateria() {
    setErro(null);
    const resultado = await adicionarMateriaDoEscritorio(novaMateria);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    setMaterias((prev) => [...prev, { nome: resultado.nome, ehDoEscritorio: true }]);
    selecionarMateria(resultado.nome, true);
    setAdicionandoMateria(false);
    setNovaMateria("");
  }

  function alternar(tipo: TipoVinculo, id: string, marcar: boolean) {
    setErro(null);
    setOverrides((o) => ({ ...o, [id]: marcar }));
    iniciar(async () => {
      const resultado = await alternarVinculo(sessaoId, tipo, id, marcar);
      if ("error" in resultado) {
        setErro(resultado.error);
        setOverrides((o) => {
          const resto = { ...o };
          delete resto[id];
          return resto;
        });
        return;
      }
      // Recarrega os candidatos do servidor — a trava de cliente pode ter mudado quem fica
      // bloqueado para todos os outros itens, e recalcular isso no cliente duplicaria a regra.
      // O override otimista acima cai sozinho quando a prop nova confirmar o mesmo valor (efeito
      // logo abaixo).
      router.refresh();
    });
  }

  function irParaAvulsa() {
    setAvulsa(true);
    iniciar(async () => {
      await definirSessaoAvulsa(sessaoId);
      router.refresh();
    });
  }

  const listaAtiva = aba === "case" ? candidatos.processos : aba === "attendance" ? candidatos.atendimentos : candidatos.assessorias;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Vincular contexto</h1>
          <p>
            Escolha a matéria e, se quiser, vincule um ou mais itens já existentes no Lúmen. Você pode combinar processo, assessoria e atendimentos na mesma
            sessão — <strong style={{ color: "var(--tx-0)" }}>desde que sejam do mesmo cliente</strong>. Isso não é preferência de organização: é sigilo
            profissional.
          </p>
        </div>
      </div>

      <div className="content">
        {erro && <div className="callout callout-danger">{erro}</div>}

        <div className="group">
          <h2>Sessão vinculada ou avulsa</h2>
          <div className="segmented">
            <button className={!avulsa ? "active" : ""} onClick={() => setAvulsa(false)}>
              Vincular a um item do Lúmen
            </button>
            <button className={avulsa ? "active" : ""} onClick={irParaAvulsa}>
              Petição avulsa (sem vínculo)
            </button>
          </div>
        </div>

        <div className="group">
          <h2>
            Matéria <span className="quiet" style={{ fontWeight: 400 }}>— obrigatório, define o restante do questionário</span>
          </h2>
          <div className="matter-grid">
            {materias.map((m) => (
              <button key={m.nome} className={`matter-chip${materia === m.nome ? " selected" : ""}`} onClick={() => selecionarMateria(m.nome, m.ehDoEscritorio)}>
                {m.nome}
                {m.ehDoEscritorio && <span className="tag-local">escritório</span>}
              </button>
            ))}
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
            <div className="matter-legend">
              Matérias marcadas <span className="tag-local">escritório</span> foram adicionadas por este escritório e ficam disponíveis{" "}
              <strong style={{ color: "var(--tx-0)" }}>só aqui</strong> — não viram opção padrão do Lúmen para os demais escritórios que o usam.
            </div>
          </div>
        </div>

        {!avulsa && (
          <div className="group">
            <h2>Vincular a processo, caso, atendimento ou assessoria</h2>
            {candidatos.clienteTravado && (
              <div className="client-banner">
                Cliente desta sessão: <b>{candidatos.clienteTravado.nome ?? candidatos.clienteTravado.id}</b> — os demais itens seguem travados a ele até você
                iniciar uma nova sessão.
              </div>
            )}

            <div className="tabs" style={{ marginTop: 16 }}>
              <button className={`tab${aba === "case" ? " active" : ""}`} onClick={() => setAba("case")}>
                Processos <span className="mono quiet">{candidatos.processos.length}</span>
              </button>
              <button className={`tab${aba === "attendance" ? " active" : ""}`} onClick={() => setAba("attendance")}>
                Atendimentos <span className="mono quiet">{candidatos.atendimentos.length}</span>
              </button>
              <button className={`tab${aba === "assessoria" ? " active" : ""}`} onClick={() => setAba("assessoria")}>
                Assessoria <span className="mono quiet">{candidatos.assessorias.length}</span>
              </button>
            </div>

            <div style={{ marginTop: 14 }}>
              {listaAtiva.length === 0 ? (
                <div className="empty-note">Nenhum item deste tipo neste escritório.</div>
              ) : (
                <div className="ctx-list">
                  {listaAtiva.map((item) => (
                    <label key={item.id} className={`ctx-row${item.bloqueado ? " locked" : ""}`} title={item.motivoBloqueio ?? undefined}>
                      <input
                        type="checkbox"
                        checked={overrides[item.id] ?? item.selecionado}
                        disabled={item.bloqueado || pendente}
                        onChange={(e) => alternar(item.tipo, item.id, e.target.checked)}
                      />
                      <div className="body">
                        <div className="title-line">{item.titulo}</div>
                        <div className="sub-line">{item.subtitulo}</div>
                        {item.bloqueado && item.motivoBloqueio && <div className="lock-note">{item.motivoBloqueio}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {avulsa && (
          <div className="callout" style={{ maxWidth: 640 }}>
            <h2>Petição avulsa</h2>
            <p style={{ margin: 0, color: "var(--tx-1)", fontSize: 13, lineHeight: 1.6 }}>
              Sem processo, caso, atendimento ou assessoria vinculado. Os anexos e a minuta final desta sessão vão para uma subpasta própria dentro de{" "}
              <span className="mono">Peticionamento/</span> no Drive do escritório — nada se mistura com a pasta de nenhum cliente.
            </p>
          </div>
        )}
      </div>

      <div className="sticky-bar">
        <div className="left">{avulsa ? "Sessão avulsa · sem vínculo a cliente" : candidatos.clienteTravado ? `Cliente confirmado: ${candidatos.clienteTravado.nome}` : "Nenhum item vinculado ainda"}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => router.push(`/peticionamento/${sessaoId}/wizard`)}>
            Pular questionário
          </button>
          <button className="btn btn-primary" disabled={!materia} onClick={() => router.push(`/peticionamento/${sessaoId}/wizard`)} title={!materia ? "Escolha a matéria antes de continuar" : undefined}>
            Continuar
          </button>
        </div>
      </div>
    </>
  );
}
