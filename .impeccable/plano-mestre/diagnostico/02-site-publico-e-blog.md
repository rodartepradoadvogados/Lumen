# F1 · Diagnóstico — Site público (Persuade) + Blog (Read)

**8 + 2 rotas** · Tema padrão claro · **Data:** 2026-09-16
Base: leitura integral de `app/page.tsx` (560 linhas, estado pós-PR #178) e das 9 rotas restantes.

> **Veredito em uma frase:** o PR #178 trocou a mobília, não a planta. A landing hoje lê como *um bom
> exemplar* do template B2B SaaS — e os dois diferenciais do produto **não estão na página**.

---

## A landing hoje, bloco a bloco

| # | Bloco | Linhas |
|---|---|---|
| 1 | Barra sticky 76px | 289-311 |
| 2 | Hero assimétrico + painel "ledger vivo" | 320-369 |
| 3 | Faixa full-bleed com o número `93` | 375-393 |
| 4 | Cinco linhas de recurso alternando lado | 396-422 |
| 5 | Grade de preço (até 5 colunas, alimentada pelo banco) | 429-490 |
| 6 | Fecho em pôster bordô | 493-511 |
| 7 | Rodapé de 4 colunas | 515-555 |

**Promessa do primeiro viewport** (`:332`): *"O escritório inteiro, num só lugar — sem perder um
prazo."* É a frase de categoria que AdvBox, Astrea e Projuris usam — não diferencia nada. O que
diferencia está no subtítulo (`:335`), a 18px. **A hierarquia está invertida: o genérico ganhou 60px,
o específico ganhou 18px.**

**Oito CTAs, todos para `/cadastro`** (`:307`, `:338`, `:473`, `:485`, `:507`), **zero reversão de
risco** — nenhum "grátis por N dias", "sem cartão", "a gente migra pra você". Nenhum segundo caminho
(demo, conversa) além de um WhatsApp no rodapé sem rótulo de intenção.

**Cinco dos seis elementos do veredito de 10/09 sobrevivem intactos:** sticky header (`:289`), cinco
linhas alternadas (`:403-420`), grade de preço de 5 colunas (`:432`), faixa full-bleed (`:493`),
rodapé de 4 colunas (`:517`) e zero captura real (o próprio código admite em `:91-92`). O eyebrow de
11px uppercase aparece **seis vezes idênticas** — é a assinatura do template, repetida.

---

## P0

### P0-1 · Os dois diferenciais não existem na página

- **"Drive do próprio escritório":** a palavra **não aparece nenhuma vez** em `app/page.tsx`. O
  argumento mais forte contra um SaaS jurídico — *"e se vocês sumirem com os meus autos?"* — não é
  feito. **Pior:** `:120` diz *"sem depender de pasta de rede"*, que sugere o oposto do
  posicionamento: dá a entender que o Lúmen guarda, não que o escritório guarda.
- **"Assessoria empresarial":** aparece **uma vez**, como rótulo de bullet dentro dos cards de preço
  (`:438` → `lib/officePricing.ts:20`, renderizado em `:466-471`), indistinguível de um add-on ao
  lado de "WhatsApp". Nenhuma das cinco linhas de recurso (`:93-143`) é sobre contrato, licitação ou
  parecer.

As cinco features escolhidas são as cinco que **todo** concorrente tem. E o peso "pilar" (`:105`,
`:141`) foi dado a Publicações (commodity no mercado brasileiro) e Sigilo. **A hierarquia está
premiando a coisa errada.** Um sócio de escritório empresarial conclui, corretamente, que o Lúmen é
software de contencioso.

### P0-2 · O blog é beco sem saída de conversão — e fala outra língua de marca

`app/blog/page.tsx:70-72`: o `LumenMark` do masthead **não é link**. `:128-130`: o rodapé é só
disclaimer. `app/blog/[slug]/page.tsx:70-76`: o artigo só tem "Voltar ao blog". **Não há nav, link
para `/`, nem CTA para `/cadastro` em lugar nenhum do blog.** Todo tráfego orgânico chega e não tem
caminho até o produto.

E a marca renderiza em **duas tipografias**: `LÚMEN` em Inter extrabold na landing (`page.tsx:291`) e
`LÚMEN` em **Lora** no masthead do blog (`blog/page.tsx:73-75`).

### P0-3 · `/cadastro` é a tela do dinheiro e a menos cuidada do repositório

24 linhas (`app/cadastro/page.tsx`):
- **Sem marca nenhuma** — o visitante entrega nome do escritório, e-mail e senha numa caixa branca
  anônima sobre fundo **`bg-grafite-800`** (`:6-7`), invertendo o tema claro das telas vizinhas.
- Sem volta ao site, sem plano escolhido, sem preço, sem "o que acontece depois", sem "sem cartão".
- **Os campos são piores que os do login.** `components/SignupForm.tsx:33,41,50,61,72`: ~36px de
  altura, borda fraca, **sem `<label>`**, **sem estado de foco**, sem `autoComplete`. Compare com
  `LoginForm.tsx:50`: `h-11 border-regua-forte focus:border-acao`. O formulário de **cadastro** é
  mensuravelmente pior que o de login.
- Erro em `text-red-600` (`SignupForm.tsx:74`) — Tailwind cru, fora do sistema de tokens.

---

## P1

**P1-1 · Movimento: um pixel na página inteira.** `:349` (`animate-pulse` num ponto de 6px) é o
**único** `animate-*` da landing. **Nenhum** dos quatro estilos de interação (`:268`, `:269`, `:270`,
`:271`) tem `transition` — todo hover é corte seco de cor. **Zero `IntersectionObserver`** em todo o
`app/` público. Os `@keyframes` de `globals.css:297-428` pertencem todos ao produto autenticado.

> A queixa *"o site é muito estático"* está **integralmente não atendida**. O PR #178 respondeu a ela
> com **textura** (grão, halo) — que é estático por definição. E há três oportunidades óbvias
> desperdiçadas: o ledger que devia se preencher, o `93` que devia contar, os cinco diagramas que
> deviam se montar. **Os 8 itens D1-D8 do roteiro de dinamismo endereçam exatamente isso.**

**P1-2 · O painel "ao vivo" não está ao vivo.** `:348-351` rotula *"Fila de publicações — ao vivo"*
com ponto verde pulsante; `:353-356` são **três objetos hardcoded que nunca mudam**. É uma afirmação
de vivacidade que o componente não cumpre.

**P1-3 · `text-tx-3` reprova WCAG AA carregando dado decisório.** `:450` — os **limites do plano**
("Até N OABs · até N processos"), que definem qual plano o visitante compra, a 13px com **≈2,8:1**
sobre branco. Também em `:551`, `blog/page.tsx:117`, `blog/[slug]:112`.

**P1-4 · A grade de preço tem dois defeitos geométricos.** `:432` — `grid md:grid-cols-3
lg:grid-cols-5` **sem `gap`**: cards `border-2` adjacentes encostam, produzindo filete duplo de 4px, e
o card recomendado (`border-acao-light`, `:443`) cola bordas de cores diferentes. E `:444-449` — o
badge "Recomendado" é renderizado **dentro do fluxo**, empurrando ~24px de conteúdo para baixo, então
**preço, módulos e botão deixam de alinhar com os vizinhos justamente no card que se quer destacar**.
Com 5 planos + "sob medida" (`:479`), o sexto card órfã numa segunda linha.

**P1-5 · O artigo do blog não tem hierarquia interna.** `blog/[slug]/page.tsx:100-107`: **todo** o
conteúdo vira `<p>` — sem H2, lista, citação ou negrito. Uma "análise aprofundada" é servida como
paralelepípedo indiferenciado de serifa justificada. E `:95` usa a classe **`prose-like`, que não
existe em lugar nenhum do repositório**. Medida de ~85 caracteres com `text-justify hyphens-auto`, e
`space-y-4` (16px) **menor** que a entrelinha (~24px) — parágrafos não se separam.

---

## Dois defeitos que ninguém verificou

**Vazamento de tema escuro para o site público.** `app/layout.tsx:44-46` injeta o `THEME_INIT_SCRIPT`,
que lê `localStorage["rp-site-theme"]` e aplica `dark` no `<html>` **em todas as rotas, inclusive as
públicas** (`lib/theme.ts:45-52`). Todas as páginas públicas usam tokens que retematizam. Resultado:
quem escolheu "Noite" dentro do produto e faz logout vê a landing, o blog, o `/login` e o
`/cadastro` em tema escuro — e **nenhuma página pública tem `ThemeToggle`**. Não há como voltar. O
commit do #178 diz *"sem tema escuro"* para a home, mas o código não impede — só ninguém o desenhou.

**`/peticionar` é um beco sem saída absoluto.** `components/PeticionarWorkspace.tsx` (67 linhas) não
tem **nenhum** link interno — só três externos (Jusbrasil/STJ/STF, `:8-10`). Sem "voltar ao painel",
sem fechar, sem identificar o processo. Quem abre por engano depende do botão voltar do navegador.
(`/reuniao` ao menos tem `window.close()`.)

**Quatro telas de sessão, quatro linguagens de cartão:** `/login` (`border-t-2`, sem sombra) ·
`/cadastro` (fundo escuro, sombra, sem borda) · `/redefinir-senha` (borda + sombra) · `/escolher`
(`border-2`). Quatro telas adjacentes no mesmo funil.

---

## O que MERECE SOBREVIVER

1. **A copy das features, literalmente.** `:97-142`. *"DJEN e DATAJUD entram direto na fila"* ·
   *"calendário de feriados de cada tribunal já embutido no cálculo do prazo fatal"* · *"honorários
   contratuais, de êxito e de sucumbência entram separados, com baixa parcial de verdade"* ·
   *"revelar exige motivo registrado, com validade de 15 minutos"*. **Isso não se escreve sem conhecer
   a prática — é o ativo mais valioso da página, e nenhum concorrente copia sem mentir.**
2. **A disciplina de prova.** Um número real (`:386`), nenhum inventado, recusa explícita a foto e
   depoimento falsos (`:30-36`, `:91-92`). Manter como regra, não como limitação a contornar.
3. **O conceito do ledger** (`:346-367`): mostrar o mecanismo em vez de descrevê-lo. A execução é
   estática e o rótulo mente, mas a ideia é a espinha do hero novo.
4. **Peso desigual entre features** (`:105`,`:141`,`:406`,`:410`): hierarquia editorial em vez de
   grade de ícones iguais é o antídoto direto ao padrão do setor. Só precisa apontar para os
   diferenciais **certos** e ter contraste real (32 vs 26px é ilegível como hierarquia).
5. **O preço lido do banco** (`:72-82`, `:433-478`): sem array hardcoded. Não regredir.
6. **Lora no blog, como foi implementada** (`blog/layout.tsx:19-26`): variável própria, escopo
   garantido, `font-serif` do Tailwind evitada com justificativa escrita.
7. **`/escolher` inteira** (`:28-57`): duas portas, copy que explica cada mundo em uma frase, hover
   com transição. É a única tela do conjunto que trata uma decisão como decisão.
8. **`/reuniao/[id]`** (`ModoReuniaoView.tsx:41-62` + filtro de dado sensível em `page.tsx:42-45`): a
   única superfície do repositório onde alguém pensou em *"isso vai ser projetado na frente de um
   cliente"*.
9. **A acessibilidade já feita:** `aria-label` nos diagramas (`:415`), `motion-reduce:animate-none`
   (`:349`), `aria-expanded` no hambúrguer, e as duas correções de contraste documentadas.
10. **O "Entrar" fora do hambúrguer** (`:299-306`): corrige um bug real de PWA (logout sem forma
    visível de logar). Redesign que mover "Entrar" para dentro do menu **reintroduz o bug**.
