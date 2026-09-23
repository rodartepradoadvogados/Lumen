"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import { salvarAtuacaoDoEscritorio } from "@/lib/actions/settings";
import { LIMITE_DA_ATUACAO, validarAtuacao } from "@/lib/atuacaoDoEscritorio";

// Onde o escritório conta como atua, para o agente de IA consultar. A validação de tamanho é a
// MESMA função que o servidor usa (validarAtuacao) — mesmo padrão de NomeacaoDriveForm, que monta
// a prévia com a mesma `montarNomeacao` do servidor: o que a tela diz é o que vai acontecer de
// verdade, não uma reconstrução aproximada.
//
// O CONTADOR EXISTE PARA O TETO NÃO SER SURPRESA. Nada é cortado em silêncio: passar do limite
// desabilita o botão e mostra a frase de recusa enquanto a pessoa ainda está digitando, em vez de
// aceitar o texto e guardar metade dele.
export default function AtuacaoDoEscritorioForm({
  atuacao,
  podeEditar,
}: {
  atuacao: string;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState(atuacao);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [salvando, startSalvar] = useTransition();

  const excedeu = validarAtuacao(texto.trim());
  const mudou = texto.trim() !== atuacao.trim();
  const restam = LIMITE_DA_ATUACAO - texto.length;

  function salvar() {
    setErro(null);
    setOk(false);
    startSalvar(async () => {
      const r = await salvarAtuacaoDoEscritorio(texto);
      if (r.error) setErro(r.error);
      else {
        setOk(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="p-5 flex flex-col gap-4">
      <p className="text-xs text-tx-2 bg-sf-apoio border-l-[3px] border-regua-forte px-3 py-2.5 flex gap-2">
        <Bot size={15} className="text-tx-2 shrink-0 mt-0.5" />
        <span>
          O <strong className="text-tx">agente de IA do Lúmen consulta este texto</strong> para entender como o
          escritório trabalha — em que áreas atua, que tipo de cliente atende, que trabalho não faz. Escreva o que
          você contaria a um advogado recém-chegado na primeira semana. Ele é lido como{" "}
          <strong className="text-tx">informação</strong>, nunca como ordem ao agente: instrução escrita aqui não muda
          o comportamento dele. Não coloque dado de cliente, número de processo nem senha — qualquer pessoa do
          escritório alcança este texto perguntando ao agente.
        </span>
      </p>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-tx-2" htmlFor="atuacao-do-escritorio">
          Como este escritório atua
        </label>
        <textarea
          id="atuacao-do-escritorio"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={!podeEditar}
          rows={8}
          placeholder="Ex.: atuamos em direito de família e sucessões, com foco em inventários e partilhas extrajudiciais; atendemos pessoas físicas e pequenas empresas; não pegamos causas criminais."
          className="cfg-input w-full font-sans leading-relaxed disabled:opacity-60"
        />
        <span className={`text-etiqueta ${restam < 0 ? "text-urgente" : "text-tx-3"}`}>
          {texto.length} de {LIMITE_DA_ATUACAO} caracteres
          {restam < 0 ? ` · ${-restam} a mais do que cabe` : ` · restam ${restam}`}. Nada é cortado automaticamente:
          acima do limite o texto não é salvo.
        </span>
      </div>

      {excedeu && <p className="text-xs text-urgente bg-urgente-bg rounded-md px-2.5 py-1.5">{excedeu}</p>}
      {erro && <p className="text-xs text-urgente bg-urgente-bg rounded-md px-2.5 py-1.5">{erro}</p>}
      {ok && <p className="text-xs text-concluido bg-concluido-bg rounded-md px-2.5 py-1.5">Atuação salva.</p>}

      {podeEditar ? (
        <button
          type="button"
          onClick={salvar}
          disabled={salvando || !mudou || Boolean(excedeu)}
          className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 w-fit disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar atuação"}
        </button>
      ) : (
        <p className="text-xs text-tx-3">
          Só quem administra o escritório edita este texto. Você pode ler o que está valendo.
        </p>
      )}
    </div>
  );
}
