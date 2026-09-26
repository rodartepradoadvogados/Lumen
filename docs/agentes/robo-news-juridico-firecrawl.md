# Robô News Jurídico com Firecrawl: especificação de implementação

> **Para quem é este documento:** o agente de IA (Robô de conteúdo jurídico, sessão do Claude Code
> no repositório Lumen) que vai implementar a nova versão do fluxo de matérias jurídicas do blog.
>
> **Decisão do dono (26/09/2026), que define a arquitetura:**
> - **Sem `ANTHROPIC_API_KEY`.** O Lúmen não chama nenhuma API de IA paga para redigir matéria.
> - **Por agora, quem pesquisa e redige continua sendo a Routine do Robô de conteúdo jurídico**
>   (Claude Code, skill `.claude/skills/rp-radar-juridico/`), que passa a usar o **Firecrawl**.
> - **O Lúmen ganha:** agendamento de publicação, aviso por e-mail, checagem de fontes feita pelo
>   servidor e correção das lacunas da API.
> - **Etapa final (decisão do dono de 26/09/2026): a redação passa para o Hermes** (que usa o
>   OpenRouter no próprio servidor, sem chave nova na Vercel). É a **Parte C**, implementada **por
>   último**, depois que as Partes A e B estiverem funcionando. Até lá, a Routine segue redigindo.
>
> Levantamento sobre `main` em 26/09/2026. Confira `git log -1 origin/main` antes de começar e
> reconfirme os pontos citados.

---

## 1. Como funciona hoje

| Peça | Onde | Estado |
|---|---|---|
| Robô | `.claude/skills/rp-radar-juridico/SKILL.md` + Routine diária no claude.ai | Pesquisa por conta própria, sem Firecrawl. Envia rascunho pela API. |
| Entrada | `app/api/blog/draft/route.ts` | `GET ?days=N` (memória anti-duplicata) e `POST` (cria `AGUARDANDO_REVISAO`). Auth `Bearer $BLOG_ROBOT_SECRET`, fail-closed. **Aceita `area` livre, sem limite de tamanho e sem exigir `sources`.** |
| Modelo | `prisma/schema.prisma` → `BlogPost` | `status` é string: `AGUARDANDO_REVISAO` / `PUBLICADO` / `REJEITADO`. **Não há agendamento.** |
| Aprovação | `app/(app)/configuracoes/page.tsx` (seção `blog`), `components/BlogReviewManager.tsx`, `lib/actions/blog.ts`, versão mobile em `app/m/configuracoes/page.tsx` | Só admin com `blogAccess`. Publicar = público na hora. |
| Público | `app/blog/page.tsx`, `app/blog/[slug]/page.tsx`, `app/sitemap.ts` | Leem só `PUBLICADO` e `excluidaEm: null`. |
| Aviso | não existe | Só o contador "Revisão Pendente (N)". |

## 2. Arquitetura alvo

```
Routine diária (Claude Code)                     Lúmen (Vercel)
 skill rp-radar-juridico                         ───────────────────────────────────────
  1. GET /api/blog/draft?days=30 (memória)  ──▶  lista posts 30 dias
  2. varredura: Firecrawl /scrape nas listagens
  3. validação: Firecrawl /search + /scrape
     (1 portal + 1 oficial, ambos LIDOS)
  4. redação (a própria Routine)
  5. POST /api/blog/draft  ────────────────────▶ valida área, limites e FONTES (servidor)
                                                  anti-duplicata → grava AGUARDANDO_REVISAO
                                                  e-mail aos admins
 Admin: Configurações → Blog → Revisão Pendente
   [Editar] [Publicar agora] [Agendar…] [Rejeitar] [Excluir]
 Cron /api/cron/blog-publicar-agendadas (15 min) → publica AGENDADO vencido
```

**Princípio que não muda:** robô **nunca publica**. Só advogado admin publica, agora ou agendado.

## 3. Credenciais (só nomes; nenhum valor em código, commit, PR ou chat)

| Variável | Onde | Uso |
|---|---|---|
| `FIRECRAWL_API_KEY` | **Ambiente da Routine** no claude.ai (e também na Vercel, para as ferramentas do peticionamento) | Varredura e validação feitas pela Routine |
| `BLOG_ROBOT_SECRET` | Vercel **e** ambiente da Routine | Auth da `/api/blog/draft`. Se hoje estiver escrito no **prompt** da Routine, mova para variável de ambiente e tire do prompt. |
| `CRON_SECRET` | Vercel (já existe) | Auth do cron novo de publicação agendada |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD` | Vercel | Aviso de rascunho novo (`sendSimpleEmail`, `lib/email.ts`) |

`RADAR_JURIDICO_ATIVO` e `ANTHROPIC_API_KEY` **não são usadas** nesta versão. Se o dono criou
`RADAR_JURIDICO_ATIVO` na Vercel, ela pode ficar; é inofensiva.

**Orçamento do Firecrawl:** 1.000 créditos/mês, compartilhados com MilkNews e peticionamento. Teto
da Routine: **30 chamadas por execução**. Consulte `GET https://api.firecrawl.dev/v2/team/credit-usage`
no início. Com menos de 150 créditos, reduza para 1 matéria no dia e avise.

