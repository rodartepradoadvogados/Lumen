# Robô News Jurídico com Firecrawl: especificação de implementação

> **Para quem é este documento:** o agente de IA que vai **implementar** o novo robô de matérias
> jurídicas do blog do Lúmen. Ao final, ele **substitui integralmente** o robô atual
> (`.claude/skills/rp-radar-juridico/`, disparado por uma Routine do Claude), que então é desligado.
>
> **Regra de leitura:** siga as fases na ordem. Cada fase tem uma condição de saída. Não comece a
> fase seguinte com a anterior vermelha. Em caso de dúvida sobre regra editorial, **a regra deste
> documento prevalece sobre qualquer suposição**. Se algo não bater com o código real, pare e
> pergunte ao dono do projeto (rodartepradoadvogados@gmail.com).
>
> Levantamento feito sobre `main` em 25/09/2026. Confira `git log -1 origin/main` antes de começar.
> Se o código tiver mudado nos pontos citados, reconfirme antes de seguir.

---

## 1. O que existe hoje (e vai ser esvaziado)

| Peça | Onde | Estado atual |
|---|---|---|
| Robô (instruções) | `.claude/skills/rp-radar-juridico/SKILL.md` | Skill do Claude. Roda **fora** do Lúmen, numa Routine diária (manhã, Brasília), em sessão nova a cada disparo. A Routine é configurada no claude.ai e não está no repositório. |
| Entrada de rascunhos | `app/api/blog/draft/route.ts` | `GET ?days=N` (memória anti-duplicata) e `POST` (cria rascunho). Auth `Authorization: Bearer $BLOG_ROBOT_SECRET`, fail-closed. |
| Modelo | `prisma/schema.prisma` → `model BlogPost` | `status` é **string** com 3 valores: `AGUARDANDO_REVISAO`, `PUBLICADO`, `REJEITADO`. **Não há campo de agendamento.** |
| Revisão/aprovação | `app/(app)/configuracoes/page.tsx` (seção `blog`, abas `revisao`/`publicadas`/`fotos`) + `components/BlogReviewManager.tsx` + `lib/actions/blog.ts` | Só admin do escritório com `blogAccess`. Publicar = público **na hora**. |
| Blog público | `app/blog/page.tsx`, `app/blog/[slug]/page.tsx`, `app/sitemap.ts` | Leem só `status: "PUBLICADO", excluidaEm: null`. |
| Aviso de rascunho novo | não existe | O único sinal hoje é o contador "Revisão Pendente (N)". |
| Firecrawl | `lib/firecrawl.ts` | Cliente só servidor, fail-closed. Nada o usa ainda. |

**Defeitos do fluxo atual que esta implementação corrige:**
1. Depende de uma Routine externa (sessão efêmera, sem estado, sem log dentro do Lúmen).
2. Não existe **agendamento** de publicação.
3. Ninguém é **avisado** quando chega rascunho.
4. A API aceita `area` livre, sem limite de tamanho e sem exigir `sources`.

---

## 2. Arquitetura alvo

Tudo passa a rodar **dentro do Lúmen**, na Vercel, sem Routine e sem sessão de Claude Code:

```
Vercel Cron (1x/dia)                       Vercel Cron (a cada 15 min)
      │                                              │
      ▼                                              ▼
/api/cron/radar-juridico                   /api/cron/blog-publicar-agendadas
      │                                              │
      ├─ 1. varredura (Firecrawl: lerPagina)         └─ publica BlogPost AGENDADO
      ├─ 2. triagem (Claude, API Anthropic)             com agendadaPara <= agora
      ├─ 3. dupla validação (Firecrawl: buscarNaWeb + lerPagina)
      ├─ 4. redação (Claude)
      ├─ 5. anti-duplicata (mesma regra da API atual)
      ├─ 6. grava BlogPost AGUARDANDO_REVISAO
      └─ 7. e-mail aos admins: "N rascunhos aguardando revisão"

Admin, em Configurações → Blog → Revisão Pendente:
   [Editar]  [Publicar agora]  [Agendar…]  [Rejeitar]  [Excluir]
```

**Princípio que não muda:** o robô **nunca publica**. Tudo entra como `AGUARDANDO_REVISAO`. Só um
advogado admin publica, agora ou agendado.

---

## 3. Credenciais e variáveis de ambiente

