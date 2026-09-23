---
name: conteudo-autoridade
description: >
  Produz posts e roteiros educativos que posicionam o advogado como referência técnica na área de
  atuação do escritório — conteúdo que informa, não que vende — e roda a checagem de conformidade
  antes de qualquer peça ser entregue como pronta para publicar. Use SEMPRE que o advogado pedir um
  post educativo, um roteiro para vídeo curto, um texto de blog sobre um tema jurídico, uma
  sequência de conteúdo para redes sociais, ou "algo que mostre que a gente entende desse assunto".
  Esta skill não conhece a área de atuação nem o nome do escritório contratante — ela consulta o
  Lúmen para saber isso antes de escrever qualquer linha, porque o conteúdo fala da atuação de quem
  contratou, não de um escritório genérico. Nenhuma peça sai desta skill sem passar, depois, pela
  skill `etica-oab-publicidade`: autoridade se constrói com conteúdo que resiste à checagem, não
  com conteúdo publicado antes dela.
---

# Conteúdo de autoridade — posicionar sem vender, e sem publicar sem checagem

Posicionar um advogado como referência é, por definição, uma atividade que fica ao lado da
publicidade regulada o tempo inteiro — e é exatamente por isso que esta é uma das quatro skills
desta entrega em que a fronteira entre "conteúdo educativo" e "anúncio de serviço" decide se a peça
pode existir. O conteúdo que constrói autoridade de verdade é aquele que ensina algo que qualquer
pessoa entenderia melhor depois de ler, esteja ela com um problema jurídico concreto ou não; o
conteúdo que capta clientela se disfarça de educativo mas só faz sentido para quem já tem o
problema e é dirigido a essas pessoas. Esta skill produz o primeiro tipo, e roda o segundo teste —
o da `etica-oab-publicidade` — antes de qualquer peça sair como pronta.

## Gatilhos — quando rodar

- Pedido de post educativo para rede social, blog do escritório ou canal de conteúdo.
- Roteiro de vídeo curto, reels ou carrossel sobre tema jurídico.
- Planejamento de calendário de conteúdo por período.
- Pedido para "explicar" um tema jurídico de forma acessível ao público em geral.

## Parada obrigatória: sem os quatro itens, nenhuma linha é escrita

O trabalho começa quando estes quatro itens estiverem preenchidos. Faltando qualquer um, liste o
que falta, peça, e pare:

1. **O tema jurídico a abordar**, específico o bastante para produzir conteúdo preciso — "direito do
   consumidor" não é tema, "o que fazer quando um produto chega com defeito depois do prazo de
   garantia" é.
2. **A área de atuação do escritório contratante, consultada no Lúmen.** Esta skill não presume, a
   partir do nome do escritório ou de qualquer outra pista, quais são as áreas em que ele atua —
   isso vem exclusivamente da consulta à ferramenta `consultar_perfil_do_escritorio`. Se o Lúmen não
   tiver essa informação cadastrada, diga isso ao advogado em vez de inferir a área pelo tema pedido,
   e pergunte se a área do tema corresponde à atuação real do escritório antes de escrever qualquer
   coisa.
3. **O formato de destino** — post de rede social, carrossel, roteiro de vídeo, texto de blog,
   e-mail informativo — porque o checklist de conformidade por suporte da `etica-oab-publicidade`
   muda conforme o formato, e um conteúdo pensado para blog não se comporta igual num roteiro de
   vídeo curto.
4. **Se o pedido nasceu de um caso real do escritório**, mesmo vitorioso e mesmo que o advogado
   queira contar "só a parte boa". Se a resposta for sim, o tema segue adiante de forma
   generalizada e o caso concreto não aparece em nenhuma linha do conteúdo, nem anonimizado — o
   ponto de partida não vira material da peça.

## Passo 1 — Escolher o tema pelo teste da finalidade

Antes de escrever, aplique o mesmo teste que a `etica-oab-publicidade` usa para distinguir
informação de captação: o conteúdo funciona igual para quem não tem problema jurídico nenhum? Um
tema como "como funciona o prazo de resposta a uma notificação extrajudicial" serve a qualquer
pessoa curiosa sobre o assunto; um tema como "você recebeu uma notificação do banco X e não sabe o
que fazer — fale com a gente agora" só faz sentido, e é dirigido a, quem já tem o problema. Prefira
temas evergreen — o que é, como funciona, diferença entre dois institutos, erro comum, prazo
importante explicado em termos gerais — a temas amarrados a um evento ou notícia específica que
sinalize quem foi atingido por ele.

## Passo 2 — Estrutura do conteúdo

Monte a peça com título informativo (não apelativo), explicação em linguagem acessível do tema
escolhido, e um convite final genérico à orientação jurídica — "procure orientação profissional
para o seu caso específico" é aceitável; "chama no direct que resolvemos seu caso agora" não é,
porque deixa de ser convite genérico e passa a ser abordagem dirigida a quem tem a situação descrita
no post. Não inclua valor, faixa de preço, promessa de resultado, prazo de solução, índice de
sucesso, comparação com outros profissionais ou ostentação de qualquer tipo — cada um desses
elementos reprova sozinho na checagem que vem no passo 4, e é mais barato não escrevê-los do que
tirá-los depois.

