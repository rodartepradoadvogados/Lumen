"use client";

import { useRouter } from "next/navigation";

export default function PublicationRespFilter({
  users,
  value,
  baseParams,
}: {
  users: { id: string; name: string }[];
  value?: string;
  baseParams: Record<string, string | undefined>;
}) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams();
    Object.entries(baseParams).forEach(([k, v]) => v && params.set(k, v));
    if (e.target.value) params.set("resp", e.target.value);
    const s = params.toString();
    router.push(`/publicacoes${s ? `?${s}` : ""}`);
  }

  const active = !!value;

  return (
    <select
      value={value || ""}
      onChange={handleChange}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
        active ? "bg-navy-900 text-white border-navy-900" : "bg-white text-navy-800/60 border-navy-800/10 hover:bg-cream-100"
      }`}
    >
      <option value="">Responsável: Todos</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}
