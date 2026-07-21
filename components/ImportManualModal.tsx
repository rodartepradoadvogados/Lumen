"use client";

import { useState } from "react";
import { BookOpen, X } from "lucide-react";

export default function ImportManualModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 justify-center bg-white border border-gold-600/40 hover:bg-gold-100/40 text-gold-700 text-sm font-semibold rounded-lg px-4 py-2.5 w-fit"
      >
        <BookOpen size={16} /> Manual
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-pop w-full max-w-2xl max-h-[85vh] overflow-y-auto animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-navy-800/8 sticky top-0 bg-white rounded-t-xl">
              <h3 className="font-serif font-bold text-lg text-navy-900">Legenda para Preenchimento</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 hover:text-navy-900">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6 text-sm text-navy-800">
              <p className="text-xs text-navy-800/55">
                Estas orientações também estão na aba <strong>“Legenda”</strong> do modelo .xlsx de Processos, Casos e Atendimentos, disponível em{" "}
                <a href="/configuracoes/importar" className="text-gold-700 hover:underline">
                  Configurações → Importar Dados
                </a>
                .
              </p>

              <section className="space-y-2">
                <h4 className="font-serif font-bold text-gold-700 uppercase tracking-wide text-xs">
                  1. Coluna “Tipo” — o que cada valor faz
                </h4>
                <div className="rounded-lg border border-navy-800/10 divide-y divide-navy-800/8 overflow-hidden">
                  <LegendRow label="Processo" value="Cria um Processo judicial (usa Número, Vara, Tribunal, Instância etc.)." />
                  <LegendRow label="Caso" value="Cria um Caso (mesma estrutura de Processo, sem exigir número/tribunal)." />
                  <LegendRow label="Atendimento" value="Cria um Atendimento (consulta ou serviço avulso, sem processo)." />
                  <LegendRow
                    label="Contato"
                    value="Não cria processo/caso — cadastra só o contato (Cliente/Autor/Réu preenchido) em Contatos → Clientes."
                    highlight
                  />
                </div>
              </section>

              <section className="space-y-2">
                <h4 className="font-serif font-bold text-gold-700 uppercase tracking-wide text-xs">
                  2. Formato do número do processo (padrão CNJ)
                </h4>
                <div className="rounded-lg bg-cream-50 border border-navy-800/10 px-4 py-3 space-y-1">
                  <p className="font-mono text-navy-900 text-base tracking-wide">NNNNNNN-DD.AAAA.J.TR.OOOO</p>
                  <p className="font-mono text-xs text-navy-800/60">Exemplo: 0001234-56.2026.8.09.0051</p>
                </div>
                <ul className="text-xs text-navy-800/70 space-y-0.5 list-disc list-inside">
                  <li><strong>NNNNNNN</strong> — número sequencial do processo (7 dígitos)</li>
                  <li><strong>DD</strong> — dígito verificador (2 dígitos)</li>
                  <li><strong>AAAA</strong> — ano de ajuizamento (4 dígitos)</li>
                  <li><strong>J</strong> — segmento de justiça (1 dígito, ex: 8 = Justiça Estadual)</li>
                  <li><strong>TR</strong> — tribunal (2 dígitos)</li>
                  <li><strong>OOOO</strong> — unidade de origem (4 dígitos)</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h4 className="font-serif font-bold text-gold-700 uppercase tracking-wide text-xs">
                  3. Como indicar o cliente
                </h4>
                <div className="rounded-lg border border-navy-800/10 divide-y divide-navy-800/8 overflow-hidden">
                  <LegendRow
                    label="Forma simples"
                    value="Preencha só a coluna “Cliente” com o nome do seu cliente. “Outros envolvidos” recebe a parte contrária, se quiser registrar."
                  />
                  <LegendRow
                    label="Forma recomendada"
                    value="Preencha “Autor” e “Réu” com os nomes das partes, e diga em “Papel do cliente” qual das duas é o seu cliente (ex: “Autor” ou “Réu”). O sistema identifica automaticamente quem é o cliente e quem é a parte contrária."
                  />
                </div>
                <p className="text-xs text-bordo-700 bg-bordo-100 border border-bordo-400/40 rounded-lg px-3 py-2">
                  Atenção: se “Autor” ou “Réu” estiverem preenchidos, eles têm prioridade — a coluna “Cliente” é ignorada nesse caso.
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-serif font-bold text-gold-700 uppercase tracking-wide text-xs">
                  4. Siglas de tribunal aceitas na coluna “Tribunal”
                </h4>
                <div className="rounded-lg border border-navy-800/10 divide-y divide-navy-800/8 overflow-hidden">
                  <LegendRow label="Tribunais superiores" value="STF, STJ, TST, TSE, STM" />
                  <LegendRow label="Justiça Estadual (2º grau)" value="TJ + sigla do estado, ex: TJGO, TJSP, TJRJ, TJMG..." />
                  <LegendRow label="Justiça Federal" value="TRF1, TRF2, TRF3, TRF4, TRF5, TRF6" />
                  <LegendRow label="Justiça do Trabalho" value="TRT1 a TRT24" />
                  <LegendRow label="Justiça Eleitoral" value="TRE + sigla do estado, ex: TREGO, TRESP..." />
                </div>
              </section>

              <section className="space-y-2">
                <h4 className="font-serif font-bold text-gold-700 uppercase tracking-wide text-xs">
                  5. Outras orientações
                </h4>
                <ul className="text-xs text-navy-800/70 space-y-1 list-disc list-inside">
                  <li>Campos em branco são ignorados — preencha só o que tiver.</li>
                  <li>Datas no formato DD/MM/AAAA (ex: 21/07/2026).</li>
                  <li>Valores monetários só com números, sem “R$” e sem separador de milhar (ex: 15000 ou 15000,50).</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LegendRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex flex-col sm:flex-row gap-1 sm:gap-3 px-4 py-2.5 ${highlight ? "bg-bordo-100/50" : ""}`}>
      <span className={`text-xs font-semibold shrink-0 sm:w-40 ${highlight ? "text-bordo-700" : "text-navy-900"}`}>{label}</span>
      <span className="text-xs text-navy-800/70">{value}</span>
    </div>
  );
}
