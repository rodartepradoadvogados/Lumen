# F8 · `audit` — Portal, PWA, Painel da Empresa e Blog

**Data:** 2026-09-17 · **Escopo:** as quatro superfícies que faltavam (o site público foi auditado
no PR #203, ver `04-audit-site-publico.md`).

> **Veredito em uma frase:** as quatro superfícies passaram nas cinco dimensões, e o que o `audit`
> achou não foi drift de sistema — foi **resíduo**: classes mortas que ninguém podia ver, títulos
> semânticos ausentes em telas cujo título visual existia, e imagens sem carregamento preguiçoso.
> Nenhum achado P0. É a diferença entre auditar no começo e auditar depois de sete fases.

---

## 1 · Acessibilidade — **3/4**

| Verificação | Resultado |
|---|---|
| `<img>` sem `alt` | **0** |
| `<button>` só com ícone, sem `aria-label` | **0** |
| Contraste de token, 40 pares em 8 cascas | **0 reprovando** (P0-CONTRASTE, PR #209) |
| Contraste de faixa × rótulo, 30 pares | **0 reprovando** (PR #215) |
| Contraste dos e-mails, 11 pares | **0 reprovando** (PR #217) |
| Anel de foco | 4 cores, todas acima de 3:1 (PR #210) |
| `prefers-reduced-motion` | caminho intencional em 4 movimentos, com o atraso zerado à mão onde o bloco global não zera |
| **Páginas sem `<h1>`** | **2 reais** — `/painel` e `/m/agenda`. Corrigidas |
| **Título das folhas impressas** | era `<div>`, virou `<h1>` — as quatro folhas não tinham título semântico |

**Falsos positivos que a verificação pegou antes de eu "corrigir":** `/conexoes` tem `<h1>`, dentro
de `ConexoesView`, não da página. `/m/assessoria/.../pareceres/[id]` e `.../licitacoes/[id]` idem, nos
seus componentes de detalhe — acrescentar um `<h1>` ali teria criado título duplicado. De 45
"páginas sem h1" no grep ingênuo, 13 eram candidatas, 4 eram redirects, 4 eram falsos positivos, e
**2 eram reais**.

**Fica em aberto, medido:** 21 arquivos com `onClick` em `<div>`/`<span>`. Cada um precisa de
leitura — a maioria é invólucro com botão real dentro — e não dá para decidir por varredura.

## 2 · Desempenho — **3/4**

- `will-change`: **0 ocorrências**. Nenhum uso especulativo.
- `<img>` sem `loading="lazy"`: eram **8**; **6 corrigidas** (avatares, grades de foto, miniatura do
  blog). As **2 restantes são `data:image/png;base64`** — QR de Pix embutido no HTML, onde lazy não
  economiza requisição nenhuma porque não há requisição.
- ISR no blog, cache na consulta da home, consulta por aba em `/m/processos/[id]` (11 → 3~7, PR #214).

## 3 · Tematização — **4/4**

- **`dark:` dentro de `app/(app)`: 10 ocorrências, todas mortas.** O `darkMode` é `"class"` e o
  portal usa `.portal-shell`/`.portal-light`, nunca a classe `dark` do Tailwind. E as dez eram
  `dark:hover:text-tx` escritas **ao lado** de um `hover:text-tx` sem prefixo: redundantes *além* de
  mortas. Removidas.
- Hex cravado em `.tsx`: 54, e nenhum é drift. São a marca (`LumenMark`, geometria fixa), o script
  de tema (`app/layout.tsx`), as folhas imprimíveis e os e-mails — os três meios onde variável CSS
  não funciona, todos com a exceção documentada no próprio arquivo.
- Regra de lint guardando três famílias (rampa, rótulo fixo sobre fundo de risco, paleta crua do
  Tailwind) mais a do bordô fixo como primeiro plano.

## 4 · Responsivo — **4/4**

- Alvos de toque abaixo de 44px em elemento clicável do PWA: **0**.
- Larguras fixas em px no PWA: **2** (`w-[140px]`, `w-[160px]`), ambas em coluna de tabela, ambas
  menores que o viewport mínimo.
- `.tela` preenche; a densidade é governada na coluna, não por teto de página (PR #201).

## 5 · Integridade de implementação — **4/4**

- Detector em `app` + `components`: **3 achados**, os mesmos três desde F3 — `border-l-4` declarado
  em comentário como decisão de sistema, não deriva.
- Detector em `lib`: 36, **todos nos templates de e-mail**, onde cor e fonte literais são
  obrigatórias. O detector não sabe que e-mail é outro meio. Conferidos um a um no PR #217.
- Teste de mesa com 24 casos guardando o renderizador de markdown do blog, incluindo o filtro de
  esquema de link.

---

## Placar

| Dimensão | Nota |
|---|---|
| Acessibilidade | 3 / 4 |
| Desempenho | 3 / 4 |
| Tematização | 4 / 4 |
| Responsivo | 4 / 4 |
| Integridade | 4 / 4 |
| **Total** | **18 / 20** |

Os dois pontos que faltam têm dono: os 21 `onClick` em `<div>`/`<span>` (acessibilidade) e a
ausência de `next/image` nas imagens de rede (desempenho) — as duas exigem leitura caso a caso, e
nenhuma é regressão do redesenho.

**O que este `audit` NÃO substitui:** a conferência visual na máquina do dono. Cada rodada dela
achou defeito que o gate técnico não pegou, e ela continua sendo a única verificação deste plano
que eu não consigo fazer.
