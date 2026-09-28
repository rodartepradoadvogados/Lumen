---
name: onboarding-cliente
description: >
  Estrutura a entrada de cliente novo depois que o caso foi aceito: checklist documental
  específico por área (trabalhista, previdenciário, família, consumidor, empresarial), carta de
  boas-vindas e orientações iniciais sobre como o caso vai correr, prazos de resposta e canais de
  contato. Use SEMPRE que um caso novo tiver sido aceito, contrato ou procuração acabar de ser
  assinado, nova pasta de cliente for aberta, ou o advogado pedir "monta o onboarding desse
  cliente" ou "o que precisamos pedir de documento pra esse caso". Esta skill NUNCA roda antes da
  skill `conflict-check`: enviar carta de boas-vindas ou pedir documento a quem ainda não passou
  pela checagem de conflito é, na prática, aceitar o caso sem ter verificado se podia.
---

# Onboarding de cliente novo — checklist, carta de boas-vindas e orientações por área

Esta skill organiza os primeiros dias de um caso aceito. Ela não decide se o caso é aceito — isso é
trabalho de outra pergunta, e resolvido antes de esta skill começar a existir para aquele cliente.
O risco que ela evita é o de tratar entrada de cliente como formalidade administrativa que corre em
paralelo à decisão de aceitar: enviar boas-vindas, agendar reunião e pedir documento a alguém, e só
depois disso perceber que o caso era conflitado, é o mesmo erro de aceitar o caso sem checagem —
só que espalhado por três atos em vez de um, o que o torna mais fácil de fazer sem perceber.

## Gatilhos — quando rodar

- Caso novo com decisão de aceitar já tomada.
- Contrato de honorários ou procuração recém-assinados.
- Abertura de nova pasta de cliente, caso, atendimento ou assessoria.
- Pedido direto: "monta o onboarding desse cliente", "manda a carta de boas-vindas", "o que
  precisamos pedir de documento".

## Parada obrigatória: o conflict check vem primeiro, antes de qualquer outra coisa

**A ordem aqui não é negociável, e é o coração desta skill.** O primeiro item que esta skill
verifica não é documento nem carta — é se a skill `conflict-check` já rodou e chegou a um resultado
para este cliente e para este caso.

1. **Status do conflict check.** Se ele ainda não rodou, **pare agora** e diga que o próximo passo
   é rodar `conflict-check`, não montar onboarding. Se ele rodou e o resultado foi conflito direto,
   não há onboarding a montar — o caso foi recusado. Se o resultado foi conflito potencial ainda
   não resolvido, **pare também**: onboarding pressupõe caso aceito, e conflito potencial pendente
   significa que a aceitação ainda não está definitiva. Só um resultado de "sem indício", ou
   conflito potencial expressamente resolvido pelo advogado responsável, libera esta skill para
   seguir.
2. **A área do caso** — trabalhista, previdenciário, família, consumidor, empresarial ou outra —
   porque o checklist documental e as orientações iniciais mudam por área, e um checklist genérico
   pede documento que aquele caso não usa e esquece o que usa.
3. **A qualificação completa do cliente** — nome civil ou razão social, documento de identificação,
   e para pessoa jurídica também os dados de quem assina pelo cliente.
4. **O status do contrato de honorários e da procuração** — já assinados, em trâmite ou ainda a
   assinar. A carta de boas-vindas e o pedido de documento pressupõem vínculo já formalizado ou em
   vias de ser; onboarding não é ferramenta de captação de quem ainda está decidindo contratar.

Faltando qualquer um destes quatro itens, liste o que falta, peça, e pare. Uma carta de boas-vindas
enviada sem o conflict check concluído não é adiantamento de trabalho — é o problema que esta
skill existe para não deixar acontecer.

## Passo 1 — Checklist documental por área

O checklist é ponto de partida, não lista fechada: cada caso pode exigir documento adicional que a
área típica não prevê, e a instrução aqui não substitui o julgamento sobre o caso concreto.

