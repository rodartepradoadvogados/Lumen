# Estado atual do Lúmen e armadilhas conhecidas

**Última atualização: 29 de setembro de 2026.**

Este documento existe para que quem chega ao projeto — pessoa ou agente — não desfaça
sem querer decisões tomadas por um motivo. Cada item abaixo diz **o que é**, **por que é
assim** e **o que acontece se for mexido**. Onde houver comentário no código explicando o
mesmo ponto, o comentário é a fonte; aqui é só o índice.

Se você for alterar qualquer coisa descrita aqui, atualize este arquivo no mesmo PR.

---

## 1. O endereço do sistema é `lumen.rodarteprado.com.br`

Migrado em 26/09/2026, saindo de `lumen-flax-chi.vercel.app`. O endereço antigo continua
registrado na Vercel e responde **308 Permanent Redirect** preservando o caminho, então
links já enviados a clientes seguem funcionando.

**Na prática:**

- Nunca escreva endereço absoluto no código. Use `getAppUrl()` (`lib/appUrl.ts`), que
  resolve `APP_URL` → `VERCEL_URL` → localhost.
- Ao configurar webhook ou callback em painel externo, use o domínio novo.
- Não aponte nada novo para o endereço da Vercel.

**Por que a migração aconteceu:** para publicar a tela de consentimento OAuth, o Google
exige um domínio cuja propriedade possa ser comprovada no Search Console. `vercel.app` é
um domínio compartilhado e não pode ser comprovado por ninguém.

---

## 2. `APP_URL` tem mais consumidores do que parece

Desde o PR #346, os endereços de retorno OAuth do **Dropbox** (`lib/dropbox.ts`) e da
**Microsoft** (`lib/microsoftGraph.ts`) derivam de `getAppUrl()`. Antes tinham o domínio
da Vercel escrito no código como fallback — e como `DROPBOX_REDIRECT_URI` e
`MICROSOFT_REDIRECT_URI` nunca foram definidas na Vercel, era esse texto fixo que valia
em produção.

**Consequência:** alterar `APP_URL` altera junto o retorno desses dois provedores.
`GOOGLE_REDIRECT_URI` continua explícita e independente.

---

## 3. `GoogleCredential.lastSyncAt` é a marca d'água da busca no Gmail

Três colunas foram acrescentadas em 26/09/2026: `lastSyncAt`, `lastSyncError`,
`lastSyncErrorAt`.

`lastSyncAt` **não é telemetria**. É o `after:` da consulta ao Gmail em
`lib/jusbrasilEmailSync.ts`, por caixa, com 2 dias de sobreposição e 7 dias na primeira
varredura. Em caso de falha ela é **preservada de propósito**, para que a janela cubra
todo o período da queda quando a caixa voltar.

**O defeito que isso corrigiu:** antes, a janela vinha da publicação mais recente do
escritório inteiro, de qualquer fonte (`JUSBRASIL_EMAIL`, `DJEN`, `DOU`, `PNCP`, `PJE`…).
Como o robô do DJEN produz publicação todo dia, a marca ficava sempre em "hoje" — e
quando a caixa de um advogado voltava depois de dias com o token morto, tudo o que havia
chegado nela durante a queda estava antes da marca e nunca era buscado. A pessoa
reconectava e continuava sem receber nada, sem erro nenhum na tela.

**Se você trocar isso por uma consulta única por escritório, o defeito volta — e volta
silencioso.** Revarrer é seguro: o dedup descarta por `emailMessageId` e por dia + número
do processo + início do texto.

`lastSyncError` é o que faz a falha de uma caixa aparecer em **Conexões** e em **Meu
Perfil**. Antes disso, o erro só existia no retorno efêmero do botão "Sincronizar agora",
o cron descartava, e a lista mostrava ✓ verde para uma caixa com token morto há dias.

---

## 4. `/privacidade` é rota pública no `middleware.ts`

Não remova essa linha da lista de rotas públicas.

A página `app/privacidade/page.tsx` existia desde antes, mas estava trancada atrás do
login. Três efeitos, todos silenciosos: o link do rodapé da homepage pública levava o
visitante para a tela de login; a Meta não conseguia ler a política exigida para publicar
o app do WhatsApp Cloud API — que é o motivo pelo qual a página foi escrita; e o Google
não conseguia ler a política exigida para publicar a tela de consentimento OAuth.

---

## 5. 🔴 A política de privacidade descreve o comportamento real do código

A seção 4 de `app/privacidade/page.tsx` declara, nominalmente, quais escopos do Google o
Lúmen usa e o que faz com os dados de cada um. Inclui a declaração de **Uso Limitado**
exigida pelo Google para escopos restritos, e esta afirmação, que veio de uma leitura do
código e não de um modelo genérico:

