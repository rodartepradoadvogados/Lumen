# F2 · A rodada de direção

**Data:** 2026-09-16 · **Seed:** `2cac85b3` · **Escopo:** `direction` · **Modo:** `operate`
**Índice designado pelo sorteio:** 4 · **Superfície-âncora:** Portal (`app/(app)/**`)

| Arquivo | O que é |
|---|---|
| `proposta-guias.html` | A proposta clicável entregue ao dono. Artefato publicado em https://claude.ai/artifact/3oyngezqNFzh2maC521aH8 |
| `../../surfaces/app-app.md` | O contrato de direção gravado (THESIS, OWN-WORLD, STORY, FIRST VIEWPORT, FORM, FINISH) |

> ⚠️ **A direção ainda não foi aprovada.** O gate do dono (decisão D-08) é o artefato acima. Nenhuma
> linha de código de produção pode ser escrita antes de uma aprovação registrada na seção 11 do plano
> mestre.

---

## Os sete candidatos fundamentados, ordenados por ressonância

Derivados do mundo cultural da audiência — o direito brasileiro e sua burocracia documental —
abrangendo quatro famílias materiais, não uma.

| # | Candidato | Família | Por que ressoa | O que carrega |
|---|---|---|---|---|
| 1 | **Capa dos autos e etiqueta de autuação** | arquivamento físico | Todo advogado com mais de 15 anos manuseou isso diariamente | Custódia — "o acervo é seu" |
| 2 | **Livro-razão encadernado** | impresso burocrático | "Razão" é palavra viva no financeiro do escritório | O registro corrente |
| 3 | **Carimbo de protocolo e numeração de folhas** | impresso burocrático | É a prova de que algo aconteceu numa data | Prazo e irreversibilidade |
| 4 | **Guias escalonadas do arquivo de cartório** ◀ **designado** | arquivamento físico + sinalização | Resolve literalmente o defeito de navegação diagnosticado | Navegação como sistema de guias |
| 5 | **Régua de prazo e escala de engenheiro** | instrumento de medida | Prazo é medida; o produto conta dias úteis o tempo todo | Hierarquia por graduação |
| 6 | **Diário Oficial em coluna** | impresso burocrático | É literalmente o documento que o produto ingere | A fila de publicações |
| 7 | **Diagrama ferroviário de Marey / Gantt** | notação e gráfico de dados | A semana como geometria, não como lista | "O que corre risco agora" como forma |

**Rut mantido fora da lista:** o padrão AdvBox/Astrea/Projuris (azul corporativo, barra lateral escura
de ícones de linha, quatro KPIs iguais, rosca de pizza) e o seu oposto previsível (dashboard neon com
vidro e gradiente roxo-azul). O candidato 6 é a leitura literal do mecanismo — gasto deliberadamente
como o **único** candidato literal, conforme a regra do `new-work`.

**Auto-verificação de rendição:** a armadilha declarada da skill para assunto "livresco" é fundo creme
+ serifa de alto contraste + acento terracota. O manila `#ddd7c8` não é creme: é papel tingido em
massa, e está ancorado por duas cores saturadas sempre presentes na tela (a faixa da seção e o
vocabulário de risco). Se uma tela ficar monocromática bege, a rendição falhou.

---

## Julgamento dos challengers

Cada um fundido com o produto antes de ser julgado, em dois eixos: **identificação da audiência** e
**clareza de produto**.

| Challenger | Identificação | Clareza | Veredito | O que doou à direção |
|---|---|---|---|---|
| Terminal de fósforo verde | perde | **segura** | **competitivo** | Teclado-primeiro como regra do sistema; o estado se imprime na linha, não em aviso flutuante |
| Sequência de dobras do orizuru | perde | **segura** | **competitivo** | Todo estado tem nome e tem volta; destrutivo nunca divide peso com não-destrutivo |
| Campo de dados Ikeda | perde | perde | declinado | Nenhuma superfície decorativa — halo, gradiente e sombra saem do sistema inteiro |
| Capa de disco yé-yé | perde | perde | declinado | Compromisso total de uma cor por contexto — o ambiente muda, não um badge |
| Feed vertical de vídeo | perde | perde | declinado | Um item por viewport, com o próximo já carregado — aplicado à triagem no PWA |
| Tempestade de alfabeto | perde | perde | declinado | O tipo como matéria: o número da tarja **é** o bloco |

Os dois competitivos foram apresentados como alternativas completas. Os quatro declinados foram
apresentados rebaixados, cada um carregando o veredito e a linha que a direção ficou — **nenhum foi
descartado em silêncio**.

