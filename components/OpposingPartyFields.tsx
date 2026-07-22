"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";

// Cadastro simplificado da parte adversa: só aparece expandido quando o usuário clica,
// já que a maioria dos casos só precisa do nome. Nome é o único campo obrigatório.
export default function OpposingPartyFields({ inputClassName }: { inputClassName: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-semibold text-navy-900 dark:text-cream-50 hover:text-gold-700 dark:hover:text-gold-400 transition-colors"
      >
        <UserPlus size={14} /> Cadastrar parte adversa
      </button>
    );
  }

  return (
    <div>
      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Parte Adversa</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
        <input name="opposingPartyName" required className={inputClassName + " sm:col-span-2"} placeholder="Nome (obrigatório)" />
        <input name="opposingPartyDocument" className={inputClassName} placeholder="CPF/CNPJ (opcional)" />
        <select name="opposingPartyRole" defaultValue="" className={inputClassName}>
          <option value="">Polo não definido</option>
          <option value="AUTOR">Autor</option>
          <option value="REU">Réu</option>
          <option value="OUTRO">Outro</option>
        </select>
        <input name="opposingPartyAddress" className={inputClassName + " sm:col-span-2"} placeholder="Endereço (opcional)" />
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-1.5 text-[11px] font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
      >
        Remover parte adversa
      </button>
    </div>
  );
}
