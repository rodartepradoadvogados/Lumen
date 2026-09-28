---
name: qualificacao-perfil-financeiro
description: >
  Avalia, de forma não invasiva, a compatibilidade entre a capacidade de pagamento de um
  interessado e os modelos de cobrança que a advocacia pratica — sem consultar base de crédito
  externa sem dizer isso a ele, sem pedir comprovante de renda, extrato bancário, declaração de
  imposto ou levantamento patrimonial, e sem transformar a conversa de honorários em interrogatório
  sobre a vida financeira de quem ainda nem é cliente. O objetivo é alinhar expectativa de
  investimento antes de qualquer proposta sair do escritório, não produzir um dossiê sobre o
  interessado. Use SEMPRE que for preciso entender se um caso comporta o modelo de cobrança
  pretendido, responder "esse interessado consegue pagar", preparar a conversa que antecede a
  proposta de honorários, ou quando o advogado pedir para "qualificar" um interessado antes de
  seguir adiante. Esta skill NUNCA roda antes da skill `conflict-check`: qualificar financeiramente
  quem ainda não é cliente já é dar um passo em direção a aceitar o caso, e esse passo tem ordem.
---

# Qualificação de perfil financeiro — alinhar expectativa, não investigar a vida de ninguém

Esta skill não decide quanto cobrar — isso é trabalho da skill `precificacao-honorarios`, que roda
depois desta. O que esta skill faz é mais estreito e mais delicado ao mesmo tempo: entender, com o
mínimo de perguntas e sem nenhuma invasão, se o caso e o interessado comportam o modelo de cobrança
que o escritório pretende oferecer — fixo, por hora, de êxito, mensal ou misto — antes de a
conversa chegar a um número. O risco que ela existe para evitar tem duas pontas, e as duas custam
caro: propor um modelo que o interessado não tem como sustentar produz inadimplência e desgaste da
relação; e investigar a vida financeira de alguém que só quer saber se vale a pena conversar com um
advogado é o tipo de abordagem que afasta quem procurou o escritório de boa-fé e, levada ao
extremo, se aproxima de mercantilizar a relação antes mesmo de ela começar.

## Gatilhos — quando rodar

- Antes de montar proposta de honorários, quando o modelo de cobrança ainda não está definido.
- Pergunta direta "esse interessado consegue pagar" ou "qual modelo cabe nesse caso".
- Interessado que sinalizou preocupação com custo, ou perguntou preço antes de descrever o caso.
- Preparação da reunião ou conversa que vai anteceder a proposta de honorários.

## Parada obrigatória: sem o conflict check, esta skill não qualifica ninguém

**O conflict check vem antes de qualquer pergunta sobre dinheiro.** Qualificar financeiramente um
interessado é, na prática, avançar a relação com ele — e avançar a relação com quem ainda não é
cliente sem que a skill `conflict-check` tenha concluído é o mesmo erro, com outro nome, que
propor honorários sem checagem. Se o caso é de quem ainda não é cliente e o `conflict-check` não
rodou ou não chegou a um resultado que libere prosseguir, **pare aqui**: diga que o próximo passo é
o conflict check, não a qualificação financeira. Isso vale mesmo que o interessado já tenha
perguntado preço — a pergunta dele não muda a ordem do escritório.

Passado esse ponto, o trabalho segue quando estes três itens estiverem preenchidos. Faltando
qualquer um, liste o que falta, peça, e pare:

1. **A natureza do serviço** — contencioso ou consultivo, pontual ou de acompanhamento contínuo —
   porque isso já elimina modelos incompatíveis antes de qualquer pergunta ao interessado.
2. **O porte aproximado do caso** — pessoa física ou jurídica, e, quando aplicável, se há indicação
   de valor de causa ou proveito econômico envolvido, mesmo que ainda impreciso. Não é necessário
   (nem permitido, nesta skill) pedir o valor exato de patrimônio ou renda — a estimativa vem da
   natureza do caso, não de um número que o interessado declara sobre si mesmo.
3. **Se já existe algum sinal espontâneo de restrição de orçamento** — o interessado mencionou,
   sem ser perguntado, que tem pressa em resolver por custo, que já buscou outro orçamento, ou que
   prefere parcelamento. Sinal espontâneo é dado a considerar; pergunta dirigida para arrancá-lo não
   é o objeto desta skill.

## O que esta skill NUNCA faz — e por quê

