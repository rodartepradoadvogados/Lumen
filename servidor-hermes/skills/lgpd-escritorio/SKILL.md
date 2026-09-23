---
name: lgpd-escritorio
description: >
  Diagnóstico de conformidade do PRÓPRIO escritório contratante com a Lei Geral de Proteção de
  Dados — não do cliente dele. Varre domínio por domínio (governança, base legal de tratamento,
  dados sensíveis, segurança da informação, compartilhamento com terceiros e fornecedores,
  direitos dos titulares, retenção e descarte, resposta a incidente), aponta as lacunas
  encontradas, monta plano de ação em 30/90/180 dias e lista os documentos que precisam existir
  (política de privacidade, registro de operações de tratamento, designação de encarregado, plano
  de resposta a incidente, contratos com fornecedores). Use SEMPRE que o próprio escritório pedir
  diagnóstico ou auditoria interna de proteção de dados, perguntar "estamos em conformidade com a
  LGPD", revisar processo de coleta de dados de clientes e site, ou apurar como reagir a incidente
  de segurança envolvendo dados que o próprio escritório trata.
---

# Diagnóstico de conformidade com a LGPD — o próprio escritório

Esta skill não analisa se o **cliente** do escritório está em conformidade com a Lei Geral de
Proteção de Dados — isso é matéria da skill `analise-legislacao`, aplicada ao caso daquele
cliente. Esta skill olha para dentro: o escritório contratante é, ele mesmo, controlador de dados
pessoais de cliente, de parte contrária, de testemunha, de terceiro citado em processo e de
colaborador, e responde por isso como qualquer outro controlador. O risco de tratar essa
responsabilidade como automática — "somos advogados, estamos cobertos pelo sigilo profissional,
então a lei de dados não nos alcança" — é o erro mais comum e o mais caro: sigilo profissional e
proteção de dados são regimes diferentes, e cumprir um não dispensa o outro.

## Gatilhos — quando rodar

- Pedido direto de diagnóstico ou auditoria de conformidade com a Lei Geral de Proteção de Dados
  aplicada ao próprio escritório.
- Revisão de formulário de captação de lead, site, WhatsApp Business ou qualquer canal que colete
  dado de quem ainda não é cliente.
- Contratação ou troca de fornecedor de tecnologia que vá tratar dado de cliente por conta do
  escritório (nuvem, sistema de gestão, ferramenta de assinatura eletrônica, plataforma de
  atendimento).
- Suspeita ou confirmação de incidente de segurança envolvendo dado que o escritório trata.
- Revisão periódica de conformidade, ou pedido de "o que precisamos ter documentado" antes de
  auditoria externa, certificação ou contratação relevante que exija comprovação.

## Parada obrigatória: sem os quatro itens, o diagnóstico não começa

O trabalho começa quando estes itens estiverem disponíveis. Faltando qualquer um, a resposta é uma
só: liste o que falta, peça, e pare. Diagnóstico feito sobre suposição do que o escritório trata
produz plano de ação que corrige o problema errado.

1. **Quais dados o escritório efetivamente trata**, e de quem: cliente, parte contrária,
   testemunha, terceiro mencionado em processo, colaborador, candidato a vaga, fornecedor. A
   pergunta certa não é "vocês tratam dado pessoal" — todo escritório trata — é "quais categorias,
   de qual titular, coletadas onde".
2. **Se há dado sensível envolvido** — saúde, dado de criança e adolescente, filiação sindical,
   convicção religiosa ou política, dado biométrico — porque o regime de tratamento de dado
   sensível é mais restrito, e casos médicos, previdenciários, de família e trabalhistas trazem
   esse tipo de dado com frequência.
3. **Os canais e fornecedores envolvidos**: site, formulário, planilha, sistema de gestão jurídica,
   armazenamento em nuvem, aplicativo de mensagem, serviço de assinatura eletrônica, correspondente
   jurídico, perito contratado. Cada elo da cadeia é um ponto de compartilhamento a mapear.
4. **Se o diagnóstico é preventivo ou reativo a incidente já ocorrido.** Diagnóstico reativo muda a
   ordem de prioridade: a contenção do incidente e a avaliação do dever de comunicação vêm antes do
   plano de 30/90/180 dias, não depois dele.

## Passo 1 — Governança

Verifique se existe **designação formal de encarregado** (a pessoa de contato para titulares e
para a autoridade de proteção de dados) e se essa designação está registrada, não apenas combinada
verbalmente. Verifique se há **política de privacidade interna** que oriente a própria equipe sobre
como tratar dado no dia a dia — quem pode acessar pasta de processo, como enviar documento com dado
sensível por e-mail, o que fazer ao receber pedido de titular. Ausência de governança não é
neutra: é o domínio que, faltando, torna os outros seis inconsistentes, porque ninguém responde por
eles.

## Passo 2 — Base legal para cada tratamento

