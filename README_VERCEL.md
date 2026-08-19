# Deploy na Vercel — guia completo

O projeto já está pronto para rodar na Vercel: `vercel.json` cadastra os 12 crons, e o script de
build (`package.json` → `"build"`) já roda `prisma generate && next build` e, em produção
(`$VERCEL_ENV = production`), também `npx prisma db push` sozinho, dentro do próprio build —
**antes** do deploy virar tráfego ao vivo. Ou seja: mergear em `main` e deixar a Vercel buildar
já é suficiente para o schema do banco ficar sincronizado, sem passo manual. Este guia cobre o
que só você consegue fazer (criar o projeto, cadastrar as variáveis de ambiente, escolher o
plano) e os detalhes que não são óbvios de fora do código.

## 1. Banco de dados primeiro

Este projeto não tem `prisma/migrations` versionado — usa `prisma db push` puro. Isso simplifica
o deploy (não precisa reconciliar histórico de migração), mas **exige um banco Postgres já
existente antes do primeiro build**, porque o próprio build tenta aplicar o schema nele.

1. Crie um banco Postgres (Neon é o que o projeto já pressupõe — `DATABASE_URL` no formato
   `postgresql://user:password@host/dbname?sslmode=require` — mas qualquer Postgres serve,
   contanto que aceite a mesma connection string).
2. Não é necessário rodar `prisma db push` manualmente antes do primeiro deploy: o build de
   produção faz isso sozinho. Só rode local (`npx prisma db push`) se quiser aplicar uma mudança
   de schema *antes* de mergear, ou para investigar problemas direto no banco.
3. Uma única connection string basta — o schema não declara `directUrl`/shadow database, então
   não há necessidade de uma URL "pooled" separada de uma "direta" como em outros setups Prisma.

## 2. Criar o projeto na Vercel

1. **Add New → Project** → importe `rodartepradoadvogados/lumen` do GitHub.
2. Framework é detectado automaticamente como Next.js — não precisa mexer em build command/output
   directory (`prisma generate && next build && ...` já vem do `package.json`).
3. Antes do primeiro deploy, cadastre pelo menos `DATABASE_URL` e `AUTH_SECRET` (seção 3) —
   sem eles o build de produção falha ou a aplicação sobe sem autenticação segura.

## 3. Variáveis de ambiente

### Obrigatórias — sem elas o app não sobe ou fica inseguro em produção

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Postgres — schema inteiro depende dela (ver seção 1). |
| `AUTH_SECRET` | Assina o cookie de sessão (`lib/auth.ts`, JWT HS256). Sem ela, o app **recusa subir em produção** (`throw` explícito) — em dev cai num segredo fixo inseguro, mas isso é bloqueado fora de `NODE_ENV=production`. Gere um valor aleatório forte, ex.: `openssl rand -base64 32`. |
| `CRON_SECRET` | Autoriza as 12 rotas de cron (`app/api/cron/*`) — cada uma exige `Authorization: Bearer <CRON_SECRET>` e recusa (401) sem o header correto, **inclusive quando a variável está ausente** (fail-closed). A Vercel manda esse header sozinha nos disparos agendados; sem isso definido, todo cron fica inacessível — seguro, mas silencioso, então não esqueça. |

### Opcionais — cada integração fica dormente (sem erro, sem crash) enquanto sua variável não estiver definida

