---
name: preparacao-audiencias
description: >
  Preparação de audiência de instrução, conciliação, mediação, oitiva de testemunha ou
  depoimento pessoal — pontos controvertidos extraídos da decisão saneadora ou do confronto entre
  inicial e contestação, roteiro de perguntas para testemunha própria e para a testemunha
  contrária, prova ainda a produzir ou requerer na própria audiência, riscos do depoimento do
  cliente e da parte contrária, e checklist do que levar. Use SEMPRE que houver audiência
  agendada — de instrução, conciliação, mediação, justificação, oitiva ou depoimento pessoal —
  para preparar o advogado e, quando for o caso, o cliente que vai depor.
---

# Preparação de audiência — o que garante que nada se perde na hora

Audiência não se refaz. Uma petição malfeita se corrige com uma emenda; um depoimento
contraditório, uma pergunta que não foi feita, uma testemunha que chegou sem saber o que ia
acontecer — isso fica na ata e no sistema de gravação, e não há segunda chance dentro do mesmo
ato. Esta skill existe para que a preparação não dependa da memória do advogado na véspera, e
para que o cliente que vai depor entenda o que vai acontecer sem que ninguém precise, para isso,
lhe dizer o que responder.

## Gatilhos — quando rodar

- Audiência de instrução e julgamento, com produção de prova testemunhal ou depoimento pessoal.
- Audiência de conciliação ou mediação, quando há necessidade de roteiro de negociação e de
  pontos inegociáveis.
- Oitiva de testemunha isolada, justificação, ou audiência de exibição de documento.
- Qualquer audiência em que o cliente for prestar depoimento pessoal, presencial ou por
  videoconferência.

## Parada obrigatória: sem os insumos abaixo, o roteiro não é confiável

O trabalho começa quando estes itens estiverem disponíveis. Faltando algum, a resposta é uma só:
liste o que falta, peça, e pare — um roteiro montado sobre pontos controvertidos supostos, e não
os que o processo realmente fixou, direciona a pergunta errada na hora errada.

1. **O tipo de audiência** e o formato (presencial, por videoconferência, híbrido) e a data.
2. **Qual polo o cliente ocupa** no processo, e se ele próprio vai depor.
3. **Os pontos controvertidos fixados** — pela decisão saneadora, quando houver, ou pelo
   confronto entre o que a inicial afirma e o que a contestação nega ou impugna, quando não
   houver saneador formal.
4. **As provas já deferidas** para aquela audiência e o **rol de testemunhas** de cada lado, com
   o que se sabe sobre a relação de cada testemunha com os fatos e com as partes.
5. **O que já consta dos autos** sobre a versão do cliente — petição inicial, contestação,
   réplica, depoimento anterior se houver — porque o depoimento em audiência precisa ser
   coerente com o que já foi dito por escrito, não uma versão nova.

Se a audiência envolver litisconsorte, assistente ou terceiro que ainda não passou por checagem
de conflito — por exemplo, um novo réu chamado ao processo cuja entrada ainda não foi avaliada —
a skill `conflict-check` roda antes de se preparar roteiro que envolva esse participante.

## Passo 1 — Pontos controvertidos

Extraia os pontos controvertidos da fonte disponível, na ordem de preferência: a decisão
saneadora, quando fixou expressamente; a ata de audiência anterior, se a instrução já começou em
sessão anterior; e, na falta de ambas, o confronto direto entre cada afirmação de fato da inicial
e a resposta correspondente na contestação — o que foi impugnado especificamente é controvertido,
o que não foi impugnado se presume incontroverso e não precisa de prova em audiência.

Liste os pontos controvertidos numerados, e para cada um diga qual prova foi deferida para
esclarecê-lo (testemunhal, depoimento pessoal, documental complementar, pericial já produzida). Um
ponto controvertido sem prova deferida para ele é sinal de que a produção de prova ficou
incompleta — sinalize isso antes da audiência, não durante.

## Passo 2 — Roteiro de perguntas

Monte três roteiros separados, porque a lógica de cada um é diferente:

**Para a testemunha própria.** Perguntas abertas e não indutivas, dirigidas a cada ponto
controvertido que aquela testemunha pode esclarecer — pergunte o que ela viu ou soube, não
confirme para ela o que se espera que responda. Inclua a pergunta de qualificação (relação com as
partes, se tem interesse no resultado) porque a contraparte vai perguntar isso na contradita, e é
melhor que a resposta apareça primeiro pelo lado que a arrolou.

**Para a testemunha da parte contrária.** Perguntas que testem a consistência do que ela disse
com o que já está nos autos, com o que outra testemunha já disse, e com a lógica dos fatos.
Pergunte por detalhes concretos (data, hora, quem mais estava presente, como ela soube) — a
versão fabricada costuma resistir à pergunta geral e falhar na pergunta específica.

