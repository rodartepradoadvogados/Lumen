# Contexto completo do projeto rp-financeiro — para retomar em um novo ambiente

Documento gerado em 2026-07-20 para transferir conhecimento acumulado de uma sessão local do Claude Code para um novo projeto (nuvem). Cole este arquivo inteiro como mensagem inicial do novo projeto, ou aponte o assistente pra ele (`docs/CONTEXTO-COMPLETO-PROJETO.md`).

## ⚠️ Aviso sobre credenciais — leia antes de tudo

Este documento **não contém valores brutos de senhas, tokens ou strings de conexão** — só os **nomes** das variáveis e **onde elas já estão configuradas** (Vercel, Railway). Isso é proposital, não omissão por acidente:

- Os segredos reais já estão salvos com segurança nos painéis da Vercel e da Railway. Duplicá-los em mais um arquivo de texto só aumenta o risco de vazamento sem necessidade — quem for continuar o projeto acessa os mesmos painéis (Vercel/GitHub/Railway, mesmas contas) e os segredos já estão lá, funcionando.
- Um token do WhatsApp já foi colado nesta conversa em texto puro (durante a configuração da Meta) — está marcado abaixo para ser **regenerado** por precaução, já que apareceu em uma conversa de chat.
- Se o novo ambiente realmente precisar dos valores (ex.: rodar o app localmente), busque-os direto no painel de cada serviço (veja seção "Onde estão os segredos" abaixo) ou rode `vercel env pull` / `railway variables`.
- A única credencial de baixo risco incluída abaixo é o **login interno de teste do próprio sistema** (não é senha de nenhum serviço externo) — inclusa porque é necessária para qualquer sessão futura testar o site pelo navegador.

Tudo o resto — arquitetura, decisões, estratégia, o que já foi feito, o que falta, armadilhas conhecidas — está completo e sem cortes abaixo.

---

## 1. Quem é o cliente / contexto do negócio

**Escritório:** Rodarte Prado Advogados (Goiânia/GO).

**Sócios:**
- Jairo Alexandre Rodarte e Silva — OAB/GO 78.295 — e-mail `jairo@rodarteprado.com.br` — login no sistema: `JairoRodarte`
- Rodrigo Araújo do Prado — OAB/GO 32.943 — e-mail `rodrigo@rodarteprado.com.br` — login no sistema: `RodrigoPrado`

**Login de teste do sistema (uso interno, baixo risco):** usuário `JairoRodarte`, senha `Goiabada1#`. Considere trocar após a fase de testes intensivos.

**E-mails Gmail envolvidos** (ver seção 6 sobre por que existem vários):
- `jairodarte@gmail.com` — recebe os e-mails do Jusbrasil de Jairo (fonte real das publicações)
- `pradoadvogado@gmail.com` — e-mail do Jusbrasil de Rodrigo
- `rodartepradoadvogados@gmail.com` — conta "oficial" do escritório, hoje é a conectada como conta principal do Google Drive (documentos/anexos)

**O que o usuário quer, em uma frase:** um sistema interno único de gestão do escritório (processos, financeiro, agenda, contatos) com o menor custo possível, que capture publicações/andamentos processuais automaticamente pelo menos 2x/dia, e uma central de atendimento via WhatsApp integrada ao CRM.

## 2. Stack técnica

- **Framework:** Next.js 14 (App Router) + TypeScript
- **ORM/Banco:** Prisma 5.22.0 (⚠️ **não atualizar para v7** — decisão deliberada, mesmo com o CLI sugerindo a atualização a cada comando) + PostgreSQL hospedado na **Neon**
- **Deploy do site:** Vercel (produção: `https://rp-financeiro-xi.vercel.app`)
- **Repositório:** GitHub, `github.com/rodartepradoadvogados/rp-financeiro` (privado)
- **Robô Python separado** (captura DJEN/Datajud): pasta `robo-publicacoes/` dentro do MESMO repositório, mas deploy **separado** na **Railway** (projeto `rp-financeiro-robo-publicacoes`), compartilhando o MESMO banco Postgres do site
- **E-mail/Drive:** Google OAuth (Gmail API + Drive API), multi-conta (ver seção 6)
- **WhatsApp:** API oficial da Meta (Cloud API), NÃO Twilio (decisão deliberada — ver seção 8)

