---
name: resumo-pecas
description: >
  Estrutura o esqueleto de uma peça processual — endereçamento, qualificação das partes, fatos,
  fundamentos organizados por tese, requerimentos e checklist pré-protocolo — com foco no ponto em
  que a maioria das peças perde força sem que ninguém perceba: a seção de pedidos. Ensina a
  distinguir pedido genérico ilegítimo de generalidade autorizada por lei, pedido implícito de
  pedido que precisa vir expresso, cumulação própria de imprópria, pedido subsidiário de pedido
  alternativo, e a separar o requerimento de tutela provisória do pedido final. Cobra a
  correspondência item a item entre fato, fundamento e pedido antes de fechar a peça. Use SEMPRE
  que for preciso montar ou revisar o esqueleto de uma petição inicial, contestação, reconvenção,
  recurso ou qualquer peça postulatória antes do protocolo; quando o advogado pedir para "montar o
  pedido", "reforçar o requerimento", "conferir se o pedido está completo", "revisar a peça antes
  de protocolar" ou "por que a sentença não decidiu isso"; e como referência de qualidade que o
  agente de peticionamento do Lúmen consulta ao redigir a parte final de uma minuta — nunca como
  substituto dele.
---

# Resumo de peça processual — o esqueleto, e o requerimento como o coração dele

Esta skill não redige a peça inteira. Ela monta e confere o esqueleto — a estrutura que sustenta
qualquer petição inicial, contestação, reconvenção ou recurso — e trata a seção de requerimentos
não como o último item de uma lista, mas como o eixo de tudo o que vem antes: fatos e fundamentos
existem para sustentar um pedido, e um pedido mal redigido devolve, no fim do processo, uma
sentença que não resolve o problema que levou o cliente ao escritório. O defeito que esta skill
existe para evitar não é o esquecimento de uma cláusula de estilo — é o pedido genérico onde a lei
exige certeza, o pedido implícito tratado como se dispensasse redação expressa, o subsidiário
escrito como se fosse alternativo, a tutela misturada ao pedido final, e o pedido sem fato que o
sustente. Cada um desses defeitos produz o mesmo resultado: capítulo que a sentença não julga,
ou julga errado, porque ninguém pediu certo.

## Gatilhos — quando rodar

- Montagem do esqueleto de uma petição inicial, contestação, reconvenção, embargos ou recurso,
  antes de qualquer redação de mérito.
- Revisão de minuta já pronta, quando o pedido do advogado for "confere se o pedido está
  completo", "reforça o requerimento" ou "por que ficou fraco".
- Preparação para protocolo, como último filtro antes de enviar a peça ao juízo competente.
- Dúvida concreta sobre como redigir cumulação de pedidos, pedido subsidiário, pedido alternativo
  ou pedido de tutela provisória.
- Consulta do agente de peticionamento do Lúmen, durante a montagem automática de uma minuta, para
  conferir se a estrutura da parte final segue o padrão de qualidade desta casa.

## Relação com o peticionamento do Lúmen — o que esta skill é, e o que ela não é

Esta skill **não substitui** o peticionamento do Lúmen. O agente de peça já redige a minuta a
partir do que o advogado informa e do que consulta nas ferramentas do próprio Lúmen; esta skill é
a referência de qualidade que aquele agente consulta para saber **como** estruturar o
endereçamento, a qualificação, os fatos, os fundamentos e — sobretudo — o requerimento, não a
fonte dos dados do caso. Dados de partes, processo, documentos e atendimento vêm sempre das
ferramentas do próprio Lúmen, nunca de suposição desta skill nem de memória do que "costuma ser":
`consultar_perfil_do_escritorio`, `consultar_processos`, `consultar_atendimento`,
`buscar_cliente`, `consultar_historico_cliente`, `consultar_documentos` e
`consultar_assessorias`. São essas sete, e só essas sete — esta skill não inventa uma oitava
ferramenta nem presume que uma informação de cadastro "deve ser" algo quando a consulta não a
devolveu.

## Parada obrigatória: sem os insumos abaixo, o esqueleto não se monta

