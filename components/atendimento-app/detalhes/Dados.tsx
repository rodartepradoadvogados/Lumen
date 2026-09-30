"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { attendanceStatusLabels } from "@/lib/atendimentoStatus";
import { MOTIVOS_DE_PERDA, stageLabels, stageOptions } from "@/lib/funil";
import { CANAIS_DO_ATENDIMENTO, ORIGENS_DO_LEAD, dataCurta, lerValorEmReais, valorParaCampo } from "@/lib/detalhesDoAtendimento";
import { salvarDadosDoAtendimento, mudarFaseDoAtendimento, type DadosParaSalvar } from "@/lib/actions/detalhesDoAtendimento";
import { telefoneLegivel } from "@/lib/quemEEsteNumero";
import { Campo, Gaveta, cx, useRodar } from "./base";
import type { PropsDosDetalhes } from "./tipos";

type Formulario = {
  nome: string;
  telefone: string;
  email: string;
  assunto: string;
  materia: string;
  canal: string;
  origem: string;
  valor: string;
  proximo: string;
  responsavel: string;
};

// DADOS DO ATENDIMENTO: ver e editar contato, assunto, matéria, canal, responsável, valor estimado e origem —
// mais "Mudar fase" (Perdido pede o motivo). O servidor valida tudo de novo e o desfazer regrava os valores de
// antes. Responsável só é escolhido por quem vê o escritório inteiro (é escala); quem só vê os seus lê o nome.
export default function Dados({ p }: { p: PropsDosDetalhes }) {
  const c = p.conversa;
  const { rodar, pendente } = useRodar();
  const [form, setForm] = useState<Formulario | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [fase, setFase] = useState<{ stage: string; motivo: string; outro: string } | null>(null);

  const inicial = (): Formulario => ({
    nome: c.clientName,
    telefone: c.contactPhone ?? "",
    email: c.clientEmail ?? "",
    assunto: c.subject,
    materia: c.area ?? "",
    canal: c.channel,
    origem: c.leadSource ?? "",
    valor: valorParaCampo(c.estimatedValue),
    proximo: c.nextContactDay ?? "",
    responsavel: c.responsibleId ?? "",
  });

  const linhas: [string, string][] = [
    ["Assunto", c.subject],
    ["Matéria", c.area || "—"],
    ["Fase", (stageLabels[c.stage] ?? c.stage) + (c.stage === "PERDIDO" && c.lostReason ? ` — ${c.lostReason}` : "")],
    ["Situação", attendanceStatusLabels[c.status] ?? c.status],
    ["Canal", CANAIS_DO_ATENDIMENTO[c.channel] ?? c.channel],
    ["Responsável", c.responsibleName || "Sem responsável"],
    ["Valor estimado", c.estimatedValue != null ? c.estimatedValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"],
    ["Honorário", c.honorario || "—"],
    ["Origem", (c.leadSource && ORIGENS_DO_LEAD[c.leadSource]) || "—"],
    ["Próximo contato", c.nextContactDay ? dataCurta(c.nextContactDay) : "—"],
    ["Aberto em", c.abertoEmLabel],
    ...(c.campanha ? ([["Campanha", c.campanha]] as [string, string][]) : []),
    ["Nome do contato", c.clientName],
    ["WhatsApp", c.waPhone ? telefoneLegivel(c.waPhone) : "—"],
    ["Telefone de contato", c.contactPhone || "—"],
    ["E-mail", c.clientEmail || "—"],
  ];

  async function salvar() {
    if (!form) return;
    setErro(null);
    const valor = lerValorEmReais(form.valor);
    if (valor === "invalido") return setErro("Valor estimado inválido. Use só números, por exemplo 4.800,00.");

    const novo: DadosParaSalvar = {};
    const antes: DadosParaSalvar = {};
    const troca = <K extends keyof DadosParaSalvar>(k: K, agora: DadosParaSalvar[K], era: DadosParaSalvar[K]) => {
      if (agora !== era) {
        novo[k] = agora;
        antes[k] = era;
      }
    };
    troca("nome", form.nome.trim(), c.clientName);
    troca("telefoneDeContato", form.telefone.trim() || null, c.contactPhone || null);
    troca("email", form.email.trim() || null, c.clientEmail || null);
    troca("assunto", form.assunto.trim(), c.subject);
    troca("materia", form.materia.trim() || null, c.area || null);
    troca("canal", form.canal, c.channel);
    troca("origem", form.origem || null, c.leadSource || null);
    troca("valorEstimado", valor, c.estimatedValue);
    troca("proximoContato", form.proximo || null, c.nextContactDay);
    if (p.veTudo) troca("responsavelId", form.responsavel || null, c.responsibleId);

    if (Object.keys(novo).length === 0) {
      setForm(null);
      return;
    }
    const r = await rodar({
      fazer: () => salvarDadosDoAtendimento(c.id, novo),
      ok: "Dados salvos.",
      desfazer: () => salvarDadosDoAtendimento(c.id, antes),
    });
    if (r.ok) setForm(null);
    else setErro(r.error ?? null);
  }

  async function salvarFase() {
    if (!fase) return;
    setErro(null);
    const perdido = fase.stage === "PERDIDO";
    const motivo = fase.motivo === "Outro" ? fase.outro.trim() : fase.motivo;
    if (perdido && !motivo) return setErro("Diga o motivo da perda. É o que alimenta o relatório de captação.");
    if (fase.stage === c.stage) return setFase(null);
    const de = c.stage;
    const motivoAntes = c.lostReason ?? undefined;
    const r = await rodar({
      fazer: () => mudarFaseDoAtendimento(c.id, fase.stage, perdido ? motivo : undefined),
      ok: `Fase: ${stageLabels[fase.stage]}.`,
      desfazer: () => mudarFaseDoAtendimento(c.id, de, de === "PERDIDO" ? (motivoAntes ?? "Sem motivo informado") : undefined),
    });
    if (r.ok) setFase(null);
    else setErro(r.error ?? null);
  }

  return (
    <div>
      <dl className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-x-3 gap-y-2 text-corpo">
        {linhas.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-atd-previa">{k}</dt>
            <dd className="min-w-0 break-words font-medium text-tx">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={cx.primario}
          onClick={() => {
            setErro(null);
            setForm(inicial());
          }}
        >
          <Pencil size={16} aria-hidden="true" /> Editar dados
        </button>
        <button
          type="button"
          className={cx.secundario}
          onClick={() => {
            setErro(null);
            setFase({ stage: c.stage, motivo: "", outro: "" });
          }}
        >
          Mudar fase
        </button>
      </div>

      <Gaveta
        aberta={form !== null}
        aoFechar={() => setForm(null)}
        titulo="Editar dados"
        rodape={
          <>
            <button type="button" className={cx.secundario} onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button type="button" className={`${cx.primario} flex-1`} disabled={pendente} onClick={salvar}>
              {pendente ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        {form && (
          <div className="space-y-3">
            <Campo rotulo="Nome do contato">{({ id }) => <input id={id} className={cx.campo} value={form.nome} maxLength={120} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoComplete="off" />}</Campo>
            <Campo rotulo="Telefone de contato" dica="O número do WhatsApp da conversa não muda por aqui.">
              {({ id, descricao }) => <input id={id} aria-describedby={descricao} className={cx.campo} inputMode="tel" value={form.telefone} maxLength={30} onChange={(e) => setForm({ ...form, telefone: e.target.value })} autoComplete="off" />}
            </Campo>
            <Campo rotulo="E-mail">{({ id }) => <input id={id} className={cx.campo} type="email" inputMode="email" value={form.email} maxLength={160} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" />}</Campo>
            <Campo rotulo="Assunto" dica="Também é o nome da pasta do atendimento no Drive.">
              {({ id, descricao }) => <input id={id} aria-describedby={descricao} className={cx.campo} value={form.assunto} maxLength={200} onChange={(e) => setForm({ ...form, assunto: e.target.value })} autoComplete="off" />}
            </Campo>
            <Campo rotulo="Matéria">{({ id }) => <input id={id} className={cx.campo} value={form.materia} maxLength={80} onChange={(e) => setForm({ ...form, materia: e.target.value })} autoComplete="off" />}</Campo>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <Campo rotulo="Canal">
                {({ id }) => (
                  <select id={id} className={cx.campo} value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value })}>
                    {Object.entries(CANAIS_DO_ATENDIMENTO).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>
              <Campo rotulo="Origem">
                {({ id }) => (
                  <select id={id} className={cx.campo} value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })}>
                    <option value="">Não informada</option>
                    {Object.entries(ORIGENS_DO_LEAD).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>
            </div>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <Campo rotulo="Valor estimado (R$)">{({ id }) => <input id={id} className={cx.campo} inputMode="decimal" placeholder="4.800,00" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} autoComplete="off" />}</Campo>
              <Campo rotulo="Próximo contato">{({ id }) => <input id={id} type="date" className={cx.campo} value={form.proximo} onChange={(e) => setForm({ ...form, proximo: e.target.value })} />}</Campo>
            </div>
            {p.veTudo ? (
              <Campo rotulo="Responsável" dica="Quem só vê os próprios atendimentos deixa de ver este quando ele passa a outra pessoa.">
                {({ id, descricao }) => (
                  <select id={id} aria-describedby={descricao} className={cx.campo} value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })}>
                    <option value="">Sem responsável</option>
                    {p.usuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>
            ) : (
              <p className={cx.dica}>Responsável: {c.responsibleName || "sem responsável"}. Quem define é a recepção ou um sócio administrador.</p>
            )}
            {erro && (
              <p role="alert" className={cx.erro}>
                {erro}
              </p>
            )}
          </div>
        )}
      </Gaveta>

      <Gaveta
        aberta={fase !== null}
        aoFechar={() => setFase(null)}
        titulo="Mudar fase"
        rodape={
          <>
            <button type="button" className={cx.secundario} onClick={() => setFase(null)}>
              Cancelar
            </button>
            <button type="button" className={`${cx.primario} flex-1`} disabled={pendente} onClick={salvarFase}>
              {pendente ? "Salvando…" : "Mudar fase"}
            </button>
          </>
        }
      >
        {fase && (
          <div className="space-y-3">
            <p className={cx.dica}>A fase é o funil comercial. A situação (Novo, Em triagem, Convertido…) é outra coisa e não muda por aqui.</p>
            <div role="radiogroup" aria-label="Fase" className="space-y-1">
              {stageOptions.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={fase.stage === s}
                  onClick={() => setFase({ ...fase, stage: s })}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-atd-pilula px-4 text-left text-corpo text-tx ${fase.stage === s ? "bg-atd-ouro-suave font-bold" : "bg-atd-pilula"}`}
                >
                  <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${fase.stage === s ? "border-atd-ouro-texto" : "border-atd-campo"}`}>
                    {fase.stage === s && <span className="h-2.5 w-2.5 rounded-full bg-atd-ouro-texto" />}
                  </span>
                  {stageLabels[s]}
                  {s === c.stage && <span className="text-etiqueta text-atd-previa">(atual)</span>}
                </button>
              ))}
            </div>
            {fase.stage === "PERDIDO" && fase.stage !== c.stage && (
              <div className="space-y-2">
                <Campo rotulo="Motivo da perda">
                  {({ id }) => (
                    <select id={id} className={cx.campo} value={fase.motivo} onChange={(e) => setFase({ ...fase, motivo: e.target.value })}>
                      <option value="">Escolha o motivo</option>
                      {MOTIVOS_DE_PERDA.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value="Outro">Outro…</option>
                    </select>
                  )}
                </Campo>
                {fase.motivo === "Outro" && (
                  <Campo rotulo="Qual?">{({ id }) => <input id={id} className={cx.campo} value={fase.outro} maxLength={120} onChange={(e) => setFase({ ...fase, outro: e.target.value })} autoComplete="off" />}</Campo>
                )}
              </div>
            )}
            {erro && (
              <p role="alert" className={cx.erro}>
                {erro}
              </p>
            )}
          </div>
        )}
      </Gaveta>
    </div>
  );
}