## 4. Regras editoriais (inalteradas; valem literalmente)
- **Fontes:**
  - portais: Migalhas, Conjur e Jusbrasil **só notícias**;
  - oficiais: STF, STJ, TST, TSE, TJs, TRFs, TRTs (`*.jus.br`), e `planalto.gov.br`, `in.gov.br`,
    `camara.leg.br`, `senado.leg.br` para lei.
  - A pasta "DOUTRINA" do Drive continua fora.
- **Pauta:** decisões de tribunais superiores, mudanças legislativas, teses vinculantes, notícias de
  alto impacto.
- **Meta:** cerca de 3 matérias/dia, mas **nunca forçar**. 0, 1 ou 2 é normal.
- **Dupla validação:** pelo menos duas fontes independentes **lidas**.
  - Com decisão judicial: **1 portal + 1 página oficial `*.jus.br`**.
  - Sem decisão judicial: quaisquer duas independentes, preferindo a oficial.
  - Sem fonte oficial do tribunal, não publica. Divergência, declara no texto.
  - Snippet não é fonte. Nunca inventar número, ementa ou citação.
- **Formato:**
  - `type` NOTICIA (1 a 3 parágrafos) ou ANALISE;
  - `title` objetivo; `summary` com 1 a 2 frases; `content` em markdown simples; **sem imagem**;
    paráfrase.
  - `area` **exatamente** um de: Cível, Consumerista, Empresarial, Tributário, Trabalhista,
    Previdenciário, Administrativo, Licitação, Compliance, Due Diligence, Contratual,
    Responsabilidade Civil, Execuções.
  - `sources` = URLs lidas.

---

## Parte A: código do Lúmen

### A1. Schema (aditivo, seguro para `prisma db push`)
Em `model BlogPost`, **só campos opcionais**:
```prisma
agendadaPara    DateTime?
agendadaPorId   String?
agendadaPor     User?     @relation("BlogPostAgendador", fields: [agendadaPorId], references: [id])
origem          String?   // "ROBO_ROUTINE" | "API_MANUAL" | "ROBO_HERMES" (futuro) | null (legado)
@@index([status, agendadaPara])
```
- Novo valor de `status`: `AGENDADO` (documente no comentário do modelo).
- Relação inversa em `User`.

### A2. Biblioteca pura `lib/blogRegras.ts` (sem rede, sem Prisma) + testes
- `AREAS_DO_BLOG`, `areaValida(area)`.
- `ehOficial(url)`: `*.jus.br`, `planalto.gov.br`, `in.gov.br`, `camara.leg.br`, `senado.leg.br`.
- `ehPortalJuridico(url)`: migalhas.com.br, conjur.com.br, jusbrasil.com.br/noticias.
- `validarFontes(sources)`: ≥ 2 URLs `https://`, de **domínios distintos**, com **pelo menos 1
  oficial**. Devolve `{ ok } | { ok: false, motivo }`.
- `normalizarTitulo` e `ehDuplicata`, **extraídas** da rota atual (mesma regra: título normalizado
  igual ou URL de fonte igual, 60 dias, inclusive rejeitados e excluídos). A rota passa a importar
  daqui.
- Limites: título ≤ 180, summary ≤ 400, content ≤ 12.000.

Testes em `lib/testes/blogRegras.teste.ts` (estilo `executar.ts`):
- área fora da lista → recusa;
- 1 fonte só → recusa;
- 2 fontes do mesmo domínio → recusa;
- 2 portais sem oficial → recusa;
- Conjur + `stj.jus.br` → aceita;
- `planalto.gov.br` + Migalhas → aceita;
- título duplicado com acento/caixa diferente → duplicata.

### A3. Endurecer `POST /api/blog/draft`
- Recusar com **400** e mensagem clara: `area` inválida, limites estourados, `validarFontes`
  reprovado.
- Aceitar campo opcional `origem` (`"ROBO_ROUTINE"`), gravando `API_MANUAL` quando ausente.
- **Depois de criar**, disparar o aviso da A6 sem bloquear a resposta (erro de e-mail não muda o 201).
- `GET` inalterado.

