---
name: analise-risco-processual
description: >
  Avaliação de risco de um caso em curso ou de uma causa a ser ajuizada — probabilidade de êxito
  qualitativa (não um percentual numérico inventado), exposição financeira e cenários de
  resultado — sem virar adivinhação estatística sem base real. Cruza a força da prova disponível,
  o mapa de teses de cada lado com jurisprudência validada, os valores em jogo (condenação,
  custas, honorários sucumbenciais, correção, multas) e devolve classificação de risco com o que
  a sustenta. Use SEMPRE que for preciso avaliar chance de êxito de um caso, decidir sobre
  provisionamento contábil de contingência, orientar decisão de recorrer, negociar acordo,
  responder ao cliente "qual a chance de ganhar" ou "quanto podemos perder", ou preparar parecer
  de risco para due diligence.
---

# Análise de risco processual — sem virar adivinhação numérica falsa

Esta skill existe para responder à pergunta que todo cliente faz — "qual a chance de ganhar",
"quanto podemos perder" — sem cometer o erro mais comum e mais caro dessa resposta: transformar
uma avaliação qualitativa em um número que parece preciso e não é. "70% de chance de êxito" soa
rigoroso, mas normalmente não vem de nenhuma base estatística real — vem de uma impressão vestida
de número. O cliente memoriza o número, não a ressalva ao lado dele, e decide provisionar,
negociar ou recorrer com base numa precisão que ninguém tem.

**Princípio que resolve todo conflito interno desta skill: uma classificação qualitativa bem
fundamentada vale mais que um percentual sem lastro.** Prefira dizer "risco moderado, porque a
prova documental favorece o cliente mas a tese jurídica tem entendimento dividido no tribunal
competente" a dizer "60% de chance". A primeira frase é auditável — qualquer um pode discordar
dela item por item; a segunda parece objetiva e não é nada.

## Gatilhos — quando rodar

- Avaliação de caso novo ou em andamento antes de decisão estratégica: recorrer, transigir,
  cumprir espontaneamente, aguardar.
- Pedido de provisionamento contábil de contingência (obrigação provável, possível ou remota) ou
  de parecer de risco para relatório financeiro do cliente pessoa jurídica.
- Pergunta direta do cliente sobre chance de êxito ou exposição financeira.
- Due diligence de contencioso, em operação societária ou em avaliação de carteira de processos.
- Preparação de proposta de acordo, onde o valor de referência precisa estar ancorado em cenários
  e não num número inventado.

## Parada obrigatória: sem os insumos abaixo, não há avaliação — há chute

O trabalho começa quando estes itens estiverem disponíveis. Faltando algum, a resposta é uma só:
listar o que falta, pedir, e parar antes de produzir qualquer classificação de risco.

1. **Os fatos essenciais do caso** e o estágio processual (fase de conhecimento, instrução já
   concluída, aguardando julgamento, em grau de recurso, execução).
2. **A prova disponível para cada lado**, e não só a do cliente: documental, testemunhal já
   colhida ou a colher, pericial produzida ou pendente. Avaliação de risco que enxerga só a prova
   do próprio cliente produz otimismo artificial.
3. **A tese jurídica de cada lado**, ainda que em esboço — o fundamento que o cliente invoca e o
   fundamento que a parte contrária invoca ou invocaria.
4. **O valor em jogo**: valor da causa, valor estimado de eventual condenação, e se há pedidos
   cumulados com exposições distintas.
5. **Histórico relevante**, se houver: decisões já proferidas no próprio processo (mesmo que
   interlocutórias), resultado de fases anteriores, tentativa de acordo já frustrada.

Se a avaliação for pedida sobre caso que ainda não é da casa — devida diligência para cliente
que está decidindo contratar, avaliação prévia de carteira de processos de empresa que está
avaliando contratar o escritório — a skill `conflict-check` roda **antes**. Uma análise de risco
processual é, ela mesma, informação estratégica sobre a disputa; produzi-la sobre um caso que
talvez não possa ser aceito contamina exatamente o que o conflito de interesses protege.

