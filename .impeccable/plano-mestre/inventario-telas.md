# Inventário de telas — Lúmen

Levantado em 2026-09-16 por leitura direta de `app/**/page.tsx` (103 arquivos, 4 deles apenas
`redirect()`), dos `layout.tsx`, dos `searchParams`, dos arrays de aba e dos `ModalShell size="cheio"`
/ `SlideDrawer`.

**Este arquivo é a lista de verificação de cobertura do redesign.** Marque a coluna final conforme
cada tela for coberta: ⬜ pendente · ✅ redesenhada · ✅✅ redesenhada e verificada no navegador.

**Totais:** 99 rotas navegáveis · 4 redirects · ~98 sub-telas de aba/filtro · ~60 modais e gavetas
que funcionam como tela · 4 folhas de impressão · 4 mecanismos de tema independentes.

---

## 0. Cascas e temas

| Superfície | Layout | Escopo CSS | Tema padrão | Chave localStorage | Casca navegacional |
|---|---|---|---|---|---|
| Site público | `app/layout.tsx` | `:root` + `.dark` | Claro | `rp-site-theme` | nenhuma (cada página desenha o topo) |
| Blog | `app/blog/layout.tsx` | herda do site + Lora (`--font-blog-serif`) | Claro | `rp-site-theme` | cabeçalho próprio |
| Portal | `app/(app)/layout.tsx` + gates de módulo | `.portal-shell` / `.portal-light` | **Escuro** | `rp-portal-theme` | `NavRail` + `TopBar` + `PageSectionTabs` |
| Painel Mestre | `app/painel-mestre/layout.tsx` | `.painel-mestre-shell` / `.painel-mestre-light` | **Escuro** | `rp-painel-mestre-theme` | `LumenNavRail` + `LumenTopStrip` |
| PWA | `app/m/layout.tsx` + gates | `.mobile-shell` / `.mobile-dark` | Claro | `rp-mobile-theme` | topo compacto + `MobileBottomNav` + FAB |

Overlays globais do Portal: `AnotacoesPanel`, `ClaudeAssistantWidget`, `GlobalSearch`,
`UndoToastProvider`, e as faixas `SupportAccessBanner` / `ActingOfficeBanner` / `InactivityNotice` /
`OfficeSuspendedNotice`.

Telas-substitutas de bloqueio (ocupam a tela inteira, entram no redesign):
`ModuleDisabledNotice`, `AccessRestrictedNotice`, `OfficeSuspendedNotice`.

---

## 1. Site público — modo **Persuade** — 8 rotas

| Rota | Nome humano | Sub-telas / estados | Modais-tela | Status |
|---|---|---|---|---|
| `/` | Landing institucional | hero · faixa de marca · `#recursos` (5 cards) · `#preco` · CTA final | — | ⬜ |
| `/login` | Entrar | — | Esqueci minha senha | ⬜ |
| `/cadastro` | Criar conta do escritório | — | — | ⬜ |
| `/escolher` | Escritório × plataforma | só para quem tem os dois acessos | — | ⬜ |
| `/privacidade` | Política de Privacidade | — | — | ⬜ |
| `/redefinir-senha` | Redefinir senha | sem token × com token | — | ⬜ |
| `/peticionar` | Peticionar (janela solo) | `PeticionarWorkspace` | **Wizard de peticionar** (5 passos) | ⬜ |
| `/reuniao/[id]` | Modo reunião (projeção) | sem honorário, sem pendência, sem comentário interno | — | ⬜ |

⚠️ `/peticionar` e `/reuniao/[id]` são autenticadas mas ficam **fora** da casca do portal — herdam o
tema claro do site. Descontinuidade visual a resolver.

## 2. Blog — modo **Read** — 2 rotas

| Rota | Nome humano | Sub-telas | Status |
|---|---|---|---|
| `/blog?page=N` | Blog Jurídico (índice) | paginação | ⬜ |
| `/blog/[slug]` | Matéria | estado "não encontrada" | ⬜ |

