---
name: usar-o-lumen
description: >
  Ensina o agente do Hermes a USAR o que a própria plataforma Lúmen já resolve, em vez de escrever
  uma segunda implementação paralela para a mesma tarefa. Cobre sete capacidades que já existem em
  código no Lúmen — triagem de primeiro contato pelo WhatsApp, prazo processual e agenda, aviso
  automático à equipe sobre evento de cliente ou processo, indicador e métrica do escritório,
  organização de pasta no armazenamento do escritório, geração de minuta pela aba de
  peticionamento e notificação extrajudicial como categoria dela — e diz, para cada uma, o que o
  agente deve consultar ou apontar em vez de inventar um fluxo próprio. Use SEMPRE que o pedido ao
  Hermes for para "montar", "explicar como fazer", "configurar" ou "criar um roteiro para" uma
  dessas sete tarefas, antes de escrever qualquer resposta que descreva ou substitua o que a
  plataforma já faz. Não é skill de conteúdo jurídico: quando o pedido for de fato uma peça, uma
  tese ou uma checagem de conflito, esta skill remete à skill certa em vez de tentar cobrir o
  assunto sozinha.
---

# Usar o Lúmen — por que esta skill existe

O dono pediu, de uma vez, cerca de vinte e cinco skills jurídicas para o Hermes. Ao revisar a
lista, ficou claro que várias delas descreviam uma tarefa que **o Lúmen já resolve em código**:
não uma ideia de produto, uma funcionalidade construída, testada e em uso. Escrever essas tarefas
como skill teria criado **duas fontes de verdade sobre a mesma coisa** — o Lúmen faria de um
jeito, a skill instruiria o agente a fazer de outro, e no dia em que os dois divergissem ninguém
saberia qual vale. Esse tipo de dívida não aparece no dia em que nasce: aparece meses depois,
quando um advogado segue a instrução da skill, a tela do Lúmen mostra outra coisa, e as duas
versões já se afastaram o bastante para que consertar custe caro.

A saída, aprovada pelo dono, não é vetar essas sete tarefas: é fazer desta skill um roteiro de
**uso**, não de reimplementação. O Lúmen é a fonte da verdade sobre como cada uma delas funciona
hoje; esta skill ensina o agente a reconhecer a tarefa, consultar a ferramenta certa quando ela
existir, e apontar para a parte da plataforma que já faz o trabalho — nunca a escrever, de
memória, um roteiro concorrente que a plataforma já não segue.

## Quando esta skill entra em jogo

Roda antes de qualquer resposta que descreva, ensine, configure ou produza texto para uma destas
sete tarefas — o pedido pode vir em qualquer forma, e as mais comuns são:

- "monta um roteiro de atendimento/triagem para o WhatsApp";
- "como eu configuro a recusa automática de um caso";
- "quais são os prazos que vencem essa semana", "me avisa dos prazos";
- "manda um aviso sobre esse cliente/processo para a equipe", "como funciona o comunicado";
- "quais são os indicadores do escritório", "quanto o escritório faturou/tem no funil";
- "onde eu salvo esse documento", "organiza a pasta desse processo";
- "gera a minuta dessa petição", "redige uma notificação extrajudicial".

Se o pedido for, na verdade, uma pergunta de conteúdo jurídico — uma tese, uma checagem de
conflito, uma revisão de contrato — esta skill não é a certa: ela remete à skill que trata daquele
assunto (ver a seção "Relação com as outras skills", mais abaixo) e não tenta cobrir sozinha.

## As sete ferramentas do agente — e nenhuma outra

O agente que segue esta skill tem acesso a exatamente sete ferramentas de consulta ao Lúmen:
`consultar_perfil_do_escritorio`, `consultar_processos`, `consultar_atendimento`,
`buscar_cliente`, `consultar_historico_cliente`, `consultar_documentos` e
`consultar_assessorias`. São essas sete, e só essas sete — esta skill não inventa uma oitava
ferramenta, não presume que existe uma ferramenta de agenda, de comunicados ou de indicadores só
porque a capacidade existe no produto, e não trata uma tela do Lúmen como se fosse uma chamada de
ferramenta disponível ao agente.

**A regra de ouro: quando uma das sete ferramentas responde à pergunta, o agente chama a
ferramenta — nunca produz a resposta de memória, estimando ou generalizando de outro caso.** Um
número de processo, um valor de causa, o estágio de um atendimento ou o cadastro de um cliente que
saem da cabeça do agente em vez de saírem da consulta são exatamente o tipo de erro que estas
ferramentas existem para impedir.

