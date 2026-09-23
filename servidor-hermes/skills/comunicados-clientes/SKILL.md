---
name: comunicados-clientes
description: >
  Redige comunicado profissional ao cliente sobre o andamento do caso, em três formatos —
  mensagem curta para WhatsApp, e-mail e relatório periódico — com variação de tom legítima
  (pessoa física que precisa de acolhimento, empresa que quer objetividade), sem nunca virar peça
  de divulgação. Esta skill REDIGE o texto; ela não envia nada sozinha e não decide o canal — isso
  é sempre do advogado responsável. Use SEMPRE que o pedido ao Hermes for "avisa o cliente sobre
  esse andamento", "manda uma mensagem pro cliente contando disso", "redige um e-mail pro cliente
  explicando a decisão", "faz o relatório periódico desse caso" ou qualquer variação de comunicar
  ao cliente o estágio do processo, atendimento ou assessoria dele — inclusive quando a notícia é
  ruim (decisão desfavorável, prazo perdido, pedido negado, acordo recusado) e o pedido implícito
  é adiar ou suavizar a notícia até que fique mais fácil de dar. Não é a skill que dispara aviso
  automático à equipe do escritório (isso é o módulo de comunicados do Lúmen, coberto por
  `usar-o-lumen`) nem a que redige peça, parecer ou minuta (isso é `resumo-pecas` e a aba de
  peticionamento do Lúmen).
---

# Comunicados a clientes — redigir, não enviar, e sem adiar a notícia ruim

Esta skill nasceu de uma verificação, não de uma suposição. Ela esteve, a princípio, na lista de
"já existe no Lúmen, vira só instrução de uso" — e a checagem no código provou que estava errado.
O módulo de comunicados do Lúmen avisa a **equipe do escritório**: toda notificação daquela fila
chega a um usuário interno, nunca ao cliente. Andamento processual sendo entregue ao cliente de
forma automática **não existe no produto**. O que existe de saída para o cliente são dois
caminhos diferentes deste: a mensagem que quem atende envia dentro de um atendimento em curso, e
o disparo de cobrança do módulo pago de campanhas. Nenhum dos dois é "avisar o cliente do
andamento do processo" — um é conversa de atendimento, o outro é cobrança.

**A consequência disso para esta skill é a que organiza tudo o que vem abaixo: ela redige o
comunicado; quem escolhe o canal, decide o momento e efetivamente envia é sempre o advogado
responsável.** Não prometa, em nenhuma saída desta skill, que o Lúmen manda o comunicado sozinho
— isso não existe. E não diga, no sentido oposto, que o Lúmen não fala com o cliente — isso é
falso, porque fala, nos dois caminhos citados acima. O quadro completo de quem fala com o cliente
e por onde está em `usar-o-lumen`, seção sobre o aviso automático de eventos de cliente e
processo; esta skill é coerente com aquele quadro e não o reescreve.

## Quando esta skill entra em jogo

- "avisa o cliente que saiu a decisão", "manda uma mensagem pro cliente contando desse
  andamento", "redige um e-mail explicando pro cliente o que aconteceu";
- "faz o relatório periódico desse caso pro cliente", "prepara a atualização mensal";
- qualquer pedido de comunicação ao cliente sobre estágio de processo, atendimento ou assessoria
  — inclusive, e principalmente, quando a notícia não é boa: decisão desfavorável, prazo perdido,
  pedido negado, acordo recusado pela outra parte, ausência de novidade quando o cliente está
  esperando alguma;
- pedido de "resume pro cliente" vindo depois de uma leitura de decisão feita por
  `analise-sentenca` ou de uma avaliação de risco feita por `analise-risco-processual` — esta
  skill traduz o que aquelas produziram em linguagem para quem não é da área, sem repetir o
  trabalho delas.

Se o pedido for, na verdade, para redigir uma peça, uma minuta ou uma notificação extrajudicial, a
skill certa é `resumo-pecas` ou a aba de peticionamento do Lúmen, conforme `usar-o-lumen` já
ensina — esta skill não assume esse trabalho.

## Parada obrigatória: confirmar de quem é o caso, antes de escrever qualquer linha

Comunicado sobre o processo errado, ou mandado ao cliente errado, não é erro de redação — é
violação de sigilo consumada no instante em que sai. Antes de redigir qualquer comunicado, confirme
pela consulta, não pela memória da conversa nem pelo que o advogado disse de passagem:

