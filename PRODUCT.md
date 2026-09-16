# Product

<!-- impeccable:product-schema 1 -->

> Escrito em 2026-09-16 pelo comando `init` do Impeccable, a partir de entrevista com o dono do
> produto (rodartepradoadvogados) mais leitura do repositório. Fatos marcados **[inferido]** vieram
> do código/documentação e ainda não foram confirmados por ele — corrija-os livremente.
>
> Este arquivo guarda **verdade de produto**. Ele não decide cor, tipografia, componente ou conceito
> de página: isso pertence ao fluxo `new-work` e ao DESIGN.md.

## Platform

web

## Users

**Usuário primário, com prioridade declarada:** o **advogado dono/sócio** do escritório-cliente. É
quem decide a assinatura, cobra resultado da equipe e abre o sistema para saber se o escritório está
em dia. Quando o interesse dele conflitar com o da equipe operacional, o produto atende a ele
primeiro — visão geral, confiança e senso de controle vêm antes de densidade e atalho.

**Usuário secundário:** a equipe operacional — secretária, estagiário e advogado associado — que
passa o dia dentro do sistema lançando prazo, anexo, publicação e financeiro. Não é o critério de
desempate, mas é quem gera a maior parte dos eventos do sistema. **[inferido do código: perfis com
`isAdmin`, `financeAccess` e acesso por módulo]**

**Terceiro público, separado:** a própria equipe da plataforma Lúmen (Jairo, Rodrigo e time), que
opera o Painel Mestre — administração de escritórios-cliente, preços, faturamento e acesso de
suporte. Nunca é um escritório-cliente. **[inferido de `app/painel-mestre/*`]**

## Product Purpose

O Lúmen é o sistema de gestão de um escritório de advocacia: reúne processos e casos, atendimento,
assessoria jurídica empresarial, publicações oficiais, agenda/prazos, documentos e financeiro num
lugar só, em vez de espalhados entre planilha, e-mail, Drive solto e memória de quem está de plantão.

Sucesso é o dono conseguir responder, em segundos e sem perguntar para ninguém: **o que corre risco
agora?** — prazo vencendo, publicação não triada, conta a pagar, cliente sem resposta.

É um SaaS multi-inquilino vendido a outros escritórios, não uma ferramenta interna de um escritório
só. **[inferido: isolamento por `officeId`, cadastro público, planos, cobrança Asaas, Painel Mestre]**

## Positioning

Dois mecanismos que o dono aponta como o que os concorrentes diretos (AdvBox, Astrea, Projuris) não
fazem, ou fazem pior:

1. **Os documentos ficam no Drive do próprio escritório.** Os arquivos vivem na conta de
   armazenamento do cliente (Google Drive, com OneDrive e Dropbox suportados), organizados em pasta
   por processo e por tipo de documento — não num repositório fechado do fornecedor de onde o
   escritório não tira os próprios arquivos. O escritório continua dono do acervo mesmo que cancele.

2. **Assessoria jurídica empresarial é cidadã de primeira classe.** Contratos, licitações, pareceres
   e demandas recorrentes têm modelo, pasta e fluxo próprios — não são um "processo" adaptado com
   gambiarra. **[inferido do schema: `Assessoria`, `Licitacao`, `Parecer`, `AssessoriaDocumento`,
   `Honorario` mensal]**

## Operating Context

- **Rotina do escritório brasileiro:** publicações oficiais (DJEN/Datajud) entram sozinhas por um
  serviço agendado à parte, viram prazo na agenda e se ligam ao processo e ao financeiro. Protocolo,
  peticionamento e audiência fazem parte do ciclo diário.
- **Armazenamento é de terceiro, não nosso:** Google Drive (principal), OneDrive e Dropbox. Pastas e
  documentos são manipulados também **fora** do Lúmen, direto no Drive — o sistema precisa conviver
  com isso e reconciliar o que mudou por fora.
- **Duas plataformas de uso:** computador no escritório (portal completo) e celular fora dele (PWA,
  usado em qualquer situação de luz — no fórum, na rua, na frente do cliente).
- **Canais com o cliente:** e-mail e WhatsApp saem de dentro do sistema; existe um "modo reunião"
  pensado para abrir na frente do cliente sem expor honorários, pendência financeira ou comentário
  interno.
- **Acesso de suporte é vigiado:** a equipe da plataforma só entra no escritório-cliente com trilha
  registrada e dados mascarados, e o escritório vê e controla isso (LGPD).