A redação do blog não fica aqui: `/configuracoes?secao=blog` (Portal) e `/m/configuracoes?blogTab=`.

## 3. Portal / SaaS — modo **Operate** — 42 rotas (+2 redirects)

Rail de 6 destinos (`lib/navSections.ts`): Painel · Agenda · Comunicação · Jurídico · Financeiro ·
Gestão, com "Ajustes" fixo no pé.

### 3.1 Painel e Agenda

| Rota | Nome humano | Sub-telas de aba/filtro | Modais-tela | Status |
|---|---|---|---|---|
| `/painel` | Painel (home) | O dia · Publicações não lidas · Minhas atrasadas · A receber 7d · A pagar 7d · follow-ups | Card de compromisso | ⬜ |
| `/agenda` | Agenda | **3**: `visao=mes` (padrão) · `semana` · `lista`; filtros de responsável e tipo | Card de compromisso · Nova tarefa/evento/prazo | ⬜ |
| `/kanban` | Kanban da agenda | colunas por status (drag & drop) | Card de compromisso · Nova tarefa | ⬜ |
| `/alertas` | Central de Alertas | **2**: `pendentes` (padrão) · `hoje`; bloco de exclusões pendentes | — | ⬜ |

### 3.2 Comunicação

| Rota | Nome humano | Sub-telas de aba/filtro | Modais-tela | Status |
|---|---|---|---|---|
| `/publicacoes` | Publicações (triagem) | **4 chips**: `nao-triadas` (padrão) · `minhas` · `sem-processo` · `arquivadas`; + tipo, advogado, responsável, busca | Painel de teor · Wizard de peticionar · Vincular a processo | ⬜ |
| `/atendimento` | Atendimento | filtros-aba por status; `novo=1` abre modal | Novo Atendimento · Qualificação do cliente | ⬜ |
| `/atendimento/funil` | Funil comercial | colunas por estágio | Motivo da perda | ⬜ |
| `/atendimento/[id]` | Ficha do atendimento | dados · pendências · tarefas · anexos · anotações · WhatsApp · e-mail | Nova tarefa · Gerar documento · Converter em processo · Responder e-mail | ⬜ |
| `/contatos` | Contatos (hub) | 4 cards | — | ⬜ |
| `/contatos/clientes` | Clientes | busca | Novo contato · Editar cliente | ⬜ |
| `/contatos/clientes/[id]` | Ficha do cliente | processos do cliente | Editar cliente | ⬜ |
| `/contatos/advogados` | Advogados | **3**: todos · parceiros · adversos | Novo contato · Editar advogado | ⬜ |
| `/contatos/fornecedores` | Fornecedores | — | Novo/Editar fornecedor | ⬜ |
| `/contatos/equipe` | Equipe | — | — | ⬜ |

### 3.3 Jurídico

| Rota | Nome humano | Sub-telas de aba/filtro | Modais-tela | Status |
|---|---|---|---|---|
| `/processos` | Processos e Casos | **4 por natureza**: todos · judicial · administrativo · caso; + esfera, matéria, status, área, responsável, ordenação | Ficha rápida (gaveta) | ⬜ |
| `/processos/[id]` | **Processo/Caso (a tela mais densa)** | **9 abas**: visão-geral · atividades · comentários · financeiro · publicações · anexos · protocolos · vigilância · anotações-pessoais | Editar processo · Novo protocolo · Nova tarefa · Lançar/apurar honorário · Contas · Aplicar workflow · Enviar e-mail · Gerar documento · Enviar E-mail/WhatsApp · Reorganizar anexos do Drive · Peticionar · Modo reunião | ⬜ |
| `/processos/novo` | Novo Processo/Caso | fluxo varia por `type` | Seletor de tribunal · Órgão administrativo · Recurso que escala | ⬜ |
| `/assessoria` | Assessoria (lista) | — | — | ⬜ |
| `/assessoria/[id]` | Assessoria — ficha da empresa | **7 abas**: geral (padrão) · documentos · honorários · licitações · demandas-processos-casos · linha-do-tempo · anotações | 3 gavetas de 980px (licitação · demanda/parecer · atendimento) + ficha rápida | ⬜ |
| `/assessoria/novo` | Nova Assessoria | — | — | ⬜ |

