"use client";

import { useEffect, useRef, useState } from "react";

// Campo de valor monetário com máscara "R$ 0,00" ao vivo: os dígitos digitados preenchem da
// direita pra esquerda (como em qualquer app bancário), sempre formatado — nunca aparece um campo
// vazio nem um número cru sem separador de milhar/decimal. Pedido explícito do usuário: "os campos
// de preenchimento de valores devem puxar, por regra, o padrão R$ 00,00, e à medida que vai
// digitando, vai preenchendo já nesse formato".
//
// Dois modos de uso, espelhando o dual-mode de EntityPicker.tsx:
//   - controlado (`value`+`onChange`): quando o form já mantém o valor em state (a maioria dos
//     modais de lançamento) — `value`/`onChange` carregam a STRING DECIMAL crua ("1234.56"), não a
//     formatada, então todo `parseFloat(amount)` existente continua funcionando sem mudança.
//   - não controlado (`name`+`defaultValue`): quando o valor só é lido via FormData no submit —
//     mantém state interno e espelha num `<input type="hidden">`, mesmo truque de EntityPicker.
function centsToDecimal(digits: string): string {
  const n = parseInt(digits || "0", 10);
  return (n / 100).toFixed(2);
}

function formatBRL(decimal: string): string {
  const n = parseFloat(decimal || "0") || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function MoneyInput({
  name,
  defaultValue,
  value,
  onChange,
  required,
  disabled,
  className,
  id,
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "0");
  const current = controlled ? value! : internal;
  const inputRef = useRef<HTMLInputElement>(null);

  // Máscara de preenchimento-por-dígito exige que o cursor sempre fique no fim — do contrário,
  // editar no meio do valor formatado produziria um resultado imprevisível (o texto inteiro é
  // reinterpretado como dígitos a cada tecla, não só o que está antes/depois do cursor).
  useEffect(() => {
    const el = inputRef.current;
    if (el && document.activeElement === el) el.setSelectionRange(el.value.length, el.value.length);
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "");
    const next = centsToDecimal(digits);
    if (controlled) onChange?.(next);
    else setInternal(next);
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={current} />}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        id={id}
        required={required}
        disabled={disabled}
        value={formatBRL(current)}
        onChange={handleChange}
        className={className}
      />
    </>
  );
}
