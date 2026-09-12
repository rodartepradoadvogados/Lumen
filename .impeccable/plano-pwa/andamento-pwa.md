# Andamento do plano de redesign — PWA mobile (`app/m/*`)

> **Instrução permanente:** mesma convenção de `plano-adequacao/`, `plano-dinamismo/`,
> `plano-redesign/` (site) e `plano-portal/` — ler este arquivo inteiro antes de qualquer rodada,
> acrescentar bloco novo ao final, nunca reescrever um já registrado.

**Origem:** adiado explicitamente na sessão do `plano-portal/` (Rodada 6, 2026-09-11) — pedido do
dono do projeto na mesma mensagem que encerrou o portal, tratado como plano próprio.

**Escopo desta rodada:** casca do PWA (`app/m/layout.tsx`, `components/mobile/MobileBottomNav.tsx`)
+ Painel (`app/m/page.tsx`) + tela de processo aberto (`app/m/processos/[id]/page.tsx`). Fora
desta rodada: as demais ~34 rotas de `app/m/*` (herdam token por token, sem trabalho dedicado),
`painel-mestre` e o site público (continuam adiados desde o `plano-portal/`).

---

## Origem — sessão de `grilling` (`mattpocock-skills:grilling`)

**Data:** 2026-09-11. Duas rodadas de perguntas antes de propor qualquer coisa visual:

**Rodada 1:**
1. **Motivo:** mesma raiz do portal — visual pode melhorar, não é bug nem pedido de cliente.
2. **Escopo:** casca + Painel + tela de processo aberto (recorte do dono do projeto, diferente
   da sugestão inicial que incluía Financeiro).
3. **Direção visual:** reaproveitar o mesmo sistema já aprovado e em produção no portal — nenhuma
   cor nova.
4. **Fronteira:** o trabalho de acessibilidade/mecânico já feito (`.impeccable/plano-adequacao/`)
   fica intocado — esta rodada é só atmosfera.

**Rodada 2** (depois de eu levantar os fatos: `/m` tem tema próprio e independente do portor,
padrão hoje é Manhã; não tem nenhuma customização de fonte/raio/cor de sistema ainda; já passou
pela rodada de acessibilidade; 37 rotas no total):
1. **Padrão de tema:** **continua Manhã** (claro) — diferente do portal. O PWA é usado por
   qualquer pessoa em qualquer situação de luz, não só pela equipe interna 8h/dia. Noite fica
   disponível com a mesma qualidade, não é o padrão de ninguém. (Esclarecido numa pergunta de
   desambiguação — a primeira resposta "sim" foi ambígua entre as duas opções apresentadas.)
2. **Indicador "ao vivo":** sim, replicar o mesmo glow reservado do portal na Central de Alertas
   do Painel, quando houver pendência.

**Validação do protótipo (2026-09-11):** artefato publicado
(https://claude.ai/code/artifact/7441ec3a-2f80-49a7-b2fe-b89f3e8ff44e) — casca + Painel + processo
aberto clicáveis, alternador Manhã/Noite funcional dentro do "telefone". **Aprovado.** Feedback
adicional do dono do projeto sobre os ícones-placeholder do protótipo (emoji, ex.: 🔔): "o ícone
do sino amarelo eu gostei. mantenha. de modo geral, os ícones que você usou no modelo podem ser
mantidos". Esclarecido em pergunta de desambiguação (emoji de verdade no código vs. só o estilo/
escolha do ícone): **emoji de verdade, mas só quando há pendência de verdade naquele ícone** — do
jeito que era (ícone de linha lucide-react) quando não há. Aplicado nos dois únicos lugares desta
rodada onde um ícone já carregava contador de pendência: sino do cabeçalho e calendário da aba
Agenda na barra inferior — não é troca geral de sistema de ícone.

---

## Rodada 1 — P1 implementado (fundação: tema Noite próprio, raio, glow, emoji condicional)

**Data:** 2026-09-11 · **Sessão:** mesma sessão do `grilling` e do protótipo, a pedido do dono do
projeto ("comece").

### O que foi feito

- **`app/globals.css`**: novo bloco `.mobile-shell`/`.mobile-shell.mobile-dark`, mesmos valores de
  cor do `.portal-shell` (dark) — nenhuma cor nova. Diferente do portal (que redefine tudo na
  base porque o padrão dele é escuro), aqui só a variante `.mobile-dark` precisou de definição
  completa: sem ela, `.mobile-shell` sozinho herda `:root` normalmente, exatamente como o PWA já
  se comportava antes desta rodada. `--concluido-glow` precisou de um valor também na Manhã
  (`.mobile-shell` sem `.mobile-dark`) — essa variável não existia em `:root`/`.dark` fora do
  escopo do Portal Noturno, e o `.live-dot` do Painel precisa dela nos dois temas. Raio 2px por
  seletor descendente (`.mobile-shell.mobile-dark .rounded-lg` e irmãos), igual ao portal,
  escopado só à Noite (na Manhã o PWA continua na escala de 4/6/10px de sempre).
