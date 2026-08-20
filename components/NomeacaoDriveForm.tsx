"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { salvarNomeacaoDrive } from "@/lib/actions/settings";
import { montarNomeacao, RAIZ_ROTULO, type RaizKey } from "@/lib/driveNaming";

// Como as pastas deste escritório se chamam no armazenamento. A prévia abaixo é montada com a
// MESMA função que o servidor usa para criar as pastas (montarNomeacao), então o que aparece aqui
// é literalmente o que vai ser criado — não uma reconstrução aproximada do formato.
export default function NomeacaoDriveForm({
  pastaMae,
  prefixo,
  provedor,
}: {
  pastaMae: string;
  prefixo: string;
  provedor: string;
}) {
  const router = useRouter();
  const [mae, setMae] = useState(pastaMae);
  const [pre, setPre] = useState(prefixo);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [salvando, startSalvar] = useTransition();

  const previa = montarNomeacao(mae, pre);
  const mudou = mae !== pastaMae || pre !== prefixo;
  const raizes = Object.keys(RAIZ_ROTULO) as RaizKey[];

  function salvar() {
    setErro(null);
    setOk(false);
    startSalvar(async () => {
      const r = await salvarNomeacaoDrive({ pastaMae: mae, prefixo: pre });
      if (r.error) setErro(r.error);
      else {
        setOk(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-tx-2">Pasta-mãe</label>
          <input value={mae} onChange={(e) => setMae(e.target.value)} placeholder="Lúmen" className="cfg-input w-full" />
          <span className="text-[11px] text-tx-3">A pasta única que guarda todas as demais, na raiz do {provedor}.</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-tx-2">Prefixo das pastas</label>
          <input value={pre} onChange={(e) => setPre(e.target.value)} placeholder="Lúmen - " className="cfg-input w-full" />
          <span className="text-[11px] text-tx-3">Pode ficar em branco — aí as pastas ficam só “Processos”, “Casos”…</span>
        </div>
      </div>

      <div className=" border border-regua bg-sf-apoio p-3.5 flex flex-col gap-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[.11em] text-tx-2">Como vai ficar</span>
        <span className="text-xs font-mono text-tx">{previa.pastaMae || "—"}/</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
          {raizes.map((r) => (
            <span key={r} className="text-[11px] font-mono text-tx-2 truncate" title={RAIZ_ROTULO[r]}>
              &nbsp;&nbsp;└ {previa.raizes[r]}
            </span>
          ))}
        </div>
      </div>

      {mudou && (
        <p className="text-xs text-tx-2 bg-marca-bg border-l-[3px] border-marca px-3 py-2.5 flex gap-2">
          <AlertTriangle size={15} className="text-marca-tx shrink-0 mt-0.5" />
          <span>
            As pastas que <strong className="text-tx">já existem</strong> continuam com o nome atual e seguem funcionando — o
            sistema guarda o endereço interno de cada uma, não o nome. A mudança vale para as pastas criadas{" "}
            <strong className="text-tx">daqui pra frente</strong>. Se quiser tudo com o nome novo, renomeie as pastas antigas
            direto no {provedor}: renomear não quebra nenhum link.
          </span>
        </p>
      )}

      {erro && <p className="text-xs text-urgente bg-urgente-bg px-2.5 py-1.5">{erro}</p>}
      {ok && <p className="text-xs text-concluido bg-concluido-bg px-2.5 py-1.5">Nomes salvos.</p>}

      <button
        type="button"
        onClick={salvar}
        disabled={salvando || !mudou}
        className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 w-fit disabled:opacity-50"
      >
        {salvando ? "Salvando…" : "Salvar nomes"}
      </button>
    </div>
  );
}