### 3.4 Financeiro

| Rota | Nome humano | Sub-telas de aba/filtro | Modais-tela | Status |
|---|---|---|---|---|
| `/financeiro` | Financeiro (hub) | 4 StatCards + 5 cards de módulo | — | ⬜ |
| `/financeiro/receitas` | Receitas | **4 abas**: abertas · pagas · todas · apurar; + período, busca, categoria, centro de custo | Editar recebível · Lançar honorários · Baixa (individual e em lote) | ⬜ |
| `/financeiro/despesas` | Despesas | **3 abas**: abertas · pagas · todas; + mesmos filtros | Nova/Editar despesa · Baixa · Lote | ⬜ |
| `/financeiro/fluxo-de-caixa` | Fluxo de Caixa (−3/+3 meses) | detalhamento mensal expansível | — | ⬜ |
| `/financeiro/dre` | DRE Gerencial | **2 modos**: mês × intervalo livre; `ocultarVazias`; centro de custo | Drill-down de categoria | ⬜ |
| `/financeiro/livro-caixa` | Livro Caixa | filtro de período | — | ⬜ |
| `/financeiro/contas-a-pagar` · `/contas-a-receber` | *(redirects legados)* | — | — | n/a |

### 3.5 Gestão

| Rota | Nome humano | Sub-telas de aba/filtro | Modais-tela | Status |
|---|---|---|---|---|
| `/relatorios` | Relatórios | **6 seções**: personalizado · produtividade (padrão) · processos · funil · publicações · financeiro | Seleção de itens · construtor personalizado | ⬜ |
| `/produtividade` | Produtividade | **3**: histórico (padrão) · timesheet · delegar | Delegar tarefa | ⬜ |
| `/conexoes` | Conexões | Google · Microsoft · Dropbox · OABs · Webhook · Manutenção; estados de retorno OAuth | Chaves de API · E-mails Jusbrasil | ⬜ |
| `/configuracoes` | Configurações | **6 seções**: equipe · financeiro · geral (padrão) · workflows · blog · cobrança; blog tem **3 sub-abas** | Importar · Modelos de documento · Feriados · Contas bancárias · Números bloqueados · Novo usuário | ⬜ |
| `/configuracoes/acessos` | Acessos da Lúmen | sessões · política | Encerrar acesso | ⬜ |
| `/configuracoes/acessos/previa` | Prévia mascarada do suporte | amostras por entidade | — | ⬜ |
| `/configuracoes/privacidade` | Privacidade e trilha | **4 abas de trilha**: revelação · exportação · exclusão · suporte | Pedido do titular · Pedidos de exclusão | ⬜ |
| `/configuracoes/comunicados` | Comunicados | **3 abas**: corpo · assunto · rodapé | — | ⬜ |
| `/configuracoes/duplicados` | Cadastros parecidos | clientes duplicados · pastas parecidas no Drive | 4 modais `size="cheio"` | ⬜ |
| `/configuracoes/importar` | Importar dados | blocos por entidade | Importar · Manual | ⬜ |
| `/configuracoes/relatorio-pastas` | Onde os anexos são salvos | blocos por entidade | Reorganizar anexos | ⬜ |
| `/perfil` | Meu Perfil | dados · conexões Google/Microsoft · senha | Recorte de foto · Trocar senha | ⬜ |

### 3.6 Folhas de impressão (requisito visual próprio)

