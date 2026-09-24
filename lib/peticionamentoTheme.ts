// MECANISMO DE TEMA DO PETICIONAMENTO — terceiro mecanismo de tema do produto, ao lado do site
// (lib/theme.ts, classe `dark` em <html>) e do portal (lib/portalTheme.ts, classe `portal-light`
// em #portal-shell). Aqui é um ATRIBUTO `data-theme` no próprio nó raiz da aba
// (id="peticionamento-shell", div.peticionamento em app/peticionamento/layout.tsx) — o mecanismo
// já estava TODO CODIFICADO em app/peticionamento/peticionamento.css desde o primeiro commit da
// aba (regra `.peticionamento[data-theme="light"]`, portada do mockup estático), só nunca teve um
// botão que o acionasse (ver components/peticionamento/AlternadorDeTema.tsx e o commit que resolve
// o pedido do dono de 24/09/2026, item 3 — "o botão de modo claro e escuro sumiu do
// peticionamento").
//
// Chave e evento PRÓPRIOS, nunca lib/portalTheme.ts: esta aba já tem paleta própria e
// independente ("Ardósia fria", decisão do dono de 21/09/2026) — o tema dela não tem por que
// seguir o do resto do Lúmen, e reaproveitar a chave do portal faria a Manhã/Noite de uma aba
// vazar para a outra sem ninguém pedir isso.
export type PeticionamentoThemeMode = "light" | "dark";

export const PETICIONAMENTO_THEME_KEY = "rp-peticionamento-theme";

export const PETICIONAMENTO_THEME_CHANGE_EVENT = "rp-peticionamento-theme-change";

// Padrão "dark" (a folha já nasce SEM o atributo `data-theme`, que é o estado escuro) — mesma
// razão do portal (lib/portalTheme.ts): é uma tela de trabalho, não uma página pública.
export const PETICIONAMENTO_THEME_ORDER: PeticionamentoThemeMode[] = ["dark", "light"];

export const PETICIONAMENTO_THEME_LABEL: Record<PeticionamentoThemeMode, string> = {
  light: "Manhã",
  dark: "Noite",
};

export function isPeticionamentoThemeMode(value: string | null): value is PeticionamentoThemeMode {
  return value === "light" || value === "dark";
}

// Script anti-flash, injetado dentro de #peticionamento-shell (app/peticionamento/layout.tsx),
// executado antes da hidratação — mesmo padrão de PORTAL_THEME_INIT_SCRIPT (lib/portalTheme.ts).
// O SSR nunca marca `data-theme`, então o primeiro paint já nasce escuro para a maioria; o script
// só entra para quem já escolheu Manhã explicitamente numa visita anterior.
export const PETICIONAMENTO_THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(PETICIONAMENTO_THEME_KEY)});
    var el = document.getElementById("peticionamento-shell");
    if (el && stored === "light") el.setAttribute("data-theme", "light");
  } catch (e) {}
})();
`;