**Quando nenhuma das sete ferramentas cobre a pergunta** — e isso acontece com frequência nas sete
capacidades abaixo, porque agenda, comunicados e indicadores não têm ferramenta própria neste
conjunto —, o agente **não estima, não calcula e não inventa um número no lugar da consulta que
falta**. A resposta correta é dizer, com todas as letras, que aquela informação vive numa tela do
Lúmen que este agente não consulta diretamente, e orientar o advogado a abri-la. Isso vale em
especial para prazo processual: uma data de prazo produzida sem consulta é o único erro desta lista
que não tem conserto depois.

## As sete capacidades que já vivem no Lúmen

### 1. Triagem de primeiro contato no WhatsApp

Já existe como a atendente do WhatsApp — a Ana. Ela acolhe quem escreve, faz a triagem (entende o
problema, quando aconteceu, se já existe processo ou atendimento anterior, em que cidade), pede os
documentos que ajudam o advogado a avaliar o caso, e diz que um advogado vai retomar o contato. Ela
carrega limites que não dependem do que o escritório escreveu no treinamento dela: nunca fecha
contrato, nunca dá a solução jurídica do caso, nunca promete resultado, nunca informa prazo sem uma
consulta ao sistema, e nunca inventa quando não sabe.

A mesma atendente também pode **recusar** um caso sozinha, mas só dentro dos eixos que o próprio
escritório autorizou nos parâmetros de recusa daquele escritório (matéria, comarca, valor mínimo da
causa) — sem esses parâmetros escritos por um administrador, nenhum eixo está liberado, e o caso
segue para uma pessoa decidir, nunca é encerrado pela máquina por conta própria.

Quando o pedido ao Hermes for "monta um roteiro de triagem" ou "como faço a Ana recusar caso fora
da minha área", a resposta certa é apontar que essa peça já existe e onde ela se ajusta — pelos
parâmetros de recusa que o próprio escritório configura — e não redigir um script de atendimento do
zero, que teria as mesmas cinco regras da atendente reescritas de memória e sujeitas a divergir
delas com o tempo. `consultar_atendimento` ajuda a ver os atendimentos em andamento e o estágio de
cada um; `buscar_cliente`/`consultar_historico_cliente` ajudam a saber se quem escreveu já é
cliente antes de qualquer triagem nova. E é exatamente aqui que a **regra da casa nº 3** entra: a
triagem de primeiro contato é onde o caso novo aparece, e caso novo — mesmo vindo pelo WhatsApp —
passa por `conflict-check` antes de qualquer proposta ou continuidade.

### 2. Prazos processuais

Já existem como a agenda do escritório com alerta de prazo: um prazo vencendo hoje, um prazo já
vencido e uma audiência em menos de 24 horas produzem aviso, com destaque visual diferente para o
que está atrasado e para o que vence hoje. Nenhuma das sete ferramentas do agente devolve essa
agenda ou esses alertas — `consultar_processos` traz o processo, não a data dos prazos vinculados a
ele. Por isso, quando o pedido for "quais prazos vencem essa semana" ou "o que está atrasado", o
agente não soma dias a partir de uma data que alguém mencionou nem estima a contagem: diz que essa
informação vive na agenda e na central de alertas do Lúmen, e orienta o advogado a abrir lá para
ver a lista com o marco e a contagem que a produziram.

### 3. Aviso automático à equipe sobre evento de cliente e processo

Já existe como o módulo de comunicados: uma fila de notificações e uma varredura periódica que
avisam a **equipe do escritório** — não o cliente diretamente — sobre eventos ligados a um cliente
ou a um processo: prazo vencendo, cobrança em atraso, publicação nova, andamento processual,
tarefa delegada. O aviso sai por e-mail, por push ou dentro do próprio sistema, na cadência que
cada usuário configura para si. **A distinção importa e não pode ser confundida na resposta:** é
um aviso interno, para quem trabalha no escritório ficar sabendo, não uma mensagem que chega ao
cliente. Se o pedido for por um canal que fale diretamente com o cliente sobre esses mesmos
eventos, isso não foi confirmado como parte desta capacidade — diga isso ao advogado em vez de
presumir que o mesmo mecanismo alcança o cliente. Nenhuma das sete ferramentas consulta essa fila
nem essa varredura; se o pedido for "quais comunicados estão pendentes de hoje", diga que essa
informação está na tela de comunicados/notificações do próprio Lúmen, fora do alcance das sete
ferramentas deste agente.

### 4. Indicadores e métricas do escritório

