import { TriangleAlert } from "lucide-react";
import { dataDeBrasilia, horaDeBrasilia } from "@/lib/horaDeBrasilia";
import type { SaudeDaFonte } from "@/lib/saudeDasFontes";

// "A captura está funcionando?" na cabeça da tela de Publicações, com o que foi MEDIDO (último ciclo
// bem-sucedido do robô; última varredura sem erro do e-mail; último item que de fato entrou) em vez
// do batimento do cron. Fonte parada fica vermelha e acende o aviso: o robô ficou 19 dias sem
// capturar DJEN nem DataJud e a tela dizia "DJEN 14:00". Ver lib/saudeDasFontes.ts.

function curto(d: Date): string {
  return `${dataDeBrasilia(d).slice(0, 5)} ${horaDeBrasilia(d)}`;
}

function textoDe(f: SaudeDaFonte): string {
  if (!f.ultimoSucesso) return "sem consulta registrada";
  if (f.parada) {
    const dias = f.diasSemSucesso ?? 0;
    return `parado há ${dias} ${dias === 1 ? "dia" : "dias"} · última consulta ${curto(f.ultimoSucesso)}${f.chave === "DATAJUD" && f.ultimoItemNovo ? ` · último item novo ${dataDeBrasilia(f.ultimoItemNovo).slice(0, 5)}` : ""}`;
  }
  return `consultou ${curto(f.ultimoSucesso)}${f.ultimoItemNovo ? ` · último item novo ${dataDeBrasilia(f.ultimoItemNovo).slice(0, 5)}` : ""}`;
}

export default function SaudeDasFontes({ fontes, aviso }: { fontes: SaudeDaFonte[]; aviso: string | null }) {
  return (
    <div className="pb-1.5 space-y-1.5">
      <ul aria-label="Saúde das fontes de captura" className="list-none m-0 p-0 flex flex-wrap gap-1.5">
        {fontes.map((f) => (
          <li
            key={f.chave}
            title={f.erro ?? undefined}
            className={`inline-flex items-center gap-1.5 border px-2 min-h-8 text-xs ${
              f.parada ? "border-campo-risco-linha bg-campo-risco text-risco-vencido-tx font-semibold" : "border-regua-forte bg-sf text-tx-2"
            }`}
          >
            <span aria-hidden="true" className={`inline-block h-2 w-2 ${f.parada ? "bg-risco-vencido" : "bg-risco-em-dia"}`} />
            <span className={f.parada ? "" : "font-semibold text-tx"}>{f.rotulo}</span>
            <span className="sr-only">{f.parada ? "com problema:" : "em dia:"}</span>
            <span>{textoDe(f)}</span>
          </li>
        ))}
      </ul>
      {aviso && (
        <p role="alert" className="flex items-start gap-2 border border-campo-risco-linha bg-campo-risco px-3 py-2 text-sm text-tx">
          <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-risco-vencido-tx" />
          <span>
            <b className="text-risco-vencido-tx">Captura oficial parada.</b> {aviso}
          </span>
        </p>
      )}
    </div>
  );
}