**Nenhum valor real entra no repositório, no chat, em commit ou em PR** (CLAUDE.md, achado F3 da
auditoria). Valores reais ficam só na **Vercel → lumen → Settings → Environment Variables** e no
gerenciador de senhas (`docs/vault-chaves/README.md`). No código, leia de `process.env`.

| Variável | Já existe? | Uso | Onde o dono obtém |
|---|---|---|---|
| `FIRECRAWL_API_KEY` | Sim (Vercel) | Varredura e validação (`lib/firecrawl.ts`) | firecrawl.dev → Dashboard → API Keys |
| `FIRECRAWL_API_URL` | Opcional | Só se houver Firecrawl auto-hospedado | — |
| `ANTHROPIC_API_KEY` | Sim | Triagem e redação (mesmo SDK de `app/api/assistente/route.ts`) | console.anthropic.com |
| `CRON_SECRET` | Sim | Autentica os 2 crons novos (padrão dos crons existentes) | Aleatório, já configurado |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD` | Sim | Aviso de rascunhos novos (`sendSimpleEmail` em `lib/email.ts`) | Provedor SMTP |
| `BLOG_ROBOT_SECRET` | Sim | Continua protegendo `/api/blog/draft`, que fica como **entrada manual/legada**. Não é mais usado pelo robô. | Aleatório |
| `RADAR_JURIDICO_ATIVO` | **Nova** | `"1"` liga o cron. Qualquer outro valor desliga. Chave de emergência sem deploy. | Definir na Vercel |

**Fail-closed obrigatório:**
- Os dois crons recusam com 401 sem `CRON_SECRET` correto (copie o padrão de
  `app/api/cron/resumo-diario/route.ts`).
- Sem `FIRECRAWL_API_KEY` ou `ANTHROPIC_API_KEY`, o cron do radar **não faz nada**. Ele registra
  "não configurado" e devolve 200 com `{ executado: false, motivo }`. Nunca cai em modo anônimo
  nem inventa conteúdo.

**Modelo de IA:** use a mesma constante/modelo do assistente (`app/api/assistente/route.ts`,
`const MODEL`). Não escreva um ID de modelo novo sem necessidade.

**Orçamento do Firecrawl:** o plano atual tem **1.000 créditos/mês** (1 scrape ≈ 1 crédito, 1 busca
≈ 1 crédito por resultado). Teto por execução: **30 chamadas** (constante `LIMITE_CHAMADAS_FIRECRAWL`).
Ao atingir o teto, o cron encerra o ciclo com o que já validou.

---

## 4. Regras editoriais (herdadas do robô atual; valem literalmente)

### 4.1 Fontes
- **Portais jurídicos:** Migalhas (`https://www.migalhas.com.br/`), Conjur
  (`https://www.conjur.com.br/`), Jusbrasil **somente notícias** (`https://www.jusbrasil.com.br/noticias/`).
  Nunca toque em publicações processuais do Jusbrasil. Isso é outro sistema (`robo-publicacoes/`).
- **Oficiais:** sites de STF, STJ, TST, TSE, tribunais superiores, TJs, TRFs, TRTs (domínios
  `*.jus.br`). Para lei: `planalto.gov.br`, `in.gov.br` (Diário Oficial), `camara.leg.br`, `senado.leg.br`.
- A pasta "DOUTRINA" do Drive continua **fora**.

### 4.2 Pauta
Decisões de tribunais superiores, mudanças legislativas, teses vinculantes (repetitivos, súmulas,
IRDR, ADI/ADC) e notícias de alto impacto.

### 4.3 Meta
Cerca de **3 matérias por dia** (NOTICIA + ANALISE somadas). **A meta nunca justifica forçar
conteúdo fraco**: 0, 1 ou 2 no dia é normal.

### 4.4 Dupla validação (inegociável, e **verificada por código**, não só pelo modelo)
Cada matéria precisa de **pelo menos duas fontes independentes, efetivamente lidas** (via
`lerPagina`, com markdown não vazio):
- Havendo decisão judicial: **obrigatoriamente** 1 portal jurídico (4.1) **+** 1 página oficial do
  tribunal envolvido (`*.jus.br`).