| Rota | Nome humano | Status |
|---|---|---|
| `/financeiro/dre/imprimir` | DRE — folha | ⬜ |
| `/financeiro/fluxo-de-caixa/imprimir` | Fluxo de Caixa — folha | ⬜ |
| `/financeiro/livro-caixa/imprimir` | Livro Caixa — folha | ⬜ |
| `/relatorios/personalizado/imprimir` | Relatório de produção — folha | ⬜ |

Compartilham `components/relatorios/FolhaImprimivel.tsx` + `ImprimirAoAbrir.tsx`. **Não existe
`@media print` global.**

## 4. Painel Mestre — modo **Operate** — 10 rotas

| Rota | Nome humano | Sub-telas | Modais-tela | Status |
|---|---|---|---|---|
| `/painel-mestre` | Cockpit | BTG · Escritórios · indicadores | — | ⬜ |
| `/painel-mestre/escritorios` | Escritórios (lista) | — | — | ⬜ |
| `/painel-mestre/[officeId]` | Ficha do escritório-cliente | **5 abas**: visão-geral · equipe · cobrança · faturas · uso | Atuar como escritório · ajustes de assinatura | ⬜ |
| `/painel-mestre/novo` | Novo escritório | — | — | ⬜ |
| `/painel-mestre/precos` | Preços por módulo | — | — | ⬜ |
| `/painel-mestre/financeiro` | Financeiro Lúmen | foco por competência · despesas do mês | Despesa da plataforma | ⬜ |
| `/painel-mestre/equipe` | Equipe Lúmen | membros | Novo membro (**2 abas**: vincular × cadastrar) | ⬜ |
| `/painel-mestre/produto` | Produto e robôs | robôs de captura · última execução | — | ⬜ |
| `/painel-mestre/cofre` | Cofre de acesso | sessões ativas · pedidos recentes | Fila de pedidos | ⬜ |
| `/painel-mestre/confianca` | Confiança e LGPD | isolamento · acesso sob controle do cliente | — | ⬜ |

## 5. PWA mobile — modo **Operate** — 37 rotas (+2 redirects)

Nav inferior: Publ. · Agenda · **+** (FAB) · Processo · R$ — e "Mais" como tela própria.

### 5.1 Home, navegação e perfil

| Rota | Nome humano | Sub-telas | Folhas-tela | Status |
|---|---|---|---|---|
| `/m` | Início | tiles + bloco de alertas | Folha "Novo" · Busca global | ⬜ |
| `/m/mais` | Mais (menu) | lista de destinos | Instalar app | ⬜ |
| `/m/perfil` | Meu Perfil | — | Trocar senha · Sair | ⬜ |
| `/m/alertas` | Central de Alertas | **2**: pendentes · hoje | — | ⬜ |
| `/m/configuracoes` | Configurações | Modelos · Equipe; blog com **3 sub-abas** | — | ⬜ |
| `/m/configuracoes/acessos` | Acessos da Lúmen | política de suporte | — | ⬜ |
| `/m/contatos` | Contatos | **4 abas**: clientes (padrão) · advogados · equipe · fornecedores | — | ⬜ |

### 5.2 Agenda, publicações, processos

| Rota | Nome humano | Sub-telas | Folhas-tela | Status |
|---|---|---|---|---|
| `/m/agenda` | Agenda | **2**: dia (padrão) · semana; `novo=1` abre criação rápida | Criação rápida de compromisso | ⬜ |
| `/m/publicacoes` | Publicações | fila de não lidas · estado "Tudo lido!" | Card expandido · Vincular a processo | ⬜ |
| `/m/processos` | Processos ativos | filtro por natureza + busca | — | ⬜ |
| `/m/processos/[id]` | Processo/Caso | **9 abas** (mesmo conjunto do desktop) | Financeiro · Anexos · Protocolos · Vigilância · Nova anotação · Upload | ⬜ |
| `/m/processos/novo` | Novo Processo/Caso | fluxo varia por `type` | Formulário | ⬜ |
| `/m/processos/[id]/honorarios` | Lançar Honorários | — | Formulário | ⬜ |
| `/m/processos/[id]/despesa` | Lançar Despesa | — | Formulário | ⬜ |

