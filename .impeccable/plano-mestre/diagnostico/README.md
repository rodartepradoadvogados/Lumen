# F1 · Diagnóstico completo — consolidação

**Data:** 2026-09-16 · **5 superfícies · 99 rotas · 4 relatórios**

| Arquivo | Cobre |
|---|---|
| [`00-mecanico.md`](00-mecanico.md) | Detector do Impeccable sobre as 5 superfícies (1.078 achados) |
| [`01-portal.md`](01-portal.md) | Portal / SaaS — 42 rotas · modo Operate |
| [`02-site-publico-e-blog.md`](02-site-publico-e-blog.md) | Site público (8) + Blog (2) · modos Persuade e Read |
| [`03-pwa-e-painel-mestre.md`](03-pwa-e-painel-mestre.md) | PWA (37) + Painel Mestre (10) · modo Operate |

> **Nota de forma:** o plano previa *5 relatórios, um por superfície*. Foram entregues **4**, porque
> site e blog compartilham casca, tema e tipografia (criticá-los separados duplicaria a análise), e
> PWA e Painel Mestre apresentaram **o mesmo defeito em espelho** — o achado só aparece quando os dois
> são lidos juntos. As 5 superfícies estão integralmente cobertas; a cobertura rota a rota está
> registrada na seção 7 do `inventario-telas.md`.

---

## A tese única do diagnóstico

> **O Lúmen tem as regras certas e nenhum sistema.** Não há um defeito grande — há uma ausência de
> sistema que produz o mesmo defeito 1.078 vezes. Onde alguém pensou, pensou bem: a fila de triagem,
> a ordenação por severidade, "cor = risco nunca categoria", a copy das features, o piso de 13px do
> PWA, a tela `[officeId]`. **Nada disso virou regra.** Cada acerto é local e cada tela nova
> recomeça do zero.

Isso explica por que a queixa do dono é de **desagrado**, não de falha: só **22 dos 1.078 achados**
são defeito agudo. O produto funciona e é incoerente.

---

## Os 5 achados que dirigem tudo o que vem depois

### 1 · A escala tipográfica documentada é ficção — e isso é 93% do problema medido

A rampa do DESIGN.md (24/16/14/12) não existe no código. O que existe: **11px (422 usos) · 13px
(376) · 10px (126)**, em **16 tamanhos distintos**, somando **1.003 dos 1.078 achados**.

Três consequências encadeadas:
- O produto é **tipograficamente minúsculo** — 156 usos de texto ≤10px, para um usuário prioritário
  que é o dono do escritório e abre isso o dia todo.
- **Não há hierarquia porque há 16 hierarquias.** Entre "corpo" e "rótulo" restam 2px de diferença.
- No Portal o abismo é o oposto: **nada existe entre 15px e 24px**. Rótulo de navegação a 9px contra
  saudação a 30px.

**→ F2 decide a rampa nova. F3 aplica em token.**

### 2 · 73% dos achados vivem em `components/**` — a correção é de fundação

782 de 1.078 achados estão em componentes compartilhados, não em arquivos de rota. É a prova
quantitativa de que **F3 resolve a maior parte do problema antes de F4-F7 tocarem uma tela**.

O corolário aparece no PWA: o piso de 13px foi aplicado à mão em 391 lugares dentro de `app/m/**` e
**vaza toda vez que o PWA importa um componente do portal** (`ui.tsx:115`, `CopyButton.tsx:39`,
`AnotacoesPessoaisList.tsx:66` a 10px). Sem regra de lint, a convenção não se sustenta.

**→ F3, com regra de lint, não só token.**

### 3 · O modo claro não foi desenhado — foi derivado, e reprova contraste nas 5 superfícies

`--tx-3` reprova WCAG AA em toda parte: **2,96:1** no PWA claro (41 usos, a maioria a 13px — na
superfície usada sob sol), **3,30:1** no Painel Mestre claro (em todo rótulo de KPI e cabeçalho de
tabela, a 10px), **≈2,8:1** no site (carregando os **limites do plano**, que decidem a compra).