O trabalho começa quando estes itens estiverem disponíveis. Faltando qualquer um, a resposta é
uma só: liste o que falta, peça, e pare. Um esqueleto montado sobre parte da informação é mais
perigoso que nenhum esqueleto, porque o advogado tende a preencher a lacuna silenciosa com o que
presume, e presunção em petição vira alegação sem lastro.

1. **Qual peça é esta** — petição inicial, contestação, reconvenção, embargos, recurso — e em que
   fase do processo ela se insere, porque a estrutura muda com o tipo (uma contestação não
   formula pedido de mérito principal do mesmo jeito que uma inicial; um recurso pede reforma ou
   anulação, não a obrigação original).
2. **Os fatos narrados pelo advogado**, na integralidade, não um resumo de terceiro. É deles que
   sai a causa de pedir de cada requerimento.
3. **A qualificação das partes e o polo do cliente**, consultada nas ferramentas do Lúmen, não
   deduzida do assunto do caso.
4. **As teses já identificadas ou a identificar**, e se há tese subsidiária cogitada pelo
   advogado — informação que muda a ordem e a redação do capítulo de requerimentos.
5. **Se o caso pede tutela provisória**, e com que urgência, porque a tutela tem requisitos e
   redação próprios, tratados à parte do pedido final.

Se o caso vier de quem ainda não é cliente da casa — consulta avulsa, minuta pedida antes de
qualquer contrato firmado — a skill `conflict-check` roda **antes** de qualquer montagem de
esqueleto. Redigir requerimento para quem talvez não possa ser aceito como cliente é o mesmo
problema que o teste de informação privilegiada existe para prevenir.

## Passo 1 — Endereçamento: descobrir o juízo competente, nunca presumir um

O endereçamento é a primeira linha da peça e a primeira fonte de nulidade sanável quando errado.
Esta skill **não nomeia** um juízo, tribunal ou comarca: fazer isso numa skill de plataforma
presumiria competência, rito e órgão que valem para uma fração dos casos e obedeceria a presunção
errada em silêncio para todos os outros. O que ela ensina é a montar o raciocínio que **encontra**
o juízo competente no caso concreto:

- **Competência em razão da matéria**: o objeto do pedido define o ramo — cível, trabalhista,
  tributário, de família — e dentro dele a vara especializada, quando existir.
- **Competência territorial**: em regra o domicílio do réu, com os foros concorrentes e
  exclusivos que a lei processual prevê para cada tipo de ação (foro do local do fato, do
  cumprimento da obrigação, da situação do imóvel, do domicílio do consumidor, do local de
  trabalho). Confirme qual regra incide sobre o caso concreto em vez de aplicar a regra geral por
  hábito.
- **Foro de eleição**: se houver contrato com cláusula de eleição de foro, verifique a validade
  dela para o tipo de relação (é vulnerável em contrato de adesão que prejudique a parte mais
  fraca) antes de segui-la.
- **Competência funcional e recursal**: para recurso, o órgão competente é o que a lei processual
  designa para revisar aquela espécie de decisão — nunca o mesmo juízo que decidiu, salvo o
  próprio juízo prolator para os recursos que a ele se dirigem.
- **Distribuição por dependência**, quando o caso tiver conexão, continência ou prevenção com
  processo já em curso — informação que só o Lúmen tem, via `consultar_processos`.

Diga sempre, no lugar do nome do órgão, a **regra de competência aplicável** e o dado do caso que
a preenche — e, quando esse dado não estiver disponível nas ferramentas do Lúmen, deixe isso como
lacuna explícita para o advogado confirmar antes do protocolo, em vez de nomear um juízo.

## Passo 2 — Qualificação das partes

Qualificação incompleta é vício sanável que ainda assim atrasa o processo. Cada parte precisa vir
com: nome civil ou razão social completa, nacionalidade, estado civil (pessoa física) ou natureza
jurídica e representação (pessoa jurídica), profissão, domicílio ou sede, e o número de
identificação cadastral (CPF ou CNPJ). Quando houver representação — procurador, curador,
inventariante, representante legal de incapaz — qualifique também o representante e a fonte do
poder de representação. Litisconsórcio ativo ou passivo exige a qualificação de cada litisconsorte,
não de um deles "e outros".

