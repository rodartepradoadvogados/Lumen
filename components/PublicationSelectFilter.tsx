"use client";

import { useRouter } from "next/navigation";

export type SelectFilterOption = { value: string; label: string; count?: number };

// Filtro por lista (Responsável, Citado) da fila de /publicacoes. As opções vêm sempre dos DADOS
// do escritório (usuários ativos, tags de advogado que existem nas publicações), com contagem —
// nenhum nome de advogado fica escrito no código, então funciona em qualquer escritório.
export default function PublicationSelectFilter({
  param,
  label,
  allLabel = "todos",
  neutro = false,
  options,
  value,
  baseParams,
}: {
  param: string;
  allLabel?: string;
  neutro?: boolean;
  label: string;
  options: SelectFilterOption[];
  value?: string;
  baseParams: Record<string, string | undefined>;
}) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams();
    Object.entries(baseParams).forEach(([k, v]) => v && k !== param && params.set(k, v));
    if (e.target.value) params.set(param, e.target.value);
    const s = params.toString();
    router.push(`/publicacoes${s ? `?${s}` : ""}`);
  }

  const active = !!value && !neutro;

  return (
    <select
      value={value || ""}
      onChange={handleChange}
      aria-label={label}
      className={`text-sm font-semibold px-2 min-h-11 md:min-h-9 w-44 max-md:w-full border cursor-pointer transition-colors ${
        active ? "bg-acao text-acao-tx border-acao" : "bg-sf text-tx-2 border-regua hover:bg-sf-apoio"
      }`}
    >
      <option value="">{label}: {allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {label}: {o.label}
          {o.count !== undefined ? ` (${o.count})` : ""}
        </option>
      ))}
    </select>
  );
}
