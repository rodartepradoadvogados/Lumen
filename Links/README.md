# Links do Lúmen — site, apps instalados e painéis dos serviços usados

Índice rápido dos links e programas usados no projeto, pra não precisar caçar em favoritos
espalhados. Nenhum valor de login/senha entra aqui — isso vive só no gerenciador de senhas do
escritório (ver `docs/vault-chaves/README.md`). Este arquivo é só o mapa de "onde é cada coisa".

Sincroniza sozinho: como este arquivo vive no repositório, ele chega na sua pasta local
(`C:\Projetos\Lumen`) a cada `git pull` — se um link mudar (domínio novo, painel diferente),
atualiza aqui e o `git pull` seguinte já traz a versão certa pra todo mundo.

---

## O Lúmen em si

| O quê | Link | Observação |
|---|---|---|
| Site (produção) | https://lumen-flax-chi.vercel.app | Login normal, versão completa (desktop) |
| App mobile (PWA) | https://lumen-flax-chi.vercel.app/m | Mesmo site — no celular, abrir esse link no Chrome/Safari e usar "Adicionar à tela de início"/"Instalar app". Depois de instalado vira um ícone próprio, sem barra de endereço. |
| App para computador (PWA) | https://lumen-flax-chi.vercel.app | Mesmo site — no Chrome/Edge do notebook, ir em **Configurações → Aplicativo para computador → Instalar no computador** (ou o ícone de instalar que aparece na barra de endereço). Abre como janela própria, com ícone na barra de tarefas. |
| Repositório (código-fonte) | https://github.com/rodartepradoadvogados/Lumen | Histórico de tudo que já foi produzido |

## Hospedagem e infraestrutura

| Serviço | Link | Para que serve aqui |
|---|---|---|
| Vercel (deploy do site) | https://vercel.com/rodartepradoadvogados-projects/lumen | Hospeda o Lúmen, roda o build a cada push no `main`, guarda as variáveis de ambiente (segredos) de produção |
| Neon (banco de dados) | https://console.neon.tech | Postgres de produção (projeto **neon-citron-ferry**, selecionar no seletor de projetos do console) — dados de todos os escritórios |
| Railway (robô de publicações) | https://railway.app/project/8abe7add-585c-468f-82bf-de8bc9266297 | Roda o `robo-publicacoes/` (processa e-mails de publicação do Jusbrasil) — serviço à parte do site principal, que fica na Vercel |
| Supabase | — | **Não usado neste projeto.** O Lúmen usa Neon + Prisma, não Supabase — incluído aqui só pra registrar que foi checado e não se aplica. |

## Integrações externas

| Serviço | Link do painel/console | Usado para |
|---|---|---|
| Google Drive/Workspace | https://drive.google.com | Pastas de processo/cliente, nomeação automática de documentos |
| Meta for Developers (WhatsApp Business Cloud API) | https://developers.facebook.com | Envio/recebimento de mensagens de WhatsApp (Atendimento) |
| Asaas | https://www.asaas.com | Cobranças/pagamentos (boletos, links de pagamento) |
| BTG Pactual (Empresas) | https://www.btgpactual.com | Emissão de boleto bancário |
| Microsoft (OAuth) | https://portal.azure.com | Login/e-mail via Microsoft, quando o escritório usa esse provedor |

---

## Como manter isto atualizado

Sempre que um domínio, painel ou serviço novo entrar no projeto, atualiza a tabela certa aqui
(ou pede pra eu atualizar). Evita: (1) inventar link que não foi confirmado — se não tiver
certeza de qual é o painel exato, deixa "—" com uma nota, em vez de um link chutado; (2) colocar
qualquer usuário/senha/token real neste arquivo — isso é vault, não este índice.