- **`app/m/layout.tsx`**: `THEME_INIT_SCRIPT` reescrito — não alterna mais a classe global `.dark`
  em `<html>` (compartilhada com o site público), agora só ADICIONA `.mobile-dark` a
  `#mobile-shell` (nó próprio, sem risco de herdar o script do site). Sino do cabeçalho vira emoji
  🔔 só quando `totalAlerts > 0`; sem pendência, continua o ícone de linha `Bell` de sempre.
- **`components/mobile/MobileThemeToggle.tsx`**: `cycle()` agora alterna `.mobile-dark` em
  `#mobile-shell` em vez de `.dark` em `document.documentElement`.
- **`app/m/page.tsx`**: `.live-dot` ao lado do rótulo "Central de Alertas", só quando
  `totalAlerts > 0` — mesmo paralelo do portal com publicações não lidas.
- **`components/mobile/MobileBottomNav.tsx`**: ícone da aba Agenda vira emoji 📅 só quando
  `badgeCount > 0` (mesma regra do sino) — as outras quatro abas não têm contador, ficam como
  estavam.
- **`app/m/processos/[id]/page.tsx`**: **nenhuma edição precisou** — a tela de processo aberto já
  usa só tokens (`Card`, `--regua`, `--marca-tx`, `rounded-full` nas pílulas de aba) e herda cor/
  tema/raio automaticamente de `.mobile-shell`, mesmo efeito colateral já documentado no portal
  (P3→P4/P5). Confirma o recorte de escopo da Rodada 2 sem trabalho extra.
- **`DESIGN.md`**: nova seção "PWA Noturno — escopo `app/m/*`", registrando as 4 diferenças
  deliberadas do Portal Noturno (padrão continua claro, raio só na Noite, glow nos dois temas,
  emoji condicional restrito a ícones que já carregavam contador) — feito no mesmo PR da
  implementação.

### Pendente desta rodada

- Nenhuma. Verificação técnica local limpa, **mergeado automaticamente pelo Claude**
  (autorização do `CLAUDE.md`), PR **https://github.com/rodartepradoadvogados/Lumen/pull/173**,
  branch `feat/pwa-p1-fundacao` removida (local + remoto).

## Rodada 1b — correção: Manhã do PWA não era auto-contida

**Data:** 2026-09-11 · **Sessão:** mesma sessão da Rodada 1. Feedback direto do dono do projeto
depois de testar de verdade: "só tem o tema noite."

### O que foi feito

- **Causa raiz encontrada**: `.mobile-shell` (Manhã, padrão) só declarava `--concluido-glow` e
  confiava em herdar o resto de `:root`/`.dark` normalmente — mas o **site público tem seu
  próprio alternador de tema** (`rp-site-theme`, `lib/theme.ts`), independente do PWA, que também
  troca a classe `.dark` em `<html>`. Com o tema do site em Noite, `/m` inteiro herdava a paleta
  escura antiga do site (nem a Dracula aproximada) mesmo com o alternador do PWA em Manhã — a
  Manhã "desaparecia". Mesmo cuidado que `.portal-shell` já tinha ("auto-contido de propósito",
  comentário original do Portal Noturno) — não copiei essa lição pro lado da Manhã do PWA na
  Rodada 1.
- **Corrigido**: `.mobile-shell` passa a redeclarar os mesmos valores de `:root` (mesma técnica
  de `.portal-shell`/`.portal-shell.portal-light`) — agora nem a Manhã nem a Noite do PWA
  dependem da classe `.dark` do `<html>`, tema do site e do PWA ficam de fato independentes nos
  dois sentidos.
- Verificação técnica local limpa, **mergeado automaticamente pelo Claude**, PR
  **https://github.com/rodartepradoadvogados/Lumen/pull/174**, branch
  `fix/pwa-manha-autocontida` removida (local + remoto).

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: estender o mesmo tratamento (raio/glow/emoji
  condicional) para as telas de Financeiro e Publicações do PWA — próximas de maior uso depois do
  Painel, pedido direto do dono do projeto para começar imediatamente após a correção.