### A4. Agendamento
- `lib/actions/blog.ts`, no padrão `assertBlogAdmin()`:
  - `scheduleBlogPost(id, agendadaParaISO, imageUrl?)`: data ≥ agora + 5 min →
    `status "AGENDADO"`, `agendadaPara`, `agendadaPorId`, `reviewedById`, `reviewedAt`;
  - `unscheduleBlogPost(id)`: volta para `AGUARDANDO_REVISAO`;
  - `publishBlogPost` limpa `agendadaPara`.
- Cron `app/api/cron/blog-publicar-agendadas/route.ts`: `GET`, `maxDuration = 60`, auth
  `CRON_SECRET` fail-closed (copie `app/api/cron/resumo-diario/route.ts`).
  - Passa `AGENDADO` com `agendadaPara <= agora` e `excluidaEm: null` para `PUBLICADO`, com
    `publishedAt = agendadaPara`.
  - Depois chama `revalidatePath("/blog")` e o slug de cada post publicado.
- `vercel.json` → `crons`: `{ "path": "/api/cron/blog-publicar-agendadas", "schedule": "*/15 * * * *" }`.

### A5. Tela
Em `components/BlogReviewManager.tsx` e `app/m/configuracoes/page.tsx`:
- Botão **"Agendar…"** com `datetime-local` no fuso **America/Sao_Paulo** (converter para UTC ao
  gravar).
- Aba **"Agendadas (N)"** (`?secao=blog&blogTab=agendadas`), ordenada por `agendadaPara asc`, com
  "Cancelar agendamento" e "Publicar agora".
- Selo **"Robô"** quando `origem` começa com `ROBO_`.

O blog público **não muda** (só `PUBLICADO`).

### A6. Aviso por e-mail
Por rascunho criado, um e-mail a cada admin com `blogAccess` do escritório interno
(`getPlatformOffice()`), via `sendSimpleEmail`:
- assunto: `Blog: nova matéria aguardando revisão: <título>`;
- corpo: área, resumo e link para `/configuracoes?secao=blog&blogTab=revisao`.

Sem `EMAIL_*`, só registra e segue.

### A7. Documentação
- `.env.example`: acrescente `BLOG_ROBOT_SECRET=` (hoje ausente), só o nome.
- Atualize `docs/CONTEXTO-COMPLETO-PROJETO.md` §13.

## Parte B: a skill da Routine passa a usar o Firecrawl
Atualize `.claude/skills/rp-radar-juridico/SKILL.md`, mantendo todas as regras editoriais:
1. **Início:** confira `FIRECRAWL_API_KEY` e `BLOG_ROBOT_SECRET` no ambiente (sem imprimir). Faltou
   alguma, pare e avise o dono. Consulte o saldo de créditos.
2. **Varredura:** `POST https://api.firecrawl.dev/v2/scrape`
   `{"url": "<listagem>", "formats": ["markdown"], "onlyMainContent": true}` nas páginas de
   listagem que funcionarem. Teste e fixe a lista na primeira execução. Ponto de partida:
   - `https://www.migalhas.com.br/quentes`
   - `https://www.conjur.com.br/`
   - `https://noticias.stf.jus.br/`
   - últimas notícias do STJ e do TST (ache a URL com `/search`)
   - `https://www.jusbrasil.com.br/noticias/`
3. **Validação:**
   - `POST /v2/search {"query": "<tema> site:<tribunal>.jus.br", "limit": 5}` para achar a oficial;
   - `/scrape` para **ler** a oficial e o portal;
   - só conta página com markdown não vazio.
4. **Envio:** `POST /api/blog/draft` com `"origem": "ROBO_ROUTINE"` e `sources` = as URLs lidas. O
   servidor agora **recusa** fontes insuficientes (400): não tente contornar. Descarte a matéria e
   registre o motivo.
5. **Teto:** 30 chamadas Firecrawl por execução.
6. **Plano B:** sem Firecrawl, use a pesquisa antiga com as mesmas regras e avise no relatório.

## Parte C: etapa final, redação pelo Hermes (implementar por último)
**Objetivo:** o Lúmen passa a fazer a varredura e a validação com o Firecrawl (`lib/firecrawl.ts`).
Quem **redige** é o Hermes, com o OpenRouter configurado no servidor dele. A Routine deixa de ser
necessária e o dono decide quando desligá-la.

### C1. Variáveis (Vercel, projeto lumen)
| Variável | Situação | Uso |
|---|---|---|
| `HERMES_URL`, `HERMES_TOKEN` | já existem (ponte do chat e do peticionamento) | chamar o Hermes |
| `HERMES_PERFIL_MATERIAS` | **nova, opcional** (padrão `materias-lumen`) | perfil do Hermes que redige |
| `RADAR_JURIDICO_ATIVO` | já criada pelo dono com `0` | `1` liga o cron; qualquer outro valor desliga |
| `FIRECRAWL_API_KEY`, `CRON_SECRET` | já existem | varredura/validação e auth do cron |