**IMPECCABLE'S PICK:** candidato 1 (capa dos autos), que é o meu primeiro colocado e não foi o
designado. Apresentado com o risco honesto declarado: é a leitura mais óbvia de "jurídico" depois que
se abandona o azul corporativo, e a cor-por-natureza-da-ação reintroduz o problema de cor categórica
que o produto já tem.

**Saída padrão:** oferecida, quieta, não recomendada e não pesada contra as cartas.

---

## O que a direção decidiu de concreto

**Rampa tipográfica — seis paradas, piso absoluto de 12px:** 12 · 15 · 18 · **22** · 28 · 40.
A parada de 22px é o degrau que hoje não existe em nenhuma tela do Portal. Proibição de tamanho fora
da rampa **garantida por lint**, não por combinado — foi por falta disso que o piso de 13px do PWA
vazou por componente compartilhado.

**Paleta — estratégia "paleta completa", quatro papéis nomeados**, com todos os tokens de texto
verificados em WCAG AA nos dois temas, contra a superfície mais clara de cada um (o pior caso):

| Papel | Manila (claro) | Gaveta (escuro) |
|---|---|---|
| Fundo · ficha · gaveta | `#ddd7c8` · `#f0ece1` · `#c9c2b0` | `#22211d` · `#2c2b26` · `#191815` |
| Tinta / 2 / 3 | `#23211c` · `#45413c` · `#625d55` | `#e8e3d6` · `#bbb6aa` · `#9d9a8f` |
| Faixa de seção (5) | `#3f5a66` `#57613a` `#765a1a` `#8c4327` `#5b3a52` | `#7fa6b8` `#9aa86a` `#d3a63f` `#d58663` `#b58eab` |
| Risco (3) | `#a8221b` · `#8b5009` · `#2e694e` | `#eb786f` · `#e0a13c` · `#5fbc90` |
| Rótulo sobre faixa preenchida | `#f7f4ec` | `#1b1a16` |

**Regra que sai da medição:** Tinta 3 nunca aparece sobre a gaveta (o rail), onde cai para 3,68. Hoje o
produto viola exatamente isso — o rótulo de seção do rail é 9px em tinta terciária.

**Geometria:** raio de 2px em tudo; a guia ativa ganha chanfro de 6px no canto superior externo.
Filete de 2px no lugar de sombra; nenhuma sombra projetada no produto. Grão de papel a 4,5% só na
ficha, nunca no fundo.

**O conflito dos 22 `warning` fica resolvido por decisão:** o DESIGN.md manda usar filete, o detector
reprova filete combinado com canto arredondado. **A direção escolhe o filete e abandona o
arredondamento.** Os 22 desaparecem por escolha, não por remendo.

**Movimento:** um só movimento de navegação — a guia sobe 6px e puxa a ficha junto, em 120ms. Largura
de conteúdo única de 1440px com rail de 232px, para que nada deslize lateralmente. Isso responde à
releitura da queixa sobre animações registrada no diagnóstico.

---

## Desvios do plano, declarados

1. **O gate de aprovação não bloqueou a construção do artefato.** O plano previa `serve-question` com
   espera pela resposta do dono. O dono instruiu expressamente, no meio do trabalho, a seguir sem
   interferência até a proposta completa. A skill permite prosseguir sem resposta com a direção
   designada, declarando as suposições — foi o que se fez, e a mão inteira (designada, pick, dois
   alternates, quatro rebaixados e a saída padrão) foi entregue **dentro** do artefato, para que a
   decisão aconteça lá.
2. **O mockup cobre mais do que o plano pedia.** O plano previa duas telas do Portal; foram entregues
   cinco do Portal e quatro do app, a pedido do dono.
3. **Sem comp gerado por imagem.** `buildPath` é `code`; a rodada é code-led por contrato, e a ambição
   vive no bloco FIRST VIEWPORT e na interação-assinatura nomeada, auditáveis em comportamento.

---

## Erros cometidos e corrigidos durante F2

Registrados porque o método importa mais que o resultado:

1. **A tarja cravava texto claro** (`#f7f4ec`) sobre o vermelho de risco. No tema escuro isso dava
   **2,85** — exatamente o defeito que o diagnóstico acusou no Painel Mestre. Corrigido para o token
   de rótulo, que troca com o tema.
2. **Tinta 3 aparecia sobre a gaveta** em três lugares do próprio mockup (3,68) — violando a regra que
   o mesmo documento propõe. Corrigido para Tinta 2.
3. **Tamanhos abaixo do piso de 12px** em sete regras de CSS e dezoito usos inline, num documento que
   propõe um piso de 12px. Todos normalizados; hoje só existem as seis paradas da rampa no arquivo.
4. **Os tokens do tema escuro passavam sobre as duas superfícies principais mas não sobre a mais
   clara.** Recalculados contra o pior caso (`#333128`), para que nenhum dependa de onde caiu na tela.
