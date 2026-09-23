---
name: analise-sentenca
description: >
  Leitura estruturada de sentença, decisão interlocutória ou acórdão para extrair o que o
  advogado precisa para decidir o recurso: o dispositivo separado da fundamentação, o que foi
  acolhido e o que foi rejeitado em cada pedido, o fundamento central de cada capítulo da
  decisão, a sucumbência (custas, honorários, gratuidade), a contagem do prazo recursal a partir
  da intimação, e o mapa de pontos atacáveis com o meio recursal cabível para cada um. Use SEMPRE
  que uma sentença, decisão interlocutória, acórdão ou decisão monocrática chegar para leitura
  antes de decidir se recorre, montar a estratégia recursal, elaborar embargos de declaração,
  calcular prazo, ou quando o advogado pedir "resume essa decisão" ou "o que dá pra atacar aqui".
---

# Análise de sentença — o que o advogado precisa para decidir o recurso

Esta skill não escreve o recurso. Ela lê a decisão inteira e devolve, organizado, o material sem
o qual nenhuma decisão de recorrer é segura: o que foi decidido, com que fundamento, quem paga o
quê, até quando dá para reagir e por qual via. O erro que esta skill existe para evitar não é
estilístico — é o capítulo da sentença que ninguém notou que existia, porque a leitura parou no
dispositivo final e não abriu cada pedido separadamente. Capítulo não impugnado transita em
julgado sozinho, ainda que o resto da sentença seja recorrido.

## Gatilhos — quando rodar

- Sentença, decisão interlocutória, acórdão ou decisão monocrática recém-publicada, para decidir
  se e como recorrer.
- Pedido de parecer sobre viabilidade recursal vindo de quem já é cliente ou de quem ainda não é
  — inclusive quem chega pedindo segunda opinião sobre decisão obtida com outro patrono.
- Preparação de embargos de declaração, quando a decisão tiver ponto omisso, contraditório ou
  obscuro que precise ser isolado antes de redigir.
- Cálculo do prazo para o próximo ato processual a partir de uma decisão recém-publicada.
- Pedido direto do tipo "resume essa decisão", "o que dá pra atacar aqui" ou "fomos vencidos em
  quê".

## Parada obrigatória: sem os insumos abaixo, a leitura não substitui a decisão do advogado

O trabalho começa quando estes itens estiverem disponíveis. Faltando qualquer um, a resposta é
uma só: liste o que falta, peça, e pare. Um resumo feito sobre parte da decisão, ou sem a data
de intimação, é mais perigoso que nenhum resumo, porque o advogado vai tratá-lo como base para
contar prazo.

1. **O texto integral da decisão**, não um resumo de terceiro nem só a ementa (quando houver).
   Fundamentação e dispositivo precisam estar completos — uma decisão cortada no meio esconde
   exatamente o capítulo que pode ter sido perdido.
2. **A data de publicação ou de intimação** de cada parte, e o meio (diário oficial, intimação
   pessoal, carta, mandado). Sem essa data, esta skill não conta prazo nenhum — ela diz que o
   prazo não pôde ser calculado e por quê.
3. **Qual polo o cliente ocupa** em cada pedido da ação, porque numa sentença com pedidos
   cumulados o cliente pode ser vencedor num capítulo e vencido em outro, e a leitura de "o que
   nos interessa atacar" muda pedido a pedido.
4. **O estágio do processo**: se já houve recurso anterior, se há prazo em curso, se a decisão é
   de primeiro grau, de tribunal ou monocrática de relator — o meio recursal cabível depende
   disso.

Se a decisão chegar de quem ainda não é cliente da casa — pedido de segunda opinião, caso
transferido de outro patrono, consulta avulsa sobre viabilidade de recurso — a skill
`conflict-check` roda **antes** de qualquer leitura de mérito. Ler a sentença e formar
convicção sobre a tese de quem está do outro lado é exatamente o tipo de informação que o
conflito de interesses protege.

## Passo 1 — Separar dispositivo de fundamentação, pedido por pedido

O dispositivo é a parte que produz efeito; a fundamentação é o raciocínio que sustenta cada
trecho dele. Comece isolando o dispositivo inteiro, depois volte à petição inicial (ou à
denúncia, ou ao requerimento administrativo) e liste **cada pedido** formulado. Para cada um,
diga:

- se foi **julgado procedente**, **improcedente**, **parcialmente procedente** ou **extinto sem
  resolução de mérito** (e por qual causa: ilegitimidade, falta de interesse, prescrição,
  decadência, coisa julgada, litispendência);
- se houve **decisão implícita** — pedido que a fundamentação trata mas o dispositivo não nomeia
  expressamente, o que é, em si, um ponto atacável por omissão;
