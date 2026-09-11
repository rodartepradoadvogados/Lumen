# Roteiro de dinamismo — site público (`app/page.tsx`)

Origem: pedido direto do dono do projeto (2026-09-11) — "o site é muito estático, pouco
dinâmico"; comando `$impeccable bolder` em modo `/plan` (planejamento, sem editar código ainda).

**Diagnóstico de base:** `app/page.tsx` (459 linhas, 8 seções) não tem nenhum componente client,
nenhuma animação, nenhum `@keyframes`, nenhum `useEffect`/`useState` — a única interatividade
hoje é `hover:` de cor em link/botão. O site inteiro renderiza como uma foto parada da mesma
tela, com o mesmo ritmo do início ao fim.

**Restrição que governa todo item deste roteiro** (`DESIGN.md`, seção Overview): *"Movimento é
sempre curto (120–200ms), sempre com um motivo nomeado — nunca decorativo."* Nenhum item abaixo
é efeito por efeito — cada um dramatiza um mecanismo real do produto (publicação chegando sozinha,
prazo se recalculando, número comprovado) ou resolve uma necessidade funcional real (saber em que
seção da página eu estou, saber que um número é real e não texto estático). Onde a duração passa
de 200ms (ex.: o ticker do hero, o count-up), a justificativa está registrada no próprio item —
não é decoração livre, é a mesma régua aplicada a um movimento mais longo porque o conteúdo em si
tem duração (um ciclo de texto, uma contagem).

**Sem dependência nova.** Todos os itens usam CSS puro (`@keyframes`/`transition`) e, no máximo,
um hook próprio de `IntersectionObserver` (~30 linhas, sem lib) para disparar animação de entrada
uma única vez por elemento — nada de `framer-motion`/`gsap`. Alinhado ao princípio de custo mínimo
já registrado em `PRODUCT.md`.

**Acessibilidade é parte do critério de aceite, não um item à parte:** todo movimento deste
roteiro respeita `prefers-reduced-motion: reduce` (o ticker do hero e os count-up caem para o
estado final estático, sem ciclo); nenhum item causa layout shift (a animação nunca muda altura
final de um elemento, só opacidade/posição/traço); nenhum efeito repete em loop indefinido, exceto
o ticker do hero (D1), que é o único item pensado para ciclar continuamente — e é o primeiro a
travar no estado estático sob `prefers-reduced-motion`.

**Como usar este documento:** mesma convenção de `plano-adequacao/roteiro-de-adequacao.md` — lista
fixa, não reordenar/reescrever item já numerado; progresso vai em `andamento-dinamismo.md`. Todo
item aqui é 🎨 (decisão visual) — nenhum entra em execução antes de validação do dono do projeto
no artefato publicado (link em `andamento-dinamismo.md`).

---

## D1 · Hero · Faixa "ao vivo" acima do título 🎨

- **Onde:** `app/page.tsx`, seção 2 (Hero), acima do `<h1>` — hoje só o texto estático "Software
  de gestão para escritórios de advocacia".
- **O quê:** o hero é o primeiro contato do visitante e é 100% texto parado — nada ali sugere que
  o produto de fato *faz algo sozinho*, que é a própria proposta de valor ("Arquivo Vivo" do
  `DESIGN.md`).
- **Por quê:** a promessa central do produto ("publicações chegam triadas, prazo se recalcula
  sozinho") é invisível no hero — o texto *descreve* automação, mas a página não *demonstra*
  nenhuma.
- **Correção:** uma linha de texto pequena (mesmo estilo do eyebrow já existente, `text-[11px]
  uppercase text-marca-tx`) que cicla entre 3–4 ações reais do produto, uma de cada vez, com
  crossfade curto (200ms) e permanência de ~2.8s por linha — ex.: "Publicação do DJEN recebida e
  vinculada ao processo" → "Prazo recalculado com o feriado do tribunal" → "Conta a receber
  conciliada com o caixa". Texto genuinely descritivo do produto (não inventado — mesmas ações já
  citadas no corpo do hero/seção de recursos), nunca número de marketing não comprovado (respeita
  a mesma regra de `PRODUCT.md`/documento 09: só o que o escritório pode comprovar).
- **Critério de aceite:** a faixa cicla automaticamente; sob `prefers-reduced-motion`, mostra só a
  primeira linha, parada; nenhum layout shift entre as linhas (altura fixa reservada).

## D2 · Nav do cabeçalho · Realce da seção ativa ao rolar 🎨

- **Onde:** `app/page.tsx`, seção 1 (Barra), `nav` com Produto/Preço/Blog.
- **O quê:** o cabeçalho fica fixo (`sticky`) mas nunca reage ao scroll — o link "Produto" continua
  com a mesma aparência estejamos no topo ou no meio da seção de recursos.
- **Por quê:** funcional, não decorativo — o rail do produto (aplicativo interno) já usa realce de
  item ativo (`--rail-marca`); a home pública é a única superfície sem essa orientação, apesar de
  ser uma página de rolagem longa (8 seções).
