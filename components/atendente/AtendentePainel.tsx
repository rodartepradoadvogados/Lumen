"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Megaphone, Mic, Pencil, Power, Trash2 } from "lucide-react";
import IconeAgente from "@/components/IconeAgente";
import CampanhaWizard from "@/components/atendente/CampanhaWizard";
import {
  alternarCampanha,
  excluirCampanha,
  salvarAtendimentoGeral,
  type DadosDaCampanha,
} from "@/lib/actions/campanhas";
import { rotuloDeTranscricaoNasConfiguracoes } from "@/lib/transcricaoDeAudio";

// ============================================================================
// A ABA "ATENDENTE" — o atendimento geral e as campanhas do escritório.
//
// Duas coisas na mesma tela porque são a mesma decisão vista de dois ângulos: o atendimento geral
// é o que a Ana faz quando ninguém veio de anúncio; a campanha é o que ela faz quando veio.
//
// A ORDEM NA TELA É PROPOSITAL: o geral vem primeiro. Campanha sem o geral preenchido funciona,
// mas o escritório que começa pelas campanhas nunca volta para preencher o nome da atendente — e
// aí ela se apresenta como "Atendimento", que é como se apresenta quem não foi apresentado.
// ============================================================================

export type CampanhaNaLista = DadosDaCampanha & {
  id: string;
  leads: number;
};

