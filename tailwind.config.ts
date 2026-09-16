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
        // Portal Noturno (DESIGN.md) — token usado em número/rótulo/aba de app/(app)/*
        // (NavRail, PendingListModal, PublicationsTriage, processos/[id]/page.tsx etc.).
        // Chegou a apontar para Barlow Condensed (P1-P5); revertido para Inter (2026-09-11,
        // decisão do dono do projeto) redefinindo só `--font-display` em `.portal-shell`
        // (app/globals.css) — a classe `font-display` continua nos componentes, sem precisar
        // remover.
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      // ---------------------------------------------------------------------------
      // RAMPA TIPOGRAFICA — seis paradas, piso absoluto de 12px (redesign "Guias", F3).
      //
      // O diagnostico de 2026-09-16 mediu 16 tamanhos distintos em 1.003 ocorrencias, sendo os
      // tres mais usados 11px (440), 13px (402) e 10px (133) — nenhum deles na rampa que o
      // DESIGN.md documentava (24/16/14/12). Nao havia NADA entre 15px e 24px no portal, que e
      // a causa material de "nao ha hierarquia": sem degrau intermediario, titulo de secao e
      // corpo de texto sao a mesma coisa.
      //
      // Seis paradas, em rem, sem clamp (o modo Operate nao escala com viewport):
      //   etiqueta  12px  rotulo de guia, cabecalho de tabela, unidade. NADA MENOR EXISTE.
      //   corpo     15px  texto de leitura, campo, item de lista
      //   destaque  18px  nome na fila, valor secundario, primeira linha de cartao
      //   guia      22px  O DEGRAU QUE FALTAVA: titulo de secao, aba ativa, KPI secundario
      //   autuacao  28px  titulo de tela, KPI principal
      //   tarja     40px  so o numero que mede risco. Um por tela, nunca dois.
      //
      // A escala padrao do Tailwind e reapontada para as mesmas paradas, entao os 1170 usos de
      // `text-xs` e 1023 de `text-sm` ja caem na rampa sem editar 200 arquivos — mesmo mecanismo
      // que `borderRadius` e `boxShadow.card` usam abaixo. `text-xs` nao muda de valor (ja era
      // 12px); `text-sm` sobe 1px.
      fontSize: {
        etiqueta: ["0.75rem", { lineHeight: "1.35" }],
        corpo: ["0.9375rem", { lineHeight: "1.55" }],
        destaque: ["1.125rem", { lineHeight: "1.35" }],
        guia: ["1.375rem", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
        autuacao: ["1.75rem", { lineHeight: "1.15", letterSpacing: "-0.015em" }],
        tarja: ["2.5rem", { lineHeight: "1", letterSpacing: "-0.02em" }],

        xs: ["0.75rem", { lineHeight: "1.35" }],
        sm: ["0.9375rem", { lineHeight: "1.55" }],
        base: ["0.9375rem", { lineHeight: "1.55" }],
        lg: ["1.125rem", { lineHeight: "1.35" }],
        xl: ["1.375rem", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
        "2xl": ["1.375rem", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
        "3xl": ["1.75rem", { lineHeight: "1.15", letterSpacing: "-0.015em" }],
        "4xl": ["2.5rem", { lineHeight: "1", letterSpacing: "-0.02em" }],
        "5xl": ["2.5rem", { lineHeight: "1", letterSpacing: "-0.02em" }],
        "6xl": ["2.5rem", { lineHeight: "1", letterSpacing: "-0.02em" }],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        // ---------------------------------------------------------------------------
        // FAIXA DE SECAO — a cor diz ONDE voce esta (redesign "Guias", F3).
        // Cinco faixas, uma por secao do trabalho. Apontam para variaveis de app/globals.css e
        // por isso trocam sozinhas entre os temas. Regra do sistema: cor e risco ou e lugar,
        // NUNCA categoria de conteudo. Nenhum dos 12 tipos de alerta ganha cor propria.
        //
        // NENHUMA delas e vermelha, por decisao do dono (2026-09-16): o tijolo saiu e o anil
        // entrou no lugar. O vermelho existe SO no vocabulario de risco, logo abaixo, e o
        // bordo existe SO como acao. Assim as tres cores quentes do produto param de brigar —
        // era um dos achados do diagnostico ("tres vermelhos brigando em 200px").
        faixa: {
          ardosia: "var(--faixa-ardosia)",
          oliva: "var(--faixa-oliva)",
          ocre: "var(--faixa-ocre)",
          anil: "var(--faixa-anil)",
          ameixa: "var(--faixa-ameixa)",
        },
        // VOCABULARIO DE RISCO — a cor diz O QUE ESTA ACONTECENDO. Deliberadamente separado das
        // faixas: um prazo vencido e vermelho em qualquer secao.
        risco: {
          vencido: "var(--risco-vencido)",
          hoje: "var(--risco-hoje)",
          "em-dia": "var(--risco-em-dia)",
        },
        // Papel de texto sobre uma faixa PREENCHIDA (guia ativa, botao primario, tarja). Troca
        // com o tema — claro sobre a faixa escura do tema manila, escuro sobre a faixa clara do
        // tema gaveta. E o token que impede o defeito de `text-white` cravado, que hoje deixa
        // quatro rotas do Painel Mestre com 1,35:1 no tema claro.
        rotulo: "var(--rotulo)",
        // As superficies do mundo. `gaveta` e o RAIL, que deixou de ser grafite fixo nos dois
        // temas — era a "barra preta a esquerda" que aparecia no tema claro.
        papel: "var(--papel)",
        ficha: "var(--ficha)",
        "ficha-alt": "var(--ficha-alt)",
        gaveta: {
          DEFAULT: "var(--gaveta)",
          fundo: "var(--gaveta-fundo)",
          tinta: "var(--gaveta-tinta)",
          "tinta-2": "var(--gaveta-tinta-2)",
          linha: "var(--gaveta-linha)",
        },

        /* ---------- Paleta nova ---------- */
        // Rail escuro — a única superfície que não retematiza entre Manhã e Noite (ver
        // app/globals.css). 800/900 preservados por compatibilidade com o legado abaixo.
        // Blocos SEMPRE escuros do site publico: o poster da landing, o masthead de
        // /privacidade, o fundo de /cadastro, a dica de ferramenta. Continuam literais de
        // proposito — se retematizassem, o `text-white` que vive neles sumiria no tema claro.
        // Foram apenas retonalizados para o frio do Ardosia: o #16191d anterior era um preto
        // AZULADO que, contra o fundo quente, produzia as "duas temperaturas brigando".
        //
        // O RAIL nao usa mais esta escala: ele tem tokens proprios (`gaveta`) que retematizam.
        grafite: {
          300: "#6b7280",
          500: "#3f464f",
          700: "#272c33",
          800: "#181b1f",
          900: "#0f1113",
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
        // Raio quase reto, uma parada so (redesign "Guias", F3). Cartolina cortada tem canto
        // vivo; a guia ativa ganha um chanfro de 6px no canto superior externo, que e a
        // assinatura formal do sistema (feito com clip-path, nao com border-radius).
        //
        // Isto RESOLVE POR DECISAO os 22 defeitos agudos que o detector acusou: ele reprova
        // filete lateral e filete de topo combinados com canto arredondado, enquanto o DESIGN.md
        // mandava usar filete. A direcao escolheu o filete e abandonou o arredondamento.
        //
        // Sobrescrever a escala inteira faz todo `rounded-*` ja espalhado pelo codigo renderizar
        // no valor certo, e torna desnecessarios os dois blocos de seletor descendente que
        // app/globals.css mantinha para .portal-shell e .mobile-dark.
        none: "0",
        sm: "2px",
        DEFAULT: "2px",
        md: "2px",
        lg: "2px",
        xl: "2px",
        "2xl": "2px",
        "3xl": "2px",
      }
    },
  },
  plugins: [],
};
export default config;
