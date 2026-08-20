"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Power, X } from "lucide-react";
import { createBankAccount, updateBankAccount, toggleBankAccountActive } from "@/lib/actions/settings";
import { Badge, formatCurrency } from "@/components/ui";
import MoneyInput from "@/components/MoneyInput";

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
        className="cfg-input bg-sf border border-regua text-tx placeholder:text-tx-3"
      />
      <input
        name="bank"
        defaultValue={defaults?.bank ?? ""}
        placeholder="Banco"
        className="cfg-input bg-sf border border-regua text-tx placeholder:text-tx-3"
      />
      <input
        name="agency"
        defaultValue={defaults?.agency ?? ""}
        placeholder="Agência"
        className="cfg-input bg-sf border border-regua text-tx placeholder:text-tx-3"
      />
      <input
        name="accountNumber"
        defaultValue={defaults?.accountNumber ?? ""}
        placeholder="Conta"
        className="cfg-input bg-sf border border-regua text-tx placeholder:text-tx-3"
      />
      <select name="type" defaultValue={defaults?.type ?? "CORRENTE"} className="cfg-input bg-sf border border-regua text-tx">
        {Object.entries(TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <MoneyInput
        name="initialBalance"
        defaultValue={String(defaults?.initialBalance ?? 0)}
        className="cfg-input bg-sf border border-regua text-tx"
      />
      <input
        name="notes"
        defaultValue={defaults?.notes ?? ""}
        placeholder="Observações (opcional)"
        className="cfg-input sm:col-span-2 bg-sf border border-regua text-tx placeholder:text-tx-3"
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
      <form action={handleSave} className="px-5 py-3 space-y-2 bg-sf-apoio">
        <Fields defaults={account} />
        {error && <p className="text-[11px] text-urgente bg-urgente-bg px-2.5 py-1.5">{error}</p>}
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

  return (
    <div className="flex items-center gap-3 px-5 py-3 relative">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-tx">{account.name}</p>
        <p className="text-xs text-tx-2 truncate">
          {[account.bank, account.agency && `Ag. ${account.agency}`, account.accountNumber && `Cc ${account.accountNumber}`, TYPE_LABELS[account.type]]
            .filter(Boolean)
            .join(" · ")}
          {account.initialBalance ? ` · Saldo inicial ${formatCurrency(account.initialBalance)}` : ""}
        </p>
      </div>
      <Badge color={account.active ? "green" : "slate"}>{account.active ? "Ativa" : "Inativa"}</Badge>
      <div className="flex items-center gap-1">
        <button onClick={() => setEditing(true)} data-tip="Editar" className="p-1.5 text-tx-3 hover:text-tx hover:bg-sf-apoio transition-colors">
          <Pencil size={14} />
        </button>
        <button
          onClick={handleToggle}
          disabled={pending}
          data-tip={account.active ? "Desativar" : "Reativar"}
          className="p-1.5 text-tx-3 hover:text-aviso hover:bg-aviso-bg transition-colors disabled:opacity-40"
        >
          <Power size={14} />
        </button>
      </div>
      {error && (
        <span className="absolute right-5 top-full mt-1 z-10 w-72 text-[11px] bg-urgente-bg text-urgente border border-urgente/20 px-2.5 py-1.5 shadow-pop flex items-start gap-1.5">
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
      <div className="divide-y divide-regua">
        {accounts.length === 0 && !adding && (
          <p className="px-5 py-4 text-sm text-tx-3">Nenhuma conta bancária cadastrada.</p>
        )}
        {accounts.map((a) => (
          <BankAccountRow key={a.id} account={a} />
        ))}
      </div>
      {adding ? (
        <form action={handleCreate} className="p-5 space-y-2 border-t border-regua bg-sf-apoio">
          <Fields />
          {error && <p className="text-[11px] text-urgente bg-urgente-bg px-2.5 py-1.5">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-1.5 disabled:opacity-50">
              {pending ? "Salvando..." : "Adicionar"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-3 text-xs font-semibold text-tx-2 hover:text-tx">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="p-5 border-t border-regua">
          <button onClick={() => setAdding(true)} className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2">
            Nova conta bancária
          </button>
        </div>
      )}
    </div>
  );
}
