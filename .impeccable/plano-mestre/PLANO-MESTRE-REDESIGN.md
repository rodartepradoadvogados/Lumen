# Lúmen — Plano Mestre de Redesign

**Documento operacional.** Qualquer agente que abrir este arquivo deve conseguir, só com ele, saber
onde o trabalho parou, o que fazer em seguida, como fazer e como registrar o que fez. Se você chegou
aqui sem contexto: leia as seções 0 a 3, olhe o **Bloco de Estado** logo abaixo, e vá para a fase
indicada.

---

## ▣ BLOCO DE ESTADO — leia isto primeiro

| Campo | Valor |
|---|---|
| **Fase atual** | **TODAS AS FASES CONCLUÍDAS** (F0–F9, com a F6 fechada em 2026-09-17) **e a conferência visual do dono também** (seção 10-C). Aberto: só o acesso ao banco a partir deste ambiente |
| **Próximo passo concreto** | **O acesso ao banco a partir deste ambiente.** O TCP/5432 é bloqueado pela política de rede, mas o endpoint HTTP da Neon responde 200 daqui — falta o adaptador HTTP do Prisma para que `next start`, o build do `/blog` e a navegação real com Chromium passem a funcionar. É o que separa "verificado por lint e build" de "verificado na tela" |
| **Superfície-âncora da direção visual** | Portal/SaaS (`app/(app)/*`) — contrato gravado em `.impeccable/surfaces/app-app.md`, seed `2cac85b3`, candidato 4 de 7 |
| **Comandos executados** | 15 dos 24 fluxos (`context`, `init`, `critique`, `shape`, `new-work`, `colorize`, `typeset`, `layout`, `extract`, `distill`, `clarify`, `adapt`, `audit`, `bolder`, `animate`) + 3 scripts de apoio (`detect`, `concept-seed`, `surface-brief`). `audit` já rodou no site público (PR #203); falta nas outras 4 superfícies — ver seção 10 |
| **Superfícies redesenhadas** | Portal: casca, `/painel`, `/processos/[id]`, `/publicacoes` e `/alertas` — as quatro telas de uso diário. As 5 superfícies já estão no mundo novo de cor, tipo e raio (fundação F3) |
| **Última atualização** | 2026-09-17 · Claude (sessão `session_01QkwT3jkWwpUJLEQcdNbS2C`) |
| **Bloqueios abertos** | Nenhum bloqueio. Pendências: (a) **F6 · o resto do PWA**; (b) **sem rota até o Neon a partir deste ambiente** — `/blog` não constrói aqui (119 de 120 páginas em toda entrega) e nenhuma verificação roda contra a tela renderizada, que é a causa de fundo dos quinze apontamentos da conferência. As duas pendências antigas caíram: o `audit` das outras quatro superfícies foi o PR #218 e a conferência visual aconteceu (seção 10-C) |

---

## 0. Como usar este documento

1. **Leia o Bloco de Estado** acima. Ele diz a fase e o próximo passo.
2. **Leia as seções 1 (protocolo), 2 (estado verificado) e 3 (decisões do dono).** A seção 3 é a que
   mais evita retrabalho: são decisões já tomadas pelo dono do produto, algumas contraintuitivas.
3. **Vá para a fase indicada** na seção 6 e execute o que está escrito lá.
4. **Ao terminar qualquer bloco de trabalho, atualize este documento** — como fazer isso está na
   seção 12. Um trabalho feito e não registrado aqui será refeito por outro agente.

Este plano **não substitui** a skill. Os comandos e suas regras vivem em
`.claude/skills/impeccable/` — este documento diz *o quê, onde, em que ordem e por quê*; a skill diz
*como*.

---

## 1. Protocolo de trabalho — regras invioláveis

**Antes de qualquer coisa, uma vez por sessão:**

```bash
cd <raiz do repositório lumen>
sh .claude/skills/impeccable/scripts/impeccable context
```

Rode **uma vez só** e siga as diretivas que ele imprimir. Se ele falhar, a própria skill manda enviar
uma mensagem separada antes da próxima chamada de ferramenta — *"Context loading did not run; I'll
read the existing project context directly"* — e seguir lendo PRODUCT.md e DESIGN.md sem inventar
contexto. Falha do launcher **não** bloqueia planejamento nem edição.

**Regras que a skill impõe e que este plano adota literalmente:**

| Regra | Onde está escrito | Consequência prática aqui |
|---|---|---|
| Ler `reference/craft-floor.md` **imediatamente antes de qualquer edição de UI**, inclusive refinamento pequeno | SKILL.md §Setup passo 3 | Não é opcional. Mas **não** carregue em trabalho só de planejamento |
| Ler `reference/operate.md` em superfície de produto | SKILL.md §Modes | Obrigatório para Portal, PWA e Painel Mestre |
| O mundo visual é decidido **uma vez** | `new-work.md` §3 | A rodada de direção roda só na superfície-âncora. As outras 4 herdam. Repetir o torneio 5× é erro |
| Tudo desemboca em `polish` | 13 arquivos de referência | Nenhuma superfície é considerada pronta sem o `polish` final |
| `critique` grava snapshot; `polish` consome e fecha | `critique.md` / `polish.md` | Use `impeccable critique-storage latest` e `... close` |
| Nunca reparar drift como efeito colateral | SKILL.md §final | Achado `CONTEXT_STALE` é **reportado**, não corrigido, salvo se o dono pedir |
| Verificar em passes limitados, não em loop | SKILL.md §Core principles | Construa tudo → inspecione uma vez em lote → corrija tudo → no máximo mais uma confirmação → pare |

**Sub-agentes disponíveis** (`.claude/agents/impeccable-*.md`), a serem usados nos gatilhos certos:
`asset-producer` (rasters/comps), `documenter` (reescreve DESIGN.md **no fim** de um `new-work`),
`finish-reviewer` (roda **fresco**, sem herdar a conversa do build, depois da 2ª rodada de inspeção;
devolve `disposition: recapture|rebuild|fix|ship` e o pai reporta o verbo **literalmente**), e
`manual-edit-applier` (só dentro do `live`).

---

## 2. Estado verificado do projeto — 2026-09-16

**Produto:** Lúmen, SaaS jurídico multi-inquilino. Next.js 14 App Router · Prisma/Postgres (Neon) ·
Vercel · isolamento por `officeId` · `prisma db push` puro (sem migrações versionadas).

**Impeccable:** v4.3.1 instalada em `.claude/skills/impeccable/`. Launcher **funciona** neste
ambiente (binário em `~/.impeccable/bin/0.1.5/`). `impeccable help` lista **24 comandos**.

**Artefatos do Impeccable, hoje:**

| Artefato | Estado |
|---|---|
| `PRODUCT.md` | ✅ **Criado em 2026-09-16** pelo `init` (não existia — existia só na máquina Windows do dono, nunca commitado) |
| `DESIGN.md` | Existe, 484 linhas, descreve o mundo visual **atual** ("O Arquivo Vivo", bordô `#8a2f42`, Inter). Vira **anti-referência** neste redesign |
| `.impeccable/design.json` | Existe, `schemaVersion 2`, espelho legível por máquina do DESIGN.md |
| `.impeccable/config.json` | ✅ **Criado em 2026-09-16**: `buildPath: "code"` |
| `.impeccable/live/config.json` | Existe e completo (Next.js App Router, `cspChecked: true`) — `live` já configurado |
| Surface briefs | ❌ Não existem. Nenhum *direction contract* foi gravado até hoje |
| `.impeccable/critique/` | 2 snapshots de 2026-09-10 — servem de **linha de base** (ver abaixo) |

**Linha de base medida (2026-09-10), para comparar no fim:**

- Site público: **19/32 (59%)** — veredito: *"a especificidade vive inteiramente nas palavras, não na
  composição"*; esqueleto de template B2B SaaS.
- PWA: **23/40 (58%)** — veredito: *"o redesign não foi realizado além da camada de navegação"*.

**Trabalho anterior (7 planos em `.impeccable/plano-*`):** adequação (concluída, PRs #144-#166),
portal noturno (concluído, PRs #167-#172), PWA (concluído, PRs #173-#174), painel mestre (concluído,
PR #176), site público (implementado no PR #178 — **nunca verificado visualmente**), redesign "pulso"
(descartado), dinamismo D1-D8 (**escrito, nunca mostrado ao dono, nunca implementado**).

**Dívidas registradas que este plano herda:**

1. `--tx-3` reprova WCAG AA (~2,6-2,9:1) — estava congelado esperando decisão do dono. **Desbloqueado
   em 2026-09-16.**
2. Seis classes de input duplicadas no desktop (`.fin-input`, `.cfg-input`, `.fp-input`, `.pr-input`,
   `.doc-input`, `.lic-input`), com raio 5px fora de escala. Candidatas ao `extract`.
3. Piso de 13px do PWA não tem regra checável — risco de regressão silenciosa.
4. `--ouro-acento` não está redefinido em `.mobile-shell` — quebra se algum componente mobile usar.
5. A home pública (PR #178) nunca passou por verificação visual real no navegador.

---

## 3. Decisões do dono — o que não pode ser atropelado

**Tomadas nesta sessão (2026-09-16):**

| # | Decisão | Efeito no plano |
|---|---|---|
| D-01 | **Redesign completo**, não refinamento. Pode trocar cor de marca, tipografia e temas | O visual atual é **evidência e anti-referência**. `new-work` nível "criar ou substituir o mundo". Nunca "meio-termo polindo o visual descartado" |
| D-02 | **Os dois temas precisam ficar impecáveis**; o padrão de cada superfície continua como está (Portal e Painel Mestre escuros; PWA e site claros) | Não unificar os 4 mecanismos de tema num só. O trabalho é qualidade nos dois lados, não padronização de qual abre primeiro |
| D-03 | Depois da fundação, **SaaS/portal primeiro** | Define a ordem de F4 a F7 e a escolha da superfície-âncora |
| D-04 | Usuário prioritário no desempate: **o advogado dono/sócio** | Visão geral, confiança e controle antes de densidade e atalho |
| D-05 | Diferenciais: **documentos no Drive do próprio cliente** + **assessoria empresarial de primeira classe** | São os dois eixos que o site público precisa provar |
| D-06 | **Não existe prova social real** — sem depoimento, sem número comprovável, sem foto. Só capturas do produto | Proibido inventar depoimento, logo de cliente ou número de tração |
| D-07 | **WCAG AA como piso**, com autorização explícita para mexer nos tokens de texto que reprovam, mesmo mudando o visual | Desbloqueia a dívida do `--tx-3` |
| D-08 | **Construir com código + mockup HTML clicável** para aprovação prévia | `buildPath: "code"`. Nenhuma superfície vai para produção sem o dono ver antes |

**Decisões anteriores que continuam valendo até ele dizer o contrário:**

| # | Decisão | Origem |
|---|---|---|
| D-09 | Preço "recomendado" é configurável no Painel Mestre, **nunca fixo no código** | Requisito dele, já no schema |
| D-10 | "Mais detalhes" no atendimento é **botão com destaque real**, não texto discreto | Validação de 2026-09-10 |
| D-11 | Emoji condicional no PWA (🔔/📅 **só quando há pendência de verdade**) | *"o ícone do sino amarelo eu gostei. mantenha."* |
| D-12 | Financeiro Lúmen **não** ganha DRE/Fluxo de Caixa; Assinaturas é sub-aba, não página | Decisão de escopo do Painel Mestre |
| D-13 | Geometria pura, sozinha, ele **já rejeitou**: *"gostei só achei muito geométrico. As partes sem imagens precisam ser preenchidas de alguma forma"* | A resposta aceita foi textura/densidade, **não** foto nem ilustração decorativa |

**Histórico de reprovação que o plano existe para não repetir:**

> Em 2026-09-11 a tipografia Barlow/Barlow Condensed foi implementada em 5 telas e **só então**
> mostrada. Resposta do dono: **"Vamos regressar à Tipografia anterior, INTER. Essa não ficou boa."**
> Custou um PR de reversão inteiro. **Por isso D-08 existe: nada de tipografia, cor ou layout novo
> chega implementado antes de ser visto.**

Um segundo caso: a Manhã do PWA subiu quebrada e **ele** descobriu testando (*"só tem o tema
noite"*). Lição registrada: **todo shell de tema precisa ser auto-contido**, e o gate técnico não
pega o que o olho pega.

---

## 4. Escopo — 5 superfícies, 99 rotas, ~98 sub-telas, ~60 modais-tela

| Superfície | Modo Impeccable | Rotas | Sub-telas de aba | Modais/gavetas-tela | Impressão | Tema padrão | Casca |
|---|---|---|---|---|---|---|---|
| **Site público** | Persuade | 8 | ~7 | 2 | — | Claro | sem casca |
| **Blog** | Read | 2 | 1 | 0 | — | Claro (Lora) | `blog/layout.tsx` |
| **SaaS / Portal** | Operate | 42 (+2 redirects) | ~55 | ~35 | 4 | **Escuro** | `.portal-shell` |
| **Painel Mestre** | Operate | 10 | 7 | 3 | — | **Escuro** | `.painel-mestre-shell` |
| **PWA mobile** | Operate | 37 (+2 redirects) | ~28 | ~20 | — | Claro | `.mobile-shell` |
| **Total** | — | **99** | **~98** | **~60** | **4** | 4 temas independentes | — |

O inventário completo, rota por rota, com nome humano, abas e modais de cada tela, está em
**`.impeccable/plano-mestre/inventario-telas.md`**. Ele é a lista de verificação de cobertura: nenhuma
superfície é dada como concluída sem que todas as suas linhas tenham sido vistas.

**Telas de maior densidade (atacar primeiro dentro de cada superfície):** `/processos/[id]` (9 abas)
· `/assessoria/[id]` (7 abas) · `/relatorios` (6 seções) · `/configuracoes` (6 seções + 3 sub-abas) ·
`/painel-mestre/[officeId]` (5 abas) · `/publicacoes` (4 chips).

**Armadilhas estruturais já mapeadas:**

- `/peticionar` e `/reuniao/[id]` são autenticadas mas ficam **fora** da casca do portal — herdam o
  tema claro do site. Descontinuidade visual real hoje.
- As 4 folhas de impressão não têm `@media print` global; o comportamento vem de
  `components/relatorios/FolhaImprimivel.tsx`.
- Telas-substitutas de bloqueio (`ModuleDisabledNotice`, `AccessRestrictedNotice`,
  `OfficeSuspendedNotice`) ocupam a tela inteira e precisam entrar no redesign.

---

## 5. Estratégia — por que esta ordem

O produto tem 99 rotas e 4 temas. Redesenhar tela a tela seria caro e incoerente. A tese deste plano
é: **decidir pouco e cedo, aplicar muito e depois.**

1. **O mundo visual se decide uma vez, na superfície mais difícil.** A âncora é o **Portal**, não o
   site público — porque Operate é onde as restrições são mais duras (densidade, escaneabilidade,
   estado, 8h/dia). Uma direção que sobrevive ao Portal se estende com folga ao site; o contrário não
   é verdade. Isso também é o que a própria skill manda (`new-work` §3: seção/tela dentro de
   superfície estabelecida **herda** o mundo).

2. **A fundação vem antes das telas.** Tipografia, cor, contraste e ritmo são resolvidos nos tokens e
   nos 4 shells de tema — não em 99 arquivos. É o único jeito de a queixa de "fonte, modo claro,
   detalhes coloridos, hierarquia" ser resolvida de uma vez.

3. **Diagnóstico antes de direção.** Não dá para saber o que substituir sem medir o que existe. F1
   produz nota por superfície; no fim, F9 compara com a mesma régua.

4. **Nada implementado antes de visto** (D-08). Cada superfície tem um mockup clicável aprovado antes
   do código.

5. **Movimento por último.** Animação sobre um layout que ainda vai mudar é trabalho jogado fora.

---

## 6. As fases

### F0 — Fundação de contexto ✅ CONCLUÍDA (2026-09-16)

| Passo | Comando | Estado |
|---|---|---|
| Carregar contexto | `impeccable context` | ✅ rodado; diretivas `NO_PRODUCT_MD`, `BUILD_INIT_REQUIRED`, `EXISTING_VISUAL_SYSTEM` capturadas |
| Verdade de produto | **`init`** | ✅ `PRODUCT.md` criado com entrevista do dono |
| Caminho de construção | (passo 5 do `init`) | ✅ `.impeccable/config.json` → `buildPath: "code"` |
| Live mode | (passo 5 do `init`) | ✅ já configurado, deixado intocado |

### F1 — Diagnóstico completo ✅ CONCLUÍDA (2026-09-16)

**Objetivo:** medir o que existe, em todas as superfícies, antes de decidir o que substituir.

| Passo | Comando | Alvo | Saída |
|---|---|---|---|
| 1 | **`document`** (responder **refresh**) | projeto | Congela o mundo atual como referência/anti-referência. A skill manda isso explicitamente: *"Before a large redesign, to capture the current state as a reference"*. ⚠️ Ele **pergunta** refresh/overwrite/merge — nunca sobrescreva em silêncio |
| 2 | **`critique`** × 5 | uma por superfície | Snapshot em `.impeccable/critique/`. Compare site e PWA com a linha de base de 2026-09-10 (19/32 e 23/40) |
| 3 | **`audit`** × 5 | uma por superfície | a11y, performance, theming, responsivo. Não corrige nada — só documenta |
| 4 | consolidar | — | `.impeccable/plano-mestre/diagnostico/<superficie>.md` com P0-P3 |

**Cobertura de "todas as telas":** o `critique` não roda 99 vezes. Rode por **arquétipo** — lista,
ficha com abas, formulário, hub, folha de impressão, modal-tela — citando nominalmente as 6 telas de
maior densidade da seção 4, e marcando no inventário cada rota coberta pelo arquétipo dela.

**Critério de conclusão:** os 5 relatórios existem, todas as rotas do inventário estão marcadas, e as
notas foram registradas na seção 10.

### F2 — A direção visual (decidida uma vez)

**Objetivo:** escolher o mundo visual novo, com o dono, antes de qualquer código de produção.

| Passo | Comando | Detalhe |
|---|---|---|
| 1 | **`shape`** | Brief confirmado do Portal (superfície-âncora). Não escreve código nem contrato |
| 2 | **`new-work`** nível *criar ou substituir o mundo* | Mecanismo em 1 frase → rut da categoria → **7 sistemas visuais** do mundo cultural da audiência, em ≥3 famílias materiais → direções completas → `impeccable concept-seed --scope direction` (**contrato: sem substituto, sem pular**) → 1 direção comprometida + challengers + IMPECCABLE'S PICK + re-roll |
| 3 | Mockup | HTML clicável com as 2 telas mais densas do Portal (`/painel` e `/processos/[id]`), **nos dois temas** (D-02) |
| 4 | Aprovação do dono | Obrigatória (D-08). Registrar textualmente na seção 11 |
| 5 | Contrato | `impeccable surface-brief write` com o `## Direction contract` (THESIS, OWN-WORLD, STORY, FIRST VIEWPORT, FORM, FINISH) |

**Regras que valem aqui e em nenhum outro lugar:** durante uma rodada de direção aberta, as palavras
*bolder* e *safer* significam **registros de re-roll**, não os comandos `bolder`/`harden`.

**Entradas obrigatórias para a conversa de direção:**
- O que o dono **já rejeitou**: geometria pura sozinha (D-13), Barlow.
- O que ele **já aprovou e nunca foi questionado**: raio quase reto (2px), contenção geométrica,
  textura/grão como resposta ao vazio.
- O único feedback dele sobre modo claro: *"tema claro pode ser tudo um pouco mais escuro, como se
  fosse um misto entre o claro e o escuro, sem perder a harmonia das cores"* — hoje aplicado **só** ao
  Painel Mestre (`#b3aebc`). Levar isso como hipótese forte para as outras 3 superfícies.
- O que evitar, pesquisado em 2026-09-11: o padrão AdvBox/Astrea/Projuris (azul corporativo,
  carrossel de depoimento, parede de números, grade de 4 ícones, tabela comparativa).

**Critério de conclusão:** direction contract gravado + mockup aprovado por escrito.

### F3 — Fundação do sistema (tokens e temas)

**Objetivo:** aplicar o mundo novo onde ele alcança 99 rotas de uma vez.

| Comando | Alvo |
|---|---|
| **`colorize`** | Papéis de cor (canvas, superfície, texto, ação/foco/seleção, borda, semântica) nos 4 shells. Em Operate a cor codifica ação/estado, nunca decora |
| **`typeset`** | Escala de papéis fixa em `rem` (Operate não usa `clamp`), medida 45-75ch, fallback métrico, carregamento |
| **`layout`** | Ritmo, densidade e hierarquia no nível do sistema |
| **`extract`** | Consolidar as 6 classes de input duplicadas (dívida #2) e o que mais o diagnóstico apontar |

**Não negociável nesta fase:** `--tx-3` e qualquer token de texto que reprove em AA são corrigidos
(D-07). Os 4 shells continuam auto-contidos — nenhum herda `.dark` de outro (lição do PR #174).

**Critério de conclusão:** 1 PR de fundação verificado nas 5 superfícies, nos 2 temas, sem regressão.

### F4 — Portal / SaaS (42 rotas) — a superfície-âncora

Ordem por módulo: **Painel e Agenda** → **Jurídico** (Processos, Assessoria) → **Comunicação**
(Publicações, Atendimento, Contatos) → **Financeiro** → **Gestão** (Relatórios, Configurações,
Conexões, Perfil) → **as 4 folhas de impressão** → **`/peticionar` e `/reuniao/[id]`** (hoje órfãs da
casca).

Comandos por bloco: **`layout`** · **`distill`** (densidade: nunca card dentro de card, 1 ação
primária) · **`clarify`** (⚠️ perguntar antes de mudar termo jurídico — ver Terminologia no
PRODUCT.md) · **`onboard`** (estados vazios e primeiro uso) · **`harden`**.

Leitura obrigatória: `operate.md`. Fecha com **`polish`** e uma rodada de `finish-reviewer`.

### F5 — Site público + Blog

| Comando | Por quê |
|---|---|
| **`bolder`** | A única superfície onde ele cabe. O veredito da crítica foi que a composição é template genérico |
| **`animate`** | **Os 8 itens D1-D8 já estão escritos** em `.impeccable/plano-dinamismo/roteiro-dinamismo.md` e nunca foram mostrados ao dono. Leve-os para validação antes de inventar outros |
| **`delight`** | Personalidade em momentos que merecem |
| **`clarify`** | Copy de conversão, sem prova social inventada (D-06) |
| **`quieter`** | Só se o `bolder` passar do ponto |

Blog é **Read**, não Persuade: estrutura para compreensão primeiro.

### F6 — PWA mobile (37 rotas)

**`adapt`** é o protagonista (contexto: rua, fórum, luz forte, uma mão). Depois **`layout`**,
**`harden`**, **`onboard`**. Preservar: piso de 13px, alvo de toque de 44px, emoji condicional
(D-11). Corrigir a dívida #4 (`--ouro-acento` ausente no `.mobile-shell`).

### F7 — Painel Mestre (10 rotas)

Herda tudo. **`layout`** + **`distill`** + **`clarify`**. A queixa original dele aqui
(*"navegabilidade difícil, pouco aproveitamento de espaço"*) já foi resolvida uma vez com layout
largo + abas reais; manter esse padrão.

### F8 — Movimento, robustez e acabamento

| Comando | Aplicação |
|---|---|
| **`animate`** | Em Operate: feedback, estado, continuidade. **Proibido** sequência orquestrada de carregamento de página |
| **`delight`** | Em Operate: concentrar em primeiro uso, conclusão, recuperação e maestria |
| **`overdrive`** | Em Operate **não é partícula, é façanha**: tabela de 100k linhas a 60fps, busca que filtra sem flicker, diálogo que morfa do botão. Exige propor 2-3 direções e obter escolha do dono antes de escrever código |
| **`harden`** | Texto extremo, 1000+ itens, falha de rede, 400/401/403/404/500, overflow |
| **`optimize`** | Medir antes e depois. Não otimizar o que não está lento |
| **`audit`** 2ª rodada | Comparar com F1 |
| **`polish`** | Por superfície. Fecha os snapshots de `critique` |
| **`critique`** 2ª rodada | Comparar nota com a linha de base |
| **`live`** | **Opcional e presencial** — exige servidor de dev, navegador e o dono clicando. Nunca no caminho crítico |

### F9 — Consolidação ✅ CONCLUÍDA (2026-09-17) — e depois dela, a **conferência visual** do dono, que fecha a F8 ◀ **VOCÊ ESTÁ AQUI**

- **`documenter`** (sub-agente) reescreve `DESIGN.md` + `.impeccable/design.json` a partir do que foi
  construído — **não** do que foi planejado. Mundo novo exige tokens, não só prosa.
- **`extract`** final para o drift que apareceu entre superfícies.
- `/impeccable hooks on` para o detector automático.
- `/impeccable doctor` para relatório final de drift.
- Atualizar este documento (seção 12) e arquivar os 7 planos antigos como histórico.

---

## 7. Matriz — os 24 comandos e onde cada um entra

| # | Comando | Fase | Superfície(s) | Observação |
|---|---|---|---|---|
| 1 | `/impeccable` | todas | — | Roteador. Sem argumento, apresenta menu; nunca auto-executa |
| 2 | `init` | **F0 ✅** | projeto | Uma vez por projeto. Já feito |
| 3 | `document` | F1, F9 | projeto | F1 em *refresh* (anti-referência); F9 pelo `documenter` |
| 4 | `shape` | F2 | Portal | Brief confirmado, sem código |
| 5 | `craft` | — | — | **Alias depreciado** de new-work. Não usar; registrado por completude |
| 6 | `critique` | F1, F8 | 5 | Linha de base e comparação final |
| 7 | `audit` | F1, F8 | 5 | Técnico, não corrige |
| 8 | `colorize` | F3, F4-F7 | sistema + telas | Em Operate: codifica, não decora |
| 9 | `typeset` | F3 | sistema | Escala fixa em rem |
| 10 | `layout` | F3, F4-F7 | sistema + 5 | O grosso da queixa de hierarquia |
| 11 | `extract` | F3, F9 | sistema | Inputs duplicados, drift |
| 12 | `distill` | F4, F7 | Portal, Painel | Densidade do produto |
| 13 | `clarify` | F4, F5, F6, F7 | 5 | ⚠️ termo jurídico só com consulta |
| 14 | `onboard` | F4, F6 | Portal, PWA | Estados vazios, primeiro uso |
| 15 | `adapt` | F6, F8 | PWA + 5 | Protagonista do mobile |
| 16 | `bolder` | F5 | Site, Blog | **Só aqui** — em Operate ele briga com "earned familiarity" |
| 17 | `quieter` | F5, sob demanda | qualquer | Se algo passar do ponto |
| 18 | `animate` | F5, F8 | 5 | D1-D8 já escritos, nunca validados |
| 19 | `delight` | F5, F8 | 5 | Em Operate: momentos, não decoração |
| 20 | `overdrive` | F8 | Portal, Site | Em Operate = performance; exige 2-3 direções e escolha do dono |
| 21 | `harden` | F4, F6, F8 | 5 | Produção de verdade |
| 22 | `optimize` | F8 | 5 | Medir antes e depois |
| 23 | `polish` | F4-F8 | 5 | **Todo caminho termina aqui** |
| 24 | `live` | F8 | qualquer | Opcional, presencial, fora do caminho crítico |

**Verbos de manutenção** (`/impeccable <verbo>`, não contam como comandos): `doctor` (relatório de
drift — F9), `hooks` (detector automático — F9), `pin`/`unpin` (atalhos), `context` (boot de sessão).

---

## 8. Protocolo de entrega

O `CLAUDE.md` deste repositório dá **autorização permanente** para o Claude mergear os próprios PRs,
sem aprovação manual, desde que a verificação local passe limpa. Não há CI — a verificação **é** o
gate.

```bash
git fetch origin main -q && git log -1 --oneline origin/main   # nunca assumir checkout atualizado
git checkout -b <branch-descritiva>
# ... trabalho ...
rm -rf .next && npx tsc --noEmit -p .
npx eslint <arquivos alterados>
npx next build
git commit   # mensagem em português: causa raiz, impacto, correção
git push -u origin <branch>
# abrir PR, aguardar status, mergear, confirmar deploy, sincronizar main
```

Regras: commit e PR em **português**; avisar o dono depois do merge (não pedir permissão antes);
**um PR por bloco de trabalho**, nunca um PR gigante por fase.

---

## 9. Limitações do ambiente (para o agente não perder tempo)

| Limitação | Consequência |
|---|---|
| **Sem acesso ao banco Neon** a partir do sandbox | `npx next build` **sempre** falha em `/blog` com `PrismaClientInitializationError`. As 119 páginas restantes compilam. **Isso é ambiental, não regressão** — já provado stashando tudo e reproduzindo em `main` limpo |
| Servidor de dev sem dados | `npm run dev` sobe, mas telas que consultam o banco quebram. Screenshot com dado real só na máquina do dono |
| `live` precisa de 3 coisas ao mesmo tempo | Servidor de dev + navegador controlável + uma pessoa clicando. Tratar como etapa presencial |
| Verificação visual real | O dono **testa de verdade** e já pegou dois defeitos que o gate técnico não pegou. Peça a verificação dele antes de dar uma superfície como pronta |

---

## 10. Registro de progresso

Legenda: ⬜ pendente · 🔄 em andamento · ✅ concluído · ⏭️ pulado (com motivo)

| Fase | Bloco | Comandos | Estado | PR | Data | Nota |
|---|---|---|---|---|---|---|
| F0 | Contexto e verdade de produto | `context`, `init` | ✅ | — | 2026-09-16 | `PRODUCT.md` e `config.json` criados |
| F1 | Congelar mundo atual | `document` (refresh) | ⏭️ | — | 2026-09-16 | **Pulado com motivo:** os 4 relatórios de diagnóstico congelam o mundo atual com muito mais detalhe do que um refresh do DESIGN.md, e o DESIGN.md é reescrito do zero em F9. Para não deixar ficção no lugar, o DESIGN.md ganhou um aviso no topo apontando a rampa real medida |
| F1 | Diagnóstico mecânico (5 superfícies) | `detect` | ✅ | #186 | 2026-09-16 | 1.078 achados · 263 arquivos · **93% é tipografia**; 73% mora em `components/**` |
| F1 | Diagnóstico site público + blog | `critique` | ✅ | #186 | 2026-09-16 | Os 2 diferenciais do produto **não estão na landing**; blog é beco sem saída |
| F1 | Diagnóstico Portal | `critique` | ✅ | #186 | 2026-09-16 | Rail = mapa do banco; 6 ícones → 5 destinos; nada entre 15px e 24px |
| F1 | Diagnóstico PWA + Painel Mestre | `critique` | ✅ | #186 | 2026-09-16 | Piso de 13px vaza por componente compartilhado; `text-white` invisível no claro |
| F1 | Consolidação e cobertura | — | ✅ | #186 | 2026-09-16 | `diagnostico/README.md` + seção 7 do inventário: **99 rotas cobertas** |
| F5 | **`audit` do site público** | `audit` | ✅ | #203 | 2026-09-16 | **Primeira passagem própria de `audit` do projeto.** Nota 12/20. Achado central: oito campos de formulário sem `<label>` em toda a superfície pública |
| F1 | `audit` das outras 4 superfícies | `audit` | ✅ | #218 | 2026-09-17 | Rodado junto com a F8, como previsto nesta linha. Ver a linha F8a abaixo: **18/20**, nenhum P0. Esta linha ficou marcada como pendente por duas semanas depois de o trabalho existir — a escrituração é que estava atrasada, não a entrega |
| F2 | Brief do Portal | `shape` | ✅ | #187 | 2026-09-16 | Contrato de direção em `.impeccable/surfaces/app-app.md`, seis blocos + seed |
| F2 | Rodada de direção | `new-work`, `concept-seed` | ✅ | #187 | 2026-09-16 | Seed `2cac85b3`, designado 4 de 7 → **“Guias”**. 2 competitivos, 4 declinados, 6 elevações nomeadas |
| F2 | Mockup clicável | — | ✅ | #187 | 2026-09-16 | 5 telas do Portal + 4 do app, dois temas, contraste medido. Pedido do dono ampliou o escopo (o plano previa 2 telas) |
| F2 | **Aprovação do dono** | — | ✅ | — | 2026-09-16 | **"Aprovada a direção."** Gate fechado |
| F3 | Rampa tipográfica | `typeset` | ✅ | #190 | 2026-09-16 | 6 paradas em rem, piso de 12px; **1.064 tamanhos arbitrários migrados** em 250 arquivos; escala do Tailwind reapontada; regra de lint |
| F3 | Paleta e temas | `colorize` | ✅ | #190 | 2026-09-16 | 66 tokens × 8 cascas, **todas auto-contidas** — o vazamento de 9 a 14 tokens por casca acabou. Rail deixa de ser grafite fixo |
| F3 | Raio e ritmo | `layout` | ✅ | #190 | 2026-09-16 | Raio único de 2px; 9 dos 22 defeitos agudos corrigidos no markup; halo decorativo morto |
| F3 | Classe de campo única | `extract` | ✅ | #190 | 2026-09-16 | **23 classes de input** duplicadas (não 6) viraram uma; 39 definições locais e 36 blocos `<style>` vazios removidos |
| F3 | DESIGN.md legível por máquina | — | ✅ | #190 | 2026-09-16 | Cabeçalho reescrito a partir do construído — sem isso o detector media contra um alvo morto |
| F3b | **Conferência do dono** | — | ✅ | — | 2026-09-16 | Derrubou a paleta creme (*"impressão de coisa velha"*) e expôs dois defeitos meus: o rail que nunca retematizou e o `text-white` cravado |
| F3b | Segunda rodada de paleta | `colorize` | ✅ | #191 | 2026-09-16 | 3 propostas × 2 telas × 2 temas. Escolhida a **Ardósia** (cinza-pedra frio). Bordô volta como ação; **nenhuma faixa é vermelha** |
| F3b | O rail passa a retematizar | `colorize` | ✅ | #191 | 2026-09-16 | Tokens `--gaveta*` próprios. A escala `grafite` do Tailwind era **hex cravado** — repontar só a variável CSS não fazia nada |
| F3b | Fim do `text-white` cravado | `harden` | ✅ | #191 | 2026-09-16 | 98 linhas em 11 arquivos do Painel Mestre + aside de Configurações + campos com fundo sempre escuro |
| F4a | Casca — o rail vira mapa | `layout`, `clarify` | ✅ | #192 | 2026-09-16 | 6 ícones → 5 destinos, estado invisível, 2 ícones acesos, hub órfão, 250ms de atraso. **Contagem deixa de ser vermelha; Agenda = hoje + atrasados** (pedidos do dono) |
| F4b | Casca — o layout para de se mexer | `layout` | ✅ | #193 | 2026-09-16 | 10 larguras → **1**, numa classe só. Fade de página e cascata de lista removidos. Barra de abas com altura estável. O mesmo atraso de 250ms que restava na barra de abas |
| F4c | Portal — `/painel` | `distill`, `clarify` | ✅ | #194 | 2026-09-16 | **A tarja de risco do escritório.** Saudação, halo e grão fora; "Minhas atrasadas" vira "do escritório"; medidores em régua; "O dia" para de somar vencido com futuro |
| F4c | Rótulo sobre fundo de risco | `harden` | ✅ | #194 | 2026-09-16 | **19 arquivos** com rótulo claro cravado sobre cor de risco — invisíveis no tema escuro. Regra de lint impede a volta |
| F4d | Alertas — número e reciprocidade | `clarify` | ✅ | #195 | 2026-09-16 | Classe de Tailwind inexistente escondia o número no app (23 usos, a maioria antiga); `/alertas` passa a mostrar de que é feito o número; alerta de delegação ganha o outro lado |
| F4e | Central de Alertas quebrada | `harden` | ✅ | #196 | 2026-09-16 | Duas cópias do mapa de tipos + acesso sem guarda. Virou fonte única tipada: esquecer um tipo agora é erro de compilação. Pastilha volta a ser bordô (pedido do dono) |
| F4f | Portal — `/processos/[id]` | `distill`, `layout` | ✅ | #197 | 2026-09-16 | Faixa "pendente neste processo" em todas as abas, sem consulta nova; guias numeradas com o chanfro do sistema; natureza vira identidade neutra; excluir separado por filete |
| F4g | Os 13 filetes laterais | `extract`, `polish` | ✅ | #198 | 2026-09-16 | 9 eram recado avulso e viraram régua no topo, num componente `Aviso` só; 3 ficam **declarados no código**, porque ali o filete codifica severidade, estado ou seleção da linha. **Detector: 1.078 → 3** |
| F4h | Reorganizar anexos do Drive | `clarify` | ✅ | #199 | 2026-09-16 | **Não removido**: reorganizar MOVE arquivo fora de lugar, reconciliar não move nada. Tela agrupada por registro, com número, tribunal e cliente |
| F4i | **Fim do vermelho** | `colorize` | ✅ | #200 | 2026-09-16 | Uma família quente só (bordô), diferenciada por TRATAMENTO. **210 cores cruas do Tailwind** migradas para token, com lint que impede a volta |
| F4j | **A largura volta** | `adapt`, `layout` | ✅ | #201 | 2026-09-16 | **Correção de regressão minha:** F4b matou o deslize capando tudo em 1440px centralizado, e num monitor largo isso desperdiçava metade da tela. O quadro passa a OCUPAR a largura — igualmente estável, porque a regra é constante. Densidade vira assunto de coluna |
| F4 | Portal — Jurídico: `/assessoria/[id]`, `/processos`, telas órfãs | `distill`, `layout`, `clarify` | ✅ | #211 | 2026-09-16 | Rampa de 4 paradas no lugar de 5 elementos iguais; uma faixa de peso desigual no lugar dos 4 KPIs iguais que o contrato recusa, e os 4 números viram navegação; a guia chanfrada chega a `/assessoria/[id]` e a `/processos`; `/peticionar` ganha saída e identidade |
| F4 | Portal — Comunicação | `distill`, `layout` | ✅ | #212 | 2026-09-17 | `/contatos` perde a elevação no hover (era o último cartão do produto a levantar) e o círculo do ícone; no funil, o filete lateral deixa de repetir a cor da coluna e passa a marcar follow-up vencido |
| F4 | Portal — Financeiro | `distill`, `layout` | ✅ | #212 | 2026-09-17 | O hub media inventário e escondia o risco: `ATRASADO` ia somado dentro de "pendente". Ganhou tarja de risco, e os 5 cartões de módulo saíram — eram a mesma navegação que `PageSectionTabs` já mostra no topo |
| F4 | Portal — Gestão | `extract`, `distill` | ✅ | #213 | 2026-09-17 | **F4 FECHADA.** O mapa de faixas de seção passa a existir (`lib/navSections.ts`): a cor "diz ONDE" e vivia escrita à mão em 3 telas de 1 seção. `/produtividade` perde a única pílula do produto. E `lib/**` entrava faltando no `content` do Tailwind — toda classe escrita ali era morta |
| F4 | Portal — folhas de impressão | `layout`, `adapt` | ✅ | #212 | 2026-09-17 | Cabeçalho de coluna repete a cada página (tabela longa perdia os nomes das colunas a partir da 2ª folha); filete da linha vai de 1,29:1 para 2,18:1 contra o papel — a laser, o de antes sumia |
| F5a | Site — os P1 do `audit` | `harden`, `adapt`, `clarify`, `typeset`, `layout` | ✅ | #203 | 2026-09-16 | 9 rótulos de formulário, `h1` no login, alternador de tema público, caminho do blog para o produto, `.artigo` no lugar da classe inexistente, grade de preço |
| F5b | Site — os dois diferenciais | `bolder` | ✅ | #204 | 2026-09-16 | A custódia no Drive ocupa a manchete e é **demonstrada**, não descrita; Assessoria vira o único pilar dos recursos; a copy que contradizia o posicionamento saiu |
| F5c | Site — movimento | `animate` | ✅ | #205 | 2026-09-16 | Movimento 7 · arquivar (a sequência focal única: a árvore do Drive se arquiva sozinha), 8 · avisar, 9 · abrir menu; rolagem suave escopada ao site (D7 do roteiro de dinamismo); retorno de interação nos 5 estilos de botão/link, que não tinham **nenhuma** transição. D1 morto, D3 recusado, D2/D4/D5/D6/D8 pendentes de validação — ver `plano-dinamismo/roteiro-dinamismo.md` §Reconciliação |
| F5d | Site — os 5 itens de movimento aprovados | `animate` | ✅ | #206 | 2026-09-16 | D2+D8 (cabeçalho cliente: seção ativa por régua, régua do rodapé reage à rolagem), D4 (Movimento 10 — os 5 diagramas demonstram o próprio mecanismo), D5 (cartão de preço responde pela régua, não levantando), D6 (seta do fecho) |
| F5e | Site — as quatro telas de sessão | `distill`, `clarify` | ✅ | #207 | 2026-09-16 | Casca única (`components/site/TelaSessao.tsx`) + guia de sessão. `/cadastro` perde o fundo grafite e ganha marca e saída; `/escolher` ganha o `h1` que não tinha; `/redefinir-senha` troca "Link inválido" por um erro que diz o que fazer; `/login` ganha o caminho do cadastro, que não existia |
| F5f | Blog | `layout`, `typeset`, `clarify` | ✅ | #208 | 2026-09-16 | Renderizador de markdown simples (as regras de `.artigo h2/ul/blockquote/strong` eram letra morta: o corpo virava sempre `<p>`); a ÁREA do direito passa a aparecer; tempo de leitura real; fontes por domínio; "Continuar lendo"; um cabeçalho só; teste de mesa com 24 casos (`npm run testar`) |
| F6a | PWA — o P0-A3 | `optimize`, `adapt` | ✅ | #214 | 2026-09-17 | 11 consultas + 9 includes em toda troca de aba → 3 a 7 conforme a aba. Alvo de toque de 33px → 44px. Histórico deixa de empilhar. A pílula vira guia. **P0-A1 e P0-A2 já tinham caído na fundação** — medidos, não supostos |
| F6b | PWA — a guia do PWA | `extract`, `adapt`, `harden` | ✅ | #215 | 2026-09-17 | SEIS telas desenhavam a mesma tira de abas à mão, com quatro medidas e quatro estados ativos diferentes, todas em pílula e todas abaixo de 44px. Uma peça só (`components/mobile/GuiaMobile.tsx`), e a cor da seção passa a dizer ONDE também no celular |
| F6 | PWA — o resto | `adapt`, `layout`, `onboard` | ✅ | #229 | 2026-09-17 | As 25 rotas que sobravam. Não era tela feia: era **regra estabelecida numa parte do produto e aplicada ao resto por memória** — 34 controles abaixo do piso de toque de 44px (o piso nasceu com a tira de abas e ficou valendo só para ela), 27 raios de 6-8px num sistema de 2px, e a cor virando categoria em `/m/mais` (verde de "em dia" significando "Financeiro"). Cinco falsos positivos conferidos antes de virar edição: 4 telas "sem `<h1>`" (2 têm o título no componente, 2 são redirects) e 3 `dark:` (2 em comentário, 1 chave de objeto) |
| F7 | Painel Mestre | `extract`, `layout` | ✅ | #216 | 2026-09-17 | As abas saem de dentro de `[officeId]` e viram peça (`LumenAbas`/`LumenAba`). O Cofre — três tabelas de 5-6 colunas empilhadas, o caso extremo do diagnóstico — ganha as três abas. Identidade de tela nas 9 telas. A linguagem do Painel **continua distinta** do lado escritório, que é decisão do diagnóstico |
| F8a | `audit` das 4 superfícies restantes | `audit`, `harden`, `optimize` | ✅ | #218 | 2026-09-17 | **18/20.** Nenhum P0. 10 `dark:` mortos no portal, 2 telas sem `<h1>`, as 4 folhas impressas sem título semântico, 6 imagens sem carregamento preguiçoso. Relatório em `diagnostico/05-audit-portal-pwa-painel-blog.md` |
| F8b | `delight` — o estado vazio | `delight` | ✅ | #219 | 2026-09-17 | 74 usos de `EmptyState`, 66 dizendo só um título, e o componente nem aceitava ação. Ganhou slot de saída; `/processos` passa a distinguir "ainda não cadastrou" de "o filtro não casou" |
| F8 | Verificação final | `audit`, `critique`, `polish` | ✅ | #221–#228 | 2026-09-17 | **A conferência visual na máquina do dono aconteceu** — a única verificação deste plano que eu não conseguia fazer. Quinze apontamentos, oito PRs. Ver a seção 11 |
| F9 | Consolidação | `documenter`, `doctor` | ✅ | #220 | 2026-09-17 | DESIGN.md reescrito a partir do produto construído; `docs/DESIGN-SYSTEM.md` marcado como histórico (dezenas de comentários citam suas seções); `doctor`: o código e o sistema documentado passam a concordar — **zero avisos** no detector |

---

## 10-B. Achados abertos — medidos, não corrigidos

### ~~P0-CONTRASTE~~ · RESOLVIDO no PR #209 · `text-acao` como texto reprovava WCAG AA no tema escuro

`--acao` é o bordô FIXO da marca (`#8a2f42` nos dois temas). Como **fundo** de botão ele é correto,
com `--acao-tx` por cima. Como **texto** sobre uma superfície que retematiza, ele mede:

| Primeiro plano | Fundo | Contraste | AA (4,5:1) |
|---|---|---|---|
| `--acao` `#8a2f42` | ficha escura `#212529` | **1,88:1** | ✗ |
| `--acao` `#8a2f42` | papel escuro `#181b1f` | **2,11:1** | ✗ |
| `--acao` `#8a2f42` | `--acao-bg` escuro `#371c20` | **1,90:1** | ✗ |
| `--marca-tx` | ficha escura | 5,58:1 | ✓ |
| `--marca-tx` | papel escuro | 6,25:1 | ✓ |
| `--acao` / `--marca-tx` | ficha clara `#ffffff` | 8,18:1 | ✓ |

**Alcance final corrigido: 284 substituições em 113 arquivos** — 131 de texto, 29 de hover, 56 de
borda, 34 de anel de foco, mais 18 `border-marca`, 1 `ring-marca` e 1 `fill-marca` numa segunda
varredura. Fechado por regra de lint. Verificação: 40 pares (8 cascas × 5 superfícies) recalculados,
**zero reprovando**, e as colunas do tema claro idênticas antes e depois — a troca não muda um pixel
do claro, porque `--marca-tx` vale exatamente `#8a2f42` ali.

**Não foram tocados, de propósito:** 24 `border-acao` que são a borda do próprio botão bordô (têm
`bg-acao` na mesma linha), 2 `text-acao` em `<input type="checkbox">` — ali `text-*` pinta o
PREENCHIMENTO do controle, o marcador por cima é branco, e o par é fixo e aprova nos dois temas —
e as utilitárias `accent-*`, pelo mesmo motivo. As duas exceções de checkbox carregam
`eslint-disable-next-line` com o motivo escrito ao lado.

**De quem é o erro:** meu. A fundação F3 verificou `--acao` como **fundo**, com `--acao-tx` por
cima, e nunca o verificou como **primeiro plano**. A troca é `text-acao` → `text-marca-tx`, e é
segura por construção no tema claro (`--marca-tx` vale `#8a2f42` ali, exatamente o mesmo valor):
nenhum pixel do tema claro muda. O cuidado fica com as ocorrências sobre superfície FIXA (grafite),
onde o certo é `rail-marca` — essas precisam ser separadas à mão, não por substituição cega.
Corrigido só no blog (PR #208); o resto é a próxima passada.

### ~~P0-OPACIDADE~~ · RESOLVIDO no PR #210 · 184 classes com `/NN` não geravam regra nenhuma

Descoberto ao fechar o P0-CONTRASTE, e é mais antigo e mais grave que ele.

As cores do sistema são declaradas em `tailwind.config.ts` como texto simples — `"var(--marca-tx)"`.
O Tailwind só sabe aplicar modificador de opacidade a uma cor que traga o marcador `<alpha-value>`.
Sem ele, **a classe com `/NN` não gera regra alguma**, e o elemento cai no padrão do Tailwind.

Medido no navegador, com o CSS de produção:

| Escrito no código | O que o navegador aplica |
|---|---|
| `focus:ring-marca-tx/40` | `rgba(59, 130, 246, 0.5)` — **o azul padrão do Tailwind** |
| `focus:ring-marca-tx` | `rgb(138, 47, 66)` — o bordô, correto |
| `border-marca-tx/40` | `rgb(229, 231, 235)` — **cinza fixo**, que não retematiza |
| `border-marca-tx` | `rgb(138, 47, 66)` — correto |

Ou seja: **o anel de foco do produto inteiro era azul**, num produto que não tem azul em lugar
nenhum, e toda borda com opacidade era o cinza `gray-200` do Tailwind, igual nos dois temas.

**Contagem final, medida classe a classe contra o CSS de produção: 184 mortas** (a estimativa de
145 perdia variantes `hover:` e `dark:`) e **90 que funcionam** — estas usam cor literal (`white`,
`black`, `grafite-900`), onde o Tailwind CONSEGUE aplicar opacidade, e por isso não foram tocadas.

Os 34 anéis caíram no PR #209. As 184 caíram no PR #210, por família:

| De | Para | Quantas |
|---|---|---|
| `bg-atencao/10,15,20` | `bg-grave-bg` *(token novo)* | 31 |
| `border-marca-tx/25..50`, `border-acao/40` | `border-marca-tx` | 25 |
| `border-urgente/20..50`, `divide-urgente/20` | `border-linha-urgente` *(novo)* | 25 |
| `text-tx/55..85`, `text-tx-2/45`, `text-tx-3/NN` | `text-tx-2` / `text-tx-3` | 22 |
| `border-aviso/25..40` | `border-linha-aviso` *(novo)* | 12 |
| `bg-concluido/10..20` | `bg-concluido-bg` | 10 |
| `border-fonte-pje/NN` | `border-linha-fonte` *(novo)* | 8 |
| `bg-aviso/10..30` | `bg-aviso-bg` | 7 |
| `bg-urgente/10,20` | `bg-urgente-bg` | 6 |
| `border-concluido/20..30` | `border-linha-concluido` *(novo)* | 6 |
| `bg-fonte-pje/10,15` | `bg-fonte-pje-bg` *(novo)* | 6 |
| resto (superfícies, gaveta, acao-tx) | token sólido equivalente | 26 |

**Sete tokens novos, não sessenta e seis:** a alternativa estrutural (par em canais para permitir
`<alpha-value>`) **não foi necessária**, porque na maioria dos casos o token certo já existia e a
opacidade era contorno de quem não o conhecia — `text-tx/80` queria dizer `text-tx-2`;
`bg-urgente/10` queria dizer `bg-urgente-bg`, que já é `rgba(...,.14)`. Só faltava a família de
filete suave por risco, que agora existe: `--linha-urgente`, `--linha-aviso`, `--linha-concluido`,
`--linha-fonte`, `--linha-grave`, mais `--grave-bg` e `--fonte-pje-bg`.

Os cinco filetes foram derivados em OKLab pelo mesmo método do `--campo-risco-linha` que já existia
(matiz do risco, luminosidade da superfície, croma a 55%) e ficam por volta de **1,9:1** contra a
ficha **de propósito** — em todo uso conferido o estado já é carregado pelo preenchimento `bg-*-bg`
e pelo texto; o traço é só o contorno. O `--campo-risco-linha` original mede 1,90:1.

**Achado de brinde:** a conferência de anéis por contraste encontrou `focus:ring-acao-bg` em duas
telas — anel de foco na cor da TINTA DE FUNDO, medindo 1,15:1 no claro e 1,01:1 no escuro. Foco
invisível para quem navega por teclado. Corrigido junto.

---

### ~~P1-EMAIL~~ · RESOLVIDO no PR #217 · a superfície que ninguém tinha olhado

O detector nunca foi rodado em `lib/`. Rodado agora: **36 achados**, todos concentrados em
`lib/email.ts`, `lib/emailTemplateRender.ts`, `lib/defaultOfficeData.ts` e `lib/pwaIcon.tsx` — 90
cores literais, 54 tamanhos de fonte literais, 23 famílias tipográficas.

Em e-mail, cor e fonte literais são **obrigatórias** (cliente de e-mail não lê variável CSS nem
Tailwind), então o detector estava tecnicamente errado nesses arquivos. Mas a pergunta que ele
levantou era legítima, e a resposta foi **sim**: os e-mails estavam numa paleta inteira de outra
marca — azul-marinho `#0f1f3d`/`#0b1730`/`#0a1128` num produto que não tem azul, ouro `#c6a05c`
(o acento da marca anterior) e o **creme** `#f3efe6`/`#ece7d9`/`#f9f6ef` que o dono recusou por
escrito em 2026-09-16. Era a voz do produto na caixa de entrada do cliente, mandando justamente o
creme recusado.

38 cores mapeadas valor por valor para o tema claro do produto. Os 11 pares em uso medidos contra
WCAG AA: pior caso 4,95:1, nenhum reprovando.

**E um defeito que só a renderização achou:** `text-transform: capitalize` numa data em português
maiúscula CADA palavra — "Quinta-Feira, 17 De Setembro De 2026". Em português só a primeira letra
sobe. Estava em dois e-mails e em dois lugares da agenda do PWA. No e-mail a frase passa a chegar
pronta do servidor (`::first-letter` não é confiável em cliente de e-mail); no navegador, a classe
`.inicial-maiuscula` resolve. No `/painel` o `capitalize` era classe **morta** — `uppercase` na
mesma string já vencia.

---

## 10-C. A conferência visual do dono (2026-09-17)

A F8 previa uma verificação que eu não conseguia fazer: abrir o produto na máquina do dono. Ela
aconteceu, com quatro capturas e quinze apontamentos. Esta seção é o registro do que cada um era e
onde foi parar — porque vários deles não eram "não gostei da cor", eram defeito medido que passou
por todas as fases anteriores.

| # | Apontamento | O que era, de fato | PR |
|---|---|---|---|
| 1 | Os números de alerta não batem: 22 no PWA, 1 no site, 14 na tarja | Três funções diferentes com a mesma cara de resposta. O sino do site contava `getTodayItems` (só o que vence hoje) e ABRIA a aba "Hoje"; o do PWA contava a Central inteira. Três desalinhamentos, não um: contagem, teto de exibição (9+ × 99+) e cor do badge | #221 |
| 2 | As abas selecionadas estão ficando roxas | Verdade, e erro meu de origem: declarei `--faixa-anil` (#3b4a86) como azul-índigo; ele tem vermelho demais para ler como azul. Mais fundo que a cor: a aba repetia a seção, que o rail, a migalha e o título já diziam | #222 |
| 3–8 | Financeiro fora do mês · seções abertas em Assessoria · `/cadastro` sem saída · página pública estreita · sem caminho até o blog · Painel Mestre igual ao portal | Seis correções diretas. A mais instrutiva: o "em aberto" do Financeiro somava conta de qualquer vencimento, então o Resumo do mês era um saldo perpétuo | #223 |
| 9–13 | Rail, busca, sino, perfil, seletor da agenda do PWA | Duas das três queixas do rail eram o MESMO defeito: 62px úteis para um rótulo de 93px, e era o transbordo que criava a barra de rolagem horizontal | #224 |
| 14 | A agenda dá pouco espaço ao painel do dia | O painel era 360px FIXOS: 19% num monitor de 1900px e 25% num notebook. Virou percentual, com divisória arrastável de ±15 pontos | #225 |
| 15 | Tire o roxo completamente | Eram DOIS tokens (`anil` e `ameixa`), não um. A paleta de faixas caiu de cinco hues para três | #226 |
| — | Blog: matérias todas do mesmo tamanho | Manchete e colunas, escolhido entre três propostas. O blog era também a única superfície pública sem Manhã/Noite | #227 |
| — | Levantado por mim, aprovado pelo dono | A regra de lint contra `text-white` tinha duas brechas, e cada uma escondia defeito real: `fonte-pje` fora da lista de prefixos (EntityPicker, 3,42:1 no Noite) e a regra só enxergando fundo e texto no mesmo literal (ComunicadosForm, 3,81:1; ActingOfficeBanner, 3,81:1 **e** uma opacidade que nem se aplicava) | #228 |

**O que a conferência ensina sobre este plano:** nove dos quinze apontamentos não eram gosto, eram
medida — e nenhuma das oito fases anteriores os pegou. Duas razões, e vale registrar as duas:

1. este ambiente **não tem rota até o banco**, então nenhuma fase conseguiu abrir o produto de
   verdade — tudo foi verificado por `tsc`, `lint`, `build`, CSS de produção e harness de Chromium
   com o CSS real, que pegam muita coisa e não pegam "isto está roxo na minha tela";
2. o `audit` da F8, que é a passagem dedicada de a11y/tema/responsivo, roda **contra o código**,
   não contra a tela renderizada.

Enquanto (1) não mudar, a conferência do dono não é uma etapa do plano — é o gate.

---

## 11. Log de decisões (append-only — nunca editar linha antiga)

| Data | Quem | Decisão | Onde nasceu |
|---|---|---|---|
| 2026-09-16 | Dono | Redesign completo; pode trocar cor de marca, tipografia e temas | Entrevista de abertura |
| 2026-09-16 | Dono | Os dois temas impecáveis; padrão de cada superfície mantido | Entrevista de abertura |
| 2026-09-16 | Dono | SaaS/portal primeiro depois da fundação | Entrevista de abertura |
| 2026-09-16 | Dono | Usuário prioritário no desempate: advogado dono/sócio | `init` rodada 1 |
| 2026-09-16 | Dono | Diferenciais: Drive do próprio cliente + assessoria de primeira classe | `init` rodada 1 |
| 2026-09-16 | Dono | Sem prova social real; só capturas do produto | `init` rodada 1 |
| 2026-09-16 | Dono | WCAG AA como piso, com autorização para mexer em tokens de texto | `init` rodada 1 |
| 2026-09-16 | Dono | `buildPath: code` — mockup clicável antes do código | `init` passo 5 |
| 2026-09-16 | Claude | Superfície-âncora da direção = Portal, não site público | Seção 5, tese 1 |
| 2026-09-16 | Dono | Seguir sem interferência até a proposta completa; criticar e corrigir o próprio resultado a cada etapa | Mensagem durante F1 |
| 2026-09-16 | Dono | A proposta final é artefato HTML clicável com várias telas do SaaS **e** do app mobile | Mensagem durante F1 |
| 2026-09-16 | Claude | Direção designada pelo sorteio = candidato 4, “Guias” (arquivo de cartório). Seed `2cac85b3` | `concept-seed --scope direction --mode operate` |
| 2026-09-16 | Claude | Conflito filete × arredondamento resolvido em favor do **filete**; raio de 2px | F2, resolve os 22 `warning` do detector |
| 2026-09-16 | Claude | Rampa de 6 paradas com piso de 12px, garantida por lint e não por convenção | F2, a partir do achado nº 1 do diagnóstico |
| 2026-09-16 | Dono | **Direção "Guias" aprovada.** Seguir para a próxima etapa | Mensagem após a proposta |
| 2026-09-16 | Claude | O mapeamento da rampa sai da medição, não do gosto: abaixo de 12px vira etiqueta; 12,5 a 16 vira corpo. 13px era o app (43 arquivos), 10-11px era o portal | F3, codemod |
| 2026-09-16 | Claude | Os nomes de token antigos viram apelido dos novos, em vez de dois sistemas convivendo. É o que faz as 99 rotas entrarem no mundo novo sem editar 250 arquivos | F3, `colorize` |
| 2026-09-16 | Dono | **Paleta creme recusada** — "impressão de coisa velha". O tema claro não pode ter fundo bege | Conferência do F3 em produção |
| 2026-09-16 | Dono | **Paleta Ardósia escolhida** (cinza-pedra frio), entre três propostas | Segunda rodada de cor |
| 2026-09-16 | Dono | **Nenhuma faixa de seção é vermelha.** O tijolo sai, o anil entra. O vermelho existe só para risco; o bordô, só para ação | Segunda rodada de cor |
| 2026-09-16 | Claude | O rail é superfície própria com tokens próprios, e não a escala `grafite`. A escala `grafite` fica literal, só para os blocos sempre escuros do site público | F3b, a partir do defeito que o dono viu |
| 2026-09-16 | Dono | O número de notificação não é vermelho: contagem não é risco | Conferência do F3b |
| 2026-09-16 | Dono | O número da Agenda reflete só compromisso do dia + atrasados | Conferência do F3b |
| 2026-09-16 | Claude | A largura da tela mora numa classe só (`.tela`), nunca no arquivo de rota. Medida de leitura estreita é do conteúdo, nunca do quadro | F4b |
| 2026-09-16 | Dono | **Nenhum vermelho vivo no produto.** Tudo na família do bordô, e mais suave em área grande | Conferência do F4 em produção |
| 2026-09-16 | Dono | Peticionar preenchido; "+ Novo" em bordô translúcido, para se distinguirem | Conferência do F4 |
| 2026-09-16 | Claude | Ação e risco compartilham o matiz e se distinguem por TRATAMENTO: só a ação é preenchida; risco é texto e filete. Ação destrutiva é bordô profundo, mais a palavra | F4i, `colorize` |
| 2026-09-16 | Dono | O quadro não pode ser capado e centralizado: num monitor largo isso é espaço vazio inútil | Conferência do F4 em produção |
| 2026-09-16 | Claude | Estabilidade de layout vem de REGRA CONSTANTE, não de largura pequena. O quadro ocupa a largura em toda tela densa; medida de leitura é da coluna, nunca da página | F4j, `adapt` + `layout` |

---

## 12. Como atualizar este documento (obrigatório)

Ao terminar **qualquer** bloco de trabalho, antes de encerrar:

1. **Bloco de Estado (topo):** atualize fase atual, próximo passo concreto, contagem de comandos e
   superfícies, data e quem atualizou.
2. **Seção 10:** mude o estado da linha (⬜ → 🔄 → ✅), preencha PR, data e uma nota curta do que foi
   decidido ou descoberto. Se pulou algo, use ⏭️ **e escreva o motivo** — pulo sem motivo registrado
   vira retrabalho.
3. **Seção 11:** se o dono decidiu qualquer coisa, acrescente uma linha nova. **Nunca edite linha
   antiga** — o valor deste log é ser histórico, não estado.
4. **Seção 2:** se uma dívida foi resolvida ou uma nova apareceu, ajuste a lista.
5. **Commit** junto com o trabalho, com mensagem em português:
   `atualiza plano mestre de redesign — <fase>: <o que mudou>`.

Se você **descobrir que este plano está errado** — a skill mudou, uma decisão do dono contradiz uma
fase, uma superfície não existe mais — **corrija o plano e registre a correção na seção 11**. Um plano
desatualizado é pior que nenhum, porque é obedecido.

---

*Criado em 2026-09-16 · Impeccable v4.3.1 · `buildPath: code` · 5 superfícies · 99 rotas · 24 comandos.*
