# Emissão de boletos via BTG Empresas — o que falta pra funcionar de ponta a ponta

O código (`lib/btg.ts`, `/api/btg/connect`, `/api/btg/callback`) já está pronto e no ar, mas
fica **dormente** até você completar 3 passos do lado do BTG. Nada disso eu consigo fazer por
você — precisa da sua conta BTG Empresas do escritório.

## 1. Registrar o app no portal de desenvolvedores

1. Acesse https://developers.empresas.btgpactual.com/ e faça login com a conta BTG Empresas
   do escritório.
2. Registre um novo aplicativo. Você vai precisar informar a **Redirect URI**:
   ```
   https://lumen-flax-chi.vercel.app/api/btg/callback
   ```
3. Ao final, o BTG mostra um **Client ID** e um **Client Secret** — me envie os dois (por um
   canal seguro, não aqui no chat) que eu cadastro na Vercel como `BTG_CLIENT_ID` e
   `BTG_CLIENT_SECRET`.

## 2. Testar no Sandbox primeiro

O BTG tem um ambiente de testes (`sandbox`) separado do de produção — por padrão o sistema já
usa o sandbox (`BTG_ENV` não precisa ser definido). Assim que você mandar as credenciais, eu
conecto e testamos a emissão de um boleto de mentira, sem risco.

## 3. Verificação para produção

Pra emitir boleto de verdade (ambiente de produção), o BTG exige:

- Ter o **plano avançado** contratado na conta BTG Empresas do escritório.
- O app passar por **verificação do BTG** — o próprio BTG informou um SLA de até 7 dias úteis
  pra isso.

Só depois desse aval eu troco `BTG_ENV` para `production`.

## Um ponto técnico que vamos precisar ajustar juntos

A documentação de referência completa do endpoint de criação de boleto
(`POST /bank-slips`) fica atrás de login no portal do BTG — não consegui ler o formato exato
do corpo da requisição de fora. Implementei com os campos padrão de emissão de boleto
(pagador, valor, vencimento, descrição), mas é bem provável que precise de ajuste fino (ex.:
CNPJ do escritório-cliente, dados bancários da carteira de cobrança) assim que testarmos a
primeira chamada real no Sandbox — o próprio erro que a API devolver vai me dizer exatamente o
que falta.

## Enquanto isso

O Painel Mestre já funciona 100% no manual: criar escritório, editar módulos, marcar fatura
como paga por fora ("Dar baixa manual"), bloquear/liberar acesso. O botão "Gerar boleto e
enviar por e-mail" já manda o e-mail de cobrança certinho mesmo sem o BTG conectado — só não
anexa o link do boleto até a integração estar de pé.
