"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Power, Trash2, X, Wallet, WalletCards, KeyRound, Link2, Copy, Check, PhoneIncoming, PhoneOff, ChevronDown } from "lucide-react";
import {
  updateUser,
  toggleUserActive,
  deleteUser,
  setFinanceAccess,
  setRecebeTransferencia,
  setUserCredentials,
} from "@/lib/actions/settings";
import { adminGenerateResetLink } from "@/lib/actions/auth";
import { Badge } from "@/components/ui";
import PhoneInput from "@/components/PhoneInput";
import { FUSO_DO_ESCRITORIO } from "@/lib/horaDeBrasilia";

const ROLE_OPTIONS = ["Advogado", "Sócio", "Estagiário", "Financeiro", "Recepcionista/Secretária", "Marketing", "Contador"];

/**
 * As opções do seletor, garantindo que o papel JÁ GRAVADO da pessoa esteja entre elas.
 *
 * "Recepcionista" virou "Recepcionista/Secretária", e quem estava cadastrado antes continua com o
 * valor antigo no banco. Sem isto, o seletor abriria mostrando "Advogado" para a recepcionista —
 * e bastaria alguém salvar o formulário sem reparar para a pessoa virar advogada de verdade.
 */
function opcoesDePapel(papelAtual: string): string[] {
  return ROLE_OPTIONS.includes(papelAtual) ? ROLE_OPTIONS : [papelAtual, ...ROLE_OPTIONS];
}

