# Andamento do plano de redesign — portal interno (pós-login)

> **Instrução permanente:** mesma convenção de `plano-adequacao/`, `plano-dinamismo/` e
> `plano-redesign/` (site público) — ler este arquivo inteiro antes de qualquer rodada,
> acrescentar bloco novo ao final, nunca reescrever um já registrado.

**Escopo:** casca do portal logado (`app/(app)/*`, rail de navegação + cabeçalho) + 3 telas —
Painel (dashboard), Publicações, tela de um processo judicial aberto (`processos/[id]`). Fora
desta rodada: `painel-mestre` (operador de plataforma) e o PWA mobile `/m` — ambos deliberadamente
adiados, não esquecidos.

**Relação com `plano-redesign/` (site):** a proposta anterior do site público foi **descartada**
pelo dono do projeto durante o `grilling` desta rodada — não representa mais a direção pretendida.
Retomar o site como uma rodada própria, depois desta, já informada pelo que sair daqui.

---

## Origem — sessão de `grilling` (`mattpocock-skills:grilling`)

**Data:** 2026-09-11. Antes de desenhar, o dono do projeto foi entrevistado (skill `/grill-me` →
`mattpocock-skills:grilling`) para não presumir o que "melhorar a visualização do portal interno"
significava. Decisões que saíram da entrevista, na ordem em que fecharam:

1. **Escopo:** casca + Painel + Publicações + um processo judicial aberto (não os 15 módulos de
   uma vez).
2. **Motivo:** visual datado + monótono/sem vida — mesma raiz do site, mas aqui é ferramenta de
   trabalho (8h/dia), não peça de marketing.
3. **Site anterior:** descartado. "Já mexa em tudo" interpretado como licença para ser ousado no
   sistema de tema desta rodada do portal (não como pedido para redesenhar o site na mesma leva —
   confirmado com o dono do projeto antes de agir).
4. **`painel-mestre` e PWA `/m`:** fora desta rodada, os dois.
5. **Referências oferecidas pelo próprio dono do projeto** (não escolhidas por mim): a extensão
   **Dracula Theme Official** (draculatheme.com) do VS Code — fundo cinza-arroxeado (`#282a36`),
   não preto puro, linhas de aba precisas; e o próprio outro SaaS dele, **CowData**
   (`C:\Projetos\CowData-Milk\frontend\app\globals.css`, lido nesta sessão) — tipografia
   Barlow + Barlow Condensed, cantos quase retos (2px, direção "Institucional" do CowData), glow
   verde-neon em ponto estratégico. Confirmado explicitamente: só a forma (tipografia, cor, linha,
   canto) é referência — nenhum conteúdo/funcionalidade do CowData entra no Lúmen.
6. **Tema padrão:** passa a ser **escuro** (aproximando o tema Noite que o Lúmen já tem,
   `#14161c`, da família Dracula), com o modo Manhã (claro) preservado como opção, não removido.
7. **Tipografia:** inicialmente cogitada manter Inter caso a fonte do CowData não fosse
   encontrada — mas foi encontrada (`globals.css` do CowData é explícito: Barlow no corpo, Barlow
   Condensed em título/número/rótulo) — pedido final do dono do projeto foi seguir essa
   aproximação real, não o Inter único do Lúmen atual.

---

## Validação visual

Artifact publicado ("Lúmen — portal noturno"):
https://claude.ai/code/artifact/6ed60db1-f543-4f4f-a3c9-136a1c82b193

**Protótipo clicável de verdade** (pedido explícito do dono do projeto), não imagem estática:
rail de navegação troca de tela ao clicar (Painel/Publicações/Processo funcionais; os demais
módulos aparecem no rail, apagados, marcados como fora desta rodada — não escondidos), a tela de
processo tem barra de abas real trocando de conteúdo (rótulos exatamente como em
`app/(app)/processos/[id]/page.tsx`: Visão Geral, Atividades, Comentários, Financeiro,
Publicações, Anexos, Protocolos, Vigilância, Anotações pessoais), e um alternador Noite/Manhã
funcional no cabeçalho troca a paleta inteira ao vivo.

---

## Rodada 0 — grilling + proposta (`$impeccable bolder+colorize+layout+typeset+animate+clarify+onboard+polish`)

**Data:** 2026-09-11 · **Sessão:** mesma sessão do plano de redesign do site — pedido direto do
dono do projeto para repetir o mesmo tipo de trabalho no portal interno, precedido por entrevista
de `grilling` (ver seção "Origem" acima).

### O que foi feito

- Fatos levantados antes de desenhar (sem perguntar ao dono do projeto o que dava pra achar
  sozinho, regra do próprio `grilling`): inventário real de `app/(app)/*` (15 módulos),
  confirmado que nenhum tinha crítica formal do Impeccable ainda; `components/NavRail.tsx` lido
  para os itens reais do rail; `app/(app)/painel/page.tsx` lido para a estrutura real do
  dashboard (fila de hoje, atrasados, saudação por hora); `app/(app)/processos/[id]/page.tsx`
  lido para os 9 rótulos reais de aba do processo; `app/globals.css` do Lúmen lido para o tema
  Noite existente (`#14161c`) antes de decidir "aproximar do Dracula" em vez de inventar um
  terceiro tema do zero.