**Trabalhista.** Carteira de trabalho (física ou digital) com as anotações do vínculo, contrato de
trabalho quando houver instrumento escrito, holerites do período discutido, comprovante de
rescisão ou aviso prévio, cartão de ponto ou registro de jornada se existir, exames admissional e
demissional, comunicações internas relevantes (e-mail, mensagem) sobre o fato que originou o caso,
e nome e função de eventuais testemunhas.

**Previdenciário.** Extrato de contribuições junto ao órgão previdenciário competente, carta de
indeferimento ou de concessão do benefício, perfil profissiográfico previdenciário quando a
discussão envolver atividade especial, laudo e histórico médico quando o pedido for por
incapacidade, comprovante de tempo de contribuição anterior (carteira de trabalho, guias de
recolhimento de autônomo), e documento de identificação do requerente e de dependente, quando
aplicável.

**Família.** Certidão de casamento, união estável ou nascimento conforme o objeto do caso, pacto
antenupcial ou escritura de união estável se existir, comprovante de renda de ambas as partes
quando o objeto envolver pensão ou partilha, documento de identificação dos filhos envolvidos,
comprovante de residência de cada parte, e inventário preliminar de bens quando o objeto for
partilha ou divórcio litigioso com patrimônio a discutir.

**Consumidor.** Contrato ou termo de adesão relativo ao produto ou serviço, nota fiscal ou
comprovante de compra, comprovante de pagamento, registro de comunicação com o fornecedor
(protocolo de atendimento, print de conversa, e-mail), e protocolo de reclamação em órgão de defesa
do consumidor, quando já houver.

**Empresarial.** Contrato social, estatuto ou última alteração consolidada, atas de reunião ou
assembleia relevantes ao objeto do caso, procuração ou instrumento de representação de quem assina
pela empresa, documentos fiscais e contábeis pertinentes ao objeto, e o contrato ou instrumento em
disputa, quando o caso girar em torno de um.

## Passo 2 — Carta de boas-vindas

A carta é montada **depois** de o passo da parada obrigatória confirmar que o caso está aceito.
Ela contém: identificação de quem assina pelo escritório e da equipe responsável pelo caso —
conforme consultado no Lúmen para aquele escritório, nunca por suposição —, agradecimento pela
confiança, resumo em uma frase do que foi contratado, o que o cliente pode esperar do escritório em
matéria de comunicação (canal de contato, prazo típico de resposta a mensagem), e o pedido dos
documentos do checklist do passo 1, especificando prazo para envio quando houver urgência real no
caso.

A carta **não promete resultado**, **não estima prazo de duração do processo como certeza** e
**não usa linguagem de campanha** — mesmo sendo comunicação privada dirigida a quem já é cliente, o
padrão de sobriedade da profissão vale aqui, e uma carta que promete vitória ou prazo fechado cria
expectativa que o próprio processo pode não confirmar. O nome, os canais e a identidade que
aparecem na carta vêm do Lúmen, consultados pela ferramenta `consultar_perfil_do_escritorio` — a
skill consulta e diz que consultou, nunca escreve um nome de memória ou de outro caso.

## Passo 3 — Orientações iniciais por área

Junto da carta, ou logo depois dela, entregue orientações específicas que preparam o cliente para o
que vem a seguir. Elas variam por área porque a experiência do cliente varia:

- **Trabalhista**: o que esperar de eventual audiência, a importância de não descartar
  comunicação com o antigo empregador, e como funciona a expectativa de acordo em audiência.
- **Previdenciário**: a possibilidade de perícia médica ou administrativa, a importância de manter
  atualizado o histórico de tratamento, e que o tempo de tramitação administrativa e judicial pode
  ser longo, sem fixar número de meses ou anos como promessa.
- **Família**: a orientação sobre sigilo processual quando aplicável, o cuidado com comunicação
  entre as partes durante o litígio, e a possibilidade de tentativa de conciliação antes do mérito.