- **Cobrança e planos:** assinatura por módulos contratados, com preço configurável no Painel Mestre —
  nunca fixo no código (requisito explícito do dono, já implementado).

## Capabilities and Constraints

**Módulos hoje:** Processos e Casos (judicial, administrativo, extrajudicial/caso) · Atendimento com
funil comercial · Assessoria (documentos da empresa, licitações, demandas/pareceres, honorários
mensais) · Publicações e triagem · Agenda, Kanban e prazos · Financeiro (receitas, despesas, DRE,
fluxo de caixa, livro caixa, centro de custo) · Relatórios e produtividade · Protocolos · Anexos com
organização automática no Drive · Contatos (clientes, advogados, fornecedores, equipe) · Blog público
com redação interna · Painel Mestre da plataforma.

**Escala das telas (medida em 2026-09-16):** 99 rotas navegáveis, ~98 sub-telas de aba/filtro, ~60
modais e gavetas que o usuário percebe como tela própria, e 4 folhas de impressão — distribuídas em
5 superfícies com 4 mecanismos de tema independentes.

**Restrições técnicas duráveis:** Next.js 14 (App Router) na Vercel, Prisma sobre Postgres (Neon),
sem pasta de migrações versionada (`prisma db push` puro, aplicado no build de produção). Isolamento
multi-inquilino por `officeId` em toda consulta. Integrações externas seguem padrão *fail-closed*.
Nenhum segredo real entra no repositório. **[inferido de `CLAUDE.md` e do código]**

**Terminologia do domínio que não pode ser "melhorada" sem consulta:** processo × caso (o produto
chama de "Processo" o judicial e o administrativo, e de "Caso" o resto, embora ambos sejam o mesmo
modelo no banco), demanda (que na Assessoria significa **Parecer**, não tarefa), licitação,
publicação × andamento, protocolo, parecer, honorário, assessoria.

## Brand Commitments

- Nome do produto: **Lúmen**. Escritório dono: Rodarte Prado Advogados (Goiânia-GO).
- Idioma: português do Brasil, com vocabulário jurídico correto. Rótulo de interface fala a língua do
  advogado, não a do banco de dados.
- **Nenhuma trava visual está em vigor.** Em 2026-09-16 o dono autorizou explicitamente um redesign
  completo, com permissão para trocar cor de marca, tipografia e temas. As escolhas visuais
  anteriores (bordô `#8a2f42`, Inter, paleta aproximada do Dracula) passam a ser **evidência e
  anti-referência**, não compromisso — a substituição é decidida em `new-work`, não aqui.

## Evidence on Hand

O que existe de verdade, hoje, para mostrar no site público:

- **O produto em si.** É possível gerar capturas reais das telas do Lúmen.
- **Não existe depoimento de cliente.** Nenhum escritório foi confirmado como referência pública.
- **Não existe número comprovável** de uso (processos geridos, prazos cumpridos, tempo economizado).
- **Não existe fotografia** própria do escritório, da equipe ou de uso real.

**Regra que decorre disso, e que trabalho futuro não pode violar:** nada de depoimento, logotipo de
cliente, número de tração ou selo inventado. O site convence mostrando o produto funcionando — e se
um número aparecer, ele precisa ser comprovável pelo escritório.

## Product Principles

1. **Risco primeiro.** A primeira coisa que qualquer tela do produto responde é o que está vencendo,
   parado ou sem dono. Informação bonita que não muda decisão fica depois.
2. **O acervo é do cliente.** Documento vive no armazenamento do próprio escritório, organizado de um
   jeito que continua fazendo sentido mesmo sem o Lúmen aberto.
3. **Assessoria não é processo disfarçado.** Contrato, licitação e parecer têm ciclo próprio e
   merecem estrutura própria.
4. **Prova real ou nada.** O produto se vende mostrando a si mesmo; nenhuma evidência é fabricada.
5. **Legibilidade é requisito.** Texto que não passa no contraste é defeito, não questão de gosto —
   ver Accessibility abaixo.

## Accessibility & Inclusion

Não há exigência formal de cliente, licitação ou norma. O dono estabeleceu, em 2026-09-16, **WCAG AA
como piso da casa** e autorizou corrigir os tokens de texto que hoje reprovam, **mesmo que isso mude
o visual**.

Isso desbloqueia explicitamente uma dívida que estava congelada desde 2026-09-11: o token de texto
terciário (`--tx-3`, ~2,6-2,9:1 de contraste) reprovava em AA e não podia ser mexido sem decisão do
dono. Agora pode.