## 3. Estrutura do repositório (visão rápida)

```
rp-financeiro/
├── app/                      # Next.js App Router
│   ├── (app)/                # páginas autenticadas (dashboard, processos, financeiro, etc.)
│   └── api/                  # rotas de API (webhooks, cron, google oauth)
├── components/               # componentes React reutilizáveis
├── lib/                      # lógica de negócio, integrações, actions
│   ├── actions/               # Server Actions do Next.js
│   ├── googleDrive.ts         # OAuth Google multi-conta (Drive + Gmail)
│   ├── jusbrasilEmailSync.ts  # sincronização de publicações via e-mail do Jusbrasil
│   ├── djenSync.ts            # teste de conexão com DJEN/CNJ (OABs dinâmicas)
│   └── whatsapp.ts            # webhook oficial do WhatsApp (Meta Cloud API)
├── prisma/
│   └── schema.prisma          # schema completo do banco (ver seção 5)
├── robo-publicacoes/          # robô Python standalone (DJEN + Datajud), deploy na Railway
│   ├── src/                   # pipeline.py, djen.py, datajud.py, db.py, etc.
│   ├── tests/                 # 29 testes (pytest), todos passando
│   └── railway.json           # config de deploy + cron da Railway
└── docs/                     # este arquivo, e diagnostico-reforma-2026-07-10.md
```

## 4. O que já está construído (módulos completos)

- **Dashboard** (painel do dia, alertas, resumo financeiro/processual)
- **Processos e Casos** (cards, busca, filtros, conversão Atendimento→Caso→Processo Judicial)
- **Agenda/Kanban** (múltiplas visões: Mês/Semana/Lista, prazos, audiências com local presencial/online opcional)
- **Financeiro completo:**
  - Contas a Pagar/Receber com parcelamento/recorrência (gera lembrete automático na Agenda)
  - Modalidade de pagamento obrigatória ao dar baixa (débito/crédito/PIX/transferência/boleto/outros)
  - Fornecedores com `EntityPicker` (seletor azul, busca dinâmica, cadastro rápido inline) — mesmo padrão usado em Categoria/Centro de Custo/Cliente/Processo
  - Baixa em bloco com prévia de total, nº de comprovante
  - DRE, Fluxo de Caixa, Livro Caixa, exportação .xlsx
  - Honorários: parte agora + parte no êxito
- **Contatos** (Clientes, Advogados parceiros/adversos, Fornecedores)
- **Publicações e Andamentos:**
  - Sincronização automática via e-mail do Jusbrasil (Gmail API, multi-conta — ver seção 6)
  - Vínculo automático a processo por número (lógica em `jusbrasilEmailSync.ts`, ainda informal, não é uma função única validada)
  - Fila de triagem (RIDT): responsável, status Pendente/Em análise/Tratada, botão "Distribuir pendentes"
  - Badge de atividades vinculadas, marcar como lida remove da lista
- **Atendimento** (funil comercial, conversão em caso, anexos, WhatsApp embutido — ver seção 8)
- **Central de Alertas**, **Mural de Recados**
- **Configurações:**
  - Equipe & Acesso (papéis, OAB de cada advogado, controle de acesso ao Financeiro desacoplado de ser sócio)
  - Produtividade (TaskScore — pontos por tarefa concluída)
  - Workflows (cadeias padronizadas de tarefas)
  - Modelos & Integrações (Google, DJEN, modelos de documento)