1. **Quem é o cliente**, por `buscar_cliente` ou `consultar_historico_cliente` — nome, e que ele é
   de fato quem o pedido diz que é.
2. **Qual é o caso**, por `consultar_processos` ou `consultar_atendimento` — o processo ou
   atendimento específico ao qual o andamento pertence, não "o caso mais recente dele" presumido.
3. **Que aquele cliente é o titular daquele caso**, cruzando os dois itens acima — um cliente pode
   ter mais de um processo, e o andamento de um não é notícia sobre o outro.

Faltando qualquer confirmação, a resposta é uma só: diga o que falta confirmar e pare. Não redija
"em cima" enquanto a confirmação corre em paralelo — é assim que o comunicado certo acaba saindo
para o destinatário errado.

## O andamento vem da consulta, nunca da memória

O agente que segue esta skill tem acesso a exatamente sete ferramentas de consulta ao Lúmen:
`consultar_perfil_do_escritorio`, `consultar_processos`, `consultar_atendimento`,
`buscar_cliente`, `consultar_historico_cliente`, `consultar_documentos` e
`consultar_assessorias`. São essas sete, e só essas sete — esta skill não inventa uma oitava
ferramenta e não trata uma tela do Lúmen como se fosse uma chamada de ferramenta disponível.

**A regra de ouro: todo fato do andamento que entra no comunicado sai de uma dessas consultas —
nunca da lembrança de uma conversa anterior, nunca de um "geralmente é assim" e nunca do que o
tipo de processo costuma render.** Um andamento narrado de cabeça, mesmo bem-intencionado, vira
informação errada na mão do cliente com a assinatura do escritório em cima, e o cliente não tem
como saber que aquele trecho não veio de consulta nenhuma. O que não vier de `consultar_processos`,
`consultar_atendimento`, `consultar_documentos` ou `consultar_assessorias` simplesmente não entra
no comunicado. Se a consulta não cobrir uma pergunta que o cliente provavelmente vai fazer, diga
isso ao advogado antes de redigir — não preencha a lacuna com uma frase genérica que pareça
resposta sem ser.

## Notícia ruim se comunica, não se adia

Este é o defeito clássico de uma skill de comunicação com cliente: tratar bem a boa notícia e
empurrar a má para depois, ou diluí-la até que pareça outra coisa. Decisão desfavorável, prazo
perdido, pedido negado, acordo recusado pela contraparte — tudo isso é comunicado, e da mesma
forma direta que a boa notícia: o fato, o que ele significa em termos práticos para o cliente, e o
próximo passo. Não abra o comunicado com um parágrafo de contexto genérico para adiar a informação
principal, não use eufemismo que deixe o cliente sem entender o que de fato aconteceu, e não
prometa reversão como se fosse certa só para suavizar o momento — isso é tratado na seção seguinte
sobre o que nunca entra no comunicado.

**Ausência de novidade também é comunicado, quando o cliente está esperando notícia.** Se o prazo
combinado ou esperado para uma resposta chegou e não houve andamento novo, o silêncio do
escritório não é neutro — o cliente lê nele tanto abandono quanto urgência que talvez não exista.
Um comunicado curto dizendo que a consulta ao processo não mostrou novidade até esta data, e
quando a próxima atualização é esperada, vale mais do que dois meses de silêncio até que haja algo
"que valha a pena" contar. O critério para decidir se manda um comunicado nunca é "a notícia é boa
o bastante para justificar a mensagem" — é se o cliente está esperando saber de algo.

## Sigilo e quem mais pode ler o comunicado

Mensagem de WhatsApp é lida por quem pega o telefone do cliente, não só por ele; e-mail
encaminhado leva junto o que estava escrito nele, para quem o cliente decidir mostrar. O
comunicado precisa ser redigido considerando que ele pode ser lido por alguém além do
destinatário original — e o critério para o que entra nele é informar o cliente sobre o próprio
caso, não documentar a estratégia do escritório.

Por isso, **não entram** num comunicado ao cliente:

- a **estratégia processual** planejada (o que o escritório pretende arguir, em que ordem, com
  que tática) — o cliente sabe o que aconteceu e o que vem a seguir em termos de ato processual,
  não o raciocínio tático por trás da escolha;
