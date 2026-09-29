"use client";

import { useCallback, useEffect, useState } from "react";
import { temaEfetivo } from "@/lib/theme";
import { CHAVE_DO_TEMA, estaEmNoite, lerPreferenciaDeTema, type PreferenciaDeTema } from "@/lib/temaDoAtendimentoApp";

// O lado de navegador do tema (Dia / Noite / Automático). A regra é de lib/temaDoAtendimentoApp.ts;
// aqui só se lê e grava a preferência (em try/catch: modo privado e dados bloqueados lançam), se põe
// a classe no #atendimento-shell e se acompanha o sistema quando a escolha é "Automático".

const EVENTO = "atd-tema-mudou";

function lerSalva(): PreferenciaDeTema {
  try {
    return lerPreferenciaDeTema(localStorage.getItem(CHAVE_DO_TEMA));
  } catch {
    return "light";
  }
}

function sistemaEscuro(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

function aplicar(pref: PreferenciaDeTema): boolean {
  const noite = estaEmNoite(pref, sistemaEscuro());
  document.getElementById("atendimento-shell")?.classList.toggle("atendimento-dark", noite);
  // O tema escuro do SITE (`dark` no <html>) não pode vazar para dentro do app: ver SCRIPT_INICIAL_DO_TEMA.
  document.documentElement.classList.remove("dark");
  return noite;
}

/** Ao sair do app (navegação para o site), devolve ao <html> o tema do site que o app tirou. */
export function devolverTemaDoSite() {
  try {
    document.documentElement.classList.toggle("dark", temaEfetivo() === "dark");
  } catch {
    /* sem armazenamento: o site decide sozinho no próximo carregamento */
  }
}

export function salvarTema(pref: PreferenciaDeTema) {
  try {
    localStorage.setItem(CHAVE_DO_TEMA, pref);
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  aplicar(pref);
  window.dispatchEvent(new Event(EVENTO));
}

/** A preferência atual, se está em Noite agora, e o setter. Mantém as telas em sincronia. */
export function useTema(): { pref: PreferenciaDeTema; noite: boolean; definir: (p: PreferenciaDeTema) => void } {
  const [pref, setPref] = useState<PreferenciaDeTema>("light");
  const [noite, setNoite] = useState(false);

  const sincronizar = useCallback(() => {
    const p = lerSalva();
    setPref(p);
    setNoite(aplicar(p));
  }, []);

  useEffect(() => {
    sincronizar();
    window.addEventListener(EVENTO, sincronizar);
    window.addEventListener("storage", sincronizar);
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", sincronizar);
    } catch {
      /* navegador sem matchMedia: o Automático fica em Dia */
    }
    return () => {
      window.removeEventListener(EVENTO, sincronizar);
      window.removeEventListener("storage", sincronizar);
      mq?.removeEventListener("change", sincronizar);
    };
  }, [sincronizar]);

  return { pref, noite, definir: salvarTema };
}
