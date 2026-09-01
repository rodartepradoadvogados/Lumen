"use client";

import { useRef, useState, useTransition } from "react";
import { salvarEmailTemplate, enviarTesteEmailTemplate, type EmailTemplateItem } from "@/lib/actions/emailTemplates";
import { buildDigestEmailHtml, RODAPE_OBRIGATORIO, SAMPLE_VARS, TEMPLATE_VARS, type TemplateVar } from "@/lib/emailTemplateRender";
import { ALL_EVENTOS, type NotificationEvent } from "@/lib/comunicadosEventos";

const VAR_LABEL: Record<TemplateVar, string> = {
  cliente: "Cliente",
  processo: "Processo",
  tribunal: "Tribunal",
  prazo: "Prazo",
  link: "Link",
  responsavel: "Responsável",
  teor: "Teor",
};

type Aba = "corpo" | "assunto" | "rodape";

// Documento 06 (Fase 3 — Comunicados), "editor de template com prévia" — a segunda coluna da
// tela, ao lado de ComunicadosForm. Admin-only (lib/actions/emailTemplates.ts já garante isso no
// servidor; aqui é só pra não mostrar controles de edição pra quem não é sócio). Layout de 3
// faixas dentro da coluna (documento 06): chips de variável arrastáveis (240px) — corpo/assunto
// editáveis — prévia ao vivo (440px), que usa a MESMA função de renderização
// (lib/emailTemplateRender.ts) usada de verdade no envio, pra prévia nunca divergir do real.
export default function TemplateEditor({ initial }: { initial: EmailTemplateItem[] }) {
  const [templates, setTemplates] = useState(initial);
  const [eventoAtual, setEventoAtual] = useState<NotificationEvent>(initial[0]?.event);
  const [aba, setAba] = useState<Aba>("corpo");
  const [feedback, setFeedback] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [testando, startTesteTransition] = useTransition();
  const corpoRef = useRef<HTMLTextAreaElement>(null);

  const atual = templates.find((t) => t.event === eventoAtual);
  if (!atual) return null;

  const atualizar = (patch: Partial<EmailTemplateItem>) => {
    setFeedback(null);
    setTemplates((ts) => ts.map((t) => (t.event === eventoAtual ? { ...t, ...patch } : t)));
  };

  const inserirVariavel = (v: TemplateVar) => {
    const campo = corpoRef.current;
    const chip = `{{${v}}}`;
    if (aba !== "corpo" || !campo) {
      atualizar({ bodyHtml: `${atual.bodyHtml}${chip}` });
      return;
    }
    const inicio = campo.selectionStart ?? campo.value.length;
    const fim = campo.selectionEnd ?? campo.value.length;
    const novoTexto = campo.value.slice(0, inicio) + chip + campo.value.slice(fim);
    atualizar({ bodyHtml: novoTexto });
    requestAnimationFrame(() => {
      campo.focus();
      campo.setSelectionRange(inicio + chip.length, inicio + chip.length);
    });
  };

  const salvar = () => {
    setFeedback(null);
    startTransition(async () => {
      const result = await salvarEmailTemplate(eventoAtual, { subject: atual.subject, bodyHtml: atual.bodyHtml });
      if (result.error) {
        setFeedback({ tipo: "erro", texto: result.error });
        return;
      }
      setTemplates((ts) => ts.map((t) => (t.event === eventoAtual ? { ...t, salvo: true } : t)));
      setFeedback({ tipo: "ok", texto: "Salvo." });
    });
  };

  const enviarTeste = () => {
    setFeedback(null);
    startTesteTransition(async () => {
      const result = await enviarTesteEmailTemplate(eventoAtual, { subject: atual.subject, bodyHtml: atual.bodyHtml });
      setFeedback(result.error ? { tipo: "erro", texto: result.error } : { tipo: "ok", texto: "Teste enviado para o seu e-mail." });
    });
  };

  const previaHtml = buildDigestEmailHtml({ subject: atual.subject, bodyHtml: atual.bodyHtml, url: SAMPLE_VARS.link, vars: SAMPLE_VARS });

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-tx-2">
          Evento
          <select
            value={eventoAtual}
            onChange={(e) => {
              setFeedback(null);
              setEventoAtual(e.target.value as NotificationEvent);
            }}
            className="block w-full mt-1 border border-regua bg-sf text-tx px-2 py-1.5 text-sm"
          >
            {templates.map((t) => (
              <option key={t.event} value={t.event}>
                {ALL_EVENTOS[t.event]}
                {!t.salvo ? " (padrão)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-tx">
          {atual.label} <span className="font-normal text-xs text-tx-3">— editável</span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={testando}
            onClick={enviarTeste}
            className="h-8 border-2 border-regua-forte bg-transparent hover:bg-acao-bg text-tx font-semibold text-xs px-3 disabled:opacity-60"
          >
            {testando ? "Enviando…" : "Enviar teste"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={salvar}
            className="h-8 bg-acao hover:bg-acao-hover text-acao-tx font-semibold text-xs px-3 disabled:opacity-60"
          >
            {pending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
      {feedback && <p className={`text-xs font-medium ${feedback.tipo === "erro" ? "text-atencao" : "text-concluido"}`}>{feedback.texto}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-tx-3">Variáveis</p>
          {TEMPLATE_VARS.map((v) => (
            <div
              key={v}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", `{{${v}}}`)}
              onClick={() => inserirVariavel(v)}
              className="cursor-grab active:cursor-grabbing select-none border border-regua bg-sf-apoio px-2.5 py-1.5 text-xs font-medium text-tx"
              title={`Arraste para o corpo, ou clique para inserir no cursor. Some da prévia se não houver valor.`}
            >
              {`{{${v}}}`} <span className="text-tx-3">{VAR_LABEL[v]}</span>
            </div>
          ))}
          <p className="text-[11px] text-tx-3 pt-1">Uma linha inteira some da prévia se alguma variável dela estiver sem valor.</p>
        </div>

        <div className="space-y-3">
          <div className="flex gap-1 border-b-2 border-regua-forte">
            {(["corpo", "assunto", "rodape"] as Aba[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAba(a)}
                className={`px-3 py-2 text-xs font-semibold ${aba === a ? "border-b-2 border-acao text-tx -mb-[2px]" : "text-tx-3"}`}
              >
                {a === "corpo" ? "Corpo" : a === "assunto" ? "Assunto" : "Rodapé e LGPD"}
              </button>
            ))}
          </div>

          {aba === "corpo" && (
            <textarea
              ref={corpoRef}
              value={atual.bodyHtml}
              onChange={(e) => atualizar({ bodyHtml: e.target.value })}
              onDrop={(e) => {
                e.preventDefault();
                inserirVariavel(e.dataTransfer.getData("text/plain").slice(2, -2) as TemplateVar);
              }}
              onDragOver={(e) => e.preventDefault()}
              rows={10}
              className="w-full border border-regua bg-sf text-tx px-3 py-2 text-sm font-mono"
            />
          )}
          {aba === "assunto" && (
            <input
              value={atual.subject}
              onChange={(e) => atualizar({ subject: e.target.value })}
              className="w-full border border-regua bg-sf text-tx px-3 py-2 text-sm"
            />
          )}
          {aba === "rodape" && (
            <div className="bg-sf-apoio border-l-4 border-regua-forte p-3 space-y-2">
              <p className="text-xs text-tx-2">{RODAPE_OBRIGATORIO}</p>
              <p className="text-[11px] text-tx-3">
                Texto fixo — não é editável aqui, pra ninguém apagar por engano o aviso de LGPD e o link de cancelamento.
              </p>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-tx-3 mb-1.5">Prévia</p>
            <div className="border border-regua bg-sf-apoio p-3 max-w-[440px] overflow-x-auto">
              {/* eslint-disable-next-line react/no-danger -- prévia do próprio admin do HTML que
                  ele mesmo está editando agora (atual.bodyHtml); as variáveis vêm de SAMPLE_VARS,
                  dado de amostra fixo, nunca de outro usuário. */}
              <div dangerouslySetInnerHTML={{ __html: previaHtml }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
