---
name: pesquisa-jurisprudencia
description: >
  Roteiro executável de pesquisa de jurisprudência com validação dupla obrigatória. Monta as
  strings de busca (termos, sinônimos jurídicos, operadores, recorte temporal e de órgão), segue
  a ordem base primária → sítio oficial do tribunal → fonte secundária confiável, aplica o
  protocolo de dupla validação passo a passo, verifica entendimento divergente antes de citar e
  entrega mapa argumentativo com teses a favor, teses contra e precedentes-chave de cada lado.
  Use SEMPRE que for preciso localizar, confirmar ou citar acórdão, precedente vinculante ou não,
  súmula, orientação jurisprudencial, tese de repetitivo, incidente de resolução de demandas
  repetitivas ou entendimento de órgão administrativo — inclusive quando a citação for aparecer
  em peça, parecer, memorando, e-mail ou conteúdo de divulgação.
---

# Pesquisa de jurisprudência e validação dupla

**Regra da casa nº 1: nenhuma jurisprudência, precedente (vinculante ou não), súmula ou
orientação jurisprudencial é apresentada sem validação dupla — sítio oficial do tribunal E uma
fonte secundária confiável (Conjur, Migalhas, Jusbrasil). Se não for possível validar, isso é
sinalizado explicitamente. Precedente que não se conseguiu confirmar não é citado.**

Esta skill é o que torna essa regra executável. Sem roteiro, "validar" vira intenção: o modelo
produz um número plausível, o advogado assume que veio de algum lugar e o número entra na peça.
Acórdão inexistente citado em juízo não é erro técnico — é perda de credibilidade do advogado no
processo, e tem chegado a virar incidente próprio.

**Precedente não validado não é citado.** Essa é a regra, e ela não tem exceção por urgência,
por prazo curto nem por o precedente "ser conhecido".

**Princípio que resolve todo conflito interno desta skill: o risco de citar acórdão inexistente
ou superado é maior que o benefício de uma fundamentação mais densa. Prefira descrever a tese sem
número a inventar um número.** Uma tese bem descrita sem citação é argumento; uma citação falsa é
um defeito que contamina a peça inteira, inclusive as partes corretas.

## Jurisdição

As skills desta plataforma servem o país inteiro. **Não presuma estado, tribunal, rito local nem
competência.** O órgão relevante vem do caso — do cadastro e do contexto no Lúmen, ou da pergunta
do advogado. Se o caso não disser qual é o juízo ou tribunal competente, pergunte antes de
recortar a busca por órgão; uma pesquisa recortada no tribunal errado devolve resultado limpo e
inútil.

## Passo 1 — Traduzir o problema em termos de busca

Antes de digitar qualquer coisa, escreva em uma frase a **proposição jurídica** que se quer
provar, no formato "em situação X, a consequência é Y". Buscar por assunto ("plano de saúde")
devolve volume; buscar pela proposição devolve precedente.

Monte então quatro conjuntos de termos:

1. **Núcleo fático**: os fatos que caracterizam a hipótese, na linguagem da decisão, não na do
   cliente.
2. **Núcleo jurídico**: o instituto e a qualificação (o nome técnico do vício, do dever, da
   responsabilidade).
3. **Sinônimos e variantes**, porque cada tribunal ementa com o vocabulário dele. Inclua:
   sinônimo doutrinário e sinônimo forense da mesma coisa; a forma substantiva e a adjetiva; a
   grafia por extenso e a sigla do instituto; o termo usado pelo lado contrário (a ementa
   favorável muitas vezes usa a palavra do vencido); e o verbo típico do dispositivo.
4. **Termos de exclusão**: o homônimo que polui a busca e o ramo do direito vizinho que usa a
   mesma palavra com outro sentido.

Escreva **no mínimo três strings diferentes**, não uma. Uma string só é uma hipótese só:

- *String ampla*: núcleo jurídico + núcleo fático, sem exclusões, para medir o volume e descobrir
  o vocabulário que os julgados usam. Leia as dez primeiras ementas só para colher termos.
- *String precisa*: proposição inteira, com operador de proximidade entre o instituto e a
  consequência, mais exclusões.
- *String pelo avesso*: os termos que a decisão **contrária** usaria. Serve à verificação de
  divergência do passo 5, e não é opcional.

**Operadores.** Cada base implementa os seus, com sintaxe própria — confirme na ajuda da base em
vez de assumir. Os que costumam existir e que valem usar: aspas para expressão exata;
proximidade entre termos (o que evita o falso positivo de duas palavras certas em parágrafos
diferentes); conjunção e disjunção explícitas; exclusão; truncamento por radical, útil em
português por causa de flexão e gênero. Se a base não tiver proximidade, compense com expressão
exata mais um termo obrigatório.

