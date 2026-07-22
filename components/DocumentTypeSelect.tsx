"use client";

import { DOCUMENT_TYPE_GROUPS, LEGACY_DOCUMENT_TYPES } from "@/lib/documentTypes";

export default function DocumentTypeSelect({
  value,
  onChange,
  className,
  allowAll,
  includeLegacy,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  allowAll?: boolean;
  includeLegacy?: boolean;
  name?: string;
}) {
  return (
    <select name={name} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {allowAll && <option value="TODOS">Todos os tipos</option>}
      {DOCUMENT_TYPE_GROUPS.map((g) => (
        <optgroup key={g.group} label={g.group}>
          {g.types.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </optgroup>
      ))}
      {includeLegacy && (
        <optgroup label="Categorias antigas">
          {LEGACY_DOCUMENT_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