Para cada categoria de dado do item 1 da parada obrigatória, identifique a base legal que sustenta
o tratamento: execução de contrato (cliente), cumprimento de obrigação legal ou exercício regular
de direito em processo (parte contrária, testemunha, terceiro citado), legítimo interesse
(prospecção inicial, antes de haver contrato), consentimento (quando exigido especificamente, como
em comunicação de marketing) ou obrigação legal/regulamentar do exercício da profissão. **Não
afirme qual dispositivo da lei enquadra cada base de memória** — o enquadramento correto depende de
como a definição legal de cada base está redigida, e ela é conferida no texto oficial vigente da
lei e do regulamento da autoridade de proteção de dados, mais fonte secundária confiável (Conjur,
Migalhas, Jusbrasil), antes de entrar no documento final. Sem essa dupla conferência, **não cite**
o dispositivo — descreva a base pelo nome (execução de contrato, legítimo interesse, cumprimento de
obrigação legal) e diga que o artigo específico não foi conferido nesta consulta.

Um ponto que este domínio precisa resolver explicitamente, e que a maioria dos diagnósticos
ignora: dado colhido durante conflict check de quem **não virou cliente** — nome de possível
cliente, nome de contraparte, teor da consulta recusada — continua sendo tratado pelo escritório
depois da recusa, porque a skill `conflict-check` exige consultar esse histórico em **todo** caso
novo futuro. A base legal para reter esse dado não é a mesma de um dado de cliente ativo; ela se
apoia no cumprimento de obrigação profissional de evitar conflito de interesses, e essa
justificativa precisa estar documentada, não apenas praticada. Diagnosticar esse domínio sem
mencionar essa retenção é deixar de fora exatamente o dado mais sensível do acervo: o de quem
consultou e não contratou.

## Passo 3 — Dados sensíveis

Mapeie onde dado sensível aparece: laudo médico e histórico de saúde em caso previdenciário ou de
saúde suplementar, dado de criança em processo de família, filiação sindical em caso trabalhista,
convicção declarada em caso de liberdade religiosa. Verifique se o acesso a esses dados é
restrito a quem atua no caso, se documentos com dado sensível têm tratamento de armazenamento
diferenciado do documento comum, e se há descarte específico quando o processo se encerra e o
motivo de retenção original deixa de existir.

## Passo 4 — Segurança da informação

Verifique controle de acesso (quem entra em qual pasta e sistema), criptografia de dado em
trânsito e em repouso quando o provedor de tecnologia oferecer, política de senha e autenticação,
e o que acontece quando um colaborador desliga — se o acesso dele é revogado no mesmo dia. Este
domínio é tipicamente técnico e pode exigir apoio de quem administra a infraestrutura; a skill não
substitui essa avaliação técnica, apenas garante que ela exista e que o escritório saiba se ela
existe.

## Passo 5 — Compartilhamento com terceiros e fornecedores

Para cada fornecedor que trata dado por conta do escritório (nuvem, sistema de gestão,
assinatura eletrônica, correspondente, perito), verifique se há **contrato ou cláusula de
proteção de dados** delimitando o que o fornecedor pode fazer com o dado, por quanto tempo, e o
que acontece ao fim da relação. Fornecedor sem cláusula de proteção de dados é elo sem
responsabilidade definida — e, quando algo dá errado no fornecedor, o titular cobra do escritório,
não do fornecedor.

## Passo 6 — Direitos dos titulares

Verifique se existe um caminho definido para responder a pedido de titular (cliente, parte
contrária, terceiro) que queira saber que dado o escritório tem sobre ele, corrigir dado incorreto
ou pedir eliminação. **Não afirme prazo de resposta de memória** — o prazo para atender pedido de
titular é definido em norma que pode ter regulamentação própria da autoridade competente, e a
exatidão dele depende de conferência dupla antes de ser prometido a alguém. Se não conferido, diga
isso e não prometa prazo. Verifique também se o escritório sabe distinguir um pedido de titular de
uma intimação processual disfarçada de pedido — o segundo segue o rito processual, não este.

## Passo 7 — Retenção, descarte e resposta a incidente

Verifique se há política de retenção que diga por quanto tempo cada categoria de dado fica
guardada depois que o motivo original deixa de existir — processo arquivado, consulta que não
virou contrato, colaborador desligado — e se há rotina de descarte efetivo, não apenas regra
escrita. Verifique se existe **plano de resposta a incidente**: quem é avisado primeiro, como se
avalia se o incidente gera risco relevante ao titular, e como se decide se e quando comunicar
titulares e autoridade competente. **Não afirme prazo de comunicação de incidente nem valor de
multa de memória** — ambos dependem de norma e de regulamentação que mudam, e a exatidão deles só
entra no diagnóstico com a etiqueta "conferido nesta consulta" ou "não conferido nesta consulta",
ao lado do próprio número, nunca apenas mencionada em parágrafo à parte.

## Os documentos que precisam existir

