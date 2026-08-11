import type { Config } from "tailwindcss";

// Paleta do manual da marca Lúmen v2 (agosto/2026). A especificação completa — qual cor vai em
// qual detalhe, nos dois temas — está em docs/DESIGN-SYSTEM.md, e é ela que manda numa dúvida.
//
// Duas famílias convivem aqui de propósito, durante a migração:
//
//   NOVA     grafite / ouro / vinho / tinta / neutro  +  os apelidos semânticos (acao, marca,
//            urgente, aviso, concluido, sf, tx, regua), que apontam para as variáveis CSS de
//            app/globals.css e por isso trocam sozinhos entre Manhã e Noite.
//   LEGADO   navy / gold / bordo / cream / magenta — ainda usadas por centenas de arquivos.
//            Foram REAPONTADAS para os valores novos, então a tela inteira já aparece na paleta
//            certa sem um commit gigante. São removidas área por área (DESIGN-SYSTEM.md §16).
//
// Código novo usa só a família nova. Um `#` dentro de components/ ou app/ é bug de revisão.
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
        // Archivo em todo o produto. `serif` continua declarada e apontando para a MESMA fonte
        // porque 107 arquivos ainda usam `font-serif`: eles renderizam certo enquanto a classe
        // não é removida. Some daqui quando a última referência sair.
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        /* ---------- Paleta nova ---------- */
        grafite: {
          300: "#5b646e",
          500: "#39414a",
          700: "#22272e",
          800: "#16191d", // marca: fundo do símbolo e da barra de navegação
          900: "#0f1216", // fundo do tema Noite
        },
        ouro: {
          300: "#e0b954",
          500: "#d9a93a", // Noite
          700: "#c9962f", // Manhã — marca e seção ativa
          800: "#a87a1c", // ÚNICO tom de ouro que pode virar texto sobre fundo claro
          900: "#7d5a11",
        },
        vinho: {
          300: "#cd5f77",
          500: "#a3234a",
          700: "#7d1330",
          800: "#5e0e24",
          900: "#3e0918",
        },
        // Azul-tinta: cor de ação do produto. O tom fixo fica aqui para gráficos e casos que
        // precisam do valor cravado; na interface prefira `bg-acao`/`text-acao`, que troca de
        // tema sozinho.
        tinta: {
          400: "#7ea6dd", // Noite
          700: "#17325c", // Manhã
          600: "#21447a", // hover Manhã
        },

        /* ---------- Apelidos semânticos (trocam de tema sozinhos) ---------- */
        sf: {
          fundo: "var(--sf-fundo)",
          DEFAULT: "var(--sf-superficie)",
          apoio: "var(--sf-apoio)",
        },
        regua: { DEFAULT: "var(--regua)", forte: "var(--regua-forte)" },
        tx: { DEFAULT: "var(--tx)", 2: "var(--tx-2)", 3: "var(--tx-3)" },
        acao: { DEFAULT: "var(--acao)", hover: "var(--acao-hover)", tx: "var(--acao-tx)", bg: "var(--acao-bg)" },
        marca: { DEFAULT: "var(--marca)", tx: "var(--marca-tx)", bg: "var(--marca-bg)" },
        atencao: "var(--vinho)",
        urgente: { DEFAULT: "var(--urgente)", bg: "var(--urgente-bg)" },
        aviso: { DEFAULT: "var(--aviso)", bg: "var(--aviso-bg)" },
        concluido: { DEFAULT: "var(--concluido)", bg: "var(--concluido-bg)" },

        /* ---------- Legado reapontado ---------- */
        // navy era o azul-marinho da marca antiga; agora é grafite, com os mesmos degraus.
        navy: {
          950: "#0f1216",
          900: "#16191d",
          800: "#22272e",
          700: "#39414a",
          600: "#5b646e",
          500: "#8b939c",
        },
        // gold perde o papel de CTA (que passou ao azul-tinta) e fica só como marca/acento.
        // 500 e 600 apontam para o ouro novo; 700+ escurecem para poder virar texto.
        gold: {
          900: "#7d5a11",
          800: "#a87a1c",
          700: "#a87a1c",
          600: "#c9962f",
          500: "#c9962f",
          400: "#d9a93a",
          300: "#e0b954",
          100: "rgba(201, 150, 47, 0.15)",
        },
        // cream/paper viram os neutros frios — o creme e a palha saíram inteiros da paleta.
        cream: {
          50: "#f3f4f6",
          100: "#e5e7ea",
          200: "#e5e7ea",
          300: "#c9cdd3",
        },
        // bordo passa a ser o vinho da marca. Os botões que estavam em bordo-700 vão para
        // `bg-acao` na migração por área; até lá aparecem em vinho, não mais em ouro.
        bordo: {
          900: "#3e0918",
          700: "#7d1330",
          600: "#a3234a",
          500: "#a3234a",
          400: "#cd5f77",
          100: "rgba(125, 19, 48, 0.1)",
        },
        // magenta era o terceiro acento (só o hub de Contatos). Colapsa no vinho: o manual v2
        // não tem uma terceira cor de acento, e manter uma inventada é o que gera deriva.
        magenta: {
          700: "#7d1330",
          600: "#a3234a",
          500: "#a3234a",
          400: "#cd5f77",
          100: "rgba(125, 19, 48, 0.1)",
        },
      },
      boxShadow: {
        // Sombra só em coisa que flutua de verdade (DESIGN-SYSTEM.md §13). `card` vira nenhuma
        // sombra de propósito: cartão parado se separa por régua de 1px. Assim os ~200 usos de
        // `shadow-card` param de sombrear sem precisar editar 200 arquivos.
        card: "none",
        pop: "var(--sombra-menu)",
        menu: "var(--sombra-menu)",
        modal: "var(--sombra-modal)",
        arrasto: "var(--sombra-arrasto)",
      },
      borderRadius: {
        // Raio de cartão cai de 16px para 6px — é a mudança que mais aumenta densidade sem
        // mexer em layout. `rounded-xl` já é a classe usada pelos cards, então sobrescrever
        // aqui atualiza todos de uma vez.
        xl: "0.375rem",
        xl2: "0.375rem",
        lg: "0.3125rem", // botão e campo: 5px
      },
    },
  },
  plugins: [],
};
export default config;
