import { AlertTriangle, CheckCircle2 } from "lucide-react";

// A resposta de Conexões: as integrações estão bem? Quando há falha, diz QUAL, QUANDO e o QUE
// significa — em português, com a consequência (o log mostrava "503" e o cabeçalho "0 exigem
// atenção"). Sem falha, uma linha calma.
export default function SaudeDasConexoes({
  texto,
  falhas,
  falhandoAgora,
  ultimaFalha,
}: {
  texto: string;
  falhas: number;
  falhandoAgora: string[];
  ultimaFalha: { integracao: string; quando: string; o_que: string } | null;
}) {
  const ok = falhas === 0 && falhandoAgora.length === 0;
  return (
    <section aria-label="Saúde das integrações" className={`bg-sf border-t-2 p-5 ${ok ? "border-concluido" : "border-urgente"}`}>
      <p className={`flex items-center gap-2 text-destaque font-bold ${ok ? "text-tx" : "text-urgente"}`}>
        {ok ? <CheckCircle2 size={20} aria-hidden="true" className="text-concluido" /> : <AlertTriangle size={20} aria-hidden="true" />}
        {texto}
      </p>
      {falhandoAgora.length > 0 && (
        <ul className="mt-2 text-sm text-tx-2 list-disc pl-5 space-y-0.5">
          {falhandoAgora.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {ultimaFalha && (
        <p className="mt-2 text-sm text-tx-2">
          Última falha: <b className="text-tx">{ultimaFalha.integracao}</b>, {ultimaFalha.quando}. {ultimaFalha.o_que.charAt(0).toUpperCase() + ultimaFalha.o_que.slice(1)}.
        </p>
      )}
    </section>
  );
}
