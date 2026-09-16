# F5 · `audit` — site público e blog

**Data:** 2026-09-16 · **Escopo:** `app/page.tsx`, `/login`, `/cadastro`, `/escolher`,
`/redefinir-senha`, `/privacidade`, `/blog`, `/blog/[slug]`, `/peticionar`, `/reuniao/[id]` e os
formulários que servem a essas rotas.

> Esta é a **primeira passagem própria de `audit` do projeto**. Em F1 as críticas tocaram em
> acessibilidade, tema e responsivo de raspão, e eu registrei isso como pendência em vez de deixar
> passar como feito. É auditoria **técnica**, não crítica de design: só o que é medível no código.

---

## Nota de saúde

| # | Dimensão | Nota | Achado central |
|---|---|:--:|---|
| 1 | Acessibilidade | **2**/4 | **Oito campos de formulário, zero `<label>`** — em login, cadastro e redefinição de senha |
| 2 | Desempenho | **3**/4 | Leve e enxuto; as duas imagens são `<img>` cru, sem `next/image` |
| 3 | Tematização | **2**/4 | O tema escuro alcança toda página pública e **não há alternador em nenhuma** |
| 4 | Responsivo | **3**/4 | 23 breakpoints e alvos de toque presentes; a grade de preço de 5 colunas não tem `gap` nem guarda de transbordo |
| 5 | Integridade de implementação | **2**/4 | Detector limpo (0 achados), mas quatro defeitos verificados que ele não enxerga |
| **Total** | | **12**/20 | **Aceitável — trabalho significativo necessário** |

## Veredito de integridade — comece por aqui

**Passa com ressalva.** A superfície pública é coerente com o mundo "Guias" desde F3: usa os tokens,
a rampa e o raio do sistema, e o detector não acusa nada. O que falha não é o sistema visual — é a
**honestidade estrutural** de quatro coisas que o detector não alcança, listadas em P1 abaixo. A
mais grave não é técnica: a landing não diz o que o produto tem de diferente, e uma linha de copy
afirma o contrário do posicionamento.

---

## P1 — corrigir antes de qualquer coisa

### [P1] Oito campos de formulário sem `<label>`
**Onde:** `components/SignupForm.tsx:30,37,44,53,63` · `components/LoginForm.tsx:43,55` ·
`app/redefinir-senha`
**Categoria:** Acessibilidade · **Norma:** WCAG 1.3.1 (Info and Relationships), 3.3.2 (Labels or
Instructions)
**Impacto:** leitor de tela anuncia o campo sem dizer o que ele é. Clicar no texto não foca o campo.
Autopreenchimento do navegador erra. É a tela em que o visitante entrega nome, e-mail e senha.
**Correção:** `<label htmlFor>` ligado por `id` em todos, mais `autoComplete` nos três que não têm.
**Comando:** `/impeccable harden`

### [P1] O tema escuro alcança o site público e não há saída
**Onde:** `app/layout.tsx:44-46` + `lib/theme.ts:45-52`
**Categoria:** Tematização
**Impacto:** quem escolhe "Noite" dentro do produto e faz logout vê a landing, o blog, o login e o
cadastro em tema escuro — e **nenhuma página pública tem alternador**. Não há como voltar sem
limpar o armazenamento do navegador.
**Correção:** alternador nas páginas públicas. O tema existe e funciona; falta a porta.
**Comando:** `/impeccable adapt`

### [P1] O blog não tem nenhum caminho para o produto
**Onde:** `app/blog/page.tsx`, `app/blog/[slug]/page.tsx` — **zero** `href="/"` e **zero**
referência a `/cadastro` nos dois arquivos
**Categoria:** Integridade de implementação
**Impacto:** todo tráfego orgânico chega e não tem para onde ir. A marca do cabeçalho não é link.
**Correção:** navegação com a marca linkada e um caminho para o produto no artigo.
**Comando:** `/impeccable clarify`

### [P1] A classe que formata o artigo não existe
**Onde:** `app/blog/[slug]/page.tsx:95` usa `prose-like` — **0 ocorrências** em `app/globals.css`
e em `tailwind.config.ts`
**Categoria:** Integridade de implementação
**Impacto:** o artigo inteiro renderiza sem a formatação que alguém pretendeu. Todo o conteúdo vira
parágrafo, sem título, lista ou citação.
**Correção:** tipografia de artigo de verdade, na rampa do sistema.
**Comando:** `/impeccable typeset`