> quando alguém da equipe pergunta ao assistente sobre publicações, um trecho de até 300
> caracteres do texto da publicação — que pode ter origem em um e-mail lido pelo
> `gmail.readonly` — é enviado ao provedor de IA, e não é usado para treinar modelos.

**Regra de manutenção:** se você mudar o que o sistema faz com dados vindos do Gmail ou do
Drive — em especial passar a enviá-los a um terceiro, a um pipeline de IA, ou a uma
integração de dados — **atualize a política no mesmo PR**. Uma política que descreve
errado o que o sistema faz é pior do que política ausente: é declaração falsa, com o app
OAuth em produção e sujeito a verificação do Google.

Os arquivos que a seção descreve estão listados num comentário dentro da própria página.

---

## 6. O fluxo OAuth não pode voltar a falhar em silêncio

`app/api/google/callback/route.ts` devolve mensagem legível em todo caminho de erro. Dois
desses caminhos eram mudos antes:

- Voltar do Google sem sessão — fluxo iniciado em outro endereço do Lúmen, ou cookie
  vencido durante o consentimento — redirecionava calado para `/perfil`. A pessoa via uma
  tela normal achando que havia reconectado, enquanto o `refresh_token` morto continuava
  no banco dando `invalid_grant` a cada ciclo do cron.
- O nonce anti-CSRF recusado devolvia `msg=state`, ilegível para quem usa o sistema.

O nonce (`lib/oauthState.ts`) vive num cookie de **10 minutos**, e o fluxo precisa começar
e terminar no mesmo host — cookies não atravessam domínios. Provedor OAuth novo deve
seguir esse mesmo desenho.

---

## 7. Google Cloud — projeto `530399673289`

- **Status de publicação: "Em produção".** Não clique em "Voltar para o teste". App
  externo em "Testing" tem o `refresh_token` expirado pelo Google a cada **7 dias**, e foi
  esse o sintoma que originou todo o trabalho de 26/09.
- **Domínios autorizados: dois**, `rodarteprado.com.br` e `lumen-flax-chi.vercel.app`. O
  segundo é a rede de segurança da migração, junto com o URI de retorno
  `https://lumen-flax-chi.vercel.app/api/google/callback`, que também continua cadastrado.
  Os dois saem juntos, mais tarde, deliberadamente — não pela metade.
- O app é **não verificado**, o que é esperado: a verificação completa exige auditoria de
  segurança por causa dos escopos restritos (`drive`, `gmail.readonly`, `gmail.send`).
  Publicar não exige verificação, e é o que basta para o token parar de expirar.

---

## 8. Segredos rotacionados em 26/09/2026

`WHATSAPP_VERIFY_TOKEN` e `ASAAS_WEBHOOK_TOKEN` foram trocados. Os valores vivem na Vercel
como variáveis **sensíveis** — ilegíveis depois de salvas, por qualquer pessoa ou
ferramenta — e no gerenciador de senhas do escritório (ver `docs/vault-chaves/README.md`).

Se precisar recriar um webhook, peça o valor ao dono do projeto. Não tente descobrir, e
nunca escreva segredo real no repositório.

---

## 9. Pendências conhecidas — não rediagnostique

- **`lib/outlookEmailSync.ts` tem os mesmos dois defeitos do item 3** — marca d'água por
  escritório e falha por caixa não registrada, porque `MicrosoftCredential` não tem campos
  de saúde. Ficou fora do escopo de propósito.
- **Não se sabe se `ASAAS_ENV` está em `production` ou sandbox.** O código escolhe entre
  `https://api.asaas.com/v3` e `https://api-sandbox.asaas.com/v3` por essa variável, e o
  webhook foi cadastrado no painel de **produção**. Se a integração estiver em sandbox, o
  webhook nunca dispara.
- **Existem dois apps chamados "Lúmen" no Meta for Developers**, nenhum com WhatsApp
  configurado. O que está em uso é "Rodarte Prado Whats" (ID 2380397252793276). Não apague
  nada sem investigar: app do Meta apagado leva junto tudo que dependia dele.
- **A mensagem de `descreverFalhaDaCaixa`** (`lib/jusbrasilEmailSync.ts`) sugere checar se
  a tela de consentimento está em "Testing". Para o escritório Rodarte Prado isso já não
  vale — o app está em produção. O texto é genérico, pensado para outros escritórios que
  venham a usar o Lúmen.

---

## 9b. Reconectar Google não pode trocar o e-mail da linha principal (29/09/2026)