- Sem decisão judicial (ex.: lei nova): quaisquer duas independentes, preferindo a oficial.
- **Não achou a fonte oficial do tribunal? Não gera a matéria.**
- Fontes divergentes: pode gerar, mas o texto **declara a divergência explicitamente**.
- Snippet de busca **não é fonte**. Só conta página lida.
- **Nunca inventar** fundamentação, número de processo, ementa ou citação. Dado não confirmado
  fica de fora ou vai marcado como não confirmado.

A checagem em código (função pura, testável) exige:
`fontes.length >= 2`, domínios distintos, e, se `temDecisaoJudicial`, um domínio da lista de
portais e um `*.jus.br`.

### 4.5 Formato
- `type`: `NOTICIA` (1 a 3 parágrafos) ou `ANALISE` (o que mudou, por que importa, impacto
  prático por área).
- `title` objetivo; `summary` com 1 a 2 frases; `content` em markdown simples (o que
  `lib/markdownSimples.tsx` renderiza: parágrafos, `##`/`###`, citação, listas, tabelas, negrito,
  itálico, links http/https).
- **Nunca incluir imagem.** A foto é escolhida pelo admin na revisão.
- Paráfrase sempre. Citação literal só curta e entre aspas.
- `area`: **exatamente** um destes valores: Cível, Consumerista, Empresarial, Tributário,
  Trabalhista, Previdenciário, Administrativo, Licitação, Compliance, Due Diligence, Contratual,
  Responsabilidade Civil, Execuções.
- `sources`: URLs reais das páginas lidas, uma por linha no banco.

---

## 5. Fases de implementação

### Fase 0: sincronizar e confirmar o terreno (sem escrever código)
1. `git fetch origin main -q` e crie a branch a partir de `origin/main`.
2. Releia os arquivos da seção 1 e confirme que nada mudou.
3. Teste o Firecrawl a partir de um script local, com a chave vinda do ambiente e **nunca colada no
   código**. Faça `lerPagina` em cada página de listagem candidata:
   - `https://www.migalhas.com.br/quentes`
   - `https://www.conjur.com.br/`
   - `https://noticias.stf.jus.br/`
   - a página de últimas notícias do STJ e do TST (descubra a URL atual com
     `buscarNaWeb("últimas notícias site:stj.jus.br")`)
   - `https://www.jusbrasil.com.br/noticias/`

   Anote quais devolvem markdown útil. **As URLs acima são ponto de partida, não verdade.** Fixe no
   código só as que funcionarem.
4. **Saída:** um relatório curto ao dono com o que funciona, o que não funciona e quantos créditos
   um ciclo deve gastar. Só siga com a lista de fontes validada.

### Fase 1: schema de agendamento (aditivo, seguro para `db push`)
Em `model BlogPost`, **só acrescente campos opcionais** (o build de produção roda
`prisma db push`, e o projeto não tem pasta `migrations`):
```prisma
agendadaPara    DateTime?   // quando AGENDADO: momento de publicar
agendadaPorId   String?
agendadaPor     User?       @relation("BlogPostAgendador", fields: [agendadaPorId], references: [id])
origem          String?     // "ROBO_RADAR" | "API_MANUAL" | null (legado)
@@index([status, agendadaPara])
```
- Novo valor de `status`: `AGENDADO` (é string, não enum; documente no comentário do modelo).
- Adicione a relação inversa em `User`.
- **Saída:** `npx prisma validate` e `npx tsc --noEmit -p .` limpos.

### Fase 2: biblioteca pura do robô, `lib/radarJuridico.ts` (sem rede, sem Prisma)
Funções puras e testáveis:
- `AREAS_DO_BLOG` (lista da seção 4.5) e `areaValida(area)`.
- `PORTAIS_JURIDICOS` (domínios migalhas.com.br, conjur.com.br, jusbrasil.com.br/noticias) e
  `ehOficial(url)` (`*.jus.br`, `planalto.gov.br`, `in.gov.br`, `camara.leg.br`, `senado.leg.br`).
- `validarFontes({ fontes, temDecisaoJudicial })` → `{ ok: true } | { ok: false, motivo }`,
  implementando a seção 4.4.
- `normalizarTitulo` e `ehDuplicata(candidato, existentes)`. **Extraia** a lógica de
  `app/api/blog/draft/route.ts` (título normalizado igual **ou** URL de fonte igual, janela de 60
  dias, incluindo rejeitados e excluídos) para cá. Faça a rota passar a usar a mesma função, para
  não haver duas regras.
