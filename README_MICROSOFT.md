# Integração com Outlook/OneDrive (Microsoft) e Dropbox — o que falta pra funcionar

Fase 1 do pedido de sincronização com OneDrive/Outlook/Dropbox (**e-mail**: recebimento de
publicações + envio no Atendimento) já está pronta e no ar, mas fica **dormente** até você
registrar os apps — isso eu não consigo fazer por vocês, precisa login de administrador em
cada portal. São **dois registros separados** (Microsoft e Dropbox são plataformas diferentes).

## 1. Microsoft (Outlook + OneDrive) — Azure AD

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
   aparece uma vez — se perder, gera outro).
6. Vá em **Permissões de API** → **Adicionar uma permissão** → **Microsoft Graph** →
   **Permissões delegadas** → adicione estas 5: `Mail.Read`, `Mail.Send`, `Files.ReadWrite`,
   `offline_access`, `User.Read`. (`Files.ReadWrite` já é pedida agora, mesmo o OneDrive ainda
   não estando ligado — assim quem conectar não precisa autorizar de novo quando eu terminar
   essa parte.)
7. Me envie o **Client ID** e o **Client Secret** por um canal seguro (não aqui no chat) que eu
   cadastro na Vercel como `MICROSOFT_CLIENT_ID` e `MICROSOFT_CLIENT_SECRET`.

## 2. Dropbox — App Console

1. Acesse https://www.dropbox.com/developers/apps → **Create app**.
2. Escolha **Scoped access**, tipo de acesso **Full Dropbox** (ou "App folder" se preferir
   isolar tudo numa pasta só — me avise qual prefere, muda como as pastas por processo ficam
   organizadas lá dentro).
3. Nome do app: algo único tipo "Lumen-RodartePrado" (o Dropbox exige nome único global).
4. Na aba **Permissions**, marque: `files.content.write`, `files.content.read`,
   `sharing.write` (esse último para gerar o link de visualização do arquivo, como já fazemos
   no Google Drive).
5. Na aba **Settings**: em **Redirect URIs**, adicione:
   ```
   https://lumen-flax-chi.vercel.app/api/dropbox/callback
   ```
6. Ainda em **Settings**, anote o **App key** e o **App secret**.
7. Me envie os dois por um canal seguro que eu cadastro na Vercel como `DROPBOX_CLIENT_ID` e
   `DROPBOX_CLIENT_SECRET`.

## 3. Conectar (depois de eu cadastrar as credenciais)

- **Outlook**: cada pessoa conecta a própria conta em **Configurações → Modelos &
  Integrações → Outlook (Microsoft)**. Publicações passam a ser buscadas na caixa Outlook dela
  junto com o Gmail (mesmo botão de sincronizar). Envio de e-mail no Atendimento continua
  exigindo escolha explícita do provedor (card "Envio de e-mail no Atendimento", já no ar) —
  conectar não liga o envio sozinho.
- **OneDrive/Dropbox como armazenamento**: cada escritório vai escolher o provedor
  (Google Drive, OneDrive ou Dropbox) em Configurações — ainda estou construindo essa parte.

## O que ainda falta (em construção agora)

- **OneDrive** e **Dropbox** como opção de armazenamento (anexos de Processos/Atendimentos/
  Assessoria) — hoje só Google Drive. Cada escritório escolhe o provedor; recriar a lógica de
  pasta-por-processo/categoria para os dois provedores novos.
- **Calendário** — sincronizar a Agenda do sistema com Google Calendar e com o calendário do
  Outlook (a conexão de e-mail de hoje não dá acesso a calendário — precisaria do escopo
  `Calendars.ReadWrite` a mais no Azure AD). Outros calendários (ex.: Apple/iCloud) ficam pra
  quando houver um pedido concreto por eles.
