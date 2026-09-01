# Vault de chaves do Lúmen — estrutura para o gerenciador de senhas

**Nenhum valor real de segredo vive neste diretório, de propósito.** Isto é só o mapa: quais
segredos o Lúmen usa, o que cada um faz, e onde está (ou onde gerar) o valor real de cada um.
Os valores em si devem ir só para o gerenciador de senhas do escritório (1Password, Bitwarden
ou equivalente) — nunca para um arquivo neste repositório. Ver Achado F3 do
`docs/security-audit/relatorio-auditoria-seguranca.pdf` para o motivo (senha real commitada no
git fica no histórico para sempre, mesmo apagada depois).

Hoje a fonte-da-verdade de produção é o painel **Vercel → lumen → Settings → Environment
Variables**. Este documento é o índice para achar/rotacionar cada um; os valores continuam
vivendo lá (e, a partir de agora, também no gerenciador de senhas, para consulta sem precisar
abrir a Vercel toda vez).

## Como montar o vault no gerenciador de senhas

1. Crie uma pasta/coleção chamada **"Lúmen"**.
2. Dentro dela, uma subpasta por categoria (lista abaixo).
3. Um item por variável de ambiente — título = o nome exato da variável (ex.:
   `WHATSAPP_APP_SECRET`), campo de senha = o valor real (copiado da Vercel), campo de notas =
   a coluna "Onde obter/rotacionar" da tabela abaixo.
4. `docs/vault-chaves/modelo-importacao.csv` traz essa mesma estrutura em CSV — sem nenhum
   valor real, só título/categoria/notas — para adaptar ao importador do seu gerenciador (o
   formato de CSV varia um pouco entre 1Password e Bitwarden; use o arquivo como referência de
   quais itens criar, mesmo que o import direto precise de ajuste).

---

## Autenticação & sessão do próprio Lúmen

| Variável | Para que serve | Onde obter/rotacionar |
|---|---|---|
| `AUTH_SECRET` | Assina o JWT de sessão (`lib/auth.ts`) | Gerar um valor aleatório longo (ex.: `openssl rand -base64 48`) — nunca reaproveitar de outro projeto |
| `CRON_SECRET` | Autentica as 13 rotas `/api/cron/*` (a Vercel envia como `Authorization: Bearer`) | Gerar aleatório; configurar igual na Vercel |
| `MIGRATION_SECRET` | Protege `/api/admin/migrate-legacy` | Gerar aleatório, usar só durante a migração e depois pode rotacionar |
| `PAINEL_MESTRE_SETUP_SECRET` | Segunda trava (além de `isAdmin`) para `/api/admin/setup-painel-mestre` | Gerar aleatório |
| `BLOG_ROBOT_SECRET` | Autentica o robô de conteúdo jurídico em `/api/blog/draft` | Gerar aleatório |

## Banco de dados

| Variável | Para que serve | Onde obter/rotacionar |
|---|---|---|
| `DATABASE_URL` | Connection string do Postgres (Neon) em produção | Painel da Neon → Connection Details |
| `SOURCE_DATABASE_URL` | Banco de origem para migração legada (`/api/admin/migrate-legacy`) | Só necessária durante migração pontual |

## E-mail (SMTP)

| Variável | Para que serve | Onde obter/rotacionar |
|---|---|---|
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD` | Envio de e-mail (agenda diária, resumo, redefinição de senha, convites) | Painel do provedor de e-mail transacional em uso |

## WhatsApp (Meta Cloud API)

| Variável | Para que serve | Onde obter/rotacionar |
|---|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Verificação inicial do webhook (Meta) | Meta for Developers → App do WhatsApp |
| `WHATSAPP_APP_SECRET` | Assinatura HMAC das requisições do webhook (ver Achado F2 — hoje ausente, corrigir junto) | Meta for Developers → App do WhatsApp → App Secret |

## Notificações push

| Variável | Para que serve | Onde obter/rotacionar |
|---|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push API | Gerar com `node -e "console.log(require('web-push').generateVAPIDKeys())"` |

## BTG Empresas (boletos)

| Variável | Para que serve | Onde obter/rotacionar |
|---|---|---|
| `BTG_CLIENT_ID`, `BTG_CLIENT_SECRET` | OAuth do app registrado no BTG | Portal do desenvolvedor BTG — ver `README_BTG.md` |
| `BTG_ENV` | `sandbox` ou `production` | — |
| `BTG_REDIRECT_URI` | Só se o redirect cadastrado no BTG divergir da URL base do app | Portal do BTG |

## Microsoft (Outlook / Azure AD)

| Variável | Para que serve | Onde obter/rotacionar |
|---|---|---|
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | OAuth do app no Azure AD | Azure Portal — ver `README_MICROSOFT.md` |
| `MICROSOFT_REDIRECT_URI` | Callback OAuth | Azure Portal |

## Google (Drive / Gmail)

| Variável | Para que serve | Onde obter/rotacionar |
|---|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth do app no Google Cloud Console | Google Cloud Console → Credenciais |
| `GOOGLE_REDIRECT_URI` | Callback OAuth | Google Cloud Console |

## Dropbox

| Variável | Para que serve | Onde obter/rotacionar |
|---|---|---|
| `DROPBOX_CLIENT_ID`, `DROPBOX_CLIENT_SECRET` | Armazenamento de anexos | Dropbox App Console — ver `README_MICROSOFT.md` seção 2 |
| `DROPBOX_REDIRECT_URI` | Callback OAuth | Dropbox App Console |

## Asaas (cobrança)

| Variável | Para que serve | Onde obter/rotacionar |
|---|---|---|
| `ASAAS_API_KEY` | Cobrança (Pix, boleto) | Painel Asaas — ver `README_ASAAS.md` |
| `ASAAS_WEBHOOK_TOKEN` | Autentica o webhook de pagamento | Painel Asaas → Configurações → Webhooks |
| `ASAAS_ENV` | `sandbox` ou `production` | — |

## IA

| Variável | Para que serve | Onde obter/rotacionar |
|---|---|---|
| `ANTHROPIC_API_KEY` | Assistente do produto (`/api/assistente`) | console.anthropic.com |

## Legado / migração pontual

| Variável | Para que serve | Onde obter/rotacionar |
|---|---|---|
| `LEGACY_BLOB_READ_WRITE_TOKEN` | Acesso ao Blob Store antigo durante migração | Vercel (projeto legado) |

## Não são segredos (informativas, não precisam ir para o vault)

`APP_URL`, `VERCEL_URL` (a própria Vercel define), `NODE_ENV`, `DJEN_PROXY_URL` — variáveis de
configuração, não credenciais. Ficam só no `.env.example`/Vercel normalmente.

---

## Regra de ouro

Se um dia alguém for colar um valor real de segredo em algum lugar — um arquivo, um chat, um
commit — pare e pergunte: "isso vai para o gerenciador de senhas, ou vai para o git?". Só a
primeira resposta é aceitável. O Achado F3 da auditoria é exatamente o que acontece quando essa
pergunta não é feita.
