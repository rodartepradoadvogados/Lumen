---
version: 1
slug: "app-app"
primary_target: "app/(app)"
related_targets: []
---

# Portal / SaaS — superfície-âncora do redesign

**Escopo:** `app/(app)/**` — 42 rotas, ~55 sub-telas, ~35 modais-tela. **Modo do visitante:** Operate.

**Audiência:** o advogado dono/sócio (prioritário no desempate) e a equipe operacional.
**Tarefa:** saber, em segundos, **o que corre risco agora** no escritório inteiro — e agir sobre isso.
**Conteúdo/prova:** dados reais do escritório; nada inventado.
**Restrições:** Next.js 14 na Vercel; 4 mecanismos de tema independentes, cada casca auto-contida;
WCAG AA como piso da casa (D-07); terminologia jurídica não se "melhora" sem consulta.

---

## Direction contract

**THESIS.** O Lúmen é o armário de arquivo do escritório com as guias todas para cima: cada seção do
trabalho ocupa uma faixa horizontal própria e permanente, e o risco do escritório inteiro é a
primeira coisa que a tela diz. Recusa a arrumação-padrão da categoria — sidebar escura de ícones de
linha, quatro KPIs iguais lado a lado, donut de pizza, azul corporativo — e recusa também o seu
oposto previsível, o dashboard neon com vidro e gradiente. Recusa igualmente a saudação: o produto
nunca gasta o maior tipo da tela no nome de quem está logado.

**OWN-WORLD.** Papel manila em massa, não creme: `#ddd7c8` de fundo, ficha `#f0ece1`, gaveta
`#c9c2b0`; no escuro, o mesmo armário fechado — `#22211d`, `#2c2b26`, `#191815`. Quatro papéis de
cor nomeados: **faixa de seção** (ardósia `#3f5a66` · oliva `#57613a` · ocre `#765a1a` · tijolo
`#8c4327` · ameixa `#5b3a52`), **tinta** em três patamares de contraste (11,2 · 7,0 · 4,5 sobre o
manila), **risco** com vocabulário próprio e separado (vencido `#a8221b` · hoje `#8b5009` · em dia
`#2e694e`), e **ausência de cor** como estado normal. Canto vivo de 2px em tudo; a guia ativa ganha
um chanfro de 6px no canto superior externo — a assinatura formal do sistema. Filete de 2px no lugar
de sombra; nenhum `box-shadow` no produto. Grão de papel a 3% só na superfície da ficha, nunca no
fundo. Rampa tipográfica de seis paradas com piso absoluto de 12px: 12 · 15 · 18 · **22** · 28 · 40,
sendo 22 o degrau intermediário que hoje não existe em nenhuma tela. Números em face monoespaçada
tabular — o mundo da etiqueta de autuação datilografada, não do terminal.

**STORY.** O sócio abre o Portal e, antes de qualquer navegação, lê um número e uma lista: quantos
itens do **escritório** estão em risco agora, e quais são, em ordem de severidade, em linguagem
humana ("venceu ontem", "hoje 14:30"). Ele entende que o sistema mediu a semana inteira por ele.
Acredita porque os números são do escritório e não dele, e porque cada linha leva ao ato que a
resolve em um clique. Faz o ato — tria a publicação, cumpre o prazo, cobra a conta — e a linha sai
da tarja.

**FIRST VIEWPORT.** Largura de conteúdo única de 1440px com rail fixo de 232px à esquerda; nada
desliza lateralmente entre telas. No topo, faixa de guias escalonadas de 44px: as cinco seções, cada
uma numa posição horizontal permanente, com a cor da sua faixa; a ativa sobe 6px e puxa a ficha
junto. Abaixo, dois terços à esquerda: **a tarja** — bloco de cartolina em `#a8221b` com o número em
40px ("7 em risco agora") e, sob ele, as sete linhas ordenadas por severidade, cada uma com o filete
da sua faixa de seção à esquerda e a ação primária à direita. Um terço à direita: três medidores em
régua graduada — prazos da semana, publicações não triadas, contas a vencer — escalas, nunca donuts.
O nome do usuário fica no pé do rail, a 12px. A ação primária de cada linha é o único elemento
preenchido da tela.

**FORM.** Arquivo de cartório com guias escalonadas — candidato 4 da lista fundamentada, ordenada
por ressonância (1 capa dos autos · 2 livro-razão · 3 carimbo de protocolo · **4 guias de arquivo** ·
5 régua de prazo · 6 Diário Oficial em coluna · 7 diagrama de Marey). Seed key `2cac85b3`, escopo
`direction`, modo `operate`, índice designado 4.

Raises incorporados, cada um nomeado pelo doador:
- *Raise Ikeda (declinado):* nenhuma superfície decorativa. Halo, gradiente e sombra saem do sistema
  inteiro; o grão sobrevive só na ficha. Se um elemento não carrega dado ou estado, ele não existe.
- *Raise Yé-yé (declinado):* a cor da seção não é uma pílula de 20px. A guia, o filete do topo da
  ficha e a régua lateral do rail assumem a cor da seção ao mesmo tempo — você sabe onde está pela
  cor do ambiente, não por um badge.
- *Raise Feed vertical (declinado):* um item por vez, completamente resolvido, com o próximo já
  carregado — aplicado à triagem no PWA, a única tela do produto que abandona a lista.
- *Raise Alfabeto-tempestade (declinado):* o tipo como matéria. O número da tarja **é** o bloco, não
  um rótulo sobre um cartão. Um por tela, nunca dois.
- *Raise Terminal de fósforo (competitivo):* operação teclado-primeiro como regra do sistema, não
  como exceção da fila de publicações; e o estado se imprime na própria linha em vez de virar toast.
- *Raise Orizuru (competitivo):* todo estado tem nome e volta. Nenhuma ação destrutiva fica ao lado
  de uma não-destrutiva com o mesmo peso visual.

**FINISH.** unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance

---

## Decisões ainda em aberto

1. **Aprovação do dono sobre a direção** — entregue como artefato HTML clicável com a mão inteira
   (direção comprometida, IMPECCABLE'S PICK, dois alternates, quatro demotidos com veredito, e a
   saída padrão da categoria). Gate obrigatório antes de qualquer código de produção (D-08).
2. **Face tipográfica licenciada** para o produto real. O mockup roda em pilha de sistema, que é
   escolha legítima para Operate; a substituição por uma face comprada é decisão de F3.
3. **Os 10 defeitos reais** listados no diagnóstico: PR curto antes de F3, ou dentro das fases.