- se a sentença decidiu algo **além ou fora do pedido** (extra ou ultra petita), o que também é
  ponto atacável.

Uma sentença com um só pedido ainda se beneficia deste passo, porque o pedido único costuma vir
acompanhado de pedidos acessórios (juros, correção, honorários, tutela de urgência confirmada ou
revogada) que têm o próprio destino e a própria via de impugnação.

## Passo 2 — O fundamento de cada capítulo

Capítulo de sentença é decisão autônoma para fins recursais: pode transitar em julgado sozinho se
não for impugnado, mesmo que o resto da sentença seja recorrido. Para cada capítulo identificado
no passo 1, diga:

- **O fundamento central** — é uma questão de fato (a prova não convenceu, o fato não foi
  provado), de direito (a tese jurídica foi rejeitada) ou mista;
- **A robustez da motivação** — a decisão enfrentou os argumentos e as provas de ambos os lados,
  ou usou fundamentação genérica, remissiva ou padronizada? Fundamentação frágil, per relationem
  sem análise própria, ou que ignora prova relevante já produzida é, ela mesma, vício atacável
  (nulidade por falta de fundamentação, ou omissão a ser sanada por embargos de declaração antes
  do recurso de mérito);
- **O que a decisão presumiu sem provar** — presunção não fundamentada é ponto de ataque
  diferente de fundamentação que enfrentou a prova e decidiu contra o cliente: o segundo caso
  pede reversão de mérito, o primeiro pede nulidade ou reforma por vício de julgamento.

Não misture os capítulos na análise. Um capítulo bem fundamentado e outro capítulo com
fundamentação genérica, dentro da mesma sentença, pedem estratégias recursais diferentes — e
essa diferença só aparece quando o capítulo é lido isoladamente.

## Passo 3 — Sucumbência

Leia a sucumbência separada do mérito, porque ela tem lógica própria e prazo próprio de
impugnação (inclusive por embargos de declaração, quando for omissa). Reporte:

- quem paga **custas processuais** e em que proporção, se houve sucumbência recíproca e se a
  proporção está justificada pela extensão do que cada parte perdeu;
- os **honorários de sucumbência**: base de cálculo (valor da condenação, valor atualizado da
  causa, ou apreciação equitativa) e o percentual ou valor fixado; se a base de cálculo escolhida
  é a correta para o tipo de decisão (uma decisão sem condenação líquida, por exemplo, pede
  fundamento diferente do percentual sobre condenação);
- se há **gratuidade de justiça** deferida, o que suspende a exigibilidade da sucumbência para
  quem a tem, e se essa suspensão foi corretamente aplicada;
- se a decisão já antecipa **honorários recursais**, ou se sinaliza a possibilidade de majoração
  em grau recursal — informação relevante para o cálculo de exposição financeira de recorrer.

Sucumbência mal calculada — proporção que não bate com o resultado do mérito, base de cálculo
incompatível com o tipo de condenação — é, ela mesma, capítulo atacável, independente do mérito
principal.

## Passo 4 — Prazo

Com a data de publicação/intimação em mãos, monte a contagem do prazo para o próximo ato,
considerando: início da contagem a partir da intimação (não da data da decisão), contagem em dias
úteis quando aplicável, suspensão de prazo em período de recesso ou suspensão processual em
curso, e a interrupção do prazo pela oposição de embargos de declaração.

**A data final nunca sai sozinha, e nunca sai como prazo já contado e fechado.** Ela vem sempre
acompanhada de duas coisas: o **prazo em dias** usado para chegar a ela, e a **origem** desse
número — se foi conferido nesta análise contra o dispositivo aplicável ao tipo de decisão e ao
rito do processo, ou se é o prazo geral do tipo de recurso, ainda sem essa conferência específica.
Não afirme o número de dias de memória como se fosse fato assentado: o prazo recursal varia por
tipo de decisão, por rito e por eventual norma especial que reduza ou amplie a regra geral, e um
número errado aqui produz perda de prazo — o único erro desta lista que não tem conserto depois, e
que responde na esfera disciplinar e civil.

Por isso, apresente a data sempre nesta forma condicional, nunca como certeza isolada: "a partir
da intimação em [data], usando o prazo de [N] dias [conferido nesta análise / ainda não conferido
no processo concreto], o prazo se encerraria em [data] — confirme o número de dias e a contagem no
processo antes de tomar essa data como definitiva". Essa condicional viaja junto com a data em
todo lugar em que a data aparecer, inclusive no bloco de saída — nunca fica só na prosa deste
passo.

Se a data de publicação ou intimação não constar do que foi fornecido, **não estime nem a data
nem o prazo em dias**. Diga que o prazo não pôde ser calculado por falta desse dado e peça a
certidão ou a tela de intimação do processo.

