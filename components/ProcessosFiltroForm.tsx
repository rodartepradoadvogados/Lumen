"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { searchCasesPreview, type CasePreviewResult } from "@/lib/actions/casesSearch";

// Antes, o campo "Buscar" (e os selects de Área/Responsável/Ordenar por) só filtravam de verdade
// depois de clicar em "Aplicar" — que recarregava a página inteira via querystring. Agora, digitar
// ou trocar qualquer um desses campos abre um painel suspenso com uma prévia dinâmica (debounce de
// 300ms), igual à barra de busca do TopBar (components/GlobalSearch.tsx): clicar num resultado vai
// direto pro processo, sem esperar nada. "Aplicar" continua fazendo exatamente o que já fazia —
// navegar via querystring pra atualizar a listagem completa abaixo.
export default function ProcessosFiltroForm({
  status,
  natureza,
  esfera,
  materia,
  initialQ,
  initialArea,
  initialResponsibleId,
  initialSort,
  areas,
  users,
  sortLabels,
  clearHref,
}: {
  status?: string;
  natureza?: string;
  esfera?: string;
  materia?: string;
  initialQ: string;
  initialArea: string;
  initialResponsibleId: string;
  initialSort: string;
  areas: string[];
  users: { id: string; name: string }[];
  sortLabels: Record<string, string>;
  clearHref: string | null;
}) {
  const [q, setQ] = useState(initialQ);
  const [area, setArea] = useState(initialArea);
  const [responsibleId, setResponsibleId] = useState(initialResponsibleId);
  const [sort, setSort] = useState(initialSort);
  const [preview, setPreview] = useState<CasePreviewResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const hasCriteria = q.trim().length >= 2 || Boolean(area) || Boolean(responsibleId);

  // Debounce de 300ms — dispara a cada mudança de texto, área, responsável ou ordenação.
  useEffect(() => {
    if (!hasCriteria) {
      setPreview([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const currentReq = ++reqId.current;
    const timer = setTimeout(async () => {
      const res = await searchCasesPreview({ q: q.trim(), status, area, responsibleId, natureza, esfera, materia, sort });
      if (currentReq !== reqId.current) return; // resposta obsoleta
      setPreview(res);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, area, responsibleId, sort]);

  // Fecha o painel ao clicar fora do formulário inteiro (área/responsável também abrem prévia,
  // não só o campo de texto, então o clique-fora cobre o form todo).
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowPreview(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <form className="p-4 flex flex-wrap items-end gap-3">
        {status && <input type="hidden" name="status" value={status} />}
        {/* Preserva a aba de natureza (e os chips de esfera/matéria, quando aplicável) ao enviar
            este formulário — sem isso, "Aplicar" voltaria sempre pra "Todos". */}
        {natureza && <input type="hidden" name="natureza" value={natureza} />}
        {esfera && <input type="hidden" name="esfera" value={esfera} />}
        {materia && <input type="hidden" name="materia" value={materia} />}

        <div className="flex-1 min-w-[200px] relative">
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60 block mb-1">Buscar</label>
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-800/30 dark:text-cream-50/30" />
            <input
              type="text"
              name="q"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setShowPreview(true);
              }}
              onFocus={() => setShowPreview(true)}
              placeholder="Título, número, cliente ou parte adversa"
              className="pr-input w-full pl-8"
              autoComplete="off"
            />
          </div>

          {showPreview && hasCriteria && (
            <div className="absolute left-0 top-full mt-1 w-full min-w-[320px] z-30 bg-white dark:bg-navy-900 rounded-xl border border-navy-800/10 dark:border-white/10 shadow-pop overflow-hidden max-h-[60vh] overflow-y-auto scrollbar-thin">
              {loading && <p className="px-4 py-3 text-sm text-navy-800/50 dark:text-cream-50/50">Buscando...</p>}
              {!loading && preview.length === 0 && <p className="px-4 py-3 text-sm text-navy-800/50 dark:text-cream-50/50">Nada encontrado.</p>}
              {!loading &&
                preview.map((r) => (
                  <Link
                    key={r.id}
                    href={r.href}
                    onClick={() => setShowPreview(false)}
                    className="flex flex-col items-start w-full px-4 py-2.5 text-left hover:bg-cream-50 dark:hover:bg-white/5 transition-colors border-b border-navy-800/5 dark:border-white/10 last:border-0"
                  >
                    <span className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate w-full">{r.titulo}</span>
                    {r.subtitulo && <span className="text-xs text-navy-800/50 dark:text-cream-50/50 truncate w-full">{r.subtitulo}</span>}
                  </Link>
                ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60 block mb-1">Área</label>
          <select name="area" value={area} onChange={(e) => setArea(e.target.value)} className="pr-input">
            <option value="">Todas</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60 block mb-1">Responsável</label>
          <select name="responsibleId" value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)} className="pr-input">
            <option value="">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60 block mb-1">Ordenar por</label>
          <select name="sort" value={sort} onChange={(e) => setSort(e.target.value)} className="pr-input">
            {Object.entries(sortLabels).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2">
          Aplicar
        </button>
        {clearHref && (
          <Link
            href={clearHref}
            className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50 px-2"
          >
            Limpar filtros
          </Link>
        )}
      </form>
    </div>
  );
}
