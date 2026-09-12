# Andamento do plano de redesign — site público (`app/page.tsx`)

> **Instrução permanente:** mesma convenção de `plano-adequacao/andamento.md` e
> `plano-dinamismo/andamento-dinamismo.md` — ler este arquivo inteiro antes de qualquer rodada,
> acrescentar bloco novo ao final, nunca reescrever um já registrado.

**Escopo:** redesign de `app/page.tsx` **dentro da identidade visual já confirmada** (Bordô
Editorial, régua em vez de sombra, Inter, raio em três paradas — `DESIGN.md`) usando, em conjunto,
os comandos `$impeccable bolder`, `colorize`, `layout`, `typeset`, `animate`, `clarify`, `onboard`
e `polish`. **Não é troca de identidade** — não passa por `new-work.md`, não substitui `DESIGN.md`.
Incorpora por inteiro o roteiro de dinamismo (`.impeccable/plano-dinamismo/roteiro-dinamismo.md`,
itens D1–D8) como a camada de movimento deste redesign.

---

## Validação visual

Artifact publicado ("Lúmen — pulso"):
https://claude.ai/code/artifact/602d7e89-6d1b-4c16-89a7-432761393701

Mockup completo e interativo da home redesenhada (não itens isolados) — cabeçalho com realce de
seção ativa, hero assimétrico com o "ledger vivo" (demonstração ao vivo do produto, script de 5
eventos em loop), painel de número único, 5 linhas de recurso com peso desigual (Publicações e
Sigilo tratadas como pilar), preço com resposta ao toque, fecho em pôster, e um painel final
mapeando cada decisão ao comando do Impeccable que a gerou.

---

## Rodada 0 — pesquisa de referência + redesign (`$impeccable bolder+colorize+layout+typeset+animate+clarify+onboard+polish`)

**Data:** 2026-09-11 · **Sessão:** pedido direto do dono do projeto, na sequência do plano de
dinamismo (D1–D8) — usar o Impeccable "com intenção de redesign, dentro da mesma identidade
visual", tom "já sóbrio, mas moderno, com animações e dinamismo... mais alegria" que as
referências do setor, citando AdvBox, Astrea e Projuris.

### O que foi feito

