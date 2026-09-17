---
name: Lúmen
description: Sistema de gestão jurídica no mundo visual "Guias" (arquivo de cartório), paleta Ardósia — cinza-pedra frio, bordô como ação, vermelho só para risco
colors:
  papel: "#eaedf0"
  ficha: "#ffffff"
  ficha-alt: "#dfe3e8"
  gaveta: "#d8dde3"
  gaveta-fundo: "#cdd4dc"
  gaveta-tinta: "#2c2f32"
  gaveta-tinta-2: "#51555c"
  gaveta-linha: "#bec7d2"
  linha: "#cbd1da"
  linha-forte: "#a5b1bf"
  tinta: "#14161a"
  tinta-2: "#3d4045"
  tinta-3: "#585c63"
  faixa-ardosia: "#2f5d73"
  faixa-anil: "#3b4a86"
  faixa-oliva: "#4a6b33"
  faixa-ocre: "#835f13"
  faixa-ameixa: "#5f3468"
  risco-vencido: "#8a2f42"   # bordô — NÃO existe vermelho vivo no produto
  risco-hoje: "#8a5c00"
  risco-em-dia: "#1c6b52"
  rotulo: "#fdf7f8"
  acao: "#8a2f42"
  acao-hover: "#9c3f51"
  acao-tx: "#fdf7f8"
  marca-tx: "#8a2f42"
  grafite-800: "#181b1f"
  folha-a4: "#ffffff"
  acao-suave: "#fbeced"
  acao-suave-escuro: "#371c20"
  campo-risco: "#f5e5e6"
  campo-risco-linha: "#ddb1b5"
  campo-risco-escuro: "#401e24"
  campo-risco-linha-escuro: "#734249"
  grave: "#670224"
  grave-bg: "rgba(103, 2, 36, .14)"
  fonte-pje-bg: "rgba(47, 93, 115, .14)"
  linha-urgente: "#dfa6ac"
  linha-aviso: "#ceb38d"
  linha-concluido: "#9bc2b1"
  linha-fonte: "#a2bcc9"
  linha-grave: "#e1a5ac"
  grave-tx: "#fdf7f8"
  grave-escuro: "#b56f79"
  grave-tx-escuro: "#14161a"
  papel-impresso: "#dfe3e8"
  # tinta e filete da folha A4, que e fisicamente branca
  impresso-tinta-2: "#3d4045"
  papel-escuro: "#181b1f"
  ficha-escuro: "#212529"
  ficha-alt-escuro: "#131518"
  gaveta-escuro: "#0f1113"
  gaveta-fundo-escuro: "#0a0b0d"
  gaveta-tinta-escuro: "#b1b3b8"
  gaveta-tinta-2-escuro: "#8b8f96"
  gaveta-linha-escuro: "#23272e"
  linha-escuro: "#32383f"
  linha-forte-escuro: "#474f5a"
  tinta-escuro: "#e9ebef"
  tinta-2-escuro: "#b8bbbf"
  tinta-3-escuro: "#93969d"
  faixa-ardosia-escuro: "#4a93b5"
  faixa-anil-escuro: "#7988c4"
  faixa-oliva-escuro: "#699848"
  faixa-ocre-escuro: "#b4821a"
  faixa-ameixa-escuro: "#af76bb"
  risco-vencido-escuro: "#e3625a"
  risco-hoje-escuro: "#bd7e00"
  risco-em-dia-escuro: "#299d78"
  rotulo-escuro: "#14161a"
  marca-tx-escuro: "#cd6e82"
typography:
  tarja:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  autuacao:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  guia:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 680
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  destaque:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.35
  corpo:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  artigo:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.72
  etiqueta:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "0.08em"
rounded:
  none: "0"
  sm: "2px"
  md: "2px"
  lg: "2px"
  full: "9999px"
