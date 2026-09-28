---
name: pecas-juridicas-html
description: >
  Formata petição, contestação, recurso, memorial ou parecer como página HTML pensada para virar
  PDF com aparência de documento jurídico impresso — nunca como página de site. Cuida da FORMA:
  margens, numeração de página, quebra de página controlada, fonte legível em papel, ausência de
  animação e de cor decorativa, e o que costuma quebrar na conversão para PDF (tabela larga
  demais, imagem sem dimensão declarada, texto que depende de rolagem, link cujo destino some no
  papel). A identidade visual — timbrado, logotipo, cor, cabeçalho — nunca é embutida por esta
  skill: ela é sempre consultada no perfil do escritório contratante, a cada peça, e nunca copiada
  de exemplo nem de memória de outra sessão. O conteúdo da peça — esqueleto, fatos, fundamentos e
  sobretudo o capítulo de requerimentos — não é desta skill: é da `resumo-pecas`, que esta skill
  consulta e nunca duplica. Use SEMPRE que for preciso gerar, diagramar, "deixar pronta para
  juntar", "formatar para impressão" ou "exportar em PDF" uma petição inicial, contestação,
  reconvenção, recurso, memorial ou parecer; quando o advogado pedir para "montar o arquivo para
  protocolo", "ajustar o layout antes de assinar" ou "por que a peça saiu cortada/com tabela
  estourando no PDF"; e como referência de forma que o agente de peticionamento do Lúmen consulta
  ao montar o documento final — nunca como substituto dele.
---

# Peça jurídica em HTML — documento para imprimir, não página para navegar

Esta skill formata; não redige. Uma peça processual em HTML tem um destino que decide tudo o que
vem abaixo: ela vai virar um arquivo impresso ou um PDF anexado a um protocolo, lido por um juízo,
por um perito, pela parte contrária, quase sempre em papel ou numa tela que emula papel — nunca
rolada num feed, nunca vista por alguém que espera uma experiência interativa. O defeito que esta
skill existe para evitar não é falta de beleza: é a peça que ficou bonita na tela e saiu ilegível,
cortada ou com a tabela estourando a margem no PDF que foi de fato protocolado, porque quem a
montou pensou em página web quando devia pensar em documento. Um erro de conteúdo o advogado
revisa antes de assinar; um erro de diagramação que só aparece na impressão às vezes só aparece
depois que a peça já saiu da mesa dele.

## Gatilhos — quando rodar

- Geração de petição inicial, contestação, reconvenção, embargos, recurso, memorial ou parecer em
  HTML, com a intenção declarada ou implícita de exportar para PDF e imprimir ou protocolar.
- Pedido para "deixar pronta para juntar", "formatar para impressão", "ajustar o layout antes de
  assinar" ou "gerar o arquivo final" de uma minuta que já tem conteúdo pronto.
- Revisão de uma peça que "saiu estranha" no PDF: tabela cortada, imagem esticada, texto que some,
  link que não serve para nada no papel, numeração de página ausente ou errada.
- Consulta do agente de peticionamento do Lúmen, durante a montagem automática de uma minuta, para
  conferir se a diagramação final segue o padrão de documento desta casa.

## Relação com a resumo-pecas e com o peticionamento do Lúmen — o que esta skill é, e o que ela não é

Esta skill **não monta o esqueleto da peça nem escreve o capítulo de requerimentos**. Isso é
trabalho da `resumo-pecas`: endereçamento, qualificação das partes, fatos, fundamentos por tese e,
sobretudo, a estrutura do pedido — cumulação própria ou imprópria, pedido subsidiário ou
alternativo, tutela provisória em capítulo próprio. Quando o conteúdo ainda não estiver montado
nessa estrutura, esta skill não avança sozinha: ela pede que a `resumo-pecas` rode primeiro, ou
que o agente de peticionamento do Lúmen entregue o conteúdo já estruturado, e só então aplica a
forma. Repetir aqui a regra do requerimento — o que é pedido genérico legítimo, o que é
implícito, a ordem entre principal e subsidiário — seria duplicar uma regra que já existe em outro
lugar e arriscar as duas versões divergirem com o tempo; por isso esta skill não trata de nada
disso, nem por resumo. O que ela recebe do conteúdo é texto pronto, já dividido em seções (
endereçamento, qualificação, fatos, fundamentos, requerimentos, fecho), e a tarefa dela é
transformar essas seções num documento que sobrevive à impressão.

