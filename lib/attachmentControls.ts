import { useEffect, useState } from "react";

// Extraído de components/AttachmentList.tsx (a listagem de anexos mais madura do produto) para
// que a aba "Documentos" da Assessoria (components/assessoria/AssessoriaDocumentosTab.tsx) reuse
// exatamente a mesma ordenação e a mesma preferência de modo de visualização, em vez de divergir
// aos poucos. Só o que é puro (tipos, opções, comparação, hook de localStorage) mora aqui — o JSX
// de cada tela (grade de ícones, lista, tabela de detalhes, com as ações específicas de cada uma)
// continua em cada componente, porque as duas telas têm ações diferentes por linha (AttachmentList
// tem editar/excluir anexo; a aba Documentos da Assessoria, não).
export type SortOption = "recent" | "oldest" | "name_asc" | "name_desc" | "type";
export type ViewMode = "icons" | "list" | "details";

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recent", label: "Mais recente primeiro" },
  { value: "oldest", label: "Mais antigo primeiro" },
  { value: "name_asc", label: "Nome (A→Z)" },
  { value: "name_desc", label: "Nome (Z→A)" },
  { value: "type", label: "Tipo de documento" },
];

// Comparação de nome com `numeric: true`: ordenação ALFANUMÉRICA, não puramente alfabética —
// "Demanda 2" vem antes de "Demanda 10", e não depois, como aconteceria comparando caractere a
// caractere. Vale para todas as listas que usam este helper (anexos e demandas), porque em todas
// elas o nome costuma terminar em número.
const compararNome = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });

// Mesma lógica de comparação que o AttachmentList sempre teve (ver switch original), só que
// parametrizada por getters em vez de campos fixos (`createdAt`/`name`/`docType`) — assim serve
// tanto para anexos (campo `createdAt`, string ISO) quanto para documentos da Assessoria (campo
// `date`, que pode chegar como Date ou string). O critério de desempate de "type" (nome, pt-BR)
// é o mesmo de antes.
export function sortByOption<T>(
  items: T[],
  sortBy: SortOption,
  keys: { dateKey: (item: T) => string; name: (item: T) => string; typeLabel: (item: T) => string }
): T[] {
  const arr = [...items];
  switch (sortBy) {
    case "recent":
      arr.sort((a, b) => keys.dateKey(b).localeCompare(keys.dateKey(a)));
      break;
    case "oldest":
      arr.sort((a, b) => keys.dateKey(a).localeCompare(keys.dateKey(b)));
      break;
    case "name_asc":
      arr.sort((a, b) => compararNome(keys.name(a), keys.name(b)));
      break;
    case "name_desc":
      arr.sort((a, b) => compararNome(keys.name(b), keys.name(a)));
      break;
    case "type":
      arr.sort((a, b) => keys.typeLabel(a).localeCompare(keys.typeLabel(b), "pt-BR") || compararNome(keys.name(a), keys.name(b)));
      break;
  }
  return arr;
}

// Subconjunto para listas que não têm "tipo" — hoje as demandas da Assessoria
// (components/assessoria/AssessoriaProcessosCasosTab.tsx).
export const SORT_OPTIONS_SEM_TIPO = SORT_OPTIONS.filter((o) => o.value !== "type");

// Guarda o modo de visualização escolhido (ícones/lista/detalhes) no navegador, por tela —
// `storageKey` isola a preferência de cada lista (Anexos de Processo/Atendimento continuam usando
// a chave "rp-attachment-view" de sempre; a aba Documentos da Assessoria usa outra chave, para não
// herdar nem sobrescrever a preferência da tela de Anexos). Mesmo padrão de THEME_KEY em
// lib/theme.ts: só afeta a UI, nunca o banco.
export function useViewModePreference(storageKey: string, defaultMode: ViewMode = "icons"): [ViewMode, (mode: ViewMode) => void] {
  const [viewMode, setViewModeState] = useState<ViewMode>(defaultMode);

  // Lê a preferência salva só depois de montado (servidor e cliente batem no valor padrão no
  // primeiro render, evitando divergência de hidratação por causa do localStorage não existir no
  // servidor).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "icons" || stored === "list" || stored === "details") setViewModeState(stored);
    } catch {
      // localStorage indisponível (modo privado etc.) — segue com o padrão.
    }
  }, [storageKey]);

  function setViewMode(mode: ViewMode) {
    setViewModeState(mode);
    try {
      localStorage.setItem(storageKey, mode);
    } catch {
      // Sem persistência nesse navegador — a escolha ainda vale pra sessão atual.
    }
  }

  return [viewMode, setViewMode];
}
