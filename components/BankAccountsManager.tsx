"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Power, X } from "lucide-react";
import { createBankAccount, updateBankAccount, toggleBankAccountActive } from "@/lib/actions/settings";
import { Badge, formatCurrency } from "@/components/ui";

const TYPE_LABELS: Record<string, string> = {
  CORRENTE: "Corrente",
  POUPANCA: "Poupança",
  INVESTIMENTO: "Investimento",
};

type BankAccount = {
  id: string;
  name: string;
  bank: string | null;
  agency: string | null;
  accountNumber: string | null;
  type: string;
  initialBalance: number;
  notes: string | null;
  active: boolean;
};

function Fields({ defaults }: { defaults?: Partial<BankAccount> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input
        name="name"
        defaultValue={defaults?.name ?? ""}
        required
        placeholder="Apelido (ex: Itaú Principal)"
        className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30"
      />
      <input
        name="bank"
        defaultValue={defaults?.bank ?? ""}
        placeholder="Banco"
        className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30"
      />
      <input
        name="agency"
        defaultValue={defaults?.agency ?? ""}
        placeholder="Agência"
        className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30"
      />
      <input
        name="accountNumber"
        defaultValue={defaults?.accountNumber ?? ""}
        placeholder="Conta"
        className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30"
      />
      <select name="type" defaultValue={defaults?.type ?? "CORRENTE"} className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50">
        {Object.entries(TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input
        name="initialBalance"
        type="number"
        step="0.01"
        defaultValue={defaults?.initialBalance ?? 0}
        placeholder="Saldo inicial (R$)"
        className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
      />
      <input
        name="notes"
        defaultValue={defaults?.notes ?? ""}
        placeholder="Observações (opcional)"
        className="cfg-input sm:col-span-2 dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30"
      />
    </div>
  );
}

function BankAccountRow({ account }: { account: BankAccount }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateBankAccount(account.id, {
        name: String(formData.get("name") || ""),
        bank: String(formData.get("bank") || ""),
        agency: String(formData.get("agency") || ""),
        accountNumber: String(formData.get("accountNumber") || ""),
        type: String(formData.get("type") || "CORRENTE"),
        initialBalance: String(formData.get("initialBalance") || "0"),
        notes: String(formData.get("notes") || ""),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const result = await toggleBankAccountActive(account.id);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <form action={handleSave} className="px-5 py-3 space-y-2 bg-cream-50 dark:bg-navy-800">
        <Fields defaults={account} />
        {error && <p className="text-[11px] text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-2.5 py-1.5">{error}</p>}
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

  return (
    <div className="flex items-center gap-3 px-5 py-3 relative">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{account.name}</p>
        <p className="text-xs text-navy-800/45 dark:text-cream-50/45 truncate">
          {[account.bank, account.agency && `Ag. ${account.agency}`, account.accountNumber && `Cc ${account.accountNumber}`, TYPE_LABELS[account.type]]
            .filter(Boolean)
            .join(" · ")}
          {account.initialBalance ? ` · Saldo inicial ${formatCurrency(account.initialBalance)}` : ""}
        </p>
      </div>
      <Badge color={account.active ? "green" : "slate"}>{account.active ? "Ativa" : "Inativa"}</Badge>
      <div className="flex items-center gap-1">
        <button onClick={() => setEditing(true)} data-tip="Editar" className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-navy-900 dark:hover:text-cream-50 hover:bg-cream-100 dark:hover:bg-white/10 transition-colors">
          <Pencil size={14} />
        </button>
        <button
          onClick={handleToggle}
          disabled={pending}
          data-tip={account.active ? "Desativar" : "Reativar"}
          className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors disabled:opacity-40"
        >
          <Power size={14} />
        </button>
      </div>
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

export default function BankAccountsManager({ accounts }: { accounts: BankAccount[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createBankAccount({
        name: String(formData.get("name") || ""),
        bank: String(formData.get("bank") || ""),
        agency: String(formData.get("agency") || ""),
        accountNumber: String(formData.get("accountNumber") || ""),
        type: String(formData.get("type") || "CORRENTE"),
        initialBalance: String(formData.get("initialBalance") || "0"),
        notes: String(formData.get("notes") || ""),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setAdding(false);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="divide-y divide-navy-800/5 dark:divide-white/10">
        {accounts.length === 0 && !adding && (
          <p className="px-5 py-4 text-sm text-navy-800/40 dark:text-cream-50/40">Nenhuma conta bancária cadastrada.</p>
        )}
        {accounts.map((a) => (
          <BankAccountRow key={a.id} account={a} />
        ))}
      </div>
      {adding ? (
        <form action={handleCreate} className="p-5 space-y-2 border-t border-navy-800/8 dark:border-white/10 bg-cream-50 dark:bg-navy-800">
          <Fields />
          {error && <p className="text-[11px] text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-2.5 py-1.5">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
              {pending ? "Salvando..." : "Adicionar"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-3 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="p-5 border-t border-navy-800/8 dark:border-white/10">
          <button onClick={() => setAdding(true)} className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2">
            Nova conta bancária
          </button>
        </div>
      )}
    </div>
  );
}