- Lidas as referências de comando relevantes antes de desenhar: `colorize.md`, `layout.md`,
  `typeset.md`, `animate.md`, `clarify.md`, `polish.md`, `onboard.md` — cada regra ("preservar
  mundo visual confirmado", "cor com papel, não decoração", "foco em um momento autoral de
  movimento, não fade genérico", etc.) aplicada de propósito na proposta, registrada no painel
  "Mapeado por comando" do próprio artefato.
- **Pesquisa de referência real** (não memória de treino) via busca + leitura das três homepages
  citadas: AdvBox (`advbox.com.br/software-juridico`), Astrea/Aurum (`aurum.com.br/astrea`),
  Projuris (`projuris.com.br/adv`). Padrão comum encontrado nas três: paleta azul corporativa,
  carrossel de depoimento + parede de números de alcance ("120 mil advogados", "5 milhões de
  processos"), grade de 4 ícones repetida para "funcionalidades", tabela comparativa de planos com
  checkmark — registrado no próprio artefato como "o que evitamos, de propósito", com a razão de
  cada desvio (ex.: sem cliente pagante externo confirmado ainda, `PRODUCT.md` — não dá pra fazer
  parede de depoimento sem inventar).
- **`onboard` avaliado e aplicado de forma limitada**: não existe fluxo de primeiro uso para
  redesenhar nesta superfície (é a home pública, não uma tela pós-login) — a técnica aplicável foi
  só a "ponte" entre CTA e próximo passo (uma frase sob o botão principal explicando o que acontece
  depois do clique), marcada explicitamente como rascunho a validar, pela mesma regra que os
  números de marketing já seguem em `PRODUCT.md` ("só o que o escritório possa comprovar").
- Redesign apresentado como mockup único e interativo (não lista de itens isolados) — decisões de
  `layout` incluem: hero assimétrico (55/45, antes bloco centralizado), consolidação das duas
  seções fracas de estatística (grid de 4 com 3 em branco + faixa separada do "93") num único
  painel de número real, e peso visual desigual entre as 5 linhas de recurso (Publicações e Sigilo
  como "pilar", maiores — são os dois mecanismos citados em `PRODUCT.md` → Positioning como
  diferencial real, os outros três recursos ficam no tratamento padrão).
- `colorize`: bordô passa a ocupar uma região inteira (fundo do cartão "ledger vivo" no hero) em
  vez de só filete/borda — sem introduzir cor nova. `ouro-acento` deliberadamente **não** usado
  nesta proposta — já tem um lugar reservado (cartão "Assessoria Jurídica" no produto interno,
  `DESIGN.md`) e a própria regra do sistema veta espalhar ("decoração de destaque única, não uma
  segunda cor de marca").
- `animate`: todo o roteiro D1–D8 de `plano-dinamismo/` incorporado ao mockup, com um adendo em
  relação ao D1 original — o ticker de texto do hero virou o "ledger vivo" (painel com filete
  lateral por categoria, reaproveitando o próprio motivo visual do sistema — a régua de
  `FeatureDiagram`), um momento autoral mais forte do que uma linha de texto ciclando, conforme
  `animate.md` pede ("um fade genérico repetido não é uma tese de movimento").
- Implementação técnica do artefato segue as regras de acessibilidade de `animate.md`/
  `artifact-design`: todo conteúdo acima da dobra visível sem depender de JS; contagem de número e
  revelação de diagrama partem do valor/estado final já presente no HTML (nunca `opacity:0` à
  espera de um observer sem fallback); tudo respeita `prefers-reduced-motion`.

### Pendente desta rodada

- **Nenhum código de produto foi alterado** — só pesquisa, o artefato e este registro.
- **Aguardando validação do dono do projeto no artefato** antes de qualquer implementação real em
  `app/page.tsx`. Ao aprovar, a implementação deve reconciliar este plano com
  `plano-dinamismo/roteiro-dinamismo.md` (os itens D1–D8 são o mesmo trabalho, incorporado aqui) —
  não abrir dois roteiros de execução paralelos para a mesma mudança de código.
- Frase de apoio ao CTA ("Cadastro em poucos minutos...") precisa de confirmação do dono do projeto
  antes de virar copy publicável, mesma régua dos números de marketing.

## Nota de encerramento — descartado, depois retomado em outro plano

**Data:** 2026-09-11/12. Este plano ("pulso") ficou **descartado** durante a sessão de `grilling`
do Portal Noturno (2026-09-11, "não representa mais a direção pretendida") — nunca chegou a ser
implementado. Foi **retomado como ponto de partida** em 2026-09-12, numa sessão nova de `grilling`
própria para o site público (não uma continuação direta deste arquivo) — ver
`.impeccable/plano-site-publico/andamento-site-publico.md`, que implementou de fato o hero
assimétrico e o "ledger vivo" descritos aqui, com ajustes (raio 2px em vez de raio 0, densidade
maior nos diagramas, sem a frase de apoio ao CTA acima — nunca confirmada).

**O que NÃO foi retomado**: o roteiro de dinamismo (D1–D8,
`.impeccable/plano-dinamismo/roteiro-dinamismo.md`) que este plano dizia "incorporar por inteiro"
como camada de movimento — nunca chegou a ser validado (ver nota de encerramento própria naquele
arquivo) e a implementação de 2026-09-12 não cobriu nenhum item de interação/movimento (contagem
animada, realce de seção ao rolar, rolagem suave, microinterações). Se o dono do projeto quiser
essa camada, é trabalho ainda em aberto, não concluído.

**Este arquivo fica congelado a partir daqui** — não é mais atualizado; o andamento de verdade do
site público vive em `plano-site-publico/`.