- Limites: título ≤ 180, summary ≤ 400, content ≤ 12.000 caracteres.

Aproveite para fechar os buracos da API legada: `POST /api/blog/draft` passa a recusar com 400
`area` fora da lista, campos acima do limite e `sources` com menos de 2 URLs.

**Testes:** `lib/testes/radarJuridico.teste.ts`, no estilo de `lib/testes/executar.ts`:
- matéria com decisão judicial e só portal → recusa;
- sem `*.jus.br` → recusa;
- 2 fontes do mesmo domínio → recusa;
- lei com `planalto.gov.br` + Conjur → aceita;
- área fora da lista → recusa;
- título duplicado com acento/caixa diferente → duplicata;
- mesma URL de fonte → duplicata.

### Fase 3: orquestração, `lib/radarJuridicoExecutar.ts` (com rede e Prisma)
Ciclo, com teto de chamadas e de tempo (deixe 30s de folga do `maxDuration`):
1. **Memória:** carregue os `BlogPost` do escritório interno (`getPlatformOffice()` de
   `lib/officeModules.ts`) dos últimos 60 dias, em qualquer status.
2. **Varredura:** `lerPagina` nas listagens validadas na Fase 0. Extraia manchete + URL de cada item.
3. **Triagem (Claude):** envie a lista de manchetes (não o conteúdo inteiro) + as regras 4.2/4.3.
   Peça no máximo 6 candidatos, em JSON estrito:
   `[{ manchete, url, area, type, temDecisaoJudicial, tribunal }]`. Descarte os que `ehDuplicata`
   já pegar.
4. **Validação por candidato:**
   - `lerPagina(url)` da fonte original.
   - Se `temDecisaoJudicial`: `buscarNaWeb("<tema> site:<domínio do tribunal>")`, depois
     `lerPagina` no melhor resultado oficial. Sem página oficial lida, **descarta**.
   - Se a original é oficial, busque o portal (Migalhas/Conjur/Jusbrasil) do mesmo fato.
   - Rode `validarFontes`. Reprovou, descarta e registra o motivo.
5. **Redação (Claude):** entregue o markdown das fontes lidas + as regras 4.4/4.5. Resposta em JSON
   estrito `{ title, area, type, summary, content, divergencia: string|null }`. Rejeite a resposta
   (não grave) se o JSON for inválido, se `areaValida` falhar ou se os limites estourarem.
   **O prompt proíbe número de processo, ementa ou citação que não esteja no markdown fornecido.**
6. **Gravação:** `prisma.blogPost.create` com `status: "AGUARDANDO_REVISAO"`,
   `origem: "ROBO_RADAR"`, `sources` = URLs lidas juntadas por `\n`, e slug no mesmo formato da rota
   (`app/api/blog/draft/route.ts`: kebab sem acento, base ≤ 80 caracteres + 6 hex).
7. **Log:** um `console.info` estruturado por ciclo: candidatos, descartados (com motivo), gravados,
   chamadas Firecrawl usadas. Nunca logue chave nem conteúdo inteiro.

### Fase 4: crons
- `app/api/cron/radar-juridico/route.ts`: `GET`, `export const maxDuration = 300`,
  `dynamic = "force-dynamic"`, auth `CRON_SECRET` (fail-closed), respeita `RADAR_JURIDICO_ATIVO`.
- `app/api/cron/blog-publicar-agendadas/route.ts`: `GET`, `maxDuration = 60`, auth `CRON_SECRET`.
  Faz `updateMany` de `status: "AGENDADO", agendadaPara <= now, excluidaEm: null` para
  `status: "PUBLICADO", publishedAt: agendadaPara`. Depois chama `revalidatePath("/blog")` e o slug
  de cada post publicado.
- Em `vercel.json` → `crons`:
  ```json
  { "path": "/api/cron/radar-juridico", "schedule": "0 9 * * *" },
  { "path": "/api/cron/blog-publicar-agendadas", "schedule": "*/15 * * * *" }
  ```
  Cron da Vercel é em **UTC**: `0 9 * * *` = **06:00 em Brasília**. Rascunhos ficam prontos antes
  do expediente.

### Fase 5: aprovação e agendamento na tela
Em `lib/actions/blog.ts` (mesmo padrão `assertBlogAdmin()`, escopo `officeId` + `excluidaEm: null`,
`revalidatePath`):
- `scheduleBlogPost(id, agendadaParaISO, imageUrl?)`: exige data futura (≥ agora + 5 min), grava
  `status: "AGENDADO"`, `agendadaPara`, `agendadaPorId`, `reviewedById`, `reviewedAt`.