type User = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  oab: string | null;
  phone: string | null;
  phoneDdi: string | null;
  color: string;
  active: boolean;
  isAdmin: boolean;
  financeAccess: boolean;
  recebeTransferencia: boolean;
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
        phoneDdi: String(formData.get("phoneDdi") || ""),
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

  function handleToggleTransferencia() {
    setError(null);
    startTransition(async () => {
      const result = await setRecebeTransferencia(user.id, !user.recebeTransferencia);
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
            {opcoesDePapel(user.role).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input name="oab" defaultValue={user.oab ?? ""} placeholder="OAB (opcional)" className="cfg-input bg-sf border border-regua text-tx placeholder:text-tx-3" />
          <PhoneInput
            name="phone"
            defaultValue={user.phone ?? ""}
            defaultDdi={user.phoneDdi}
            placeholder="Telefone (opcional)"
            className="cfg-input bg-sf border border-regua text-tx placeholder:text-tx-3"
          />
          <label className="flex items-center gap-2 text-xs font-medium text-tx-2">
            Cor na agenda
            <input name="color" type="color" defaultValue={user.color} className="cfg-input bg-sf border border-regua h-9 w-16 p-1" />
          </label>
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
      ? new Date(linkResult.expiresAt).toLocaleString("pt-BR", { timeZone: FUSO_DO_ESCRITORIO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
      : null;
    return (
      <div className="px-5 py-3 space-y-2 bg-sf-apoio">
        <p className="text-xs font-semibold text-tx">Link de redefinição de senha — {user.name}</p>
        {!linkResult ? (
          <>
            <p className="text-etiqueta text-tx-2">
              Gera um link de uso único para {user.name} escolher uma nova senha, sem depender de e-mail — entregue por WhatsApp ou pessoalmente.
            </p>
            {linkError && (
              <p className="text-etiqueta text-urgente bg-urgente-bg border border-linha-urgente rounded-md px-2.5 py-1.5">
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
                data-tip="Copiar" aria-label="Copiar"
                className="p-2 text-tx-2 hover:text-tx hover:bg-sf-apoio shrink-0 rounded-md"
              >
                {linkCopied ? <Check size={14} className="text-concluido" /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-etiqueta text-aviso">
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
        {credError && <p className="text-etiqueta text-urgente bg-urgente-bg border border-linha-urgente rounded-md px-2.5 py-1.5">{credError}</p>}
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
    // flex-wrap: a linha tem até 8 botões de 44px no celular (a regra de toque de app/globals.css) e
    // estourava o <main> em 124px; agora os botões quebram para a linha de baixo.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 relative">
      {/* Avatar NEUTRO: a cor cadastrada da pessoa não é categoria do produto (DESIGN.md §2.1) e as
          iniciais em `text-white` sobre ela mediam de 2,07 a 3,6:1. A cor continua editável e é
          usada onde ela significa algo (agenda). */}
      <span aria-hidden="true" className="h-8 w-8 rounded-full flex items-center justify-center bg-sf-apoio border border-regua-forte text-tx text-xs font-bold shrink-0">
        {user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
      </span>
      <div className="flex-1 min-w-[12rem]">
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
      {user.recebeTransferencia && <Badge color="blue">Recebe leads</Badge>}
      {credSuccess && <Badge color="green">Acesso definido</Badge>}
      {/* AÇÕES COM RÓTULO (consolidado R17): eram até 8 ícones sem texto (só `data-tip`), em número
          diferente de uma pessoa para outra (sócio: 3; os demais: 7 a 8), e no celular estouravam a
          linha. Agora: "Editar" e um menu "Gerenciar acesso" com uma ação por linha, escrita por
          extenso. As REGRAS não mudaram:
            - Editar (nome/e-mail/OAB/telefone) vale também para sócio: é reversível e o servidor
              (updateUser) já permitia; só a tela escondia, e sem isso não havia como mudar o e-mail
              de login de um sócio.
            - O rodízio de leads também vale para sócio: num escritório de dois sócios e nenhum
              empregado, esconder o botão deixaria a fila vazia para sempre, sem erro nenhum.
            - Credenciais, Financeiro, inativar e excluir continuam bloqueados para sócio: um
              administrador não pode travar nem apagar outro. */}
      {canManage && (
        <button
          onClick={() => setEditing(true)}
          className="h-8 px-3 inline-flex items-center gap-1.5 border-2 border-regua-forte bg-transparent hover:bg-acao-bg text-tx text-sm font-semibold transition-colors"
        >
          <Pencil size={14} aria-hidden="true" /> Editar
        </button>
      )}
      {canManage && (
        <details className="relative group/menu">
          <summary className="list-none cursor-pointer h-8 px-3 inline-flex items-center gap-1.5 border-2 border-regua-forte bg-transparent hover:bg-acao-bg text-tx text-sm font-semibold transition-colors [&::-webkit-details-marker]:hidden">
            Gerenciar acesso <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className="absolute right-0 top-full mt-1 z-20 w-72 bg-sf border border-regua-forte shadow-menu py-1">
            <button
              onClick={() => {
                setLinkResult(null);
                setLinkError(null);
                setLinkOpen(true);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-tx hover:bg-sf-apoio"
            >
              <Link2 size={14} aria-hidden="true" className="text-tx-3" /> Gerar link de redefinição de senha
            </button>
            <button
              onClick={handleToggleTransferencia}
              disabled={pending}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-tx hover:bg-sf-apoio disabled:opacity-40"
            >
              {user.recebeTransferencia ? <PhoneOff size={14} aria-hidden="true" className="text-tx-3" /> : <PhoneIncoming size={14} aria-hidden="true" className="text-tx-3" />}
              {user.recebeTransferencia ? "Tirar do rodízio de leads do WhatsApp" : "Incluir no rodízio de leads do WhatsApp"}
            </button>
            {!user.isAdmin && (
              <>
                <button
                  onClick={() => {
                    setCredSuccess(false);
                    setCredError(null);
                    setCredOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-tx hover:bg-sf-apoio"
                >
                  <KeyRound size={14} aria-hidden="true" className="text-tx-3" /> {user.username ? "Redefinir senha" : "Definir acesso"}
                </button>
                <button
                  onClick={handleToggleFinanceAccess}
                  disabled={pending}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-tx hover:bg-sf-apoio disabled:opacity-40"
                >
                  {user.financeAccess ? <Wallet size={14} aria-hidden="true" className="text-concluido" /> : <WalletCards size={14} aria-hidden="true" className="text-tx-3" />}
                  {user.financeAccess ? "Remover acesso ao Financeiro" : "Conceder acesso ao Financeiro"}
                </button>
                <button
                  onClick={handleToggleActive}
                  disabled={pending}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-tx hover:bg-sf-apoio disabled:opacity-40"
                >
                  <Power size={14} aria-hidden="true" className="text-tx-3" /> {user.active ? "Inativar" : "Reativar"}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={pending}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-urgente hover:bg-grave-bg disabled:opacity-40 border-t border-regua mt-1"
                >
                  <Trash2 size={14} aria-hidden="true" /> Excluir definitivamente
                </button>
              </>
            )}
          </div>
        </details>
      )}
      {error && (
        <span className="absolute right-5 top-full mt-1 z-10 w-72 text-etiqueta bg-urgente-bg text-urgente border border-linha-urgente px-2.5 py-1.5 shadow-pop rounded-lg flex items-start gap-1.5">
          {error}
          <button onClick={() => setError(null)} className="ml-auto shrink-0">
            <X size={12} />
          </button>
        </span>
      )}
    </div>
  );
}
