"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createPlatformMemberFromUser, createStandalonePlatformMember } from "@/lib/actions/platformEquipe";
import ModalShell from "@/components/ModalShell";

type EligibleUser = { id: string; name: string; email: string; office: { name: string } | null };
type Role = { id: string; name: string };

export default function NewPlatformMemberModal({
  eligibleUsers,
  roles,
}: {
  eligibleUsers: EligibleUser[];
  roles: Role[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"vincular" | "cadastrar">("vincular");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVincular(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const userId = String(formData.get("userId") || "");
      const roleId = String(formData.get("roleId") || "");
      if (!userId || !roleId) throw new Error("Selecione um usuário e um papel.");
      await createPlatformMemberFromUser(userId, roleId);
      setLoading(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Não foi possível vincular este usuário.");
    }
  }

  async function handleCadastrar(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      await createStandalonePlatformMember({
        name: String(formData.get("name") || ""),
        email: String(formData.get("email") || ""),
        password: String(formData.get("password") || ""),
        roleId: String(formData.get("roleId") || ""),
      });
      setLoading(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Não foi possível cadastrar este membro.");
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-3.5 py-2 transition-colors"
      >
        <Plus size={16} /> Novo membro
      </button>

      {open && (
        // "medio": no máximo 4 campos por aba — 80% da tela deixaria a janela quase vazia.
        <ModalShell size="medio" title="Novo membro" onClose={() => setOpen(false)}>
          <div className="flex border-b border-white/10 shrink-0">
            <button
              onClick={() => { setTab("vincular"); setError(null); }}
              className={`flex-1 text-xs font-semibold uppercase tracking-wide py-3 border-b-2 transition-colors ${
                tab === "vincular" ? "border-marca text-white" : "border-transparent text-white/40 hover:text-white/70"
              }`}
            >
              Vincular usuário existente
            </button>
            <button
              onClick={() => { setTab("cadastrar"); setError(null); }}
              className={`flex-1 text-xs font-semibold uppercase tracking-wide py-3 border-b-2 transition-colors ${
                tab === "cadastrar" ? "border-marca text-white" : "border-transparent text-white/40 hover:text-white/70"
              }`}
            >
              Pessoa exclusiva da Lúmen
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {tab === "vincular" ? (
              <form action={handleVincular} className="p-5 space-y-3">
                <p className="text-xs text-white/50">
                  Vincula um usuário que já tem conta em algum escritório — ele passa a existir também do lado da Lúmen, com
                  o papel escolhido abaixo. Não cria acesso ao Painel da Empresa.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-white/60">Usuário</label>
                    <select name="userId" required defaultValue="" className="pmm-input">
                      <option value="" disabled>
                        Selecione um usuário
                      </option>
                      {eligibleUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} — {u.email}
                          {u.office ? ` (${u.office.name})` : ""}
                        </option>
                      ))}
                    </select>
                    {eligibleUsers.length === 0 && (
                      <p className="text-[11px] text-white/40 mt-1">Todos os usuários elegíveis já são membros da Lúmen.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60">Papel</label>
                    <select name="roleId" required defaultValue="" className="pmm-input">
                      <option value="" disabled>
                        Selecione um papel
                      </option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {error && <p className="text-xs text-atencao">{error}</p>}
                <button type="submit" disabled={loading || eligibleUsers.length === 0} className="w-full bg-acao hover:bg-acao-hover text-acao-tx font-semibold py-2.5 disabled:opacity-50">
                  {loading ? "Vinculando..." : "Vincular"}
                </button>
              </form>
            ) : (
              <form action={handleCadastrar} className="p-5 space-y-3">
                <p className="text-xs text-white/50">
                  Cadastra alguém exclusivo da Lúmen, sem vínculo com nenhum escritório. A pessoa já pode entrar direto
                  no Painel Mestre com este e-mail e senha, pela tela de login normal.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-white/60">Nome</label>
                    <input name="name" required className="pmm-input" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60">E-mail</label>
                    <input name="email" type="email" required className="pmm-input" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-white/60">Senha</label>
                    <input name="password" type="password" required className="pmm-input" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60">Papel</label>
                    <select name="roleId" required defaultValue="" className="pmm-input">
                      <option value="" disabled>
                        Selecione um papel
                      </option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {error && <p className="text-xs text-atencao">{error}</p>}
                <button type="submit" disabled={loading} className="w-full bg-acao hover:bg-acao-hover text-acao-tx font-semibold py-2.5 disabled:opacity-50">
                  {loading ? "Cadastrando..." : "Cadastrar"}
                </button>
              </form>
            )}
          </div>
        </ModalShell>
      )}
      <style jsx global>{`
        .pmm-input {
          width: 100%;
          margin-top: 0.25rem;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: white;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .pmm-input:focus {
          outline: none;
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--marca) 40%, transparent);
        }
      `}</style>
    </>
  );
}