### [P1] A grade de preço desalinha justamente o card em destaque
**Onde:** `app/page.tsx:432` (`grid md:grid-cols-3 lg:grid-cols-5`, **sem `gap`**) e `:444-449`
**Categoria:** Responsivo / Integridade
**Impacto:** cards `border-2` adjacentes encostam e produzem filete duplo de 4px; o selo
"Recomendado" é renderizado **dentro do fluxo**, empurrando o conteúdo do card recomendado para
baixo — preço, módulos e botão deixam de alinhar com os vizinhos no único card que se quer
destacar. Com 5 planos mais "sob medida", o sexto órfã numa segunda linha.
**Correção:** `gap`, selo fora do fluxo, e reflow declarado para 6 itens.
**Comando:** `/impeccable layout`

---

## P2

### [P2] `/login` não tem `<h1>`
**Onde:** `app/login/page.tsx` — h1=0 · **Norma:** WCAG 2.4.6, 1.3.1
**Impacto:** a página não se anuncia. Navegação por títulos pula a tela inteira.
**Comando:** `/impeccable harden`

### [P2] Três dos oito campos não declaram `autoComplete`
**Norma:** WCAG 1.3.5 (Identify Input Purpose). **Comando:** `/impeccable harden`

### [P2] As duas imagens são `<img>` cru
**Onde:** superfície pública · **Categoria:** Desempenho
**Impacto:** sem negociação de formato nem dimensionamento responsivo. São só duas, por isso P2.
**Comando:** `/impeccable optimize`

### [P2] A copy contradiz o posicionamento
**Onde:** `app/page.tsx:120` — *"sem depender de pasta de rede"*
**Impacto:** sugere que o Lúmen guarda os autos, quando o argumento do produto é que **o escritório**
guarda. É o oposto do diferencial nº 1 do PRODUCT.md.
**Comando:** `/impeccable clarify`

---

## Padrões sistêmicos

1. **Formulário é o ponto cego da superfície pública.** Nenhum dos oito campos tem rótulo
   programático, e o formulário de **cadastro** é mensuravelmente pior que o de login — campos mais
   baixos, borda mais fraca, sem estado de foco próprio. A tela do dinheiro é a menos cuidada.
2. **O que o detector não vê é o que está errado.** Ele acusou **zero** achados aqui, e mesmo assim
   há uma classe CSS inexistente, um blog sem saída e uma grade que desalinha o próprio destaque.
   Varredura mecânica limpa não prova coerência.

## O que está funcionando

- **Contraste**: todos os tokens de texto passam AA nos dois temas desde F3b, verificado por cálculo.
- **`:focus-visible` global** e `prefers-reduced-motion` global, desde F3.
- **Ambas as imagens têm `alt` e `loading`.** Nenhuma imagem sem descrição.
- **`aria-label` nos diagramas** da landing e `aria-expanded` no menu.
- **Zero `will-change`, zero blur, duas animações** na superfície inteira — leve de verdade.
- **Detector limpo**, o que confirma que o sistema visual de F3 pegou aqui.
- **A disciplina de prova**: nenhum depoimento, logotipo ou número inventado.

## Ações recomendadas, em ordem

1. **[P1] `/impeccable harden`** — rótulo e `autoComplete` nos oito campos; `h1` no login.
2. **[P1] `/impeccable adapt`** — alternador de tema nas páginas públicas.
3. **[P1] `/impeccable clarify`** — caminho do blog para o produto; a copy que contradiz o Drive.
4. **[P1] `/impeccable typeset`** — tipografia de artigo, no lugar da classe inexistente.
5. **[P1] `/impeccable layout`** — a grade de preço.
6. **[P2] `/impeccable optimize`** — `next/image` nas duas imagens.
7. **[P1] `/impeccable bolder`** — os dois diferenciais no primeiro viewport. É o achado mais grave
   do diagnóstico inteiro e não é técnico, por isso vem depois dos que travam uso.
8. **`/impeccable polish`** — passagem final.

*Reproduzir a nota: reexecutar `audit` sobre a mesma lista de rotas depois das correções.*