**Não inventa método de consulta de crédito.** Esta skill não consulta, não simula consultar e não
orienta o agente a consultar birô de crédito, serviço de proteção ao crédito ou qualquer base
externa sobre a situação financeira do interessado. Se o escritório tiver, por outra via e outra
decisão, uma prática de consulta a base externa sobre alguém, essa prática **não é desta skill** e,
onde quer que exista, **nunca pode ser silenciosa**: consultar dado de alguém sem dizer a ele que
está sendo consultado é o tipo de opacidade que a proteção de dados pessoais não tolera, e que
mina a confiança que o próprio caso depende. Esta skill parte de que a resposta certa, na dúvida
sobre capacidade de pagamento, não é investigar mais — é perguntar menos e alinhar expectativa mais
cedo.

**Não faz pergunta invasiva.** Estão fora do escopo desta skill, e não devem ser perguntados nem
sugeridos como pergunta ao interessado: renda mensal exata, extrato bancário, declaração de imposto
de renda, composição patrimonial, dívidas em aberto, score de crédito, ou qualquer variante dessas
perguntas com palavras diferentes. A linha não é "pergunta desconfortável"; é "pergunta que serve
para investigar a vida financeira da pessoa em vez de servir para alinhar expectativa sobre o
serviço". Um interessado que sente que está sendo investigado antes de decidir se contrata um
advogado tende a se afastar — e tem razão para isso.

**O que é permitido, e como perguntar.** Alinhar expectativa não é sinônimo de não perguntar nada.
As perguntas legítimas desta skill giram em torno do **serviço**, não da **pessoa**: o interessado
tem preferência por pagamento único ou parcelado; há um orçamento de referência que ele já tem em
mente para resolver o assunto; ele já buscou orçamento com outro profissional e quer saber se o
valor considerado é compatível com o que o escritório pratica; o caso comporta acompanhamento longo
(o que aponta para mensalidade) ou é pontual (o que aponta para fixo ou hora técnica). Essas
perguntas informam o modelo de cobrança sem pedir a ninguém que exponha sua vida financeira.

## Passo 1 — Cruzar natureza do caso com os modelos de cobrança

Use a mesma referência de modelos da skill `precificacao-honorarios` — fixo, hora técnica, êxito,
mensal de consultoria, misto — sem repetir aqui o detalhamento de cada um, que pertence àquela
skill. O que esta skill faz é o cruzamento anterior: qual desses modelos é sequer compatível com a
natureza do caso e com o que se sabe, até aqui, sobre o interessado. Um caso pontual de baixa
complexidade não comporta mensalidade; um acompanhamento contínuo não se resolve bem com honorário
fixo único; um caso sem viabilidade de condenação relevante não sustenta honorário de êxito puro.
Esse cruzamento é técnico, não financeiro — e é o que permite entrar na conversa de expectativa já
com uma ou duas opções plausíveis, em vez de uma pergunta aberta sobre quanto a pessoa pode pagar.

## Passo 2 — Alinhar expectativa antes da proposta

Com o cruzamento do passo 1 e os sinais coletados na parada obrigatória, monte a conversa (ou o
roteiro dela) que antecipa, em termos gerais e sem valor fechado, a faixa de modelo que o caso
comporta — "para um caso deste tipo, costumamos trabalhar com honorário fixo ou por hora, dependendo
do volume de trabalho que ele exigir" é uma frase de alinhamento; "quanto você pode pagar por mês"
não é. O valor exato, e a marca de conferência da tabela de honorários mínimos da seccional
aplicável, seguem sendo produzidos pela skill `precificacao-honorarios` — esta skill entrega a ela
o modelo compatível, não o número.

Se o interessado, mesmo depois do alinhamento, sinalizar que nenhum modelo discutido é viável para
ele, registre isso como informação relevante para o advogado decidir — inclusive a possibilidade de
recusar o caso por incompatibilidade de honorários — e não empurre o interessado para um modelo que
ele já sinalizou não comportar, como desconto informal ou promessa de "resolver mais barato depois".

### Duas contas diferentes, e confundi-las desalinha a conversa nos dois sentidos

Quem chega perguntando de dinheiro quase sempre está somando duas coisas que não se somam, e esta
skill tem de separá-las antes de qualquer alinhamento:

- **As custas do processo** — o que se paga ao sistema de justiça para o processo andar, mais a
  exposição a arcar com os honorários da parte adversária se o caso for perdido.
- **O honorário contratado** — o que se paga ao advogado particular pelo trabalho dele.

A gratuidade de justiça, quando deferida, alcança a **primeira** conta. Ela não torna gratuito o
serviço de advogado particular, e dizer o contrário a alguém é prometer o que não se vai cumprir.
O erro na direção oposta é igualmente comum e igualmente caro: alguém desiste de procurar
advogado porque acha que "não tem dinheiro para processo", quando o que o assustava eram as custas,
e o honorário caberia.