- Fatos externos levantados a pedido do próprio dono do projeto: `settings.json` do VS Code local
  (confirmado tema `Dracula Theme Official`, sem fonte customizada) e
  `CowData-Milk/frontend/app/globals.css` lido por inteiro (tipografia Barlow/Barlow Condensed,
  paleta vinho+dourado com tons escuros via `color-mix`, raio 2px, glow verde-neon reservado).
- Protótipo publicado com os 3 tokens de mudança de sistema explícitos e documentados no próprio
  artefato (painel "Mapeado por comando"): (1) tema escuro por padrão aproximado do Dracula,
  Manhã preservado como opção; (2) tipografia Barlow (corpo) + Barlow Condensed (número/rótulo/
  aba); (3) escala de raio quase reta (2px) substituindo a atual (4/6/10px) **nesta proposta** —
  as três são decisões de sistema (`DESIGN.md`), não de uma tela isolada, e ficam marcadas como
  tal para confirmação antes de qualquer implementação real.
- Estado/marca preservados sem alteração: Bordô Editorial como única cor de ação, tríade
  urgente/aviso/concluído, régua em vez de sombra — só a atmosfera (fundo, linha, canto, fonte)
  mudou, não o vocabulário de cor que já carrega significado.

### Pendente desta rodada

- **Nenhum código de produto foi alterado** — só pesquisa (interna e nos dois projetos citados),
  o protótipo e este registro.
- **Aguardando validação do dono do projeto no artefato.** Em especial, confirmar antes de
  implementar: (1) trocar o padrão de tema de Manhã para Noite afeta a primeira impressão de
  todo usuário existente — decisão de produto, não só visual; (2) mudar a escala de raio de
  4/6/10px para 2px é uma reescrita de `DESIGN.md`, não uma exceção pontual — se aprovado, o
  arquivo precisa ser atualizado junto com a implementação, não depois.
- Retomar o plano do site (`plano-redesign/`) como rodada própria depois desta, incorporando o
  que for aprendido aqui (ex.: se a tipografia Barlow/Barlow Condensed for aprovada pro portal,
  decidir separadamente se o site também adota ou fica em Inter).

## Rodada 1 — P1 implementado (fundação: fontes, tokens, tema próprio)

**Data:** 2026-09-11 · **Sessão:** mesma sessão da Rodada 0, a pedido do dono do projeto
("comece a implementação... passo a passo").

### O que foi feito

- **P1 implementado** conforme `roteiro-portal.md`:
  - `lib/portalTheme.ts` (novo): mecanismo de tema do portal, chave `rp-portal-theme`, padrão
    `"dark"`, independente de `lib/theme.ts` (site) e do app mobile — mesmo padrão dos dois já
    serem independentes entre si.
  - `app/(app)/layout.tsx`: Barlow/Barlow Condensed carregadas via `next/font/google`, escopadas
    a este layout aninhado (Inter do site intocado); `<AppShell>` envolvido num wrapper
    `#portal-shell` (`suppressHydrationWarning`, mesma técnica de anti-flash do tema do site,
    adaptada pra um nó que não é `<html>`/`<body>`) com o script `PORTAL_THEME_INIT_SCRIPT`.
  - `app/globals.css`: novo bloco `.portal-shell`/`.portal-shell.portal-light`, auto-contido
    (redeclara os tokens que variam por tema; os que não variam em tema nenhum do produto —
    bordô, vinho, ouro-acento — continuam herdando de `:root`). `--font-sans` redefinido dentro
    do escopo pra Barlow — todo componente que já herda a fonte do corpo troca sozinho, zero
    edição arquivo a arquivo.
  - `tailwind.config.ts`: token novo `font-display` (Barlow Condensed), só resolve dentro de
    `.portal-shell`.
  - `DESIGN.md`: nova seção "Portal Noturno — escopo `app/(app)/*`", documentando o desvio como
    exceção legítima (mesmo padrão da fonte do blog e da escala do site) — feito no mesmo PR da
    implementação, não depois.
- Verificação técnica local isolada (`git stash push -u --keep-index` de tudo mais que já estava
  em andamento no working tree — `docs/gauntlet/*`, `lib/roboBridge.ts`, `components/
  BancadaMenu.tsx` etc., restaurado intacto depois via `git stash pop`): `rm -rf .next && tsc
  --noEmit -p .` limpo, `eslint` nos arquivos alterados limpo, `next build` **exit 0**.
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`,
  inclusive para `DESIGN.md`), PR **https://github.com/rodartepradoadvogados/Lumen/pull/167**,
  branch `feat/portal-p1-fundacao` removida (local + remoto). `main` sincronizado via
  fast-forward (não `reset --hard` — bloqueado pelo classifier de permissão da sessão por ser
  comando destrutivo; `git merge --ff-only` serviu igual, sem risco).
- **Efeito colateral já ativo em produção a partir deste merge:** os 12 módulos de `app/(app)/*`
  ainda não redesenhados (P2-P5) já herdam a paleta escura/fonte Barlow/tema padrão Noite —
  documentado em `DESIGN.md` e no roteiro como esperado, não regressão. Só não ganham o raio
  quase reto ainda (é por componente).

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P2** (rail + cabeçalho com o alternador
  Noite/Manhã de verdade) — `components/NavRail.tsx`, `app/(app)/layout.tsx` (topbar).