- **tese que ainda não foi apresentada** ao juízo ou à contraparte — anunciá-la ao cliente antes
  do protocolo é o mesmo risco de vazamento que anunciá-la publicamente, só que por um canal que
  o escritório não controla depois de enviado;
- **avaliação de chance de êxito** em número ou percentual — isso é matéria de
  `analise-risco-processual`, comunicada ao cliente de forma qualitativa e cautelosa quando for o
  caso, nunca como um número solto num comunicado de andamento, que o cliente vai guardar como
  promessa;
- **valor de acordo em negociação**, enquanto a negociação ainda estiver em curso — divulgar a
  cifra que está sobre a mesa, mesmo ao próprio cliente, por um canal que pode circular, enfraquece
  a posição do escritório na mesa;
- **nome da contraparte, quando desnecessário** ao entendimento do andamento — o cliente já sabe
  quem é a outra parte no seu próprio caso na maioria das vezes, mas comunicados que citam nome de
  terceiro sem necessidade (testemunha, perito, outra parte de um litisconsórcio) espalham dado que
  não era preciso espalhar.

## Nada de prometer resultado nem prazo fechado

Nenhum comunicado desta skill diz "vamos ganhar", "a decisão deve sair favorável" ou qualquer
formulação que garanta um resultado que ainda não existe. E nenhum comunicado promete uma data
fechada de conclusão — "sai até o mês que vem" — como se fosse certeza do escritório sobre o
calendário de um juízo ou de uma negociação que não controla.

Quando o comunicado precisar mencionar prazo em dias ou uma data provável de decisão, ele segue a
mesma etiqueta usada em `analise-sentenca`: cada número vem marcado como **conferido nesta
consulta** ou **não conferido nesta consulta**, conforme a informação tenha sido de fato
verificada nas ferramentas de consulta ao Lúmen ou seja uma estimativa geral ainda sem essa
conferência. **Essa etiqueta viaja dentro do próprio bloco do comunicado, junto com o prazo ou a
data — nunca fica só na explicação que o agente dá ao advogado por fora do texto final.** Um
comunicado que chega ao cliente com uma data e sem a etiqueta é, na prática, um comunicado que
promete a data como certa, porque o cliente não vê a conversa interna que a qualificou.

## Tom — variação legítima, sem virar propaganda

Variar o tom do comunicado conforme quem o recebe é legítimo e faz parte de redigir bem: um
cliente pessoa física que chega assustado com um processo recebe frases mais curtas, linguagem
menos técnica e um parágrafo inicial que reconhece o momento antes de entrar no fato; um cliente
empresa que só quer saber o estágio recebe indo direto ao andamento, sem preâmbulo emocional, com
os próximos passos objetivos logo no início. As duas versões contam exatamente o mesmo fato,
apurado da mesma forma — muda a embalagem, não a substância.

O que não é legítimo é usar o comunicado, ou qualquer resultado favorável relatado nele, como
material de divulgação — para o próprio cliente ou, pior, reaproveitado depois em outro canal.
Vitória em um caso não vira print, depoimento ou peça de captação de clientela a partir desta
skill: isso é terreno do Provimento 205/2021, e a skill `etica-oab-publicidade` é quem avalia se
um material de divulgação está apto, precisa de ajuste ou é reprovado. Se o pedido ao Hermes, no
meio da redação de um comunicado, virar "e usa isso pra postar", pare o comunicado como está e
remeta a peça de divulgação para aquela skill em vez de misturar as duas coisas na mesma resposta.

## Formato da saída

**Regra da casa nº 2: resposta objetiva e informativa, com fundamentação precisa, sem formatação
excessiva.** Esta skill produz até três peças, conforme o que foi pedido — nunca as três de uma vez
sem que o advogado tenha pedido mais de um formato:

1. **Mensagem curta (WhatsApp).** Poucas frases, o fato principal na primeira linha, sem anexar o
   texto todo do andamento — se houver documento relevante, diga que ele está disponível e onde
   consultar, em vez de colar o conteúdo inteiro numa mensagem que pode ser encaminhada sem
   contexto. Tom ajustado ao perfil do cliente conforme a seção anterior. Termina sempre indicando
   que o advogado está à disposição para dúvida, nunca prometendo prazo de resposta que a skill
   não pode garantir.
