# Lúmen — instruções para o Claude

## NUNCA use o repositório rp-financeiro

Existe um repositório antigo, `rodartepradoadvogados/rp-financeiro`, que **não é usado pelo
escritório**. O sistema real, o que o escritório efetivamente opera e chama de "Lúmen", é
**este** repositório: `rodartepradoadvogados/lumen` (o nome do repo no GitHub é `Lumen`, com
maiúscula — não confundir com o produto/marca "Lúmen", com acento, que é como o dono se refere
ao sistema em conversa).

Instrução permanente do dono do projeto: **nenhum agente deve ler, investigar, editar ou
enviar (push) qualquer coisa em `rp-financeiro`**, a menos que o dono peça **expressamente e
pelo nome** "rp-financeiro" naquela conversa. Um pedido genérico sobre "o sistema", "o Lúmen",
"o app", "o site do escritório" etc. — mesmo que a sessão tenha sido iniciada ou anexada por
engano ao `rp-financeiro` — significa **este** repositório (`lumen`), nunca aquele. Se uma
sessão perceber que está trabalhando em `rp-financeiro` sem esse pedido explícito, deve parar,
avisar o dono, e trocar para `lumen` antes de continuar.

## Leia antes de mexer em qualquer coisa

`docs/ESTADO-ATUAL-E-ARMADILHAS.md` lista as decisões deste projeto que parecem
arbitrárias e não são — cada uma com o defeito que ela corrigiu e o que volta a quebrar se
for desfeita. **Leia antes de alterar código, variável de ambiente ou painel externo.**

O mínimo, para quem não vai ler agora:

- O sistema atende em **`https://lumen.rodarteprado.com.br`**. Nunca escreva endereço
  absoluto no código — use `getAppUrl()` (`lib/appUrl.ts`).
- **`GoogleCredential.lastSyncAt` é a marca d'água** da busca no Gmail, não telemetria.
  Trocá-la por uma consulta por escritório reintroduz um defeito silencioso (item 3).
- **A política de privacidade (`app/privacidade/page.tsx`) descreve o comportamento real
  do código**, inclusive o que é enviado a provedor de IA. Mudou o que o sistema faz com
  dados do Gmail ou do Drive? Atualize a política no mesmo PR (item 5).
- No Google Cloud, **não clique em "Voltar para o teste"** e não apague o domínio
  autorizado antigo nem o URI de retorno antigo (item 7).

## Merge automático de Pull Requests

Autorização permanente do dono do projeto (rodartepradoadvogados): PRs abertos pelo Claude
neste repositório podem ser **mergeados automaticamente pelo próprio Claude**, sem esperar
aprovação manual no GitHub, desde que a verificação técnica local passe limpa:

- `rm -rf .next && npx tsc --noEmit -p .`
- `npx eslint` nos arquivos alterados
- `npx next build` completo

Isso vale para qualquer tipo de mudança, **inclusive alterações em `prisma/schema.prisma`** —
não há exceção por área sensível (financeiro, autenticação, schema de banco). Não é necessário
perguntar antes de mergear; é necessário avisar o que foi feito depois.

Não existe workflow de CI (`.github/workflows`) neste repositório — a verificação acima É o
gate completo antes do merge.

## Por que mudança de schema é segura de mergear sozinho

O script de build (`package.json` → `"build"`) já roda `prisma generate && next build` e, em
produção (`$VERCEL_ENV = production`), também `npx prisma db push` automaticamente, dentro do
próprio build da Vercel — **antes** do deploy virar o tráfego ao vivo. Ou seja: assim que um PR
é mergeado em `main` e a Vercel builda a produção, o schema do banco já fica sincronizado
sozinho, sem exigir nenhum passo manual (`npx prisma db push` local só é necessário se alguém
quiser aplicar uma mudança de schema ANTES de mergear/buildar, ou para investigar problemas).

Projeto usa `prisma db push` puro — não há pasta `prisma/migrations` versionada.

## Antes de mergear, sempre

1. Sincronizar com `origin/main` antes de começar (`git fetch origin main -q`, checar
   `git log -1 --oneline origin/main`) — nunca assumir que uma branch/checkout local antiga
   está atualizada.
2. Rodar a verificação técnica listada acima.
3. Escrever a mensagem de commit/PR em português, detalhando causa raiz/impacto/correção
   (estilo já usado no histórico do repositório).
4. Depois do merge, avisar o usuário com um resumo curto do que foi feito — não é preciso
   pedir permissão antes, mas transparência depois é sempre esperada.

## Padrão fail-closed para webhooks e integrações externas

Todo endpoint que recebe requisição de fora (webhook, callback OAuth, cron) deve **recusar por
padrão** quando o segredo de verificação não estiver configurado — nunca aceitar "por segurança
ser opcional". Referência correta, já no código: `CRON_SECRET` (`app/api/cron/*/route.ts`) e
`ASAAS_WEBHOOK_TOKEN` (`lib/asaas.ts`) — ambos recusam (401/403) quando a variável de ambiente
está ausente.

Contraexemplo, já corrigido: `WHATSAPP_APP_SECRET` (`lib/whatsapp.ts:verifySignature`, achado F2
da auditoria de segurança, `docs/security-audit/`) — antes retornava "assinatura válida" quando
o secret estava ausente, permitindo requisição forjada sem credencial nenhuma. Ao criar uma
integração externa nova, siga o mesmo padrão desde o início — fail-closed não é um ajuste
posterior, é o comportamento correto de partida.

## Nunca commitar segredo real

Nenhum valor real de chave, senha, token ou string de conexão de banco entra no repositório —
nem em código, nem em `.env.example` (que só documenta o NOME da variável, sempre vazio), nem
em script de seed, nem em documentação. Segredos reais vivem em dois lugares: (1) variáveis de
ambiente da Vercel (produção), e (2) um gerenciador de senhas dedicado para consulta da equipe —
ver `docs/vault-chaves/README.md` (mapa de onde cada chave vem, sem nenhum valor real).

O achado F3 da auditoria de segurança (`docs/security-audit/`) foi exatamente isso acontecendo:
uma senha real ficou em texto puro em `prisma/seed.ts`, versionada permanentemente no histórico
do git — mesmo removida depois, continua recuperável em qualquer commit anterior. Se precisar de
um valor para desenvolvimento/teste, gere algo aleatório (como `prisma/seed.ts` faz agora) ou
peça para o dono do projeto compartilhar via o gerenciador de senhas — nunca cole segredo real no
código, em commit, ou no chat.

## dangerouslySetInnerHTML sempre revisado

`.eslintrc.json` tem `react/no-danger` como `warn` (item C2 do plano de remediação) — toda
ocorrência nova aparece no lint para revisão manual antes de virar rotina. As ocorrências já
revisadas e legítimas têm `eslint-disable-next-line react/no-danger` com o motivo ao lado; uma
ocorrência nova sem esse comentário e sem justificativa clara (dado vindo de usuário sem passar
por sanitização) é bloqueio de revisão, não só aviso a ignorar.