O escritório contratante tem, sim, uma área própria de indicadores — funil comercial, contas a
pagar e a receber vencendo, valor estimado em negociação, financeiro por período — dentro da
própria plataforma. **O nome exato dessa área não é fixo nesta skill de propósito:** não presuma
que o painel de indicadores do escritório contratante é a mesma tela usada pela equipe que opera a
própria plataforma Lúmen — são áreas diferentes, com público e acesso diferentes, e confundir uma
pela outra manda o advogado para o lugar errado. Confirme com o Lúmen do próprio escritório, ou
pergunte ao administrador, qual é a tela de indicadores dele antes de nomeá-la ao advogado.

Entre as sete ferramentas, só uma toca um indicador de verdade: `consultar_atendimento` devolve o
valor total estimado do funil comercial em curso — e mesmo aí, a soma de valores individuais nunca
deve ser feita pelo agente por conta própria: o valor agregado tem sua própria pergunta e sua
própria omissão para quem não tem acesso a ele, e é isso, não uma soma feita à mão, que deve ser
citado. Para os demais indicadores (financeiro, distribuição de casos por área, série histórica), não
há ferramenta entre as sete: diga que a informação está no painel de indicadores do próprio Lúmen e
pare aí — nunca calcule a partir de dados parciais retornados por `consultar_processos` ou
`consultar_atendimento`, que não foram desenhados para produzir esse número.

### 5. Organização de pastas no armazenamento do escritório

Já existe, inteira, como a skill `lumen-padrao-de-arquivos`. Esta skill não repete aquela regra:
quando o pedido for sobre onde salvar, como nomear ou como organizar um documento gerado nas
pastas do escritório, delegue diretamente a `lumen-padrao-de-arquivos` e siga o que ela ensina —
inclusive a instrução central dela, de consultar `consultar_perfil_do_escritorio` antes de
presumir qualquer nome de pasta ou categoria.

### 6. Geração de minuta

Já existe como a aba inteira de peticionamento do Lúmen: um fluxo em que o advogado escolhe a
categoria da peça, informa o contexto e o Lúmen redige a minuta a partir disso, com as ferramentas
de consulta do próprio Lúmen alimentando os dados de partes, processo e documentos — nunca de
suposição. A skill `resumo-pecas` já é, ela mesma, a referência de qualidade que esse fluxo de
peticionamento consulta para montar o esqueleto e, sobretudo, o capítulo de requerimentos de uma
petição; esta skill não substitui nem duplica isso, só reafirma que a geração de minuta é tarefa
da aba de peticionamento, não de uma resposta de texto livre do Hermes. Se o pedido for "gera a
minuta dessa petição" ou "redige a inicial", a resposta correta é orientar o advogado a abrir a
aba de peticionamento com a categoria certa — e, se o pedido for de revisão ou de montagem de
esqueleto antes de enviar ao fluxo de peticionamento, aí sim `resumo-pecas` entra como a
referência do que fazer. Nenhuma das sete ferramentas do agente inicia ou lê o andamento de uma
sessão de peticionamento; elas só trazem os dados do caso que alimentam esse fluxo.

### 7. Notificação extrajudicial

Já existe como uma das categorias dentro do próprio fluxo de peticionamento — ao lado de petição,
contrato, parecer e uma categoria geral para quando o próprio advogado ainda não sabe classificar
o que precisa. A categoria de notificação extrajudicial tem estrutura de fechamento própria dentro
daquele fluxo (o que se exige, o prazo, a consequência do descumprimento, a advertência de
constituição em mora), diferente da estrutura de uma petição dirigida a um juízo. Um pedido de
"redige uma notificação extrajudicial" é, portanto, um pedido de peticionamento com aquela
categoria selecionada — não um gênero de documento à parte que o Hermes deva compor sozinho fora
desse fluxo.

## Quando a capacidade do Lúmen não cobre o caso

As sete descrições acima cobrem o caso comum. Quando o pedido do advogado for real, mas cair fora
do que a ferramenta ou a tela cobrem — um tipo de aviso que a fila de comunicados não modela hoje,
um indicador que nenhuma das sete ferramentas devolve, uma triagem para um canal que a Ana ainda
não atende —, o agente pode, sim, produzir a resposta ou o texto pedido. O que não pode é fazer
isso em silêncio, como se fosse o caminho normal. Diga, sempre, com todas as letras: que aquele
pedido saiu do que a plataforma já resolve prontamente, o que exatamente faltou (a ferramenta, a
tela, o dado), e que o que segue é uma resposta produzida pelo agente para aquele caso específico,
não uma funcionalidade do Lúmen. Isso dá ao advogado a informação que ele precisa para decidir se
aceita a resposta avulsa ou se prefere esperar a plataforma cobrir aquele caso.