Pior que contraste fraco, há **texto invisível**: `text-white` cravado em 4 rotas do Painel Mestre e
em 4 modais dá **1,35:1** sobre o fundo claro `#c9c5d1`.

E no Portal o claro é remendo estrutural: o rail é grafite fixo nos dois temas, o aside de
Configurações também, e `--acao`/`--marca`/`--vinho`/`--ouro-acento` não retematizam por decisão
explícita. **Os pontos onde a substituição de variáveis não se aplica são justamente os mais
visíveis.**

**→ F3 (`colorize`), com autorização D-07. Texto pequeno + claro demais ao mesmo tempo é a causa
material da queixa "modo claro feio".**

### 4 · A navegação é um mapa do banco de dados, não do trabalho

No Portal: seis ícones entregam **cinco destinos** ("Comunicação" e "Jurídico" abrem a mesma URL), a
mesma URL renderiza abas diferentes conforme a porta de entrada, dois ícones acendem juntos em
`/configuracoes`, o hub do Financeiro é órfão do rail, e todo clique simples tem **250ms de atraso
deliberado**. Ver as atrasadas do escritório: **não existe caminho**.

No PWA: 8 abas ≈720px de pílulas em 416px úteis, pílula de ~30px (abaixo do alvo de 44px que o
próprio PWA respeita em outros lugares), e cada troca de aba empilha uma entrada no histórico.

No Painel Mestre: o padrão certo — abas reais e layout largo — existe em **1 de 10 telas**.

**→ F2 reconstrói o rail a partir das tarefas. F4/F6/F7 propagam.**

### 5 · O site público não diz o que o produto tem de diferente

Os **dois diferenciais declarados no PRODUCT.md** não estão na landing. "Drive" **não aparece
nenhuma vez** — e `page.tsx:120` diz *"sem depender de pasta de rede"*, que sugere o oposto do
posicionamento. "Assessoria" aparece **uma vez**, como bullet dentro de um card de preço. As cinco
features escolhidas são as cinco que todo concorrente tem, e o peso "pilar" foi dado a Publicações
(commodity) e Sigilo.

Somado: o blog **não tem nenhum link para `/` nem para `/cadastro`** (todo tráfego orgânico é beco
sem saída), `/cadastro` é a tela do dinheiro e a menos cuidada do repositório (sem marca, campos
piores que os do login, fundo escuro invertendo as telas vizinhas), e há **um único `animate-*` na
página inteira** — a queixa "o site é muito estático" está integralmente não atendida.

**→ F5, sobre a fundação de F3.**

---

## Releitura de uma queixa do dono

> O incômodo com **"animações"** provavelmente **não é excesso de animação** — é o layout nunca ficar
> parado. O Portal tem **dez larguras de conteúdo diferentes** (700 a 1600px, mais uma tela sem teto);
> com rail de largura fixa, o conteúdo **desliza lateralmente a cada navegação**. Somado ao
> `animate-fade-in` universal e ao `stagger-in` das listas, cada navegação é fade + cascata + salto.
> Enquanto isso, o site público — onde ele pediu movimento — tem um pixel animado.
>
> **Hipótese a confirmar com o dono em F2: falta movimento onde deveria haver, e sobra instabilidade
> onde deveria haver firmeza.**

---

## Conflito que F2 precisa resolver de propósito

O DESIGN.md manda, como regra da casa, que cartão use **filete só no topo** (`border-t-2`), nunca
borda nas 4 arestas, e filete lateral de 3px para identificar seção. O detector classifica **esses
dois padrões** como antipadrão quando combinados com **canto arredondado** — e são exatamente os 22
`warning` (13 `side-tab` + 9 `border-accent-on-rounded`).