`saveTokensFromCode` (botão "Reconectar Google (Drive)" em Conexões) atualizava a linha
`isPrimaryDrive` com o e-mail da conta que acabara de autorizar. Se essa conta já existia como
outra linha do escritório (caixa de e-mail de um sócio), o `update` estourava
`Unique constraint failed on the fields: (accountEmail)`: o token novo nunca era salvo e o
antigo seguia dando `invalid_grant` a cada ciclo do cron. Agora, nesse caso, só o token da linha
existente é renovado e o Drive principal é mantido. Não reintroduza a troca de `accountEmail`
sem checar `existingByEmail`. Ao reconectar uma caixa, `lastSyncAt` continua intocado de
propósito: a próxima varredura recupera o período da queda.

---

## 10. O repositório antigo ainda existe

`rodartepradoadvogados/rp-financeiro` foi o repositório original e **está parado desde
agosto de 2026**, no PR #72. A produção sai deste repositório, `rodartepradoadvogados/Lumen`.

Se alguém te apontar para o `rp-financeiro`, é engano — código escrito lá não chega à
produção e não tem como ser aproveitado.

---

## 11. Os três PWAs (site, mobile, Atendimento) — o que não pode voltar atrás

Cada app tem manifesto, identidade (`id`) e escopo próprios; o desktop (`/`) só é oferecido
em computador. Defeitos que isto corrigiu e que voltam se for desfeito:

- **Manifesto por convenção (`app/manifest.ts`) vence `metadata.manifest` aninhado** (medido
  no Next 14.2.35). Por isso o manifesto mobile é um Route Handler
  (`app/manifest.webmanifest/route.ts`) e o padrão é `metadata.manifest` do layout raiz. Voltar
  a `manifest.ts` faz o site e o Atendimento perderem o próprio manifesto em silêncio.
- **`scope` "/m/" com `start_url` "/m"** é inválido: o Chrome descarta o `scope` e adota "/",
  e o app mobile passa a "possuir" o site inteiro. Escopo sem barra final: "/m",
  "/atendimento-app".
- **Sem sessão, `/m` e `/atendimento-app` vão para `/m/entrar` e `/atendimento-app/entrar`**
  (dentro do escopo, públicas no `middleware.ts`), nunca para a homepage — que liga o manifesto
  raiz e fazia o Chrome oferecer o app errado. O login volta ao destino, só dentro do app.
- `/sw.js`, `/sw-m.js`, `/sw-atendimento.js` são públicos no middleware (SW atrás de
  redirecionamento é recusado pelo navegador).
- O PWA do site (escopo "/") engloba os outros dois; em celular/tablet o layout do site herda
  o manifesto mobile (`lib/pwaManifestoDoSite.ts`).

---

## 11b. A Capa: só promete o que o código faz, e só mede com consentimento (29/09/2026)

- **Toda frase da Capa (`app/page.tsx`) tem de ter respaldo em código.** A auditoria achou
  "conciliação bancária" (não existe importação de extrato), "prazo fatal com feriados de cada
  tribunal" (o produto sugere prazo, com feriados nacionais, recesso forense e feriados locais
  cadastrados), "93 tribunais" (número sem derivação) e "texto escrito pelo advogado" (a minuta é
  redigida por IA). Saíram. `lib/testes/capa.teste.ts` trava a volta dessas frases; ao escrever uma
  promessa nova, confira o arquivo que a sustenta antes de publicar.
- **O Vercel Analytics só carrega com consentimento.** O aviso de cookies grava
  `lumen_cookie_consent_v1` (`lib/cookieConsent.ts`); `AnalyticsConsentido` (montado no layout raiz)
  só renderiza `<Analytics />` com `"todos"` e descarta eventos de quem revogou. Antes o `<Analytics />`
  era incondicional e "Somente essenciais" não mudava nada. Consequência esperada: as visitas contadas
  caem, e quem entra direto por `/login` ou pelo PWA, sem passar pelo aviso da Capa, nunca é medido.
  A política de privacidade (seção 9) descreve isso: se mudar o comportamento, atualize as duas.
- **Menu do celular:** abaixo de 640px a barra do cabeçalho é só marca + Entrar + hambúrguer. Cinco
  filhos somavam 467px em 390px e a página rolava para o lado. Tema e "Criar conta" moram na folha do
  menu. "Entrar" precisa continuar visível na barra (PWA, item 11).

## 12. A lista de Atendimentos ordena por `Attendance.ultimaAtividadeEm` (29/09/2026)