## Passo 1 — Mapeamento fático e probatório

Antes de qualquer juízo sobre direito, avalie a prova pelo que ela é, não pelo que se gostaria
que ela fosse:

- Quem tem o **ônus da prova** de cada fato controvertido, pela regra geral e por eventual
  inversão (consumerista, ou por decisão de distribuição dinâmica já proferida no processo).
- Para cada fato relevante: a prova existe, é suficiente, e resiste à contraprova que a parte
  contrária pode produzir? Documento sem data certa, testemunha única e interessada, perícia
  ainda não realizada — cada um desses pesa diferente na força da prova.
- O que **falta provar** e se ainda há oportunidade processual de produzir essa prova. Um caso
  fraco por falta de prova ainda não produzida é diferente de um caso fraco por prova já
  produzida e desfavorável — o primeiro é risco mitigável, o segundo não.

## Passo 2 — Mapeamento jurídico

Monte o mapa de teses dos dois lados, com o mesmo rigor que a skill `pesquisa-jurisprudencia`
exige para qualquer citação: nenhuma jurisprudência, súmula, precedente vinculante ou não entra
nesta análise sem ter passado pela validação dupla — sítio oficial do tribunal **e** uma fonte
secundária confiável (Conjur, Migalhas, Jusbrasil). Delegue o roteiro de busca e validação a essa
skill em vez de citar de memória. Quando não for possível validar, não cite o precedente: descreva a tese sem número e
sinalize isso explicitamente — uma avaliação de risco fundamentada em precedente inexistente é
pior do que nenhuma.

Ao montar o mapa, verifique **antes** de concluir se há entendimento dominante contrário à tese
do cliente, não depois. Um caso que parece forte porque só se pesquisou a favor está mal avaliado
por desenho, não por azar.

## Passo 3 — Exposição financeira

Sem inventar um valor final único e certo, mapeie os componentes da exposição:

- **Valor principal** em discussão, e se há pedidos cumulados com valores somáveis ou
  alternativos.
- **Honorários de sucumbência** — a faixa usual praticada, sem afirmar o percentual exato como
  certo antes do julgamento; se a base de cálculo será o valor da condenação, o valor da causa
  atualizado, ou apreciação equitativa, e como isso muda a exposição.
- **Custas processuais** e o efeito da gratuidade de justiça, se deferida a qualquer das partes.
- **Correção monetária e juros** desde quando incidem, e o efeito do tempo de tramitação sobre o
  valor final — processo que se arrasta por anos frequentemente aumenta a exposição mais do que
  o mérito em si.
- **Multas e astreintes** eventualmente já fixadas ou prováveis, e litigância de má-fé, se houver
  indício concreto de risco disso.
- **Custo de oportunidade** do tempo e do capital imobilizado durante a tramitação, quando
  relevante para a decisão de transigir.

Apresente sempre uma **faixa**, nunca um valor pontual apresentado como certeza — "entre X e Y,
a depender de A e B" é honesto; um único número final não é.

## Passo 4 — Cenários

Este é o substituto do percentual falso. Em vez de um número, construa cenários nomeados:

- **Cenário favorável** — o que precisa se confirmar para o cliente vencer integralmente, e o
  que isso resultaria em termos de valor e prazo.
- **Cenário parcialmente favorável** — o recorte mais provável de vitória parcial, e por qual
  pedido ou capítulo.
- **Cenário desfavorável** — o que precisa se confirmar para o cliente perder, e a exposição
  correspondente.

Para cada cenário, diga **o fator que desloca** de um para outro: a prova que ainda falta
produzir, a tese que pode não prevalecer, a divergência jurisprudencial identificada no passo 2.
É esse fator — não um número — que orienta a decisão do cliente, porque ele diz onde agir para
mudar o resultado provável.

## Passo 5 — Fatores de agravamento e de mitigação