## Rodada 2 — Financeiro e Publicações: nenhuma edição precisou

**Data:** 2026-09-11 · **Sessão:** mesma sessão, sequência direta pedida pelo dono do projeto.

### O que foi feito

- Investigadas as duas telas (`app/m/financeiro/page.tsx`, `app/m/publicacoes/page.tsx`) e o
  componente que a segunda usa (`components/mobile/MobilePublicationCard.tsx`, verificado sem
  nenhum hex cru/`bg-white`/`text-black` fora de token).
- **Nenhuma edição precisou** — mesmo achado do processo aberto na Rodada 1: as duas telas usam
  só `Card`/tokens semânticos (`text-concluido`/`aviso`/`urgente`, `border-t-*`), sem nenhum ícone
  próprio com contador de pendência (Financeiro usa tarja colorida por linha, não ícone+badge;
  Publicações mostra a contagem só em texto, "N não lida(s)", sem ícone ao lado) — a regra de
  emoji condicional (sino/calendário) não tem onde se aplicar aqui, e raio/paleta já herdam
  sozinhos de `.mobile-shell` desde a Rodada 1.
- Nenhum PR aberto nesta rodada — não havia nada de produto para mudar.

### Pendente desta rodada

- Nenhuma edição pendente. Em aberto, para o dono do projeto decidir: continuar o rollout pras
  ~32 rotas restantes do PWA (mesmo achado esperado — raio/paleta grátis, só emoji condicional se
  aparecer um ícone+contador novo), ou tratar isso como concluído e voltar para os itens maiores
  adiados (`painel-mestre`, site público).

## Rodada 3 — rollout completo verificado; 2 achados corrigidos

**Data:** 2026-09-11 · **Sessão:** mesma sessão, a pedido do dono do projeto ("continue o rollout
para verificar e, em seguida painel mestre e site público").

### O que foi feito

- Auditoria completa das ~34 rotas restantes de `app/m/**` e de `components/mobile/**` (via
  subagente, pra não sujar o contexto principal com grep bruto) — procurando cor hardcoded
  incompatível com `.mobile-dark`, ícone com badge de pendência sem o tratamento de emoji
  condicional, e qualquer outro estilo dependente implicitamente do tema claro.
- **2 achados reais, os dois da mesma classe de bug do PR #174** (variável que não retemea
  porque herdava do tema do SITE em vez do PWA):
  1. `--fonte-pje` (filete lateral da publicação por fonte, `border-l-fonte-pje` em
     `MobilePublicationsList.tsx`) não estava redefinido em `.mobile-shell`/`.mobile-dark` —
     corrigido, mesmos valores do site (`#2f6fb0` claro / `#93c0f0` escuro).
  2. 3 ocorrências idênticas de `bg-white/60 dark:bg-white/5` (nota decorativa em formulário —
     `MobileLancarHonorariosForm.tsx` ×2, `MobileSettleForm.tsx` ×1) usando a variante `dark:` do
     Tailwind, que responde à classe `.dark` do SITE (`tailwind.config.ts` → `darkMode: "class"`),
     não à `.mobile-dark` do PWA — ficaria sempre um branco lavado sobre o fundo Dracula. Trocado
     por `bg-sf-apoio` (token que já retemea sozinho), mesma convenção do resto do formulário.
- **Nada mais para corrigir**: nenhum hex cru em todo `app/m/**`/`components/mobile/**`; nenhum
  outro ícone com contador de pendência fora do sino/calendário já tratados; cores por
  usuário/pessoa (avatar) e `style` inline de layout (safe-area, `calc(100dvh...)`) confirmados
  como não relacionados a tema. Raio 2px e paleta continuam automáticos em todo o resto — nenhuma
  tela precisou de edição própria (mesmo achado do processo aberto/Financeiro/Publicações).
- **Gap conhecido, sem ação nesta rodada**: `--ouro-acento` também difere entre `:root`/`.dark` e
  não está redefinido em `.mobile-shell` — mas nenhum componente mobile usa esse token hoje.
  Registrado aqui para quando (se) algum componente mobile passar a usá-lo.
- Verificação técnica local isolada, mergeada — ver PR abaixo.

### Pendente desta rodada

- Nenhuma. **Rollout do PWA Noturno concluído** — casca, Painel, processo aberto e os 2 achados
  da auditoria cobrem 100% do `app/m/*` hoje (o resto herda automaticamente, sem gap conhecido
  restante). Próximo passo: Painel Mestre e site público, cada um como sessão própria de
  `grilling` antes de propor qualquer coisa visual — nenhum dos dois tem escopo definido ainda.
