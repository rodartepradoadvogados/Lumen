"use client";

import { useEffect, useRef, useState } from "react";

// Rótulo do botão reage ao <select name="type"> do mesmo <form> (ouvindo "change" no DOM em
// vez de virar o formulário inteiro num client component): "Salvar Processo" quando o tipo é
// Judicial, "Salvar Caso" para os demais tipos (Extrajudicial/Atendimento/Consultivo).
export default function SaveCaseButton({ defaultType }: { defaultType: string }) {
  const [type, setType] = useState(defaultType);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const form = buttonRef.current?.closest("form");
    const select = form?.elements.namedItem("type") as HTMLSelectElement | null;
    if (!select) return;
    setType(select.value);
    const handleChange = () => setType(select.value);
    select.addEventListener("change", handleChange);
    return () => select.removeEventListener("change", handleChange);
  }, []);

  return (
    <button
      ref={buttonRef}
      type="submit"
      className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
    >
      {type === "JUDICIAL" ? "Salvar Processo" : "Salvar Caso"}
    </button>
  );
}
