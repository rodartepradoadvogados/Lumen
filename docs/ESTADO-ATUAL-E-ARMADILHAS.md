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


### 11c. Redesenho da Capa (mesmo dia): o que não pode voltar atrás

- **O tema da Capa vale no app logado.** `salvarTema()` (`lib/theme.ts`) grava `rp-site-theme` E
  `rp-portal-theme`; a leitura (`resolverTema`, e o `THEME_INIT_SCRIPT` em texto) dá prioridade à
  chave do portal e, sem nenhuma escolha, segue `prefers-color-scheme`. `PortalThemeSync` aplica o
  tema salvo ao `#portal-shell` depois de uma navegação no cliente: o `<script>` anti-flash do portal
  só roda no HTML do servidor, então sem ele quem escolhia Manhã na Capa e entrava pelo `/login`
  caía em Noite até dar F5. Consequência: a primeira visita agora segue o tema do sistema em todas as
  páginas públicas (antes, sempre Manhã). Rótulos: "Manhã/Noite", como no app.
- **Recuperar senha é a página `/recuperar-senha`** (pública no `middleware.ts`), com resposta
  NEUTRA (`solicitarRecuperacaoDeSenha`, `lib/actions/auth.ts`): o texto e o tempo (piso de 3s) são
  os mesmos exista ou não a conta. O modal antigo dizia "não encontramos esse e-mail" e mostrava o
  e-mail mascarado — revelava quem é cliente. Não recrie `checkLoginForReset`. Sem limite de
  tentativas (pendência).
- **`/cadastro?plano=KEY`** grava só `Office.planId` (interesse, validado contra `Plan.key` ativo e
  não sob medida). Não liga módulo, não define preço, não cobra: isso segue sendo decisão humana no
  Painel Mestre, e a Capa não promete teste grátis nem cobrança.
- **Escala tipográfica da Capa**: cinco tokens `capa-*` em `tailwind.config.ts` + etiqueta, destaque
  e tarja da rampa = oito tamanhos, pesos 400/600/700. Medida em `getComputedStyle`; não acrescente
  tamanho novo na Capa.
- **Preço da Capa** vem de `Plan`/`ModulePrice`; "Em todos os planos: processos, publicações,
  agenda e documentos no Drive" NÃO está na Capa porque o dono não confirmou que vale para todo plano.

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

### 13b. Publicações: a fila é o STATUS do escritório, e a saída da fila tem regras de tempo

- **A fila padrão é "A tratar" = `triageStatus` diferente de TRATADA** (`lib/publicationChips.ts`).
  "Vista" (`PublicationRead`) é marca pessoal e NÃO tira nada da fila. Antes a fila era "Não triadas"
  (= não lida por mim) e uma publicação vista e nunca tratada sumia de todas as abas. Os links antigos
  (`?aba=nao-triadas`, `?aba=arquivadas`) continuam funcionando.
- **Criar compromisso a partir de uma publicação a marca como TRATADA** (`resolvePublicationGroupForOffice`),
  senão ela ficaria em "A tratar" para sempre.
- **"Marcar como vistas" em lote nunca marca quem cita prazo** — a decisão é do SERVIDOR
  (`markPublicationsReadBatch`, com a mesma extração da tela). Não existe "arquivar em massa".
- **Saída da fila = 780 ms de desfecho legível + 220 ms de colapso (1000 ms, pedido do dono).** Com
  `prefers-reduced-motion` a linha sai já, inclusive o `setTimeout`. A cópia local da fila NÃO é
  substituída pela do servidor enquanto há modal aberto ou linha saindo (uma ação de servidor
  revalida a página no meio do caminho e a linha sumia antes do desfecho).
- **Tokens de texto de risco** (`--risco-*-tx`) e `--foco` existem porque `--risco-vencido` no Noite
  mede abaixo de 4,5:1 como texto de 12 px. Use `text-risco-vencido-tx` para texto, `text-risco-vencido`
  só para ícone/borda.

## 14. A nova Gestão (29/09/2026): rotas movidas, e nenhum link salvo pode quebrar

A seção Gestão passou a ser **Indicadores, Pessoas, Conexões, Configurações**, nesta ordem, e o
ícone do rail abre `/indicadores` (a Visão geral). Isso **substitui** a ordem que o dono fixou em
24/09/2026 (Configurações, Conexões, Contatos, Produtividade, Relatórios), por aprovação dele do
plano `gestao-plano.md`. O teste `lib/testes/navegacaoRail.teste.ts` guarda a ordem nova.

Rotas antigas que **continuam existindo só para redirecionar** (guias abertas, favoritos e e-mails
guardam a URL; remover qualquer uma dá 404 em silêncio). Só apague depois de um ciclo de uso:

| Antiga | Vai para |
|---|---|
| `/relatorios` (`?secao=`, `?meses=`) | `/indicadores` e `/indicadores/{processos,funil,publicacoes,financeiro,personalizado}`; `?secao=produtividade` vai para `/indicadores/produtividade` |
| `/produtividade` (`?mes=`, `?aba=`) | `/indicadores/produtividade?visao=equipe\|pessoa\|tempo`; `?aba=delegar` vai para `/delegar` |
| `/contatos` | `/contatos/clientes` (a rota das listas não mudou) |
| `/configuracoes/duplicados` | `/contatos/duplicados` |
| `/configuracoes/relatorio-pastas` | `/conexoes/relatorio-pastas` |
| `/configuracoes?secao=equipe` | `/contatos/equipe` (uma só lista de pessoas) |

`/relatorios/personalizado/imprimir` **não** foi movida (é a folha de impressão, aberta por
`window.open`); o `alias` em `lib/navSections.ts` a mantém na seção Gestão. Se mover, atualize
também `RelatorioPersonalizadoView.tsx`.

`/configuracoes?secao=` agora é a chave de um item do menu (`lib/gestao/configuracoes.ts`); os oito
nomes antigos (geral, financeiro, workflows...) seguem valendo pela tabela `SECAO_LEGADA`.

**Definições únicas (não recrie uma segunda):** "sem triagem" = `triageStatus === "PENDENTE"` no
escritório inteiro (`lib/gestao/semTriagem.ts`); a fila de Publicações ainda conta por outra régua
(grupos não lidos pelo usuário), e é por isso que o selo do rail e o número da Visão geral podem
diferir; "pontos" = `Task.points` das tarefas concluídas, do responsável (`lib/gestao/pontos.ts`);
"prazo em risco" = tarefas abertas (PENDENTE ou EM_ANDAMENTO) de qualquer tipo, dias corridos, hoje =
dia de Brasília comparado em meia-noite UTC (`lib/gestao/dias.ts`). Comparar `dueDate` com
`new Date()` cru erra um dia em Brasília.