- **Geração de documentos** (contratos, procurações, declarações) via Google Docs, com placeholders `{{CHAVE}}`
- **App Mobile (PWA)** em `/m` — instalável na tela inicial, shell reduzido
- **Importação de planilhas** (contatos, processos, agenda) via .xlsx

## 5. Schema do banco — pontos de atenção

- `User.oab` — texto livre (ex.: `"OAB/GO 78.295"`), usado dinamicamente pelo robô DJEN para saber quais OABs monitorar (parser em `lib/djenSync.ts`, função `parseOab` — usa lista de UFs válidas, não "quaisquer 2 letras", porque "OAB" começa com "OA" e confundia o parser antes)
- `GoogleCredential` — agora suporta **múltiplas contas** (campo `userId` opcional, `isPrimaryDrive` boolean, `syncJusbrasil` boolean). Uma conta é a "principal" (Drive/documentos, só uma), outras podem ser só-Jusbrasil, vinculadas a um usuário específico.
- **⚠️ ARMADILHA CRÍTICA:** o robô Python (`robo-publicacoes/`) usa o MESMO banco Postgres, mas com suas próprias tabelas via SQLAlchemy (`publicacoes`, `andamentos`, `processos_monitorados`, `execucao_log`). Isso **já causou perda de dados uma vez** (2026-07-20): rodar `prisma db push` sem essas tabelas descritas no `schema.prisma` faz o Prisma tratá-las como "órfãs" e **apagá-las**. Correção aplicada: modelos `RoboPublicacao`, `RoboAndamento`, `RoboProcessoMonitorado`, `RoboExecucaoLog` foram adicionados ao `schema.prisma` (com `@@map`/`@map` espelhando exatamente as colunas do SQLAlchemy) só para o Prisma "enxergar" essas tabelas e nunca mais apagá-las. **Se o robô Python mudar sua estrutura de tabelas (`robo-publicacoes/src/db.py`), replicar a mudança nesses 4 modelos também.**
- Padrão recorrente de bug (já aconteceu 3x): quando um schema novo é mergeado no GitHub, a Vercel faz deploy automático do código ANTES de alguém rodar `prisma db push` no banco real — quebra produção com `PrismaClientKnownRequestError P2022 (coluna não existe)`. **Sempre que o usuário reportar "erro no site", checar `get_runtime_errors` da Vercel primeiro; se for P2022, rodar localmente `npx prisma generate && npx prisma db push --accept-data-loss` (o `.env` local já aponta pro mesmo Postgres de produção) e dar push do código pendente.**

## 6. Jusbrasil — arquitetura multi-conta (refeita em 2026-07-20)

**Causa raiz de "publicações paradas por 11 dias" (encontrada em 2026-07-20):** a conexão Google usada pela sincronização (`GoogleCredential` única na época) tinha sido reconectada com a conta `rodartepradoadvogados@gmail.com`, mas o Jusbrasil sempre manda os e-mails para `jairodarte@gmail.com`. A sincronização rodava sem erro nenhum (HTTP 200 a cada 3h) só que sempre encontrando 0 e-mails — silenciosamente errado, sem alerta.

**Correção estrutural aplicada:**
1. `GoogleCredential` agora suporta múltiplas contas, cada uma opcionalmente vinculada a um `userId`.
2. `lib/jusbrasilEmailSync.ts` — `getGmailClients()` retorna TODAS as contas com `syncJusbrasil=true` e varre cada uma (antes só pegava a primeira/única).
3. Nova tela em Configurações → Geral: **"Minha sincronização do Jusbrasil"** — visível a QUALQUER usuário ativo (não só admin), permite conectar o próprio e-mail (`/api/google/connect?mode=jusbrasil`), automaticamente vinculado ao usuário logado. Isso permite que novos advogados que entrarem no futuro conectem seu próprio e-mail sem precisar de admin.
4. Tela em Configurações → Modelos & Integrações (admin): checklist mostrando os 3 e-mails-alvo e se já estão conectados: `rodartepradoadvogados@gmail.com`, `jairodarte@gmail.com`, `pradoadvogado@gmail.com`.
5. **Aviso automático na UI** se a conta "principal" (Drive) não for a esperada — evita que o mesmo silêncio de 11 dias aconteça de novo.

