"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search, X, Check, Plus } from "lucide-react";
import {
  DOCUMENT_TYPE_GROUPS,
  LEGACY_DOCUMENT_TYPES,
  composeDocumentTypeGroups,
  getDocumentType,
  type DocumentType,
  type OfficeDocumentTypeEntry,
} from "@/lib/documentTypes";
import { listOfficeDocumentTypes } from "@/lib/actions/documentTypes";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import NewDocumentTypeDialog from "@/components/NewDocumentTypeDialog";

// Normaliza pra comparar sem diferenciar maiúsc/minúsc/acento (ex.: "peticao" encontra "Petição").
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Antes era um <select> nativo (lista suspensa simples); virou uma janela suspensa (modal) com
// busca porque o catálogo de lib/documentTypes.ts já passou de 70 tipos — rolar um <select> nativo
// gigante era o principal problema reportado. A API pública (value/onChange/className/allowAll/
// includeLegacy/excludeKeys/name) fica igual à do <select> antigo de propósito: todo lugar que já
// usa este componente (Anexos de Processo/Atendimento em AttachmentList.tsx, e o catálogo de
// Documentos da Assessoria em AssessoriaDocumentosTab.tsx) ganha a janela suspensa automaticamente,
// sem precisar mudar nada na tela que chama.
//
// Desde a Tarefa B (2026-08): também busca, ao abrir, os tipos que o PRÓPRIO escritório cadastrou
// (ver OfficeDocumentType, lib/actions/documentTypes.ts) e os mistura aos nativos — sempre, em
// toda instância deste componente, sem prop nenhuma para isso. Só o botão "+ Novo tipo" é opt-in
// (prop `allowCreate`): ele só faz sentido onde a pessoa está categorizando UM documento (ao
// arrastar/selecionar um arquivo para anexar), não num filtro genérico de lista.
export default function DocumentTypeSelect({
  value,
  onChange,
  className,
  allowAll,
  includeLegacy,
  excludeKeys,
  name,
  allowCreate,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  allowAll?: boolean;
  includeLegacy?: boolean;
  // Tipos que não fazem sentido neste contexto (ex.: "Parecer" na Assessoria, que já tem
  // campo próprio para isso, então não deve aparecer de novo como tipo de anexo genérico).
  excludeKeys?: string[];
  name?: string;
  // Mostra o botão "+ Novo tipo" dentro da janela suspensa — só onde a pessoa está categorizando
  // um documento específico (ao arrastar/selecionar um anexo). Quem não passa esta prop não vê
  // nenhuma diferença de comportamento além do catálogo agora incluir os tipos do escritório.
  allowCreate?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [officeTypes, setOfficeTypes] = useState<OfficeDocumentTypeEntry[]>([]);
  const [officeTypesLoaded, setOfficeTypesLoaded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Busca os tipos do escritório só quando a janela é aberta pela primeira vez (não no mount de
  // cada instância — esta lista aparece muitas vezes na mesma tela, ex.: um DocumentTypeSelect por
  // arquivo em espera de upload) e só uma vez por instância depois disso.
  useEffect(() => {
    if (!open || officeTypesLoaded) return;
    let cancelled = false;
    listOfficeDocumentTypes().then((types) => {
      if (!cancelled) {
        setOfficeTypes(types);
        setOfficeTypesLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, officeTypesLoaded]);

  const currentLabel = value === "TODOS" ? "Todos os tipos" : getDocumentType(value, officeTypes).label;

  const secoes = useMemo(() => DOCUMENT_TYPE_GROUPS.map((g) => g.group), []);

  // Grupos na mesma ordem curada de DOCUMENT_TYPE_GROUPS (não é ordem alfabética — é a taxonomia
  // do escritório, do processual ao financeiro), mas dentro de cada grupo os tipos vêm em ordem
  // alfanumérica pra ficar fácil de escanear visualmente. A busca filtra por nome sem diferenciar
  // maiúsc/minúsc/acento e esconde grupos que ficarem vazios.
  const grupos = useMemo(() => {
    const termo = normalize(search.trim());
    const composedGroups = composeDocumentTypeGroups(officeTypes);
    const base: { grupo: string; tipos: DocumentType[] }[] = composedGroups.map((g) => ({
      grupo: g.group,
      tipos: g.types.filter((t) => !excludeKeys?.includes(t.key)),
    }));
    if (includeLegacy) {
      base.push({
        grupo: "Categorias antigas",
        tipos: LEGACY_DOCUMENT_TYPES.filter((t) => !excludeKeys?.includes(t.key)),
      });
    }
    return base
      .map((g) => ({
        grupo: g.grupo,
        tipos: g.tipos
          .filter((t) => !termo || normalize(t.label).includes(termo))
          .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
      }))
      .filter((g) => g.tipos.length > 0);
  }, [search, excludeKeys, includeLegacy, officeTypes]);

  const showTodos = allowAll && (!search.trim() || normalize("todos os tipos").includes(normalize(search.trim())));

  function handleSelect(key: string) {
    onChange(key);
    setOpen(false);
    setSearch("");
  }

  function handleClose() {
    setOpen(false);
    setSearch("");
  }

  function handleTypeCreated(type: { chave: string; rotulo: string; secao: string }) {
    setOfficeTypes((prev) => [...prev, type]);
    setCreateOpen(false);
    handleSelect(type.chave);
  }

  useEscapeToClose(open && !createOpen, handleClose);

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${className || ""} flex items-center justify-between gap-1.5 text-left bg-sf`}
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown size={13} className="shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4" onClick={handleClose}>
          <div
            className="bg-sf shadow-modal w-full max-w-lg max-h-[85vh] flex flex-col animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-bold text-tx">Selecionar tipo de documento</h3>
              <button type="button" onClick={handleClose} className="text-tx-3 hover:text-tx">
                <X size={18} />
              </button>
            </div>

            <div className="shrink-0 px-5 pt-4 pb-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-3 pointer-events-none" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar tipo de documento..."
                  className="w-full pl-8 pr-3 py-2 border border-regua-forte bg-sf text-sm text-tx placeholder:text-tx-3 focus:outline-none focus:ring-2 focus:ring-acao/40"
                />
              </div>
            </div>

            {allowCreate && (
              <div className="shrink-0 px-5 pb-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-acao hover:text-acao-hover"
                >
                  <Plus size={13} /> Novo tipo
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-2">
              {showTodos && (
                <button
                  type="button"
                  onClick={() => handleSelect("TODOS")}
                  className="flex items-center justify-between gap-2 w-full px-3 py-2 text-left text-sm font-semibold text-tx hover:bg-sf-apoio transition-colors"
                >
                  Todos os tipos
                  {value === "TODOS" && <Check size={14} className="text-marca-tx shrink-0" />}
                </button>
              )}

              {grupos.length === 0 && !showTodos && (
                <p className="px-3 py-4 text-sm text-tx-3">Nenhum tipo de documento encontrado.</p>
              )}

              {grupos.map((g) => (
                <div key={g.grupo} className="mb-1">
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-tx-3 uppercase tracking-wide">{g.grupo}</p>
                  {g.tipos.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => handleSelect(t.key)}
                        className="flex items-center justify-between gap-2 w-full px-3 py-2 text-left hover:bg-sf-apoio transition-colors"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Icon size={14} className="shrink-0 text-tx-3" />
                          <span className="text-sm text-tx truncate">{t.label}</span>
                        </span>
                        {value === t.key && <Check size={14} className="text-marca-tx shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {createOpen && <NewDocumentTypeDialog secoes={secoes} onClose={() => setCreateOpen(false)} onCreated={handleTypeCreated} />}
    </>
  );
}
