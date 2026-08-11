"use client";

import { useState } from "react";
import type { TribunalCatalogEntry } from "@/lib/tribunaisCatalog";
import TribunalPickerModal from "@/components/TribunalPickerModal";

// Conjunto de 4 campos autocontidos (sigla/nome/sistema/link) + botão para abrir o seletor do
// catálogo. Reutilizável tanto no formulário nativo de Novo Processo (via `name=` lido por
// FormData) quanto dentro do EditCaseModal — mesmo princípio de MaskedInput.tsx: estado próprio,
// mas continua um <input> comum, editável à mão a qualquer momento (selecionar no modal só
// preenche os campos, não trava a edição manual depois).
export default function TribunalFields({
  tribunais,
  defaultSigla,
  defaultNome,
  defaultSistema,
  defaultLink,
  inputClassName,
}: {
  tribunais: TribunalCatalogEntry[];
  defaultSigla?: string | null;
  defaultNome?: string | null;
  defaultSistema?: string | null;
  defaultLink?: string | null;
  inputClassName?: string;
}) {
  const [sigla, setSigla] = useState(defaultSigla ?? "");
  const [nome, setNome] = useState(defaultNome ?? "");
  const [sistema, setSistema] = useState(defaultSistema ?? "");
  const [link, setLink] = useState(defaultLink ?? "");

  function handleSelect(t: TribunalCatalogEntry) {
    setSigla(t.sigla);
    setNome(t.nome);
    setSistema(t.sistemas);
    setLink(t.portalUrl);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-tx-2">Tribunal</label>
        <TribunalPickerModal
          tribunais={tribunais}
          onSelect={handleSelect}
          trigger={
            <button type="button" className="text-xs font-semibold text-marca-tx hover:underline">
              Selecionar da lista
            </button>
          }
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input name="tribunalSigla" value={sigla} onChange={(e) => setSigla(e.target.value)} placeholder="Sigla (ex.: TJGO)" className={inputClassName} />
        <input name="tribunalNome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do tribunal" className={inputClassName} />
      </div>
      <input name="tribunalSistema" value={sistema} onChange={(e) => setSistema(e.target.value)} placeholder="Sistema (ex.: PJe, eproc)" className={inputClassName} />
      <input name="tribunalLink" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link de acesso ao sistema" className={inputClassName} />
    </div>
  );
}
