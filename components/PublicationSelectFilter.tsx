"use client";

import { useRouter } from "next/navigation";

export type SelectFilterOption = { value: string; label: string; count?: number };

// Filtro por lista (Responsável, Citado) da fila de /publicacoes. As opções vêm sempre dos DADOS
// do escritório (usuários ativos, tags de advogado que existem nas publicações), com contagem —
// nenhum nome de advogado fica escrito no código, então funciona em qualquer escritório.
export default function PublicationSelectFilter({
  param,
  label,
  options,
  value,
  baseParams,
}: {
  param: "resp" | "adv";
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

  const active = !!value;

  return (
    <select
      value={value || ""}
      onChange={handleChange}
      aria-label={label}
      className={`text-xs font-semibold px-3 py-1.5 border cursor-pointer transition-colors ${
        active ? "bg-acao text-acao-tx border-acao" : "bg-sf text-tx-2 border-regua hover:bg-sf-apoio"
      }`}
    >
      <option value="">{label}: todos</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
          {o.count !== undefined ? ` (${o.count})` : ""}
        </option>
      ))}
    </select>
  );
}