**Nenhuma** `ANTHROPIC_API_KEY`. O Lúmen não chama API de IA diretamente.

### C2. Servidor do Hermes (quem faz é o dono, guiado por você)
- **Perfil `materias-lumen`:** crie seguindo o `servidor-hermes/LEIA-ME.md`, com a chave do
  **OpenRouter** no `.env` **do perfil**. Confira com `hermes -p materias-lumen config env-path` e
  `hermes -p materias-lumen config check`.
- **Skill nova no repositório:** `servidor-hermes/skills/redacao-materias-blog/SKILL.md`, com as
  regras editoriais da seção 4 e o formato de saída da C3. Ela precisa passar em
  `lib/testes/skillsHermesSemDadoDeEscritorio.teste.ts`: sem nomes de tribunal, sem URLs e sem
  dados do escritório. Instale a skill no perfil conforme o LEIA-ME.

### C3. Lúmen
- **`lib/radarJuridico.ts` (puro, com testes):** extração de candidatos das listagens,
  `validarFontes` (reaproveite `lib/blogRegras.ts`) e montagem da mensagem ao Hermes. A mensagem
  leva as regras, a área permitida e o markdown **das fontes lidas** (cortado em ~6.000 caracteres
  por fonte) e exige a resposta **só** entre os marcadores:
  ```
  ###MATERIA_JSON###
  {"title": "...", "area": "...", "type": "NOTICIA|ANALISE", "summary": "...", "content": "..."}
  ###FIM###
  ```
  O Hermes **não** pode acrescentar fato, número ou citação que não esteja no markdown fornecido.
- **`lib/radarJuridicoExecutar.ts`:**
  1. memória de 60 dias;
  2. `lerPagina` nas listagens (teto de 30 chamadas);
  3. seleção de até 3 candidatos por heurística simples: palavras-chave de pauta e tribunais
     superiores primeiro, descartando as duplicatas;
  4. validação: `buscarNaWeb` + `lerPagina` na oficial e no portal;
  5. redação: para cada candidato validado, `perguntarAoHermesComPerfil` (`lib/hermesPonte.ts`)
     com o perfil `HERMES_PERFIL_MATERIAS ?? "materias-lumen"`. Se o tempo de resposta não couber
     no `maxDuration`, use o padrão assíncrono (`iniciarGeracaoNoHermes` /
     `consultarGeracaoNoHermes`) com um segundo cron de coleta.
  6. validação da resposta: JSON entre os marcadores, `areaValida` e limites. Falhou, descarta
     e registra o motivo.
  7. grava `AGUARDANDO_REVISAO` com `origem: "ROBO_HERMES"` e dispara o aviso por e-mail da A6.
- **Cron `app/api/cron/radar-juridico/route.ts`:** `GET`, `maxDuration = 300`, auth `CRON_SECRET`
  fail-closed. Sem `RADAR_JURIDICO_ATIVO=1`, sem Firecrawl ou sem Hermes configurado, responde
  `{ executado: false, motivo }`.
- **`vercel.json`:** `{ "path": "/api/cron/radar-juridico", "schedule": "0 9 * * *" }`, que é
  **06:00 em Brasília**.
- **Testes:** montagem da mensagem sem dado de escritório, parser dos marcadores (JSON inválido,
  área fora da lista, campo faltando → descarta) e cron fail-closed.

### C4. Transição
1. Liga com `RADAR_JURIDICO_ATIVO=1` e Redeploy. Durante 3 dias úteis, **Routine e Hermes rodam
   juntos**; o anti-duplicata barra os casos iguais.
2. Depois, pergunte ao dono se quer **desligar a Routine**. Com o "pode desligar":
   - o dono pausa ou apaga a Routine no claude.ai;
   - você marca a skill `rp-radar-juridico` como descontinuada, por PR.

---

## Verificação (gate do CLAUDE.md)
```bash
rm -rf .next && npx tsc --noEmit -p .
npx eslint <arquivos alterados>
npm run testar
npx next build
```
Build vermelho **só** por falta de acesso ao banco no ambiente → diga no PR e pergunte antes de
mergear.

## Critérios de aceite
- [ ] `POST /api/blog/draft` recusa área inválida, limites estourados e fontes sem oficial ou do
      mesmo domínio.
- [ ] Agendamento publica no horário (tolerância de 15 min), com hora de Brasília na tela, e nada
      vaza antes.
- [ ] Admins recebem e-mail a cada rascunho novo.
- [ ] A Routine usa o Firecrawl para ler e validar, e o saldo é respeitado.
- [ ] Nenhuma chamada a API de IA paga no Lúmen.
- [ ] Nenhum segredo no diff.