| Grupo | Variáveis | Guia detalhado |
|---|---|---|
| Google (Drive do escritório + captura de publicações por Gmail) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Console do Google Cloud — OAuth consent screen + credenciais OAuth 2.0. `GOOGLE_REDIRECT_URI` deve apontar para `https://<seu-domínio>/api/google/callback`. |
| Microsoft (OneDrive, Outlook) | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI` | `README_MICROSOFT.md` — passo a passo de registro no Azure AD. |
| Dropbox (armazenamento de anexos) | `DROPBOX_CLIENT_ID`, `DROPBOX_CLIENT_SECRET`, `DROPBOX_REDIRECT_URI` | `README_MICROSOFT.md` (seção 2) — registro no Dropbox App Console. |
| Asaas (Pix/boleto) | `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_ENV` | `README_ASAAS.md`. |
| BTG Empresas (boletos do Painel Mestre) | `BTG_CLIENT_ID`, `BTG_CLIENT_SECRET`, `BTG_ENV`, `BTG_REDIRECT_URI` (opcional) | `README_BTG.md`. |
| SMTP (e-mails: agenda diária, resumo, redefinição de senha, convites, faturas) | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD` | Sem elas, a redefinição de senha ainda tem uma cascata (Google → Microsoft → link manual, ver `.env.example`); os demais e-mails ficam sem esse canal. |
| WhatsApp (Cloud API da Meta) | `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | App/webhook são únicos pra plataforma toda; `phoneNumberId`/`accessToken` são por escritório e ficam no banco (`WhatsappConfig`), não aqui. |
| Notificações push (Web Push) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Gerar com `node -e "console.log(require('web-push').generateVAPIDKeys())"`. |
| Assistente com IA (`/api/assistente`) | `ANTHROPIC_API_KEY` | Sem ela, a rota responde que o recurso não está configurado. |
| Blog jurídico (robô de conteúdo externo) | `BLOG_ROBOT_SECRET` | Autoriza `POST /api/blog/draft`. |
| Migração/setup administrativos únicos | `MIGRATION_SECRET`, `PAINEL_MESTRE_SETUP_SECRET` | Protegem rotas administrativas de uso pontual (`/api/admin/migrate-legacy`, `/api/admin/setup-painel-mestre`) — só precisam existir no momento em que essas rotas forem usadas. |
| URL pública do deploy | `APP_URL` | Ver seção 5 — geralmente não precisa ser definida manualmente (a Vercel injeta `VERCEL_URL` sozinha), mas fica explícita aqui porque é a variável de maior prioridade na cadeia. |

Cadastre todas em **Project Settings → Environment Variables**, marcando Production (e
Preview/Development conforme quiser testar com credenciais de sandbox nesses ambientes).

## 4. Plano da Vercel: crons exigem Pro

O projeto define **12 crons** em `vercel.json`, vários com frequência menor que 1x por dia
(a cada 3h, a cada 15min). O plano **Hobby** da Vercel limita cron jobs a no máximo 2 por
projeto e apenas 1 disparo por dia cada — incompatível com esse `vercel.json` como está. É
necessário o plano **Pro** (ou superior) para que todos os 12 crons rodem nas frequências
configuradas. Sem isso, a Vercel recusa o deploy dos crons excedentes ou os força para
frequência diária, silenciosamente quebrando o robô de captura de publicações
(`robo-bridge`, a cada 3h) e o de expiração de acessos (`expirar-acessos`, a cada 15min).

## 5. Domínio customizado e `APP_URL`

`getAppUrl()` (`lib/appUrl.ts`) resolve a URL pública nesta ordem: `APP_URL` (se definida) →
`VERCEL_URL` (injetada automaticamente pela Vercel em cada deploy, sem protocolo) →
`http://localhost:3000` (dev). Essa URL alimenta e-mails (link de redefinição de senha,
convite), `robots.txt`/`sitemap.xml` e qualquer `redirect_uri` de OAuth montado em runtime.

- Se você **não** configurar domínio customizado, o app funciona normalmente no domínio
  `*.vercel.app` gerado — não precisa definir `APP_URL`.
- Se você configurar um domínio customizado (ex.: `app.seudominio.com.br`), defina `APP_URL`
  com esse domínio (`https://app.seudominio.com.br`, sem barra final) — senão `VERCEL_URL`
  continuaria apontando para o domínio `.vercel.app` interno em vez do domínio público real.
- Depois de decidir o domínio final, atualize os `redirect_uri` cadastrados nos portais externos
  (Google Cloud Console, Azure AD, Dropbox App Console, BTG) para apontarem para esse domínio —
  eles são fixos nesses portais, não são descobertos automaticamente.

## 6. Checklist pós-deploy

- [ ] Primeiro build passou (confirma `prisma db push` aplicado — checar logs de build na Vercel).
- [ ] Login funciona (confirma `AUTH_SECRET` cadastrada e válida).
- [ ] Um cron disparou com sucesso (confirma `CRON_SECRET` cadastrada — checar aba **Cron Jobs**
      do projeto na Vercel ou os logs de `app/api/cron/*`).
- [ ] Para cada integração que você pretende usar (Google/Microsoft/Dropbox/Asaas/BTG/WhatsApp):
      variáveis cadastradas **e** `redirect_uri`/webhook atualizado no portal externo com o
      domínio de produção real.
- [ ] Se usar domínio customizado: `APP_URL` definida (seção 5).