**Recorte temporal.** Comece pelos dois ou três últimos anos e vá alargando. Julgado recente vale
mais por duas razões independentes: reflete o entendimento atual e tem menos chance de ter sido
superado sem que você perceba. Mas **não pare no recorte curto**: precedente antigo que fixou a
tese costuma ser o que interessa citar, e o recente é o que mostra que a tese continua viva.
Sempre que citar julgado com mais de cinco anos, confirme no passo 4 que ele não foi superado.

**Recorte de órgão.** Em ordem de utilidade: primeiro o órgão que vai julgar o caso; depois a
instância que o revisa; depois as cortes de superposição, quando a matéria for federal ou
constitucional. Precedente de outro tribunal estadual tem valor persuasivo, não vinculante —
pode ser citado, desde que apresentado como tal e não misturado com o que vincula.

## Passo 2 — A ordem da pesquisa

Nesta ordem, e sem pular etapa:

**1. Base primária de busca.** A base ampla de pesquisa jurisprudencial serve para **localizar
candidatos** e colher vocabulário — nada mais. O que sai dela é lista de hipóteses. Nunca cite
direto da base primária: o texto pode estar resumido, editado, com ementa remontada ou com dado
de identificação trocado.

**2. Sítio oficial do tribunal prolator.** É aqui que o precedente passa a existir. Busque pelo
número ou pelos termos no sistema de consulta de jurisprudência do próprio tribunal e abra o
inteiro teor, ou ao menos a ementa oficial e os dados do julgamento.

**3. Fonte secundária confiável** (Conjur, Migalhas, Jusbrasil). Serve para três coisas que o
sítio oficial não dá de graça: confirmar que a leitura que você fez da tese é a leitura corrente;
apanhar notícia de alteração, modulação, embargos ou afetação; e mostrar como o precedente vem
sendo aplicado depois.

Consultar as duas últimas é obrigatório, **em fontes independentes entre si**. Duas páginas que
reproduzem o mesmo texto de origem são uma fonte só — e um agregador que copia a ementa do
tribunal não é a confirmação secundária, é o reflexo da primeira.

## Passo 3 — Protocolo de dupla validação, passo a passo

Para **cada** precedente que você pretende citar, execute e registre:

1. **Existência no oficial.** Localize o julgado no sítio oficial do tribunal que o proferiu. Não
   achou no oficial: o precedente não passa, ponto — mesmo que apareça em cinco páginas.
2. **Conferência de identificação.** Compare, entre o que você tem e o que está no oficial:
   classe e número do processo, órgão julgador, data do julgamento e data da publicação. Um campo
   divergente é sinal de citação remontada; dois é sinal de citação inventada. Divergiu, volta ao
   passo 1 com o dado do oficial.
3. **Leitura do que o julgado decidiu.** Leia a ementa oficial inteira e, quando houver, o trecho
   do inteiro teor que sustenta a tese. Confirme que a tese que você quer usar é a **razão de
   decidir**, e não obiter dictum, voto vencido ou argumento de reforço. Confirme também o
   resultado: ementa que parece favorável em julgado que negou provimento muda de sinal.
4. **Confirmação de que segue válido.** Verifique se há trânsito em julgado, embargos pendentes,
   recurso admitido, afetação a julgamento de repetitivo, modulação de efeitos, superação por
   julgado posterior ou alteração de súmula. Súmula e orientação jurisprudencial: confirme o
   texto **vigente**, porque redação alterada e enunciado cancelado circulam por anos na internet.
5. **Fonte secundária independente.** Confirme na fonte secundária a existência, a leitura da
   tese e, se houver, a notícia de alteração. Se a fonte secundária contar história diferente da
   sua leitura, a sua leitura é a suspeita — releia o inteiro teor antes de decidir quem está
   certo.
6. **Registro.** Anote, para cada precedente aprovado: onde foi confirmado no oficial, qual foi a
   fonte secundária, a data em que você conferiu e o que exatamente foi confirmado. Citação
   validada sem registro de validação não é auditável e, na prática, volta a ser não validada.

## Passo 4 — Quando a validação falha

Não improvise. Cada falha tem uma saída:

- **Não achei no sítio oficial.** Tente uma vez pelos termos, além do número, para o caso de erro
  de digitação na origem. Continuou sem achar: **o precedente não é citado.** Diga ao advogado
  que ele não foi localizado no oficial, e ofereça a tese descrita sem número.
- **Achei no oficial, mas não encontrei fonte secundária.** A citação fica **condicional**: pode
  ser levada ao advogado marcada como "confirmada no oficial, sem confirmação secundária", e cabe
  a ele decidir se usa. Não apresente como validada, e não esconda a falta.
- **Achei na secundária, não achei no oficial.** Trate como não existente até prova em contrário.
  É o padrão típico de citação alucinada que já circulou e foi reproduzida.
- **Os dados divergem entre as fontes.** Prevalece o oficial. Relate a divergência ao advogado —
  ela costuma indicar que existem dois julgados parecidos, e o outro pode ser o que interessa.
