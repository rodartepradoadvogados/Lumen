"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";

type Client = { id: string; name: string };
type Entry = {
  key: number;
  mode: "selecionar" | "novo";
  clientId: string;
  newClientName: string;
  newClientDocument: string;
  newClientAddress: string;
  role: string;
};

export type ClientPickerInitial = { clientId?: string | null; clientName?: string; role?: string | null }[];

const CLIENT_ROLE_OPTIONS = ["Autor", "Réu", "Terceiro Interessado", "Recorrente", "Recorrido", "Outro"];

// Alterna entre selecionar um cliente já cadastrado e cadastrar um novo cliente inline, direto no
// formulário de Novo/Editar Processo — sem precisar sair para a tela de Clientes. Cada entrada
// vira um hidden input `clientEntries` com um JSON {clientId, newClientName, role} — o form pai
// (server action ou handler client-side) lê todos via formData.getAll("clientEntries") e faz
// JSON.parse de cada um. Suporta litisconsórcio: "+ Adicionar outro cliente" acrescenta mais uma
// entrada independente, cada uma com seu próprio modo (selecionar/novo) e papel.
// hideRole: esconde o seletor "Papel do cliente no processo". Autor/Réu/Recorrente só existem
// dentro de uma relação processual — num Caso (extrajudicial, consultivo, atendimento) não há
// processo, e perguntar o papel ali é pedir um dado que não existe. O campo `role` continua
// saindo no JSON (vazio), porque createCase já trata "" como não informado: assim o formato do
// hidden input não muda conforme a tela, e nenhum consumidor precisa saber deste modo.
export default function ClientPicker({
  clients,
  inputClassName,
  initial,
  hideRole = false,
}: {
  clients: Client[];
  inputClassName: string;
  initial?: ClientPickerInitial;
  hideRole?: boolean;
}) {
  const counter = useRef(0);
  const [entries, setEntries] = useState<Entry[]>(() => {
    if (initial && initial.length > 0) {
      return initial.map((i) => ({
        key: counter.current++,
        mode: i.clientId ? "selecionar" : "novo",
        clientId: i.clientId || "",
        newClientName: i.clientName || "",
        newClientDocument: "",
        newClientAddress: "",
        role: i.role || "",
      }));
    }
    counter.current += 1;
    return [{ key: 0, mode: "selecionar", clientId: "", newClientName: "", newClientDocument: "", newClientAddress: "", role: "" }];
  });

  function addEntry() {
    setEntries((es) => [
      ...es,
      { key: counter.current++, mode: "selecionar", clientId: "", newClientName: "", newClientDocument: "", newClientAddress: "", role: "" },
    ]);
  }
  function removeEntry(key: number) {
    setEntries((es) => (es.length > 1 ? es.filter((e) => e.key !== key) : es));
  }
  function update(key: number, patch: Partial<Entry>) {
    setEntries((es) => es.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, idx) => (
        <div key={entry.key} className={idx > 0 ? "pt-3 border-t border-regua" : ""}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-medium text-tx-2">
              {idx === 0 ? "Cliente" : `Cliente ${idx + 1} (litisconsórcio)`}
            </label>
            <div className="flex items-center gap-1.5">
              <div className="flex gap-1 bg-sf-apoio p-0.5">
                <button
                  type="button"
                  onClick={() => update(entry.key, { mode: "selecionar" })}
                  className={`text-[11px] font-semibold px-2.5 py-1 transition-colors ${
                    entry.mode === "selecionar"
                      ? "bg-sf text-tx"
                      : "text-tx-2 hover:text-tx"
                  }`}
                >
                  Selecionar cliente
                </button>
                <button
                  type="button"
                  onClick={() => update(entry.key, { mode: "novo" })}
                  className={`text-[11px] font-semibold px-2.5 py-1 transition-colors ${
                    entry.mode === "novo"
                      ? "bg-sf text-tx"
                      : "text-tx-2 hover:text-tx"
                  }`}
                >
                  Cadastrar novo cliente
                </button>
              </div>
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeEntry(entry.key)}
                  aria-label="Remover cliente"
                  className="p-1 text-tx-3 hover:text-atencao"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {entry.mode === "selecionar" ? (
            <select value={entry.clientId} onChange={(e) => update(entry.key, { clientId: e.target.value })} className={inputClassName}>
              <option value="">Selecionar cliente...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="space-y-2">
              <input
                value={entry.newClientName}
                onChange={(e) => update(entry.key, { newClientName: e.target.value })}
                className={inputClassName}
                placeholder="Nome do novo cliente"
              />
              {/* Mesmos dois campos que já existem para parte adversa (OpposingPartyFields) —
                  pedido explícito: cliente cadastrado na hora, direto do formulário do processo,
                  sem CPF/endereço obrigava passar depois pela tela de Clientes pra completar. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={entry.newClientDocument}
                  onChange={(e) => update(entry.key, { newClientDocument: e.target.value })}
                  className={inputClassName}
                  placeholder="CPF/CNPJ (opcional)"
                />
                <input
                  value={entry.newClientAddress}
                  onChange={(e) => update(entry.key, { newClientAddress: e.target.value })}
                  className={inputClassName}
                  placeholder="Endereço (opcional)"
                />
              </div>
            </div>
          )}

          {!hideRole && (
            <div className="mt-2">
              <label className="text-xs font-medium text-tx-2">Papel do cliente no processo</label>
              <select value={entry.role} onChange={(e) => update(entry.key, { role: e.target.value })} className={inputClassName}>
                <option value="">Não definido</option>
                {CLIENT_ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}

          <input
            type="hidden"
            name="clientEntries"
            value={JSON.stringify({
              clientId: entry.mode === "selecionar" ? entry.clientId : "",
              newClientName: entry.mode === "novo" ? entry.newClientName : "",
              newClientDocument: entry.mode === "novo" ? entry.newClientDocument : "",
              newClientAddress: entry.mode === "novo" ? entry.newClientAddress : "",
              // Com hideRole, manda vazio em vez do que estivesse em `entry.role`: sem isso, um
              // papel escolhido antes de alternar para o fluxo de Caso viajaria escondido.
              role: hideRole ? "" : entry.role,
            })}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={addEntry}
        className="flex items-center gap-1.5 text-xs font-semibold text-tx hover:text-marca-tx transition-colors"
      >
        <Plus size={14} /> Adicionar outro cliente (litisconsórcio)
      </button>
    </div>
  );
}
