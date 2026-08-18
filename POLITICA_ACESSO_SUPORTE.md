# Política de Acesso de Suporte da Lúmen

Este documento explica, em linguagem simples, o que acontece quando alguém da equipe de suporte
da Lúmen precisa entrar nos dados do seu escritório para ajudar em algum problema. Ele descreve
o que o sistema faz hoje — não é uma promessa de marketing nem uma declaração de conformidade
legal (não afirmamos aqui que somos "certificados" ou "compliance LGPD"; isso é uma avaliação que
cabe ao seu escritório e aos seus assessores jurídicos fazerem, com base no que está descrito
abaixo).

Se você é sócio do escritório ou faz parte do compliance de um cliente, este texto é para você.

---

## 1. O que o suporte vê por padrão

Quando alguém da Lúmen entra no seu escritório para dar suporte, o sistema mostra uma versão
**mascarada** dos seus dados — mostra o suficiente para diagnosticar um problema, mas esconde o
conteúdo real.

**O suporte vê, normalmente:**
- Configuração do sistema (módulos ativos, integrações conectadas, permissões).
- Estrutura dos registros (que um processo existe, em que tribunal, desde quando, em que
  status).
- Contagens e indicadores (quantas parcelas em aberto, quantos processos ativos).
- Erros e falhas técnicas (uma integração que parou de funcionar, uma sincronização que falhou).
- Nome e e-mail da **equipe do seu escritório** — quem está logado, com que cargo, com que
  permissão (ver a limitação sobre isso na seção 6).

**O suporte não vê, normalmente:**
- Nomes, CPF/CNPJ, telefone, e-mail ou endereço de clientes e partes.
- Valores em dinheiro — honorários, valor da causa, contas a pagar ou a receber.
- O teor de processos, publicações, tarefas e anotações — aparece só um indicador do tamanho do
  texto, nunca o conteúdo.
- Documentos e anexos.
- Anotações pessoais da sua equipe.
- Tokens e credenciais de integração (Drive, WhatsApp, banco) — nunca aparecem em claro, mesmo
  para diagnosticar um problema de conexão.

Isso é automático e vale para toda tela do sistema, não é algo que precisa ser "ligado" tela por
tela — é a regra padrão de qualquer sessão de suporte.

---

## 2. Ver o dado real de um registro específico exige pedido e aprovação — sem exceção

