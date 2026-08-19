"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { createApiKey, revokeApiKey, type ApiKeyRow } from "@/lib/actions/apiKeys";
import { formatDate } from "@/components/ui";
import ModalShell from "@/components/ModalShell";
import CopyButton from "@/components/CopyButton";

const SCOPE_LABEL: Record<string, string> = { LEITURA: "Leitura", ESCRITA: "Leitura e escrita" };

// Documento 04 do handoff do redesenho Modernist: "Tabela: nome, prefixo visível, escopo, criada
// em, último uso, ação Revogar. Criar chave abre modal que mostra o valor UMA ÚNICA VEZ, com
// CopyButton e o aviso de que não será exibido de novo." — implementado exatamente assim.
//
// Aviso que este componente também carrega na tela (não só em comentário de código): nenhum
// endpoint do Lúmen valida essas chaves ainda — não existe uma API pública do produto hoje. Criar
// uma chave aqui não conecta nada sozinho; é só a gestão da credencial, pronta para quando essa
// API existir (ver lib/actions/apiKeys.ts).
export default function ApiKeysManager({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"LEITURA" | "ESCRITA">("LEITURA");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  function submitCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createApiKey({ name, scope });
      if (res.error) {
        setError(res.error);
        return;
      }
      setCreating(false);
      setName("");
      setScope("LEITURA");
      setRevealedKey(res.key ?? null);
      router.refresh();
    });
  }

  function submitRevoke(id: string) {
    if (!window.confirm("Revogar esta chave? Qualquer integração que a use para de funcionar imediatamente.")) return;
    startTransition(() => {
      revokeApiKey(id).then(() => router.refresh());
    });
  }

  return (
    <div>
      <p className="text-xs text-tx-2 bg-sf-apoio border-l-4 border-tx-3 px-3 py-2 mb-4">
        Nenhum endpoint do Lúmen valida essas chaves ainda — não existe hoje uma API pública do produto. Criar uma chave aqui
        gerencia a credencial, mas ela ainda não autentica nada sozinha.
      </p>

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-semibold text-tx-2 uppercase tracking-[.12em]">Chaves</h3>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center justify-start h-8 border-2 border-regua-forte bg-transparent hover:bg-acao-bg text-tx font-semibold text-xs px-3 transition-colors"
        >
          Criar chave
        </button>
      </div>

      {initialKeys.length === 0 ? (
        <p className="text-sm text-tx-2">Nenhuma chave criada ainda.</p>
      ) : (
        <div className="overflow-x-auto border-t border-regua">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-[.1em] text-tx-2 border-b border-regua">
                <th className="py-2 pr-2 font-semibold">Nome</th>
                <th className="py-2 pr-2 font-semibold">Prefixo</th>
                <th className="py-2 pr-2 font-semibold">Escopo</th>
                <th className="py-2 pr-2 font-semibold">Criada em</th>
                <th className="py-2 pr-2 font-semibold">Último uso</th>
                <th className="py-2 pr-2 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-regua">
              {initialKeys.map((k) => (
                <tr key={k.id} className={clsx(k.revokedAt && "opacity-50")}>
                  <td className="py-2 pr-2 text-tx">{k.name}</td>
                  <td className="py-2 pr-2 text-tx-2 font-mono text-xs">{k.prefix}</td>
                  <td className="py-2 pr-2 text-tx-2">{SCOPE_LABEL[k.scope] ?? k.scope}</td>
                  <td className="py-2 pr-2 text-tx-2 tabular-nums">{formatDate(k.createdAt)}</td>
                  <td className="py-2 pr-2 text-tx-2 tabular-nums">{k.lastUsedAt ? formatDate(k.lastUsedAt) : "Nunca usada"}</td>
                  <td className="py-2 pr-2 text-right">
                    {k.revokedAt ? (
                      <span className="text-xs text-tx-3">Revogada</span>
                    ) : (
                      <button type="button" onClick={() => submitRevoke(k.id)} className="text-xs font-semibold text-atencao hover:underline">
                        Revogar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <ModalShell size="compacto" title="Criar chave de API" onClose={() => setCreating(false)}>
          <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-3">
            <div>
              <label className="text-xs font-semibold text-tx-2 block mb-1">Nome</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Integração com o site institucional"
                className="w-full h-9 border-2 border-regua-forte bg-sf text-sm text-tx px-2.5"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-tx-2 block mb-1">Escopo</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as "LEITURA" | "ESCRITA")}
                className="w-full h-9 border-2 border-regua-forte bg-sf text-sm text-tx px-2.5"
              >
                <option value="LEITURA">Leitura</option>
                <option value="ESCRITA">Leitura e escrita</option>
              </select>
            </div>
            {error && <p className="text-sm text-atencao">{error}</p>}
          </div>
          <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t-2 border-regua-forte">
            <button type="button" onClick={() => setCreating(false)} className="text-sm font-semibold text-tx-2 px-3 h-8">
              Cancelar
            </button>
            <button
              type="button"
              onClick={submitCreate}
              disabled={pending || !name.trim()}
              className="inline-flex items-center justify-start h-8 bg-acao hover:bg-acao-hover disabled:opacity-60 text-acao-tx font-semibold text-sm px-4 transition-colors"
            >
              {pending ? "Criando..." : "Criar"}
            </button>
          </div>
        </ModalShell>
      )}

      {revealedKey && (
        <ModalShell size="compacto" title="Chave criada" onClose={() => setRevealedKey(null)}>
          <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-3">
            <p className="text-sm text-atencao font-semibold">Copie agora — esta chave não será exibida de novo.</p>
            <div className="flex items-center gap-2">
              <code className="text-xs text-tx bg-sf-apoio px-2 py-2 flex-1 truncate">{revealedKey}</code>
              <CopyButton text={revealedKey} label="Copiar" />
            </div>
          </div>
          <div className="shrink-0 flex items-center justify-end px-5 py-4 border-t-2 border-regua-forte">
            <button
              type="button"
              onClick={() => setRevealedKey(null)}
              className="inline-flex items-center justify-start h-8 border-2 border-regua-forte bg-transparent hover:bg-acao-bg text-tx font-semibold text-sm px-4 transition-colors"
            >
              Já copiei
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