Liste separadamente o que pode piorar o caso (prova nova da contraparte, mudança de entendimento
em curso, prazo próximo de precluir sem que a prova tenha sido produzida) e o que pode melhorar
(produção de prova ainda pendente e favorável, possibilidade real de acordo, distinção do
precedente contrário). Esta seção é o que transforma a avaliação de retrato estático em
instrumento de decisão: ela diz o que fazer, não só o que esperar.

## Classificação do resultado

Encerre sempre em uma das quatro, nomeada com essa palavra, e nunca em percentual:

**Risco baixo.** Prova favorável e consistente, tese amparada por entendimento dominante
validado, exposição financeira limitada. O que fazer: seguir a estratégia em curso, sem
provisionamento relevante ou com provisionamento mínimo.

**Risco moderado.** Elementos mistos — prova razoável mas não decisiva, tese com alguma
divergência, ou exposição financeira significativa mesmo com boa chance de êxito. O que fazer:
monitorar, considerar provisionamento parcial, avaliar acordo se a exposição for alta.

**Risco alto.** Prova desfavorável ou insuficiente, tese contrária ao entendimento dominante
validado, ou exposição financeira elevada. O que fazer: provisionar como obrigação provável,
buscar acordo, ou reavaliar a viabilidade de manter a disputa.

**Risco indeterminado.** Faltam insumos essenciais do passo de parada obrigatória, ou a
divergência jurisprudencial não pôde ser resolvida com o que havia disponível. O que fazer: dizer
exatamente o que falta para a classificação evoluir, e nunca tratar o indeterminado como
sinônimo de baixo.

## Formato da saída

**Regra da casa nº 2: resposta objetiva e informativa, fundamentação precisa, sem formatação
excessiva.** Seis blocos curtos:

1. Classificação, em uma palavra: baixo, moderado, alto ou indeterminado.
2. O que a sustenta — prova, tese e o que foi validado.
3. Faixa de exposição financeira, com os componentes que a formam.
4. Os três cenários, com o fator que desloca de um para outro.
5. Fatores de agravamento e de mitigação.
6. O que ficou fora do alcance desta avaliação.

## As quatro regras da casa, aplicadas aqui

**Regra nº 1 — validação dupla.** Nenhuma jurisprudência, súmula ou precedente citado no
mapeamento jurídico entra sem ter passado por sítio oficial do tribunal **e** fonte secundária
confiável (Conjur, Migalhas, Jusbrasil); sem as duas, descreve-se a tese sem número, com a
lacuna sinalizada explicitamente. O roteiro é da skill `pesquisa-jurisprudencia`.

**Regra nº 2 — objetividade.** Já é o núcleo desta skill: risco em qualitativo justificado, não
em número que finge precisão que não existe.

**Regra nº 3 — conflict check antes de aceitar caso novo.** Avaliação de risco pedida sobre caso
que ainda não é da casa — due diligence prévia, avaliação de carteira para decidir contratação —
espera a skill `conflict-check` concluir antes de qualquer análise de mérito.

**Regra nº 4 — Provimento 205/2021.** Estatística de acerto do escritório, "índice de vitórias" ou
qualquer número derivado desta análise não vira material de divulgação, propaganda comparativa ou
promessa de resultado a futuros clientes — essa vedação é justamente um dos eixos centrais do
Provimento 205/2021. Qualquer peça que pretenda usar um resultado ou uma taxa de êxito passa
antes pela skill `etica-oab-publicidade`.

## O que esta skill não faz

Não produz percentual numérico de chance de êxito. Não substitui parecer jurídico formal quando
o cliente exigir um documento assinado com essa formalidade. Não decide sozinho se o caso deve
ser transigido, recorrido ou mantido — isso é do advogado responsável, com o cliente. Não é
modelo de jurimetria com base estatística própria: quando o escritório dispuser de uma ferramenta
assim, com amostra e metodologia reais, use-a e diga a amostra e a metodologia — nunca apresente
impressão qualitativa como se fosse saída de um modelo estatístico.