**Estado em 2026-07-20 (fim da sessão):** só `rodartepradoadvogados@gmail.com` está conectada (é a principal do Drive). `jairodarte@gmail.com` e `pradoadvogado@gmail.com` ainda precisam ser conectados manualmente — **login do Google exige clique humano interativo, a IA não pode fazer isso sozinha** (proibido inserir senha/login por conta de terceiro). Cada sócio precisa entrar no sistema logado como ele mesmo e clicar em "Conectar meu e-mail" em Configurações → Geral.

**Jusbrasil tem API oficial, mas não é gratuita** — pesquisado em 2026-07-20: existe em `api.jusbrasil.com.br/docs`, mas exige contato comercial (sem preço público). Decisão: manter a sincronização por e-mail (gratuita), não vale o custo/negociação.

## 7. DJEN e Datajud (CNJ) — robô Python na Railway

**DJEN (Diário de Justiça Eletrônico Nacional)** — fonte oficial e gratuita de intimações/publicações por OAB.
**Datajud** — API oficial e gratuita de andamentos processuais por número de processo.

**Status DJEN: BLOQUEADO por IP de datacenter (HTTP 403).** Testado a partir de dois provedores diferentes (Vercel e Railway) — ambos bloqueados. É um bloqueio conhecido de WAF/anti-bot do CNJ contra IPs de nuvem em geral, não é específico de uma plataforma. O robô já trata isso graciosamente (não trava, só loga aviso e tenta de novo no próximo ciclo, alerta por e-mail após 2 falhas seguidas).

**Plano para resolver o DJEN (ainda não executado):** contratar um proxy residencial barato (ex.: Webshare, IPRoyal, ~R$25-50/mês), adicionar suporte a proxy no `robo-publicacoes/src/http_client.py` (hoje não existe), configurar as credenciais na Railway. Enquanto isso não acontece, **o Jusbrasil por e-mail continua sendo a única fonte real de publicações** — não desligar o Jusbrasil até o DJEN funcionar.

**Status Datajud: FUNCIONANDO E VALIDADO.** Testado com processo real (`5008788-14.2023.8.21.0013`, TJRS): **126 andamentos capturados** com sucesso, incluindo "Publicação" e "Disponibilização no Diário Eletrônico". A chave de API é **pública** (a mesma para qualquer desenvolvedor, publicada em `datajud-wiki.cnj.jus.br/api-publica/`), já configurada na Railway.

**Bugs de mapeamento de tribunal corrigidos em 2026-07-20** (função `alias_do_tribunal()` em `robo-publicacoes/src/datajud.py`), validados contra lista oficial de endpoints fornecida pelo usuário:
- TRE (eleitoral) usa hífen: `tre-go`, não `trego` (bug real, já corrigido)
- Distrito Federal usa sufixo "dft": `tjdft`/`tre-dft`, não `tjdf`/`tre-df` (bug real, já corrigido)
- Adicionado STM (J=7, Justiça Militar da União), que não tinha mapeamento nenhum antes
- 29/29 testes passando (3 novos cobrindo essas correções)

**OABs monitoradas: agora dinâmicas.** Antes era uma lista fixa no código (`DJEN_OAB_TARGETS`); agora vem de `prisma.user.findMany({ active: true, oab: { not: null } })` — qualquer usuário ativo com OAB cadastrada em Equipe & Acesso é automaticamente monitorado. Função `getDjenTargets()` em `lib/djenSync.ts`.