export default function AtendentePainel({
  temWhatsapp,
  geral,
  campanhas,
  transcricao,
}: {
  temWhatsapp: boolean;
  geral: {
    agenteNome: string;
    agenteInstrucoes: string;
    agenteAtivo: boolean;
    agenteTodos: boolean;
    agenteNumeros: string;
    expedienteDias: string;
    expedienteInicio: string;
    expedienteFim: string;
  };
  campanhas: CampanhaNaLista[];
  /** Se a transcrição de áudio (TRANSCRICAO_URL/TOKEN) está configurada — ver lib/transcricao.ts. */
  transcricao: { configurada: boolean; url: string | null };
}) {
  const router = useRouter();
  const [g, setG] = useState(geral);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState<DadosDaCampanha | null>(null);
  const [aberto, setAberto] = useState(false);
  const [pendente, comecar] = useTransition();

  if (!temWhatsapp) {
    return (
      <div className="flex items-start gap-2 border border-regua bg-sf-apoio px-4 py-3 text-corpo text-tx-2">
        <AlertCircle size={18} className="mt-0.5 shrink-0" />
        <span>
          Conecte o WhatsApp do escritório antes de configurar o atendente. Sem número conectado não há conversa para
          ele atender.
        </span>
      </div>
    );
  }

  function salvarGeral() {
    setErro(null);
    setAviso(null);
    comecar(async () => {
      const r = await salvarAtendimentoGeral(g);
      if (r.error) setErro(r.error);
      else setAviso("Atendimento geral salvo.");
      router.refresh();
    });
  }

  function acao(fn: () => Promise<{ error?: string }>) {
    setErro(null);
    comecar(async () => {
      const r = await fn();
      if (r.error) setErro(r.error);
      router.refresh();
    });
  }

  const DIAS = [
    { n: "1", r: "seg" },
    { n: "2", r: "ter" },
    { n: "3", r: "qua" },
    { n: "4", r: "qui" },
    { n: "5", r: "sex" },
    { n: "6", r: "sáb" },
    { n: "0", r: "dom" },
  ];
  const diasMarcados = g.expedienteDias.split(",").map((x) => x.trim()).filter(Boolean);

  return (
    <div className="space-y-8">
      {erro && <p className="border border-linha-urgente bg-urgente-bg px-3 py-2 text-corpo text-urgente">{erro}</p>}
      {aviso && <p className="border border-regua bg-sf-apoio px-3 py-2 text-corpo text-tx-2">{aviso}</p>}

      {/* ── O atendimento geral ───────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <IconeAgente size={20} className="text-tx-2" />
          <h3 className="text-destaque font-semibold text-tx">Atendimento geral</h3>
        </div>
        <p className="max-w-[70ch] text-corpo leading-relaxed text-tx-2">
          O que a atendente faz quando a conversa <strong>não</strong> veio de campanha. O tom, os limites e o que
          pedir em cada tipo de demanda já vêm prontos do Lúmen e valem para todos os escritórios — aqui você
          acrescenta o que é seu.
        </p>

        {/* Discreta de propósito: hoje só dava pra saber isto olhando a bolha de um áudio já
            recebido. Nunca mostra o token — só o estado e, quando configurada, o endereço. */}
        <p className="flex items-center gap-1.5 text-etiqueta text-tx-3">
          <Mic size={13} className="shrink-0" aria-hidden="true" />
          {rotuloDeTranscricaoNasConfiguracoes(transcricao.configurada, transcricao.url)}
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-etiqueta font-semibold text-tx">Nome da atendente</label>
            <input
              className="cfg-input w-full"
              value={g.agenteNome}
              onChange={(e) => setG({ ...g, agenteNome: e.target.value })}
              placeholder="Ana"
            />
            <p className="mt-1 text-etiqueta text-tx-3">
              É assim que ela se apresenta ao cliente. Sem nome, ela vira “Atendimento”.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-etiqueta font-semibold text-tx">Expediente</label>
            <div className="flex flex-wrap items-center gap-1">
              {DIAS.map((d) => {
                const on = diasMarcados.includes(d.n);
                return (
                  <button
                    key={d.n}
                    type="button"
                    onClick={() =>
                      setG({
                        ...g,
                        expedienteDias: (on
                          ? diasMarcados.filter((x) => x !== d.n)
                          : [...diasMarcados, d.n]
                        ).join(","),
                      })
                    }
                    aria-pressed={on}
                    className={`min-h-11 min-w-11 border px-2 text-etiqueta font-semibold ${
                      on ? "border-acao bg-acao text-acao-tx" : "border-regua text-tx-2 hover:bg-sf-apoio"
                    }`}
                  >
                    {d.r}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="time"
                className="cfg-input w-28"
                value={g.expedienteInicio}
                onChange={(e) => setG({ ...g, expedienteInicio: e.target.value })}
              />
              <span className="text-etiqueta text-tx-3">às</span>
              <input
                type="time"
                className="cfg-input w-28"
                value={g.expedienteFim}
                onChange={(e) => setG({ ...g, expedienteFim: e.target.value })}
              />
            </div>
            <p className="mt-1 text-etiqueta text-tx-3">
              O relógio da transferência só corre aqui dentro. Fora do expediente, o lead espera a manhã seguinte em
              vez de rodar a fila inteira de madrugada.
            </p>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-etiqueta font-semibold text-tx">O que este escritório acrescenta</label>
          <textarea
            className="cfg-input w-full"
            rows={6}
            value={g.agenteInstrucoes}
            onChange={(e) => setG({ ...g, agenteInstrucoes: e.target.value })}
            placeholder="Ex.: somos de Goiânia e atendemos todo o estado de Goiás. Fale sempre por “você”. Se perguntarem de plantão, diga que retornamos no próximo dia útil."
          />
          <p className="mt-1 text-etiqueta text-tx-3">
            Isto <strong>acrescenta</strong> ao padrão; nunca o revoga. Os limites — não fechar contrato, não dar
            solução jurídica, não prometer resultado — valem sempre, mesmo que você escreva o contrário aqui.
          </p>
        </div>

        <div className="border border-regua bg-sf-apoio p-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-corpo text-tx">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--acao)]"
              checked={g.agenteAtivo}
              onChange={(e) => setG({ ...g, agenteAtivo: e.target.checked })}
            />
            <strong>A atendente pode responder neste escritório</strong>
          </label>
          <p className="mb-2 ml-6 text-etiqueta text-tx-3">
            Esta é a chave-mestra. Desligada, nenhuma conversa é respondida por ela — nem as marcadas.
          </p>

          <label className="ml-6 flex min-h-11 cursor-pointer items-center gap-2 text-corpo text-tx">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--acao)]"
              checked={g.agenteTodos}
              onChange={(e) => setG({ ...g, agenteTodos: e.target.checked })}
            />
            Responder a qualquer número
          </label>
          {!g.agenteTodos && (
            <div className="ml-6 mt-1">
              <input
                className="cfg-input w-full"
                value={g.agenteNumeros}
                onChange={(e) => setG({ ...g, agenteNumeros: e.target.value })}
                placeholder="+5562991539356, +5562982490400"
              />
              <p className="mt-1 text-etiqueta text-tx-3">
                Só estes são atendidos. Lista vazia com esta opção desmarcada significa <strong>ninguém</strong> — é o
                estado seguro, e é o padrão.
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={salvarGeral}
          disabled={pendente}
          className="inline-flex min-h-11 items-center gap-1.5 bg-acao px-4 text-etiqueta font-semibold text-acao-tx hover:bg-acao-hover disabled:opacity-50"
        >
          {pendente ? "Salvando…" : "Salvar atendimento geral"}
        </button>
      </section>

      {/* ── As campanhas ──────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Megaphone size={20} className="text-tx-2" />
            <h3 className="text-destaque font-semibold text-tx">Campanhas</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditando(null);
              setAberto(true);
            }}
            className="inline-flex min-h-11 items-center gap-1.5 border border-regua px-3 text-etiqueta font-semibold text-tx hover:bg-sf-apoio"
          >
            Nova campanha
          </button>
        </div>
        <p className="max-w-[70ch] text-corpo leading-relaxed text-tx-2">
          Quem chega por um anúncio segue o roteiro da campanha, e só o assunto dela. Quem chega por conta própria cai
          no atendimento geral acima.
        </p>

        {campanhas.length === 0 ? (
          <p className="border border-regua bg-sf-apoio px-4 py-6 text-center text-corpo text-tx-2">
            Nenhuma campanha ainda. Crie uma quando for anunciar.
          </p>
        ) : (
          <ul className="space-y-2">
            {campanhas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 border border-regua bg-sf-apoio p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-tx">{c.nome}</span>
                    <span
                      className={`px-1.5 py-0.5 text-etiqueta font-semibold ${
                        c.ativa ? "bg-concluido-bg text-concluido" : "bg-sf text-tx-3"
                      }`}
                    >
                      {c.ativa ? "no ar" : "desligada"}
                    </span>
                  </div>
                  <div className="text-etiqueta text-tx-2">
                    {c.area}
                    {c.leads > 0 && ` · ${c.leads} ${c.leads === 1 ? "lead" : "leads"}`}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => acao(() => alternarCampanha(c.id, !c.ativa))}
                  disabled={pendente}
                  aria-label={c.ativa ? "Desligar campanha" : "Ligar campanha"}
                  title={c.ativa ? "Desligar" : "Ligar"}
                  className={`rounded p-2 hover:bg-sf ${c.ativa ? "text-concluido" : "text-tx-3"}`}
                >
                  <Power size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditando(c);
                    setAberto(true);
                  }}
                  aria-label="Editar campanha"
                  title="Editar"
                  className="rounded p-2 text-tx-2 hover:bg-sf"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => acao(() => excluirCampanha(c.id))}
                  disabled={pendente}
                  aria-label="Excluir campanha"
                  title="Excluir"
                  className="rounded p-2 text-tx-3 hover:bg-urgente-bg hover:text-urgente"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {aberto && <CampanhaWizard inicial={editando ?? undefined} aoFechar={() => setAberto(false)} />}
    </div>
  );
}