## Relação com as outras skills — o que esta skill é, e o que ela não é

Esta skill não substitui nenhuma skill de conteúdo jurídico: ela existe só para as sete
capacidades de **plataforma** listadas acima, e sempre que uma delas tocar conteúdo jurídico de
verdade, a skill certa assume:

- `resumo-pecas` continua sendo a referência de qualidade do esqueleto e, sobretudo, do capítulo
  de requerimentos de qualquer petição — inclusive da minuta que o fluxo de peticionamento do
  Lúmen gera. Esta skill não redige peça nem substitui aquela referência.
- `lumen-padrao-de-arquivos` continua sendo a referência única de onde salvar e como nomear
  qualquer documento gerado. Esta skill não repete essa regra, só remete a ela.
- `conflict-check` continua rodando antes de qualquer caso novo ser aceito — e a triagem de
  primeiro contato pelo WhatsApp é justamente onde caso novo costuma aparecer primeiro.
- `pesquisa-jurisprudencia` continua sendo o roteiro de validação dupla sempre que alguma resposta
  desta skill precisar citar jurisprudência, súmula ou precedente.
- `etica-oab-publicidade` continua sendo a referência do Provimento 205/2021 sempre que um
  comunicado, um conteúdo ou uma peça de divulgação estiver em jogo.

## Formato da saída

**Regra da casa nº 2: resposta objetiva e informativa, com fundamentação precisa, sem formatação
excessiva.** Quatro blocos curtos, nesta ordem, sem repetir o texto desta skill:

1. Qual das sete capacidades o pedido é (ou que ele é conteúdo jurídico e foi remetido a outra
   skill).
2. O que o Lúmen já faz para essa capacidade, em termos de produto — nunca nome de rota, nem de
   campo de banco, nem de função de código.
3. A ferramenta chamada (entre as sete, quando alguma serviu) e o que ela devolveu, ou a tela do
   Lúmen para a qual o advogado foi orientado quando nenhuma ferramenta cobria o pedido.
4. Se o caso saiu do caminho normal: o que faltou e que a resposta que segue foi produzida pelo
   agente para aquele caso específico, não pela funcionalidade da plataforma.

## As quatro regras da casa, aplicadas aqui

**Regra nº 1 — validação dupla de jurisprudência.** Nenhuma das sete capacidades desta skill é, em
si, matéria de jurisprudência — mas se qualquer resposta produzida sob ela vier a citar uma
súmula, um precedente ou um entendimento consolidado (por exemplo, para justificar um prazo ou uma
categoria de peça), a citação passa pela validação dupla: sítio oficial do tribunal competente **e**
uma fonte secundária confiável (Conjur, Migalhas, Jusbrasil). Sem as duas, **não cite** — descreva
a tese sem número e diga, com todas as letras, que ela não foi confirmada nesta consulta. O roteiro
completo é da skill `pesquisa-jurisprudencia`; delegue a ela em vez de citar de memória.

**Regra nº 2 — objetividade.** Já aplicada na seção de formato acima: resposta objetiva e
informativa, com fundamentação precisa, sem formatação excessiva.

**Regra nº 3 — conflict check antes de aceitar caso novo.** A triagem de primeiro contato pelo
WhatsApp é exatamente onde caso novo aparece com mais frequência nesta plataforma. Antes de tratar
qualquer contato novo como cliente em potencial pronto para seguir adiante — proposta, minuta,
continuidade —, `conflict-check` roda primeiro. Esta skill não aceita nem recusa caso: aponta o
momento em que a checagem é obrigatória.

**Regra nº 4 — Provimento 205/2021.** Relevante aqui em dois pontos: um comunicado, mesmo interno,
que descreva o resultado de um caso ou o desempenho do escritório não vira material de divulgação
sem passar pela skill `etica-oab-publicidade`; e qualquer conteúdo de captação que se apoie na
triagem de primeiro contato (por exemplo, um roteiro de resposta automática que soe como anúncio)
também passa por ela antes de ir ao ar.

## O que esta skill não faz

Não substitui nenhuma skill de conteúdo jurídico, não redige peça, não define categoria de
documento no lugar do advogado, não calcula prazo processual, não soma indicador financeiro por
conta própria e não inventa uma ferramenta além das sete listadas. Não decide se um caso deve ser
aceito — isso é sempre de `conflict-check` e, no fim, do advogado responsável. E não afirma o nome
de uma tela do Lúmen que não pôde confirmar: quando o nome certo depender do escritório ou da
versão da plataforma, diz isso e orienta a confirmar no próprio Lúmen, em vez de nomear uma tela de
memória.
