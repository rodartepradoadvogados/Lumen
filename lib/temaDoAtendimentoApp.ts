// ============================================================================
// O TEMA DO APLICATIVO DE ATENDIMENTO: Dia, Noite e Automático (que segue o sistema, de verdade).
//
// A preferência fica no aparelho (`localStorage`, em try/catch: modo privado e dados bloqueados
// lançam). Valores gravados: "light" (Dia), "dark" (Noite), "auto" (Automático) — os MESMOS de antes,
// para quem já escolheu não perder a escolha. Sem nada gravado o padrão é Dia (o comportamento de
// antes); o Automático agora acompanha a mudança do sistema com um ouvinte, e não só lê no início.
// ============================================================================

export const CHAVE_DO_TEMA = "rp-atendimento-theme";

export type PreferenciaDeTema = "light" | "dark" | "auto";

export const ROTULO_DO_TEMA: Record<PreferenciaDeTema, string> = { light: "Dia", dark: "Noite", auto: "Automático" };

/** Qualquer valor estranho gravado vira o padrão (Dia). */
export function lerPreferenciaDeTema(bruto: string | null | undefined): PreferenciaDeTema {
  return bruto === "dark" || bruto === "auto" || bruto === "light" ? bruto : "light";
}

/** A tela está em Noite? `sistemaEscuro` é `matchMedia("(prefers-color-scheme: dark)").matches`. */
export function estaEmNoite(preferencia: PreferenciaDeTema, sistemaEscuro: boolean): boolean {
  return preferencia === "dark" || (preferencia === "auto" && sistemaEscuro);
}

/**
 * O script que roda ANTES da primeira pintura (fica dentro do #atendimento-shell, logo depois da
 * abertura da caixa) e põe a classe de Noite sem piscar o Dia. Mesma regra das funções acima —
 * o teste executa este texto e compara.
 *
 * ELE TAMBÉM TIRA A CLASSE `dark` DO <html>. O layout raiz (lib/theme.ts, THEME_INIT_SCRIPT) põe `dark` no
 * <html> quando o SISTEMA está escuro ou o site foi usado em Noite (mesma origem, mesmo localStorage).
 * O Dia do Atendimento não define paleta própria — herda a do :root —, então com `html.dark` ligado o
 * "Dia" saía escuro e o botão parecia morto (só Dia -> Noite mudava algo, e nada). A paleta escura do app
 * é toda da classe `atendimento-dark`; o `dark` do site não tem o que fazer aqui dentro.
 */
export const SCRIPT_INICIAL_DO_TEMA = `(function(){try{var p=null;try{p=localStorage.getItem("${CHAVE_DO_TEMA}")}catch(e){}var s=false;try{s=window.matchMedia("(prefers-color-scheme: dark)").matches}catch(e){}var n=p==="dark"||(p==="auto"&&s);var el=document.getElementById("atendimento-shell");if(el){el.classList.toggle("atendimento-dark",n);document.documentElement.classList.remove("dark")}}catch(e){}})();`;
