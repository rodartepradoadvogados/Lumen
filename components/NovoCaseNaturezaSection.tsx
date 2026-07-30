"use client";

import { useState } from "react";
import type { TribunalCatalogEntry } from "@/lib/tribunaisCatalog";
import TribunalFields from "@/components/TribunalFields";
import OrgaoAdministrativoPicker from "@/components/OrgaoAdministrativoPicker";
import NaturezaPicker from "@/components/NaturezaPicker";

// Bloco de abertura do formulário de Novo Processo: decide a NATUREZA (Judicial x Administrativo,
// ver lib/caseNatureza.ts) e, a partir dela, alterna os campos "de tramitação" que dependem dela —
// número do processo (máscara CNJ x texto livre) e tribunal x órgão administrativo. Precisa ser
// client component porque é a ÚNICA parte do formulário que reage à escolha do usuário sem
// recarregar a página; todo o resto (cliente, partes, área, valor, responsável, anexos...) é comum
// às duas naturezas e continua no server component (app/(app)/processos/novo/page.tsx), fora daqui.
export default function NovoCaseNaturezaSection({
  tribunais,
  defaultNatureza,
  defaultProcessNumber,
  inputClassName,
}: {
  tribunais: TribunalCatalogEntry[];
  defaultNatureza: "JUDICIAL" | "ADMINISTRATIVO";
  defaultProcessNumber?: string;
  inputClassName?: string;
}) {
  const [natureza, setNatureza] = useState<"JUDICIAL" | "ADMINISTRATIVO">(defaultNatureza);
  const isAdministrativo = natureza === "ADMINISTRATIVO";

  return (
    <div className="space-y-4">
      <NaturezaPicker value={natureza} onChange={setNatureza} />
      {/* Quem de fato manda a natureza pro Server Action (createCase lê formData.get("type")) é
          este hidden input — o NaturezaPicker acima é só a interação visual. */}
      <input type="hidden" name="type" value={natureza} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">
            {isAdministrativo ? "Número do processo administrativo" : "Número do Processo"}
          </label>
          <input
            name="processNumber"
            defaultValue={defaultProcessNumber}
            className={inputClassName}
            placeholder={isAdministrativo ? "Ex.: TC 012.345/2026-7" : "0000000-00.0000.0.00.0000"}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Vara/Comarca</label>
          <input name="court" className={inputClassName} />
        </div>
      </div>

      {isAdministrativo ? (
        <OrgaoAdministrativoPicker />
      ) : (
        <TribunalFields tribunais={tribunais} inputClassName={inputClassName} />
      )}
    </div>
  );
}