A lista da Central (`/atendimento-central`, aba Atendimentos) é ordenada pela **atividade mais
recente**: a última mensagem, de entrada ou de saída; sem mensagem, a criação do lead. Antes ordenava
por `createdAt` e a conversa que acabara de falar ficava embaixo.

**Na prática:**

- **Toda `WhatsappMessage` nasce por `registrarMensagem` (`lib/registrarMensagem.ts`)**, que grava a
  mensagem e move `Attendance.ultimaAtividadeEm` **na mesma transação**. Um teste
  (`lib/testes/atividadeDoAtendimento.teste.ts`) varre `app/`, `components/`, `lib/` e `scripts/` e
  falha se aparecer `whatsappMessage.create/createMany/upsert` (ou criação aninhada / `INSERT`) fora
  dele. Esquecer um ponto de escrita é um defeito **silencioso**: a conversa fica "parada" num lugar
  errado da lista, sem erro — o mesmo desenho do item 3 (`lastSyncAt`).
- A coluna é **não nula, com `@default(now())`**, de propósito: lead criado sem mensagem já nasce com
  a data dele, e antes do backfill o desempate por `createdAt` (2º critério do `orderBy`,
  `lib/atividadeDoAtendimento.ts`) mantém a ordem de antes.
- **Backfill:** `scripts/backfill-ultima-atividade.ts`, idempotente (só escreve a linha cujo valor
  difere), roda **sozinho** no build de produção logo depois do `prisma db push` (`package.json` →
  `build`) e nunca derruba o build. Não há passo manual.
- O `take: 200` da lista corta **depois** da ordem por atividade e o filtro de fase (`?fase=`) entra
  no `where` **antes** dele. Arquivados e recusados ficam escondidos por padrão (`?arq=1` mostra).
  O lead aberto por link e fora da lista aparece como "Conversa aberta", e não fixado no topo.
- A tela **não cria contador de não lidas** (não há estado de leitura por usuário) — só a bolinha
  "esperando resposta", que é um fato calculado. A atualização ao vivo é `router.refresh()` a cada
  15 s, pausada com a aba oculta ou texto digitado na resposta (`AtualizarAoVivo`).
- O documento da Central **nunca rola** (`.atd-central-fixa`, 100dvh + overflow clip): só lista,
  conversa e a coluna do trilho rolam. Voltar a `h-screen`/`min-h-screen`, ou pôr o painel de recusa
  fora do trilho, faz o cabeçalho sair da janela do PWA (877x612).

## 13. Publicações: o prazo vem do TEXTO, nunca de um número fixo nem de um campo pré-preenchido

A tela `/publicacoes` somava 15 dias úteis a qualquer publicação (`lib/prazoSugerido.ts`, removido)
e pré-preenchia o "Prazo fatal" do modal com essa data. No banco de demonstração, 16 de 19
publicações que traziam o prazo escrito no texto mostravam data errada. O que vale agora, e o que
volta a quebrar se for desfeito:

- **`lib/prazoExtraido.ts`** extrai o prazo do teor (função pura, com testes de regressão sobre os
  textos do seed em `lib/testes/prazoExtraido.teste.ts`). Toda extração traz **confiança (0 a 3) com
  o motivo em texto** e o **trecho exato de origem**. Sem número no texto, **não há data**: "prazo não
  identificado". Algarismo diferente do extenso ("5 (dez) dias") é conflito e também não sugere data.
- **Nenhum caminho pré-preenche `Task.dueDate`.** O campo "Prazo fatal" abre vazio; a sugestão é o
  botão "Usar sugestão" (`DelegateTaskForm`, `dueSuggestion`) e o botão de confirmar fica desabilitado
  até haver data. O tipo `DelegateTaskInitial` não tem mais `dueDate` de propósito.
- **"Vencido" só é afirmado com confiança média ou alta.** Com confiança baixa a tela diz
  "possivelmente vencido, confira". A fila é ordenada por urgência (vencido, hoje, até 3 dias úteis,
  até 15, depois, prazo não identificado, só ciência) **antes** do corte de 150 grupos.
- **Arquivar publicação que cita prazo, sem prazo registrado, pede confirmação.**
- **CSS global do celular:** as regras `.flex.gap-4.overflow-x-auto` e `.flex.gap-2.flex-wrap`
  casavam com qualquer tela e empilhavam as abas de seção sobre o título. Agora excluem `.secao-abas`
  e `.pub-filtros`. Ao mexer nelas, confira o funil e as abas em 390 px.
- Os filtros de pessoa ("Citado", "Responsável") vêm dos dados do escritório; nenhum nome de advogado
  fica escrito no código, e parâmetro inexistente avisa em vez de ser descartado em silêncio.