- **O julgado foi superado, modulado ou está afetado.** Não cite como entendimento atual. Se
  ainda for útil, cite descrevendo o estado dele (superado por julgado posterior, com efeitos
  modulados, com tese pendente de julgamento), e diga o efeito prático disso na estratégia.
- **Sem acesso à base, à rede ou ao sítio oficial no momento.** Entregue a pesquisa **sem
  citações**, com as teses descritas e a lista do que precisa ser validado quando o acesso voltar.
  Não preencha o vazio com número de memória — memória de modelo sobre número de processo é
  exatamente o mecanismo que produz acórdão inexistente.

Em todos os casos acima, a sinalização é **explícita e no lugar da citação**, não em nota de
rodapé genérica no fim do texto. O advogado precisa ver a marca onde ele fosse copiar o número.

## Passo 5 — Verificação de divergência (antes de citar, não depois)

Pesquisa que só procura o que confirma a tese do cliente não é pesquisa, é coleta. Antes de
fechar qualquer citação:

1. Rode a **string pelo avesso** do passo 1, com os termos que a decisão contrária usaria.
2. Procure no mesmo órgão que vai julgar: existe entendimento em sentido contrário? É isolado ou
   é o dominante ali?
3. Procure no colegiado específico, quando a matéria estiver dividida entre órgãos fracionários
   do mesmo tribunal — é comum a tese ganhar num e perder no outro.
4. Verifique se a matéria está afetada a julgamento de efeito repetitivo, a incidente de
   resolução de demandas repetitivas, ou se há súmula em sentido contrário.
5. Verifique se o precedente favorável que você achou é o vencido de uma virada posterior.

**Se houver entendimento dominante em sentido contrário, relate-o ao advogado.** Sempre, e antes
de ele decidir a estratégia — não como ressalva ao fim de um parecer otimista. Diga qual é o
entendimento contrário, em que órgão ele domina, quão consolidado está e qual a distinção
possível, se houver. Advogado que descobre a divergência na contestação perdeu a chance de
escolher outro fundamento, outro pedido ou outra via.

Se a divergência não existir, diga isso também, com o que você procurou — "não localizei
entendimento contrário, tendo buscado os termos A, B e C no órgão X" vale mais que silêncio.

## Passo 6 — Mapa argumentativo

A entrega desta skill não é uma lista de ementas. É o mapa que permite decidir:

**Teses a favor.** Cada uma em uma frase, no formato "em situação X, a consequência é Y", com os
precedentes-chave validados que a sustentam e o grau de autoridade de cada um (vinculante,
persuasivo do próprio órgão, persuasivo de outro tribunal). Ordene por força, não por data.

**Teses contra.** As mesmas exigências, para o outro lado. Inclua as que o adversário
provavelmente usará mesmo que você as considere fracas — o valor deste bloco é antecipar a
contestação, e o bloco vazio é sinal de que o passo 5 não foi feito.

**Precedentes-chave de cada lado.** Poucos e fortes, não muitos e fracos. Para cada um: qual a
tese, qual o grau de autoridade, o que foi confirmado na validação e em que data.

**Pontos de distinção.** Onde o caso concreto difere do precedente contrário, e onde o precedente
favorável pode ser distinguido pelo adversário. É aqui que a pesquisa vira estratégia.

**O que ficou sem validação.** A lista explícita do que foi descartado por não passar no
protocolo, com o motivo. Esta seção existir é o que impede o descarte silencioso de virar
esquecimento.

## Formato da saída

**Regra da casa nº 2: objetiva e informativa, com fundamentação precisa, sem formatação
excessiva.** O mapa acima, em texto corrido e listas simples. Sem ementa colada inteira (cite o
trecho que decide, não a página), sem repetir o mesmo precedente em três seções, sem enfeite de
apresentação. Precisão está no conteúdo da citação — órgão, data, o que se decidiu e o grau de
autoridade — não no tamanho do bloco.

## Conexão com as outras regras da casa

**Regra nº 3 — conflict check antes de aceitar caso novo.** Pesquisa encomendada para caso novo
pressupõe conflict check concluído. Se o pedido chegar antes de aceitar o caso, diga que a skill
`conflict-check` roda primeiro, e pare — a própria pesquisa já produz e registra informação
estratégica sobre a disputa, que é exatamente o que o teste de informação privilegiada existe
para proteger. Pesquisar antes de checar contamina o caso que talvez não se pudesse aceitar.

**Regra nº 4.** Precedente validado **não** vira material de divulgação por ser bom. Publicar
resultado obtido é uso de caso concreto, e o enquadramento está na skill
`etica-oab-publicidade`, sob o Provimento 205/2021. Conteúdo informativo sobre a tese, sem o caso
e sem oferta de atuação, é outra coisa — e passa pela mesma skill antes de ir ao ar.