Hoje o produto faz os dois ao mesmo tempo. **A rodada de direção escolhe: manter o filete e
abandonar o arredondamento, ou o contrário.** Não é dívida a corrigir em F3 — é decisão de F2.

---

## O que MERECE SOBREVIVER — lista consolidada

Regra: nenhuma destas linhas pode ser perdida no redesign. Se uma fase futura remover qualquer uma,
tem de registrar o motivo na seção 11 do plano mestre.

**Regras de sistema (as mais valiosas — generalizar, não só preservar):**
1. **Cor = risco, nunca categoria.** Nenhum dos 12 tipos de alerta tem cor própria; só a severidade
   fala. *Generalizar esta regra e apagar todo uso de cor categórica é, sozinho, metade da solução da
   paleta.*
2. **Recurso visual único por significado** (`live-dot`). A disciplina que falta ao bordô, que hoje
   tem 11 usos e 7 significados incompatíveis.
3. **Régua no lugar de sombra** (filete de 2px no topo em vez de box-shadow) — a seriedade documental
   certa para um escritório. *(Sujeita à decisão de F2 acima.)*
4. **Contadores nos rótulos de filtro** ("Não triadas · 47") — vira regra do sistema.
5. **Linguagem humana para datas** ("venceu ontem", "hoje 14:30"). Vale por dez KPIs.
6. **Registrar *por quê* em comentário de código.** É o que permitiu este diagnóstico distinguir
   decisão de descuido.
7. **`prefers-reduced-motion` global** e `motion-reduce:animate-none` já aplicados.

**Telas e componentes a preservar inteiros:**
8. **A fila de triagem de publicações** (`PublicationsTriage` + `publicationGrouping`): fila → teor →
   ação, deduplicação DJEN×e-mail, prazo em dias úteis, atalhos J/K/Enter/A/L. **É o único lugar
   desenhado para 8h/dia — o redesign parte daqui e propaga para Alertas e Painel, não o contrário.**
9. **A ordenação por severidade da fila "O dia"** — a lógica está certa, falta a forma.
10. **`/escolher`** — a única tela do funil que trata uma decisão como decisão.
11. **`/reuniao/[id]`** — a única superfície onde alguém pensou "isso vai ser projetado na frente de
    um cliente".
12. **A tela `[officeId]` do Painel Mestre** — o gabarito a replicar nas outras nove.
13. **`MobileNewEntitySheet`** e os alvos de toque `h-11 w-11` do PWA.
14. **A prévia do alerta na home do PWA** — responde "o que corre risco agora?" antes de navegar. O
    Portal **não** faz isso; deveria.
15. **Emoji condicional** no PWA (🔔/📅 só com pendência real) — sinal, não decoração.

**Conteúdo e dados:**
16. **A copy das features do site, literalmente.** *"calendário de feriados de cada tribunal já
    embutido no cálculo do prazo fatal"*, *"honorários contratuais, de êxito e de sucumbência entram
    separados, com baixa parcial de verdade"*. **Não se escreve isso sem conhecer a prática — é o
    ativo mais valioso da página.**
17. **O preço lido do banco**, sem array fixo no código.
18. **A disciplina de prova**: um número real, nenhum inventado, recusa explícita a foto e depoimento
    falsos. **Regra, não limitação a contornar.**
19. **Peso desigual entre features** (hierarquia editorial em vez de grade de ícones iguais) — só
    precisa apontar para os diferenciais certos.
20. **Lora no blog como foi implementada** (variável própria, escopo garantido, justificativa escrita).
21. **O "Entrar" fora do hambúrguer** — corrige um bug real de PWA. Movê-lo para dentro do menu
    **reintroduz o bug**.
22. **`LumenUi` como linguagem deliberadamente distinta** e **trilhos grafite fixos** no Painel
    Mestre — separar a ferramenta da plataforma da ferramenta do escritório é decisão certa.
