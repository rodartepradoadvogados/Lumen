# Cobrança via Asaas (Pix Automático, Pix QR Code, boleto) — o que falta pra funcionar

O código está todo pronto e no ar — cliente da API (`lib/asaas.ts`), webhook seguro
(`app/api/asaas/webhook/route.ts`), reconciliação e cron diário de cobrança
(`lib/actions/billing.ts` + `app/api/cron/billing`), e as telas de configuração (Painel Mestre →
Assinaturas, e Configurações → Cobrança de cada escritório) — mas tudo fica **dormente** até
você completar o cadastro do lado da Asaas. Nada disso eu consigo fazer por você — precisa da
sua conta Asaas.

## O que já está funcionando, mesmo sem a Asaas configurada

- **Painel Mestre → Assinaturas**: dá pra definir, para cada escritório, o ciclo (Mensal/
  Semestral), a forma de pagamento (Pix Automático, Pix QR Code ou Boleto) e o desconto do
  ciclo Semestral — isso já funciona hoje, independente da Asaas.
- **Configurações → Cobrança** (de cada escritório): mostra o ciclo/forma de pagamento
  escolhidos, o histórico de faturas e, quando a Asaas já tiver gerado uma cobrança Pix pendente,
  o QR Code e o copia-e-cola.
- **Cron diário de cobrança** (`/api/cron/billing`, 9h UTC): manda lembrete 3 dias antes do
  vencimento, avisa no vencimento quantos dias faltam até o bloqueio, e suspende automaticamente
  o escritório que passar do prazo de carência (`Office.paymentGraceDays`, 5 dias por padrão)
  ainda inadimplente — vale pra boleto BTG e manual também, não só Asaas.
- O que ainda depende da Asaas: gerar de fato a cobrança Pix (QR Code ou autorização de Pix
  Automático) e confirmar pagamento automaticamente. Enquanto a chave não estiver cadastrada, os
  botões de "Gerar autorização"/"Testar QR Code" na tela de Assinaturas ficam desativados com um
  aviso apontando pra este arquivo.

## 1. Criar a conta (sandbox primeiro, depois produção)

Sandbox e produção são **contas separadas** na Asaas — não dá pra "virar chave" numa conta só,
como no BTG:

1. Para testar sem dinheiro real: crie uma conta em https://sandbox.asaas.com. Use-a pra validar
   todo o fluxo (Pix QR Code, Pix Automático, webhook) antes de mexer em produção.
2. Quando estiver tudo validado: crie/já use a conta real em https://www.asaas.com.

## 2. Gerar a API Key

Dentro do painel Asaas (sandbox ou produção, conforme o passo em que você estiver):

1. **Configurações** → **Integrações** → **Chave de API** (o nome exato do menu pode variar
   ligeiramente conforme a versão do painel, mas é sempre em Configurações → Integrações).
2. Gere/copie a chave e me envie por um canal seguro (não aqui no chat) que eu cadastro na
   Vercel como `ASAAS_API_KEY`.
3. Enquanto só a `ASAAS_API_KEY` de sandbox estiver cadastrada, deixe `ASAAS_ENV` como
   `sandbox` (o padrão, não precisa nem declarar a variável). Só troque para `ASAAS_ENV=production`
   depois de testar tudo no sandbox e trocar também a `ASAAS_API_KEY` pela de produção.

## 3. Configurar o webhook

Ainda no painel Asaas: **Configurações** → **Integrações** → **Webhooks** (ou "Notificações",
dependendo da versão do painel) → criar um novo webhook com:

- **URL**: `https://lumen-flax-chi.vercel.app/api/asaas/webhook`
- **Token de autenticação**: escolha você mesmo uma string aleatória longa (ou deixe a Asaas
  gerar uma, se o painel oferecer essa opção) — o mesmo valor precisa estar cadastrado nos DOIS
  lugares: no painel Asaas (campo de token do webhook) e na Vercel como `ASAAS_WEBHOOK_TOKEN`.
  Não é algo que a Asaas gera e sincroniza sozinha; é um segredo que você escolhe e replica nos
  dois lados.
- **Eventos**: pelo menos `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE` e os de Pix
  Automático (`PIX_AUTOMATICO_AUTHORIZATION_*` — nome exato a confirmar no painel, ver ressalva
  abaixo).

Sem `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` cadastradas, o webhook responde **401 a qualquer
chamada** (fail-closed, de propósito — ver comentário no topo de `lib/asaas.ts`), então não tem
risco de ficar "meio configurado" aceitando coisa indevida.

## 4. `CRON_SECRET` (se ainda não estiver cadastrado)

O cron diário de cobrança usa a mesma variável `CRON_SECRET` que os outros crons do sistema
(agenda do dia, sincronização Jusbrasil etc.) já usam — se ela já está cadastrada na Vercel, não
precisa fazer nada além disso; o cron novo (`/api/cron/billing`) já está registrado em
`vercel.json` e vai começar a rodar sozinho, 9h UTC (6h em Brasília), todo dia.

## Um ponto técnico que vamos precisar ajustar juntos

A rota de criação de autorização de Pix Automático (`POST /pixAutomaticoAuthorizations`, usada
em `lib/asaas.ts:createPixAutomaticoAuthorization`) **não pôde ser confirmada de ponta a ponta
contra a documentação oficial** — a página
https://docs.asaas.com/reference/criar-uma-autorizacao-pix-automatico bloqueou acesso
automatizado (403) nas tentativas feitas. Já confirmamos, por busca indireta consistente em
mais de uma fonte, que os campos certos são `customerId` (não `customer`) e `frequency` (não
`cycle`), além de um `contractId` opcional pra correlacionar com nosso registro interno — o
código já usa esses nomes. O que ainda falta confirmar: o nome exato do campo de valor da
cobrança e o formato da resposta (nome do campo do QR Code/imagem do primeiro pagamento). O
próprio erro que a API devolver na primeira tentativa real no Sandbox deve dizer exatamente o
que falta ajustar, mesmo padrão do que aconteceu com o boleto BTG (ver `README_BTG.md`).

As demais rotas (`/customers`, `/payments`, `/payments/{id}/pixQrCode`, `/payments/{id}`) seguem
o padrão documentado publicamente na Asaas e têm mais chance de funcionar de primeira, mas
também só serão validadas de verdade no primeiro teste real no Sandbox.

## Enquanto isso

Nada muda no que já funciona: o Painel Mestre continua gerando fatura, mandando e-mail de
cobrança, dando baixa manual e emitindo boleto via BTG exatamente como antes. A opção Asaas
(Pix QR Code / Pix Automático) só entra em ação quando uma `Subscription` do escritório tiver
`paymentMethod` explicitamente configurado em Assinaturas — hoje nenhum escritório-cliente real
tem isso configurado ainda (é uma escolha que você faz quando quiser migrar um escritório pro
Pix), então esse pedaço fica 100% dormente até lá.