Às vezes, resolver um problema exige ver o dado de verdade de um processo, uma conta ou um
atendimento específico (por exemplo: "o número do processo que salvei está errado, me ajudem a
corrigir"). Para isso existe um mecanismo específico, chamado internamente de "quebra-vidro".

Como funciona:
1. Alguém da Lúmen **pede** acesso àquele registro específico, com um motivo de uma lista
   fechada (nunca um texto livre qualquer).
2. **Um sócio do seu escritório precisa aprovar** aquele pedido, registro por registro.
3. Só depois da aprovação o dado real daquele registro fica visível, e só para quem pediu.

**Não existe autoaprovação, nem exceção de emergência, nem para os donos da plataforma.** Mesmo
quem opera a Lúmen não tem um botão de "ver mesmo assim" que pule essa aprovação. Se o seu
escritório configurar a política de acesso como "automática" (ver seção 4), isso libera a
**entrada mascarada** de suporte sem esperar aprovação — não libera ver dado real de nenhum
registro sem o pedido específico passar pela aprovação de um sócio.

---

## 3. Tudo fica registrado, e o controle é seu

- Toda entrada, saída, leitura de dado real e **alteração** feita durante uma sessão de suporte
  fica gravada num histórico de auditoria, com data, hora, quem da Lúmen fez, o motivo declarado
  e — quando aplicável — qual registro foi visto ou alterado. A máscara (seção 1) impede o
  suporte de VER o conteúdo real na tela, mas não impede a EQUIPE do seu escritório de continuar
  operando normalmente durante a sessão nem o suporte de criar, editar ou excluir um registro a
  seu pedido (por exemplo, ao corrigir um dado incorreto) — quando isso acontece, fica registrado
  aqui como qualquer outro acesso.
- O seu escritório vê esse histórico **em tempo real**, na tela de "Acessos da Lúmen"
  (Configurações → Acessos, no computador e no celular). Não é preciso pedir para a Lúmen — a
  tela é sua, sempre disponível.
- Você pode **encerrar uma sessão de suporte ativa a qualquer momento**, com um clique — mesmo
  que o motivo declarado ainda não tenha sido resolvido.
- Você pode **baixar um extrato em CSV** desse histórico a qualquer momento, para guardar ou
  levar ao seu compliance, sem depender de continuar logado no sistema depois.
- Existe também uma tela de **"Ver como o suporte vê este escritório"** (computador, disponível
  para administradores), que mostra lado a lado o dado real e o dado mascarado de uma amostra dos
  seus próprios registros — usando exatamente a mesma função de máscara que roda de verdade, não
  uma simulação separada.

---

## 4. Prazo e política de acesso

- Toda sessão de suporte tem um prazo curto: **30 minutos**. Depois disso, o acesso expira
  sozinho — não é preciso ninguém lembrar de encerrar.
- Seu escritório escolhe, na própria tela de Configurações, como esse acesso é liberado:
  - **Automático** — o suporte entra na hora (sempre mascarado, sempre registrado, sempre
    visível a vocês), sem esperar aprovação prévia.
  - **Com aprovação** — um sócio do seu escritório precisa liberar cada entrada de suporte antes
    dela acontecer.
- Essa política controla a **entrada mascarada**. Ver o dado real de um registro específico
  (seção 2) sempre exige aprovação por registro, independentemente dessa escolha.

---

## 5. O que acontece quando o prazo passa sem ninguém agir

- Uma sessão de suporte que chega ao fim dos 30 minutos é encerrada automaticamente pelo sistema,
  com o mesmo registro de "saída" que apareceria se alguém tivesse encerrado manualmente — para
  que o histórico nunca mostre uma entrada "pendurada", sem saída.
- Um pedido de acesso (na política "Com aprovação") que nenhum sócio decidiu a tempo também é
  marcado como vencido, em vez de ficar pendente para sempre esperando uma decisão que já perdeu
  o sentido.

---

## 6. Limitações reais — sem maquiagem

Nenhum sistema de controle de acesso é perfeito, e seria desonesto apresentar este como se fosse.
Aqui estão as limitações conhecidas de hoje:

- **Nome e e-mail da sua equipe continuam visíveis ao suporte.** É o que permite diagnosticar
  "fulano não consegue acessar o sistema" sem abrir os dados dos seus clientes — mas significa
  que a identidade de quem trabalha no seu escritório não é, ela mesma, mascarada.
- **A máscara age sobre o que aparece na tela, não sobre a busca.** O motor de busca e filtro do
  sistema roda sobre o valor real, por trás da máscara. Na prática, isso significa que alguém do
  suporte que já saiba (por outro canal, por exemplo por telefone) um número de processo ou um
  nome pode digitar esse valor num filtro e inferir alguma coisa pela resposta do sistema (por
  exemplo, se o registro existe ou não), mesmo sem "ver" o dado mascarado na tela.
- **Campos muito curtos podem vazar informação pelo próprio tamanho.** Como a máscara às vezes
  preserva o formato (por exemplo, o comprimento de um texto), um campo com poucas opções
  possíveis e texto curto pode, em tese, ser adivinhado por eliminação.
- **A aprovação do quebra-vidro é por registro inteiro, não por campo.** Quando um sócio aprova
  ver um processo específico, isso libera todos os campos protegidos daquele processo, não só o
  campo que motivou o pedido — não é possível hoje aprovar "só o número do processo" e manter o
  resto escondido.
- **O quebra-vidro hoje só tem botão de uso na tela de Processo.** Contas a Pagar, Contas a
  Receber e Atendimento seguem permanentemente mascarados nas telas atuais — mesmo que um pedido
  de acesso a esses tipos de registro seja aprovado, não existe ainda uma tela que use essa
  aprovação para revelar o dado real deles.
- **Acesso direto ao banco de dados por quem opera a infraestrutura não é impedido por nenhum
  controle de aplicação.** Tudo que está descrito acima roda dentro do sistema — pedido,
  aprovação, mascaramento, registro. Alguém com acesso direto ao banco de dados (por exemplo,
  quem administra o servidor de banco em si) não passa por essas mesmas regras, porque elas são
  aplicadas pelo sistema, não pelo banco. O que mitiga esse risco hoje:
  - As credenciais de acesso direto ao banco são segregadas de quem faz o atendimento do
    dia a dia — o time de suporte, que é quem interage com os dados dos escritórios no
    trabalho comum, não é o mesmo grupo que tem essas credenciais.
  - Consultas feitas diretamente no banco (fora do aplicativo) ficam registradas nos logs do
    próprio servidor de banco de dados, mantidos em destino separado do banco de produção — não é
    a mesma trilha de auditoria descrita na seção 3, mas existe.
  - Uma evolução futura considerada, ainda não implementada, é a **criptografia de campos
    sensíveis com chave específica do cliente** — o que tornaria o dado ilegível mesmo para
    quem tem acesso direto ao banco, sem a chave em separado. Hoje isso não existe.

---

## Resumo

O suporte da Lúmen trabalha, por padrão, sem ver o dado real do seu escritório — só estrutura,
configuração e indicadores. Ver dado real de um registro específico sempre passa por pedido e
aprovação de um sócio do seu escritório, sem atalho para ninguém. Tudo fica registrado, você
acompanha em tempo real, pode encerrar a qualquer momento e pode levar o extrato embora. As
limitações descritas na seção 6 são reais e continuam sendo trabalhadas — preferimos que você as
conheça a esconder que existem.