23. **A auto-contenção do `.mobile-shell`** e o comentário que a explica (dívida do PR #174).
24. **A construção da rampa `#b3aebc`** — método correto aplicado a valores que reprovam. Corrigir os
    valores, preservar o método.
25. **A acessibilidade já feita:** `aria-label` nos diagramas, `aria-expanded` no hambúrguer, as duas
    correções de contraste documentadas.

---

## Defeitos reais, corrigíveis independentemente do redesign

Dez achados que **não são gosto** — são defeito. Podem virar um PR curto antes de F2, ou entrar nas
fases correspondentes. **Pendente de decisão do dono.**

| # | Defeito | Arquivo | Gravidade |
|---|---|---|---|
| 1 | "Minhas atrasadas" filtra pelo usuário logado, não pelo escritório — **o dado do escritório já é buscado e descartado**. Mis-serve exatamente o usuário prioritário declarado | `app/(app)/painel/page.tsx:128` (dado em `:91-95`) | Alta |
| 2 | Dois destinos do rail resolvem para a mesma URL | `lib/navSections.ts:65` e `:78` | Alta |
| 3 | `text-white` cravado torna texto invisível (1,35:1) no tema claro do Painel Mestre | `produto`, `cofre`, `confianca`, `equipe` + 4 modais | Alta |
| 4 | `--ouro-acento` ausente de `.mobile-shell` com consumidor vivo — o ouro muda conforme o tema do **site público** (mesma classe de bug do PR #174) | `app/m/page.tsx:237` + `globals.css` | Alta |
| 5 | Tema escuro vaza para o site público e **não há toggle em nenhuma página pública** — quem faz logout no escuro não tem como voltar | `app/layout.tsx:44-46` + `lib/theme.ts:45-52` | Alta |
| 6 | `.fp-input` referencia `var(--sf)`, **que não existe** — inputs de 3 telas financeiras sem fundo declarado | `financeiro/receitas/page.tsx:219-222`, idem `despesas`, `dre` | Média |
| 7 | Grade de preço sem `gap` (filete duplo entre cards) + badge "Recomendado" no fluxo, **desalinhando justamente o card em destaque** | `app/page.tsx:432`, `:444-449` | Média |
| 8 | Classe `prose-like` **não existe no repositório** | `app/blog/[slug]/page.tsx:95` | Média |
| 9 | `/peticionar` sem nenhum link interno — beco sem saída absoluto | `components/PeticionarWorkspace.tsx` | Média |
| | **Correção de 2026-09-16:** esta linha foi lida ao contrário por mim em três relatos ao dono — como se a tela não tivesse ENTRADA. Tem, e sempre teve: `PeticionarButton` está em `TopBarActionsContent`, ou seja, na barra superior de **toda** tela do portal, mais `/processos/[id]`, `PublicationsTriage` e `PublicationRow`. O achado original é o oposto e está certo: a tela não tinha **saída** — três links externos e nada mais, sem voltar, sem fechar, sem dizer do que se tratava. Corrigido no PR #211 | | |
| 10 | Copy *"sem depender de pasta de rede"* contradiz o posicionamento de custódia no Drive do cliente | `app/page.tsx:120` | Média |

---

## Pendência que este ambiente não resolve

**`audit` não foi rodado como passagem própria.** Os quatro relatórios são `detect` + `critique`. As
críticas tocam em acessibilidade (contraste medido), tema, responsivo (416px no PWA) e um achado de
desempenho (11 consultas por troca de aba), mas **incidentalmente** — não houve a varredura dedicada
que o comando `audit` faz. Ela depende das mesmas coisas que faltam aqui (navegador e banco) e está
agendada para F8.

⚠️ **A inspeção visual não foi feita.** O sandbox não alcança o banco Neon, então nenhuma tela
renderiza com dado real aqui. Todo este diagnóstico é leitura de código mais detector estático —
rigoroso quanto ao que afirma, mas **cego para o que só aparece renderizado**. Registrado como
pendência de **F8**, a ser feito na máquina do dono.
