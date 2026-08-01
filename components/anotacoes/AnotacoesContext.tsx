"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { todayIsoDate, type AnotacaoLinkType } from "@/lib/anotacoes";

export type { AnotacaoLinkType };

export type AnotacaoDraft = {
  id: string;
  linkType: AnotacaoLinkType | null;
  entityId: string | null;
  entityLabel: string | null; // rótulo já escolhido (permite restaurar a exibição sem esperar o fetch do picker)
  content: string; // HTML do editor
  referenceDate: string; // yyyy-mm-dd
};

const STORAGE_KEY = "lumen:anotacaoDraft";
const MAX_DRAFTS = 2;

// Largura da faixa fechada (só o ícone) e do painel aberto — este segundo valor precisa bater
// com w-64 (256px) de components/Sidebar.tsx, a mesma largura da sidebar esquerda (ver proposta
// aprovada). Exportados para o próprio painel (largura do CSS) e para o widget do Claude (deslocar
// o botão/janela para não ficar embaixo do painel quando ele estiver aberto).
export const ANOTACOES_STRIP_WIDTH = 34;
export const ANOTACOES_PANEL_WIDTH = 256;

function makeDraftId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyDraft(): AnotacaoDraft {
  return { id: makeDraftId(), linkType: null, entityId: null, entityLabel: null, content: "", referenceDate: todayIsoDate() };
}

type StoredState = { isOpen: boolean; drafts: AnotacaoDraft[] };

function loadStored(): StoredState {
  if (typeof window === "undefined") return { isOpen: false, drafts: [] };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { isOpen: false, drafts: [] };
    const parsed = JSON.parse(raw);
    const drafts = Array.isArray(parsed?.drafts) ? parsed.drafts.slice(0, MAX_DRAFTS) : [];
    return { isOpen: Boolean(parsed?.isOpen), drafts };
  } catch {
    return { isOpen: false, drafts: [] }; // dado corrompido no sessionStorage — segue sem rascunho salvo
  }
}

type AnotacoesContextValue = {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  drafts: AnotacaoDraft[];
  addDraft: () => void;
  updateDraft: (id: string, patch: Partial<AnotacaoDraft>) => void;
  // "Cancelar" de um rascunho: com 2 em andamento, remove só aquele (volta a 1); com 1 só,
  // limpa os campos dele (o painel nunca fica sem nenhum formulário enquanto está aberto).
  cancelDraft: (id: string) => void;
  // Rascunho salvo com sucesso: mesma regra do cancelamento acima, sem o comentário do usuário.
  clearDraftAfterSave: (id: string) => void;
  panelWidth: number;
};

const AnotacoesContext = createContext<AnotacoesContextValue | null>(null);

// Estado global do painel "Anotações" (faixa retrátil na borda direita) — provider único,
// montado em app/(app)/layout.tsx (mesmo ponto/padrão de components/UndoToastProvider.tsx),
// então sobrevive à navegação entre rotas (troca de página não desmonta o provider). Sobrevive
// também a F5 via sessionStorage (mesma técnica de components/AppShell.tsx, chave
// "lumen:openTabs") — só não sobrevive a fechar a aba/navegador, de propósito.
export function AnotacoesProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [drafts, setDrafts] = useState<AnotacaoDraft[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    const stored = loadStored();
    setIsOpen(stored.isOpen);
    setDrafts(stored.drafts);
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ isOpen, drafts }));
    } catch {
      // sessionStorage indisponível (modo privado etc.) — sem persistência entre recarregamentos.
    }
  }, [isOpen, drafts]);

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    // Ao abrir pela primeira vez (sem nenhum rascunho ainda), já mostra um formulário em branco
    // — o painel nunca abre vazio, só com a faixa "+" sem nada pra preencher.
    setDrafts((prev) => (open && prev.length === 0 ? [emptyDraft()] : prev));
  }, []);

  const addDraft = useCallback(() => {
    setDrafts((prev) => (prev.length >= MAX_DRAFTS ? prev : [...prev, emptyDraft()]));
  }, []);

  const updateDraft = useCallback((id: string, patch: Partial<AnotacaoDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const cancelDraft = useCallback((id: string) => {
    setDrafts((prev) => {
      if (prev.length > 1) return prev.filter((d) => d.id !== id);
      return prev.map((d) => (d.id === id ? { ...emptyDraft(), id } : d));
    });
  }, []);

  const clearDraftAfterSave = cancelDraft;

  const panelWidth = isOpen ? ANOTACOES_PANEL_WIDTH : ANOTACOES_STRIP_WIDTH;

  return (
    <AnotacoesContext.Provider value={{ isOpen, setOpen, drafts, addDraft, updateDraft, cancelDraft, clearDraftAfterSave, panelWidth }}>
      {children}
    </AnotacoesContext.Provider>
  );
}

export function useAnotacoes(): AnotacoesContextValue {
  const ctx = useContext(AnotacoesContext);
  if (!ctx) throw new Error("useAnotacoes precisa estar dentro de <AnotacoesProvider>");
  return ctx;
}

// Versão tolerante para componentes que existem tanto dentro quanto fora da árvore do provider
// (hoje só o ClaudeAssistantWidget, que não é montado no app mobile — lá não há
// AnotacoesProvider nenhum). Devolve null em vez de lançar, para não derrubar quem só quer o
// deslocamento visual quando o contexto existir.
export function useAnotacoesOptional(): AnotacoesContextValue | null {
  return useContext(AnotacoesContext);
}
