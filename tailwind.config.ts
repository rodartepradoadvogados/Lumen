import type { Config } from "tailwindcss";

// Paleta do redesenho Modernist (agosto/2026), ajustada numa segunda rodada no mesmo mês:
// bordô #8a2f42 como única cor de ação e marca (era vermelho-alaranjado #ec3013), sem ouro
// nem azul-tinta. A especificação completa — qual cor vai em qual detalhe, nos dois temas —
// está em design_handoff_lumen_redesign/01-tokens-e-tema.md e em docs/DESIGN-SYSTEM.md, que
// manda numa dúvida.
//
// Duas famílias convivem aqui de propósito, durante a migração:
//
//   NOVA     grafite / neutro / vinho  +  os apelidos semânticos (acao, marca, urgente, aviso,
//            concluido, sf, tx, regua), que apontam para as variáveis CSS de app/globals.css e
//            por isso trocam sozinhos entre Manhã e Noite.
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
        // Rail escuro — a única superfície que não retematiza entre Manhã e Noite (ver
        // app/globals.css). 800/900 preservados por compatibilidade com o legado abaixo.
        grafite: {
          300: "#5b646e",
          500: "#39414a",
          700: "#22272e",
          800: "#16191d",
          900: "#0f1216",
        },
        // Rampa neutra do Modernist (documento 01) — substitui grafite para SUPERFÍCIES claras.
        // Espelha 1:1 os tokens semânticos de Manhã: 200≈sf-apoio, 300=regua, 400=regua-forte,
        // 500=tx-3, 700=tx-2. Prefira sempre os apelidos semânticos (`bg-sf-apoio`, `text-tx-2`
        // etc.); esta escala existe para gráficos e casos que precisam do valor cravado.
        neutro: {
          100: "#f8f4f4",
          200: "#eae7e7",
          300: "#d7d3d3",
          400: "#bab6b6",
          500: "#9b9797",
          600: "#7d7979",
          700: "#605d5d",
          800: "#444141",
          900: "#2d2b2b",
        },
        // Bordô Modernist — única cor de ação/marca do produto, e sua variante escura de ação
        // destrutiva (700/800/900 são semântica de PERIGO, não de marca — não mudam quando a
        // marca muda). Não retematiza entre Manhã e Noite; prefira `bg-acao`/`text-marca`/
        // `text-vinho`, que já resolvem para estes mesmos valores.
        vinho: {
          300: "#9c3a4d", // --acao-hover
          500: "#8a2f42", // --acao / --marca
          700: "#ae1800", // --vinho / --marca-tx (Manhã, antes do ajuste — perigo, inalterado)
          800: "#ae1800",
          900: "#8a1300",
        },

        /* ---------- Apelidos semânticos (trocam de tema sozinhos) ---------- */
        sf: {
          fundo: "var(--sf-fundo)",
          DEFAULT: "var(--sf-superficie)",
          apoio: "var(--sf-apoio)",
        },
        regua: { DEFAULT: "var(--regua)", forte: "var(--regua-forte)" },
        tx: { DEFAULT: "var(--tx)", 2: "var(--tx-2)", 3: "var(--tx-3)" },
        acao: { DEFAULT: "var(--acao)", hover: "var(--acao-hover)", tx: "var(--acao-tx)", bg: "var(--acao-bg)", light: "var(--acao-light)" },
        marca: { DEFAULT: "var(--marca)", tx: "var(--marca-tx)", bg: "var(--marca-bg)" },
        atencao: "var(--vinho)",
        // Texto sobre as superfícies que são grafite nos dois temas (rail, barra de menus da
        // Bancada, faixa de guias) — --tx-2 não serve ali, sumiria no tema Manhã.
        rail: {
          tx: "var(--rail-tx)",
          // Item ativo do rail (pílula) — variante clara do bordô, fixa nos dois temas pelo
          // mesmo motivo de rail.tx acima (ver comentário em app/globals.css).
          marca: { DEFAULT: "var(--rail-marca)", bg: "var(--rail-marca-bg)" },
        },
        menu: { tx: "var(--menu-tx)" },
        // Azul distinto do azul-tinta de ação, para o filete de fonte PJE não se confundir
        // com o do DJE (DESIGN-SYSTEM.md §9).
        fonte: { pje: "var(--fonte-pje)" },
        urgente: { DEFAULT: "var(--urgente)", bg: "var(--urgente-bg)" },
        aviso: { DEFAULT: "var(--aviso)", bg: "var(--aviso-bg)" },
        concluido: { DEFAULT: "var(--concluido)", bg: "var(--concluido-bg)" },
        // Dourado de acento (Início, setembro/2026) — NÃO é o `gold` legado logo abaixo (esse
        // continua reapontado pro bordô, sem relação). `ouro-acento` é a cor nova de verdade,
        // usada só como filete de destaque pontual (hoje: cartão de Assessoria Jurídica).
        "ouro-acento": "var(--ouro-acento)",

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
        // O ouro não existe mais no modelo B (Modernist puro) — gold colapsa no vermelho de
        // marca/ação. Os usos que eram "marca" (badge, filete de seção ativa) vão para
        // `bg-acao`/`text-marca` na migração por área; até lá aparecem em vermelho, não mais
        // em ouro.
        gold: {
          900: "#8a1300",
          800: "#ae1800",
          700: "#ae1800",
          600: "#8a2f42",
          500: "#8a2f42",
          400: "#9c3a4d",
          300: "#9c3a4d",
          100: "rgba(138, 47, 66, 0.15)",
        },
        // cream/paper viram os neutros frios do Modernist — o creme e a palha saíram inteiros
        // da paleta.
        cream: {
          50: "#eae9e9",
          100: "#d7d3d3",
          200: "#d7d3d3",
          300: "#bab6b6",
        },
        // bordo passa a ser o vinho da marca. Os botões que estavam em bordo-700 vão para
        // `bg-acao` na migração por área; até lá aparecem em vermelho.
        bordo: {
          900: "#8a1300",
          700: "#ae1800",
          600: "#ae1800",
          500: "#8a2f42",
          400: "#9c3a4d",
          100: "rgba(138, 47, 66, 0.1)",
        },
        // magenta era o terceiro acento (só o hub de Contatos). Colapsa no vinho: o sistema
        // Modernist não tem uma terceira cor de acento, e manter uma inventada é o que gera
        // deriva.
        magenta: {
          700: "#ae1800",
          600: "#ae1800",
          500: "#8a2f42",
          400: "#9c3a4d",
          100: "rgba(138, 47, 66, 0.1)",
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
        // Escala em 3 paradas (ajuste de tema, agosto/2026 — substitui o "raio zero" original
        // do documento 01). Sobrescreve a escala inteira do Tailwind de uma vez, então todo
        // `rounded-*` já espalhado pelo código (inclusive o que ainda não foi revisado
        // componente a componente) já renderiza no valor certo:
        //   sm (4px)        → chips, badges, tags de status
        //   DEFAULT/md (6px) → botões, inputs, itens de rail, ícones de ação
        //   lg/xl/2xl/3xl (10px) → cartões, linhas de lista, modais, painéis suspensos,
        //                          contêiner da própria tela (documento de tema: "md" único
        //                          para todas essas superfícies, sem um nível "lg" à parte)
        // `rounded-full` não é redeclarado aqui — continua no valor padrão do Tailwind
        // (9999px), para avatar e badge de contagem.
        none: "0",
        sm: "4px",
        DEFAULT: "6px",
        md: "6px",
        lg: "10px",
        xl: "10px",
        "2xl": "10px",
        "3xl": "10px",
      },
    },
  },
  plugins: [],
};
export default config;
