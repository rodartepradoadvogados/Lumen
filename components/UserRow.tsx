"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Power, Trash2, X, Wallet, WalletCards, KeyRound, Link2, Copy, Check } from "lucide-react";
import { updateUser, toggleUserActive, deleteUser, setFinanceAccess, setUserCredentials } from "@/lib/actions/settings";
import { adminGenerateResetLink } from "@/lib/actions/auth";
import { Badge } from "@/components/ui";
import MaskedInput from "@/components/MaskedInput";
import { maskPhone } from "@/lib/masks";

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

  // Link de redefinição de senha gerado por um administrador (Configurações → Equipe) — mesmo
  // mecanismo de token do fluxo "Esqueci minha senha" (ver lib/actions/auth.ts:
  // adminGenerateResetLink), pensado para entregar por WhatsApp ou pessoalmente quando nenhum
  // canal de e-mail estiver disponível.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkResult, setLinkResult] = useState<{ url: string; expiresAt: string } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkPending, startLinkTransition] = useTransition();

  function handleGenerateLink() {
    setLinkError(null);
    setLinkCopied(false);
    startLinkTransition(async () => {
      const result = await adminGenerateResetLink(user.id);
      if (result.error || !result.url || !result.expiresAt) {
        setLinkError(result.error || "Não foi possível gerar o link.");
        setLinkResult(null);
      } else {
        setLinkResult({ url: result.url, expiresAt: result.expiresAt });
      }
    });
  }

  async function handleCopyLink() {
    if (!linkResult) return;
    try {
      await navigator.clipboard.writeText(linkResult.url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // clipboard indisponível (ex.: contexto não seguro) — a pessoa ainda pode selecionar e
      // copiar manualmente o texto do input.
    }
  }

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
      <form action={handleSave} className="px-5 py-3 space-y-2 bg-sf-apoio">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input name="name" defaultValue={user.name} required placeholder="Nome" className="cfg-input bg-sf border border-regua text-tx placeholder:text-tx-3" />
          <input name="email" type="email" defaultValue={user.email} required placeholder="E-mail" className="cfg-input bg-sf border border-regua text-tx placeholder:text-tx-3" />
          <select name="role" defaultValue={user.role} className="cfg-input bg-sf border border-regua text-tx">
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input name="oab" defaultValue={user.oab ?? ""} placeholder="OAB (opcional)" className="cfg-input bg-sf border border-regua text-tx placeholder:text-tx-3" />
          <MaskedInput name="phone" mask={maskPhone} defaultValue={user.phone ?? ""} placeholder="Telefone (opcional)" className="cfg-input bg-sf border border-regua text-tx placeholder:text-tx-3" />
          <input name="color" type="color" defaultValue={user.color} className="cfg-input bg-sf border border-regua h-9 p-1" />
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-1.5 disabled:opacity-50">
            {pending ? "Salvando..." : "Salvar"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="px-3 text-xs font-semibold text-tx-2 hover:text-tx">
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  if (linkOpen) {
    const expiresLabel = linkResult
      ? new Date(linkResult.expiresAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
      : null;
    return (
      <div className="px-5 py-3 space-y-2 bg-sf-apoio">
        <p className="text-xs font-semibold text-tx">Link de redefinição de senha — {user.name}</p>
        {!linkResult ? (
          <>
            <p className="text-[11px] text-tx-2">
              Gera um link de uso único para {user.name} escolher uma nova senha, sem depender de e-mail — entregue por WhatsApp ou pessoalmente.
            </p>
            {linkError && (
              <p className="text-[11px] text-urgente bg-urgente-bg border border-urgente/20 rounded-md px-2.5 py-1.5">
                {linkError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleGenerateLink}
                disabled={linkPending}
                className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
              >
                {linkPending ? "Gerando..." : "Gerar link"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLinkOpen(false);
                  setLinkError(null);
                }}
                className="px-3 text-xs font-semibold text-tx-2 hover:text-tx"
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-2 items-center">
              <input
                readOnly
                value={linkResult.url}
                onFocus={(e) => e.currentTarget.select()}
                className="cfg-input flex-1 text-xs font-mono bg-sf border border-regua text-tx"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                data-tip="Copiar"
                className="p-2 text-tx-2 hover:text-tx hover:bg-sf-apoio shrink-0"
              >
                {linkCopied ? <Check size={14} className="text-concluido" /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-[11px] text-aviso">
              Válido até {expiresLabel} (expira em 1 hora) e só pode ser usado uma vez.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setLinkOpen(false);
                  setLinkResult(null);
                  setLinkError(null);
                }}
                className="px-3 text-xs font-semibold text-tx-2 hover:text-tx"
              >
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (credOpen) {
    return (
      <form action={handleSaveCredentials} className="px-5 py-3 space-y-2 bg-sf-apoio">
        <p className="text-xs font-semibold text-tx">
          {user.username ? `Redefinir senha de acesso — ${user.name}` : `Definir acesso — ${user.name}`}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            name="username"
            defaultValue={user.username ?? user.email}
            required
            minLength={4}
            autoComplete="off"
            placeholder="Apelido de usuário"
            className="cfg-input bg-sf border border-regua text-tx placeholder:text-tx-3"
          />
          <input name="password" type="password" required minLength={6} autoComplete="new-password" placeholder="Senha (mín. 6)" className="cfg-input bg-sf border border-regua text-tx placeholder:text-tx-3" />
          <input name="confirm" type="password" required minLength={6} autoComplete="new-password" placeholder="Confirmar senha" className="cfg-input bg-sf border border-regua text-tx placeholder:text-tx-3" />
        </div>
        {credError && <p className="text-[11px] text-urgente bg-urgente-bg border border-urgente/20 rounded-md px-2.5 py-1.5">{credError}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-1.5 disabled:opacity-50">
            {pending ? "Salvando..." : user.username ? "Redefinir senha" : "Definir acesso"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCredOpen(false);
              setCredError(null);
            }}
            className="px-3 text-xs font-semibold text-tx-2 hover:text-tx"
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
        <p className="text-sm font-medium text-tx">{user.name}</p>
        <p className="text-xs text-tx-2 truncate">
          {user.role} {user.oab && `· ${user.oab}`} · {user.email}
          {user.phone && ` · ${user.phone}`}
          {user.username && ` · login: ${user.username}`}
        </p>
      </div>
      <Badge color={user.active ? "green" : "slate"}>{user.active ? "Ativo" : "Inativo"}</Badge>
      {user.isAdmin && <Badge color="gold">Admin</Badge>}
      {!user.isAdmin && user.financeAccess && <Badge color="green">Financeiro</Badge>}
      {credSuccess && <Badge color="green">Acesso definido</Badge>}
      {canManage && (
        <button
          onClick={() => {
            setLinkResult(null);
            setLinkError(null);
            setLinkOpen(true);
          }}
          data-tip="Gerar link de redefinição de senha"
          className="p-1.5 text-tx-3 hover:text-marca-tx hover:bg-marca-bg transition-colors"
        >
          <Link2 size={14} />
        </button>
      )}
      {canManage && !user.isAdmin && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setCredSuccess(false);
              setCredError(null);
              setCredOpen(true);
            }}
            data-tip={user.username ? "Redefinir senha" : "Definir acesso"}
            className="p-1.5 text-tx-3 hover:text-marca-tx hover:bg-marca-bg transition-colors"
          >
            <KeyRound size={14} />
          </button>
          <button
            onClick={handleToggleFinanceAccess}
            disabled={pending}
            data-tip={user.financeAccess ? "Remover acesso ao Financeiro" : "Conceder acesso ao Financeiro"}
            className={`p-1.5 transition-colors disabled:opacity-40 ${
              user.financeAccess
                ? "text-concluido hover:text-atencao hover:bg-atencao/10"
                : "text-tx-3 hover:text-concluido hover:bg-concluido-bg"
            }`}
          >
            {user.financeAccess ? <Wallet size={14} /> : <WalletCards size={14} />}
          </button>
          <button onClick={() => setEditing(true)} data-tip="Editar" className="p-1.5 text-tx-3 hover:text-tx hover:bg-sf-apoio transition-colors">
            <Pencil size={14} />
          </button>
          <button
            onClick={handleToggleActive}
            disabled={pending}
            data-tip={user.active ? "Inativar" : "Reativar"}
            className="p-1.5 text-tx-3 hover:text-aviso hover:bg-aviso-bg transition-colors disabled:opacity-40"
          >
            <Power size={14} />
          </button>
          <button onClick={handleDelete} disabled={pending} data-tip="Excluir definitivamente" className="p-1.5 text-tx-3 hover:text-atencao hover:bg-atencao/10 transition-colors disabled:opacity-40">
            <Trash2 size={14} />
          </button>
        </div>
      )}
      {error && (
        <span className="absolute right-5 top-full mt-1 z-10 w-72 text-[11px] bg-urgente-bg text-urgente border border-urgente/20 px-2.5 py-1.5 shadow-pop rounded-lg flex items-start gap-1.5">
          {error}
          <button onClick={() => setError(null)} className="ml-auto shrink-0">
            <X size={12} />
          </button>
        </span>
      )}
    </div>
  );
}
