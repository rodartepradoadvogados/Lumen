"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { salvarRetencaoDeAtendimentos } from "@/lib/actions/retencao";
import { MESES_DE_RETENCAO } from "@/lib/retencaoRegras";

// ============================================================================
// A GUARDA DAS CONVERSAS — quanto tempo o escritório guarda atendimento sem desfecho.
//
// Desligada por padrão. Quem liga escolhe o prazo e vê ANTES quantos atendimentos seriam eliminados
// agora: eliminar é irreversível (mensagens, áudios, arquivos e a pasta no Drive), e o clique que
// liga o botão não pode ser às cegas. As regras do que entra estão em lib/retencaoRegras.ts.
// ============================================================================

export default function RetencaoDeAtendimentosPanel({
  mesesAtuais,
  previa,
}: {
  mesesAtuais: number | null;
  previa: { meses: number; quantos: number; mais: boolean };
}) {
  const router = useRouter();
  const [escolha, setEscolha] = useState<string>(mesesAtuais ? String(mesesAtuais) : "");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();

  const ligado = mesesAtuais !== null;
  const mudou = escolha !== (mesesAtuais ? String(mesesAtuais) : "");

  function salvar() {
    setErro(null);
    setAviso(null);
    const meses = escolha === "" ? null : Number(escolha);
    if (meses !== null && previa.quantos > 0) {
      const ok = window.confirm(
        `Com ${meses} meses, ${previa.quantos}${previa.mais ? " ou mais" : ""} atendimento(s) que já passaram do prazo serão eliminados nas próximas rodadas diárias (até 50 por dia), com mensagens, áudios, arquivos e a pasta no Drive. Isso não pode ser desfeito. Continuar?`,
      );
      if (!ok) return;
    }
    comecar(async () => {
      const r = await salvarRetencaoDeAtendimentos(meses);
      if (r.error) setErro(r.error);
      else setAviso(meses === null ? "Eliminação automática desligada." : `Guarda de ${meses} meses ligada.`);
      router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Archive size={20} className="text-tx-2" />
        <h3 className="text-destaque font-semibold text-tx">Guarda das conversas</h3>
      </div>
      <p className="max-w-[70ch] text-corpo leading-relaxed text-tx-2">
        Atendimentos que <strong>não viraram processo nem cliente</strong> e ficaram sem nenhuma conversa pelo prazo
        escolhido são eliminados sozinhos: mensagens, áudios, arquivos e a pasta no Drive. É o que a política de
        privacidade do escritório pode prometer. <strong>Desligado por padrão.</strong>
      </p>
      <p className="max-w-[70ch] text-etiqueta text-tx-3">
        Nunca são eliminados: atendimento que virou processo ou cliente, contrato fechado, ou que tenha tarefa,
        anotação, pendência aberta, retorno agendado ou documento em espera.
      </p>

      {erro && <p className="border border-linha-urgente bg-urgente-bg px-3 py-2 text-corpo text-urgente">{erro}</p>}
      {aviso && <p className="border border-regua bg-sf-apoio px-3 py-2 text-corpo text-tx-2">{aviso}</p>}

      <div className="max-w-sm">
        <label className="mb-1 block text-etiqueta font-semibold text-tx" htmlFor="retencao-meses">
          Eliminar depois de
        </label>
        <select
          id="retencao-meses"
          className="cfg-input w-full"
          value={escolha}
          onChange={(e) => setEscolha(e.target.value)}
        >
          <option value="">Não eliminar sozinho</option>
          {MESES_DE_RETENCAO.map((m) => (
            <option key={m} value={m}>
              {m} meses sem conversa
            </option>
          ))}
        </select>
      </div>

      <p className="max-w-[70ch] text-corpo text-tx-2">
        {ligado ? "Hoje" : `Prévia com ${previa.meses} meses`}:{" "}
        <strong>
          {previa.quantos}
          {previa.mais ? "+" : ""}
        </strong>{" "}
        {previa.quantos === 1 ? "atendimento passaria" : "atendimentos passariam"} do prazo e{" "}
        {previa.quantos === 1 ? "seria eliminado" : "seriam eliminados"} na próxima rodada.
      </p>

      <button
        type="button"
        onClick={salvar}
        disabled={pendente || !mudou}
        className="inline-flex min-h-11 items-center gap-1.5 bg-acao px-4 text-etiqueta font-semibold text-acao-tx hover:bg-acao-hover disabled:opacity-50"
      >
        {pendente ? "Salvando…" : "Salvar guarda das conversas"}
      </button>
    </section>
  );
}
