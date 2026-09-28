"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Search, UserPlus, Pencil } from "lucide-react";
import { definirNomeDoLead, vincularAtendimentoAoCliente, cadastrarContatoDoAtendimento } from "@/lib/actions/contatoDoAtendimento";
import { searchClients } from "@/lib/actions/attendance";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

// ============================================================================
// O POP-UP DE "QUEM É ESSA PESSOA" — F5.5, pedido do dono, item 5.
//
// "Pasta do Lúmen atendimentos com nome genérico. Se não for cliente, abrir um pop-up em conversa
// com humano para definir nome do cliente manualmente ou selecionar um contato ou cadastrar um
// contato de cliente para criar a pasta."
//
// TRÊS CAMINHOS, TRÊS ABAS, NENHUM PADRÃO ESCONDIDO: quem abre o pop-up decide qual dos três
// resolve o caso dele — uma dúvida de cinco minutos não vira cadastro (aba "Nome"), um cliente
// antigo que nunca escreveu por este número não vira duplicata (aba "Contato existente"), e um
// lead de verdade ganha ficha (aba "Novo cliente"). Os três atualizam o nome do atendimento e, se a
// pasta já existe, o nome dela no Drive — é o mesmo "renomear renomeia a pasta" de sempre, cada
// aba chamando a ação certa (ver lib/actions/contatoDoAtendimento.ts).
//
// SÓ APARECE QUANDO FAZ SENTIDO. O botão que abre este pop-up (ver QuemEEsteNumero.tsx) só é
// oferecido quando o número não bate com ninguém da agenda E o nome ainda é o temporário — se o
// telefone já identificou a pessoa, o pop-up não tem o que perguntar.
// ============================================================================

type Aba = "nome" | "existente" | "novo";
type ClienteAchado = { id: string; name: string; phone: string | null; phoneDdi: string | null; email: string | null };