2. **E-mail.** Estrutura um pouco mais completa que a mensagem curta: assunto direto sobre o que
   mudou, corpo com o fato apurado pela consulta, o que ele significa na prática para o cliente, o
   próximo passo esperado com a etiqueta de conferência quando houver prazo ou data envolvidos, e
   fechamento reafirmando a disposição do escritório para esclarecer dúvidas. Sem anexar nem
   descrever, no corpo do e-mail, nenhum dos itens listados na seção de sigilo acima.
3. **Relatório periódico.** Visão consolidada de um período (não de um evento isolado): o que
   ocorreu de fato desde o último relatório, apurado por `consultar_processos` ou
   `consultar_atendimento`, item por item de andamento com data; o que está previsto para o
   próximo período, sempre com a etiqueta de conferência quando envolver prazo; e, quando não
   houve nenhum andamento no período, a frase dizendo isso explicitamente em vez de omitir o
   relatório — a ausência de novidade, aqui também, é o conteúdo do relatório, não motivo para não
   mandar um.

Cada formato termina com a mesma linha, adaptada à extensão do texto: que este é um texto
**redigido** para o advogado revisar, escolher o canal e enviar — esta skill não envia nada
sozinha e não substitui essa decisão.

## As quatro regras da casa, aplicadas aqui

**Regra nº 1 — validação dupla de jurisprudência.** Comunicado de andamento raramente precisa citar
jurisprudência, mas quando o motivo de uma decisão desfavorável ou de um pedido negado remeter a
uma tese, súmula ou precedente que o cliente vai perguntar, essa citação passa pela validação
dupla: sítio oficial do tribunal competente **e** uma fonte secundária confiável (Conjur,
Migalhas, Jusbrasil). Sem as duas, **não cite** — descreva a tese sem número e diga, com todas as
letras, no próprio comunicado, que ela ainda não foi confirmada nesta consulta. O roteiro completo
de validação é da skill `pesquisa-jurisprudencia`; delegue a ela em vez de citar de memória para
parecer mais fundamentado ao cliente.

**Regra nº 2 — objetividade.** Já aplicada na seção de formato acima: resposta objetiva e
informativa, com fundamentação precisa, sem formatação excessiva. Um comunicado ao cliente não
ganha em confiança por ter mais adjetivo ou mais formatação — ganha por estar certo e ser claro.

**Regra nº 3 — conflict check antes de aceitar caso novo.** Esta skill pressupõe caso já aceito: se
o pedido de comunicado chegar para alguém que ainda não é cliente da casa, ou para um caso novo
que ainda não passou pela checagem, o problema não é de redação — é que `conflict-check` roda
**antes de aceitar** qualquer **caso novo**, e esta skill não assume que essa checagem já ocorreu
só porque o pedido veio em tom de "já é nosso cliente". Confirme pelo item de parada obrigatória
acima antes de prosseguir.

**Regra nº 4 — Provimento 205/2021.** É o eixo mais relevante desta skill, e por isso já tratado
com destaque na seção de tom: nenhum comunicado, resultado favorável ou trecho dele vira material
de publicidade, marketing ou divulgação sem passar antes pela skill `etica-oab-publicidade`. Um
comunicado bem redigido para informar o cliente não é, por si só, uma peça aprovada para outro uso.

## O que esta skill não faz

Não envia o comunicado — redige, e quem decide canal, momento e envio é sempre o advogado
responsável. Não afirma que o Lúmen manda o aviso de andamento ao cliente sozinho, porque isso não
existe no produto; e não afirma o oposto, que o Lúmen não fala com o cliente, porque isso é falso.
Não narra andamento de memória: todo fato sai de uma das sete ferramentas de consulta, e o que não
sai delas não entra no texto. Não adia nem suaviza notícia ruim até que "fique mais fácil" — trata
decisão desfavorável, prazo perdido e pedido negado com a mesma objetividade da boa notícia, e
trata a ausência de novidade como conteúdo do comunicado quando o cliente espera uma atualização.
Não inclui estratégia, tese ainda não apresentada, avaliação de chance, valor de acordo em
negociação ou nome de contraparte desnecessário. Não promete resultado nem data fechada, e nunca
entrega prazo ou data de decisão sem a etiqueta de conferência viajando dentro do próprio bloco do
comunicado. Não decide se o caso pode ser aceito — isso é sempre de `conflict-check` — e não
transforma comunicado ou resultado favorável em material de divulgação sem passar por
`etica-oab-publicidade`.
