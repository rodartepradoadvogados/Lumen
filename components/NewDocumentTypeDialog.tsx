"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { createOfficeDocumentType } from "@/lib/actions/documentTypes";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

// Janela suspensa por cima da janela suspensa de DocumentTypeSelect (o botão "+ Novo tipo" fica
// dentro dela) — pede, nesta ordem, a seção onde o tipo novo vai aparecer e o nome do tipo. Ao
// confirmar, chama a ação de servidor (lib/actions/documentTypes.ts) e devolve o tipo criado para
// quem abriu esta janela já selecionar (ver onCreated em DocumentTypeSelect.tsx).
export default function NewDocumentTypeDialog({
  secoes,
  onClose,
  onCreated,
}: {
  secoes: string[];
  onClose: () => void;
  onCreated: (type: { chave: string; rotulo: string; secao: string }) => void;
}) {
  const [secao, setSecao] = useState(secoes[0] || "");
  const [rotulo, setRotulo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEscapeToClose(true, onClose);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!secao) {
      setError("Escolha a seção onde o tipo vai aparecer.");
      return;
    }
    if (!rotulo.trim()) {
      setError("Digite o nome do novo tipo.");
      return;
    }
    startTransition(async () => {
      const result = await createOfficeDocumentType(secao, rotulo);
      if (result.error) setError(result.error);
      else if (result.type) onCreated(result.type);
    });
  }

  return (
    <div className="fixed inset-0 z-[60] bg-grafite-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-sf shadow-modal w-full max-w-sm motion-safe:animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
          <h3 className="font-bold text-tx">Novo tipo de documento</h3>
          <button type="button" onClick={onClose} className="text-tx-3 hover:text-tx">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-tx-2">Seção</label>
            <select
              autoFocus
              value={secao}
              onChange={(e) => setSecao(e.target.value)}
              className="w-full mt-1 border border-regua-forte px-3 py-2 text-sm bg-sf text-tx focus:outline-none focus:ring-2 focus:ring-acao/40"
            >
              {secoes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-tx-3 mt-1">Onde este tipo vai aparecer na lista de categorias.</p>
          </div>

          <div>
            <label className="text-xs font-medium text-tx-2">Nome do tipo</label>
            <input
              value={rotulo}
              onChange={(e) => setRotulo(e.target.value)}
              placeholder="Ex.: Print de conversa"
              className="w-full mt-1 border border-regua-forte px-3 py-2 text-sm bg-sf text-tx placeholder:text-tx-3 focus:outline-none focus:ring-2 focus:ring-acao/40"
            />
            <p className="text-[11px] text-tx-3 mt-1">Este nome também vira o nome da pasta correspondente no armazenamento em nuvem.</p>
          </div>

          {error && <p className="text-xs text-urgente">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 disabled:opacity-50"
            >
              {pending ? "Criando..." : "Criar tipo"}
            </button>
            <button type="button" onClick={onClose} className="text-sm font-semibold text-tx-2 hover:text-tx px-3">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
