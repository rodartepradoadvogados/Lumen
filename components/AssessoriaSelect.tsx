"use client";

type AssessoriaOption = { id: string; clientName: string };

// Select simples para associar um novo Processo/Atendimento a uma Assessoria já cadastrada
// (contrato de assessoria continuada), importando o registro direto para o acompanhamento
// daquela assessoria. Opcional — deixado vazio, o registro não fica vinculado a nenhuma.
export default function AssessoriaSelect({
  assessorias,
  inputClassName,
  defaultValue,
}: {
  assessorias: AssessoriaOption[];
  inputClassName: string;
  defaultValue?: string;
}) {
  if (assessorias.length === 0) return null;

  return (
    <div>
      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Assessoria (opcional)</label>
      <select name="assessoriaId" defaultValue={defaultValue || ""} className={inputClassName}>
        <option value="">Nenhuma — não vincular a uma assessoria</option>
        {assessorias.map((a) => (
          <option key={a.id} value={a.id}>
            {a.clientName}
          </option>
        ))}
      </select>
    </div>
  );
}