**Deploy do robô na Railway:**
- Projeto: `rp-financeiro-robo-publicacoes`
- Deploy feito via `railway up` direto da pasta `robo-publicacoes/` (upload manual, **NÃO conectado ao GitHub** — mudanças futuras no código dessa pasta exigem rodar `railway up` de novo manualmente; não há auto-deploy no push)
- Cron configurado direto no `railway.json` (campo `deploy.cronSchedule`, descoberta útil: não precisa do dashboard nem de SDK extra): `0 8-18/2 * * 1-5` (a cada 2h, dias úteis, horário comercial)
- Variáveis já configuradas: `DATABASE_URL` (mesmo Postgres do site), `EMAIL_TO`, `SMTP_HOST/PORT/USER/PASSWORD` (mesmo Gmail já usado no e-mail diário do site), `DATAJUD_API_KEY`, `LOG_LEVEL`
- `GEMINI_API_KEY` (resumo opcional via IA) — não configurada ainda, opcional, pode usar o crédito de R$150 do Google Cloud do usuário

## 8. WhatsApp — pausado, decisão pendente do usuário

**Já construído (por outra sessão/PR paralela, PR #10):** webhook oficial da API Cloud da Meta em `app/api/whatsapp/route.ts` + `lib/whatsapp.ts`. Fica "dormente" (não ingere nada) até 4 variáveis de ambiente existirem: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`. Mensagens recebidas criam/reusam um `Attendance` (atendimento) por número de telefone — o CRM já existente é reaproveitado como "conversas", sem precisar de tabela nova.

**Decisão já tomada:** usar a API oficial da Meta, não Twilio (Twilio cobra por mensagem sem necessidade, e o caminho direto já tinha código pronto).

**App na Meta:** "Rodarte Prado Whats", ID `238039725279327`, Portfólio "Rodarte Prado Advogados".

**Webhook configurado:** URL `https://rp-financeiro-xi.vercel.app/api/whatsapp`, verify token `rpfin-whats-2026` (arbitrário, combinado entre a Meta e o site).

**Estado das 4 variáveis na Vercel:** `WHATSAPP_VERIFY_TOKEN` ✅ salvo. `WHATSAPP_ACCESS_TOKEN` ✅ salvo — **mas foi colado em texto puro nesta conversa de chat em algum momento; recomendado regenerar por precaução** (Usuários do Sistema → gerar novo token no Gerenciador de Negócios da Meta) e substituir. `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_APP_SECRET` ⏳ pendentes.

**Onde travou:** o número que o usuário quer usar (`+55 62 98128-3481`) já tem histórico e uso ativo no WhatsApp Business App do celular. Duas tentativas de registrar esse número direto no painel de desenvolvedor da Meta falharam com "Falha ao verificar a qualificação do número" — isso acontece porque o painel de desenvolvedor faz uma **migração completa** (tira o número do app do celular), e não é isso que o usuário quer (ele quer manter o app do celular funcionando E o site ao mesmo tempo — "coexistência").

**Decisão pendente do usuário:** (a) pegar um chip/número novo dedicado, sem histórico no WhatsApp (mais simples, caminho já validado sem erro), ou (b) investigar mais a fundo o fluxo oficial de "coexistência" da Meta (não confirmado exatamente onde fica no app do celular — checado "Ferramentas comerciais" no WhatsApp Business App e não apareceu a opção esperada).

**Se retomar:** perguntar ao usuário qual caminho ele escolheu antes de continuar.

## 9. Onde estão os segredos (nomes de variável, não valores)

| Variável | Onde está configurada | Usada por |
|---|---|---|
| `DATABASE_URL` | Vercel + Railway (mesmo valor nos dois — Neon Postgres) | Site (Prisma) + robô Python |
| `AUTH_SECRET` | Vercel | Sessão de login do site |
| `CRON_SECRET` | Vercel | Autenticação dos crons internos |
| `EMAIL_HOST/PORT/USER/PASSWORD` | Vercel + Railway | E-mail diário da agenda (site) + notificações do robô |
| `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | Vercel | OAuth Google (Drive + Gmail, multi-conta) |
| `WHATSAPP_ACCESS_TOKEN/PHONE_NUMBER_ID/VERIFY_TOKEN/APP_SECRET` | Vercel | Webhook do WhatsApp — **token de acesso deve ser regenerado** (ver seção 8) |
| `DATAJUD_API_KEY` | Railway | Robô Python (chave pública do Datajud, sem custo) |
| `GEMINI_API_KEY` | Não configurada ainda (opcional) | Robô Python (resumo via IA) |

Para acessar: `vercel env ls` / dashboard da Vercel (Settings → Environment Variables do projeto rp-financeiro); `railway variable list --service rp-financeiro-robo-publicacoes` / dashboard da Railway.

## 10. Como o usuário gosta de trabalhar (preferências observadas)

- Prefere que eu **investigue e resolva sozinho** sempre que possível, sem perguntar demais no meio do caminho — mas pede confirmação em decisões de custo ou de risco real (ex.: qual caminho do WhatsApp escolher).
- Gosta de explicações **muito diretas e didáticas**, passo a passo, com links exatos e "onde clicar", principalmente para telas de painéis externos (Meta, Google, Railway) que ele mesmo precisa clicar.
- Pediu explicitamente, ao final de toda sessão de trabalho no projeto: enviar o link do site publicado (Vercel) e o link do repositório/host usado (GitHub/Railway).
- Prioriza **menor custo possível** em todas as decisões de infraestrutura — por isso Postgres/Prisma reaproveitado em vez de Supabase, API oficial da Meta em vez de Twilio, chaves públicas/gratuitas do Datajud/CNJ.
- Já deu autorização ampla, em uma sessão anterior, para fazer mudanças de UX sem aprovação prévia individual, contanto que exista um ponto de restauração (tag/branch de backup) — esse padrão pode se aplicar a decisões futuras semelhantes, mas confirme se ainda vale antes de presumir.

## 11. Roadmap / próximos passos (em ordem de prioridade)

1. **Jusbrasil:** Jairo e Rodrigo (e futuros advogados) precisam clicar em "Conectar meu e-mail" em Configurações → Geral, cada um logado como si mesmo.
2. **WhatsApp:** decidir chip novo vs. investigar coexistência mais a fundo; depois completar as 4 variáveis, testar mensagem real, regenerar o token exposto.
3. **DJEN:** contratar proxy residencial, adicionar suporte a proxy no robô, testar.
4. **Ponte robô → site:** ler as tabelas do robô Python (`RoboPublicacao`/`RoboAndamento`) e gravar/vincular em `Publication`/`Case` do Prisma por número de processo normalizado. Construir uma função única `normalizarNumeroProcesso()` (valida formato CNJ completo `NNNNNNN-DD.AAAA.J.TR.OOOO`, gera chave só-dígitos para comparação) — hoje a lógica de vínculo por processo está duplicada e informal em `jusbrasilEmailSync.ts`.
5. **E-mail dentro da Central de Atendimento:** usar o mesmo OAuth do Google (precisa somar o escopo `gmail.send` para responder, hoje só tem `gmail.readonly`) para detectar e-mails novos e permitir responder pela tela do site.
6. **CRM/Casos:** botão "Transformar em caso" a partir de um Atendimento/conversa; chamada à API da Anthropic para sugerir área do direito + resumo + próximos passos (sempre sinalizando jurisprudência como "não validada" até checagem manual, nunca afirmando tese jurídica sem fundamentação — protocolo do escritório).

## 12. Links

- Site em produção: https://rp-financeiro-xi.vercel.app
- Repositório: https://github.com/rodartepradoadvogados/rp-financeiro
- Projeto Railway do robô: `rp-financeiro-robo-publicacoes` (id `8abe7add-585c-468f-82bf-de8bc9266297`)
