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
        navy: {
          950: "#070f22",
          900: "#0b1730",
          800: "#0f1f3d",
          700: "#152a52",
          600: "#1d3868",
          500: "#28477d",
        },
        gold: {
          900: "#5c481c",
          800: "#7a5f22",
          700: "#96772a",
          600: "#b8904f",
          500: "#c6a05c",
          400: "#d4b374",
          300: "#e3cd9c",
          100: "#f2e8d5",
        },
        cream: {
          50: "#fbfaf7",
          100: "#f6f3ec",
          200: "#efe9dc",
          300: "#e5dcc8",
        },
        // Paleta bordô — segundo acento (reservado p/ o que tem peso jurídico/urgência:
        // badge de notificação, indicadores de Prazo/Audiência, bordas de itens urgentes).
        // bordo-400 é uma variante clara adicional (fora dos 5 tons de referência) usada
        // apenas em modo escuro para manter contraste, no mesmo papel que gold-400 cumpre
        // para a paleta dourada.
        bordo: {
          900: "#3d1119",
          700: "#6f1d2e",
          600: "#832438",
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
        xl2: "1rem",
      },
    },
  },
  plugins: [],
};
export default config;