- **Correção:** `IntersectionObserver` simples nas seções `#recursos`/`#preco` marca o link
  correspondente com sublinhado bordô permanente (reaproveita `underline-offset-4`, já no token
  `navLink`) enquanto a seção está em vista — sem cor nova, sem peso de fonte novo.
- **Critério de aceite:** o link do nav correspondente à seção visível na viewport recebe o
  sublinhado; nenhum outro estilo do nav muda; funciona sem JS (só perde o realce, não quebra
  navegação, já que os links continuam âncoras normais).

## D3 · Linha de números e faixa "93 tribunais" · Contagem ao entrar na tela 🎨

- **Onde:** `app/page.tsx`, seção 3 (`STATS.map`) e seção 5 (faixa `93` sobre `bg-grafite-800`).
- **O quê:** os números (`93`, e os 3 que ainda estão em branco) aparecem já "prontos" — nenhum
  sinal visual de que são dados reais e não um placeholder de layout.
- **Por quê:** é o único número comprovado do site (`93 tribunais integrados`, dado real de
  `lib/tribunaisCatalog.ts`) — contagem rápida do zero até o valor final assina "isto é medido ao
  vivo", reforçando credibilidade num ponto que hoje é só texto estático.
- **Correção:** ao entrar na viewport (uma vez só, `IntersectionObserver`), o número conta de 0 até
  o valor final em ~600–800ms com `tabular-nums` (já usado) para não deslocar o layout durante a
  contagem. Números `null` (ainda sem dado) continuam mostrando "—", sem contagem — não há o que
  contar.
- **Critério de aceite:** a contagem dispara uma única vez por carregamento de página, ao entrar na
  viewport; sob `prefers-reduced-motion`, o número aparece direto no valor final; nenhum reflow
  (largura reservada pelo `tabular-nums` já existente).

## D4 · Linhas de recurso · Cada diagrama demonstra o próprio mecanismo 🎨

- **Onde:** `app/page.tsx`, seção 4, `FeatureDiagram` (5 variantes SVG: publicações, painel,
  peticionamento, financeiro, sigilo).
- **O quê:** os 5 diagramas (adicionados no P0-2 do plano de adequação, ver
  `.impeccable/plano-adequacao/`) já são desenhos fiéis ao que cada tela faz — mas ficam parados. É
  a maior superfície da página (5 blocos, metade da altura de cada um) sem nenhum movimento.
- **Por quê:** cada diagrama já *representa* um mecanismo do produto que é, por natureza, um
  evento no tempo — uma publicação chegando, um prazo vencendo, um traço de fluxo de caixa sendo
  calculado. Animar cada um pela lógica que ele já desenha (não um efeito genérico repetido 5x) é o
  motivo nomeado que a regra do `DESIGN.md` exige.
- **Correção**, uma animação de entrada própria por `diagram` (dispara uma vez, ao entrar na
  viewport, 400–600ms):
  - **Publicações:** as 3 linhas entram uma após a outra (stagger ~120ms), como se cada publicação
    estivesse chegando na fila.
  - **Painel:** as 7 barras da agenda semanal sobem do zero até a altura final (mesmo mecanismo do
    D3, aplicado a um gráfico em vez de um número).
  - **Peticionamento:** as linhas de texto (campos preenchidos) aparecem em sequência, como se o
    modelo estivesse sendo preenchido automaticamente.
  - **Financeiro:** o traço do fluxo de caixa (`<polyline>`) se desenha com `stroke-dashoffset`
    (efeito clássico de "linha sendo traçada"), as 4 barras sobem em seguida.
  - **Sigilo:** os pontos mascarados (`circle`) aparecem primeiro; o retângulo de "revelar" pulsa
    uma vez, sutil, chamando atenção pro controle sem se repetir.
  - Junto (não um item à parte): a própria linha do recurso (título + parágrafo) ganha um reveal
    leve (opacidade + 8px de deslocamento vertical, ~200ms) ao entrar na viewport, no mesmo
    instante do diagrama — reforça a leitura de "conteúdo entrando", não um efeito isolado do SVG.
- **Critério de aceite:** cada diagrama anima uma única vez, na entrada em viewport, com a lógica
  específica listada acima (não um fade genérico repetido 5x); sob `prefers-reduced-motion`, todos
  os diagramas aparecem já no estado final, sem nenhum passo intermediário.

## D5 · Cartões de preço · Resposta ao hover sem sombra 🎨

- **Onde:** `app/page.tsx`, seção 6 (Preço), `plans.map`.
- **O quê:** os cartões (`border-2 border-regua-forte`) não reagem a hover — parecem estáticos
  mesmo sendo o ponto de decisão da página.
- **Por quê:** "A Regra do Flutuar de Verdade" do `DESIGN.md` proíbe sombra em repouso ou hover de
  cartão parado — então a resposta ao hover não pode ser a solução óbvia (elevar com sombra); tem
  que ser resolvida com o vocabulário que o sistema já sanciona (régua).