components:
  campo:
    backgroundColor: "{colors.ficha}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.7rem"
    typography: { fontWeight: 400, fontSize: "15px" }
  button-primary:
    backgroundColor: "{colors.acao}"
    textColor: "{colors.acao-tx}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "32px"
    typography: { fontWeight: 650, fontSize: "12px" }
  button-primary-hover:
    backgroundColor: "{colors.acao-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.tinta}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "32px"
    typography: { fontWeight: 650, fontSize: "12px" }
  card:
    backgroundColor: "{colors.ficha}"
    rounded: "{rounded.sm}"
    padding: "20px"
  badge:
    backgroundColor: "{colors.ficha-alt}"
    textColor: "{colors.tinta-2}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
    typography: { fontWeight: 650, fontSize: "12px" }

---
# Sistema de design do Lúmen — "Guias"

> Este documento **descreve o que foi construído**. Não é intenção nem proposta: cada número aqui
> sai de `tailwind.config.ts`, de `app/globals.css` ou de uma medição registrada em
> `.impeccable/plano-mestre/`. Reescrito em 2026-09-17, fase F9 do redesenho.
>
> A versão anterior documentava uma rampa tipográfica de 24/16/14/12 que **o código não usava em
> lugar nenhum** — o uso real era 11px em 440 ocorrências, 13px em 402, 10px em 133, num total de
> 16 tamanhos distintos. Documentação que descreve um sistema que não existe é pior que nenhuma:
> o detector mede contra um alvo morto e acusa o sistema vivo como deriva.

---

## 1. A tese

**O Lúmen é o armário de arquivo do escritório com as guias todas para cima.**

Cada seção do trabalho ocupa uma faixa horizontal própria e permanente, e o risco do escritório
inteiro é a primeira coisa que a tela diz.

O que o produto **recusa**, e recusa por escrito:

- a arrumação-padrão da categoria — barra lateral escura de ícones de linha, **quatro KPIs iguais
  lado a lado**, rosca de pizza, **azul corporativo**;
- o oposto previsível dela — painel neon com vidro e gradiente;
- a saudação: o produto **nunca** gasta o maior tipo da tela no nome de quem está logado.