A mesma divisão vale para o dado de escritório e de caso: nome das partes, número de processo,
teses e precedentes vêm de quem montou o conteúdo (a `resumo-pecas`, o peticionamento do Lúmen ou
o próprio advogado) — esta skill nunca inventa, corrige ou reescreve conteúdo jurídico enquanto
formata. Se, ao diagramar, esta skill perceber um problema de conteúdo — um pedido sem fato que o
sustente, uma tese sem fundamento — ela **aponta** o problema ao advogado; não o conserta por
conta própria, porque corrigir mérito não é o papel de uma skill de forma.

## Parada obrigatória: sem os insumos abaixo, a peça não se formata

O trabalho começa quando estes itens estiverem disponíveis. Faltando qualquer um, a resposta é uma
só: liste o que falta, peça, e pare. Formatar sobre conteúdo incompleto produz um documento
bonito e errado, que é pior do que nenhum documento, porque a aparência de pronto convida a
assinar sem reler.

1. **O conteúdo da peça, já estruturado** pela `resumo-pecas` ou pelo agente de peticionamento do
   Lúmen — endereçamento, qualificação, fatos, fundamentos e requerimentos prontos, não um
   rascunho solto que ainda precisa de organização de mérito.
2. **O tipo de peça e o destino dela** — protocolo eletrônico, impressão para juntada física,
   envio por e-mail para leitura — porque isso muda o que precisa ser mais rígido na diagramação
   (protocolo eletrônico tolera menos variação de fonte incorporada; impressão física exige
   verificar a margem de encadernação).
3. **O perfil do escritório contratante**, consultado agora, não lembrado de uma peça anterior —
   ver Passo 1.
4. **Qualquer anexo que vá compor o mesmo arquivo** (documento, imagem, tabela de cálculo), com a
   informação de tamanho e formato de cada um, porque isso determina se ele cabe na página sem
   distorcer ou sem cortar.

## Passo 1 — Identidade visual: consulta, nunca embute

Nenhuma cor, nenhum logotipo, nenhum cabeçalho timbrado, nenhuma fonte de marca entra nesta peça
por decisão desta skill. A identidade visual pertence ao escritório contratante, e cada escritório
tem a própria — dois escritórios que usam o Lúmen não têm o mesmo timbrado, e um timbrado escrito
dentro de uma skill de plataforma chegaria ao agente de todos os outros como se fosse deles.
Antes de montar qualquer cabeçalho ou rodapé visual, chame:

```
consultar_perfil_do_escritorio
```

Ela devolve, para o escritório de quem está pedindo a peça, o que existir de identidade cadastrada
— nome do escritório, e o que mais estiver configurado como padrão de documento daquele
contratante. Use exatamente o que a consulta devolveu. Duas situações, e cada uma tem conduta
própria:

- **Se o perfil devolver identidade configurada**, aplique-a como consultada — sem "melhorar" a
  cor, sem trocar a fonte por uma que "combina mais", sem adicionar elemento que a consulta não
  trouxe.
- **Se o perfil não tiver identidade configurada, isso é situação normal, não erro.** Monte a
  peça num padrão neutro — texto em preto sobre fundo branco, sem cabeçalho de marca — e diga ao
  advogado, na saída, que a identidade do escritório não estava cadastrada e onde ela se
  configura. **Nunca** invente um timbrado nem tome emprestado o de outra peça ou de outro
  contratante como padrão provisório.

