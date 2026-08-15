---
tipo: catalogo-configuracoes
---

# Configurações do sistema — só nomes, nunca valores

Lista de toda variável de ambiente que o Lúmen usa, e pra que serve. **Os valores reais (senhas,
chaves de API, tokens) ficam SÓ no painel da Vercel — nunca devem ser copiados pra cá, pra
nenhuma nota, nem pra nenhum lugar que sincronize online.** Se um dia precisar do valor de
alguma, consulte direto em vercel.com → o projeto do Lúmen → Settings → Environment Variables.

## Banco de dados
- `DATABASE_URL` — conexão com o Postgres (Neon).

## Autenticação e sessão
- `AUTH_SECRET` — assina o cookie de sessão de login.
- `MIGRATION_SECRET` — trava a rota de migração de dados legados.
- `PAINEL_MESTRE_SETUP_SECRET` — trava o setup inicial do Painel Mestre.
- `BLOG_ROBOT_SECRET` — autentica o robô de conteúdo jurídico ao publicar rascunho de matéria.
- `CRON_SECRET` — autentica as chamadas automáticas (crons) da Vercel.

## Armazenamento de documentos
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` — conexão com Google Drive/Docs/Gmail.
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI` — conexão com OneDrive/Outlook.
- `DROPBOX_CLIENT_ID`, `DROPBOX_CLIENT_SECRET`, `DROPBOX_REDIRECT_URI` — conexão com Dropbox.
- `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY`, `LEGACY_BLOB_READ_WRITE_TOKEN` — armazenamento de arquivo temporário da própria Vercel.

## Cobrança (Painel Mestre → assinaturas dos escritórios-clientes)
- `ASAAS_API_KEY`, `ASAAS_ENV`, `ASAAS_WEBHOOK_TOKEN` — integração Asaas (Pix/boleto).
- `BTG_CLIENT_ID`, `BTG_CLIENT_SECRET`, `BTG_ENV` — integração BTG (boleto, caminho antigo).

## E-mail e WhatsApp
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD` — envio de e-mail transacional (convites, faturas, notificações).
- `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` — webhook de mensagens do WhatsApp Business.

## Notificações do app (PWA)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — notificação push do navegador/app instalado.

## Robô de publicações
- `DJEN_PROXY_URL` — proxy usado pelo robô Python que captura publicações do DJEN/Datajud.

## Diversos
- `APP_URL`, `NEXT_PUBLIC_APP_URL` — URL pública do site, usada em links de e-mail/convite.
- `ANTHROPIC_API_KEY` — assistente Claude embutido no site.

## Só para uso pontual/manual (scripts, nunca em produção)
- `SOURCE_DATABASE_URL`, `TARGET_OFFICE_NAME`, `TARGET_OFFICE_SLUG` — scripts avulsos de migração/importação de dados de um escritório específico.
- `OBSIDIAN_OFFICE_ID`, `OBSIDIAN_VAULT_DIR` — usados só por `scripts/exportar-obsidian.ts` (ver `docs/obsidian/SETUP.md`), nunca em produção.