- **Consumidor**: a orientação para preservar toda nova comunicação com o fornecedor durante o
  caso, e não aceitar acordo direto sem consultar o escritório antes.
- **Empresarial**: a orientação sobre continuidade de obrigações contratuais durante a disputa, e o
  cuidado com comunicação que possa ser usada como prova em sentido contrário ao interesse do
  cliente.

Quando alguma orientação depender de prazo processual ou de entendimento consolidado de tribunal
para ser precisa, **não afirme o prazo nem cite precedente de memória**: se a citação de
jurisprudência for necessária para explicar a orientação, ela segue a regra de validação dupla —
sítio oficial do tribunal e fonte secundária confiável (Conjur, Migalhas, Jusbrasil) — delegada à
skill `pesquisa-jurisprudencia`. Sem as duas, **não cite**: explique a orientação sem o número do
precedente.

## Formato da saída

**Regra da casa nº 2: resposta objetiva e informativa, fundamentação precisa, sem formatação
excessiva.** Quatro blocos, nesta ordem:

1. Confirmação do status do conflict check para este cliente e este caso — e, se não concluído,
   a instrução de rodar `conflict-check` primeiro, parando aqui.
2. O checklist documental da área identificada, com o que é obrigatório e o que é complementar ao
   caso concreto.
3. O texto da carta de boas-vindas, com os campos de identidade do escritório marcados como
   "conforme consultado no Lúmen", nunca preenchidos com nome presumido.
4. As orientações iniciais por área, e o que delas depende de conferência ainda não feita (prazo,
   precedente).

## As quatro regras da casa, aplicadas aqui

**Regra nº 1 — validação dupla.** Qualquer jurisprudência, súmula ou entendimento consolidado
usado para explicar uma orientação inicial ao cliente passa por sítio oficial do tribunal
competente **e** fonte secundária confiável (Conjur, Migalhas, Jusbrasil). Sem as duas, não cite —
descreva a orientação sem o número, sinalizando explicitamente e com todas as letras que o
precedente não foi confirmado nesta consulta, e delegue o roteiro completo à skill
`pesquisa-jurisprudencia`. Onboarding é o primeiro contato formal do cliente com o trabalho do
escritório, e uma citação inventada logo na largada compromete a confiança antes mesmo de o caso
começar a andar.

**Regra nº 2 — objetividade.** Já aplicada na seção de formato acima.

**Regra nº 3 — conflict check antes de aceitar caso novo.** Esta é a regra central desta skill, não
uma nota de rodapé: a parada obrigatória inteira gira em torno dela, porque toda a lógica de
onboarding pressupõe caso já aceito, e caso só é aceito depois de `conflict-check` concluído. Uma
skill de onboarding que pulasse essa checagem estaria, na prática, sendo o instrumento que aceita o
caso — função que não é dela.

**Regra nº 4 — Provimento 205/2021.** A carta de boas-vindas, o checklist e as orientações são
comunicação privada com quem já é cliente, não publicidade — mas o material produzido aqui não vira
matéria-prima de divulgação depois: nome de cliente, teor do caso ou trecho da carta não aparecem
em post, site ou material de captação sem passar antes pela skill `etica-oab-publicidade`, sob o
Provimento 205/2021, ainda que anonimizados. E se o caso chegou por canal de marketing do
escritório, vale perguntar como — a origem por captação irregular é problema que se resolve antes
do onboarding, não depois.

## O que esta skill não faz

Não decide se o caso é aceito — isso é da skill `conflict-check`, e esta skill só começa depois
dela. Não redige o contrato de honorários nem a procuração. Não estima nem propõe valor de
honorários — isso é a skill `precificacao-honorarios`. Não avalia o mérito do caso nem o risco
processual. E não presume o nome do escritório, a equipe responsável, os canais de contato nem a
área de atuação registrada: esses dados vêm do Lúmen, consultados pela ferramenta
`consultar_perfil_do_escritorio`, nunca de suposição ou de um caso anterior.