O dado de partes, processo e documentos do caso, quando precisar aparecer na peça, vem das mesmas
sete ferramentas de sempre — `consultar_perfil_do_escritorio`, `consultar_processos`,
`consultar_atendimento`, `buscar_cliente`, `consultar_historico_cliente`, `consultar_documentos` e
`consultar_assessorias` — nunca de suposição. São essas sete, e só essas sete.

## Passo 2 — Documento jurídico, não página web

Uma peça processual não é uma landing page, e cada recurso visual que pertence à web e não ao
papel é um risco de descrédito na peça, não um adorno. Nesta formatação:

- **Nada de animação, transição ou efeito de hover.** Papel não anima, e PDF gerado a partir de
  HTML com animação captura, na melhor das hipóteses, um quadro qualquer da transição — na pior,
  quebra a renderização inteira daquele trecho.
- **Nada de cor decorativa.** Cor de destaque, fundo colorido de caixa, ícone colorido — tudo isso
  presume impressão colorida, e a peça vai ser lida, com frequência real, impressa em preto e
  branco ou numa tela que a converte para tons de cinza. Se uma cor vira cinza ilegível ou
  desaparece, ela nunca devia estar carregando informação sozinha. Use apenas o preto do texto e,
  quando o próprio padrão do escritório previr um traço de identidade, o que a consulta do Passo 1
  devolveu — nunca uma cor de escolha própria desta skill.
- **Nada de elemento interativo** — botão, campo de formulário, acordeão que esconde texto até um
  clique. Tudo que a peça precisa dizer tem de estar visível na página impressa, sem exigir uma
  ação que o papel não permite.
- **Fonte legível em papel**, de família serifada ou não conforme o padrão do escritório, em corpo
  que não force o leitor a aproximar os olhos — o tamanho de corpo de texto corrido de documento
  formal, não o tamanho miúdo comum em interface de tela. Espaçamento entre linhas generoso o
  bastante para não amontoar o texto quando impresso.
- **Estrutura semântica, não visual**: títulos de seção como títulos de verdade (não texto maior
  em negrito solto), parágrafos como parágrafos, listas como listas. Isso não é estética — é o que
  faz o leitor de PDF, o software de indexação do protocolo eletrônico e a tela de leitura de um
  perito com dificuldade visual entenderem a peça como o documento estruturado que ela é.

## Passo 3 — Margens e quebra controlada resolvem no HTML; numeração e cabeçalho repetido dependem do motor de conversão

Página impressa tem regra própria, e o HTML de tela ignora essa regra por padrão — por isso ela
precisa ser escrita explicitamente. Mas nem toda regra de página se garante só por escrevê-la no
HTML: numeração de página e cabeçalho ou rodapé repetido em cada folha dependem de **qual motor
faz a conversão para PDF**, e os dois caminhos mais comuns de conversão se comportam de formas
opostas. Por isso este passo separa o que o HTML resolve sozinho do que não resolve.

### O que o HTML resolve sozinho, em qualquer caminho de conversão

- **Margens compatíveis com impressão e, quando o destino for juntada física, com encadernação** —
  margem generosa o bastante para não cortar texto na borda da folha e para deixar espaço de
  perfuração ou grampo sem tocar conteúdo.
- **Quebra de página controlada, nunca deixada ao acaso do motor de conversão**: título de seção
  não fica sozinho na última linha de uma página com o corpo da seção na página seguinte; tabela
  não é cortada no meio de uma linha; bloco de assinatura nunca fica separado do nome que o
  precede. Regras de quebra evitável (manter título com o parágrafo seguinte, evitar corte dentro
  de uma linha de tabela, evitar folha órfã com uma única linha) valem sempre, mesmo que o
  conteúdo mude de tamanho depois. Essas regras de fragmentação do conteúdo costumam ser
  respeitadas pela maioria dos caminhos de conversão, inclusive o baseado em navegador — ao
  contrário da numeração e do cabeçalho repetido, tratados a seguir.

### O que depende do motor de conversão: numeração de página e cabeçalho/rodapé repetido

Numeração e cabeçalho ou rodapé repetido em cada página não nascem no corpo do documento — nascem
de uma área de página reservada para esse fim, e essa área só é preenchida por quem implementa essa
parte da conversão. Dois comportamentos, opostos entre si:

- **Motor baseado em navegador** (o caminho mais comum de conversão, inclusive "imprimir" ou "salvar como PDF" pelo próprio navegador): não implementa as caixas de margem de página do CSS, e o rodapé declarado no documento simplesmente não aparece nesse caminho, por mais certo que o HTML esteja. Numeração e cabeçalho repetido, aqui, só existem se forem configurados no próprio conversor, fora do HTML — decisão de quem opera o conversor, não algo que este documento resolve sozinho.
- **Motor de paginação dedicado** (o que implementa por completo a área reservada de página): a
  numeração e o cabeçalho repetido saem do próprio documento, exatamente como escritos nele.

Como consequência, esta skill nunca declara numeração de página ou cabeçalho repetido como
resolvidos só porque o HTML foi escrito certo. Em vez disso:

1. **Declare, na saída, para qual motor de conversão este HTML foi preparado** — baseado em navegador ou motor de paginação dedicado. Se isso não estiver claro, pergunte antes de prosseguir — não presuma o caminho mais comum só para simplificar.
2. **Se o motor for baseado em navegador**, diga explicitamente que a numeração de página e o
   cabeçalho ou rodapé repetido precisam ser configurados no conversor, fora deste documento, e
   que o HTML sozinho não os produz nesse caminho — para que quem gerar o PDF saiba, antes de
   juntar a peça aos autos, que falta esse passo.
3. **Se o motor for de paginação dedicada**, escreva a numeração e o cabeçalho ou rodapé repetido
   na área reservada de página, com o total de páginas quando o padrão do escritório previr isso, e
   com o que o perfil do escritório definir (Passo 1) — sem variar de aparência de uma página para
   outra dentro do mesmo documento.

