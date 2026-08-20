"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTermoVigilancia, toggleTermoVigilancia, removeTermoVigilancia } from "@/lib/actions/vigilancia";
import { Radar, Power, Trash2 } from "lucide-react";

type Termo = {
  id: string;
  termo: string;
  tipo: string;
  ativo: boolean;
  ultimoHitAt: string | null;
};

const TIPO_LABELS: Record<string, string> = {
  NOME: "Nome",
  DOCUMENTO: "Documento",
  NUMERO: "Número",
  LIVRE: "Livre",
};

// Painel da aba "Vigilância" (app/(app)/processos/[id]/page.tsx, só existe para natureza
// ADMINISTRATIVO — ver lib/caseNatureza.ts). Cadastro manual dos termos que o robô coletor
// (PNCP/DOU/Diários/tribunais de contas, ver lib/actions/vigilancia.ts) vai procurar nas fontes
// públicas — nenhum termo nasce sozinho aqui, essa etapa fica para o coletor (tarefa futura).
export default function TermosVigilanciaPanel({ caseId, termos }: { caseId: string; termos: Termo[] }) {
  const router = useRouter();
  const [novoTermo, setNovoTermo] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const termo = novoTermo.trim();
    if (!termo) return;
    setError(null);
    startTransition(async () => {
      const result = await addTermoVigilancia({ termo, caseId });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setNovoTermo("");
      router.refresh();
    });
  }

  function handleToggle(id: string) {
    startTransition(async () => {
      await toggleTermoVigilancia(id);
      router.refresh();
    });
  }

  // window.confirm aqui em vez de modal próprio — mesmo padrão de DeleteEntityButton.tsx pro
  // resto do site.
  function handleRemove(id: string, termo: string) {
    if (!window.confirm(`Remover o termo "${termo}" da vigilância? O robô deixa de procurá-lo.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await removeTermoVigilancia(id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className=" bg-sf-apoio border border-regua px-4 py-3 flex items-start gap-2.5">
        <Radar size={15} className="shrink-0 mt-0.5 text-acao" />
        <p className="text-xs text-tx-2">
          O robô de vigilância varre diariamente PNCP, DOU e diários de tribunais de contas atrás destes termos (nome de
          parte, número do processo, palavra-chave...). Ao encontrar uma correspondência, gera um alerta direto neste processo.
        </p>
      </div>

      {/* Campo de texto + botão são IRMÃOS dentro do <form>, não um dentro do outro. */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={novoTermo}
          onChange={(e) => setNovoTermo(e.target.value)}
          placeholder="Ex.: nome da parte, nº do processo, palavra-chave..."
          className="flex-1 border border-regua bg-sf text-tx px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acao/40"
        />
        <button
          type="submit"
          disabled={pending || !novoTermo.trim()}
          className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          Adicionar termo
        </button>
      </form>

      {error && <p className="text-xs text-urgente">{error}</p>}

      {termos.length === 0 ? (
        <p className="text-sm text-tx-2 py-4 text-center">Nenhum termo cadastrado ainda.</p>
      ) : (
        <div className="divide-y divide-regua border border-regua">
          {termos.map((t) => (
            <div key={t.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${t.ativo ? "" : "opacity-45"}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-tx truncate">{t.termo}</p>
                <p className="text-[11px] text-tx-2">
                  {TIPO_LABELS[t.tipo] || t.tipo}
                  {t.ultimoHitAt ? ` · último alerta em ${new Date(t.ultimoHitAt).toLocaleDateString("pt-BR")}` : ""}
                </p>
              </div>
              {/* Ligar/desligar e excluir são botões IRMÃOS, lado a lado — nunca um aninhado no outro. */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggle(t.id)}
                  disabled={pending}
                  title={t.ativo ? "Desativar vigilância deste termo" : "Ativar vigilância deste termo"}
                  className={`p-1.5 transition-colors ${
                    t.ativo ? "text-concluido hover:bg-concluido-bg" : "text-tx-3 hover:bg-sf-apoio"
                  }`}
                >
                  <Power size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(t.id, t.termo)}
                  disabled={pending}
                  title="Excluir termo"
                  className="p-1.5 text-tx-3 hover:text-atencao hover:bg-sf-apoio transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