## Passo 3 — Jurisprudência e legislação dentro do conteúdo

Quando o tema exigir menção a entendimento de tribunal, súmula ou precedente para ficar preciso,
essa citação segue a regra de validação dupla: sítio oficial do tribunal competente e fonte
secundária confiável (Conjur, Migalhas, Jusbrasil). Sem as duas, **não cite** — explique a tese sem
o número do precedente, e delegue o roteiro completo à skill `pesquisa-jurisprudencia`. Conteúdo de
autoridade que erra um número de precedente é o oposto do que promete: em vez de demonstrar domínio
do assunto, expõe o próprio erro para quem tiver conhecimento de causa para perceber.

## Passo 4 — Checagem de conformidade obrigatória, antes de qualquer entrega como "pronto"

Todo rascunho produzido por esta skill passa pela skill `etica-oab-publicidade`, usando o
checklist do suporte identificado na parada obrigatória (rede social, site, anúncio ou material
impresso), antes de ser entregue ao advogado como pronto para publicar. O resultado dessa checagem
— apto, precisa de ajustes ou reprovado — acompanha o conteúdo entregue: um rascunho "precisa de
ajustes" volta com a redação substituta já incorporada; um rascunho "reprovado" não é entregue como
conteúdo pronto, e sim como explicação do motivo e sugestão do caminho legítimo equivalente.
Nenhuma peça desta skill é apresentada como "pronta para publicar" sem essa classificação anexada.

## Passo 5 — Consistência sem autoengrandecimento

Construir autoridade é trabalho de repetição e precisão ao longo do tempo, não de um post
excepcional. O risco mais comum quando o volume de conteúdo cresce é a deriva para
autoengrandecimento: "somos referência em...", contagem de casos ganhos, comparação implícita com
outros profissionais, ou uso de título de especialista sem a certificação correspondente. Cada um
desses elementos é vedado independentemente da frequência com que aparece, e um calendário de
conteúdo revisado apenas pelo volume de publicações, sem reler cada peça pelo checklist, é como esse
tipo de desvio entra sem ser percebido.

## Formato da saída

**Regra da casa nº 2: resposta objetiva e informativa, fundamentação precisa, sem formatação
excessiva.** Quatro blocos, nesta ordem:

1. Confirmação da área de atuação consultada no Lúmen e do tema escolhido, com o resultado do teste
   de finalidade do passo 1.
2. O rascunho do conteúdo, no formato de destino pedido, sem menção a caso concreto, valor ou
   promessa.
3. As citações de jurisprudência ou legislação usadas, com a marca de dupla conferência feita ou
   "não confirmado nesta consulta".
4. A classificação obtida na checagem da `etica-oab-publicidade` — apto, precisa de ajustes (com os
   ajustes já incorporados) ou reprovado (com o motivo e o caminho legítimo equivalente) — e a frase
   de que a decisão final de publicar é do advogado responsável.

## As quatro regras da casa, aplicadas aqui

**Regra nº 1 — validação dupla.** Tratada no passo 3: nenhuma jurisprudência, súmula ou precedente
entra no conteúdo sem sítio oficial do tribunal competente e fonte secundária confiável (Conjur,
Migalhas, Jusbrasil). Sem as duas, **não cite** — a tese aparece sem número, e o roteiro completo
fica com a skill `pesquisa-jurisprudencia`.

**Regra nº 2 — objetividade.** Aplicada no formato da saída acima, e no próprio conteúdo produzido,
que informa sem adjetivo de venda e sem formatação chamativa de anúncio de varejo.

**Regra nº 3 — conflict check antes de aceitar caso novo.** Conteúdo de autoridade bem-sucedido gera
comentário e mensagem privada de quem se identifica com o tema — cada um desses contatos é um
interessado novo, e nenhum deles avança para conversa de caso, qualificação financeira ou proposta
sem passar primeiro pelo `conflict-check`, exatamente como qualquer outro caso novo que chega por
qualquer canal.

**Regra nº 4 — Provimento 205/2021.** É o eixo desta skill inteira, não uma etapa entre outras:
nenhum conteúdo produzido aqui é publicado, agendado ou entregue como definitivo antes de passar
pela `etica-oab-publicidade` e receber a classificação "apto". O tema escolhido, a linguagem, a
ausência de valor e de promessa, e a vedação de usar caso concreto — tudo isso é a aplicação
concreta do provimento a este tipo de conteúdo, e a checagem final não é formalidade: é o que
decide se a peça sai do escritório.

## O que esta skill não faz

Não publica nem agenda publicação — entrega o conteúdo e o resultado da checagem para o advogado
decidir. Não substitui nem dispensa a checagem da `etica-oab-publicidade`, mesmo quando o próprio
tema parece obviamente seguro. Não escreve parecer jurídico completo nem peça processual — o
formato é sempre educativo e curto, proporcional ao suporte de destino. Não usa caso concreto do
escritório, mesmo anonimizado, como ponto de partida do conteúdo. E não presume a área de atuação,
o nome ou o posicionamento do escritório contratante: esses dados vêm do Lúmen, consultados pela
ferramenta `consultar_perfil_do_escritorio`, e esta skill diz explicitamente que consultou antes de
escrever qualquer linha sobre a atuação de quem contratou.