A exigência de numerar e de repetir o cabeçalho não fica mais fraca por causa disso: uma peça de
várias páginas sem numeração continua impossível de referenciar em manifestação posterior ("vide
fl. 3") e mais fácil de extraviar uma folha sem ninguém notar. O que muda é que esta skill deixa de
prometer que o HTML, sozinho, resolve isso em qualquer caminho de conversão — ela declara a
premissa e diz o que falta quando o caminho escolhido não permitir.

## Passo 4 — O que quebra na conversão para PDF, e como evitar cada quebra

Estes são os defeitos que aparecem quase sempre que uma peça em HTML vira PDF sem que alguém tenha
pensado neles de propósito. Confira cada um antes de considerar a peça pronta:

- **Tabela mais larga que a página.** Uma tabela de valores, cálculo de liquidação ou cronograma
  que exceda a largura útil da folha é cortada ou espremida de forma ilegível na conversão. Quebre
  o conteúdo em tabelas mais estreitas, reduza o número de colunas ao essencial, ou — quando a
  tabela for de fato extensa — organize-a em blocos que caibam na largura da página, nunca conte
  com rolagem horizontal, que não existe no papel.
- **Imagem sem dimensão declarada.** Uma imagem inserida sem largura e altura fixadas no HTML
  pode sair no tamanho original do arquivo, que raramente é o tamanho certo da página — e o motor
  de conversão para PDF nem sempre a redimensiona de forma previsível. Declare sempre a dimensão
  da imagem em unidade compatível com impressão, verifique que ela cabe na largura útil da página
  e que a proporção não ficou distorcida.
- **Texto que depende de rolagem.** Qualquer bloco com altura fixa e conteúdo que só aparece
  rolando — uma caixa de observações, um trecho longo dentro de um contêiner de altura limitada —
  perde, no papel, tudo o que estava abaixo da dobra visível. Papel não rola. Todo o texto da peça
  precisa estar visível sem depender de altura de contêiner nenhuma; se o conteúdo for extenso,
  ele ocupa quantas páginas precisar, nunca fica escondido dentro de uma caixa de rolagem.
- **Link cujo destino some no papel.** Um link em HTML mostra o texto âncora e esconde o endereço
  de destino — no papel, o clique não existe, e o endereço desaparece com ele. Quando o endereço
  de destino for parte relevante da informação (um site de tribunal, um repositório de
  jurisprudência, um link de comprovação), escreva o endereço por extenso ao lado do texto do
  link, exatamente como precisaria ser digitado à mão, em vez de confiar no clique que o papel não
  tem. Quando o destino não for essencial à peça, prefira nem usar o link — descreva a referência
  em texto corrido.
- **Fonte não incorporada ou não suportada pelo motor de conversão.** Uma fonte que depende de
  carregamento externo pode não estar disponível no momento da conversão e ser substituída por
  outra sem aviso, mudando a paginação inteira sem que ninguém tenha pedido isso. Prefira fontes
  amplamente suportadas e verifique, antes de considerar a peça pronta, que o PDF gerado usa a
  fonte esperada e mantém a paginação estável.

## Passo 5 — Assinatura e qualificação final

O bloco de encerramento é o que dá à peça a autoria e a validade formal que ela precisa para ser
levada a sério. Ele contém, quando pertinente ao tipo de peça:

- **Local e data**, no padrão de redação formal — nunca uma data fixada de memória: a data que
  entra é a da efetiva finalização, e o local é o que o perfil do escritório ou o processo
  indicarem.
- **O nome do advogado subscritor e sua qualificação profissional**, exatamente como consultados
  — nunca digitados de memória nem copiados de uma peça anterior. Quando houver mais de um
  advogado subscrevendo, cada um entra com a própria qualificação, na ordem que o advogado
  responsável indicar.
- **Espaço de assinatura visualmente separado do corpo da peça**, sem quebra de página entre o
  nome do subscritor e o espaço de assinatura em si — ver a regra de quebra controlada do Passo 3.

Todo dado de qualificação do subscritor vem do Lúmen, consultado agora, e nunca de suposição desta
skill nem de memória de peça anterior do mesmo escritório: o advogado que assina uma peça pode
mudar de um caso para outro, e presumir o mesmo nome de sempre é o mesmo erro que gerar timbrado
de memória no Passo 1.

## Passo 6 — Checklist antes de exportar

Feche sempre com esta conferência, em ordem, antes de considerar o arquivo pronto para revisão do
advogado:

1. A identidade visual foi consultada no perfil do escritório, nunca embutida de memória, e a
   ausência de identidade cadastrada — se for o caso — foi tratada como situação normal, avisada
   ao advogado.
2. Nenhuma animação, cor decorativa ou elemento interativo restou na peça.
3. Margens seguem consistentes em todas as páginas, e **o motor de conversão está declarado**: se
   for baseado em navegador, o aviso de que a numeração de página e o cabeçalho ou rodapé repetido
   precisam ser configurados fora do documento está na saída; se for motor de paginação dedicada,
   os dois saem escritos no próprio HTML.
4. Nenhuma quebra de página deixa título órfão, tabela cortada ou assinatura separada do nome.
5. Nenhuma tabela excede a largura da página, nenhuma imagem está sem dimensão declarada, e nenhum
   bloco de texto depende de rolagem para ser lido inteiro.
6. Todo link com destino relevante para a peça tem o endereço escrito por extenso ao lado.
7. O bloco de assinatura e qualificação está completo, com dado consultado no Lúmen, não digitado
   de memória.
8. O conteúdo jurídico — pedido, fato, fundamento — não foi alterado, resumido nem reescrito por
   esta skill: continua exatamente o que a `resumo-pecas` ou o peticionamento do Lúmen entregaram.

## Formato da saída

**Regra da casa nº 2: resposta objetiva e informativa, fundamentação precisa, sem formatação
excessiva.** Seis blocos curtos, nesta ordem, sem repetir o texto inteiro da peça:

1. O que foi consultado no perfil do escritório para a identidade visual, e o que fazer se ela não
   estiver cadastrada.
2. **Para qual motor de conversão este HTML foi preparado**, e — se for um motor baseado em
   navegador — o aviso de que a numeração de página e o cabeçalho repetido precisam ser
   configurados no conversor, porque o documento sozinho não os produz. Se o motor não foi
   informado, esta linha é a pergunta ao advogado, não uma suposição.
3. Os pontos do Passo 4 que se aplicaram a esta peça (tabela, imagem, texto longo, link) e como
   cada um foi resolvido.
4. O bloco de assinatura e qualificação, com a origem do dado (Lúmen ou lacuna a preencher).
5. O checklist do Passo 6, com cada item marcado como cumprido ou pendente.
6. Uma linha final dizendo que o conteúdo jurídico não foi alterado por esta skill — quem quiser
   confirmar a estrutura do pedido consulta a `resumo-pecas`.

## As quatro regras da casa, aplicadas aqui

**Regra nº 1 — validação dupla.** Esta skill não pesquisa jurisprudência, mas quando o conteúdo
recebido já trouxer um precedente citado, a formatação não pode transformar uma citação com
etiqueta de "não confirmado" em uma citação com número, nem apagar a etiqueta ao diagramar. Toda
súmula ou precedente citado na peça só entra com número quando tiver passado pela validação dupla
— sítio oficial do tribunal competente **e** uma fonte secundária confiável (Conjur, Migalhas,
Jusbrasil). Sem as duas, **não cite**: mantenha a tese descrita sem número, sinalize isso
explicitamente na peça, e não "arrume" a citação para parecer mais completa na diagramação. O
roteiro de busca e validação é da skill `pesquisa-jurisprudencia`; delegue a ela quando a
validação ainda não tiver sido feita.

**Regra nº 2 — objetividade.** Já aplicada na seção de formato acima. Vale também dentro da
própria peça: a diagramação existe para tornar o documento legível e sóbrio, nunca para
acrescentar ênfase visual, caixa de destaque ou elemento gráfico que o conteúdo jurídico não pediu.

**Regra nº 3 — conflict check antes de aceitar caso novo.** Formatar peça para quem ainda não é
cliente da casa — minuta pedida antes de contrato firmado, parecer avulso — só acontece depois que
a skill `conflict-check` concluir. Uma peça bem diagramada para um caso que talvez não devesse ter
sido aceito não resolve nada; só torna o problema mais apresentável.

**Regra nº 4 — Provimento 205/2021.** Aqui a regra é concreta, não abstrata: uma peça com a
identidade visual do escritório, bem formatada e de resultado favorável, é exatamente o tipo de
material que alguém fica tentado a transformar em print de divulgação, "case de sucesso" ou
material de rede social — ainda que anonimizado. Esta skill formata peça processual para
protocolo ou envio ao cliente, nunca para publicidade. Qualquer peça que se pretenda usar como
material de divulgação ou marketing jurídico, a partir do conteúdo ou do resultado desta peça,
passa antes pela skill `etica-oab-publicidade`, sob o Provimento 205/2021 — e não sai daqui com a
identidade visual do escritório aplicada como se já estivesse liberada para esse uso.

## O que esta skill não faz

Não redige a peça, não decide a estratégia processual, não organiza fatos, fundamentos ou
requerimentos — isso é `resumo-pecas` e o peticionamento do Lúmen, e esta skill não roda antes de
o conteúdo estar pronto. Não pesquisa nem valida jurisprudência — isso é `pesquisa-jurisprudencia`.
Não embute nome, cor, logotipo ou cabeçalho de escritório algum: consulta o perfil, sempre, e
avisa quando não houver identidade cadastrada em vez de inventar uma. Não decide o destino do
arquivo (onde ele é salvo, se protocolado, se enviado) — quando a peça for salva em pasta do
escritório, quem manda no nome do arquivo e na pasta de destino é a `lumen-padrao-de-arquivos`, não
esta skill. E não corrige, por conta própria, um problema de mérito que perceba ao formatar — se
notar um pedido sem fato ou uma tese capenga enquanto diagrama, aponta ao advogado; não conserta
silenciosamente o conteúdo que outra skill produziu.