**Para o depoimento pessoal — do cliente e da parte contrária.** Para o cliente, organize as
perguntas que o advogado da parte contrária provavelmente fará, na ordem em que ele provavelmente
fará, para que o cliente as veja antes e não pela primeira vez sob pressão. Para a parte
contrária, monte perguntas que confrontem a versão dela com documento já juntado ou com
depoimento de testemunha já colhido, buscando confissão ou contradição.

## Passo 3 — Prova a produzir

Liste o que ainda falta providenciar antes da audiência ou requerer nela mesma: documento
faltante que pode ser levado no ato, quesito de perícia pendente de complementação, pedido de
oitiva por carta precatória ou por videoconferência quando a testemunha não puder comparecer,
pedido de inversão da ordem de produção de prova quando isso favorecer a estratégia. Uma
audiência sem essa checagem prévia frequentemente descobre a falta de prova só quando já é tarde
para supri-la naquela sessão.

## Passo 4 — Riscos do depoimento

Aponte, sem instruir o cliente a dizer o que não é verdade, onde o depoimento dele corre risco:

- **Pontos de possível contradição** com o que já consta nos autos — se o cliente disser algo
  diferente do que já afirmou por escrito, isso pesa contra a credibilidade da versão inteira, não
  só do ponto específico.
- **Temas que a parte contrária vai explorar** — a fragilidade já conhecida do caso, o documento
  que falta, a testemunha que pode contradizer.
- **Orientação de comportamento**, não de conteúdo: responder ao que foi perguntado sem
  antecipar explicações não pedidas, pedir esclarecimento quando não entender a pergunta, manter
  a versão coerente com o que já está nos autos porque é a versão verdadeira, não porque foi
  combinada para a audiência. Esta skill nunca orienta o cliente a dizer algo diferente do que
  aconteceu — orienta a dizer, com clareza, o que aconteceu.

## Passo 5 — O que levar

Checklist prático, ajustado ao tipo de audiência: procuração e eventual substabelecimento,
documento original quando a autenticidade puder ser questionada, cópia da petição inicial, da
contestação e da réplica, rol de testemunhas e comprovante de intimação delas, quesitos de
perícia se ainda pendentes, comprovante da própria intimação para a audiência. Para audiência
virtual, confirme com antecedência a plataforma, o link e se o cliente e as testemunhas têm o
equipamento e a conexão necessários — problema técnico na hora da audiência tem o mesmo efeito
prático de uma testemunha que não compareceu.

## Formato da saída

**Regra da casa nº 2: resposta objetiva e informativa, fundamentação precisa, sem formatação
excessiva.** Cinco blocos curtos:

1. Pontos controvertidos, numerados, com a prova deferida para cada um.
2. Roteiro de perguntas — testemunha própria, testemunha contrária, depoimento pessoal.
3. Prova ainda a produzir ou requerer na audiência.
4. Riscos do depoimento e orientação de comportamento.
5. Checklist do que levar e a checagem de logística, quando virtual.

## As quatro regras da casa, aplicadas aqui

**Regra nº 1 — validação dupla.** Se o roteiro invocar entendimento sobre o valor de um tipo de
prova, sobre contradita de testemunha ou sobre confissão ficta, essa citação de jurisprudência ou
súmula passa pela validação dupla — sítio oficial do tribunal **e** fonte secundária confiável
(Conjur, Migalhas, Jusbrasil); sem as duas, não cite — descreve-se a tese sem número. O roteiro
de busca e validação é da skill `pesquisa-jurisprudencia`.

**Regra nº 2 — objetividade.** Já é o formato acima: objetivo e informativo, com fundamentação
precisa, sem formatação excessiva — sem tabela decorativa nem repetição do processo inteiro.

**Regra nº 3 — conflict check antes de aceitar caso novo.** Litisconsorte, assistente ou terceiro
que vai participar da audiência e ainda não passou por checagem de conflito espera a skill
`conflict-check` antes de entrar em qualquer roteiro de preparação que o envolva.

**Regra nº 4 — Provimento 205/2021.** Nenhum relato de audiência, depoimento marcante ou
resultado obtido nela vira material de divulgação, ainda que anonimizado — uso de caso concreto e
depoimento de cliente são vedados pelo Provimento 205/2021, e qualquer peça de divulgação
derivada de uma audiência passa antes pela skill `etica-oab-publicidade`.

## O que esta skill não faz

Não testemunha nem substitui a presença do advogado na audiência. Não decide se o cliente deve
ou não prestar depoimento pessoal — essa é decisão estratégica do advogado responsável. Não
orienta o cliente a alterar a versão dos fatos: orienta apenas a dizer, com clareza e coerência
com os autos, o que de fato aconteceu. E não garante o resultado da audiência nem da instrução —
isso depende do que acontece na sessão, não do roteiro preparado antes dela.
