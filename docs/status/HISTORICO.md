# Histórico do Lúmen

Registro de alto nível do que foi produzido, em ordem — pensado para abrir rápido depois de um
`git pull` e ver "o que mudou desde a última vez que eu olhei", sem precisar ler `git log`
inteiro. Datas exatas de cada mudança: `git log --follow` no arquivo em questão, ou a data do
merge de cada PR no GitHub.

Este arquivo é atualizado a cada mudança relevante entregue (funcionalidade, correção, ou
trabalho de fundo como esta auditoria). PRs pequenos de ajuste fino podem ser agrupados numa
única linha quando fizer sentido.

---

## Segurança

- **Auditoria de segurança completa** — 5 categorias (isolamento de tenant, permissões no
  servidor, IDOR, segredos expostos, XSS), 113 arquivos auditados. 5 achados confirmados (3
  altos, 1 médio, 1 baixo), 0 críticos. Relatório em
  `docs/security-audit/relatorio-auditoria-seguranca.pdf`, plano de ação em
  `docs/security-audit/plano-remediacao.md`.
- **Estrutura do vault de chaves** — mapa de todas as variáveis de ambiente do projeto (o quê,
  onde obter/rotacionar), para organizar num gerenciador de senhas dedicado. Nenhum valor real
  neste repositório — ver `docs/vault-chaves/README.md`.
- **Fase A do plano de remediação (os 3 achados de severidade Alta)**:
  - Webhook do WhatsApp agora recusa requisição não autenticada quando o secret não está
    configurado (era fail-open antes).
  - Links de reunião (`Task.meetingUrl`) e de tribunal (`Case.tribunalLink`) não aceitam mais
    protocolo `javascript:` — validado ao salvar e de novo ao exibir o link (novo
    `lib/urlSafety.ts`).
  - `prisma/seed.ts` não tem mais senha fixa em texto puro — gera uma aleatória a cada execução.
  - **Ficam pendentes duas ações manuais**, fora do que dá para fazer só com código: auditar se
    já existe algum registro com `javascript:` salvo no banco de produção (ver queries no plano),
    e rotacionar as senhas reais das contas de Jairo e Rodrigo em produção.
- **Fase B do plano de remediação (os achados médio e baixo)**:
  - E-mails (resumo diário, notificação de menção, comunicados) escapam todo texto de usuário
    antes de montar o HTML — comentário, título de tarefa, nome de cliente e as variáveis
    `{{teor}}`/`{{cliente}}`/`{{prazo}}` dos comunicados não viram mais HTML executável dentro
    do e-mail (novo `lib/htmlEscape.ts`).
  - A rota de foto de perfil (`/api/perfil/foto/{userId}`) agora exige sessão válida — antes
    respondia sem pedir login nenhum.
  - Fase A e B do plano estão concluídas no código; restam só as duas ações manuais citadas
    acima (banco de produção e rotação de senha).

## App mobile

- **Menu de escolha no botão "+"** — antes ia direto para Novo Atendimento; agora abre um menu
  com Atendimento/Processo/Caso/Assessoria e Prazo/Tarefa/Audiência/Perícia/Evento.
- **Nova Assessoria pelo app** — não existia rota nenhuma para isso no mobile; agora tem.
- **Código de país (DDI) no cadastro de telefone** — corrige o envio por WhatsApp quebrando com
  números sem código de país.

## Publicações

- **Painel de conteúdo com fundo diferenciado** ("flutuando") em vez de se confundir com o
  fundo da tela.
- **Animações de saída na triagem** (marcar como lida, arquivar, bloquear, delegar), com
  desfazer de 4 segundos onde faz sentido — ajustadas depois para 1 segundo completo de duração.
- **Cantos arredondados** nos botões de ação da tela (Sincronizar, Distribuir pendentes) e no
  botão "+Novo" da faixa de topo, agora num bordô mais claro que o Peticionar.
- **Faixa de topo clara no tema Manhã** — antes tinha uma tarja escura fixa atrás da busca/guias.

## Agenda

- **Calendário "de tabuleiro"** — dias com cantos arredondados e respiro entre eles, em vez de
  grade com borda contínua.
- **Botões "Nova Tarefa"/"Nova neste dia" em bordô**, seletor Mês/Semana/Lista e filtros
  arredondados.

## Tarefas e compromissos

- **Contraste dos campos no modal de Tarefa/Compromisso** — campos que se confundiam com o
  fundo do modal.
- **Editor de texto rico na Descrição** — negrito, itálico, sublinhado, tópicos — mesmas
  funcionalidades que já existiam nas Anotações.

## Infraestrutura / correções de produção

- **Erro de renderização (RSC) que derrubou o login em produção** — componente de servidor
  passando ícone como função para um Client Component; corrigido para passar o ícone já
  renderizado.
