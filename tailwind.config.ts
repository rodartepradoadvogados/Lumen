import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Escalas navy/gold/bordo/cream ancoradas nos tokens da marca Lúmen — os valores
        // marcados "brand" abaixo são EXATAMENTE os hex do manual de identidade visual
        // (mesmos valores de --lumen-* em app/globals.css); os demais tons da escala são
        // interpolações para dar gradação a componentes que precisam de mais de 2 tons
        // (hover, texto sutil, bordas) sem inventar uma cor fora da família da marca.
        navy: {
          950: "#070c1c",
          900: "#0a1128", // brand: --navy (base)
          800: "#111a35", // brand: --navy-2 (superfícies elevadas)
          700: "#1a2647", // brand: --navy-3 (bordas/hover em fundo escuro)
          600: "#243a63",
          500: "#304e82",
        },
        gold: {
          900: "#453105",
          800: "#5e4306",
          700: "#7a5708",
          600: "#9c6f0a",
          500: "#b8860b", // brand: --gold (destaque principal, CTA primário)
          400: "#d9a93a", // brand: --gold-lt (hover, ícones)
          300: "#e7c15a", // brand: --gold-pale
          100: "#f5e9cf",
        },
        cream: {
          50: "#f4efe4", // brand: --paper (superfícies claras, leitura longa)
          100: "#ece3d2", // brand: --paper-2 (divisórias em fundo claro)
          200: "#e8ddc9",
          300: "#e5dcc8",
        },
        // Paleta bordô — cor SECUNDÁRIA da marca (não só urgência): botões secundários,
        // estado ativo/aba ativa, links, badges de categoria do blog, divisórias de seção.
        // bordo-400 é uma variante clara adicional (fora dos 2 tons de referência da marca)
        // usada em modo escuro para manter contraste, no mesmo papel que gold-400 cumpre
        // para a paleta dourada.
        bordo: {
          900: "#3d1119",
          700: "#6e0d25", // brand: --bordo (base)
          600: "#8f1c38", // brand: --bordo-lt (hover/links, texto bordô sobre claro)
          500: "#9a2c43",
          400: "#c96a80",
          100: "#f4dde1",
        },
        // Paleta magenta — terceiro acento, opcional e de uso pontual (hoje só no
        // hub de Contatos, módulo Equipe), pra dar variedade sem competir com o
        // dourado/bordô que já carregam significado (destaque financeiro / urgência
        // jurídica). magenta-400 segue o mesmo papel que gold-400/bordo-400: variante
        // mais clara usada em modo escuro pra manter contraste.
        magenta: {
          700: "#9d2467",
          600: "#b52e79",
          500: "#c73f8a",
          400: "#d17fae",
          100: "#f9dced",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 31, 61, 0.06), 0 1px 8px rgba(15, 31, 61, 0.06)",
        pop: "0 8px 30px rgba(15, 31, 61, 0.16)",
      },
      borderRadius: {
        // Raio padrão de card da marca Lúmen = 16px. `xl` já é a classe usada pelos cards
        // do produto (`rounded-xl`), então sobrescrever aqui atualiza todos eles de uma vez
        // — sem precisar trocar a classe em cada componente. Botões usam `rounded-lg`
        // (8px), que já bate com o padrão da marca sem precisar de mudança nenhuma.
        xl: "1rem",
        xl2: "1rem",
      },
    },
  },
  plugins: [],
};
export default config;
