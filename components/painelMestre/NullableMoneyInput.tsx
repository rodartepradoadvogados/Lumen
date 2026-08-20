"use client";

import { useState } from "react";

// Campo de preço que sabe representar "sem preço" (null) — diferente de MoneyInput (sempre
// formata "R$ 0,00", nunca fica vazio de verdade), necessário aqui porque "deixe tudo sem preço"
// precisa ser um estado real, não um zero disfarçado. Texto livre com estado interno (não
// re-sincroniza com `value` a cada tecla) pra permitir digitar o ponto decimal sem o valor
// formatado "comer" o cursor no meio da digitação.
export default function NullableMoneyInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(value != null ? String(value) : "");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
    setText(raw);
    if (raw === "") {
      onChange(null);
      return;
    }
    const n = Number(raw);
    if (!Number.isNaN(n)) onChange(n);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  );
}