### 5.3 Atendimento e Assessoria

| Rota | Nome humano | Sub-telas | Status |
|---|---|---|---|
| `/m/atendimento` | Atendimento | filtros-aba por status + busca | ⬜ |
| `/m/atendimento/[id]` | Ficha do atendimento | dados · status · conversão | ⬜ |
| `/m/atendimento/novo` | Novo Atendimento | — | ⬜ |
| `/m/assessoria` | Assessoria (lista) | estado vazio remete ao desktop | ⬜ |
| `/m/assessoria/novo` | Nova Assessoria | — | ⬜ |
| `/m/assessoria/[id]` | Assessoria — ficha | seções empilhadas (sem abas, ≠ desktop) | ⬜ |
| `/m/assessoria/[id]/licitacoes/nova` | Nova licitação | — | ⬜ |
| `/m/assessoria/[id]/licitacoes/[licitacaoId]` | Licitação (detalhe) | — | ⬜ |
| `/m/assessoria/[id]/licitacoes/[licitacaoId]/editar` | Editar licitação | — | ⬜ |
| `/m/assessoria/[id]/pareceres/nova` | Nova demanda | — | ⬜ |
| `/m/assessoria/[id]/pareceres/[parecerId]` | Demanda/parecer (detalhe) | — | ⬜ |
| `/m/assessoria/[id]/pareceres/[parecerId]/editar` | Editar demanda | — | ⬜ |

### 5.4 Financeiro e relatórios

| Rota | Nome humano | Sub-telas | Status |
|---|---|---|---|
| `/m/financeiro` | Financeiro (resumo) | cards de saldo | ⬜ |
| `/m/financeiro/menu` | Ver detalhes (menu) | 6 itens | ⬜ |
| `/m/financeiro/despesas` | Despesas | **3 abas** + período | ⬜ |
| `/m/financeiro/receitas` | Receitas | **4 abas** + período | ⬜ |
| `/m/financeiro/receitas/honorarios` | Lançar Honorários | — | ⬜ |
| `/m/financeiro/dre` | DRE Gerencial | navegação por mês · linhas expansíveis | ⬜ |
| `/m/financeiro/fluxo-de-caixa` | Fluxo de Caixa | detalhamento · receitas por grupo | ⬜ |
| `/m/financeiro/livro-caixa` | Livro Caixa | — | ⬜ |
| `/m/financeiro/relatorios` | Relatórios · Financeiro | recebido × pago · top 5 despesas | ⬜ |
| `/m/relatorios` | Relatórios | janela em meses · 3 seções | ⬜ |
| `/m/relatorios/personalizado` | Relatório Personalizado | construtor de filtros | ⬜ |
| `/m/financeiro/contas-a-pagar` · `/contas-a-receber` | *(redirects legados)* | — | n/a |

---

## 6. Pontos de atenção estruturais

1. **4 sistemas de tema paralelos e independentes.** Qualquer mudança de tema toca
   `app/globals.css` (linhas ~513-880) e os 3 arquivos `lib/*Theme.ts`. Cada shell **precisa ser
   auto-contido** — foi assim que a Manhã do PWA quebrou em produção (PR #174).
2. **Duas páginas autenticadas fora da casca do portal:** `/peticionar` e `/reuniao/[id]`.
3. **Paridade desktop × mobile:** `/processos/[id]` e `/m/processos/[id]` têm as mesmas 9 abas;
   `/assessoria/[id]` tem 7 abas no desktop e vira seções empilhadas no PWA.
4. **12 modais `size="cheio"`** (80% da tela) que o usuário lê como tela própria, e **4 gavetas de
   980px** na Assessoria.
5. **Telas de impressão** têm requisito visual isolado, sem `@media print` global.