Todo esse dado vem das ferramentas do Lúmen — `buscar_cliente`, `consultar_processos`,
`consultar_historico_cliente` — nunca de suposição. Campo que a consulta não devolveu entra como
lacuna explícita, entre colchetes, para o advogado preencher; nunca é inventado nem preenchido por
semelhança com outro caso do mesmo cliente.

## Passo 3 — Fatos: a narrativa que vai sustentar cada pedido depois

Narre em ordem cronológica, em linguagem factual — o que aconteceu, quando, com quem, prova o
resultado disso —, sem antecipar a qualificação jurídica que pertence aos fundamentos. Numere ou
destaque cada fato relevante o bastante para permitir, no passo seguinte, ligar cada um a uma
tese, e cada tese a um pedido. Fato contado de forma solta, sem esse encadeamento em vista, é a
origem mais comum do pedido sem lastro que o passo 8 desta skill existe para pegar antes do
protocolo.

## Passo 4 — Fundamentos organizados por tese

Trate cada tese como um bloco autônomo: o dispositivo legal ou o instituto aplicável, o fato do
passo anterior que o preenche, e a conclusão jurídica que dele decorre. Quando a tese central tiver
uma tese subsidiária — para o caso de a principal não ser acolhida —, identifique isso já aqui,
porque é essa marcação que, no passo de requerimentos, decide se o pedido correspondente entra
como principal ou como subsidiário.

Toda jurisprudência, súmula ou precedente citado para sustentar uma tese passa pela validação
dupla — sítio oficial do tribunal competente **e** uma fonte secundária confiável (Conjur,
Migalhas, Jusbrasil). Sem as duas, **não cite**: descreva a tese sem número, e diga com todas as
letras que o precedente não foi confirmado nesta consulta. O roteiro completo de busca e
validação é da skill `pesquisa-jurisprudencia` — delegue a ela em vez de citar de memória. A mesma
cautela vale para número de artigo, prazo processual ou rito aplicável mencionado nos fundamentos:
não afirme de memória qual é o dispositivo, o prazo em dias ou o rito cabível para o tipo de ação
— diga se foi **conferido nesta consulta** ou **não conferido nesta consulta**, e essa etiqueta
viaja com a informação para o bloco da saída, não fica só na explicação.

## Passo 5 — Requerimentos: pedido certo e determinado, e quando a generalidade é legítima

Esta é a seção mais importante da peça, e a razão de esta skill existir. Pedido genérico onde a
lei exige certeza é o defeito mais comum e o mais barato de evitar: "o que for devido", "os danos
sofridos", "a reparação cabível" não dizem ao juízo o que decidir, e a sentença que responde a um
pedido assim tende a repetir a mesma vagueza no dispositivo — ou a conceder menos do que o caso
comportava, porque o julgador não tem o que conceder além do que foi pedido com precisão. Pedido
de obrigação de pagar exige, sempre que o valor for apurável no momento da petição, o valor certo
ou o critério de cálculo explícito; pedido de obrigação de fazer ou não fazer exige a conduta
determinada, o prazo de cumprimento e, quando cabível, a cominação para o descumprimento.

A generalidade só é legítima nas hipóteses que a própria lei processual autoriza: quando não for
possível determinar, desde logo, as consequências do ato ou do fato (dano em curso, cujo alcance
final ainda não se revelou); quando a apuração do valor ou do conteúdo da condenação depender de
ato que ainda há de ser praticado pelo réu (prestação de contas ainda não feita, per exemplo); ou
quando a lei expressamente permitir o pedido genérico para aquele tipo de ação. Fora dessas
hipóteses, pedido genérico é fragilidade, não estilo — e quando a apuração for necessária, diga
isso expressamente na peça e indique o critério de apuração, em vez de deixar a vagueza sem
explicação.

## Passo 6 — Pedido implícito e o que precisa vir expresso

Nem tudo que decorre do pedido principal precisa ser redigido por extenso, mas confundir o que a
lei processual já considera compreendido no principal com o que precisa de pedido próprio é erro
que custa capítulo inteiro da sentença. O critério não é "parece óbvio" — é o que a lei
processual efetivamente trata como decorrência automática do pedido principal, matéria que só se
afirma com o dispositivo conferido, nunca de memória.