**Não afirme, de memória, os requisitos da gratuidade, o que exatamente ela cobre, nem como se
pleiteia.** Isso tem base normativa com número, e número aqui segue a etiqueta do resto desta
skill: conferido nesta consulta, ou não conferido — e, se não conferido, dito com todas as letras.

### Quem não comporta nenhum modelo não sai sem direção

Recusar o caso por incompatibilidade de honorários é decisão legítima do advogado, e esta skill não
a questiona. O que ela não aceita é a recusa **muda**: encerrar a conversa sem dizer nada a quem
procurou ajuda e não tem como pagar.

Orientar sobre onde essa pessoa pode buscar atendimento — a defensoria pública, o serviço de
assistência judiciária da seccional aplicável, o juizado competente quando o rito dispensa
advogado — **não é captação, não é consultoria gratuita e não cria vínculo**. É orientação, custa
uma frase, e é o que separa uma recusa profissional de uma porta fechada na cara de alguém que pode
ter prazo correndo.

E vale o mesmo cuidado de sempre: **não afirme** que um caminho específico atende aquele caso sem
ter conferido — diga onde procurar, não o resultado que a pessoa vai obter lá.

## Formato da saída

**Regra da casa nº 2: resposta objetiva e informativa, fundamentação precisa, sem formatação
excessiva.** Cinco blocos, nesta ordem:

1. Confirmação do status do conflict check para este interessado — e, se pendente, a instrução de
   resolvê-lo antes de qualquer qualificação, parando aqui.
2. A natureza e o porte do caso, e os modelos de cobrança compatíveis com essa natureza, sem valor.
3. Os sinais de expectativa coletados de forma não invasiva, e as perguntas de alinhamento
   sugeridas para a próxima conversa — sempre sobre o serviço, nunca sobre a vida financeira.
4. O que fica pendente para a skill `precificacao-honorarios` decidir: valor, conferência da
   tabela da seccional aplicável, e estrutura final da proposta.
5. Quando o interessado sinalizar que nenhum modelo é viável: a separação entre custas e honorário
   que foi explicada a ele, e a orientação de onde buscar atendimento — com a etiqueta de
   conferência ao lado de qualquer requisito ou cobertura de gratuidade citada. Recusa sem
   orientação é lacuna, não resultado.

## As quatro regras da casa, aplicadas aqui

**Regra nº 1 — validação dupla.** Se a explicação de um modelo de cobrança a um interessado
depender de entendimento de tribunal sobre limite de honorário de êxito ou de sucumbência, essa
citação segue sítio oficial do tribunal competente **e** fonte secundária confiável (Conjur,
Migalhas, Jusbrasil). Sem as duas, **não cite** — descreva o modelo sem o número do precedente, e
delegue o roteiro completo à skill `pesquisa-jurisprudencia`.

**Regra nº 2 — objetividade.** Aplicada na seção de formato acima, e em cada pergunta sugerida ao
interessado, que é sempre direta e nunca disfarçada de conversa informal para extrair mais dado do
que o necessário.

**Regra nº 3 — conflict check antes de aceitar caso novo.** Central nesta skill: qualificar
financeiramente é avançar a relação com quem ainda não é cliente, e esse avanço não acontece antes
de o `conflict-check` concluir. A ordem entre as skills desta família é sempre a mesma — conflito
antes de qualificação, qualificação antes de proposta.

**Regra nº 4 — Provimento 205/2021.** A conversa de alinhamento de expectativa é comunicação
privada com um interessado identificado, não peça de publicidade — mas nenhum valor, faixa de
preço, desconto ou condição de pagamento discutido aqui vira material de divulgação depois sem
passar pela skill `etica-oab-publicidade`. Se o escritório quiser transformar em conteúdo público
qualquer variação de "trabalhamos com honorário de êxito" ou "parcelamos em X vezes", essa peça
passa pela `etica-oab-publicidade` antes de ir ao ar, porque divulgar valor e condição de pagamento
é vedado, e usar preço baixo como diferencial de captação aproxima honorário de mercantilização.

## O que esta skill não faz

Não fixa valor de honorário, percentual de êxito nem estrutura final de proposta — isso é a skill
`precificacao-honorarios`, que roda depois desta. Não decide se o caso é aceito, nem substitui o
`conflict-check`, que roda antes. Não consulta base de crédito, birô ou qualquer fonte externa
sobre a situação financeira de ninguém, e não sugere que essa consulta seja feita em silêncio. Não
pede documento financeiro, comprovante de renda ou levantamento patrimonial do interessado. E não
presume os modelos de cobrança que o escritório efetivamente pratica: se houver dúvida sobre isso,
pergunte ao advogado responsável em vez de aplicar de memória o cardápio inteiro de modelos como se
todos estivessem disponíveis para qualquer caso.
