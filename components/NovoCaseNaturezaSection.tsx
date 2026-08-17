"use client";

import { useState } from "react";
import type { TribunalCatalogEntry } from "@/lib/tribunaisCatalog";
import TribunalFields from "@/components/TribunalFields";
import OrgaoAdministrativoPicker from "@/components/OrgaoAdministrativoPicker";
import NaturezaPicker from "@/components/NaturezaPicker";

// Padrão CNJ (Resolução 65/2008 do CNJ): NNNNNNN-DD.AAAA.J.TR.OOOO — 7 dígitos do número
// sequencial, 2 do dígito verificador, 4 do ano, 1 do segmento de justiça, 2 do tribunal, 4 da
// origem/vara, sempre 20 dígitos no total. Formata ENQUANTO digita (pedido explícito: "deve
// puxar, por padrão, o padrão do CNJ... e, à medida que vai digitando, vai preenchendo já nesse
// formato") — ignora tudo que não é dígito (assim colar um número já formatado, ou digitado com
// espaço/parênteses por engano, também funciona) e trava em 20 dígitos.
function formatCnj(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 20);
  let out = d.slice(0, 7);
  if (d.length > 7) out += `-${d.slice(7, 9)}`;
  if (d.length > 9) out += `.${d.slice(9, 13)}`;
  if (d.length > 13) out += `.${d.slice(13, 14)}`;
  if (d.length > 14) out += `.${d.slice(14, 16)}`;
  if (d.length > 16) out += `.${d.slice(16, 20)}`;
  return out;
}

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
  // Controlado só pro JUDICIAL (a máscara CNJ não faz sentido pro número livre do
  // administrativo, ex.: "TC 012.345/2026-7") — formata já a partir do valor inicial (ex.: vindo
  // de "Cadastrar processo" direto de uma publicação, ver newCaseHref em PublicationRow.tsx),
  // não só do que o usuário digitar depois.
  const [processNumber, setProcessNumber] = useState(
    defaultProcessNumber ? (isAdministrativo ? defaultProcessNumber : formatCnj(defaultProcessNumber)) : ""
  );

  return (
    <div className="space-y-4">
      <NaturezaPicker value={natureza} onChange={setNatureza} />
      {/* Quem de fato manda a natureza pro Server Action (createCase lê formData.get("type")) é
          este hidden input — o NaturezaPicker acima é só a interação visual. */}
      <input type="hidden" name="type" value={natureza} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-tx-2">
            {isAdministrativo ? "Número do processo administrativo" : "Número do Processo"}
          </label>
          {/* Um único input controlado nos dois modos (em vez de alternar entre dois <input>
              diferentes) — trocar a natureza não deve apagar o que já foi digitado, e alternar
              value/defaultValue no mesmo nó do DOM entre renders é exatamente o cenário que o
              React avisa como "input não controlado virando controlado". */}
          <input
            name="processNumber"
            value={processNumber}
            onChange={(e) => setProcessNumber(isAdministrativo ? e.target.value : formatCnj(e.target.value))}
            inputMode={isAdministrativo ? "text" : "numeric"}
            className={inputClassName}
            placeholder={isAdministrativo ? "Ex.: TC 012.345/2026-7" : "0000000-00.0000.0.00.0000"}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Vara/Comarca</label>
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
