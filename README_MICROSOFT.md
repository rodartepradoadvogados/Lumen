# Integração com Outlook (Microsoft) — o que falta pra funcionar

Fase 1 do pedido de sincronização com OneDrive/Outlook/Dropbox: **e-mail** (recebimento de
publicações + envio no Atendimento), usando Outlook como alternativa ao Google, por pessoa.
O código (`lib/microsoftGraph.ts`, `lib/outlookEmailSync.ts`, `/api/microsoft/connect`,
`/api/microsoft/callback`) já está pronto e no ar, mas fica **dormente** até você registrar um
app no Azure AD (Microsoft Entra) — isso eu não consigo fazer por vocês, precisa de uma conta
Microsoft com permissão de administrador do tenant (ou uma conta pessoal Microsoft, se for
usar contas @outlook.com/@hotmail.com em vez de um Microsoft 365 de empresa).

## 1. Registrar o app no Azure AD

1. Acesse https://portal.azure.com/ → **Microsoft Entra ID** → **Registros de aplicativo** →
   **Novo registro**.
2. Nome: "Lúmen". Tipos de conta com suporte: **Contas em qualquer diretório organizacional e
   contas pessoais da Microsoft** (pra aceitar tanto @suaempresa.com quanto @outlook.com).
3. Redirect URI (tipo **Web**):
   ```
   https://lumen-flax-chi.vercel.app/api/microsoft/callback
   ```
4. Depois de criado, anote o **Application (client) ID**.
5. Vá em **Certificados e segredos** → **Novo segredo do cliente** → anote o **Value** (só
   aparece uma vez).
6. Vá em **Permissões de API** → adicione (Microsoft Graph, delegadas): `Mail.Read`,
   `Mail.Send`, `offline_access`, `User.Read`.
7. Me envie o **Client ID** e o **Client Secret** por um canal seguro (não aqui no chat) que eu
   cadastro na Vercel como `MICROSOFT_CLIENT_ID` e `MICROSOFT_CLIENT_SECRET`.

## 2. Conectar

Depois de cadastradas as credenciais, cada pessoa conecta a própria conta Outlook em
**Configurações → Modelos & Integrações → Outlook (Microsoft)**. Publicações passam a ser
buscadas na caixa de entrada Outlook dela junto com o Gmail (mesmo botão "Sincronizar
publicações e andamentos processuais"), e o Atendimento manda e-mail pelo Outlook quando a
pessoa não tiver Gmail conectado.

## O que ainda falta (próximas fases)

- **OneDrive** como opção de armazenamento (anexos de Processos/Atendimentos/Assessoria) —
  hoje só Google Drive. Vai exigir cada escritório escolher o provedor (Google Drive, OneDrive
  ou Dropbox) e recriar a lógica de pasta-por-processo para o OneDrive.
- **Dropbox** — nem a conexão OAuth começou ainda; é um provedor separado (não faz parte do
  Microsoft Graph), então entra como uma integração à parte.
- **Calendário** — sincronizar a Agenda do sistema com Google Calendar e com o calendário do
  Outlook (a caixa de e-mail conectada aqui ainda não dá acesso a calendário — precisaria do
  escopo `Calendars.ReadWrite` a mais). Outros calendários (ex.: Apple/iCloud) ficam pra quando
  houver um pedido concreto por eles.