- **Juros e correção monetária**: a jurisprudência e a legislação processual costumam tratá-los
  como consectários que acompanham a condenação principal mesmo sem pedido expresso, mas a
  prudência processual pede que venham redigidos mesmo assim, com o critério e o marco inicial
  indicados — nunca afirmados como índice ou termo "pacificado" sem conferência. Pedido explícito
  aqui evita discussão na fase de cumprimento sobre o que a condenação abrange.
- **Honorários de sucumbência**: pedido expresso, com o percentual ou o critério pretendido,
  ainda que a condenação em honorários também decorra da lei processual independentemente de
  pedido — omitir o pedido expresso não impede a condenação, mas deixa de orientar o julgador
  sobre a base de cálculo que a parte pretende ver aplicada.
- **Custas processuais**: seguem, em regra, a sucumbência, mas pedir expressamente a condenação
  do vencido nas custas evita ambiguidade em sucumbência recíproca ou parcial.
- **O que NÃO se presume implícito**: tutela provisória (capítulo próprio, ver passo 8), dano
  moral autônomo, litigância de má-fé, gratuidade de justiça, prioridade de tramitação e qualquer
  obrigação acessória que não decorra da lei processual de forma expressa. Cada um desses precisa
  de pedido próprio, com a causa de pedir que o sustenta — nunca por reflexo do pedido principal.

## Passo 7 — Cumulação de pedidos: própria, imprópria, subsidiária e alternativa

Cumular pedidos é pedir mais de uma coisa na mesma peça, e a lei processual admite fazer isso de
formas diferentes, com consequência diferente para cada uma. Confundir uma forma com outra é o
segundo defeito mais comum depois do pedido genérico, porque a redação de cada uma muda o que o
juízo entende que foi pedido.

- **Cumulação própria (simples)**: pede-se A **e** B, e o autor espera obter os dois,
  independentemente um do outro. Redija cada pedido de forma autônoma e numerada, sem
  subordinar um ao resultado do outro.
- **Cumulação imprópria**: os pedidos não são independentes entre si — o segundo só faz sentido,
  ou só é formulado, em função do primeiro (é o guarda-chuva que cobre tanto o subsidiário quanto
  o alternativo, cada um com regra própria abaixo).
- **Pedido subsidiário (eventual)**: pede-se A e, **caso A não seja acolhido**, pede-se B em seu
  lugar — nunca os dois ao mesmo tempo. A redação correta nomeia expressamente a subsidiariedade
  ("subsidiariamente, e apenas na hipótese de não acolhimento do pedido anterior, requer-se...")
  e obedece à ordem de preferência do autor: o juízo só aprecia o subsidiário se rejeitar o
  principal. É o princípio da eventualidade, e ele só funciona se a peça deixar claro qual pedido
  vem primeiro na preferência do autor.
- **Pedido alternativo**: pede-se A **ou** B, e qualquer um dos dois satisfaz o autor — a escolha
  cabe ao credor ou ao devedor conforme a natureza da obrigação, não é uma hierarquia de
  preferência do autor. Redija com "ou", nunca com "subsidiariamente", e diga a quem cabe a
  escolha entre as prestações.

**O erro mais comum é escrever "alternativamente" quando o que se quer é subsidiário, ou
vice-versa.** A consequência não é estética: pedido redigido como alternativo, quando a intenção
era de preferência entre principal e eventual, autoriza o juízo a conceder o que o autor
considerava a opção pior, como se fosse escolha livre e não hierarquia. Antes de fechar a peça,
releia cada cumulação e pergunte: existe uma ordem de preferência do autor entre esses pedidos?
Se sim, é subsidiário, e a ordem de preferência tem de estar redigida. Se as duas prestações
satisfazem igualmente, é alternativo, e a redação não pode sugerir preferência que não existe.

## Passo 8 — A ordem dos pedidos importa

A ordem em que os pedidos aparecem no capítulo de requerimentos não é estética — ela comunica ao
juízo a hierarquia que o autor pretende, e a falta de ordem é, ela mesma, fonte de pedido mal
compreendido. Redija nesta sequência, usando só o que for pertinente ao caso:

1. **Pedido principal** — o que se quer no mérito, com precisão sobre a obrigação (dar, fazer,
   não fazer, pagar), contra quem se dirige e em que prazo deve ser cumprida.
2. **Pedidos subsidiários**, quando houver — sempre depois do principal, rotulados
   expressamente como subsidiários e na ordem de preferência do autor, nunca misturados ao
   principal como se tivessem o mesmo peso.
3. **Pedidos acessórios que decorrem do principal** (juros, correção, honorários, custas),
   redigidos depois do mérito principal e de seus subsidiários, nunca antes.
4. **Requerimentos processuais** (citação, provas, valor da causa e requerimentos
   instrumentais), na sequência dos passos 10 a 12 abaixo.

Pedido acessório redigido antes do principal, ou subsidiário misturado ao corpo do principal sem
marcação própria, obriga o julgador a reconstruir a hierarquia que a peça deveria ter deixado
explícita — e capítulo reconstruído por interpretação é capítulo sujeito a embargos de declaração
por obscuridade, quando não a recurso de mérito pela leitura que o juízo fizer dele.

## Passo 9 — Tutela provisória: capítulo próprio, nunca misturada ao pedido final

Tutela provisória — de urgência ou de evidência — tem requisitos próprios (probabilidade do
direito e perigo de dano ou risco ao resultado útil do processo, na de urgência; as hipóteses
legais específicas, na de evidência) e produz efeito **antes** do julgamento final. Por isso ela
nunca entra misturada ao pedido de mérito: monte um capítulo próprio, separado, com esta
estrutura:

