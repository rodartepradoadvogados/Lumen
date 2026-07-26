"use client";

import { useState } from "react";

// Substituto de <input> puro pra campos com máscara (CPF/CNPJ, CEP, telefone — ver
// lib/masks.ts). Continua um input de formulário normal (mesmo `name`, funciona com FormData
// e Server Actions como antes) — só formata o valor a cada tecla digitada.
export default function MaskedInput({
  mask,
  defaultValue = "",
  className,
  name,
  placeholder,
  required,
}: {
  mask: (value: string) => string;
  defaultValue?: string;
  className?: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(() => mask(defaultValue));
  return (
    <input
      name={name}
      value={value}
      onChange={(e) => setValue(mask(e.target.value))}
      className={className}
      placeholder={placeholder}
      required={required}
      inputMode="numeric"
      autoComplete="off"
    />
  );
}