- **Correção:** hover intensifica a borda de `border-regua-forte` para `border-acao-light` (mesma
  cor já usada no plano `recommended`, sem introduzir tom novo) em 120ms, mesma duração dos outros
  estados de hover do sistema. O selo "Recomendado" (quando existe) ganha um pulso único e sutil de
  opacidade ao entrar na viewport (chama atenção uma vez, não fica piscando).
- **Critério de aceite:** hover muda só a cor da borda (sem sombra, sem escala/translação); o pulso
  do selo "Recomendado" dispara uma única vez por carregamento.

## D6 · Fecho em pôster · Microinteração no CTA final 🎨

- **Onde:** `app/page.tsx`, seção 7, botão "Começar agora" sobre `bg-marca`.
- **O quê:** o botão final de conversão da página tem só troca de cor no hover (herdada do padrão
  global) — nenhum reforço extra no ponto de maior intenção de conversão do site.
- **Por quê:** microinteração dirigida à ação é o uso mais consolidado (e menos arriscado) de
  movimento em CTA — sinaliza "isto responde ao seu toque" sem introduzir nada decorativo.
- **Correção:** um `→` (seta, já é tipografia, não SVG novo) aparece ao lado do texto do botão e se
  desloca 4px para a direita no hover/focus, 120ms — mesmo padrão de duração do resto do sistema.
- **Critério de aceite:** a seta se move só no hover/focus, volta ao estado original ao sair; não
  altera a largura do botão (posição reservada).

## D7 · Âncoras internas (`#recursos`, `#preco`) · Rolagem suave 🎨

- **Onde:** `app/page.tsx` — todos os `<a href="#recursos">`/`<a href="#preco">` (nav, hero
  "Ver como funciona", rodapé).
- **O quê:** clique nessas âncoras hoje pula instantaneamente para a seção — sensação de salto, não
  de navegação numa página só.
- **Por quê:** menor risco, maior alcance do roteiro — toca 4 pontos diferentes da página com uma
  única mudança de CSS, sem JS algum.
- **Correção:** `scroll-behavior: smooth` no `html` (ou só nesta página, se o resto do produto não
  deve herdar), com fallback automático para salto instantâneo sob `prefers-reduced-motion`
  (`@media (prefers-reduced-motion: reduce) { scroll-behavior: auto }`).
- **Critério de aceite:** clique em âncora rola suavemente até a seção; sob
  `prefers-reduced-motion`, volta a saltar direto, sem transição.

## D8 · Transversal · Cabeçalho reage ao scroll 🎨

- **Onde:** `app/page.tsx`, seção 1 (Barra), `header sticky`.
- **O quê:** o cabeçalho fixo tem exatamente a mesma altura (76px) e peso de régua no topo e depois
  de 2000px de rolagem — nenhum sinal de que a página "sabe" que você rolou.
- **Por quê:** reforça a orientação já criada pelo D2 (seção ativa) com um segundo sinal, mais sutil
  — o cabeçalho "se firma" (régua de baixo passa de 2px de `--regua-forte` para a mesma espessura
  em `--acao`, ou levemente mais opaco) quando a página deixa de estar no topo.
- **Correção:** classe condicional no `header` (via o mesmo `IntersectionObserver`/scroll listener
  leve do D2) trocando a cor da régua inferior após ~40px de rolagem, transição de 150ms.
- **Critério de aceite:** a régua do cabeçalho muda de cor uma vez, na transição topo/rolado, sem
  mudar a altura do cabeçalho (sem layout shift no conteúdo abaixo).

---

## Ordem de execução recomendada

Agrupada por risco/esforço, não por posição na página — todos os itens são independentes entre si
(podem ser feitos em qualquer ordem ou em paralelo), mas esta ordem entrega o ganho percebido mais
rápido pelo menor risco primeiro:

1. **Baixo risco, alto alcance (mudança pequena, efeito sentido em várias seções):** D7 (rolagem
   suave) → D2 (realce de seção ativa) → D8 (cabeçalho reage ao scroll) → D6 (seta do CTA).
2. **Médio risco (novo hook de viewport, mas mecanismo repetido/simples):** D5 (hover dos cartões
   de preço) → D3 (contagem dos números).
3. **Maior esforço (5 animações desenhadas sob medida, uma por diagrama):** D4 (linhas de
   recurso) — o item de maior impacto visual do roteiro, também o mais trabalhoso.
4. **Mais sensível ao conteúdo (precisa de texto validado, não é só CSS):** D1 (ticker do hero) —
   feito por último de propósito: as frases do ciclo devem ser validadas como descrição fiel do
   produto antes de entrar no ar, mesmo padrão de cuidado já usado com os números de marketing.

Nenhum item entra em execução antes da validação visual do dono do projeto no artefato publicado
(ver `andamento-dinamismo.md`) — mesma regra do `plano-adequacao`.
