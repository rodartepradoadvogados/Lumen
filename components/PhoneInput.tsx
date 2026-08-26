"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { maskPhone, maskDigitsOnly, onlyDigits } from "@/lib/masks";
import { COUNTRIES, DEFAULT_COUNTRY, findCountryByDdi, type Country } from "@/lib/countries";

export type PhoneValue = { ddi: string; numero: string };

// Campo de telefone com código de país (DESIGN-SYSTEM.md — correção do bug de envio por
// WhatsApp: número cadastrado sem DDI não é reconhecido pelo wa.me). Duas linhas: seletor de
// país com busca (fechado, Brasil pré-selecionado) + o número em si (máscara nacional quando o
// país é o Brasil, dígito livre para qualquer outro — os formatos variam demais para valer uma
// máscara fixa por DDI); abaixo, uma opção para digitar o código do país livremente, para o caso
// raro de um país fora da lista fechada.
//
// Renderiza dois campos de formulário a partir de `name`: `name` (o número, como o
// MaskedInput de antes) e `${name}Ddi` (dígitos do DDI) — quem já lê `formData.get(name)` só
// precisa somar `formData.get(`${name}Ddi`)`.
//
// Modo não-controlado por padrão (estado interno, como o MaskedInput); passe `value`+`onChange`
// para os poucos casos que precisam prefiller o telefone programaticamente (ex.: ao escolher um
// cliente já cadastrado numa busca).
export default function PhoneInput({
  name,
  defaultDdi,
  defaultValue = "",
  value,
  onChange,
  className,
  placeholder,
  required,
}: {
  name: string;
  defaultDdi?: string | null;
  defaultValue?: string;
  value?: PhoneValue;
  onChange?: (v: PhoneValue) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const controlled = value !== undefined && onChange !== undefined;
  const initialDdi = defaultDdi || DEFAULT_COUNTRY.ddi;

  const [ddiState, setDdiState] = useState(initialDdi);
  const [numeroState, setNumeroState] = useState(() =>
    findCountryByDdi(initialDdi)?.iso === "BR" ? maskPhone(defaultValue) : maskDigitsOnly(defaultValue)
  );
  // País fora da lista fechada (DDI incomum, registro antigo) já nasce no modo "livre" — sem
  // isso o DDI cadastrado sumiria por trás do seletor sem equivalente na lista.
  const [livre, setLivre] = useState(() => !findCountryByDdi(initialDdi));
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const ddi = controlled ? value!.ddi : ddiState;
  const numero = controlled ? value!.numero : numeroState;
  const isBR = findCountryByDdi(ddi)?.iso === "BR";

  function emit(next: PhoneValue) {
    if (controlled) onChange!(next);
    else {
      setDdiState(next.ddi);
      setNumeroState(next.numero);
    }
  }

  function selecionarPais(c: Country) {
    const remasked = c.iso === "BR" ? maskPhone(onlyDigits(numero)) : maskDigitsOnly(numero);
    emit({ ddi: c.ddi, numero: remasked });
    setOpen(false);
    setFiltro("");
  }

  function onNumeroChange(raw: string) {
    emit({ ddi, numero: isBR ? maskPhone(raw) : maskDigitsOnly(raw) });
  }

  function onDdiLivreChange(raw: string) {
    emit({ ddi: onlyDigits(raw).slice(0, 4), numero });
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.nome.toLowerCase().includes(q) || c.ddi.includes(q));
  }, [filtro]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-stretch gap-2" ref={containerRef}>
        {!livre ? (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="h-full flex items-center gap-1 border border-regua rounded-md px-2.5 text-sm text-tx bg-sf whitespace-nowrap"
            >
              +{ddi}
              <ChevronDown size={13} strokeWidth={1.5} className="text-tx-3" />
            </button>
            {open && (
              <div className="absolute left-0 top-full mt-1 w-64 rounded-lg bg-sf border border-regua shadow-pop z-50 overflow-hidden">
                <div className="flex items-center gap-2 border-b border-regua px-2.5 py-2">
                  <Search size={13} strokeWidth={1.5} className="text-tx-3 shrink-0" />
                  <input
                    autoFocus
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    placeholder="Buscar país..."
                    className="w-full text-sm bg-transparent outline-none text-tx placeholder:text-tx-3"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto scrollbar-thin">
                  {filtered.length === 0 && <p className="px-3 py-2.5 text-xs text-tx-2">Nenhum país encontrado.</p>}
                  {filtered.map((c) => (
                    <button
                      key={c.iso}
                      type="button"
                      onClick={() => selecionarPais(c)}
                      className="flex items-center justify-between w-full px-3 py-2 text-left text-sm hover:bg-sf-apoio transition-colors"
                    >
                      <span className="truncate">{c.nome}</span>
                      <span className="text-tx-3 text-xs shrink-0">+{c.ddi}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <input type="hidden" name={`${name}Ddi`} value={ddi} />
          </div>
        ) : (
          <input
            name={`${name}Ddi`}
            value={ddi}
            onChange={(e) => onDdiLivreChange(e.target.value)}
            placeholder="DDI"
            inputMode="numeric"
            autoComplete="off"
            className="w-16 shrink-0 border border-regua rounded-md px-2 text-sm text-tx bg-sf text-center"
          />
        )}
        <input
          name={name}
          value={numero}
          onChange={(e) => onNumeroChange(e.target.value)}
          className={className}
          placeholder={placeholder ?? (isBR ? "(62) 98168-9358" : "número")}
          required={required}
          inputMode="numeric"
          autoComplete="off"
        />
      </div>
      <label className="flex items-center gap-1.5 text-[11px] text-tx-2">
        <input type="checkbox" checked={livre} onChange={(e) => setLivre(e.target.checked)} className="accent-acao" />
        Digitar código do país livremente
      </label>
    </div>
  );
}
