"use client";

import { useEffect, useState } from "react";
import { FilePlus, X } from "lucide-react";
import { listDocumentTemplates } from "@/lib/actions/documentTemplates";
import { TEMPLATE_CATEGORIES } from "@/lib/documentCategories";
import { generateDocumentFromTemplate } from "@/lib/actions/generateDocument";

type Template = { id: string; name: string; category: string };

export default function GerarDocumentoButton({ caseId, attendanceId }: { caseId?: string; attendanceId?: string }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [category, setCategory] = useState<string>(TEMPLATE_CATEGORIES[0].value as string);
  const [templateId, setTemplateId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && !templates) {
      listDocumentTemplates().then(setTemplates);
    }
  }, [open, templates]);

  const filtered = (templates ?? []).filter((t) => t.category === category);

  async function handleGenerate() {
    if (!templateId) {
      setError("Selecione um modelo.");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await generateDocumentFromTemplate(templateId, { caseId, attendanceId });
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
          <div className="bg-white rounded-xl shadow-pop w-full max-w-md" onClick={(e) => e.stopPropagation()}>
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
