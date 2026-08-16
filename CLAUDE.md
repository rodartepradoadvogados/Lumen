# Lúmen — instruções para o Claude

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