Essas três recusas são operacionais, não retóricas. A grade de quatro KPIs iguais foi removida de
`/assessoria/[id]` e do hub do Financeiro por causa da primeira; não há um pixel de azul no
produto por causa dela também — e quando os e-mails transacionais apareceram em azul-marinho, foram
corrigidos (PR #217).

## 2. Cor

### 2.1 A regra que governa tudo

**Cor é risco ou é seção. Nunca é categoria.**

Um cartão não ganha cor por ser de um tipo; ganha por estar vencido. Uma aba não ganha cor por ser
uma aba; ganha a cor da seção a que pertence. Onde não há risco nem seção, **a ausência de cor é o
estado normal**.

### 2.2 Os quatro papéis

| Papel | Tokens | O que diz |
|---|---|---|
| **Superfície** | `papel` · `ficha` · `ficha-alt` · `gaveta*` | onde a coisa está |
| **Tinta** | `tinta` · `tinta-2` · `tinta-3` | três patamares de contraste, nunca mais |
| **Risco** | `risco-vencido` · `risco-hoje` · `risco-em-dia` | vocabulário próprio e separado |
| **Faixa de seção** | `ardosia` · `anil` · `oliva` · `ocre` · `ameixa` | **a cor diz ONDE** |

**Nenhum vermelho** fora do risco. O bordô `#8a2f42` é a ação; o vermelho-tijolo saiu do vocabulário
de faixas por decisão do dono em 2026-09-16.

### 2.3 O mapa de seções

A faixa de cada seção vive em `lib/navSections.ts`, campo `faixa` de `SectionDef`:

| Seção | Faixa |
|---|---|
| Agenda | ardósia |
| Comunicação | ocre |
| Jurídico | anil |
| Financeiro | oliva |
| Gestão | ameixa |

Use `CLASSES_FAIXA[...]`, nunca escreva `faixa-anil` à mão, e **nunca monte `faixa-${x}` em tempo de
execução**: o Tailwind gera CSS a partir do que consegue *ler* no código-fonte, e um nome montado em
runtime não gera regra nenhuma. Foi assim que 15 classes ficaram mortas por um dia, em 2026-09-17,
até a conferência do CSS de produção pegá-las.

### 2.4 Bordô como primeiro plano

`--acao`, `--acao-hover` e `--marca` valem `#8a2f42` nos **dois** temas. Como fundo de botão estão
certos, com `--acao-tx` por cima. Como **texto, ícone, borda de estado ou anel de foco** sobre uma
superfície que retematiza, medem **1,88:1** na ficha escura — reprovam WCAG AA por larga margem.

Use `--marca-tx`, que acompanha o tema: 8,18:1 no claro, 5,58:1 no escuro, e **exatamente o mesmo
hex do `--acao` no tema claro**. Uma regra de lint fecha a porta.

### 2.5 Opacidade

**Não escreva `/NN` sobre cor de token.** As cores desta casa são `var(--x)`, e o Tailwind só aplica
modificador de opacidade a cor que traga o marcador `<alpha-value>`. Sem ele a classe **não gera
regra nenhuma**, e o elemento cai no padrão do Tailwind — medido no navegador:

| Escrito | O que o navegador aplica |
|---|---|
| `focus:ring-marca-tx/40` | `rgba(59,130,246,.5)` — o **azul** padrão do Tailwind |
| `border-marca-tx/40` | `rgb(229,231,235)` — cinza fixo, que não retematiza |

Havia 184 classes assim. Para tinta suave existe a rampa (`tx-2`, `tx-3`); para fundo suave existem
os `-bg`; para filete suave existe a família `linha-*`. Opacidade só funciona sobre cor **literal**
(`white`, `black`, `grafite-*`).

## 3. Tipografia

Seis paradas, com piso absoluto de 12px:

| Parada | Tamanho | Onde |
|---|---|---|
| `etiqueta` | 12px | rótulo, metadado, contagem |
| `corpo` | 15px | texto corrido, campo, item de lista |
| `destaque` | 18px | título de painel, número secundário |
| `guia` | 22px | título de seção dentro da tela, dinheiro |
| `autuacao` | 28px | **a identidade da tela** — o `<h1>` |
| `tarja` | 40px | a tarja de risco, uma por tela |

Os apelidos do Tailwind (`text-xs`/`sm`/`base`/`lg`/`xl`/`2xl`/`3xl`/`4xl`) apontam para as mesmas
paradas e continuam válidos. **Tamanho arbitrário (`text-[13px]`) é erro de lint**, porque o piso
de 13px do PWA era um acordo tácito que todo componente compartilhado rompia de novo.

O blog é a única exceção: serifa própria (Lora) via `--font-blog-serif`, porque é vitrine e leitura
longa, não tela de trabalho. `font-serif` do Tailwind **não** serve — é apelido de Archivo.

## 4. Forma

- **Raio de 2px em tudo.** `rounded-full` é só para o que é redondo por natureza: ponto de status,
  contador de notificação, avatar, distintivo.
- **Filete de 2px no lugar de sombra.** Não há `box-shadow` no produto. Sombra sobrevive só onde
  algo literalmente flutua: modal, menu, folha sobreposta.
- **Nenhum filete lateral colorido em cartão.** É o tique mais reconhecível de interface gerada por
  máquina. Onde ele existe hoje, existe declarado em comentário como decisão de sistema — e no funil
  comercial ele foi trocado, porque repetia a cor da coluna em que o cartão já estava.

### A guia — a assinatura formal

A aba com chanfro de 6px no canto superior externo (`.guia-ficha`) é **o** elemento do sistema.
Escolher aba é escolher gaveta, e é por isso que ela aparece em toda navegação por abas do produto
do escritório: `/processos`, `/processos/[id]`, `/assessoria/[id]`, o PWA inteiro, e as telas de
sessão, onde ela carrega o título da página.

O Painel da Empresa **não** usa a guia, e isso é decisão, não esquecimento: separar a ferramenta da
plataforma da ferramenta do escritório é o que a torna legível. Lá o filete inferior de 2px é a
linguagem.

## 5. Movimento

Catálogo numerado em `app/globals.css`. **Nada de decorativo**: todo movimento explica retorno,
estado ou relação.

| | Movimento | Onde |
|---|---|---|
| 1 | deslizar | painel lateral |
| 2–6 | pop-up, concluir, atenção | produto |
| 7 | **arquivar** | a sequência focal única do site — a árvore do Drive se arquiva sozinha |
| 8 | avisar | aviso de cookies |
| 9 | abrir menu | folha do hambúrguer |
| 10 | os diagramas demonstram o próprio mecanismo | linhas de recurso do site |

No produto (modo Operate) vale **um** movimento de navegação, e ele é o da guia. No site (modo
Persuade) vale **uma** sequência focal ensaiada, e é proibido reinterpretar cada seção rolada como
revelação escalonada.

**`prefers-reduced-motion` precisa de alternativa intencional.** O bloco global zera a *duração* mas
não o *atraso* — toda animação com atraso precisa zerá-lo à mão, ou quem desativou movimento
continua vendo o escalonamento que a preferência pede para não existir.

**Conteúdo escondido por CSS e revelado por JS é conteúdo perdido.** O atributo que autoriza o CSS a
esconder só pode existir depois que o JS rodou.

## 6. As oito cascas

Quatro superfícies × dois temas, e **cada casca é auto-contida**: declara os 66 tokens, sem herdar
nenhum.

```
:root                                    site público · claro
.dark                                    site público · escuro
.portal-shell                            portal · escuro
.portal-shell.portal-light               portal · claro
.mobile-shell                            PWA · claro
.mobile-shell.mobile-dark                PWA · escuro
.painel-mestre-shell                     Painel da Empresa · escuro
.painel-mestre-shell.painel-mestre-light Painel da Empresa · claro
```

O portal **não** usa a classe `dark` do Tailwind. `dark:` dentro de `app/(app)` é código morto.

### Superfícies que não retematizam

Rail, barra de menus, masthead do blog e cabeçalho do PWA são grafite nos dois temas, de propósito.
Sobre elas, use `rail-tx`, `rail-marca` e `rotulo` — `--tx` e `--acao` trocam de tema contra um fundo
que não troca, e no tema claro somem.

### Os dois meios onde o token não chega

**Impressão** (`components/relatorios/FolhaImprimivel.tsx`) e **e-mail** (`lib/email.ts`) usam hex
literal, e isso é exceção deliberada e documentada: nenhum dos dois lê variável CSS. Os dois são
sempre **claros**, como papel. Ambos carregam o mapa valor-a-valor no topo do arquivo.

Na impressão, mais duas regras que só aparecem no papel: o cabeçalho da tabela **repete a cada
página** (`display: table-header-group`), e o filete da linha precisa medir pelo menos ~2:1 contra o
branco — a laser, cinza-claro some.

## 7. O que o lint guarda

`.eslintrc.json`, `no-restricted-syntax`:

1. tamanho de fonte arbitrário (`text-[13px]`);
2. rótulo claro cravado sobre fundo de risco ou de faixa (`text-white` some quando o fundo troca);
3. cor crua da paleta do Tailwind (`text-red-500` e cia. — não retematizam);
4. bordô fixo como primeiro plano (`text-acao`, `ring-marca`).

Cada regra nasceu de um defeito medido, e a mensagem de cada uma carrega a medição.

## 8. O hábito que sustenta o sistema

**Registre *por quê* em comentário de código.** É o que permite distinguir decisão de descuido — e
foi o que permitiu, neste redesenho, preservar o que era deliberado (os trilhos grafite, a linguagem
própria do Painel da Empresa, o hex literal da impressão) e corrigir o que era resíduo.

**Confira a classe no CSS de produção antes de dar por feito.** Este repositório perdeu classes por
nome inexistente (`text-sf-superficie`), por diretório fora do `content` (`lib/`), por opacidade
sobre `var()` e por nome montado em runtime. Nenhum desses aparece no `tsc`, no lint ou no build.

**Renderize.** `capitalize` numa data em português, lista sem marcador, entrelinha esmagada por um
`sm:` posterior, anel de foco azul — nenhum desses aparece lendo código.