## Passo 5 — Mapa de pontos atacáveis e meio recursal cabível

Para cada capítulo desfavorável identificado nos passos 1 e 2, monte uma linha com: o capítulo,
o vício ou o motivo do ataque (error in judicando quando é reforma de mérito; error in procedendo
quando é nulidade; omissão, contradição, obscuridade ou erro material quando é caso de embargos
de declaração antes de qualquer outro recurso), e o meio recursal cabível considerando o tipo de
decisão (sentença, decisão interlocutória, acórdão, decisão monocrática de relator) e o estágio
do processo. Trate o cabimento pelo tipo de decisão e pela fase processual, sem afirmar prazo em
dias corridos de memória — quando a exatidão do número de dias ou do dispositivo legal aplicável
depender de conferência, diga que o número deve ser confirmado antes de protocolar, em vez de
apresentá-lo como certo.

Distinga expressamente **cabimento** de **chance de êxito**: esta skill mapeia o que pode ser
atacado e por qual via. Se o pedido for também sobre a probabilidade de reforma, sobre exposição
financeira de recorrer ou sobre cenários de resultado, isso é avaliação de risco processual — a
skill `analise-risco-processual` é quem faz essa parte, e deve ser chamada em seguida, nunca
misturada aqui como se fosse a mesma coisa.

## Formato da saída

**Regra da casa nº 2: resposta objetiva e informativa, fundamentação precisa, sem formatação
excessiva.** Seis blocos curtos, nesta ordem, sem repetir o texto da decisão:

1. Resultado geral em uma linha: decisão integralmente favorável, parcialmente favorável ou
   integralmente desfavorável ao cliente, e em que polo.
2. Dispositivo por pedido — o que foi acolhido, o que foi rejeitado, o que ficou implícito ou
   extra/ultra petita.
3. Fundamento de cada capítulo desfavorável e a robustez da motivação.
4. Sucumbência — quem paga o quê, e qualquer inconsistência encontrada.
5. Prazo — o marco (data e meio da intimação), o prazo em dias e a origem dele (conferido nesta
   análise ou ainda não conferido), a data resultante apresentada como condicionada a essa
   conferência, e se algum dado necessário faltou.
6. Mapa de pontos atacáveis com o meio recursal cabível para cada um, e o aviso de que a chance
   de êxito é matéria da skill de análise de risco processual.

## As quatro regras da casa, aplicadas aqui

**Regra nº 1 — validação dupla.** Se esta análise mencionar súmula, tese de repetitivo,
precedente vinculante ou não, ou entendimento consolidado para qualificar um capítulo como
provável de reforma, essa citação passa pela validação dupla: sítio oficial do tribunal **e**
uma fonte secundária confiável (Conjur, Migalhas, Jusbrasil). Sem as duas, não cite — descreva a
tese sem número e diga, com todas as letras, que o precedente não foi confirmado nesta consulta.
O roteiro de pesquisa e validação é da skill `pesquisa-jurisprudencia`; delegue a ela em vez de
citar de memória.

**Regra nº 2 — objetividade.** Já aplicada na seção de formato acima: resposta objetiva e
informativa, com fundamentação precisa, sem formatação excessiva. Nada de tabela decorativa nem
de repetir o inteiro teor da decisão em vez de resumir o que importa.

**Regra nº 3 — conflict check antes de aceitar caso novo.** Sentença trazida por quem ainda não
é cliente da casa — segunda opinião, caso migrando de outro escritório, consulta avulsa — só é
lida depois que a skill `conflict-check` concluir. Formar convicção sobre o mérito de um caso
antes de saber se ele pode ser aceito é o mesmo problema que o teste de informação privilegiada
existe para prevenir.

**Regra nº 4 — Provimento 205/2021.** Sentença favorável, valor de condenação alto, ou vitória em
tese inédita não viram print, "case de sucesso" ou depoimento para rede social, site ou qualquer
outro material de captação de clientela — ainda que anonimizados. Qualquer peça de divulgação
que se queira construir a partir de um resultado obtido aqui passa antes pela skill
`etica-oab-publicidade`, sob o Provimento 205/2021.

## O que esta skill não faz

Não decide se vale a pena recorrer — isso pesa custo, risco e estratégia, e é decisão do
advogado responsável. Não redige o recurso nem os embargos de declaração. Não calcula prazo com
certeza absoluta quando falta a data de intimação: nesse caso, diz que falta. Não avalia
probabilidade de êxito nem exposição financeira — isso é a skill `analise-risco-processual`. E
não presume o nome do escritório, a área de atuação ou o cliente: esses dados, quando
necessários para o parecer, vêm do Lúmen, nunca de suposição.