- **O que se pede AGORA**, de forma executável — a conduta ou a abstenção determinada, a quem se
  dirige, o prazo para cumprimento e a multa pedida para o caso de descumprimento —, distinto do
  que se pede **ao final**, que é o mérito definitivo. Uma tutela redigida como adjetivo ("requer
  a tutela de urgência para garantir seus direitos") não dá ao juízo o que determinar; redija o
  comando como se já fosse o dispositivo da decisão que se quer obter.
- **O requisito preenchido pelo fato do caso**, remetendo ao fundamento correspondente do passo 4
  — tutela pedida sem apontar qual fato demonstra a probabilidade do direito e qual fato demonstra
  o risco é pedido sem fundamento, ainda que o mérito final esteja bem fundamentado.
- **A reversibilidade ou a irreversibilidade** da medida pretendida, porque isso pesa na análise
  do juízo sobre a urgência.

Nunca afirme que a tutela "certamente será deferida" nem estime prazo de apreciação — isso é
prognóstico de resultado, vedado nesta e em qualquer peça produzida sob as skills desta casa.

## Passo 10 — Correspondência entre fatos, fundamentos e pedidos: confira item a item

Este é um passo próprio, não uma observação de passagem, porque o defeito que ele evita é o mais
comum de todos: **pedido sem lastro no relato**. Antes de fechar a peça, monte uma conferência
item a item — cada pedido do capítulo de requerimentos precisa apontar, sem exceção, para (a) o
fato específico do passo 3 que o sustenta e (b) o fundamento específico do passo 4 que o
qualifica juridicamente. Pedido que não passa nessa conferência tem duas saídas, e nenhuma delas
é deixá-lo como está: ou o fato que o sustentaria está faltando na narrativa — e então falta ao
advogado, não a esta skill, informar — ou o pedido não tem lastro nenhum no caso e deve ser
retirado antes do protocolo. Nunca invente o fato que preencheria a lacuna: aponte a lacuna.

## Passo 11 — Valor da causa

O valor da causa não é um número solto no fim da peça — ele decorre do proveito econômico
pretendido pelo conjunto dos pedidos, e precisa refletir a soma de pedidos cumulados quando a
cumulação for própria, o maior valor entre os pedidos quando for alternativa, e o valor do pedido
principal quando houver subsidiário (o subsidiário não se soma ao principal para esse efeito,
porque os dois não podem ser concedidos ao mesmo tempo). Valor da causa incompatível com o pedido
formulado é impugnável pela parte contrária e pode alterar a competência ou o rito aplicável —
confira a coerência entre o que se pede e o valor atribuído antes de fechar a peça, e não afirme
o critério legal de fixação de memória quando o tipo de ação tiver regra própria de cálculo.

## Passo 12 — Requerimentos instrumentais: pequenos na peça, caros quando faltam

Requerimentos instrumentais não são "o pedido" no sentido de mérito, mas a falta de qualquer um
deles custa tempo, nulidade sanável ou perda de benefício que o cliente já tinha direito de
pedir. Cheque, um a um, os que forem pertinentes ao caso:

- **Produção de provas, especificada** — nunca "todas as provas em direito admitidas" sem mais:
  diga o meio (depoimento pessoal da parte contrária, sob pena de confissão; oitiva de
  testemunhas; prova pericial e a especialidade do perito; juntada de documento em poder de
  terceiro; expedição de ofício a quem o detém) e, quando possível, o fato que cada meio pretende
  provar.
- **Citação ou intimação da parte contrária**, na forma que a lei processual prevê para aquele
  tipo de parte e de ação — pessoal, por meio eletrônico, por edital quando cabível — nunca
  presumida como "citação na forma da lei" sem indicar a forma quando o caso exigir uma
  específica (réu em local incerto, réu no exterior, ausência de citação anterior válida).
  Nomeie a forma como um pedido explícito, não como cláusula de estilo.
- **Intimações em nome do advogado que subscreve a peça**, com o endereço para intimação
  indicado — item que parece óbvio e cuja ausência gera intimação inválida ou perdida quando o
  cadastro do processo estiver desatualizado.
- **Benefício de gratuidade de justiça**, quando o caso comportar, com a alegação de
  hipossuficiência e a indicação de que a presunção legal em favor da pessoa natural, quando
  aplicável, dispensa prova salvo impugnação fundamentada — mas não afirme esse regime como
  automático para pessoa jurídica sem conferir o requisito aplicável a ela.
- **Prioridade de tramitação**, quando houver fundamento concreto (idade, doença grave, outra
  hipótese legal) — peça com o fato que a sustenta, nunca em bloco por hábito.
- **Endereço para intimação** de cada parte e de cada advogado, atualizado — item que, faltando,
  não impede o protocolo mas compromete toda a comunicação processual seguinte.

Requerimento instrumental que não for pertinente ao caso simplesmente não entra — não se anuncia
que "não entrou". Encher a peça com instrumentais genéricos e irrelevantes não a torna mais
robusta; torna-a mais difícil de revisar pelo próprio advogado.

## Passo 13 — Checklist pré-protocolo

Feche sempre com esta conferência, em ordem, antes de considerar a peça pronta para revisão do
advogado:

1. Endereçamento aponta a regra de competência aplicável, não um juízo nomeado sem essa
   verificação.
2. Qualificação de todas as partes está completa, com a fonte de cada dado registrada (Lúmen ou
   lacuna explícita).
3. Cada fato relevante da narrativa está ligado a pelo menos um fundamento e a pelo menos um
   pedido — a conferência do passo 10 foi de fato feita, não presumida como feita.
4. Nenhum pedido de mérito é genérico fora das hipóteses legais que autorizam a generalidade.
5. Pedido implícito e pedido expresso não foram confundidos — juros, correção, honorários e
   custas vieram redigidos, e nada além disso foi tratado como implícito sem verificação.
6. Toda cumulação foi revisada: própria, subsidiária ou alternativa, cada uma redigida com a
   forma que lhe é própria, sem confundir subsidiário com alternativo.
7. A ordem dos pedidos segue principal, subsidiário nomeado, acessório, e só depois os
   requerimentos processuais.
8. Tutela provisória, se pedida, está em capítulo próprio, com comando executável e requisito
   apontado — nunca misturada ao pedido final.
9. Valor da causa é coerente com o conjunto dos pedidos formulados.
10. Requerimentos instrumentais pertinentes ao caso estão presentes, e nenhum irrelevante foi
    incluído por hábito.
11. Toda jurisprudência, todo número de artigo, todo prazo e todo rito mencionado na peça vêm
    com a etiqueta de conferência — conferido nesta consulta ou não conferido nesta consulta —,
    nunca afirmados de memória.

## Formato da saída

**Regra da casa nº 2: resposta objetiva e informativa, fundamentação precisa, sem formatação
excessiva.** Sete blocos curtos, nesta ordem, sem repetir o texto da peça:

1. Tipo de peça e fase processual, e a regra de competência que define o endereçamento (com a
   lacuna explícita se o dado do Lúmen não a preencheu).
2. Qualificação das partes, com a origem de cada dado (Lúmen ou lacuna a preencher).
3. Síntese dos fatos e das teses, com a correspondência fato → fundamento já indicada.
4. O capítulo de requerimentos completo, na ordem do passo 8, com cada cumulação identificada
   como própria, subsidiária ou alternativa.
5. O capítulo de tutela provisória, se houver, separado do pedido final.
6. Toda referência a dispositivo legal, prazo processual, rito ou precedente citado na peça,
   cada uma marcada como **conferido nesta consulta** ou **não conferido nesta consulta** — essa
   etiqueta vai dentro deste bloco, junto de cada referência, nunca só explicada em prosa à parte.
7. O checklist pré-protocolo do passo 13, com cada item marcado como cumprido ou pendente, e o
   que falta para fechar o pendente.

## As quatro regras da casa, aplicadas aqui

**Regra nº 1 — validação dupla.** Toda súmula, precedente vinculante ou não, tese de repetitivo
ou entendimento consolidado citado nos fundamentos ou nos requerimentos passa pela validação
dupla: sítio oficial do tribunal competente **e** uma fonte secundária confiável (Conjur,
Migalhas, Jusbrasil). Sem as duas, **não cite** — descreva a tese sem número e sinalize
explicitamente, com todas as letras, que ela não foi confirmada nesta consulta. O roteiro
completo é da skill `pesquisa-jurisprudencia`; delegue a ela em vez de citar de memória. A mesma
cautela — nunca afirmar de memória — vale para número de artigo, prazo processual e rito
aplicável, com a etiqueta viajando junto de cada informação, inclusive no bloco da saída.

**Regra nº 2 — objetividade.** Já aplicada na seção de formato acima: resposta objetiva e
informativa, com fundamentação precisa, sem formatação excessiva. Nada de tabela decorativa nem
de repetir o corpo inteiro da peça em vez de resumir a estrutura e apontar o que falta.

**Regra nº 3 — conflict check antes de aceitar caso novo.** Montagem de esqueleto para quem ainda
não é cliente da casa — consulta avulsa, minuta pedida antes de contrato firmado — só roda depois
que a skill `conflict-check` concluir. Redigir requerimento para um caso que talvez não possa ser
aceito produz e registra informação estratégica que o teste de informação privilegiada existe
para proteger.

**Regra nº 4 — Provimento 205/2021.** Uma peça bem-sucedida, um valor de causa relevante ou uma
tese vencedora inédita não viram print, "case de sucesso" ou material de divulgação — ainda que
anonimizados. Qualquer peça de publicidade ou marketing jurídico que se queira construir a partir
de um resultado obtido com esta skill passa antes pela skill `etica-oab-publicidade`, sob o
Provimento 205/2021.

## O que esta skill não faz

Não redige a peça inteira nem substitui o agente de peticionamento do Lúmen — ela é a referência
de qualidade que ele consulta para montar o esqueleto e, sobretudo, o capítulo de requerimentos.
Não decide estratégia processual nem escolhe entre pedir tutela de urgência ou de evidência
quando o caso comportar as duas — aponta os requisitos de cada uma e deixa a escolha para o
advogado. Não estima chance de êxito nem prognostica resultado — isso é vedado em qualquer peça
produzida sob as skills desta casa. Não nomeia juízo, tribunal, comarca ou vara — ensina a
encontrar a regra de competência aplicável ao caso concreto. Não afirma número de artigo, prazo
processual ou rito de memória — cada um vem com a etiqueta de conferência, dentro do bloco da
saída, não só na explicação. E não presume dado de partes, processo, documento ou atendimento:
esses vêm sempre das ferramentas do Lúmen, nunca de suposição.
