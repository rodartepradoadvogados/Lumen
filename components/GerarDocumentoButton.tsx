"use client";

import { useEffect, useState } from "react";
import { FilePlus, X } from "lucide-react";
import { listDocumentTemplates } from "@/lib/actions/documentTemplates";
import { TEMPLATE_CATEGORIES } from "@/lib/documentCategories";
import { generateDocumentFromTemplate } from "@/lib/actions/generateDocument";
import { FORMA_COBRANCA_OPTIONS, FORMA_PAGAMENTO_OPTIONS, type FormaCobranca, type FormaPagamento } from "@/lib/honorarios";

type Template = { id: string; name: string; category: string };

const EXITO_FORMAS: FormaCobranca[] = ["PERCENTUAL", "ENTRADA_EXITO", "SO_EXITO"];
const PARCELAVEL_FORMAS: FormaCobranca[] = ["FIXO", "SO_ENTRADA", "ENTRADA_EXITO"];

export default function GerarDocumentoButton({ caseId, attendanceId }: { caseId?: string; attendanceId?: string }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [category, setCategory] = useState<string>(TEMPLATE_CATEGORIES[0].value as string);
  const [templateId, setTemplateId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formaCobranca, setFormaCobranca] = useState<FormaCobranca>("PERCENTUAL");
  const [percentualExito, setPercentualExito] = useState("");
  const [valorFixo, setValorFixo] = useState("");
  const [valorMensalidade, setValorMensalidade] = useState("");
  const [valorEntrada, setValorEntrada] = useState("");
  const [parcelado, setParcelado] = useState(false);
  const [numeroParcelas, setNumeroParcelas] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | "">("");
  const [numeroBoleto, setNumeroBoleto] = useState("");
  const [notaFiscal, setNotaFiscal] = useState(false);

  useEffect(() => {
    if (open && !templates) {
      listDocumentTemplates().then(setTemplates);
    }
  }, [open, templates]);

  const filtered = (templates ?? []).filter((t) => t.category === category);
  const isContrato = category === "CONTRATO";

  async function handleGenerate() {
    if (!templateId) {
      setError("Selecione um modelo.");
      return;
    }
    setError(null);
    setLoading(true);
    const honorarios = isContrato
      ? {
          formaCobranca,
          percentualExito: percentualExito ? Number(percentualExito) : undefined,
          valorFixo: valorFixo ? Number(valorFixo) : undefined,
          valorMensalidade: valorMensalidade ? Number(valorMensalidade) : undefined,
          valorEntrada: valorEntrada ? Number(valorEntrada) : undefined,
          parcelado,
          numeroParcelas: numeroParcelas ? Number(numeroParcelas) : undefined,
          formaPagamento: formaPagamento || undefined,
          numeroBoleto: numeroBoleto || undefined,
          notaFiscal,
        }
      : undefined;
    const result = await generateDocumentFromTemplate(templateId, { caseId, attendanceId }, honorarios);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.driveUrl) {
      window.open(result.driveUrl, "_blank", "noopener,noreferrer");
    }
    setOpen(false);
    setTemplateId("");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-cream-50 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
      >
        <FilePlus size={16} /> Gerar Documento
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-pop w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8">
              <h3 className="font-serif font-bold text-navy-900">Gerar Documento</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 hover:text-navy-900">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-navy-800/60">Categoria</label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setTemplateId("");
                  }}
                  className="gd-input"
                >
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Modelo</label>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="gd-input" disabled={!templates}>
                  <option value="">{templates ? "Selecione..." : "Carregando..."}</option>
                  {filtered.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {templates && filtered.length === 0 && (
                  <p className="text-[11px] text-navy-800/45 mt-1">Nenhum modelo cadastrado nessa categoria ainda. Adicione em Configurações → Modelos de Documento.</p>
                )}
              </div>

              {isContrato && (
                <div className="border-t border-navy-800/8 pt-3 space-y-3">
                  <p className="text-[11px] font-semibold text-navy-800/45 uppercase tracking-wide">Forma de cobrança dos honorários</p>
                  <div>
                    <select value={formaCobranca} onChange={(e) => setFormaCobranca(e.target.value as FormaCobranca)} className="gd-input">
                      {FORMA_COBRANCA_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {EXITO_FORMAS.includes(formaCobranca) && (
                    <div>
                      <label className="text-xs font-medium text-navy-800/60">Percentual sobre o êxito (%)</label>
                      <input type="number" step="0.01" value={percentualExito} onChange={(e) => setPercentualExito(e.target.value)} className="gd-input" />
                    </div>
                  )}

                  {formaCobranca === "FIXO" && (
                    <div>
                      <label className="text-xs font-medium text-navy-800/60">Valor fixo (R$)</label>
                      <input type="number" step="0.01" value={valorFixo} onChange={(e) => setValorFixo(e.target.value)} className="gd-input" />
                    </div>
                  )}

                  {formaCobranca === "MENSALIDADE" && (
                    <div>
                      <label className="text-xs font-medium text-navy-800/60">Valor da mensalidade (R$)</label>
                      <input type="number" step="0.01" value={valorMensalidade} onChange={(e) => setValorMensalidade(e.target.value)} className="gd-input" />
                    </div>
                  )}

                  {(formaCobranca === "ENTRADA_EXITO" || formaCobranca === "SO_ENTRADA") && (
                    <div>
                      <label className="text-xs font-medium text-navy-800/60">Valor de entrada (R$)</label>
                      <input type="number" step="0.01" value={valorEntrada} onChange={(e) => setValorEntrada(e.target.value)} className="gd-input" />
                    </div>
                  )}

                  {PARCELAVEL_FORMAS.includes(formaCobranca) && (
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="parcelado" checked={parcelado} onChange={(e) => setParcelado(e.target.checked)} />
                      <label htmlFor="parcelado" className="text-xs font-medium text-navy-800/60">Parcelado</label>
                      {parcelado && (
                        <input
                          type="number"
                          min={2}
                          placeholder="Nº de parcelas"
                          value={numeroParcelas}
                          onChange={(e) => setNumeroParcelas(e.target.value)}
                          className="gd-input flex-1"
                        />
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-xs font-medium text-navy-800/60">Forma de pagamento</label>
                      <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento)} className="gd-input">
                        <option value="">Não especificar</option>
                        {FORMA_PAGAMENTO_OPTIONS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {formaPagamento === "BOLETO" && (
                      <div>
                        <label className="text-xs font-medium text-navy-800/60">Nº do boleto</label>
                        <input value={numeroBoleto} onChange={(e) => setNumeroBoleto(e.target.value)} className="gd-input" />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="notaFiscal" checked={notaFiscal} onChange={(e) => setNotaFiscal(e.target.checked)} />
                    <label htmlFor="notaFiscal" className="text-xs font-medium text-navy-800/60">Emitir nota fiscal</label>
                  </div>
                </div>
              )}

              {error && <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{error}</p>}
              <button
                onClick={handleGenerate}
                disabled={loading || !templateId}
                className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50"
              >
                {loading ? "Gerando..." : "Gerar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx global>{`
        .gd-input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .gd-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </>
  );
}