Ao final do diagnóstico, liste — marcando o que existe, o que existe mas está desatualizado, e o
que não existe — pelo menos: política de privacidade voltada a quem visita o site ou preenche
formulário; aviso de privacidade específico para cliente, explicando como o dado dele é tratado
durante o caso; termo de consentimento, quando o tratamento depender especificamente dele; registro
de operações de tratamento (o inventário de quais dados, de quem, com que base, tratados por
quanto tempo); designação formal de encarregado; plano de resposta a incidente; e cláusula ou
contrato de proteção de dados com cada fornecedor relevante. Um item "não existe" não é falha
pontual — é lacuna que entra no plano de ação abaixo com prioridade proporcional ao domínio a que
pertence.

## Plano de ação em 30, 90 e 180 dias

Distribua cada lacuna encontrada pelos três horizontes, pelo critério de dependência e de risco —
não pela ordem em que os domínios foram listados acima:

**30 dias — o que estanca o maior risco imediato.** Designação de encarregado quando inexistente,
correção de vazamento ou exposição já identificada, revisão de formulário de captação que colete
mais dado do que precisa, e qualquer item ligado a incidente em curso.

**90 dias — o que estrutura a conformidade continuada.** Elaboração ou atualização de política de
privacidade e aviso de privacidade ao cliente, montagem do registro de operações de tratamento,
revisão de contrato com os fornecedores de maior exposição (os que tratam dado sensível ou grande
volume), e definição da política de retenção e descarte.

**180 dias — o que consolida e revisa.** Treinamento da equipe, revisão de contrato com
fornecedores de menor exposição, teste do plano de resposta a incidente (simulação, não só
documento escrito), e nova rodada de diagnóstico para medir o que avançou.

Cada item do plano carrega o domínio de origem e, quando envolver prazo ou valor legal, a etiqueta
de conferência ao lado — nunca deslocada para uma nota final.

## Formato da saída

**Regra da casa nº 2: resposta objetiva e informativa, fundamentação precisa, sem formatação
excessiva.** Quatro blocos, nesta ordem:

1. As lacunas encontradas, por domínio (governança, base legal, dados sensíveis, segurança,
   fornecedores, direitos dos titulares, retenção e incidente), cada uma com a etiqueta de
   conferência ao lado de qualquer prazo, multa ou dispositivo citado.
2. A lista de documentos, marcados como existente, desatualizado ou inexistente.
3. O plano de ação distribuído em 30, 90 e 180 dias.
4. O que ficou fora do alcance deste diagnóstico — domínio técnico que exige avaliação de
   infraestrutura, ou dado que o escritório ainda não trouxe.

## As quatro regras da casa, aplicadas aqui

**Regra nº 1 — validação dupla.** Nenhum artigo da lei, prazo de resposta a titular, prazo de
comunicação de incidente ou valor de multa entra no diagnóstico sem conferência no sítio oficial
da norma e da autoridade competente **e** em fonte secundária confiável (Conjur, Migalhas,
Jusbrasil). Sem as duas, não cite o número — descreva a exigência e diga, junto dela, que não foi
conferida nesta consulta. Para súmula, precedente ou orientação de tribunal invocada para
interpretar um ponto controverso da lei, o roteiro de validação é da skill `pesquisa-jurisprudencia`
— delegue a ela em vez de citar de memória.

**Regra nº 2 — objetividade.** Aplicada na seção de formato acima.

**Regra nº 3 — conflict check antes de aceitar caso novo.** Esta skill não atende cliente novo —
ela audita o próprio escritório —, mas o passo 2 mostra onde a fronteira se toca: o dado de quem
consultou e não virou cliente só existe porque o `conflict-check` exige preservá-lo para checar
casos futuros. Se o próprio diagnóstico revelar necessidade de contratar serviço externo para
resolver um incidente — por exemplo, ação contra um fornecedor que vazou dado —, esse novo caso
também passa pelo `conflict-check` antes de ser aceito, como qualquer outro caso novo.

**Regra nº 4 — Provimento 205/2021.** O formulário de captação de lead no site do escritório, a
página "fale conosco" e qualquer aviso de privacidade publicado são, ao mesmo tempo, peça de
conformidade com a lei de dados e peça de publicidade profissional. Revisar um formulário de
captação sob a ótica de proteção de dados não dispensa revisá-lo também sob o Provimento 205/2021
— um formulário que pede o relato do caso com promessa de retorno-solução é indício de captação de
clientela, independentemente de estar em conformidade com a lei de dados. Delegue essa segunda
revisão à skill `etica-oab-publicidade`.

## O que esta skill não faz

Não avalia a conformidade do **cliente** do escritório com a lei de dados — isso é a skill
`analise-legislacao`. Não substitui avaliação técnica de infraestrutura de segurança da
informação. Não fixa prazo de resposta a titular, prazo de comunicação de incidente nem valor de
multa quando a dupla conferência não foi feita — nesse caso, diz que não foi. Não redige a política
de privacidade nem o contrato com fornecedor — aponta que eles precisam existir e o que devem
conter. E não presume o nome do escritório, a atuação nem os canais que ele usa para captar
cliente: quando esses dados forem necessários para o diagnóstico, vêm do Lúmen — via a ferramenta
`consultar_perfil_do_escritorio` — e esta skill diz explicitamente que consultou.
