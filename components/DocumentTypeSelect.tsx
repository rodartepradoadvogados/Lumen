"use client";

import { DOCUMENT_TYPE_GROUPS, LEGACY_DOCUMENT_TYPES } from "@/lib/documentTypes";

export default function DocumentTypeSelect({
  value,
  onChange,
  className,
  allowAll,
  includeLegacy,
  excludeKeys,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  allowAll?: boolean;
  includeLegacy?: boolean;
  // Tipos que não fazem sentido neste contexto (ex.: "Parecer" na Assessoria, que já tem
  // campo próprio para isso, então não deve aparecer de novo como tipo de anexo genérico).
  excludeKeys?: string[];
  name?: string;
}) {
  return (
    <select name={name} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {allowAll && <option value="TODOS">Todos os tipos</option>}
      {DOCUMENT_TYPE_GROUPS.map((g) => {
        const types = excludeKeys ? g.types.filter((t) => !excludeKeys.includes(t.key)) : g.types;
        if (types.length === 0) return null;
        return (
          <optgroup key={g.group} label={g.group}>
            {types.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </optgroup>
        );
      })}
      {includeLegacy && (
        <optgroup label="Categorias antigas">
          {LEGACY_DOCUMENT_TYPES.filter((t) => !excludeKeys?.includes(t.key)).map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
