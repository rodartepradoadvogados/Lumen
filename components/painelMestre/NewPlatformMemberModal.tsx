"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createPlatformMemberFromUser, createStandalonePlatformMember } from "@/lib/actions/platformEquipe";

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
        className="flex items-center gap-1.5 bg-gold-600 hover:bg-gold-700 text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
      >
        <Plus size={16} /> Novo membro
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/60 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-navy-900 border border-white/10 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="font-serif font-bold text-cream-50">Novo membro</h3>
              <button onClick={() => setOpen(false)} className="text-cream-50/40 hover:text-cream-50">
                <X size={18} />
              </button>
            </div>

            <div className="flex border-b border-white/10">
              <button
                onClick={() => { setTab("vincular"); setError(null); }}
                className={`flex-1 text-xs font-semibold uppercase tracking-wide py-3 border-b-2 transition-colors ${
                  tab === "vincular" ? "border-gold-400 text-cream-50" : "border-transparent text-cream-50/40 hover:text-cream-50/70"
                }`}
              >
                Vincular usuário existente
              </button>
              <button
                onClick={() => { setTab("cadastrar"); setError(null); }}
                className={`flex-1 text-xs font-semibold uppercase tracking-wide py-3 border-b-2 transition-colors ${
                  tab === "cadastrar" ? "border-gold-400 text-cream-50" : "border-transparent text-cream-50/40 hover:text-cream-50/70"
                }`}
              >
                Pessoa exclusiva da Lúmen
              </button>
            </div>

            {tab === "vincular" ? (
              <form action={handleVincular} className="p-5 space-y-3">
                <p className="text-xs text-cream-50/50">
                  Vincula um usuário que já tem conta em algum escritório — ele passa a existir também do lado da Lúmen, com
                  o papel escolhido abaixo. Não cria acesso ao Painel da Empresa.
                </p>
                <div>
                  <label className="text-xs font-medium text-cream-50/60">Usuário</label>
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
                    <p className="text-[11px] text-cream-50/40 mt-1">Todos os usuários elegíveis já são membros da Lúmen.</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-cream-50/60">Papel</label>
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
                {error && <p className="text-xs text-bordo-400">{error}</p>}
                <button type="submit" disabled={loading || eligibleUsers.length === 0} className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                  {loading ? "Vinculando..." : "Vincular"}
                </button>
              </form>
            ) : (
              <form action={handleCadastrar} className="p-5 space-y-3">
                <p className="text-xs text-cream-50/50">
                  Cadastra alguém exclusivo da Lúmen, sem vínculo com nenhum escritório. Isto não cria capacidade de login —
                  é só preenchimento de dados para um passo futuro.
                </p>
                <div>
                  <label className="text-xs font-medium text-cream-50/60">Nome</label>
                  <input name="name" required className="pmm-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-cream-50/60">E-mail</label>
                  <input name="email" type="email" required className="pmm-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-cream-50/60">Senha</label>
                  <input name="password" type="password" required className="pmm-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-cream-50/60">Papel</label>
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
                {error && <p className="text-xs text-bordo-400">{error}</p>}
                <button type="submit" disabled={loading} className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                  {loading ? "Cadastrando..." : "Cadastrar"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      <style jsx global>{`
        .pmm-input {
          width: 100%;
          margin-top: 0.25rem;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #fdfaf3;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .pmm-input:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgba(198, 160, 92, 0.4);
        }
      `}</style>
    </>
  );
}
