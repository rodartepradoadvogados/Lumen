"use client";

import { useMemo, useState } from "react";
import { ORGAOS_ADMINISTRATIVOS, CATEGORIA_ORDER_ADMIN, type OrgaoAdministrativoCatalogEntry } from "@/lib/orgaosAdministrativos";
import { ESFERAS, MATERIAS_ADMIN } from "@/lib/caseNatureza";
import { Search, X } from "lucide-react";

// Seletor de órgão administrativo do catálogo (lib/orgaosAdministrativos.ts) para o cadastro de
// processo — equivalente administrativo de TribunalFields + TribunalPickerModal, só que os dois
// papéis (campo + modal de busca) vivem num componente só, porque aqui os campos derivados do
// catálogo (sigla/nome/sistema/link/esfera/matéria) não têm por que virar texto livre editável
// como no Tribunal: ou o usuário escolhe um órgão da lista, ou ajusta esfera/matéria nos dois
// selects visíveis (o órgão pode atuar em mais de uma esfera, por isso o padrão do catálogo é só
// um ponto de partida, não uma trava). Por isso os 6 campos saem como <input type="hidden">,
// exatamente com os mesmos nomes que TribunalFields já usa no form de Novo Processo
// (tribunalSigla/tribunalNome/tribunalSistema/tribunalLink), mais adminEsfera/adminMateria.
type Props = {
  defaultSigla?: string | null;
  defaultNome?: string | null;
  defaultSistema?: string | null;
  defaultLink?: string | null;
  defaultEsfera?: string | null;
  defaultMateria?: string | null;
  // Notifica o formulário pai da escolha (ex.: pra atualizar algo fora deste componente, como um
  // resumo em outro lugar da tela) — opcional porque os hidden inputs já bastam pra submissão.
  onSelect?: (orgao: OrgaoAdministrativoCatalogEntry) => void;
};

export default function OrgaoAdministrativoPicker({
  defaultSigla,
  defaultNome,
  defaultSistema,
  defaultLink,
  defaultEsfera,
  defaultMateria,
  onSelect,
}: Props) {
  const [sigla, setSigla] = useState(defaultSigla ?? "");
  const [nome, setNome] = useState(defaultNome ?? "");
  const [sistema, setSistema] = useState(defaultSistema ?? "");
  const [link, setLink] = useState(defaultLink ?? "");
  const [esfera, setEsfera] = useState(defaultEsfera ?? "");
  const [materia, setMateria] = useState(defaultMateria ?? "");

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Mesma lógica de agrupamento de TribunalPickerModal.tsx: respeita CATEGORIA_ORDER_ADMIN (não
  // ordem alfabética), busca por sigla ou nome.
  const grupos = useMemo(() => {
    const termo = search.trim().toLowerCase();
    const filtrados = termo
      ? ORGAOS_ADMINISTRATIVOS.filter((o) => o.sigla.toLowerCase().includes(termo) || o.nome.toLowerCase().includes(termo))
      : ORGAOS_ADMINISTRATIVOS;
    return CATEGORIA_ORDER_ADMIN.map((categoria) => ({
      categoria,
      itens: filtrados.filter((o) => o.categoria === categoria),
    })).filter((g) => g.itens.length > 0);
  }, [search]);

  function handleSelect(o: OrgaoAdministrativoCatalogEntry) {
    setSigla(o.sigla);
    setNome(o.nome);
    setSistema(o.sistemas);
    setLink(o.portalUrl);
    setEsfera(o.esferaPadrao);
    setMateria(o.materiaPadrao);
    onSelect?.(o);
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="tribunalSigla" value={sigla} />
      <input type="hidden" name="tribunalNome" value={nome} />
      <input type="hidden" name="tribunalSistema" value={sistema} />
      <input type="hidden" name="tribunalLink" value={link} />
      <input type="hidden" name="adminEsfera" value={esfera} />
      <input type="hidden" name="adminMateria" value={materia} />

      <div>
        <label className="text-xs font-medium text-tx-2">Órgão administrativo</label>
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex-1 rounded-lg border border-regua bg-sf px-3 py-2 text-left text-sm text-tx hover:border-acao/40"
          >
            {sigla ? (
              <span>
                <span className="font-bold">{sigla}</span> <span className="text-tx-2">{nome}</span>
              </span>
            ) : (
              <span className="text-tx-3">Selecionar órgão da lista...</span>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-tx-2">Esfera</label>
          <select
            value={esfera}
            onChange={(e) => setEsfera(e.target.value)}
            className="mt-1 w-full rounded-lg border border-regua bg-sf px-3 py-2 text-sm text-tx"
          >
            <option value="">Selecione...</option>
            {ESFERAS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Matéria</label>
          <select
            value={materia}
            onChange={(e) => setMateria(e.target.value)}
            className="mt-1 w-full rounded-lg border border-regua bg-sf px-3 py-2 text-sm text-tx"
          >
            <option value="">Selecione...</option>
            {MATERIAS_ADMIN.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div
            className="bg-sf rounded-xl shadow-pop w-full max-w-lg max-h-[85vh] flex flex-col animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-serif font-bold text-tx">Selecionar órgão administrativo</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-tx-3 hover:text-tx">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pt-4 pb-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-3 pointer-events-none" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por sigla ou nome..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-regua bg-sf text-sm text-tx placeholder:text-tx-3 focus:outline-none focus:ring-2 focus:ring-acao/40"
                />
              </div>
            </div>

            <div className="overflow-y-auto scrollbar-thin px-2 pb-2">
              {grupos.length === 0 && <p className="px-3 py-4 text-sm text-tx-2">Nenhum órgão encontrado.</p>}
              {grupos.map((g) => (
                <div key={g.categoria} className="mb-1">
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-tx-3 uppercase tracking-wide">{g.categoria}</p>
                  {g.itens.map((o) => (
                    <button
                      key={o.sigla}
                      type="button"
                      onClick={() => handleSelect(o)}
                      className="flex flex-col items-start w-full rounded-lg px-3 py-2 text-left hover:bg-sf-apoio transition-colors"
                    >
                      <span className="text-sm">
                        <span className="font-bold text-tx">{o.sigla}</span>{" "}
                        <span className="text-tx-2">{o.nome}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