export default function DefinirNomeDoLead({ attendanceId }: { attendanceId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<Aba>("nome");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();

  // Aba "Nome"
  const [nomeDigitado, setNomeDigitado] = useState("");

  // Aba "Contato existente"
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<ClienteAchado[]>([]);
  const [buscando, setBuscando] = useState(false);

  // Aba "Novo cliente"
  const [nomeNovoCliente, setNomeNovoCliente] = useState("");

  useEscapeToClose(aberto, () => setAberto(false));

  function fechar() {
    setAberto(false);
    setErro(null);
    setNomeDigitado("");
    setBusca("");
    setAchados([]);
    setNomeNovoCliente("");
    setAba("nome");
  }

  function aoTerminar(r: { error?: string }) {
    if (r.error) {
      setErro(r.error);
      return;
    }
    fechar();
    router.refresh();
  }

  function salvarNome() {
    setErro(null);
    comecar(async () => aoTerminar(await definirNomeDoLead(attendanceId, nomeDigitado)));
  }

  async function buscar(q: string) {
    setBusca(q);
    if (q.trim().length < 2) {
      setAchados([]);
      return;
    }
    setBuscando(true);
    try {
      setAchados(await searchClients(q));
    } finally {
      setBuscando(false);
    }
  }

  function selecionar(clientId: string) {
    setErro(null);
    comecar(async () => aoTerminar(await vincularAtendimentoAoCliente(attendanceId, clientId)));
  }

  function cadastrarNovo() {
    setErro(null);
    comecar(async () => {
      const r = await cadastrarContatoDoAtendimento(attendanceId, "cliente", nomeNovoCliente);
      aoTerminar(r);
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mt-2 inline-flex items-center gap-1.5 border border-regua bg-sf px-2.5 py-1.5 text-xs font-semibold text-tx-2 transition-colors hover:bg-sf-apoio hover:text-tx"
      >
        <Pencil size={12} /> Definir quem é esta pessoa
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-grafite-900/40 p-4">
      <div className="w-full max-w-sm bg-sf shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-regua px-5 py-4">
          <h3 className="text-sm font-bold text-tx">Quem é esta pessoa?</h3>
          <button onClick={fechar} className="text-tx-3 hover:text-tx">
            <X size={18} />
          </button>
        </div>

        <div className="flex border-b border-regua text-xs font-semibold">
          <Tab label="Só o nome" ativa={aba === "nome"} onClick={() => setAba("nome")} />
          <Tab label="Contato existente" ativa={aba === "existente"} onClick={() => setAba("existente")} />
          <Tab label="Novo cliente" ativa={aba === "novo"} onClick={() => setAba("novo")} />
        </div>

        <div className="p-4">
          {aba === "nome" && (
            <div className="space-y-3">
              <p className="text-xs text-tx-3">
                Só corrige o nome desta conversa (e a pasta no Drive) — sem criar cadastro nenhum. Serve para quem não
                precisa virar contato do escritório.
              </p>
              <input
                autoFocus
                value={nomeDigitado}
                onChange={(e) => setNomeDigitado(e.target.value)}
                placeholder="Nome da pessoa"
                className="w-full border border-regua bg-sf px-3 py-2 text-sm text-tx focus:outline-none focus:ring-2 focus:ring-marca-tx"
              />
              <button
                type="button"
                onClick={salvarNome}
                disabled={pendente || !nomeDigitado.trim()}
                className="w-full bg-acao px-4 py-2 text-xs font-semibold text-acao-tx transition-colors hover:bg-acao-hover disabled:opacity-50"
              >
                Salvar nome
              </button>
            </div>
          )}

          {aba === "existente" && (
            <div className="space-y-3">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-3" />
                <input
                  autoFocus
                  value={busca}
                  onChange={(e) => buscar(e.target.value)}
                  placeholder="Buscar cliente pelo nome…"
                  className="w-full border border-regua bg-sf py-2 pl-8 pr-3 text-sm text-tx focus:outline-none focus:ring-2 focus:ring-marca-tx"
                />
              </div>
              {buscando && <p className="text-xs text-tx-3">Buscando…</p>}
              {!buscando && busca.trim().length >= 2 && achados.length === 0 && (
                <p className="text-xs text-tx-3">Nenhum cliente com esse nome.</p>
              )}
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {achados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={pendente}
                    onClick={() => selecionar(c.id)}
                    className="w-full border border-regua bg-sf px-3 py-2 text-left text-sm text-tx transition-colors hover:bg-sf-apoio disabled:opacity-50"
                  >
                    {c.name}
                    {c.phone && <span className="ml-1.5 text-xs text-tx-3">{c.phone}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {aba === "novo" && (
            <div className="space-y-3">
              <p className="text-xs text-tx-3">
                Cadastra um cliente novo com o telefone desta conversa e vincula o atendimento a ele.
              </p>
              <input
                autoFocus
                value={nomeNovoCliente}
                onChange={(e) => setNomeNovoCliente(e.target.value)}
                placeholder="Nome do cliente"
                className="w-full border border-regua bg-sf px-3 py-2 text-sm text-tx focus:outline-none focus:ring-2 focus:ring-marca-tx"
              />
              <button
                type="button"
                onClick={cadastrarNovo}
                disabled={pendente || !nomeNovoCliente.trim()}
                className="flex w-full items-center justify-center gap-1.5 bg-acao px-4 py-2 text-xs font-semibold text-acao-tx transition-colors hover:bg-acao-hover disabled:opacity-50"
              >
                <UserPlus size={13} /> Cadastrar e vincular
              </button>
            </div>
          )}

          {erro && <p className="mt-3 text-xs font-medium text-urgente">{erro}</p>}
        </div>
      </div>
    </div>
  );
}

function Tab({ label, ativa, onClick }: { label: string; ativa: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-2 py-2.5 text-center transition-colors ${
        ativa ? "border-b-2 border-marca-tx text-tx" : "text-tx-3 hover:text-tx"
      }`}
    >
      {label}
    </button>
  );
}
