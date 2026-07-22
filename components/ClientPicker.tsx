"use client";

import { useState } from "react";

type Client = { id: string; name: string };

const CLIENT_ROLE_OPTIONS = ["Autor", "Réu", "Interessado", "Recorrente", "Recorrido", "Outro"];

// Alterna entre selecionar um cliente já cadastrado e cadastrar um novo cliente inline,
// direto no formulário de Novo Processo — sem precisar sair para a tela de Clientes.
// Os inputs mantêm os mesmos `name`s (clientId / newClientName / clientRole) para que o
// form pai (server action) os leia via FormData normalmente.
export default function ClientPicker({ clients, inputClassName }: { clients: Client[]; inputClassName: string }) {
  const [mode, setMode] = useState<"selecionar" | "novo">("selecionar");

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Cliente</label>
        <div className="flex gap-1 bg-cream-100 dark:bg-navy-800 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setMode("selecionar")}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
              mode === "selecionar" ? "bg-white dark:bg-navy-950 shadow-sm text-navy-900 dark:text-cream-50" : "text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
            }`}
          >
            Selecionar cliente
          </button>
          <button
            type="button"
            onClick={() => setMode("novo")}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
              mode === "novo" ? "bg-white dark:bg-navy-950 shadow-sm text-navy-900 dark:text-cream-50" : "text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
            }`}
          >
            Cadastrar novo cliente
          </button>
        </div>
      </div>

      {mode === "selecionar" ? (
        <select name="clientId" className={inputClassName}>
          <option value="">Selecionar cliente...</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        <input name="newClientName" className={inputClassName} placeholder="Nome do novo cliente" />
      )}

      <div className="mt-2">
        <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Papel do cliente no processo</label>
        <select name="clientRole" defaultValue="" className={inputClassName}>
          <option value="">Não definido</option>
          {CLIENT_ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