**Acesso:** receita, inadimplência e a carga da equipe inteira só para quem tem acesso ao Financeiro
(`isAdmin || financeAccess`); os demais veem a própria carga. O funil só a quem vê o Atendimento
inteiro. "Cobrar" (enviar lembrete ao cliente) **não existe**: é comportamento novo que depende de
decisão do dono; hoje o bloco leva ao Financeiro.

## 15. O aplicativo de Atendimento e a API têm o MESMO recorte da Central (29/09/2026)

**O defeito (explorável em produção):** `app/atendimento-app/**`, `app/api/atendimento/[id]/{stage,ana-responde}`
e a lista/funil do site (`app/(app)/atendimento`, `/funil`) filtravam Attendance **só por `officeId`**.
Quem não tinha acesso ao Atendimento (ou só devia ver os leads repassados a si) listava, abria e
alterava a conversa de WhatsApp de qualquer lead do escritório, e trocava fase / "Ana responde" pela
API. Só a Central e o mobile `/m` aplicavam os três níveis de `lib/acessoAtendimento.ts`.

**O que não pode voltar atrás:**

- **Toda consulta de Attendance feita a partir de tela ou rota de Atendimento parte de
  `whereDoAtendimento(viewer)` / `whereDeUmAtendimento(viewer, id)`** (`lib/acessoAtendimento.ts`):
  escritório + recorte por dono, **fechado** sem acesso (`responsibleId` impossível). O `id` da URL
  é palpite, nunca prova. Não escreva `officeId: viewer.officeId` cru numa consulta de Attendance.
- **Telas** chamam `exigirAcessoAoAtendimentoNaTela()` (404 sem acesso); **rotas de API** chamam
  `atendimentoDaRota(id)` (401 sem sessão, 403 sem acesso, 404 para lead de outro dono/escritório),
  ambas em `lib/guardaDoAtendimento.ts`, **antes** de ler o corpo ou tocar no lead.
- **Funil** (site e app) é só do nível total (`veTodoOAtendimento`), como a aba Triagem da Central.
  O layout do app mostra a frase `SEM_ACESSO_AO_ATENDIMENTO` sem renderizar nenhum filho.
- Ações de servidor com `attendanceId` (pendências, anexos, anotações vinculadas) também conferem o
  recorte; antes só conferiam o escritório.
- O teste `lib/testes/atendimentoRecorteApp.teste.ts` varre esses caminhos e falha se uma consulta
  de Attendance aparecer sem o recorte, se uma página nova do app não chamar a porta, ou se a API
  voltar a filtrar só por escritório.

**Ainda NÃO coberto (mesma família, fora deste PR):** ferramentas do assistente de IA e do agente
MCP (`lib/assistantTools.ts` `consultarAtendimento`, sem o viewer no contexto), relatório
personalizado (`lib/actions/relatorioPersonalizado.ts`), agregados de `/indicadores/[secao]` e
`m/(shell)/relatorios` (só contagens), `relatorio-pastas` (contagem), export do escritório (admin),
e `painel` (consulta do funil roda para todos, mas só é exibida ao nível total).

## 16. O aplicativo de Atendimento (PWA de celular): casca, Conversas e chat em leitura (Onda A, 29/09/2026)

Primeira de três ondas da proposta "conversar de verdade" (a lista do que falta está na descrição do PR).
O que esta onda deixou de pé e **não pode voltar atrás**:

- **A barra inferior é `Conversas · Funil · + · Triagem · Mais` e muda por nível** (`itensDaBarra`,
  `lib/navegacaoDoAtendimentoApp.ts`): nível `total` tem as cinco, `proprios` tem quatro (sem Funil — o
  funil é do escritório inteiro e a página também barra), `nenhum` não tem barra (só "Sem acesso ao
  Atendimento" e o Sair, renderizados no `layout`, sem nenhum filho). `/atendimento-app` agora é a lista de
  **Conversas**; a antiga Triagem foi para `/atendimento-app/triagem`.
- **A conversa é tela cheia**: `/atendimento-app/<id>` (Chat) e `/atendimento-app/<id>/detalhes` não têm o
  cabeçalho do app nem a barra (`ehTelaCheia`); o "+" (`/novo`) também. Ao acrescentar uma tela estática nova,
  inclua o nome em `SEGMENTOS_ESTATICOS` — qualquer outro primeiro segmento é lido como id de conversa.
- **A conversa alheia não vaza nada**: `[id]/dados.ts` lê pelo `whereDeUmAtendimento`; sem resultado, a tela é
  "Sem acesso a esta conversa" (uma frase para id inexistente, de outro escritório ou de outro dono) e nenhuma
  mensagem, nome ou número foi lido do banco. As mensagens só são lidas **depois** disso, e a rota JSON
  `GET /api/atendimento/[id]/mensagens` chama `atendimentoDaRota` antes de tudo.
- **O chat traz as últimas 60 mensagens** e "Carregar mensagens anteriores" por **cursor (instante, id)**, não
  por offset (chega mensagem enquanto se lê) e não só por instante (rajada no mesmo milissegundo).
- **Mídia é rótulo** (`[imagem]`, `[documento: x.pdf]`… vêm de `rotuloDaMidiaWhatsapp`) e o áudio mostra o rótulo
  e a transcrição — a transcrição nunca é mensagem (ver o modelo `TranscricaoDeAudio`). Nada de player, envio
  ou nota interna ainda: o pé do chat diz isso em vez de mostrar um campo que não funciona.
- **A lista de Conversas ordena por `ultimaAtividadeEm`** (`ORDEM_POR_ATIVIDADE`) e o `take` vem depois da
  ordem. "Esperando resposta" é FATO (última mensagem do cliente), não fase; não há contador de não lidas.
- **Tema Dia / Noite / Automático** (`lib/temaDoAtendimentoApp.ts`, chave `rp-atendimento-theme`): o
  Automático acompanha o sistema com ouvinte; o script que evita piscar o Dia fica **dentro** do
  `#atendimento-shell` (fora dele não achava a caixa). Texto sobre o ouro é tinta escura (`--atd-ouro-tx`),
  não o `#fffdf7` de 2,7:1; ouro como texto usa `--atd-ouro-texto`.
- **O seletor de fase do funil do app usa `setAttendanceStage`** (com recorte e regra do motivo de perda), e
  não mais `PATCH .../stage`, cujo vocabulário (`AGUARDANDO_RESPOSTA`) não existe em `lib/funil.ts`. A rota
  antiga continua de pé (com recorte) e sai no PR do envio. Perdido não é oferecido no celular ainda: exige
  motivo.
- O teste `lib/testes/atendimentoAppOndaA.teste.ts` prova a regra (barra por nível, tela cheia, tema, filtros,
  ordem, paginação, mídia) e varre as telas novas atrás do recorte de dono.

## 17. A aba Detalhes do aplicativo de Atendimento é ferramenta, não consulta (PR 5, 29/09/2026)

`/atendimento-app/<id>/detalhes` tem blocos que abrem e fecham (Triagem, Pendências e Processo abertos), índice
preso ao topo, "Voltar ao chat" sempre à vista e `tablist`/`tabpanel` nas guias Chat/Detalhes. O que não pode voltar atrás:

- **Toda ação da aba passa por `atendimentoDaAcao`** (`lib/guardaDoAtendimento.ts`: sessão, acesso e recorte por dono
  antes de ler o corpo). As ações novas ficam em `lib/actions/detalhesDoAtendimento.ts`; as que já existiam
  (pendências, recusa, anotações, assunto, cadastro do contato) são chamadas como estão. Tarefa do atendimento tem o
  ATENDIMENTO no WHERE (a de outro lead do mesmo escritório não é "esta"); `createTask` com `attendanceId` agora confere
  o recorte. O teste `lib/testes/atendimentoAppDetalhes.teste.ts` varre isso.
- **Conversão em processo (N19)**: a regra saiu de `convertAttendanceToCase` para `lib/converterAtendimento.ts`,
  compartilhada com o site. Reserva ATÔMICA (`updateMany where convertedCaseId is null` na mesma transação do Case: duplo
  toque não cria dois). O app trava CNJ com dígito verificador errado, nome temporário e lead recusado
  (`OPCOES_DO_APLICATIVO`); o site mantém o comportamento e ganha só a trava de "já convertido". O app mostra ANTES o que
  será criado/levado (anexos e pasta do Drive vão; **anotações pessoais NÃO são copiadas**) e pede "Entendi que não dá para
  desfazer". Retorna `{error}|{caseId}`; nunca `redirect`.
- **"O que a triagem apurou" (N11)** vive em `Attendance.metadata.triagem` (sem mudança de schema): carimbos por campo
  (confirmado/corrigido, quem, quando) e linhas acrescentadas por pessoas. Sem carimbo o campo é "Da triagem" — o app
  não finge que a Ana apurou o que ela não gravou. `metadata` é compartilhado: toda escrita preserva as outras chaves.
  "Manter atendimento" (proposta de recusa da Ana) só esconde o cartão; a nota da Ana não é apagada.
- **Quadro de tarefas (N21)**: colunas REAIS do escritório. "Mover" só troca a coluna (igual ao arrastar do site);
  concluir é o círculo (status + coluna de conclusão, com quem concluiu).
- **Recusa**: quem recusa é quem vê o atendimento; **desfazer recusa é do nível total** (como a fila de recusados). A carta
  nunca sai sozinha. **Responsável** só é escolhido pelo nível total. **Anotação** editável só pelo autor (N20).
- Arquivar/desarquivar pedem confirmação e não apagam; o app NÃO promete "volta se o cliente escrever" (o código não faz).
- Anexo só abre se o endereço for http(s), em outra aba com `noopener noreferrer`. Enviar anexo pelo celular é o PR 9.

## 18. O aplicativo de Atendimento CONVERSA: envio de texto, idempotência, Ana que relê (Onda B-1, 29/09/2026)

O chat do celular passou a enviar. O que **não pode voltar atrás**:

- **Enviar = `POST /api/atendimento/[id]/mensagens`** (rota JSON, não Server Action: o id da action muda a cada deploy).
  Guarda `atendimentoDaRota` ANTES de ler o corpo (401/403/404, nada gravado); só `application/json`.
- **Idempotência por reserva** (`PedidoDeEnvioWhatsapp`, `@@unique([officeId, clientMessageId])`): a chave é reservada
  ANTES de chamar o WhatsApp. Mesma chave = "já tinha saído", nunca outra cópia. Falha do provedor (`FALHOU`) pode
  tentar de novo com a mesma chave. Falha SEM resposta (`SendResult.incerto`: tempo esgotado, rede) NÃO é recusa: a
  reserva fica `RESERVADO` antiga e o app mostra "Sem confirmação"; reenviar só com confirmação humana. Tabela de
  decisão pura em `lib/envioDeMensagem.ts`; banco em `lib/envioDeMensagemDb.ts`. `WhatsappMessage` continua nascendo só
  por `registrarMensagem` (ganhou `clientMessageId`, só para o balão local virar o de verdade sem duplicar).
- **Quem envia assume, só se o envio deu certo** (`silenciarAtendente` depois do sucesso). Falha não assume.
- **A Ana relê o silêncio imediatamente antes de enviar** (`lib/anaReleOSilencio.ts`, chamada em `atendenteResponde`):
  desiste se uma pessoa assumiu, se há saída depois da pergunta ou se há envio de pessoa em curso. Sobra uma janela de
  milissegundos entre a releitura e a chamada (só um bloqueio de linha durante chamada de rede a fecharia).
- **Interruptor e "Devolver à Ana"** usam `definirAtendenteResponde` / `devolverAtendenteResponde` (com recorte).
  As rotas `ana-responde` (gravava `metadata`, que ninguém lia) e `stage` foram removidas.
- **Janela de 24 h** (`lib/janelaDe24h.ts`): só provedor Meta; conta a última ENTRADA. Fechada = aviso no lugar do campo
  e 409 na rota, sem reservar. Faixa completa (Ligar/Criar tarefa/Como reabrir) é o PR 6.
- **Atualização a cada 15 s** é rota JSON (`?depois=<cursor>` + estado), não `router.refresh()`: não perde rolagem nem rascunho.
- **Sigilo:** rascunhos e mensagens não confirmadas ficam só em `sessionStorage` (apagados ao Sair); o service worker do
  Atendimento não guarda nada. Teclado: a moldura usa `visualViewport`.
- Testes: `lib/testes/atendimentoAppEnvio.teste.ts`.

## 19. Janela de 24 h fechada: a faixa tem saídas, e nenhuma delas é "ligar pelo WhatsApp do escritório" (PR 6, 29/09/2026)

Com a Meta e a janela fechada, o campo do chat dá lugar a `FaixaDaJanelaFechada` (regra pura em `lib/faixaDaJanela.ts`).
Nunca aparece para Evolution nem sem WhatsApp. O que **não pode voltar atrás**:

- **"Ligar" é `tel:` = ligação normal do celular.** NÃO é chamada pelo WhatsApp. A Calling API da Cloud API existe, mas exige
  habilitação do número, permissão do cliente por chamada, limite de 2.000 destinatários/dia e softphone/SIP/WebRTC
  (developers.facebook.com/documentation/business-messaging/whatsapp/calling). O Lúmen não tem nada disso: não escreva "ligar pelo
  WhatsApp" na tela.
- **"Abrir no meu WhatsApp" é `https://wa.me/<dígitos>`**: abre o WhatsApp do celular DA PESSOA, do número PESSOAL dela. Não sai do
  número do escritório e não entra no histórico do Lúmen. O texto de apoio diz isso; não o esconda.
- **Modelo aprovado NÃO existe aqui** (etapa "modelos aprovados", PR 15). A faixa diz "ainda não disponível". Fora da janela a Meta
  só aceita modelo (send-messages, "Customer service windows"); quando o PR 15 sair, este é o lugar do botão.
- **"Criar tarefa"** usa `criarTarefaDoAtendimento` (guarda `atendimentoDaAcao`, recorte por dono, mesma tarefa da aba Detalhes e da
  Agenda), título padrão "Retomar contato com <nome>", data padrão amanhã em Brasília.
- **Número**: `digitosParaContato` só acrescenta 55 quando tem cara de número brasileiro (11 dígitos com o 3º = 9; 10 com o 3º de 2 a 5);
  número estrangeiro com DDI não ganha 55. Número que não passa disso não mostra Ligar nem wa.me.
- Site (`WhatsappReplyBox`, `replyWhatsapp`): a janela agora também é conferida antes (ver item 22).
- Teste: `lib/testes/atendimentoAppJanela.teste.ts`.

## 20. "Ana responde": o motivo real do erro do Hermes, o botão no app e o interruptor que parece botão (29/09/2026)

**O defeito relatado:** o dono marcou "Ana responde", clicou em "responder última mensagem" e viu "o assistente não está
disponível". Duas causas de código e uma provável de ambiente:

- **A mensagem escondia o motivo.** Todo defeito do Hermes virava "agente indisponível: ..." ou "a ponte com o agente não
  está configurada" — sem dizer QUAL variável, nem se foi recusa (token), perfil ausente, demora ou rede. Agora
  `FalhaDoHermes.causa` (decidida pelo CÓDIGO HTTP, nunca pelo texto) alimenta `lib/motivoDoAtendente.ts`: não configurado
  (diz `HERMES_URL` e/ou `HERMES_TOKEN`), 401/403 recusou (o token da Vercel não confere com o da ponte), 404 perfil
  (`HERMES_PERFIL`), demora, ponte fora do ar, resposta em branco, erro N da ponte. `semSegredoDaPonte` apaga o valor do
  token, o endereço da ponte e qualquer `Bearer ...` de tudo o que sai (tela e log). Só NOMES de variável aparecem.
- **A Server Action era cortada antes do Hermes.** `responderUltimaPergunta` ESPERA o Hermes (até 105 s) e uma Server Action
  herda o `maxDuration` do segmento de onde é chamada; as quatro telas que a hospedam (`/atendimento/[id]`,
  `/atendimento-central`, `/m/atendimento/[id]`, `/atendimento-app/[id]`) não tinham `maxDuration` e corriam no tempo padrão
  da plataforma. Agora têm `120` (o teto dos webhooks). O teste `atendimentoAppAnaBotao.teste.ts` trava `maxDuration >` espera.
- **Provável causa em produção (NÃO provável por código): ambiente.** Se a Vercel não tem `HERMES_URL` e `HERMES_TOKEN`, o
  Hermes nunca é chamado. Se o token difere do de `/etc/lumen-hermes.env` na VPS, dá 401. Sem `HERMES_PERFIL` o perfil vira
  `lumen-tenant-<slug>` (nunca existiu na máquina) e dá 404. A tela agora diz qual.

**O que não pode voltar atrás:**

- **"Responder última mensagem" existe no app** (`BarraDoChat`), logo abaixo do interruptor, com a MESMA ação do site
  (`responderUltimaPergunta`, com o recorte de `filtroDoAtendimento`). Só aparece com a última mensagem do cliente e o
  interruptor presente (atendente ligado no escritório e nenhuma pessoa assumiu). 44 px, "está respondendo…", erro com
  `role="alert"`, e ao terminar a conversa busca as mensagens na hora (`aoResponder`).
- **O interruptor é UM componente** (`components/InterruptorDaAna.tsx`), usado no site e no app: botão de 44 px,
  `role="switch"` + `aria-checked`, "Ana responde: Ligada/Desligada" ESCRITO, borda de 2 px, radius 2 px, sem faixa lateral,
  sem sombra, foco pelo `:focus-visible` global (não apagar com `outline-none`). Bordas: `atd-campo`/`atd-ouro-texto` no app,
  `tx-3`/`tx` no site. O teste calcula os contrastes do `globals.css` em Dia e Noite (>= 3:1 na borda, AA no texto).
- O site aplica o estado na hora e desfaz se a gravação falhar (antes a caixinha só mudava depois do `router.refresh()`).
- **NÃO provado por teste:** `atendenteResponde` inteira (precisa de banco) e a Vercel/VPS reais. O que foi provado: a
  chamada HTTP e as frases contra um provedor falso local (200, 401, 403, 404, 500 ecoando o token, vazio, lento, porta fechada,
  variável faltando).

## 21. O tema do aplicativo de Atendimento não pode herdar o `dark` do site; e o funil abre recolhido (29/09/2026)

**Tema — a causa do botão "que não funcionava".** O layout raiz (`lib/theme.ts`, `THEME_INIT_SCRIPT`) põe a classe
`dark` no `<html>` de TODA rota quando o sistema está escuro ou o site foi usado em Noite (mesma origem, mesmo
`localStorage`). O **Dia** do Atendimento não define paleta própria — herda a do `:root` —, então com `html.dark`
ligado o "Dia" saía escuro: o botão só trocava entre "Noite" e "Noite" (medido em Chromium com `colorScheme: dark`:
`background-color` do `#atendimento-shell` ficava `rgb(24, 27, 31)` nos dois). Em sistema claro tudo funcionava, por
isso a falha só aparecia em alguns aparelhos. O que **não pode voltar atrás**:

- Dentro do app, o `<html>` não fica `dark`: o script inicial (`SCRIPT_INICIAL_DO_TEMA`) e `aplicar()`
  (`components/atendimento-app/tema.ts`) tiram a classe; ao sair do app, `SeguidorDeNavegacao` devolve o tema do site
  (`devolverTemaDoSite`, via `temaEfetivo()`). A paleta escura do app é toda de `.atendimento-dark`.
- Testes: `lib/testes/atendimentoAppCasca.teste.ts` executa o script com `html.dark` vazado. Tela/`fixed inset-0`,
  service worker (não guarda nada) e re-render do React foram investigados e NÃO eram a causa.
- Ainda de fora do tema (de propósito ou não medido): o `<body>`/`<html>` ficam claros nos dois temas (só a caixa
  `#atendimento-shell` muda) — visível em rolagem elástica do iOS; a tela de entrada não tem tema.

**Funil — todas as colunas começam RECOLHIDAS.** Regra em `lib/colunasDoFunil.ts`, navegador em
`components/atendimento/ColunasRecolhiveis.tsx`, usado pelo quadro da Central (arrasta), pela página do site
(`/atendimento/funil`) e pela do aplicativo (`/atendimento-app/funil`). Nome e contagem ficam à vista; o cabeçalho é um
botão (`aria-expanded`, 44 px) e há "Expandir todas / Recolher todas". A escolha vai para `localStorage`
(`rp-funil-abertas-<tela>`, em try/catch); quem nunca escolheu, ou tem lixo gravado, vê tudo recolhido, e o primeiro
desenho é sempre recolhido (sem divergência de hidratação). **Arrastar:** os ouvintes `onDragOver/onDrop` ficam na
coluna inteira, não no corpo que some — soltar num cabeçalho recolhido move o card (não abre sozinha ao passar, para a
coluna não crescer no meio do gesto). A página do site agora tem as seis colunas (antes faltava Aguardando e os cards
dela apareciam em Novo). Testes: `lib/testes/funilColunasRecolhidas.teste.ts`.

## 22. A janela de 24 h também vale no SITE e no /m: avisa antes, com as mesmas saídas, e o servidor recusa cedo (29/09/2026)

Antes, `WhatsappReplyBox` -> `replyWhatsapp` só descobria a janela fechada DEPOIS de tentar a Meta e mostrava o erro dela, sem saída.
Agora:

- **As três telas que hospedam a caixa** (`/atendimento/[id]`, `/atendimento-central`, `/m/atendimento/[id]`) calculam
  `janelaDaConversa` (última entrada IN + provedor; a MESMA regra pura de `lib/janelaDe24h.ts` do app) e passam `janela` e
  `telefone` ao `WhatsappReplyBox`. Janela fechada: o campo é trocado pela `FaixaDaJanelaFechada` do app (Ligar `tel:`, Abrir no meu
  WhatsApp `wa.me` com o aviso de número pessoal, Criar tarefa com o recorte de `atendimentoDaAcao`, Como reabrir?). Sem `janela`,
  aberta ou Evolution: o campo de sempre. Os textos e os links continuam em `lib/faixaDaJanela.ts` (não duplicar).
- **Um componente, dois temas.** `FaixaDaJanelaFechada` ganhou `tema` (`"app"` padrão, `"site"`). Os tokens `--atd-*` só existem
  dentro de `.atendimento-shell`; no site eles NÃO existem e a borda/fundo dos campos ficaria transparente. Por isso o tema do site usa
  `regua-forte`/`sf`/`marca-tx`. Não passe `--atd-*` para o tema do site, e não mude o tema do app (o teste trava os dois).
- **Servidor:** `replyWhatsapp` confere a janela depois do recorte e ANTES de `sendWhatsappText` e recusa com `recusaDaJanelaFechada`
  (motivo + saídas, sem tentar a Meta). A Evolution segue sem janela (é a regra pura que decide, não um `if` em `replyWhatsapp`).
  O erro da própria Meta (`ehErroDeJanela`) continua sendo a autoridade quando esta conta erra.
- `nomeParaAFaixa` (em `lib/faixaDaJanela.ts`) repete de propósito `nomeEhTemporario` + `pareceTelefone`: importar aqueles módulos
  levaria código de servidor ao componente de cliente. O teste compara as três regras e o prefixo, para não divergirem.
- **Pontos frágeis conhecidos:** a janela é lida quando a página é renderizada; se ela fechar com a tela aberta, o servidor recusa
  com o motivo claro, mas a faixa só aparece no próximo refresh (a Central já atualiza ao vivo). Escritório sem `WhatsappConfig` e
  conversa sem nenhuma entrada conta como janela fechada no servidor (na tela `podeResponder` já esconde a caixa nesse caso).
- Teste: `lib/testes/siteJanela24h.teste.ts`. NÃO provado: renderização real no navegador (tema Dia/Noite do site) e envio real pela Meta.

## 23. Dez suítes vermelhas na main: dois tipos de causa, e um deles era regressão de verdade (29/09/2026)

`npm run testar` chegou a 10 suítes falhando na main. Nenhuma foi afrouxada; a triagem foi esta:

- **Teste velho (o código mudou de propósito):** as telas do celular moveram de `app/m/...` para `app/m/(shell)/...`
  (PWAs lado a lado). Seis suítes liam o caminho antigo e davam `ENOENT`. O caminho foi atualizado; as verificações
  (que a bolinha usa `direction === "IN"`, que `/m/mais` não importa `navSections`, que a proposta da Ana chega a uma
  pessoa, que a lista exclui o já excluído) continuam exatamente as mesmas, agora lendo o arquivo certo.
- **Regressão real, causada por merge:** o merge `f5d6101` ("resolve conflicts, keep my changes") da branch do PWA de
  Atendimento **devolveu `app/(app)/atendimento/funil/page.tsx` e `app/(app)/atendimento/page.tsx` à versão anterior à
  Triagem** — sumiram as três guias (Esperando / Funil / Recusados), a bolinha, a exclusão do lead recusado, o `isAdmin`
  repassado ao quadro, a lista de estágios única (o estágio `AGUARDANDO` caía em "Novo") e, na lista, o título "Suas
  demandas" para quem só vê os próprios, o botão de nova conversa e a data com fuso. As duas páginas foram restauradas da
  versão anterior ao merge, mantendo o recorte novo (`whereDoAtendimento`, funil só no nível total).
  `app/api/alerts/count/route.ts` (contador do app) também voltou ao formato antigo e chamava `getAlertsCount` sem os dois
  recortes fail-closed (Atendimento e Peticionamento); passou a passar os mesmos que todo outro chamador.
- **Data sem fuso:** `triagem/page.tsx` do app usava `formatDate(createdAt)` (instante) e passou a `dataDeBrasilia`. Em
  `app/page.tsx` a trava do fuso casou com `Number.toLocaleString` (falso positivo da heurística); o código passou a usar
  `Intl.NumberFormat("pt-BR")`, mesmo resultado, sem mexer na trava.

**Lição:** depois de resolver conflito de merge em favor de "a minha branch", rode `npm run testar` antes de mergear e
olhe o diff do MERGE contra a `main` (`git diff <main> <merge>`), não só o da branch: arquivos que a branch nunca
pretendeu tocar podem voltar no tempo sem erro de compilação.

## 24. Nota interna, aviso "A Ana não respondeu" e aviso de mensagem nova no aplicativo de Atendimento (R1, 29/09/2026)

Propostas v2: PR 7 (nota interna), o aviso quando a Ana desiste e o que couber do PR 11 sem push. O que **não pode voltar atrás**:

- **A nota é um MODELO PRÓPRIO (`NotaDaConversa`), nunca uma `WhatsappMessage` marcada "interna"** (mesma decisão de `TranscricaoDeAudio`).
  Uma mensagem "interna" depende de todo `where` lembrar de excluí-la; um esquecimento no caminho de saída manda a nota ao cliente ou a
  faz virar "fala do cliente" para a Ana. Nenhum código de envio ou de leitura da Ana conhece a tabela: o teste
  `lib/testes/atendimentoAppNota.teste.ts` varre `whatsapp.ts`, `hermesPonte.ts`, `registrarMensagem.ts`, `envioDeMensagemDb.ts`,
  `anaReleOSilencio.ts`, `estadoDoChat*`, `janelaDe24h.ts`, transcrição e `transferirLead.ts` atrás do nome. `atendenteResponde` só importa
  `registrarAvisoDaAna` (grava, nunca lê).
- **Schema (aditivo, `db push`):** tabela nova `NotaDaConversa` (`tipo` NOTA | SISTEMA, `userId`/`autorNome` só na NOTA, `texto`,
  `clientMessageId`, `textoHash`), `@@unique([officeId, clientMessageId])`, cascata com o Attendance, índice `(attendanceId, createdAt, id)`.
  Nenhuma coluna existente mudou.
- **Mesma rota, `modo` no corpo:** `POST /api/atendimento/[id]/mensagens` com `modo: "nota"` salva a nota. Ausente ou `"mensagem"` = envio ao
  cliente, como sempre; QUALQUER outro valor é 400 (nunca "na dúvida, envia"). O despacho é `lib/pedidoDoChatDb.ts` (`despacharPedidoDoChat`):
  a nota RETORNA antes de `enviarMensagemDoApp`. A guarda `atendimentoDaRota` continua antes de ler o corpo; o autor vem da sessão
  (`viewer.name`), nunca do corpo.
- **Idempotência da nota** por `clientMessageId` (único por escritório): mesma chave = a MESMA nota; outro texto, outra conversa ou chave de
  aviso de sistema = 409, sem devolver o texto alheio. Como não existe "duplicar no WhatsApp", a nota NÃO tem o estado "sem confirmação":
  falha de rede = "Não salva · tente de novo, repetir não duplica".
- **A nota não assume a conversa e não conta como saída**: não chama `silenciarAtendente`, não grava `waLastMessageAt`, `firstResponseAt`,
  `ultimaAtividadeEm` nem o prazo de 15 min (o arquivo não toca em `Attendance`; o teste trava). A lista e a prévia continuam lendo só
  mensagens. A nota não depende de telefone nem da janela de 24 h: o seletor "Para <nome> / Nota interna" existe também no atendimento sem
  WhatsApp e com janela fechada (só o campo AO CLIENTE dá lugar à frase/faixa).
- **Leitura unificada:** `carregarPaginaDoChat` e `carregarMensagensDepois` leem as duas tabelas com o mesmo cursor (instante, id) e juntam
  pela mesma ordem; toda consulta de nota tem `attendanceId` E `officeId` no where. `MensagemDoChat` ganhou `tipo?: "nota" | "sistema"` e
  `autor?` (opcionais: quem monta mensagem de WhatsApp não muda).
- **Visual (não só cor):** nota = borda tracejada de ardósia, cadeado, "Nota interna · só a equipe", autor e hora; aviso de sistema =
  centralizado, borda contínua, ícone de informação, "Aviso do sistema · só a equipe". Campo: dois botões `aria-pressed` de 44 px, "Salvar nota"
  com cadeado, rascunho SEPARADO por modo (`atd-rascunho:nota:<id>`, apagado ao Sair), modo abre sempre em "ao cliente". Contraste da ardósia
  medido no CSS em Dia e Noite.
- **"A Ana não respondeu: <motivo>"**: quando `relerAntesDeEnviar` manda desistir, `atendenteResponde` chama `desistirComAviso`, que grava um
  registro SISTEMA com a frase do motivo (o mesmo texto de `decidirDepoisDaReleitura`). Chave `sistema:ana-desistiu:<id da pergunta>`: UMA por
  pergunta do cliente, então novas tentativas e o botão "responder agora" não repetem o aviso (o `:` não passa na validação da chave do
  aparelho, então nenhuma nota digitada colide). Não lança (o aviso nunca derruba a Ana) e a chamada é `return desistirComAviso(...)` sem
  `await` entre a releitura e o envio (o teste da janela continua valendo). O texto diz "A Ana" fixo; um escritório que renomeou o atendente
  ainda vê "A Ana".
- **Aviso de mensagem nova SEM push:** `lib/avisoDeMensagemNova.ts` + `useAvisoDeMensagemNova`. Com o chat aberto e a aba fora de vista o
  título vira "(N) Nova mensagem · <título>" e o selo do app instalado (`navigator.setAppBadge`, opcional, em try/catch) mostra N; volta ao
  normal ao voltar à aba ou sair da conversa. Só o NÚMERO (nunca nome nem texto) e só mensagens do CLIENTE (nota e aviso não contam). A busca
  de 15 s continua à vista; fora de vista anda a cada 1 min. A região `aria-live` do chat só fala com a aba à vista; o log continua sem
  `aria-live` e o contador do "↓ N novas" segue o único `aria-live` de `RolarParaOFim` (ganhou `aria-label` que diz o que o botão faz).
  **NÃO EXISTE aviso com o aplicativo fechado (push, N17/PR 14):** a tela Mais diz "a construir" e a política de privacidade não mudou
  porque nada novo sai do aparelho.
- **NÃO provado:** banco real (o teste usa repositório em memória e provedor/`fetch` falsos), o navegador (título, selo, rolagem, tema),
  `atendenteResponde` inteira (precisa de banco) e o comportamento do selo em iOS/Android reais. Ainda sem "excluir nota com desfazer"
  (proposta 6.8) e sem editar nota. Notas e avisos NÃO entram em exportação de escritório nem em relatórios (nenhum deles foi tocado).

## 25. Mídia no balão, anexos pelo celular, fixar e respostas rápidas (PR 8, 9 e 10 do aplicativo de Atendimento, 29/09/2026)

Muda o item 16 ("mídia é rótulo"): a mídia RECEBIDA agora aparece no balão. O que **não pode voltar atrás**:

**Mídia no balão (PR 8)**
- **O arquivo sai só por `GET /api/atendimento/[id]/midia/[mensagemId]`.** A decisão mora em `lib/midiaDoChatServico.ts`
  (portas por parâmetro, testável sem banco) e a ordem é o recorte: **guarda `atendimentoDaRota` (401/403/404) -> mensagem da MESMA
  conversa e escritório -> só mídia recebida e guardada -> anexo dentro da mesma conversa -> download**. O `attendanceId` e o
  `officeId` da consulta vêm da GUARDA, nunca do pedido. Mensagem de outra conversa = o mesmo 404 (nada vaza). Frases da rota
  (`FRASES_DA_MIDIA`) não têm id, endereço do Drive nem o texto do erro do provedor (erro do Drive = 502 com frase fixa).
- **Nunca URL do Drive no balão** (`MidiaDaBolha` só conhece `enderecoDaMidia`) e nunca redirecionar para ele.
- **Só imagem raster, áudio, vídeo e PDF saem inline** (`tipoParaServir`). SVG, HTML, XML, Office, zip e tipo desconhecido vão como
  `application/octet-stream` + `attachment`. O nome do arquivo só escolhe o tipo quando o Drive devolveu octet-stream, e só entre os tipos
  seguros. `nosniff`, `CORP: same-origin`, `no-referrer`, `Vary: Cookie` e `CSP: sandbox` (menos no PDF: o leitor de PDF não abre em sandbox).
- **Cache: `private, no-store`** na rota, e o `sw-atendimento.js` não usa `caches` nem `respondWith` (o teste falha se usar). O preço: cada
  abertura de foto busca o arquivo de novo no Drive. É de propósito: mídia de cliente não fica no aparelho de quem sai do app.
- **Sem baixar sozinho:** imagem = miniatura `loading="lazy"` (a rota entrega o arquivo inteiro; foto do WhatsApp é leve); áudio =
  `<audio preload="none">`; vídeo = cartão + "Carregar vídeo"; documento = cartão com "Abrir" (outra aba, `noopener noreferrer`).
  Figurinha não é guardada, e o balão diz isso. Limite de 30 MB (`LIMITE_DA_MIDIA_BYTES`); o WhatsApp corta em 16 MB. **Range** (206/416)
  existe porque o player do iPhone só toca áudio/vídeo se o servidor responder a `bytes=0-1`.
- **Schema (aditivo):** `WhatsappMessage.attachmentId`, `midiaMime`, `midiaBytes`, gravados por `ingestIncomingWhatsapp` depois do upload.
  Sem `@relation`: se alguém apagar o anexo, o id fica solto e a rota responde "indisponível". **Mídia anterior à coluna:** foto, áudio e
  vídeo são achados pelo nome do arquivo (`-<hash do id da mensagem>.`, `restoDoNomeDeMidiaSemNome`, sempre dentro do mesmo atendimento;
  dois candidatos = "indisponível"). **Documento antigo (nome do cliente) fica "indisponível"** até haver um backfill.
- Tamanho e tipo do cartão vêm dessas colunas; sem elas o cartão omite (não inventa).

**Anexos pelo celular (PR 9)** — `Detalhes > Anexos`: "Tirar foto" (`capture="environment"`) e "Escolher arquivo".
- Mesmo fluxo do site: Vercel Blob (com progresso) -> `finalizeAttachmentUpload` -> Drive, pasta do atendimento. O limite é o MESMO
  (25 MB do `blob-token`; o teste compara os dois números). O site aceita qualquer tipo; o celular aceita a lista de
  `lib/anexoDoCelular.ts` (documentos, imagens incluindo HEIC, áudio, vídeo, zip) e recusa exe/bat/js/html/svg... pela EXTENSÃO
  (o `type` que o navegador declara não abre a porta). Foto da câmera sem nome ganha `foto.<ext do tipo>`.
- `anexarArquivoDoCelular` começa por `atendimentoDaAcao` (recorte por dono) e prende o anexo ao atendimento AUTORIZADO.
  **Desfazer** (`desfazerAnexoDoCelular`): só quem enviou, em 10 minutos, nunca a mídia do cliente, nunca anexo de protocolo.
- **Não é envio ao cliente**: nada aqui chama o WhatsApp (mídia de saída é o PR 14). A URL do Blob é pública e temporária (padrão do site).

**Responder, fixar, respostas rápidas (PR 10)**
- **Responder é citação LOCAL.** O WhatsApp aceita `context.message_id`, mas isso muda o que se envia e a chave de idempotência
  (`textoHash`): a mesma chave com outro alvo seria "outro texto". Sem esse desenho, a citação só ajuda quem escreve; a barra do campo e o
  menu dizem que o cliente NÃO a vê, e `enviarMensagemDoApp` não conhece citação (o teste trava).
- **Fixar:** `MensagemFixada` (uma por atendimento, `attendanceId @unique`, cascata). Visível a quem tem acesso ao atendimento e
  sincronizada pela atualização de 15 s (`EstadoDoChat.fixada`). `fixarMensagem`/`desafixarMensagem` começam por `atendimentoDaAcao` e
  conferem que a mensagem é deste atendimento e escritório; a leitura confere de novo. O balão "enviando" do aparelho não se fixa.
- **Respostas rápidas:** `RespostaRapida` por escritório (limite 100, título único sem diferenciar maiúscula, texto até 1.000
  caracteres, sempre menor que o limite do envio). **Quem cria:** quem tem acesso ao Atendimento. **Quem edita/exclui:** o autor ou o nível
  total (e quem perdeu o acesso, ninguém). Toda consulta e escrita leva `officeId` (`updateMany`/`deleteMany` com o escritório no WHERE).
  **Inserir NUNCA envia**: o toque põe o texto no campo, depois do que já estava escrito. Gerenciar em `Mais > Respostas rápidas`.
  O atalho `/` da proposta NÃO foi feito.
- **Schema (aditivo):** `MensagemFixada` e `RespostaRapida` (sem relação com Office; só `MensagemFixada` -> Attendance, com cascata).

**Não provado (só código e teste de mesa):** streaming da resposta com arquivo de vários MB na Vercel (o corpo já está todo na memória da função;
o limite de 4,5 MB da plataforma vale para resposta NÃO transmitida, e a rota transmite em pedaços), o Drive/OneDrive/Dropbox reais, o player do
iPhone com Range, a câmera e o `capture` em aparelho de verdade, o contraste no navegador (usei só tokens `--atd-*`).
**Armadilha de ambiente:** `node_modules` compartilhado entre clones faz um `prisma generate` de outra branch apagar do cliente os modelos
novos desta; se o `tsc` reclamar de `respostaRapida`/`mensagemFixada`, rode `npx prisma generate` de novo.

## 26. Exceção deliberada: o aplicativo de Atendimento segue o "acabamento WhatsApp"; o site não muda (etapa 1, 30/09/2026)

O `DESIGN.md` (sistema "Guias": canto de 2px, sem sombra, sem pílula) **continua valendo para o site**. O aplicativo de Atendimento
(`/atendimento-app`) é exceção aprovada pelo dono, com estes quatorze rompimentos (a lista completa está em `DESIGN.md` §9): pílulas;
balão de 14px; etiqueta de 5px; botão flutuante com sombra; sem divisória entre linhas; sem filete de ouro; sem cabeçalho em faixa;
seleção em ouro suave (18%) e ouro cheio só em selo, botão flutuante, envio e play; hierarquia por fundo; avatar de iniciais; negrito
só na não lida; fundo Noite `#14151c`; etiqueta 11px/600 e título 26px/700; barra de quatro alvos + botão flutuante. O que **não pode voltar atrás**:

- **Tudo é escopado ao app**: tokens `--atd-*` em `.atendimento-shell`/`.atendimento-dark` (`app/globals.css`), nada no `:root`. Quem
  copiar uma classe `bg-atd-*`/`rounded-atd-*` para o site está quebrando a exceção (o teste `atendimentoAppVisual` varre isso).
  `--sf-fundo` DENTRO do app agora é `--atd-tela` (fundo uniforme), para as telas ainda não migradas não destoarem.
- **Colisão de nomes no Tailwind**: `text-atd-previa` seria cor E tamanho. Por isso os tamanhos do app se chamam `text-app-*`
  (`titulo`, `nome`, `previa`, `meta`, `tag`) e as cores `atd.*`. Não misture.
- **Componentes comuns** (`components/atendimento-app/ui/`, import por `index.ts`): `Avatar` (iniciais; `fotoUrl` opcional que cai nas
  iniciais), `Pilula`/`CampoPilula`, `FiltroPilula` (ativo em ouro suave), `SeloContagem` (número ou ponto), `Selinho` (tons fase/neutro/alerta),
  `TituloDeTela`, `BotaoFlutuante`. As próximas telas (chat, Detalhes/Mais, Funil/Triagem/Nova) devem usá-los, não recriar.
- **Barra inferior**: `itensDaBarra` agora devolve QUATRO alvos no nível `total` (Conversas, Funil, Triagem, Mais) e TRÊS em `proprios`
  (sem Funil, como antes); `nenhum` continua sem barra. "Nova conversa" saiu da lista e é o botão flutuante (`temBotaoNovo`,
  `botaoNovoVisivel`: só Conversas/Funil/Triagem, nunca para `nenhum`, nunca em tela cheia). **A regra de quem vê o quê não mudou.**
  O selo de contagem da barra existe (`contagens` de `BarraInferior`) mas NENHUMA tela o alimenta ainda: sem consulta nova no layout.
- **"Não lida" NÃO existe no banco** (nem quantas mensagens o cliente mandou em sequência). A lista usa o dado mais próximo, o FATO
  "esperando resposta" (a última mensagem é do cliente): ele acende o negrito do nome, a hora em ouro e o PONTO de ouro (`SeloContagem` sem
  número). O chip "Não lidas" do desenho aprovado é, na prática, o chip "Esperando resposta". Quando existir lida/não lida por conversa,
  troca-se o ponto pelo número. O "✓✓" da prévia significa "o WhatsApp aceitou o envio", NÃO "lida" (não há confirmação de leitura).
- **Alfinete** da linha = a conversa TEM mensagem fixada (`MensagemFixada`, lida por relação um-para-um em `attendanceId @unique`, só o
  id). Não é "conversa fixada no topo": esse dado não existe; o ponto de extensão é `LinhaPronta.fixada`.
- Contraste: texto em ouro `#7a5810` (Dia) / `#e3bf5c` (Noite); `--atd-ouro-texto` (legado) foi alinhado a esses valores.

**Não provado**: telas além da lista (chat, Detalhes, Mais, Funil, Triagem, Nova ainda têm o visual antigo por dentro, sob o fundo e a barra novos);
fluxo real com login e banco (a lista foi vista em Chromium com dados de exemplo, não com um escritório real); aparelho de verdade (safe area,
teclado, PWA instalado); leitor de tela.


## 28. A aba Detalhes e a tela Mais no acabamento WhatsApp: só o visual mudou (etapa 3, 30/09/2026)

Continuação do item 26 (exceção deliberada, só dentro de `/atendimento-app`). Migrados: a aba Detalhes (`components/atendimento-app/detalhes/*`:
Contato, Triagem, Pendências, Processo, Dados, Anexos, Tarefas, Anotações, Encerrar, índice, `base.tsx`), a tela Mais e suas filhas (Perfil, Equipe,
Tema, Respostas rápidas, Sair), `ManterRespostasRapidas` e `FormularioDeSair`. **Nenhuma regra mudou**: ações (`atendimentoDaAcao`), recorte de acesso,
conversão em processo, idempotência, Desfazer e validações são as mesmas e continuam provadas nas suítes antigas. O que **não pode voltar atrás**:

- **Tudo em `cx` (`detalhes/base.tsx`) é o vocabulário da aba**: `cartao` (`bg-atd-pilula`), `painel` (um degrau mais escuro, `bg-atd-pilula-2`),
  `painelAlerta`/`painelOk` (`bg-urgente-bg`/`bg-concluido-bg`), `campo` (preenchido, `rounded-atd-balao`), `primario` (ouro `--acao` + texto escuro),
  `secundario` (preenchido suave), `discreto`, `chip`, `etiqueta` (11px/600 caixa alta). Um bloco novo usa estes, não cria classe própria.
- **Hierarquia por fundo, nunca por contorno ou faixa lateral**: sem `border-*` de cartão, sem `divide-*`, sem `rounded-[2px]`. A caixinha de
  concluir e a bolinha do rádio mantêm contorno de 2 px em `--atd-campo` (indicador de estado: WCAG 1.4.11, >= 3:1). O aviso "Desfazer" é um balão
  `bg-atd-hdr` sem faixa; a gaveta é uma folha arredondada no pé (`rounded-t-atd-flutuante`), sem divisórias. A **única sombra** da aba é a do aviso
  (`shadow-atd-flutuante`), porque ele flutua sobre a rolagem.
- **Erro de contraste que o teste pegou**: texto de dica em `--atd-cinza-terciario` sobre `bg-concluido-bg`/`bg-urgente-bg` (rgba compostos sobre o cartão)
  mede 4,46-4,49:1. Por isso `cx.dica` usa `--atd-cinza-previa`, e o `terciario` só vai sobre cartão, painel ou tela lisos (título de seção, placeholder).
- **Campos sem contorno**: o campo é distinguido por preenchimento (`pilula-2` sobre cartão), não por linha; a borda é o foco visível global. O contraste
  do PREENCHIMENTO contra o cartão é ~1,1:1 (por desenho, como a pílula de busca da lista); o texto e o placeholder passam AA.
- **Filhas de Mais** usam `VoltarParaMais` (44 px) + `TituloDeTela`. A tela Mais mantém o aviso honesto "a construir" (o teste de nota interna o exige).
- Teste novo: `lib/testes/atendimentoAppVisualDetalhes.teste.tsx` (contraste dos pares novos em Dia e Noite, varredura dos arquivos migrados: sem canto de
  2px/contorno/faixa/hex/divisória/`bg-sf*`, sombra só no aviso, alvos de 44 px, estrutura do bloco, do aviso, da gaveta, do índice e da tela Mais).

**Não provado**: fluxo real com login e banco (a aba foi vista em Chromium 390x844 com dados de exemplo numa rota temporária, já removida), aparelho de
verdade (safe area, teclado, PWA instalado), leitor de tela, e o realce do chip do índice durante a rolagem (lógica não mudou; só se viu parado).
