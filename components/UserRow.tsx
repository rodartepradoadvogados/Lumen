"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Power, Trash2, X, Wallet, WalletCards, KeyRound } from "lucide-react";
import { updateUser, toggleUserActive, deleteUser, setFinanceAccess, setUserCredentials } from "@/lib/actions/settings";
import { Badge } from "@/components/ui";

const ROLE_OPTIONS = ["Advogado", "Sócio", "Estagiário", "Financeiro", "Recepcionista", "Marketing", "Contador"];

type User = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  oab: string | null;
  phone: string | null;
  color: string;
  active: boolean;
  isAdmin: boolean;
  financeAccess: boolean;
};

export default function UserRow({ user, canManage }: { user: User; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [credOpen, setCredOpen] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);
  const [credSuccess, setCredSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSaveCredentials(formData: FormData) {
    setCredError(null);
    setCredSuccess(false);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "");
    const confirm = String(formData.get("confirm") || "");
    if (password !== confirm) {
      setCredError("As senhas não coincidem.");
      return;
    }
    startTransition(async () => {
      const result = await setUserCredentials(user.id, username, password);
      if (result.error) {
        setCredError(result.error);
      } else {
        setCredSuccess(true);
        setCredOpen(false);
        router.refresh();
      }
    });
  }

  function handleSave(formData: FormData) {
    setError(null);
    startTransition(async () => {
      await updateUser(user.id, {
        name: String(formData.get("name")),
        email: String(formData.get("email")),
        role: String(formData.get("role")),
        oab: String(formData.get("oab") || ""),
        phone: String(formData.get("phone") || ""),
        color: String(formData.get("color") || user.color),
      });
      setEditing(false);
      router.refresh();
    });
  }

  function handleToggleFinanceAccess() {
    setError(null);
    startTransition(async () => {
      const result = await setFinanceAccess(user.id, !user.financeAccess);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function handleToggleActive() {
    setError(null);
    startTransition(async () => {
      const result = await toggleUserActive(user.id);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!window.confirm(`Excluir definitivamente "${user.name}"? Essa ação não pode ser desfeita.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteUser(user.id);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <form action={handleSave} className="px-5 py-3 space-y-2 bg-cream-50 dark:bg-navy-800">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input name="name" defaultValue={user.name} required placeholder="Nome" className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30" />
          <input name="email" type="email" defaultValue={user.email} required placeholder="E-mail" className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30" />
          <select name="role" defaultValue={user.role} className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50">
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input name="oab" defaultValue={user.oab ?? ""} placeholder="OAB (opcional)" className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30" />
          <input name="phone" defaultValue={user.phone ?? ""} placeholder="Telefone (opcional)" className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30" />
          <input name="color" type="color" defaultValue={user.color} className="cfg-input dark:bg-navy-900 dark:border-white/15 h-9 p-1" />
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
            {pending ? "Salvando..." : "Salvar"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="px-3 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50">
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  if (credOpen) {
    return (
      <form action={handleSaveCredentials} className="px-5 py-3 space-y-2 bg-cream-50 dark:bg-navy-800">
        <p className="text-xs font-semibold text-navy-900 dark:text-cream-50">
          {user.username ? `Redefinir senha de acesso — ${user.name}` : `Definir acesso — ${user.name}`}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            name="username"
            defaultValue={user.username ?? user.email}
            required
            minLength={4}
            autoComplete="off"
            placeholder="Usuário (login)"
            className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30"
          />
          <input name="password" type="password" required minLength={6} autoComplete="new-password" placeholder="Senha (mín. 6)" className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30" />
          <input name="confirm" type="password" required minLength={6} autoComplete="new-password" placeholder="Confirmar senha" className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30" />
        </div>
        {credError && <p className="text-[11px] text-bordo-700 bg-bordo-100 border border-bordo-100 rounded-lg px-2.5 py-1.5 dark:bg-bordo-900/40 dark:border-bordo-400/20 dark:text-bordo-400">{credError}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
            {pending ? "Salvando..." : user.username ? "Redefinir senha" : "Definir acesso"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCredOpen(false);
              setCredError(null);
            }}
            className="px-3 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3 relative">
      <span className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: user.color }}>
        {user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{user.name}</p>
        <p className="text-xs text-navy-800/45 dark:text-cream-50/45 truncate">
          {user.role} {user.oab && `· ${user.oab}`} · {user.email}
          {user.phone && ` · ${user.phone}`}
          {user.username && ` · login: ${user.username}`}
        </p>
      </div>
      <Badge color={user.active ? "green" : "slate"}>{user.active ? "Ativo" : "Inativo"}</Badge>
      {user.isAdmin && <Badge color="gold">Admin</Badge>}
      {!user.isAdmin && user.financeAccess && <Badge color="green">Financeiro</Badge>}
      {credSuccess && <Badge color="green">Acesso definido</Badge>}
      {canManage && !user.isAdmin && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setCredSuccess(false);
              setCredError(null);
              setCredOpen(true);
            }}
            data-tip={user.username ? "Redefinir senha" : "Definir acesso"}
            className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-gold-700 dark:hover:text-gold-400 hover:bg-gold-500/10 transition-colors"
          >
            <KeyRound size={14} />
          </button>
          <button
            onClick={handleToggleFinanceAccess}
            disabled={pending}
            data-tip={user.financeAccess ? "Remover acesso ao Financeiro" : "Conceder acesso ao Financeiro"}
            className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
              user.financeAccess
                ? "text-emerald-600 hover:text-bordo-600 dark:hover:text-bordo-400 hover:bg-bordo-500/10 dark:hover:bg-bordo-400/10"
                : "text-navy-800/30 dark:text-cream-50/30 hover:text-emerald-600 hover:bg-emerald-50"
            }`}
          >
            {user.financeAccess ? <Wallet size={14} /> : <WalletCards size={14} />}
          </button>
          <button onClick={() => setEditing(true)} data-tip="Editar" className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-navy-900 dark:hover:text-cream-50 hover:bg-cream-100 dark:hover:bg-white/10 transition-colors">
            <Pencil size={14} />
          </button>
          <button
            onClick={handleToggleActive}
            disabled={pending}
            data-tip={user.active ? "Inativar" : "Reativar"}
            className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors disabled:opacity-40"
          >
            <Power size={14} />
          </button>
          <button onClick={handleDelete} disabled={pending} data-tip="Excluir definitivamente" className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-bordo-600 dark:hover:text-bordo-400 hover:bg-bordo-500/10 dark:hover:bg-bordo-400/10 transition-colors disabled:opacity-40">
            <Trash2 size={14} />
          </button>
        </div>
      )}
      {error && (
        <span className="absolute right-5 top-full mt-1 z-10 w-72 text-[11px] bg-bordo-100 dark:bg-bordo-900/40 text-bordo-700 dark:text-bordo-400 border border-bordo-100 dark:border-bordo-400/20 rounded-lg px-2.5 py-1.5 shadow-pop flex items-start gap-1.5">
          {error}
          <button onClick={() => setError(null)} className="ml-auto shrink-0">
            <X size={12} />
          </button>
        </span>
      )}
    </div>
  );
}