- `unscheduleBlogPost(id)`: volta para `AGUARDANDO_REVISAO` e limpa o agendamento.
- `publishBlogPost` continua publicando **agora** e limpa `agendadaPara`.

Na UI (`components/BlogReviewManager.tsx` e a versão mobile em `app/m/configuracoes/page.tsx`):
- botão **"Agendar…"** ao lado de "Publicar", com `<input type="datetime-local">` exibido no fuso
  **America/Sao_Paulo** e convertido para UTC ao gravar;
- nova aba **"Agendadas (N)"** em `?secao=blog&blogTab=agendadas`, listando `status: "AGENDADO"` por
  `agendadaPara asc`, com "Cancelar agendamento" e "Publicar agora";
- selo "Robô" nos cartões com `origem = "ROBO_RADAR"`.

O blog público **não muda**: continua lendo só `PUBLICADO`. Agendado nunca vaza antes da hora.

### Fase 6: aviso de rascunhos novos
Ao fim do ciclo, se gravou ≥ 1 rascunho, envie **um** e-mail por admin com `blogAccess` do
escritório interno, via `sendSimpleEmail(to, subject, html)` de `lib/email.ts`:
- assunto: `Blog: N matéria(s) aguardando revisão`;
- corpo: títulos + área + link para `/configuracoes?secao=blog&blogTab=revisao`.

Falha de e-mail **não** derruba o cron. Registre e siga.

### Fase 7: desligar o robô antigo (só depois de 3 dias úteis do novo rodando bem)
1. Peça ao dono para **desativar a Routine** do `rp-radar-juridico` no claude.ai. O agente não
   deve apagar Routines por conta própria.
2. Substitua o conteúdo de `.claude/skills/rp-radar-juridico/SKILL.md` por um aviso de
   descontinuação que aponte para este documento e para o cron `/api/cron/radar-juridico`. Remova o
   gatilho "roda o robô de conteúdo jurídico" da descrição, para ele não ser mais acionado.
3. `/api/blog/draft` **continua existindo** como entrada manual (útil para colar uma pauta
   pontual), com as validações novas da Fase 2.
4. Atualize `docs/CONTEXTO-COMPLETO-PROJETO.md` §13 e `.env.example`. Acrescente
   `BLOG_ROBOT_SECRET=` (hoje ausente) e `RADAR_JURIDICO_ATIVO=`, só os nomes.

---

## 6. Verificação antes do PR (gate do CLAUDE.md)
```bash
rm -rf .next && npx tsc --noEmit -p .
npx eslint <arquivos alterados>
npm run testar
npx next build
```
Se o build falhar só no pré-render que precisa do banco (ambiente sem acesso ao Neon), **diga isso
no PR e não mergeie sozinho**. Deixe a decisão para o dono.

Teste manual depois do deploy de preview:
1. `curl -H "Authorization: Bearer $CRON_SECRET" https://<preview>/api/cron/radar-juridico` gera
   rascunhos com ≥ 2 fontes cada.
2. Agendar um rascunho para daqui a 20 min: ele some da aba Revisão, aparece em Agendadas e, após o
   cron de 15 min, aparece em `/blog`.
3. Sem `CRON_SECRET` no header → 401. Com `RADAR_JURIDICO_ATIVO=0` → `{ executado: false }`.

## 7. Critérios de aceite
- [ ] Nenhum rascunho gravado sem 2 fontes lidas e aprovadas por `validarFontes`.
- [ ] Nenhum post aparece em `/blog` sem ação de um admin (publicar ou agendar).
- [ ] Agendamento publica no horário (tolerância: 15 min) e respeita o fuso de Brasília na tela.
- [ ] Admins recebem e-mail quando há rascunho novo.
- [ ] Tudo desliga com `RADAR_JURIDICO_ATIVO=0` sem deploy.
- [ ] Routine antiga desativada pelo dono e skill marcada como descontinuada.
- [ ] Nenhum segredo no diff (`git diff | grep -i "fc-\|sk-ant"` vazio).
- [ ] Commit e PR em português, detalhando causa raiz, impacto e correção (padrão do repositório).
