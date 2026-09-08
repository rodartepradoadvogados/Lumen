# Roteiro de implementação — Auditoria Gauntlet, setembro de 2026

> **Para quem está lendo isto pela primeira vez:** este documento é autossuficiente. Ele traz
> o diagnóstico, os 45 achados verificados, a ordem de execução e, para cada achado, o passo a
> passo de implementação, como verificar e o que pode dar errado. Não é preciso ter
> acompanhado a auditoria nem ter acesso ao relatório visual para trabalhar a partir daqui.

| | |
|---|---|
| **Projeto** | Lúmen — SaaS jurídico multi-tenant (`rodartepradoadvogados/lumen`) |
| **Data da auditoria** | setembro de 2026 |
| **Método** | gauntlet-loop: 12 lentes independentes auditam → consolidação → votação cruzada → síntese |
| **Achados brutos** | 96 |
| **Candidatos após deduplicar** | 45 (37 eram repetição entre lentes) |
| **Aprovados com 100% (12/12)** | 44 |
| **Aprovados na faixa 90–95%** | 1 (G38, 11/12 = 91,7%) |
| **Reprovados no voto** | 0 |
| **Relatório visual** | https://claude.ai/code/artifact/b4bb0132-5f30-40e0-80c5-b10210b8cbca |

As 12 lentes: juiz · promotor · advogado · estagiário · engenharia de software · engenharia de
dados · cibersegurança · frontend · backend · SaaS/startup · gestão de escritório · assistente
de IA. Cada lente votou em **todos** os 45 candidatos, com a regra de conferir arquivo e linha
no código antes de concordar, e de votar contra quando não conseguisse verificar.

---

## 0. Regras de trabalho neste repositório

**Leia esta seção inteira antes de tocar em qualquer arquivo.** Ela não é opcional: metade dos
achados abaixo nasceu de um padrão certo que existia no projeto e não foi seguido em algum lugar.

### 0.1 Onde o código vive

- Repositório: `rodartepradoadvogados/lumen`. Checkout local em `/home/user/lumen`.
- **Não existe pasta raiz em RP Financeiro.** Tudo aponta para o Lúmen. As pastas legadas de
  "RP Financeiro" são resíduo inerte aguardando exclusão manual — nada é direcionado para lá,
  nenhum caminho de código resolve para lá, e nenhum documento deve descrevê-las como ativas.
- Stack: Next.js 14 (App Router), TypeScript, Prisma + Postgres (Neon), deploy na Vercel,
  Tailwind com design system próprio.
- Grupos de rota: `app/(app)/**` é o site (desktop), `app/m/**` é o PWA (celular),
  `app/api/**` são rotas HTTP e crons. **Quase toda funcionalidade existe nos dois primeiros** —
  corrigir só um lado é meio conserto.
- Multi-tenant por `Office.officeId`. Toda consulta filtra por `officeId`, sem exceção.
- Armazenamento é abstraído: use `lib/storageProvider.ts`, que despacha para
  `lib/googleDrive.ts` / `lib/oneDriveStorage.ts` / `lib/dropboxStorage.ts` conforme
  `Office.storageProvider`. Importar `lib/googleDrive.ts` direto amarra o código ao Google.

### 0.2 Portão de verificação — obrigatório antes de qualquer commit

```bash
cd /home/user/lumen
rm -rf .next && npx tsc --noEmit -p .
npx eslint <arquivos que você alterou>
npx next build
```

Não existe workflow de CI neste repositório (`.github/workflows` não existe). **Esses três
comandos SÃO o gate completo.** Se algum falhar, não commite.

### 0.3 Branch, commit, PR, merge

1. Sincronizar antes de começar: `git fetch origin main -q && git log -1 --oneline origin/main`.
   Nunca assuma que um checkout local está atualizado.
2. Criar branch a partir de `origin/main`, uma por achado ou por grupo coeso de achados.
3. Mensagem de commit e PR **em português**, detalhando causa raiz, impacto e correção — é o
   estilo já usado no histórico. Cite o ID do achado (`G07`) no título.
4. Rodar o portão de verificação.
5. Push com `git push -u origin <branch>`; em falha de rede, tentar de novo com espera
   crescente (2s, 4s, 8s, 16s).
6. Abrir o PR pronto para revisão (não rascunho).
7. **Merge automático é autorizado** pelo dono do projeto para PRs abertos pelo Claude, desde
   que o portão passe limpo — inclusive para mudanças em `prisma/schema.prisma`. Ver `CLAUDE.md`.
   Não é preciso pedir permissão antes; é obrigatório avisar depois o que foi feito.
8. Depois do merge, conferir na Vercel que o deploy de produção ficou `READY`.

### 0.4 Banco de dados

- O projeto usa `prisma db push` puro. **Não há pasta `prisma/migrations` versionada.**
- O script de build (`package.json`) roda `prisma generate && next build` e, quando
  `$VERCEL_ENV = production`, também `npx prisma db push`. Ou seja: o schema sincroniza sozinho
  no build de produção, antes de o deploy virar o tráfego.
- **Consequência prática:** um preview de PR passar **não é** prova de que a migração funciona.
  Só o build de produção roda o `db push`. Verifique o deploy do commit de merge.
- **Consequência perigosa:** se o `db push` falhar (por exemplo, ao criar uma `@@unique` sobre
  dados que já têm duplicata, ou uma FK sobre ids órfãos), **o deploy de produção quebra**.
  Sempre rode uma varredura de leitura antes de mergear schema que aperta restrição.
- **Não há acesso ao banco de produção a partir do ambiente de desenvolvimento.** Para backfill
  e varredura, o padrão estabelecido é uma rota GET de administração protegida por
  `getCurrentUser()?.isPlatformOwner`, com `dynamic = "force-dynamic"`, `maxDuration` e
  `Cache-Control: no-store`. O molde pronto é `app/api/admin/backfill-phone-ddi/route.ts`.
  O dono abre a URL logado e a rota devolve o que fez.

### 0.5 Design system

- Fonte única de verdade: `app/globals.css` (tokens) + `tailwind.config.ts` (escalas) +
  `docs/DESIGN-SYSTEM.md` (a especificação escrita).
- **Nenhum hex vive dentro de um componente.** Ou vem de um token, ou vem da escala do Tailwind.
- Bordô `#8a2f42` (`--acao` / `--marca`) é a **única** cor de ação e marca do produto.
  `--vinho` (#ae1800) é exclusivo de ação destrutiva. `--ouro-acento` é acento pontual e raro.
- `--urgente`, `--aviso`, `--concluido` são **dado** (algo venceu, algo alerta, algo concluiu),
  nunca decoração.
- Bordô sobre superfície escura é sempre `--rail-marca`, nunca `--marca` — é exatamente o
  achado **G45**.
- Dois temas e só dois: Manhã (`:root`) e Noite (`.dark`). **Confira sempre os dois** antes de
  fechar uma mudança de cor.
- Escala de raio: 4px em chip/badge, 6px em botão/campo, 10px em card, linha de lista, modal e
  painel flutuante.

### 0.6 Convenções do código

- **Comentários em português explicando o porquê**, não o quê. O repositório inteiro segue isso
  e é o que permite a próxima pessoa entender uma decisão sem arqueologia. Ao corrigir um
  achado, deixe no código o comentário que impede a regressão.
- Server Actions devolvem `{ error }`; não deixe exceção subir crua para a tela.
- `revalidatePath` precisa cobrir **desktop e mobile** quando a ação afeta as duas.
- Padrão fail-closed para tudo que vem de fora (webhook, callback OAuth, cron): recusar quando
  o segredo não estiver configurado. Referência correta no código: `CRON_SECRET`.
- Auto-cura de pasta no Drive: antes de reusar um id em cache, chamar `getDriveFileInfo`; se
  voltar `null` ou `trashed`, recriar; se a checagem em si falhar, devolver o id em cache
  (best-effort).
- Nunca commitar segredo real — nem em código, nem em `.env.example`, nem em seed, nem em doc.

### 0.7 Como usar este roteiro

1. Leia o diagnóstico (seção 1). Ele explica **por que** os achados se parecem.
2. Escolha o próximo item pela ordem da seção 3, não pela numeração dos IDs.
3. Abra a ficha do achado na seção 4 e siga: *Passo a passo* → *Como verificar* → *Cuidados*.
4. Confirme cada afirmação no código antes de agir. As linhas citadas eram verdadeiras na data
   da auditoria; se o arquivo mudou desde então, **o código manda, não este documento**.
5. Marque o achado como feito editando a seção 3 (a caixa `[ ]` vira `[x]`) no mesmo PR.

---

## 1. Diagnóstico

*(texto da síntese da auditoria, verbatim)*

O Lúmen já é um produto de verdade, e isso precisa ser dito antes de tudo: o modelo de dados é rico e bem pensado (multi-tenant por escritório, trilha de acesso de suporte, plano de contas, honorários, licitações, outbox de notificação), a integração com Drive/DJEN/Asaas funciona, o design system existe e é seguido, e em vários pontos o código traz o padrão certo já implementado — `requireFinanceOfficeId` no Financeiro, `payments: { none: {} }` nas exclusões, `sanitizeExternalUrl` nos links, `Intl.DateTimeFormat` com fuso de Brasília, round-robin no sync do Drive, índices de roteamento montados uma vez só no robô. O problema quase nunca é que a solução certa não foi pensada. É que ela foi aplicada em alguns lugares e não em todos.

Esse é o padrão por trás de praticamente todo o conjunto: proteção parcial. O módulo não contratado é escondido no menu mas continua entregando a planilha pela rota de exportação (G01). O usuário desativado perde o menu mas o cookie dele continua valendo 30 dias em toda Server Action (G05). A exclusão de série protege a parcela paga em três ramos e apaga o caixa nos outros dois (G11, G34). O link malicioso é barrado em Tarefa e Processo e passa em Anexo e Assessoria (G29). O prazo de segurança existe na agenda do desktop e não existe no celular, no e-mail nem no push (G07). O contraste é resolvido no NavRail com o token certo e ignorado nas outras nove telas (G45). Para o escritório isso é pior do que ausência de controle, porque a tela diz que o controle existe: o sócio desliga o acesso do estagiário, vê o toggle apagar, e o acesso continua de pé.

O segundo padrão é a falha silenciosa. Nada no sistema grita quando dá errado. A fila de notificação reenvia o mesmo e-mail a cada 15 minutos até alguém apagar linha na mão (G14); a despesa recorrente para de ser gerada e ninguém percebe até a conta não ser paga (G35); o e-mail de publicação que falhou no parse é perdido para sempre porque o cursor já passou da data dele (G13); a publicação importada com número de processo digitado errado nunca chega no processo certo e nada acusa (G24); o prazo cadastrado sem responsável não gera aviso nenhum até já estar vencido (G09). Num escritório, prazo perdido não é bug de software, é perda de direito do cliente e responsabilidade civil — e hoje o Lúmen erra sempre na direção perigosa: o prazo sugerido de 15 dias fixos contado da disponibilização sai maior que o legal (G02), o feriado municipal de Goiânia empurra o prazo de um processo de São Paulo para depois do vencimento real (G22), e o assistente de IA responde "não encontrei nada atrasado" porque só olha para frente (G44).

O terceiro ponto é o mais desconfortável comercialmente: o Lúmen está pronto para ser usado e não está pronto para ser vendido. Quem se cadastra sozinho pelo site recebe os quatro módulos ligados, de graça, sem plano, sem assinatura e sem prazo de teste (G15), e nenhuma fatura mensal é gerada por conta própria — cobrar é um clique manual por escritório, todo mês (G16). Enquanto isso a chave de IA é única da plataforma, sem cota e sem medição por escritório, com a tabela `TenantUsage` criada para isso e nunca escrita (G08). O Painel Mestre mostra receita e não mostra custo. A soma disso é que hoje a alavanca comercial do produto — ligar e desligar módulo, cobrar, suspender — não segura nada nem do lado do dado nem do lado do dinheiro. A boa notícia é que a maioria dessas correções é pequena e cirúrgica: a mais importante delas, a checagem de usuário ativo, é literalmente uma linha em `lib/currentUser.ts` que fecha 228 pontos de uma vez.

---

## 2. Os seis temas

Os 45 achados não são 45 problemas independentes. Eles se agrupam em seis histórias:

### 2.1 Portas sem tranca

O controle de acesso existe na navegação e na tela, mas não no lugar que decide de verdade: Server Actions e rotas de API. Usuário desligado, módulo não contratado, sessão de suporte e cargo sem permissão continuam alcançando o dado.

**Achados (8, sendo 4 P0):** [G01](#g01) · [G04](#g04) · [G05](#g05) · [G12](#g12) · [G20](#g20) · [G28](#g28) · [G30](#g30) · [G31](#g31)

### 2.2 Documento do cliente circulando solto

Todo arquivo que sobe pelo Lúmen nasce com link público sem expiração e sem revogação, o rascunho de petição some numa pasta genérica, e a trilha de auditoria que provaria conformidade registra apenas a si mesma.

**Achados (5, sendo 1 P0):** [G03](#g03) · [G26](#g26) · [G27](#g27) · [G29](#g29) · [G40](#g40)

### 2.3 O prazo, que é o ativo mais caro do escritório

O cálculo do prazo é genérico e erra sempre para o lado perigoso, e o aviso depende de condições que falham em silêncio — sem responsável, no celular, na véspera, em licitação e em processo parado, ninguém é avisado.

**Achados (12, sendo 4 P0):** [G02](#g02) · [G07](#g07) · [G09](#g09) · [G10](#g10) · [G22](#g22) · [G23](#g23) · [G24](#g24) · [G25](#g25) · [G41](#g41) · [G42](#g42) · [G43](#g43) · [G44](#g44)

### 2.4 O caixa e o número que o sócio lê

Dinheiro já recebido pode ser apagado sem trava e sem rastro, a tela de cobrança esconde a inadimplência de meses anteriores, e o assistente informa totais calculados com regra própria que não bate com nenhuma tela.

**Achados (6, sendo 2 P0):** [G06](#g06) · [G11](#g11) · [G33](#g33) · [G34](#g34) · [G35](#g35) · [G36](#g36)

### 2.5 O SaaS que entrega, não cobra e não mede

O cadastro público libera o produto inteiro sem plano, sem teste e sem assinatura; nenhuma fatura mensal é gerada automaticamente; e o custo de IA por escritório não é medido nem limitado.

**Achados (4, sendo 3 P0):** [G08](#g08) · [G15](#g15) · [G16](#g16) · [G18](#g18)

### 2.6 Encanamento que falha calado e acabamento do dia a dia

Crons que reenviam em laço, cursores que perdem e-mail de publicação, uploads em série que estouram o tempo, tabelas sem índice e horários no fuso errado — somados a duas falhas de contraste no tema padrão, incluindo a aba ativa invisível no app.

**Achados (10, sendo 3 P0):** [G13](#g13) · [G14](#g14) · [G17](#g17) · [G19](#g19) · [G21](#g21) · [G32](#g32) · [G37](#g37) · [G38](#g38) · [G39](#g39) · [G45](#g45)

---

## 3. Ordem de execução

A ordem abaixo é a recomendada pela síntese da auditoria e considera dependências reais entre
os itens (por exemplo: registrar quem exportou só faz sentido depois de barrar quem pode
exportar). **Siga esta ordem, não a numeração dos IDs.**

Marque `[x]` conforme concluir, no mesmo PR da correção.

### Fase 1 — fecha a torneira

*As travas que hoje deixam dado sair e dinheiro sumir. São, na maioria, consertos pequenos e cirúrgicos. Nada abaixo deve ser feito antes destes.*

12 itens · 7 P0 · 5 P1

| | # | ID | Título | Sev. | Esforço | Risco |
|---|---|---|---|---|---|---|
| [x] | 1 | [G05](#g05) | Desativar um membro não derruba a sessão dele | P0 | P | baixo |
| [x] | 2 | [G11](#g11) | Excluir série recorrente apaga parcela paga parcialmente e leva o caixa junto | P0 | P | baixo |
| [ ] | 3 | [G34](#g34) | Excluir conta já baixada apaga o pagamento em cascata, sem trava e sem registro | P1 | P | baixo |
| [ ] | 4 | [G04](#g04) | O robô de publicações casa número de processo entre todos os escritórios | P0 | M | medio |
| [ ] | 5 | [G02](#g02) | Prazo sugerido é sempre 15 dias úteis fixos e conta da disponibilização | P0 | M | medio |
| [ ] | 6 | [G09](#g09) | Prazo sem responsável não dispara notificação nenhuma até já estar vencido | P0 | P | baixo |
| [ ] | 7 | [G07](#g07) | O prazo de segurança só existe no calendário do desktop | P0 | M | medio |
| [ ] | 8 | [G30](#g30) | Plano de contas e contas bancárias editáveis por qualquer usuário do escritório | P1 | P | baixo |
| [ ] | 9 | [G20](#g20) | Sessão de suporte herda financeAccess do dono da plataforma | P1 | P | baixo |
| [ ] | 10 | [G31](#g31) | Qualquer membro da plataforma pode suspender escritório e dar fatura por paga | P1 | P | baixo |
| [ ] | 11 | [G01](#g01) | Módulo não contratado só é barrado na navegação | P0 | M | medio |
| [ ] | 12 | [G29](#g29) | Link colado em anexo e em documento de Assessoria aceita javascript: | P1 | P | baixo |

### Fase 2 — o prazo e o caixa

*Onde o erro do sistema vira perda de direito do cliente ou perda de receita do escritório.*

12 itens · 7 P0 · 5 P1

| | # | ID | Título | Sev. | Esforço | Risco |
|---|---|---|---|---|---|---|
| [ ] | 13 | [G12](#g12) | Login e recuperação de senha sem trava de tentativas | P0 | M | medio |
| [ ] | 14 | [G14](#g14) | A fila de notificações só marca como enviada no fim do lote | P0 | P | baixo |
| [ ] | 15 | [G37](#g37) | Notificação enfileirada sem await em oito pontos | P1 | P | baixo |
| [ ] | 16 | [G13](#g13) | O cursor do sync de e-mail é a publicação mais recente de qualquer fonte | P0 | M | medio |
| [ ] | 17 | [G03](#g03) | Todo arquivo recebe permissão pública no ato do upload | P0 | G | alto |
| [ ] | 18 | [G36](#g36) | O importador grava status ATRASADO e essas contas nunca disparam cobrança | P1 | P | baixo |
| [ ] | 19 | [G33](#g33) | Contas a Pagar e Receber filtram por mês corrente mesmo na aba Abertas | P1 | P | baixo |
| [ ] | 20 | [G06](#g06) | O assistente soma contas pagas e canceladas e informa total de 20 linhas | P0 | M | baixo |
| [ ] | 21 | [G08](#g08) | Histórico cru do navegador no assistente, sem teto e sem medição por escritório | P0 | M | medio |
| [ ] | 22 | [G21](#g21) | Horário de notificação calculado no fuso do servidor | P1 | P | baixo |
| [ ] | 23 | [G17](#g17) | O ícone da aba ativa da barra inferior fica invisível no tema claro | P0 | P | baixo |
| [ ] | 24 | [G45](#g45) | Cores do tema claro reprovam contraste em 9 telas e no terceiro nível de texto | P1 | P | baixo |

### Fase 3 — encanamento e cobrança

*O que falha calado (crons, cursores, filas) e o que ainda impede o produto de ser vendido.*

10 itens · 3 P0 · 7 P1

| | # | ID | Título | Sev. | Esforço | Risco |
|---|---|---|---|---|---|---|
| [ ] | 25 | [G32](#g32) | Nenhuma coluna de chave estrangeira tem índice | P1 | P | baixo |
| [ ] | 26 | [G16](#g16) | Nenhuma fatura mensal é gerada automaticamente | P0 | M | medio |
| [ ] | 27 | [G15](#g15) | O cadastro público entrega os quatro módulos de graça, para sempre | P0 | M | medio |
| [ ] | 28 | [G10](#g10) | Prazo final e abertura de licitação não entram na Agenda nem nos alertas | P0 | M | medio |
| [ ] | 29 | [G24](#g24) | Número de processo entra sem validação de dígito verificador CNJ | P1 | P | baixo |
| [ ] | 30 | [G23](#g23) | Duas intimações do mesmo processo no mesmo dia viram um card só | P1 | M | medio |
| [ ] | 31 | [G22](#g22) | Feriado do escritório vale para processo de qualquer tribunal | P1 | M | medio |
| [ ] | 32 | [G41](#g41) | A Central de Alertas lista prazos vencidos sem dizer de quem é cada um | P1 | P | baixo |
| [ ] | 33 | [G44](#g44) | O assistente só olha para frente: prazo vencido e de hoje são invisíveis | P1 | P | baixo |
| [ ] | 34 | [G25](#g25) | Alterar a data de um prazo não deixa rastro | P1 | M | baixo |

### Fase 4 — gestão e refino

*Indicadores de gestão, higiene de dados e os projetos maiores, que se apoiam em tudo acima.*

11 itens · 0 P0 · 11 P1

| | # | ID | Título | Sev. | Esforço | Risco |
|---|---|---|---|---|---|---|
| [ ] | 35 | [G42](#g42) | Processo parado é invisível: nenhum alerta ou filtro aponta caso sem movimentação | P1 | M | baixo |
| [ ] | 36 | [G43](#g43) | O sistema nunca compara data de conclusão com o prazo | P1 | P | baixo |
| [ ] | 37 | [G35](#g35) | Despesa recorrente para de ser gerada em silêncio | P1 | M | medio |
| [ ] | 38 | [G26](#g26) | Documento transita por URL pública do Blob e a limpeza é dispara-e-esquece | P1 | M | baixo |
| [ ] | 39 | [G27](#g27) | A trilha de auditoria da LGPD registra apenas a exportação da própria trilha | P1 | M | baixo |
| [ ] | 40 | [G40](#g40) | Peticionar gera a petição em pasta genérica, sem vínculo com o processo | P1 | P | baixo |
| [ ] | 41 | [G39](#g39) | A página do processo carrega tudo em toda visita e cada aba recarrega de novo | P1 | M | medio |
| [ ] | 42 | [G38](#g38) | Criar processo com anexos sobe arquivos em série dentro de 60s | P1 | M | medio |
| [ ] | 43 | [G19](#g19) | O sync de publicações relê a base a cada item e percorre escritórios em série | P1 | G | medio |
| [ ] | 44 | [G18](#g18) | Filtros e etiquetas de advogado cravados em Jairo e Rodrigo | P1 | M | baixo |
| [ ] | 45 | [G28](#g28) | O cargo do usuário é rótulo decorativo e não existe processo sigiloso | P1 | G | alto |

**Legenda de esforço:** P = pequeno (horas) · M = médio (1–2 dias) · G = grande (vários dias).

### Agrupamentos sugeridos de PR

Alguns itens são o mesmo trabalho e devem ir juntos; outros parecem próximos e devem ir
separados. As recomendações estão nos *Cuidados* de cada ficha, e as principais são:

- **G11 + G34** — mesmo tema (dinheiro apagado sem trava), mesmo arquivo.
- **G03 dividido em dois PRs** — etapas 1–3 (parar de publicar + rota autenticada) e 4–6
  (link com expiração + varredura do passado). Juntas são grandes demais para revisar.
- **G03 + G26 + G40** — as três pontas do mesmo problema (arquivo do cliente acessível sem
  autenticação). G40 depende de G03 para a parte da permissão.
- **G32 antes de G39** — os índices multiplicam o ganho da otimização da página do processo.
- **G13 antes de G19** — não adianta acelerar uma varredura que perde e-mail.
- **G25 antes de G43** — sem trilha de alteração de prazo, o indicador de cumprimento pode ser
  fabricado movendo a data.
- **G15 + G16** — plano no cadastro e fatura automática são as duas metades da mesma coisa.
- **G19 dividido em dois PRs** — índices em memória, depois round-robin e orçamento de tempo.
- **G28 por último e sozinho** — é o maior projeto e o de maior risco; apoia-se em todos os
  itens 1 a 12 estarem prontos.

---

## 4. Fichas de implementação

Cada ficha traz, nesta ordem: o cabeçalho de identificação; **o que acontece** e **a correção
aprovada** (texto verbatim da auditoria, para não se perder nada na tradução); os **arquivos**
citados; o **passo a passo**; **como verificar**; e os **cuidados**.

---

<a id="g05"></a>

### G05 · Desativar um membro não derruba a sessão dele: o cookie continua valendo por até 30 dias em toda Server Action e rota de API

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Segurança |
| **Tema** | Portas sem tranca |
| **Posição na fila** | 1 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | promotor, ciberseguranca |

**Arquivos citados**

```
lib/currentUser.ts:43-44; lib/auth.ts:17-22; app/api/admin/export-office/route.ts:23
```

#### O que acontece

Verificado: getCurrentUser faz prisma.user.findUnique e devolve o usuário sem nenhuma checagem de active. Quem confere active são os layouts (app/(app)/layout.tsx:35, app/m/layout.tsx:56), que não rodam antes de Server Action nem de Route Handler. O JWT vale 30 dias, não há revogação nem sessão em banco, e trocar a senha também não invalida nada. Na prática, o advogado ou estagiário desligado — cujo acesso o sócio "cortou" no toggle de Configurações — continua podendo chamar GET /api/admin/export-office e baixar a planilha com todos os clientes (nome, CPF/CNPJ, endereço, telefone), processos, atendimentos, tarefas, contas a pagar/receber, honorários e os links dos anexos, além de /api/financeiro/export, o .zip de protocolos e as Server Actions de edição e exclusão.

#### Correção aprovada pela auditoria

Mover o gate para dentro de getCurrentUser: depois do findUnique, `if (!realUser.active) return null` — o app inteiro já trata null como sessão inválida, o que fecha os 228 call sites de uma vez. Complementar com revogação real: um sessionEpoch/sessionsValidFrom em User, incluído como claim e conferido em verifySession, incrementado ao inativar, ao trocar senha e no logout de todos os aparelhos; e reduzir a expiração do JWT.

#### Por que nesta posição da fila

É a correção de maior alcance por menor esforço do conjunto inteiro: uma verificação de `active` dentro de getCurrentUser fecha de uma vez todos os 228 pontos onde hoje um advogado ou estagiário desligado continua podendo exportar a base do escritório. Enquanto não for feita, qualquer outra trava de permissão que você adicionar continua com essa porta aberta atrás dela.

#### Passo a passo

1. **A correção principal é uma linha.** Em `lib/currentUser.ts`, logo depois do `prisma.user.findUnique`, acrescentar `if (!realUser.active) return null;`. Todo o app já trata `null` como sessão inválida — isso fecha os 228 pontos de chamada de uma vez.
2. Comentar a linha explicando por que ela existe (os layouts checam `active`, mas layout não roda antes de Server Action nem de Route Handler).
3. **Revogação real (segunda parte, pode ser outro PR):** acrescentar `sessionEpoch Int @default(0)` a `User` em `prisma/schema.prisma`.
4. Incluir `sessionEpoch` como claim no JWT em `lib/auth.ts` e conferir em `verifySession`: se o claim divergir do valor no banco, a sessão é inválida.
5. Incrementar `sessionEpoch` em três lugares: `toggleUserActive` (`lib/actions/settings.ts:341`), na troca de senha, e num botão novo 'sair de todos os aparelhos'.
6. Reduzir a expiração do JWT de 30 dias para algo entre 7 e 12 horas com renovação silenciosa, se o dono concordar.

#### Como verificar

- Logar como usuário comum num navegador, inativá-lo em outro (como admin), e no primeiro navegador tentar qualquer ação — precisa cair para a tela de login.
- Com a sessão do usuário inativado, chamar `/api/admin/export-office` — precisa devolver 401/403.

#### Cuidados

- Confirme que `getCurrentUser` não é usado em algum caminho que **precisa** enxergar usuário inativo (por exemplo, tela de reativação). `grep -rn "getCurrentUser" lib/ app/ | wc -l` e revise os poucos casos suspeitos antes de mergear.
- É o item 1 da fila justamente porque é barato e fecha muito. Faça só a primeira parte num PR — não misture com a mudança de schema.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g11"></a>

### G11 · Excluir série recorrente apaga parcela paga parcialmente e leva o histórico de caixa junto

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Dados |
| **Tema** | O caixa e o número que o sócio lê |
| **Posição na fila** | 2 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | eng-dados |

**Arquivos citados**

```
lib/actions/deletion.ts:241 e :312 (comparar com :254, :290 e :326)
```

#### O que acontece

Confirmado no código: nos dois ramos de recorrência (RecurringExpense e RecurringFee) o filtro é alvo.filter(s => s.status !== "PAGO"). Uma parcela PARCIAL já tem FinancePayment lançado — dinheiro que de fato entrou ou saiu do caixa — e não é PAGO, então entra na lista de exclusão; como FinancePayment é onDelete: Cascade, o registro de caixa é apagado junto. O sócio clica em "excluir este e os seguintes" numa mensalidade de honorário da qual o cliente já pagou metade e a metade recebida desaparece do Livro Caixa, da DRE e do Fluxo de Caixa retroativamente, inclusive em meses já fechados e usados para apuração de imposto. Os outros três pontos do mesmo arquivo usam o critério certo (payments: { none: {} }) e o comentário deles explica exatamente esse risco — os dois ramos de recorrência ficaram com o critério antigo.

#### Correção aprovada pela auditoria

Trocar o filtro dos dois ramos pelo padrão já usado nas linhas 254/290/326: deleteMany com { id: { in: ... }, ...(includePago ? {} : { payments: { none: {} } }) }, ou buscar os siblings com include de payments e montar idsParaExcluir com payments.length === 0. Assim os quatro caminhos passam a ter uma regra só.

#### Por que nesta posição da fila

É perda de dado irreversível e pode acontecer hoje, num clique, num mês já fechado e usado para imposto. A correção é trocar o critério de filtro pelo que os outros três ramos do mesmo arquivo já usam — meia hora de trabalho contra um dano que não tem desfazer.

#### Passo a passo

1. Abrir `lib/actions/deletion.ts` e comparar as linhas **241** e **312** (ramos de recorrência, com o filtro errado `s.status !== 'PAGO'`) com as linhas **254**, **290** e **326**, que já usam o critério certo.
2. Trocar o filtro dos dois ramos pelo padrão correto: `deleteMany({ where: { id: { in: ids }, ...(includePago ? {} : { payments: { none: {} } }) } })`.
3. Alternativa equivalente: buscar os siblings com `include: { payments: true }` e montar `idsParaExcluir` com `payments.length === 0`.
4. Levar junto o comentário que já existe nas linhas 254/290/326 explicando o risco — os quatro caminhos passam a ter uma regra só, e o comentário evita a regressão pela terceira vez.

#### Como verificar

- Criar uma série recorrente de teste, baixar parcialmente uma parcela do meio, e usar 'excluir este e os seguintes'. A parcela PARCIAL precisa **sobrar**, e o `FinancePayment` dela precisa continuar existindo.
- Conferir o Livro Caixa antes e depois: o valor do mês não pode mudar.

#### Cuidados

- É item 2 da fila e é um dos consertos mais baratos do conjunto (troca de filtro). Não o inche com refatoração de `deletion.ts`.
- Se `includePago` for true, o comportamento destrutivo é intencional — mas aí vale o **G34** (confirmação explícita + `AuditEvent`).

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g34"></a>

### G34 · Excluir uma conta já baixada apaga o pagamento em cascata, sem travar e sem deixar registro de auditoria

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Dados |
| **Tema** | O caixa e o número que o sócio lê |
| **Posição na fila** | 3 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | eng-dados |

**Arquivos citados**

```
lib/actions/deletion.ts:84-88 e :105-119 (escopo ONLY); lib/caixaMovimentos.ts
```

#### O que acontece

No escopo ONLY não há nenhuma verificação de que a conta já foi baixada: payable.delete e receivable.delete executam direto, e como FinancePayment é onDelete: Cascade a partir das duas, todo o histórico de recebimento/pagamento é apagado junto (a proteção payments: { none: {} } existe nos ramos em lote e não aqui). Como o Livro Caixa e a DRE são calculados a partir de FinancePayment, um mês já fechado muda de valor retroativamente e não sobra rastro de que existiu aquela entrada — nem quem apagou, nem quando, nem quanto. O Livro Caixa é peça de escrituração fiscal e hoje é reescrevível sem trilha: AuditEvent, que prevê kind EXCLUSAO, nunca é escrito por nenhuma exclusão financeira.

#### Correção aprovada pela auditoria

Quando o Payable/Receivable tiver pagamentos: exigir confirmação explícita mostrando valor e data do que será apagado, e gravar auditEvent.create({ kind: "EXCLUSAO", entityType, entityId, actorId, meta: { valor, paidDate, pagamentos } }) dentro da mesma transação do delete. O mesmo vale para o ramo includePago das exclusões em série.

#### Por que nesta posição da fila

Mesma classe de dano do item anterior e no mesmo arquivo — vale corrigir na mesma passagem, enquanto o contexto está aberto. O Livro Caixa é peça de escrituração fiscal e hoje é reescrevível sem deixar rastro de quem apagou.

#### Passo a passo

1. Em `lib/actions/deletion.ts:84-88` e `:105-119` (escopo `ONLY`), `payable.delete` e `receivable.delete` executam sem verificar se a conta já foi baixada. Como `FinancePayment` é `onDelete: Cascade`, o histórico vai junto.
2. Antes do delete, carregar `payments` e, se houver algum, **exigir confirmação explícita**: a Server Action passa a receber um parâmetro `confirmadoComPagamentos: boolean` e recusa sem ele, devolvendo à tela o valor e a data do que será apagado, para o modal mostrar.
3. Gravar `auditEvent.create({ kind: 'EXCLUSAO', entityType, entityId, actorId, meta: { valor, paidDate, pagamentos } })` **dentro da mesma transação** do delete.
4. Aplicar o mesmo ao ramo `includePago` das exclusões em série.
5. Atualizar o modal de confirmação na tela para mostrar o que será apagado do caixa.

#### Como verificar

- Tentar excluir uma conta já baixada — precisa aparecer o aviso com valor e data, e a exclusão só ocorrer após confirmar.
- Conferir que a linha de `AuditEvent` foi gravada.
- Conferir que o Livro Caixa reflete a mudança e que existe rastro dela.

#### Cuidados

- É item 3 da fila junto com **G11**: os dois são o mesmo tema (dinheiro apagado sem trava). Faça-os no mesmo PR se quiser, mas mantenha o diff pequeno.
- O Livro Caixa é peça de escrituração fiscal. A trilha não é enfeite — é o que permite explicar uma diferença depois.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g04"></a>

### G04 · O robô de publicações casa número de processo entre TODOS os escritórios da plataforma — a intimação pode ser gravada na banca adversária

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Segurança |
| **Tema** | Portas sem tranca |
| **Posição na fila** | 4 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | juiz, promotor |

**Arquivos citados**

```
lib/roboBridge.ts:101-125 (carregarIndicesDeRoteamento) e :132-146 (resolverOffice)
```

#### O que acontece

Confirmado no código: o findMany de Case não filtra officeId e o índice é um Map único da plataforma inteira, alimentado com casoPorProcesso.set(normalizado, {caseId, officeId}) sem checar colisão — o último da iteração sobrescreve os anteriores. Pior, o número de processo tem precedência sobre a OAB em resolverOffice: se a publicação traz a OAB do advogado do escritório A mas o escritório B também cadastrou aquele número, a publicação (partes e teor da decisão) é gravada como Publication do escritório B. Não é hipótese remota: é o caso de duas bancas do Lúmen em polos opostos da mesma ação, ou de cliente que trocou de escritório. O dado cai na fila do concorrente sem AccessSession e sem uma linha de auditoria, e o escritório certo simplesmente não recebe a intimação — quebra de sigilo somada a risco de perda de prazo.

#### Correção aprovada pela auditoria

Trocar o Map por índice número → lista de candidatos e inverter a precedência: com OAB na publicação, quem manda é a OAB (a intimação é endereçada ao advogado); o número de processo só resolve o caseId dentro do escritório já definido. Sem OAB e com o número batendo em mais de um escritório, não rotear — contar em naoRoteados e deixar na fila de triagem. Alertar no Painel Mestre a lista de números em colisão.

#### Por que nesta posição da fila

Junta os dois piores desfechos possíveis num só bug: a intimação do seu cliente é gravada na banca adversária (quebra de sigilo) e o seu escritório não recebe a intimação (perda de prazo). Roda a cada 3 horas, sem auditoria, e o dano se acumula silenciosamente a cada escritório novo que entra na plataforma.

#### Passo a passo

1. Em `lib/roboBridge.ts:101-125` (`carregarIndicesDeRoteamento`), trocar `casoPorProcesso: Map<string, {caseId, officeId}>` por `Map<string, Array<{caseId, officeId}>>` — ao inserir, empurrar no array em vez de sobrescrever.
2. Em `resolverOffice` (`:132-146`), **inverter a precedência**: se a publicação traz OAB reconhecida, o escritório é o da OAB, ponto. O número de processo passa a servir apenas para achar o `caseId` **dentro** desse escritório.
3. Sem OAB: consultar o índice pelo número. Se a lista tiver exatamente um candidato, rotear. Se tiver mais de um, **não rotear** — incrementar `naoRoteados` e deixar o item na fila de triagem manual.
4. Acumular os números em colisão numa lista e devolvê-la no resultado da rodada; expor no Painel Mestre como 'Números de processo cadastrados em mais de um escritório'.
5. Adicionar comentário no arquivo explicando por que a OAB tem precedência (a intimação é endereçada ao advogado, não ao número).

#### Como verificar

- Teste de mesa com dois escritórios de teste cadastrando o mesmo número: publicação com OAB do escritório A precisa cair em A; publicação sem OAB precisa não cair em ninguém e contar como não roteada.
- Rodar o cron manualmente e conferir que `naoRoteados` aumentou em vez de rotear errado.

#### Cuidados

- Não filtrar o `findMany` de `Case` por `officeId` (a sugestão óbvia): o índice é global **de propósito**, porque o robô roda para a plataforma inteira numa passada. O que estava errado era a resolução de empate, não a montagem.
- Ficar mais conservador (não rotear na dúvida) aumenta a fila de triagem manual. É o comportamento correto, mas avise o dono para ele não estranhar o crescimento.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g02"></a>

### G02 · Prazo sugerido na triagem é sempre 15 dias úteis fixos e conta a partir da disponibilização, ignorando o art. 224 do CPC

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Gestão jurídica |
| **Tema** | O prazo, que é o ativo mais caro do escritório |
| **Posição na fila** | 5 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | juiz, advogado, estagiario |

**Arquivos citados**

```
lib/prazoSugerido.ts:11 e :29-31; lib/prazos.ts:97; lib/roboBridge.ts:275; components/PublicationsTriage.tsx:270 e :485; app/(app)/publicacoes/page.tsx:146
```

#### O que acontece

Toda publicação, qualquer que seja o ato, exibe "Prazo sugerido (15 dias úteis) → data" e joga essa data direto no campo de vencimento do modal de tarefa. DIAS_UTEIS_PADRAO = 15 é o único valor usado (o terceiro argumento de calcularPrazoSugerido nunca é passado); não há distinção de embargos de declaração (5 dias), prazo trabalhista (8), Juizado (dias corridos) nem prazo em dobro. E a base é a data de DISPONIBILIZAÇÃO no DJEN (roboBridge.ts:275 grava dataDisponibilizacao em publishedAt), sem o salto do art. 224 §2º (publicação = primeiro dia útil seguinte) — o resultado sai um dia útil menor que o prazo legal. O texto na tela é afirmativo e não avisa que é chute; o próprio comentário do arquivo admite que é "ponto de partida GENÉRICO", mas isso não aparece em lugar nenhum da interface. Numa triagem rápida o advogado aceita a data pronta e agenda embargos dez dias úteis depois do prazo real.

#### Correção aprovada pela auditoria

Só preencher a data depois de uma escolha explícita do tipo de prazo (contestação/apelação 15 · embargos 5 · manifestação 5 · outro N), alimentada por tabela editável em Configurações, com marcador de prazo em dobro; enquanto o tipo não for escolhido, deixar o campo vazio rotulado como "defina o prazo". Somar um dia útil da disponibilização até a publicação antes de iniciar a contagem e escrever a regra usada ao lado da data ("disponibilizado em X, publicado em Y, prazo inicia em Z"). Não sugerir prazo nenhum para itens kind=ANDAMENTO.

#### Por que nesta posição da fila

É o erro que mais provavelmente já está produzindo dano hoje, porque acontece na operação normal, sem ninguém fazer nada errado: na triagem rápida o advogado aceita a data pronta e agenda embargos dez dias úteis depois do prazo real. Corrigir isso é mais urgente que qualquer refinamento de agenda.

#### Passo a passo

1. Criar em `lib/prazoSugerido.ts` um catálogo de tipos de prazo: `export const TIPOS_DE_PRAZO = [{ chave: 'CONTESTACAO', rotulo: 'Contestação', dias: 15, uteis: true }, { chave: 'APELACAO', dias: 15 }, { chave: 'EMBARGOS_DECLARACAO', dias: 5 }, { chave: 'MANIFESTACAO', dias: 5 }, { chave: 'TRABALHISTA', dias: 8 }, { chave: 'OUTRO', dias: null }]`. `dias: null` significa que o usuário digita.
2. Acrescentar a função `dataDePublicacao(disponibilizacaoEm, feriados)` que soma **um dia útil** à disponibilização (art. 224 §2º do CPC: publicação é o primeiro dia útil seguinte à disponibilização) e devolve a data. A contagem do prazo começa no dia útil seguinte a essa data.
3. Mudar a assinatura de `calcularPrazoSugerido` para exigir o tipo escolhido: sem tipo, devolve `null` em vez de assumir 15. Remover ou marcar `@deprecated` a constante `DIAS_UTEIS_PADRAO`.
4. Em `components/PublicationsTriage.tsx:270` e `:485`, trocar o texto afirmativo 'Prazo sugerido (15 dias úteis)' por um `<select>` de tipo de prazo. Enquanto nenhum tipo for escolhido, o campo de vencimento do modal fica **vazio**, com o rótulo 'defina o prazo'.
5. Ao lado da data calculada, imprimir a memória de cálculo em uma linha: `disponibilizado em {d} · publicado em {p} · prazo de {n} dias úteis · vence em {v}`. É o que permite ao advogado conferir sem abrir o código.
6. Adicionar a caixa 'prazo em dobro' (Fazenda Pública, Defensoria, litisconsortes com procuradores distintos) que multiplica `dias` por 2 antes de contar.
7. Não sugerir prazo nenhum quando `kind === 'ANDAMENTO'` — retornar cedo em `app/(app)/publicacoes/page.tsx:146`.
8. Opcional (fase seguinte): tornar a tabela editável em Configurações, gravando por escritório.

#### Como verificar

- Teste de mesa: disponibilização numa sexta-feira, embargos de declaração (5 dias úteis). Publicação = segunda; contagem começa terça; vence na segunda seguinte. Confira contra `addDiasUteis` de `lib/prazos.ts`.
- Abrir a triagem e confirmar que, sem escolher tipo, o campo de vencimento do modal de tarefa nasce vazio e o botão de salvar recusa.

#### Cuidados

- Este achado muda o comportamento de uma tela que o escritório usa todo dia. Combine com o dono antes de mergear — passar de 'data pronta' para 'escolha o tipo' adiciona um clique por publicação e isso precisa ser uma decisão consciente.
- O salto do art. 224 depende de dia útil, que depende de feriado — e o filtro de feriado por tribunal é o achado **G22**. Se G22 ainda não estiver feito, o salto continua usando a lista global de feriados; anote isso no comentário do código para a próxima pessoa.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g09"></a>

### G09 · Prazo cadastrado sem responsável não dispara notificação nenhuma até já estar vencido — e "Não definido" é o padrão do formulário do site

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Gestão jurídica |
| **Tema** | O prazo, que é o ativo mais caro do escritório |
| **Posição na fila** | 6 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | juiz |

**Arquivos citados**

```
components/NewTaskModal.tsx:155-157; lib/actions/tasks.ts:107; lib/comunicadosVarredura.ts:34, :57, :81; lib/email.ts (sendDailyDigestEmails); lib/push.ts:181
```

#### O que acontece

No modal "Novo compromisso" do site o select de Responsável abre com a primeira opção, que é <option value="">Não definido</option> — sem defaultValue do usuário logado (ao contrário do app mobile, que passa defaultResponsibleId), e createTask grava responsibleId: data.responsibleId || null. Todos os avisos de prazo filtram por responsável: PRAZO_HOJE, PRAZO_VENCENDO e AUDIENCIA_24H exigem responsibleId: { not: null }; o resumo diário consulta responsibleId: user.id; o push da agenda também. Resultado: um prazo fatal sem responsável não gera um único e-mail, push ou comunicado em D-3, D-2, D-1 nem no dia — ele só reaparece depois de perdido, como PRAZO_VENCIDO, que é justamente o único ponto que ignora o responsável. Basta um estagiário salvar a contestação sem escolher o nome.

#### Correção aprovada pela auditoria

Duas travas: pré-selecionar o usuário logado no NewTaskModal (comportamento que o formulário mobile já tem) e exigir responsável quando type === "PRAZO", recusando também no servidor em createTask; e criar na varredura um caminho de fallback que enfileire PRAZO_HOJE/PRAZO_VENCENDO para todos os administradores do escritório quando o prazo estiver sem responsável, em vez de simplesmente pular o registro.

#### Por que nesta posição da fila

Basta um estagiário salvar a contestação sem escolher o nome para o prazo ficar mudo em D-3, D-2, D-1 e no dia. A trava é barata (pré-selecionar o usuário logado, como o app mobile já faz, e exigir responsável em PRAZO) e protege exatamente o cenário em que o erro humano vira prazo perdido.

#### Passo a passo

1. Em `components/NewTaskModal.tsx:155-157`, pré-selecionar o usuário logado no select de Responsável — é o que o formulário mobile já faz via `defaultResponsibleId`. Copie o padrão de lá.
2. Quando `type === 'PRAZO'`, tornar o campo obrigatório no formulário (`required`) e **também no servidor**: em `createTask` (`lib/actions/tasks.ts:107`), recusar com erro claro se `type === 'PRAZO' && !responsibleId`.
3. Criar um caminho de fallback na varredura (`lib/comunicadosVarredura.ts:34, :57, :81`): quando o prazo estiver sem responsável, enfileirar `PRAZO_HOJE`/`PRAZO_VENCENDO` para **todos os administradores** do escritório, em vez de pular o registro com `responsibleId: { not: null }`.
4. Fazer o mesmo no resumo diário (`lib/email.ts`) e no push (`lib/push.ts:181`).
5. Rodar um backfill listando (não alterando) os prazos existentes sem responsável, para o dono distribuir manualmente.

#### Como verificar

- Abrir 'Novo compromisso' no site e confirmar que o Responsável já vem preenchido com quem está logado.
- Tentar salvar um PRAZO com 'Não definido' — precisa recusar na tela e, se forçado via Server Action, no servidor.
- Criar um prazo órfão direto no banco (teste) e rodar a varredura — os administradores precisam receber.

#### Cuidados

- O fallback para todos os administradores pode gerar ruído num escritório com muitos admins. Prefira notificar e marcar o item como 'sem responsável' na Central de Alertas, para virar ação em vez de spam.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g07"></a>

### G07 · O prazo de segurança só existe no calendário do desktop, cai em domingo e feriado, e a véspera do prazo fatal não gera aviso nenhum

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Gestão jurídica |
| **Tema** | O prazo, que é o ativo mais caro do escritório |
| **Posição na fila** | 7 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | juiz, eng-software |

**Arquivos citados**

```
lib/actions/tasks.ts:27-29 (computeSafetyDueDate); app/m/agenda/page.tsx:103; components/AgendaView.tsx:146-148; lib/comunicadosVarredura.ts:78-84
```

#### O que acontece

Task.safetyDueDate é gravado em todo cadastro de tarefa, mas só a Agenda do site sabe que ele existe: a Agenda do PWA busca as tarefas sem OR de safetyDueDate e sem sequer selecionar o campo, e nem lib/alerts.ts, nem lib/email.ts, nem lib/push.ts, nem lib/comunicadosVarredura.ts o mencionam. No dia do prazo de segurança, quem abre o app no celular (o caminho normal fora do escritório) vê o dia vazio. Some-se a isso que a janela de PRAZO_VENCENDO é [hoje+2, hoje+4) — D-3 e D-2 — e PRAZO_HOJE é D-0: a véspera, que é o último dia inteiro útil para redigir e protocolar, fica em silêncio (AUDIENCIA_24H, ao contrário, cobre hoje e amanhã). E computeSafetyDueDate subtrai 24 horas corridas da data-calendário, então prazo na segunda-feira produz "segurança" no domingo, e prazo no dia útil seguinte a feriado produz segurança no feriado.

#### Correção aprovada pela auditoria

Mover computeSafetyDueDate e a expansão "tarefa vira duas entradas de calendário" para lib/prazos.ts como função pura, recalculando a segurança como um dia ÚTIL antes (pulando fim de semana, feriado e recesso, com os feriados do escritório). Passar as duas agendas a usar a mesma função e o mesmo where, mostrar a linha de prazo de segurança em MobileAgendaTaskRow, estender PRAZO_VENCENDO para [hoje+1, hoje+4) (a dedupeKey já é diária, não duplica) e criar o evento PRAZO_SEGURANCA na varredura de comunicados.

#### Por que nesta posição da fila

O prazo de segurança é a rede que pega o que o resto deixou passar — e hoje ele não existe no celular, que é justamente onde a equipe olha a agenda no fórum e na rua. Vem logo depois de G02/G09 porque completa a mesma frente: calcular certo e avisar em todos os canais.

#### Passo a passo

1. Mover `computeSafetyDueDate` de `lib/actions/tasks.ts:27-29` para `lib/prazos.ts` como função pura, e **recalcular como um dia ÚTIL antes** (não 24 horas corridas): usar o mesmo motor de dia útil que já existe no arquivo, pulando fim de semana, feriado e recesso.
2. Criar também em `lib/prazos.ts` a função que expande 'uma tarefa vira duas entradas de calendário' (a fatal e a de segurança), hoje embutida em `components/AgendaView.tsx:146-148`.
3. Fazer a Agenda do site e a do app usarem a mesma função e o mesmo `where`. Em `app/m/agenda/page.tsx:103`, acrescentar `safetyDueDate` ao `select` e o `OR` no `where`.
4. Renderizar a linha de prazo de segurança em `MobileAgendaTaskRow`, visualmente distinta da fatal (o desktop já faz isso — copie o tratamento).
5. Em `lib/comunicadosVarredura.ts:78-84`, estender a janela de `PRAZO_VENCENDO` de `[hoje+2, hoje+4)` para `[hoje+1, hoje+4)`, cobrindo a véspera. A `dedupeKey` já é diária, então não duplica.
6. Criar o evento `PRAZO_SEGURANCA` na varredura, disparando no dia do `safetyDueDate`.
7. Rodar um backfill recalculando `safetyDueDate` das tarefas PENDENTE/EM_ANDAMENTO já existentes (rota admin, mesmo molde do backfill de DDI).

#### Como verificar

- Criar um prazo numa segunda-feira e conferir que a segurança caiu na sexta anterior, não no domingo.
- Criar um prazo no dia útil seguinte a um feriado cadastrado e conferir que a segurança pulou o feriado.
- Abrir a Agenda no app e confirmar que a linha de segurança aparece.

#### Cuidados

- Ampliar `PRAZO_VENCENDO` aumenta o volume de e-mail/push em um dia por prazo. É intencional, mas avise.
- O backfill muda datas já visíveis na agenda de todo mundo. Rode fora do horário de expediente.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g30"></a>

### G30 · Plano de contas, centros de custo e contas bancárias são criados e editados por qualquer usuário do escritório, sem checagem de acesso ao Financeiro

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Segurança |
| **Tema** | Portas sem tranca |
| **Posição na fila** | 8 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | ciberseguranca |

**Arquivos citados**

```
lib/actions/settings.ts:424, 444, 465, 473, 488, 504, 534, 561, 573
```

#### O que acontece

Todo o catálogo estrutural do módulo Financeiro é gravável por qualquer sessão autenticada — estagiário, secretária, advogado sem financeAccess e também uma sessão de suporte (que entra com isAdmin false justamente para não poder isso). As nove ações só checam "se não há viewer, sessão expirada". Na prática: criar contas bancárias falsas com initialBalance arbitrário (que entra no saldo do Livro Caixa e no Fluxo de Caixa), inativar a conta bancária real tirando-a das listas de lançamento, e apagar categorias e centros de custo do plano de contas. Como são Server Actions, não adianta a tela estar escondida — basta chamar a ação. O padrão correto existe e é usado 14 vezes no módulo (requireFinanceOfficeId, que confere módulo contratado e permissão).

#### Correção aprovada pela auditoria

Trocar o getCurrentUser cru dessas nove ações por requireFinanceOfficeId(), convertendo o throw na mensagem de erro que a tela espera. Para as que mudam a estrutura contábil (excluir categoria, excluir centro de custo, criar/editar/inativar conta bancária), exigir também viewer.isAdmin — é decisão de sócio, não de quem apenas consulta.

#### Por que nesta posição da fila

Nove Server Actions sem gate, com o padrão correto (requireFinanceOfficeId) já pronto e usado 14 vezes no mesmo módulo. É trocar uma chamada por outra: correção de meia hora que fecha criação de conta bancária falsa com saldo arbitrário.

#### Passo a passo

1. Em `lib/actions/settings.ts`, as nove ações nas linhas 424, 444, 465, 473, 488, 504, 534, 561 e 573 só checam 'se não há viewer, sessão expirada'.
2. Trocar o `getCurrentUser()` cru dessas nove por `requireFinanceOfficeId()` — o padrão correto, já usado 14 vezes no módulo, que confere módulo contratado **e** permissão.
3. Converter o `throw` em mensagem de erro no formato que a tela espera (as Server Actions devolvem `{ error }`, não lançam).
4. Para as que mudam a **estrutura contábil** — excluir categoria, excluir centro de custo, criar/editar/inativar conta bancária — exigir também `viewer.isAdmin`: é decisão de sócio, não de quem apenas consulta.

#### Como verificar

- Logado como estagiário sem `financeAccess`, chamar uma dessas Server Actions diretamente — precisa recusar.
- Logado como sócio, confirmar que tudo continua funcionando.
- Sob sessão de suporte 'atuar como', confirmar que também recusa (depende de **G20** estar feito).

#### Cuidados

- Esconder a tela não resolve: são Server Actions, basta chamá-las. A trava tem que estar na ação.
- Conserto mecânico e barato — nove trocas. Não o inche.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g20"></a>

### G20 · Sessão de suporte "atuar como" herda financeAccess do dono da plataforma, e o valor mascarado chega como R$ 0,00 sem nenhum marcador

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Segurança |
| **Tema** | Portas sem tranca |
| **Posição na fila** | 9 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | ciberseguranca, ia |

**Arquivos citados**

```
lib/currentUser.ts:73-82; lib/permissions.ts:9-11; lib/supportMasking.ts:105-107; lib/financeCalc.ts:16-18; app/api/assistente/route.ts:62
```

#### O que acontece

O override de suporte foi desenhado para reduzir privilégio e o comentário explica por que isAdmin vira false. Mas o objeto devolvido é { ...realUser, officeId, isAdmin: false, ... }: financeAccess e as demais flags continuam sendo as do dono da plataforma. Como requireFinanceAccess só barra quando !isAdmin && !financeAccess, quem tem financeAccess no próprio escritório entra no escritório-cliente com o módulo Financeiro inteiro liberado, inclusive as quatro rotas de exportação em XLSX. Pior: durante a máscara, maskMoney devolve null e valorLiquido(null,null,null) dá 0, então o assistente recebe amount: 0 e somaValores: 0 — números válidos, sem marcador — e responde ao suporte "o escritório não tem valores a pagar", indistinguível de dado real (ao contrário de maskFreeText, que devolve "[conteúdo protegido]").

#### Correção aprovada pela auditoria

No bloco de override, zerar todo o conjunto de permissões de escritório e não só isAdmin (financeAccess: false, role de suporte). Se o suporte precisar entrar no Financeiro para diagnosticar cobrança, isso vira um motivo próprio na lista fechada de AccessReasonCode, visível na faixa do SupportAccessBanner. E, com supportMasked, ou desligar o assistente, ou avisá-lo no system prompt de que os valores vêm zerados, devolvendo "[valor protegido]" quando amount for null.

#### Por que nesta posição da fila

O override de suporte já foi escrito para reduzir privilégio — falta só zerar o resto das flags junto com isAdmin. Correção pequena, no mesmo arquivo que você acabou de tocar em G05, e que é pré-requisito para a política de acesso de suporte do escritório fazer sentido.

#### Passo a passo

1. Em `lib/currentUser.ts:73-82`, o override de suporte devolve `{ ...realUser, officeId, isAdmin: false }` — mas `financeAccess` e as demais flags continuam sendo as do dono da plataforma. Zerar **todo** o conjunto de permissões de escritório no override, não só `isAdmin`: `financeAccess: false` e um `role` de suporte.
2. Se o suporte precisar entrar no Financeiro para diagnosticar cobrança, isso vira um motivo próprio na lista fechada de `AccessReasonCode`, visível na faixa do `SupportAccessBanner` — acesso explícito e registrado, não herdado.
3. Em `lib/supportMasking.ts:105-107`, `maskMoney` devolve `null` e `valorLiquido(null, null, null)` dá 0 (`lib/financeCalc.ts:16-18`) — o assistente recebe `amount: 0` como se fosse dado real. Corrigir: quando `supportMasked`, ou desligar o assistente (`app/api/assistente/route.ts:62`), ou instruí-lo no system prompt e devolver a string `"[valor protegido]"` quando `amount` for `null`.
4. Seguir o padrão que já existe e está certo: `maskFreeText` devolve `"[conteúdo protegido]"`, um marcador visível. Dinheiro precisa do equivalente.

#### Como verificar

- Entrar num escritório-cliente por 'atuar como' com um usuário da plataforma que tenha `financeAccess` e tentar `/api/financeiro/export` — precisa recusar.
- Sob sessão mascarada, perguntar ao assistente sobre contas a pagar — a resposta não pode dizer 'não há valores', tem que dizer que estão protegidos.

#### Cuidados

- Não quebre o suporte legítimo: hoje alguém pode depender desse acesso herdado para diagnosticar. Combine o novo `AccessReasonCode` antes de cortar.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g31"></a>

### G31 · Qualquer membro da plataforma — inclusive Marketing ou Suporte N1 — pode suspender um escritório-cliente, dar fatura por paga e mudar a mensalidade

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Segurança |
| **Tema** | Portas sem tranca |
| **Posição na fila** | 10 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | ciberseguranca |

**Arquivos citados**

```
lib/actions/painelMestre.ts:18-20; lib/platformMember.ts:123-126; prisma/schema.prisma:2851 (PlatformRole.canManageBilling)
```

#### O que acontece

O gate único de todas as ações do Painel Mestre é requirePlatformOwner(), que só pergunta se existe um PlatformMember ativo. A escada de papéis criada exatamente para limitar isso (canManageBilling, canManageMembers, maxVisibility) é lida para dentro do tipo PlatformViewer e nunca consultada — não existe um único if (member.canManageBilling) no repositório, embora o seed crie FINANCEIRO, SUPORTE_N1, ENGENHARIA, COMERCIAL e MARKETING todos com canManageBilling: false. Resultado: a pessoa de Marketing ou o Suporte N1 consegue chamar setOfficeAccess e derrubar o acesso de um escritório-cliente inteiro, markInvoicePaid para quitar fatura sem dinheiro entrar, updateOfficeBilling para mudar mensalidade e e-mail de cobrança, updateOfficePlanModules e generateAndSendInvoice para emitir boleto em nome da plataforma. Nenhuma delas precisa de UI: são Server Actions.

#### Correção aprovada pela auditoria

Trocar requirePlatformOwner() por gates tipados — requirePlatformCapability("billing") nas onze ações de cobrança, plano, módulos e bloqueio, exigindo member.canManageBilling (o owner continua passando) — e manter isPlatformStaff só para as leituras. Como setOfficeAccess e markInvoicePaid têm efeito sobre o cliente, gravar AccessAuditLog nomeando quem executou.

#### Por que nesta posição da fila

A escada de papéis (canManageBilling) já existe no schema e no seed, só nunca é consultada. Fechar antes de a equipe da plataforma crescer é trivial; depois, com Marketing e Suporte N1 já usando o painel, vira mudança que quebra rotina de gente.

#### Passo a passo

1. A escada de papéis já existe em `PlatformRole` (`prisma/schema.prisma:2851`): `canManageBilling`, `canManageMembers`, `maxVisibility`. Ela é lida para dentro do tipo `PlatformViewer` (`lib/platformMember.ts:123-126`) e **nunca consultada** — não há um único `if (member.canManageBilling)` no repositório.
2. Criar `requirePlatformCapability(cap: 'billing' | 'members')` em `lib/platformMember.ts`, ao lado de `requirePlatformOwner`. O owner continua passando por definição.
3. Trocar `requirePlatformOwner()` por `requirePlatformCapability('billing')` nas onze ações de cobrança, plano, módulos e bloqueio de `lib/actions/painelMestre.ts:18-20`: `setOfficeAccess`, `markInvoicePaid`, `updateOfficeBilling`, `updateOfficePlanModules`, `generateAndSendInvoice` e as demais do mesmo grupo.
4. Manter `isPlatformStaff` (leitura) para as consultas do Painel Mestre — quem só olha continua olhando.
5. Gravar `AccessAuditLog` nomeando quem executou, nas duas que têm efeito direto sobre o cliente: `setOfficeAccess` (derruba o acesso de um escritório inteiro) e `markInvoicePaid` (quita fatura sem dinheiro entrar).

#### Como verificar

- Criar um membro de plataforma com papel MARKETING (que o seed já cria com `canManageBilling: false`) e tentar suspender um escritório — precisa recusar.
- Com o mesmo membro, confirmar que a leitura do Painel Mestre continua funcionando.
- Como owner, confirmar que tudo continua funcionando.

#### Cuidados

- Confira o seed antes: se algum papel em produção precisa mesmo de billing, ajuste o papel, não o gate.
- São Server Actions — esconder o botão não protege.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g01"></a>

### G01 · Módulo não contratado só é barrado na navegação: Server Actions, rotas de API e o assistente continuam entregando os dados

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Segurança |
| **Tema** | Portas sem tranca |
| **Posição na fila** | 11 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | eng-software, saas, ia |

**Arquivos citados**

```
lib/officeModules.ts:5-8; app/api/financeiro/export/route.ts:16; app/api/financeiro/dre/export/route.ts:74; app/api/financeiro/fluxo-de-caixa/export/route.ts:32; app/api/financeiro/livro-caixa/export/route.ts:13; app/api/assistente/route.ts:62-67; lib/actions/assessoria.ts:646
```

#### O que acontece

O comentário de lib/officeModules.ts promete que o módulo é checado "na navegação e dentro dos Server Actions". Não é: getOfficeModules não aparece em nenhum arquivo de lib/actions/** nem em app/api/**. As quatro rotas de exportação financeira copiaram só a metade do gate (isAdmin || financeAccess) e nunca consultam Office.moduloFinanceiro; o assistente de IA oferece as ferramentas de Financeiro e Atendimento sem olhar o contrato. Quando o Painel Mestre desliga um módulo por downgrade ou inadimplência, a tela mostra ModuleDisabledNotice mas GET /api/financeiro/export continua devolvendo o .xlsx com todas as contas, e o chat continua respondendo contas a pagar/receber. No modo MODULAR o preço é a soma dos módulos ligados — a alavanca comercial não segura nada do lado do dado.

#### Correção aprovada pela auditoria

Criar um helper único (requireModule(user, 'financeiro'|'assessoria'|'atendimento'|'whatsapp'), construído sobre requireFinanceAccess de lib/permissions.ts) e aplicá-lo no topo de toda Server Action e rota de API que lê ou escreve em módulo, começando pelas quatro rotas de export e pelo route.ts do assistente (filtrando as ferramentas por módulo contratado). Corrigir o comentário de lib/officeModules.ts para não induzir a próxima pessoa a confiar numa checagem que não existe.

#### Por que nesta posição da fila

Com as três travas anteriores no lugar, esta é a que fecha o conjunto de acesso: um helper requireModule aplicado nas quatro rotas de exportação financeira e no assistente. É também o que faz a alavanca comercial (ligar/desligar módulo) valer alguma coisa antes de você começar a cobrar de verdade nos itens 26 e 27.

#### Passo a passo

1. Criar `requireModule(modulo)` em `lib/permissions.ts`, ao lado de `requireFinanceAccess`. Assinatura sugerida: `export async function requireModule(modulo: keyof OfficeModules): Promise<{ user, officeId }>`. Ela chama `getCurrentUser()`, lança `Error("Sessão inválida.")` se null, chama `getOfficeModules(user.officeId)` e lança `Error("O módulo X não está incluído no plano deste escritório.")` se o booleano do módulo for false. Devolve o user para o chamador não repetir a consulta.
2. Aplicar nas quatro rotas de export financeiro (`app/api/financeiro/export/route.ts`, `dre/export`, `fluxo-de-caixa/export`, `livro-caixa/export`): trocar o gate atual `isAdmin || financeAccess` por `requireFinanceAccess()` — que já checa módulo E permissão — envolvido em try/catch devolvendo `NextResponse.json({ error: e.message }, { status: 403 })`.
3. Em `app/api/assistente/route.ts:62-67`, carregar `getOfficeModules(user.officeId)` antes de montar a lista de ferramentas e filtrar: as ferramentas de Financeiro só entram se `modules.financeiro`, as de Atendimento só se `modules.atendimento`, as de Assessoria só se `modules.assessoria`.
4. Varrer `lib/actions/**` procurando Server Actions que leem ou escrevem em tabela de módulo (`Assessoria`, `Licitacao`, `Parecer`, `Attendance`, `WhatsappMessage`) e cujo primeiro comando é `getCurrentUser()` cru; trocar por `requireModule("assessoria" | "atendimento" | "whatsapp")`. Comece por `lib/actions/assessoria.ts:646`, citado no achado.
5. Corrigir o comentário de bloco em `lib/officeModules.ts:5-8`: ele afirma que a checagem existe dentro dos Server Actions. Se você aplicou o gate em parte deles, descreva exatamente onde está e onde ainda falta — o comentário mentir de novo é o que produziu este achado.

#### Como verificar

- `grep -rn "requireModule\|requireFinanceAccess" app/api/financeiro/` deve mostrar as quatro rotas cobertas.
- Manualmente: no Painel Mestre, desligar `moduloFinanceiro` de um escritório de teste e abrir `/api/financeiro/export` logado como usuário desse escritório — precisa responder 403, não a planilha.
- Com o módulo desligado, perguntar ao assistente 'quanto tenho a receber?' — ele não pode ter a ferramenta disponível.

#### Cuidados

- `requireFinanceAccess` **lança**; as rotas hoje devolvem `NextResponse`. Não deixe a exceção subir crua — vira 500 e o usuário não entende. Sempre converta para 403 com a mensagem.
- Não aplique `requireModule` em leitura de navegação que já tem `ModuleDisabledNotice`; duplicar o gate na página só troca um aviso amigável por um erro seco.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g29"></a>

### G29 · Link colado em anexo e em documento de Assessoria aceita javascript: — a sanitização foi ligada só em Tarefa e Processo

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Segurança |
| **Tema** | Documento do cliente circulando solto |
| **Posição na fila** | 12 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | ciberseguranca |

**Arquivos citados**

```
lib/actions/attachments.ts:69; lib/actions/assessoria.ts:263; lib/urlSafety.ts; components/AttachmentList.tsx:441, :509, :572; components/assessoria/AssessoriaDocumentosTab.tsx:215, :448
```

#### O que acontece

lib/urlSafety.ts nasceu para fechar essa classe de bug, mas sanitizeExternalUrl só é importado em lib/actions/tasks.ts e lib/actions/cases.ts. Os dois caminhos de "colar um link" mais usados no dia a dia — "Anexar link" em Processo/Atendimento/Licitação e "Adicionar documento" na Assessoria — gravam a string crua, e a tela renderiza <a href={a.driveUrl}> sem tratamento (confirmado em uma dúzia de componentes, inclusive nos do app mobile). Em React 18 um href javascript: apenas emite warning e continua sendo renderizado: um estagiário, um usuário mal-intencionado ou uma sessão de suporte planta um link que, clicado por um sócio, roda script na sessão autenticada dele e pode chamar qualquer Server Action com privilégio de sócio. O type="url" do formulário é validação de navegador, não protege a Server Action.

#### Correção aprovada pela auditoria

Aplicar sanitizeExternalUrl na escrita dos dois pontos, recusando com erro claro quando devolver null, e como defesa em profundidade na renderização dos componentes listados, para neutralizar os registros já gravados. Varrer também DocumentoEnvio/formatDocumentosLinks, já que esses links saem para o cliente por WhatsApp.

#### Por que nesta posição da fila

A função de sanitização já existe e já é usada em dois arquivos — é importá-la em mais dois pontos de escrita e reforçar na renderização. Custo baixíssimo para eliminar o caminho que permite executar ação com privilégio de sócio a partir de um link plantado.

#### Passo a passo

1. `lib/urlSafety.ts` já existe e `sanitizeExternalUrl` já resolve isso — ele só não foi ligado nestes dois caminhos.
2. Aplicar na escrita: `lib/actions/attachments.ts:69` ('Anexar link' em Processo/Atendimento/Licitação) e `lib/actions/assessoria.ts:263` ('Adicionar documento' na Assessoria). Recusar com erro claro quando a função devolver `null`.
3. **Defesa em profundidade na renderização**, para neutralizar os registros já gravados: `components/AttachmentList.tsx:441`, `:509`, `:572` e `components/assessoria/AssessoriaDocumentosTab.tsx:215`, `:448` — e os equivalentes no app mobile.
4. Varrer também `lib/documentoEnvios.ts` / `formatDocumentosLinks`, já que esses links saem para o cliente por WhatsApp.
5. `grep -rn "driveUrl}" components/ app/` para encontrar todas as renderizações e não esquecer nenhuma.

#### Como verificar

- Tentar salvar um link `javascript:alert(1)` pelo 'Anexar link' — precisa ser recusado com mensagem clara.
- Gravar um link malicioso direto no banco (teste) e abrir a tela — o `href` renderizado não pode ser o `javascript:`.

#### Cuidados

- `type="url"` no formulário é validação de navegador e não protege a Server Action. A trava tem que estar no servidor.
- Não bloqueie esquemas legítimos que o escritório usa (`https:`, `mailto:` se aplicável). Confira a lista permitida em `lib/urlSafety.ts` antes.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g12"></a>

### G12 · Login e recuperação de senha sem trava de tentativas, e checkLoginForReset confirma publicamente quem é cliente da plataforma

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Segurança |
| **Tema** | Portas sem tranca |
| **Posição na fila** | 13 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | ciberseguranca |

**Arquivos citados**

```
lib/actions/auth.ts:38 (login), :108-112 (checkLoginForReset), :116 (requestPasswordReset)
```

#### O que acontece

Três Server Actions acessíveis sem sessão e sem qualquer limite de tentativas. login aceita chutes ilimitados de senha contra qualquer e-mail da plataforma — bcrypt sozinho não é trava. checkLoginForReset devolve { found: true, maskedEmail } para e-mail existente e { found: false } para inexistente, ou seja, confirma quem é escritório-cliente do Lúmen e ainda entrega o formato parcial do endereço, insumo direto de phishing dirigido a advogado. requestPasswordReset responde "E-mail não encontrado." (mesma enumeração) e dispara um e-mail real por chamada, sem limite, permitindo bombardear a caixa de um sócio e queimar a cota de envio. Busca por rate limit, throttle, lockout ou tentativa falha em lib/, app/ e middleware.ts não retorna nenhuma implementação; LoginSession só registra login bem-sucedido.

#### Correção aprovada pela auditoria

Contador de tentativas por (e-mail, IP) em Postgres — 5 falhas em 15 min bloqueiam o par, com backoff — aplicado em login, checkLoginForReset e requestPasswordReset. Uniformizar as respostas dos dois fluxos de recuperação para "se este e-mail estiver cadastrado, enviaremos o link", sem found nem maskedEmail. Registrar as falhas numa tabela LoginAttempt visível no Painel Mestre.

#### Por que nesta posição da fila

É a última porta da frente ainda aberta depois de fechar as internas: senha por tentativa ilimitada e confirmação pública de quem é cliente do Lúmen. Precisa de tabela nova e de contador, por isso vem depois das correções de uma linha, mas não deve esperar mais que isso.

#### Passo a passo

1. Criar o model `LoginAttempt` em `prisma/schema.prisma`: `{ id, email, ip, sucesso Boolean, createdAt }` com `@@index([email, createdAt])` e `@@index([ip, createdAt])`.
2. Criar `lib/loginThrottle.ts` com `registrarTentativa(email, ip, sucesso)` e `estaBloqueado(email, ip)`: 5 falhas do mesmo par em 15 minutos bloqueiam, com backoff crescente.
3. Aplicar nas três Server Actions de `lib/actions/auth.ts`: `login` (:38), `checkLoginForReset` (:108-112) e `requestPasswordReset` (:116).
4. **Uniformizar as respostas** dos dois fluxos de recuperação: sempre 'Se este e-mail estiver cadastrado, enviaremos o link.' Remover `found` e `maskedEmail` do retorno de `checkLoginForReset` — é o vazamento que confirma quem é cliente da plataforma.
5. Ajustar a tela que consome `checkLoginForReset` para não depender mais desses campos.
6. Expor as tentativas falhas no Painel Mestre, com filtro por e-mail e IP.

#### Como verificar

- Errar a senha 6 vezes seguidas — a sexta precisa ser recusada por bloqueio, não por senha errada.
- Pedir recuperação para um e-mail que existe e para um que não existe — as duas respostas precisam ser idênticas, palavra por palavra.

#### Cuidados

- Pegue o IP de `x-forwarded-for` (a Vercel está atrás de proxy); `request.ip` sozinho não serve.
- Não bloqueie só por IP: escritório inteiro sai pelo mesmo IP e um erro de um derruba todos. O par (e-mail, IP) é o certo.
- Deixe um caminho de desbloqueio manual no Painel Mestre — senão o suporte não tem o que fazer quando um sócio se trancar fora.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g14"></a>

### G14 · A fila de notificações só marca como enviada no fim do lote: um erro no meio reenvia tudo de novo a cada 15 minutos, indefinidamente

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Arquitetura |
| **Tema** | Encanamento que falha calado e acabamento do dia a dia |
| **Posição na fila** | 14 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | backend |

**Arquivos citados**

```
lib/notificationOutboxDrain.ts:50, :73, :76; app/api/cron/comunicados-outbox/route.ts:4
```

#### O que acontece

Verificado no código: processGroups acumula os ids em processedIds e só grava sentAt num único updateMany depois do laço. Os envios são sequenciais (um sendSimpleEmail/sendRawPush por vez) e a rota puxa até 1000 linhas, então basta o lote não caber nos 300s de maxDuration, ou uma exceção em prisma.emailTemplate.findUnique / prisma.user.findUnique, para que nenhuma linha seja marcada. Como o findMany é orderBy dueAt asc com take 1000, a rodada seguinte pega exatamente as mesmas linhas e reenvia tudo, e volta a estourar: um laço que não converge. O advogado e o cliente recebem o mesmo e-mail e o mesmo push a cada 15 minutos até alguém apagar as linhas na mão.

#### Correção aprovada pela auditoria

Marcar sentAt por grupo, logo após o envio daquele grupo, com try/catch por grupo que registra a falha e segue. Melhor ainda, fazer claim antes de enviar (updateMany marcando claimedAt e devolvendo só as linhas reivindicadas) com contador de attempts para desistir depois de N tentativas. Baixar o take para algo que caiba com folga no orçamento, já que o cron roda a cada 15 min.

#### Por que nesta posição da fila

É um laço que não converge: hoje mesmo pode estar reenviando o mesmo e-mail e o mesmo push ao advogado e ao cliente a cada 15 minutos. Além do constrangimento com o cliente, queima cota de envio. Marcar por grupo é uma alteração pequena e imediata.

#### Passo a passo

1. Em `lib/notificationOutboxDrain.ts`, mover o `updateMany` que grava `sentAt` (linha 76) para **dentro** do laço, logo depois do envio de cada grupo.
2. Envolver cada grupo em `try/catch`: falha registra e segue para o próximo, em vez de derrubar o lote.
3. Melhor ainda, fazer *claim* antes de enviar: um `updateMany` que marca `claimedAt` nas linhas escolhidas e devolve só as reivindicadas, para duas execuções simultâneas do cron não enviarem a mesma coisa.
4. Acrescentar `attempts Int @default(0)` à tabela do outbox e desistir depois de N tentativas (sugestão: 5), marcando a linha como falha permanente.
5. Baixar o `take` de 1000 para algo que caiba com folga nos 300s — o cron roda a cada 15 minutos, então 200 por rodada dá vazão de sobra.

#### Como verificar

- Provocar uma exceção artificial no meio de um lote de teste e conferir que os grupos anteriores ficaram com `sentAt` gravado e não são reenviados.
- Rodar o cron duas vezes seguidas e confirmar que nada foi enviado em dobro.

#### Cuidados

- Se houver linhas presas de execuções antigas em produção, elas vão disparar de uma vez no primeiro deploy corrigido. Confira a fila antes de mergear e, se houver acúmulo, limpe manualmente as vencidas.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g37"></a>

### G37 · Notificação enfileirada sem await em oito pontos: na Vercel a função pode congelar antes da gravação, e o erro é engolido

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Funcionalidade |
| **Tema** | Encanamento que falha calado e acabamento do dia a dia |
| **Posição na fila** | 15 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | backend |

**Arquivos citados**

```
lib/actions/tasks.ts:229; lib/actions/financeiro.ts:35; lib/jusbrasilEmailSync.ts:303 e :317; lib/outlookEmailSync.ts:136 e :150; lib/roboBridge.ts:370 e :384; lib/notificationOutbox.ts
```

#### O que acontece

enqueueNotification faz duas idas ao banco (resolver preferência e criar a linha do outbox) e nesses oito pontos é chamada sem await — contra apenas seis chamadas com await no repositório. Em função serverless o runtime é congelado assim que a resposta ou a Server Action retorna, então a gravação pendente simplesmente não acontece. Na delegação de tarefa o revalidatePath e o retorno vêm logo em seguida: o colega para quem o prazo foi delegado pode não receber push nenhum. E como enqueueNotification tem try/catch que devolve null, nem sequer aparece um erro no log — some em silêncio.

#### Correção aprovada pela auditoria

Trocar por await — a função já é best-effort e nunca lança, então awaitar não introduz risco. Nos laços por usuário, juntar em await Promise.all(...) para não perder tempo em série. Onde a latência incomodar de fato numa Server Action, usar waitUntil de @vercel/functions, que é o jeito suportado de deixar trabalho pendente depois da resposta.

#### Por que nesta posição da fila

Mesma frente do item anterior e mesmo custo (trocar oito chamadas por await): sem isso, o colega para quem você delegou o prazo pode simplesmente não receber aviso nenhum, e o erro nem aparece no log.

#### Passo a passo

1. Acrescentar `await` nas oito chamadas de `enqueueNotification` listadas: `lib/actions/tasks.ts:229`, `lib/actions/financeiro.ts:35`, `lib/jusbrasilEmailSync.ts:303` e `:317`, `lib/outlookEmailSync.ts:136` e `:150`, `lib/roboBridge.ts:370` e `:384`.
2. A função já é best-effort e nunca lança (tem `try/catch` que devolve `null`), então awaitar não introduz risco de derrubar a operação.
3. Nos laços por usuário, agrupar em `await Promise.all(...)` para não perder tempo em série.
4. Onde a latência realmente incomodar numa Server Action, usar `waitUntil` de `@vercel/functions` — é o jeito suportado de deixar trabalho pendente depois da resposta. Não deixe promessa solta.
5. Aproveitar e trocar o `catch` silencioso de `enqueueNotification` (`lib/notificationOutbox.ts`) por um `console.error` com contexto, para a próxima falha ao menos aparecer no log.

#### Como verificar

- Delegar uma tarefa e conferir que a linha entrou no outbox (hoje pode não entrar).
- `grep -rn "enqueueNotification(" lib/ | grep -v await` não pode retornar nada.

#### Cuidados

- Esforço pequeno, ganho direto: é a diferença entre o colega receber ou não o push do prazo delegado.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g13"></a>

### G13 · O cursor do sync de e-mail é a publicação mais recente de qualquer fonte — o robô DJEN empurra o cursor para hoje e o Gmail deixa de importar

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Dados |
| **Tema** | Encanamento que falha calado e acabamento do dia a dia |
| **Posição na fila** | 16 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | backend |

**Arquivos citados**

```
lib/jusbrasilEmailSync.ts:248-256; lib/outlookEmailSync.ts:98-108; lib/roboBridge.ts:275; vercel.json
```

#### O que acontece

O ponto de partida da varredura do Gmail/Outlook (after:) é a publicação mais recente do escritório entre as fontes JUSBRASIL_EMAIL, DJE, PJE, ESAJ, PROJUDI, EPROC, DJEN, PNCP e DOU — inclusive as criadas por outros crons. Como jusbrasil-sync e robo-bridge rodam na mesma expressão cron (0 */3 * * *), o DJEN insere Publication com publishedAt de hoje e o sync de e-mail passa a buscar só mensagens de hoje em diante. Consequências: um escritório que conecta o Gmail depois de já ter DJEN ativo nunca importa o histórico de 30 dias (o fallback só vale quando não existe nenhuma publicação, e o DJEN garante que sempre existe); e qualquer e-mail que falhe no parse (o catch só empilha em result.errors e segue) ou que fique de fora quando os 60s acabam está definitivamente perdido, porque na rodada seguinte o after: já passou da data dele. Publicação perdida é prazo perdido.

#### Correção aprovada pela auditoria

Guardar um cursor próprio por CONTA (lastSyncedAt em GoogleCredential/MicrosoftCredential ou numa tabela EmailSyncState), avançado só depois que todas as mensagens da rodada foram processadas. Filtrar o priorSync atual apenas pelas fontes de e-mail já corrige o vazamento entre fontes; recuar o after: em 2 dias (a dedupe por emailMessageId já barra reprocesso) cobre a mensagem que falhou. Separar os dois crons de horário.

#### Por que nesta posição da fila

Publicação perdida é prazo perdido, e aqui a perda é definitiva: o e-mail que falhou nunca mais é buscado, e o escritório que ligar o Gmail depois do DJEN nunca importa o histórico. Vem depois das correções de segurança porque é mais contido, mas é a maior fonte silenciosa de intimação faltante.

#### Passo a passo

1. Criar o cursor por conta: acrescentar `lastSyncedAt DateTime?` a `GoogleCredential` e `MicrosoftCredential` em `prisma/schema.prisma` (ou criar `EmailSyncState`).
2. Em `lib/jusbrasilEmailSync.ts:248-256` e `lib/outlookEmailSync.ts:98-108`, trocar a consulta que busca 'a publicação mais recente de qualquer fonte' pelo `lastSyncedAt` da conta.
3. **Só avançar o cursor depois** que todas as mensagens da rodada foram processadas com sucesso. Se a rodada terminou por orçamento de tempo ou com erro, não avance.
4. Recuar o `after:` em 2 dias em relação ao cursor — a dedupe por `emailMessageId` já barra reprocesso, e isso recupera a mensagem que falhou no parse.
5. Enquanto o schema não mudar (correção parcial imediata): filtrar o `priorSync` atual apenas pelas fontes de e-mail (`JUSBRASIL_EMAIL`), o que já fecha o vazamento vindo do DJEN.
6. Separar os horários dos crons em `vercel.json`: `jusbrasil-sync` e `robo-bridge` hoje rodam ambos em `0 */3 * * *`. Mover um deles para `30 */3 * * *`.

#### Como verificar

- Num escritório de teste com DJEN ativo, conectar o Gmail e conferir que a primeira sincronização importa o histórico, e não só a partir de hoje.
- Forçar um erro de parse numa mensagem e conferir que ela é reprocessada na rodada seguinte.

#### Cuidados

- Recuar 2 dias aumenta o custo de cada rodada. Confira que a dedupe por `emailMessageId` está realmente cobrindo — senão você duplica publicação, que é pior que perder.
- Interage com **G19** (a mesma rota está no teto de 60s). Fazer os dois juntos é razoável.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g03"></a>

### G03 · Todo arquivo que sobe pelo Lúmen recebe permissão pública "qualquer pessoa com o link" no ato do upload

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Segurança |
| **Tema** | Documento do cliente circulando solto |
| **Posição na fila** | 17 de 45 |
| **Esforço** | G — Grande (vários dias) |
| **Risco da mudança** | alto |
| **Levantado pelas lentes** | juiz, promotor |

**Arquivos citados**

```
lib/googleDrive.ts:424, :504 e :584; lib/oneDriveStorage.ts:346; lib/dropboxStorage.ts:304; lib/actions/attachments.ts:172-173
```

#### O que acontece

Verificado no código: as três chamadas drive.permissions.create({ role: "reader", type: "anyone" }) são o caminho único de upload — anexo de processo, documento de Assessoria, contrato, procuração, declaração de hipossuficiência (que sai com CPF, RG e endereço) e comprovante de protocolo. O mesmo desenho está no OneDrive (scope anonymous) e no Dropbox. Nenhuma dessas permissões tem expiração e não existe nenhuma chamada de revogação no projeto. Esses links circulam: vão para Attachment.driveUrl, entram nos envios por WhatsApp/e-mail (DocumentoEnvio) e saem inteiros na planilha de /api/admin/export-office. Quem receber ou descobrir a URL lê o arquivo sem login, sem pertencer ao escritório e sem deixar rastro. É quebra de sigilo profissional e, em processo sob segredo de justiça, violação direta — agravada por não existir sequer um campo para marcar o processo como sigiloso.

#### Correção aprovada pela auditoria

Parar de tornar público no upload: criar o arquivo restrito à conta do escritório e servir a leitura por rota autenticada que cheque officeId e permissão (padrão já usado em app/api/assessoria/documentos/[id]/route.ts). O link anônimo passa a ser criado só no momento de um envio explícito ao cliente, com expiração (expirationTime no Drive, expirationDateTime no OneDrive, expires no Dropbox), guardando o permissionId para revogar, e com registro em AccessAuditLog. Rodar um script de varredura que liste e remova as permissões type=anyone já existentes nas pastas do escritório.

#### Por que nesta posição da fila

É a maior exposição de dado do conjunto — contrato, procuração, declaração de hipossuficiência com CPF e endereço, processo em segredo de justiça, todos com link permanente que lê sem login. Não vem antes porque exige trocar o caminho de leitura de arquivo do produto inteiro e varrer as permissões já criadas; é o maior projeto da fase 1 e merece uma janela própria.

#### Passo a passo

1. **Etapa 1 — parar de criar link público.** Em `lib/googleDrive.ts`, remover as três chamadas `drive.permissions.create({ role: 'reader', type: 'anyone' })` (linhas 424, 504 e 584). Fazer o equivalente em `lib/oneDriveStorage.ts:346` (scope `anonymous`) e `lib/dropboxStorage.ts:304`.
2. **Etapa 2 — servir por rota autenticada.** Já existe o padrão pronto em `app/api/assessoria/documentos/[id]/route.ts`: a rota confere `officeId` do viewer contra o do documento e faz o stream. Criar `app/api/attachments/[id]/route.ts` no mesmo molde para os anexos de processo/atendimento/licitação.
3. **Etapa 3 — trocar o que a tela usa.** Onde hoje se renderiza `href={a.driveUrl}`, passar a usar `href={`/api/attachments/${a.id}`}`. Os componentes estão listados em G29 (`components/AttachmentList.tsx:441,509,572`, `components/assessoria/AssessoriaDocumentosTab.tsx:215,448` e os equivalentes mobile). Manter `driveUrl` no banco — ele continua sendo o endereço real no provedor.
4. **Etapa 4 — link público só no envio explícito.** Em `lib/documentoEnvios.ts`, no momento de montar um envio ao cliente por WhatsApp/e-mail, criar a permissão anônima ali, com expiração: Drive `expirationTime`, OneDrive `expirationDateTime`, Dropbox `expires`. Guardar o `permissionId` devolvido numa coluna nova em `DocumentoEnvio` para permitir revogar depois.
5. **Etapa 5 — registrar.** Gravar `AccessAuditLog` (ou `AuditEvent` kind `EXPORTACAO`) a cada criação de link público, com autor, documento e destinatário.
6. **Etapa 6 — limpar o passado.** Criar `app/api/admin/varrer-permissoes-publicas/route.ts` (GET, `dynamic = 'force-dynamic'`, gated por `getCurrentUser()?.isPlatformOwner`, mesmo molde de `app/api/admin/backfill-phone-ddi/route.ts`): percorre as pastas do escritório, lista permissões `type=anyone` e as remove, devolvendo o total. Rodar uma vez em produção depois do deploy.

#### Como verificar

- `grep -rn "type: \"anyone\"\|'anyone'" lib/` deve sobrar só no ponto de envio explícito.
- Subir um anexo novo, copiar o `driveUrl` e abrir numa janela anônima — precisa cair em pedido de login do Google, não no arquivo.
- Abrir o mesmo anexo pela tela do Lúmen, logado — precisa abrir normalmente pela rota autenticada.
- Fazer logout e chamar `/api/attachments/<id>` — precisa devolver 401/403.

#### Cuidados

- **É a mudança de maior risco de regressão do conjunto.** Todo link já enviado a cliente por WhatsApp continua funcionando (a permissão antiga só some quando a varredura da etapa 6 rodar) — avise o dono antes de rodar a varredura, porque links legítimos já entregues vão parar de abrir.
- O envio de documento por WhatsApp depende de o link ser publicamente acessível pelo servidor do WhatsApp. Não quebre esse fluxo: a etapa 4 existe exatamente para preservá-lo.
- Faça as etapas 1–3 num PR e as 4–6 em outro. Juntas são grandes demais para revisar.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g36"></a>

### G36 · O importador de planilha grava o status ATRASADO no banco e essas contas nunca disparam cobrança

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Dados |
| **Tema** | O caixa e o número que o sócio lê |
| **Posição na fila** | 18 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | eng-software |

**Arquivos citados**

```
lib/importers/importFinance.ts:99 e :117; lib/financeQuery.ts:43; lib/comunicadosVarredura.ts:138-142
```

#### O que acontece

Em todo o produto, ATRASADO é derivado em tempo de leitura por effective() — o campo status no banco só assume PENDENTE/PARCIAL/PAGO/CANCELADO/A_APURAR. O importador do Financeiro.xlsx é o único ponto que persiste a string "ATRASADO" (nos dois create, receivable e payable). Como a varredura de comunicados busca as cobranças vencidas por status: "PENDENTE" com dueDate no passado — e o comentário logo acima diz textualmente que o atraso nunca é lido do campo status —, toda conta importada como vencida fica invisível para o evento COBRANCA_ATRASO. O escritório importa a carteira legada de inadimplentes justamente para cobrar, e são exatamente essas que nunca geram lembrete. Além disso effective() só promove PENDENTE, nunca rebaixa: se o vencimento for reprogramado para o futuro, a conta importada continua vermelha para sempre.

#### Correção aprovada pela auditoria

Trocar as duas linhas por status: isSettled ? "PAGO" : "PENDENTE" — effective() já pinta como ATRASADO na tela sem persistir nada — e rodar um backfill único trocando ATRASADO por PENDENTE nas importações já feitas. Centralizar as constantes de status financeiro num módulo único e tipar os creates com elas, para o próximo importador não conseguir inventar um status que nenhuma consulta reconhece.

#### Por que nesta posição da fila

Duas linhas mais um backfill. O escritório importa a carteira legada justamente para cobrar os inadimplentes, e são exatamente esses que hoje nunca geram lembrete — dinheiro parado por causa de um valor de status que nenhuma consulta reconhece.

#### Passo a passo

1. Em `lib/importers/importFinance.ts:99` e `:117` (os dois `create`, receivable e payable), trocar a gravação de `status: 'ATRASADO'` por `status: isSettled ? 'PAGO' : 'PENDENTE'`.
2. Em todo o resto do produto, ATRASADO é **derivado em leitura** por `effective()` (`lib/financeQuery.ts:43`) — a tela continua pintando de vermelho sem que nada persista o status.
3. Rodar um backfill único trocando `ATRASADO` por `PENDENTE` nas importações já feitas (rota admin, mesmo molde de `app/api/admin/backfill-phone-ddi/route.ts`).
4. Centralizar as constantes de status financeiro num módulo único e tipar os `create` com elas, para o próximo importador não conseguir inventar um status que nenhuma consulta reconhece.

#### Como verificar

- Importar uma planilha de teste com contas vencidas e conferir que elas gravaram `PENDENTE` e aparecem vermelhas na tela.
- Rodar a varredura de comunicados e conferir que essas contas agora disparam `COBRANCA_ATRASO` — hoje não disparam.
- Reprogramar o vencimento de uma delas para o futuro e conferir que ela **deixa** de ser vermelha (hoje continua para sempre).

#### Cuidados

- Conserto de duas linhas + um backfill. O valor está no backfill: são justamente as contas da carteira legada de inadimplentes que o escritório importou para cobrar.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g33"></a>

### G33 · Contas a Pagar e a Receber filtram por vencimento no mês corrente mesmo na aba "Abertas", escondendo toda a inadimplência anterior

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Gestão de escritório |
| **Tema** | O caixa e o número que o sócio lê |
| **Posição na fila** | 19 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | eng-dados |

**Arquivos citados**

```
app/(app)/financeiro/receitas/page.tsx:27-33 e :45-49; app/(app)/financeiro/despesas/page.tsx:24-32; lib/financeQuery.ts:70-78
```

#### O que acontece

Sem De/Até na URL, as duas telas injetam o intervalo do mês corrente, e periodWhere aplica esse intervalo a dueDate em todas as abas exceto "pagas". Na aba padrão "Abertas", um honorário vencido em julho e não recebido não aparece em setembro — só reaparece se o usuário souber mexer no filtro de datas. O card de total soma apenas o mês, e o botão Exportar monta a URL com os mesmos parâmetros, então a planilha de "contas abertas" também sai sem os vencidos. Para o escritório, é exatamente o dinheiro que precisa ser cobrado sumindo da tela principal de cobrança.

#### Correção aprovada pela auditoria

Separar o padrão por aba: nas abas "abertas" e "apurar", o filtro de mês limita só o teto (dueDate lte fim do mês), sem piso, de modo que tudo que venceu antes e continua em aberto permaneça na lista; o piso do mês corrente só faz sentido em "pagas" e "todas". Enquanto isso, exibir na aba Abertas uma faixa com a contagem e o valor do que está vencido fora da janela.

#### Por que nesta posição da fila

Complementa o item anterior na mesma frente de recebimento: o honorário vencido em julho não aparece em setembro na tela principal de cobrança, nem na planilha exportada. Mudança pequena de filtro por aba, efeito direto no fluxo de caixa do escritório.

#### Passo a passo

1. Em `app/(app)/financeiro/receitas/page.tsx:27-33` e `:45-49` e em `despesas/page.tsx:24-32`, quando não há De/Até na URL, o código injeta o intervalo do mês corrente e `periodWhere` (`lib/financeQuery.ts:70-78`) aplica esse intervalo a `dueDate` em todas as abas exceto 'pagas'.
2. Separar o padrão **por aba**: nas abas 'abertas' e 'apurar', o filtro de mês limita só o **teto** (`dueDate: { lte: fimDoMes }`), sem piso — tudo que venceu antes e continua em aberto permanece na lista.
3. O piso do mês corrente continua fazendo sentido em 'pagas' e 'todas'.
4. Ajustar o card de total para somar o mesmo conjunto que a lista mostra.
5. O botão Exportar monta a URL com os mesmos parâmetros — confirme que a planilha de 'contas abertas' passou a sair com os vencidos.
6. Enquanto isso (ou como complemento permanente), exibir na aba Abertas uma faixa com a contagem e o valor do que está vencido fora da janela.

#### Como verificar

- Criar uma conta a receber vencida há dois meses e não paga; abrir `/financeiro/receitas` sem filtro — ela precisa aparecer na aba Abertas.
- Conferir que o card de total a inclui, e que a exportação também.
- Conferir que a aba Pagas continua mostrando só o mês.

#### Cuidados

- Os totais das telas vão **aumentar** depois desta correção — é o comportamento certo, mas avise o dono para ele não achar que apareceu dívida nova.
- Interage com **G06**: depois disso, o número do assistente e o da tela passam a bater.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g06"></a>

### G06 · O assistente de IA responde números do Financeiro com regra própria: soma contas pagas e canceladas e informa como total a soma de apenas 20 linhas

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Assistente de IA |
| **Tema** | O caixa e o número que o sócio lê |
| **Posição na fila** | 20 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | eng-software, ia |

**Arquivos citados**

```
lib/assistantTools.ts:270-305 (executarConsultarFinanceiro); mesmo padrão em :72-83, :113-121, :146-155, :180-186
```

#### O que acontece

Confirmado no código: a consulta é prisma.receivable.findMany({ status: apenasPendente ? "PENDENTE" : { not: "A_APURAR" }, take: 20 }) seguida de total: receivables.length e somaValores somando as 20 linhas trazidas. Três erros num número que o sócio lê como oficial: (1) com apenasPendente as contas PARCIAIS ficam de fora, embora o produto inteiro defina conta aberta como PENDENTE+ATRASADO+PARCIAL (lib/financeQuery.ts:56); (2) sem apenasPendente, { not: "A_APURAR" } inclui PAGO e CANCELADO e soma tudo como dinheiro a receber; (3) o "total" é o tamanho da página — um escritório com 300 contas em aberto ouve "total: 20". Além disso somaValores usa valorLiquido e nunca desconta o já pago, enquanto a exportação oficial usa saldoEmAberto. Nenhuma ferramenta do arquivo chama count() ou aggregate(). O advogado pergunta "quanto tenho a receber?" e recebe um valor que não bate com nenhuma tela.

#### Correção aprovada pela auditoria

Reescrever executarConsultarFinanceiro sobre getFilteredPayables/getFilteredReceivables de lib/financeQuery.ts, com tab "abertas"|"pagas"|"todas" no lugar do booleano, somando por saldoEmAberto. Calcular total e soma com count/aggregate sobre o mesmo where e usar o take: 20 só para a lista de exemplos, devolvendo "exibindo 20 de N" e truncado: true. Instruir no system prompt que, com truncado=true, o modelo precisa dizer que está mostrando parte e informar o total real.

#### Por que nesta posição da fila

Com o Financeiro já confiável nas telas (itens 18 e 19), o assistente vira a última fonte de número errado — e é a mais perigosa, porque o sócio lê a resposta como oficial. As funções corretas (getFilteredPayables/Receivables) já existem; é reescrever a ferramenta sobre elas.

#### Passo a passo

1. Reescrever `executarConsultarFinanceiro` (`lib/assistantTools.ts:270-305`) sobre `getFilteredPayables`/`getFilteredReceivables` de `lib/financeQuery.ts` — as mesmas funções que alimentam a tela e a exportação oficial.
2. Trocar o parâmetro booleano `apenasPendente` por `tab: 'abertas' | 'pagas' | 'todas'` no `input_schema` da ferramenta. 'abertas' precisa incluir PENDENTE + ATRASADO + PARCIAL, como define `lib/financeQuery.ts:56`.
3. Somar por `saldoEmAberto`, não por `valorLiquido` — é o que a exportação usa e é o que desconta o já pago.
4. Calcular `total` com `prisma.receivable.count({ where })` e a soma com `aggregate({ _sum })` **sobre o mesmo `where`**, nunca sobre a página. Manter `take: 20` só para a lista de exemplos.
5. Devolver `{ total, soma, exibindo: 20, truncado: total > 20, itens: [...] }`.
6. Aplicar o mesmo tratamento nas outras ferramentas com o mesmo defeito: `:72-83`, `:113-121`, `:146-155`, `:180-186`.
7. No system prompt do assistente (`app/api/assistente/route.ts`), instruir: quando `truncado` for true, o modelo deve dizer que está mostrando parte e informar o total real.

#### Como verificar

- Perguntar ao assistente 'quanto tenho a receber?' e conferir o número contra a tela `/financeiro/receitas` na aba Abertas — precisam bater.
- Com mais de 20 contas abertas, confirmar que a resposta diz o total real e não '20'.

#### Cuidados

- Este achado interage com **G33**: se a tela ainda esconde vencidos de meses anteriores, o número do assistente (correto) vai divergir da tela (errada). Faça G33 antes ou explique a diferença.
- E com **G20**: sob sessão de suporte mascarada os valores chegam `null`; garanta que a soma não os trate como zero.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g08"></a>

### G08 · O assistente aceita histórico cru do navegador, sem teto nem validação, numa chave de IA única da plataforma sem limite nem medição por escritório

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Produto / SaaS |
| **Tema** | O SaaS que entrega, não cobra e não mede |
| **Posição na fila** | 21 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | ia, saas |

**Arquivos citados**

```
app/api/assistente/route.ts:22, :60, :70-89; prisma/schema.prisma:2934 (TenantUsage)
```

#### O que acontece

body.historico é aceito com um único Array.isArray() e espalhado em messages sem limite de itens, de tamanho ou de formato. Dois danos: (1) custo — qualquer usuário autenticado de qualquer escritório pode postar um histórico enorme em loop; não existe rate limit em lugar nenhum do projeto e a ANTHROPIC_API_KEY é global, então a conta cai inteira no dono da plataforma, sem cota, sem contagem e sem forma de saber depois qual tenant gastou; (2) integridade — dá para injetar blocos assistant/tool_result fabricados, e o modelo, instruído a confiar no que a ferramenta devolve, repete valores e processos inventados como se tivessem vindo do banco. O model TenantUsage (competencia, kind IA_TOKENS/DJEN_CONSULTA/BLOB_BYTES, estimatedCost) foi desenhado exatamente para medir isso e nenhuma linha de código escreve nele: o Painel Mestre mostra MRR e não mostra custo.

#### Correção aprovada pela auditoria

Validar o histórico no servidor: cortar para as últimas N trocas, rejeitar blocos tool_result vindos do cliente (o servidor os recria) e impor teto de caracteres. Gravar cada chamada em TenantUsage/IntegrationRun com officeId, tokens e duração, e aplicar quota diária por escritório derivada do plano. Deixar o assistente como opção que o escritório liga por escrito em Configurações, em vez de ficar ativo pela mera presença da variável de ambiente.

#### Por que nesta posição da fila

Enquanto o assistente estiver aberto para receber histórico arbitrário, a conta de IA é ilimitada e cai inteira em você, sem saber qual escritório gastou. Vem junto de G06 porque mexe no mesmo endpoint — validar o histórico e gravar TenantUsage na mesma passagem.

#### Passo a passo

1. Em `app/api/assistente/route.ts:22`, validar `body.historico` de verdade: cortar para as últimas N trocas (sugestão: 20), impor teto total de caracteres (sugestão: 60.000), e **rejeitar qualquer bloco `tool_result` vindo do cliente** — o servidor os recria a partir da execução real da ferramenta.
2. Validar o formato de cada mensagem (`role` só pode ser 'user' ou 'assistant'; `content` string ou array de blocos conhecidos). Qualquer coisa fora do formato: 400.
3. Gravar cada chamada em `TenantUsage` (`prisma/schema.prisma:2934`) — o model existe e nunca foi escrito: `{ officeId, competencia: 'YYYY-MM', kind: 'IA_TOKENS', quantidade: inputTokens + outputTokens, estimatedCost }`. Os tokens vêm no `usage` da resposta do SDK.
4. Aplicar quota diária por escritório derivada do plano: antes de chamar o modelo, somar o `TenantUsage` do dia e recusar com mensagem clara ao estourar.
5. Acrescentar um toggle de assistente por escritório em Configurações (hoje ele fica ativo pela mera presença de `ANTHROPIC_API_KEY`).
6. Mostrar o custo por escritório no Painel Mestre, ao lado do MRR.

#### Como verificar

- Postar um histórico com um bloco `tool_result` fabricado dizendo um valor falso — o servidor precisa rejeitar, e o assistente não pode repetir o valor.
- Fazer duas perguntas e conferir que apareceram duas linhas em `TenantUsage` com o `officeId` certo.

#### Cuidados

- Não quebre o histórico legítimo do chat: o corte precisa preservar o par pergunta/resposta mais recente inteiro.
- A quota derivada do plano só faz sentido depois de **G15** (escritório com plano de verdade). Sem G15, use um teto fixo generoso.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g21"></a>

### G21 · Horário de notificação calculado no fuso do servidor: quem escolhe 08:00 recebe às 05:00 de Brasília

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Funcionalidade |
| **Tema** | Encanamento que falha calado e acabamento do dia a dia |
| **Posição na fila** | 22 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | backend, advogado |

**Arquivos citados**

```
lib/notificationOutbox.ts:16-31 (nextDigestDueAt e nextWeeklyDueAt); vercel.json (cron daily-agenda "0 8 * * *"); components/comunicados/ComunicadosForm.tsx:86-99
```

#### O que acontece

nextDigestDueAt faz d.setHours(digestHour, 0, 0, 0) sobre um new Date() — hora local do runtime, que na Vercel é UTC (não há TZ definido em vercel.json nem em next.config.mjs). O dueAt gravado fica 3 horas adiantado em relação ao que o usuário escolheu, e como o drenador roda a cada 15 min o e-mail chega entre 05:00 e 05:15 de Brasília para quem configurou 08:00; o filtro de dias úteis com getDay() tem o mesmo desvio. O mesmo acontece com o cron daily-agenda, agendado "0 8 * * *" em UTC: a pauta do dia chega às 5h da manhã, e só para quem é isAdmin. A tela rotula o campo apenas como "Horário", sem indicar fuso. O projeto já sabe fazer certo em lib/publicationGrouping.ts, que usa Intl.DateTimeFormat com America/Sao_Paulo.

#### Correção aprovada pela auditoria

Converter o horário escolhido de America/Sao_Paulo para UTC antes de gravar dueAt (derivando o offset com Intl.DateTimeFormat, como já se faz em publicationGrouping) e calcular getDay() sobre a data já no fuso de Brasília. Mover o cron daily-agenda para "0 10 * * *" (7h de Brasília) e ampliar os destinatários além dos administradores.

#### Por que nesta posição da fila

Quem configurou 08:00 recebe às 05:00 da manhã — o efeito prático é a equipe desligar a notificação, e aí todas as melhorias de aviso dos itens 6, 7, 14 e 15 deixam de valer. Correção pequena com o padrão de fuso já usado em publicationGrouping.

#### Passo a passo

1. Em `lib/notificationOutbox.ts:16-31`, `nextDigestDueAt` e `nextWeeklyDueAt` fazem `d.setHours(digestHour, ...)` sobre um `new Date()` — hora local do runtime, que na Vercel é UTC.
2. Converter o horário escolhido de `America/Sao_Paulo` para UTC **antes** de gravar `dueAt`. O padrão certo já existe no projeto: `lib/publicationGrouping.ts` usa `Intl.DateTimeFormat` com `America/Sao_Paulo` para derivar o offset — copie de lá em vez de inventar.
3. Calcular o `getDay()` do filtro de dias úteis sobre a data **já convertida** para Brasília, senão a virada de dia erra na mesma proporção.
4. Em `vercel.json`, mover o cron `daily-agenda` de `"0 8 * * *"` (que é 5h de Brasília) para `"0 10 * * *"` (7h de Brasília).
5. Ampliar os destinatários do `daily-agenda` além dos `isAdmin` — hoje só administradores recebem a pauta do dia.
6. Em `components/comunicados/ComunicadosForm.tsx:86-99`, rotular o campo como 'Horário (horário de Brasília)'.

#### Como verificar

- Configurar o resumo para 08:00, gravar, e inspecionar o `dueAt` no banco: precisa ser 11:00 UTC.
- Conferir o horário real de chegada do e-mail no dia seguinte.

#### Cuidados

- Horário de verão brasileiro não existe hoje, mas derive o offset com `Intl` em vez de cravar `-3` — se voltar, o código continua certo.
- Os `dueAt` já gravados continuam errados. Rode um backfill recalculando os pendentes.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g17"></a>

### G17 · O ícone da aba ativa da barra inferior do app fica invisível no tema claro (bordô sobre bordô)

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Acessibilidade |
| **Tema** | Encanamento que falha calado e acabamento do dia a dia |
| **Posição na fila** | 23 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | frontend |

**Arquivos citados**

```
components/mobile/MobileBottomNav.tsx:66-67; app/globals.css:57-62
```

#### O que acontece

Confirmado no código: a aba ativa pinta o círculo com bg-marca e o ícone com text-marca-tx, e no tema Manhã (padrão de primeira instalação) --marca-tx é literalmente var(--marca) — o mesmo #8a2f42. Contraste 1,0:1: o ícone da aba em que a pessoa está some dentro da pílula, sobrando só o rótulo de 10px mudando de text-tx-2 para text-tx. No aplicativo que a equipe usa no fórum e na rua, o indicador principal de "onde eu estou" não existe no tema claro. Na Noite --marca-tx vira #c9707f e o ícone reaparece (2,5:1, ainda fraco).

#### Correção aprovada pela auditoria

Trocar por bg-rail-marca-bg text-rail-marca (tokens que já existem em globals.css exatamente para bordô sobre superfície que não clareia, 5,13:1, hoje usados só no NavRail) ou, mantendo o fundo bordô sólido, usar text-acao-tx (#f7eef0) no ícone. Conferir os dois temas antes de mexer na barra de novo.

#### Por que nesta posição da fila

Uma linha de classe, no app que a equipe usa fora do escritório, resolvendo o indicador principal de onde a pessoa está. Custo próximo de zero e é o tipo de defeito que a equipe sente todo dia.

#### Passo a passo

1. Em `components/mobile/MobileBottomNav.tsx:66-67`, a aba ativa hoje usa `bg-marca` + `text-marca-tx`. No tema Manhã `--marca-tx` é literalmente `var(--marca)` — mesma cor, contraste 1,0:1.
2. Escolher uma das duas correções: (a) trocar para `bg-rail-marca-bg text-rail-marca` — tokens que já existem em `app/globals.css:83` exatamente para bordô sobre superfície que não clareia (5,13:1); ou (b) manter o fundo bordô sólido `bg-marca` e trocar o ícone para `text-acao-tx` (#f7eef0).
3. Preferir (b) se o desenho pedir a pílula sólida, que é o que existe hoje; (a) se a pílula puder ser suave.
4. Conferir nos **dois** temas antes de fechar — o achado nasceu de uma correção que só foi olhada num deles.

#### Como verificar

- Abrir o app no celular (ou DevTools em modo mobile) no tema Manhã e confirmar que o ícone da aba ativa é visível.
- Alternar para Noite e confirmar que continua visível.

#### Cuidados

- Nenhum hex cru dentro do componente — a regra do design system é que a cor vem de token ou da escala do Tailwind. Ver `docs/DESIGN-SYSTEM.md`.
- É um conserto de duas classes e é P0 porque é o indicador de 'onde eu estou' no app que a equipe usa na rua. Não o misture com outra mudança na barra.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g45"></a>

### G45 · Cores do tema claro reprovam contraste: bordô sobre grafite em 9 telas e o terceiro nível de texto em 559 pontos

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Acessibilidade |
| **Tema** | Encanamento que falha calado e acabamento do dia a dia |
| **Posição na fila** | 24 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | frontend |

**Arquivos citados**

```
app/globals.css:39 (--tx-3: #9b9797) e :83 (--rail-marca); components/TeamMonitorPanel.tsx:125,147; components/TopBarActionsContent.tsx:66; components/ClaudeAssistantWidget.tsx:93; app/m/mais/page.tsx:54; components/ui.tsx:107,171,181; components/ReceivablesList.tsx:180; components/PayablesList.tsx:178
```

#### O que acontece

Dois defeitos de cor no tema padrão. (1) O padrão bg-grafite-700/800 text-marca se repete em nove lugares para desenhar avatar sem foto, o botão do assistente e o ícone da seção ativa de Configurações: bordô #8a2f42 sobre grafite rende 1,84:1 e 2,15:1, abaixo até do mínimo de 3:1 para elemento gráfico — as iniciais no Monitor de Equipe viram um borrão e o botão do assistente parece um círculo vazio. O token criado exatamente para isso (--rail-marca #c9707f, 5,13:1) tem um único consumidor no produto inteiro. (2) --tx-3 rende 2,89:1 sobre branco e 2,38:1 sobre a superfície de apoio, e é usado como conteúdo real: badge de status Cancelado, valor riscado de conta cancelada, data de vencimento de conta sem prazo, corpo inteiro do EmptyState e placeholder de 28 campos. Na Noite o mesmo token dá 4,03:1 — o tema ruim é justamente o padrão.

#### Correção aprovada pela auditoria

Trocar text-marca por text-rail-marca nas nove ocorrências sobre grafite e anotar a regra em DESIGN-SYSTEM.md §2 (bordô sobre superfície escura é sempre --rail-marca). Escurecer --tx-3 na Manhã de #9b9797 para cerca de #6f6b6b (≈4,6:1 sobre branco), mantendo a Noite como está — uma linha corrige os 559 pontos de uma vez — e tirar text-tx-3 do badge de status e do valor riscado, que são dado financeiro, não legenda.

#### Por que nesta posição da fila

Mesma frente visual do item anterior, mesmo custo: trocar um token em nove lugares e escurecer uma variável no globals.css corrige 559 pontos de uma vez. Vale fazer junto para fechar o acabamento numa só passagem.

#### Passo a passo

1. **Parte 1 — bordô sobre grafite (9 telas).** O padrão `bg-grafite-700/800 text-marca` rende 1,84:1 e 2,15:1, abaixo do mínimo de 3:1 até para elemento gráfico. Trocar `text-marca` por `text-rail-marca` (`--rail-marca` = #c9707f, 5,13:1) nas nove ocorrências: `components/TeamMonitorPanel.tsx:125` e `:147`, `components/TopBarActionsContent.tsx:66`, `components/ClaudeAssistantWidget.tsx:93`, `app/m/mais/page.tsx:54`, `components/ui.tsx:107`, `:171`, `:181`, `components/ReceivablesList.tsx:180`, `components/PayablesList.tsx:178`.
2. Anotar a regra em `docs/DESIGN-SYSTEM.md` §2: **bordô sobre superfície escura é sempre `--rail-marca`**. O token foi criado exatamente para isso e hoje tem um único consumidor no produto inteiro.
3. **Parte 2 — `--tx-3`.** Em `app/globals.css:39`, escurecer `--tx-3` no tema Manhã de `#9b9797` (2,89:1 sobre branco) para cerca de `#6f6b6b` (≈4,6:1). Manter a Noite como está (lá o token já rende 4,03:1). Uma linha corrige os 559 pontos de uma vez.
4. **Parte 3 —** tirar `text-tx-3` de onde ele carrega **dado**, não legenda: badge de status Cancelado, valor riscado de conta cancelada, data de vencimento de conta sem prazo. Esses são dado financeiro e merecem `--tx-2`.

#### Como verificar

- Abrir o Monitor de Equipe no tema Manhã e conferir que as iniciais do avatar são legíveis.
- Conferir o botão do assistente — hoje parece um círculo vazio.
- Passar as telas principais num verificador de contraste nos dois temas.

#### Cuidados

- Mudar `--tx-3` afeta **559 pontos** de uma vez. Faça um passe visual pelas telas principais nos dois temas antes de mergear — é uma mudança de uma linha com alcance enorme.
- Nenhum hex cru dentro de componente: a cor vem do token. Ver `docs/DESIGN-SYSTEM.md`.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g32"></a>

### G32 · Nenhuma coluna de chave estrangeira tem índice: toda aba do processo e toda exclusão varrem a tabela inteira do escritório

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Performance |
| **Tema** | Encanamento que falha calado e acabamento do dia a dia |
| **Posição na fila** | 25 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | eng-dados |

**Arquivos citados**

```
prisma/schema.prisma:945 (Task), :1022 (Comment), :1311 (Attachment), :2453 (Publication), :1895 (Payable), :2039 (Receivable); lib/actions/financeiro.ts:246-256
```

#### O que acontece

O Postgres não cria índice automático na coluna que referencia. No schema, praticamente todo modelo declara apenas @@index([officeId]) e, quando muito, um composto com data — nenhuma coluna caseId, taskId, receivableId, payableId, honorarioLancamentoId ou responsibleId tem índice, embora Task declare dez FKs. Duas consequências: abrir um processo dispara cerca de dez consultas aninhadas resolvidas por caseId sobre a tabela inteira do escritório, e a página fica mais lenta a cada mês de uso para todo mundo; e cada exclusão de Receivable/Payable força varredura de Task inteira para checar a FK em cascata, o mesmo valendo para Attachment/Comment/Publication ao excluir um processo. syncReminderTask ainda roda um task.updateMany por receivableId/payableId em toda baixa de conta.

#### Correção aprovada pela auditoria

Acrescentar índices nas FKs efetivamente consultadas, priorizando as quentes: Task([caseId]), Task([attendanceId]), Task([receivableId]), Task([payableId]), Task([officeId, responsibleId, status]); Attachment([caseId]), Attachment([attendanceId]); Comment([caseId]); Publication([caseId]); Payable([caseId]); Receivable([caseId]), Receivable([clientId]), Receivable([honorarioLancamentoId]); Case([officeId, responsibleId]). São mudanças puramente aditivas.

#### Por que nesta posição da fila

Mudança puramente aditiva, sem risco de quebrar comportamento, e que segura a degradação da tela mais aberta do dia antes de você atacar a página do processo em si (item 41). Quanto mais meses de uso acumularem, pior fica para todo mundo ao mesmo tempo.

#### Passo a passo

1. Mudança puramente aditiva em `prisma/schema.prisma`. Acrescentar, priorizando as consultas quentes:
2. `Task`: `@@index([caseId])`, `@@index([attendanceId])`, `@@index([receivableId])`, `@@index([payableId])`, `@@index([officeId, responsibleId, status])`.
3. `Attachment`: `@@index([caseId])`, `@@index([attendanceId])`. `Comment`: `@@index([caseId])`. `Publication`: `@@index([caseId])`.
4. `Payable`: `@@index([caseId])`. `Receivable`: `@@index([caseId])`, `@@index([clientId])`, `@@index([honorarioLancamentoId])`. `Case`: `@@index([officeId, responsibleId])`.
5. Mergear e deixar o build de produção rodar `prisma db push` (o script de build já faz isso quando `VERCEL_ENV = production`).
6. Depois do deploy, medir de novo o tempo de abertura de um processo grande para confirmar o ganho.

#### Como verificar

- `npx prisma validate` e `npx prisma generate` locais precisam passar.
- Depois do deploy, abrir um processo com muitas tarefas/anexos e comparar o tempo com o antes.

#### Cuidados

- Criar índice em tabela grande **bloqueia escrita** durante a criação no Postgres. Faça o deploy fora do horário de expediente. Se a base já for grande, considere criar manualmente com `CREATE INDEX CONCURRENTLY` antes de mergear, e só então mergear o schema (aí o `db push` vira no-op).
- Não adicione índice em coluna que ninguém consulta — cada índice custa em escrita. A lista acima é a das FKs efetivamente consultadas.
- É o item que **multiplica o ganho de G39**. Faça-o antes.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g16"></a>

### G16 · Nenhuma fatura mensal é gerada automaticamente: cobrar cada escritório é um clique manual, um por um, todo mês

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Produto / SaaS |
| **Tema** | O SaaS que entrega, não cobra e não mede |
| **Posição na fila** | 26 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | saas |

**Arquivos citados**

```
lib/actions/painelMestre.ts:336 (único tenantInvoice.create); lib/actions/billing.ts (runBillingCycle); components/painelMestre/OfficeDetailPanel.tsx:342
```

#### O que acontece

O único ponto do sistema que cria TenantInvoice é generateAndSendInvoice, disparado por um botão de tela, por escritório. O cron diário só reconcilia com a Asaas, manda lembrete e suspende faturas que já existem — nunca cria a fatura do mês. Com 10 escritórios são 10 cliques mensais; com 100, um expediente inteiro. E o mês em que o operador esquecer um cliente, esse cliente não recebe fatura, não recebe lembrete, não estoura carência e não é suspenso: usa o software de graça e ninguém percebe, porque não existe nenhum alerta de "escritório ativo sem fatura na competência".

#### Correção aprovada pela auditoria

Acrescentar um passo 0 ao runBillingCycle: para cada Office com isInternal=false, status ATIVA, monthlyFee e billingDueDay preenchidos, fazer upsert da TenantInvoice da competência (a unique officeId_competencia já garante idempotência), reaproveitando o cálculo de valor e vencimento de generateAndSendInvoice, que passa a ser só o "reenviar agora" manual. Colocar no Cockpit o contador "Ativos sem fatura na competência".

#### Por que nesta posição da fila

Com o gate de módulo já valendo (item 11), faz sentido ligar a cobrança. Este vem antes do cadastro porque é o que garante que os escritórios que você já tem sejam faturados sem depender de alguém lembrar — a unique por competência já dá a idempotência de graça.

#### Passo a passo

1. Extrair de `generateAndSendInvoice` (`lib/actions/painelMestre.ts:336`) o cálculo de valor e de data de vencimento para uma função pura reaproveitável, por exemplo `montarFaturaDaCompetencia(office, competencia)`.
2. Acrescentar um **passo 0** a `runBillingCycle` (`lib/actions/billing.ts`): para cada `Office` com `isInternal: false`, `status: 'ATIVA'`, `monthlyFee` e `billingDueDay` preenchidos, fazer `upsert` da `TenantInvoice` da competência corrente.
3. A unique `officeId_competencia` já garante idempotência — o cron pode rodar todo dia sem duplicar.
4. `generateAndSendInvoice` passa a ser só o botão 'reenviar agora' manual, chamando a mesma função.
5. Acrescentar ao Cockpit do Painel Mestre o contador 'Ativos sem fatura na competência', que é o alarme de que o passo 0 falhou.

#### Como verificar

- Rodar o cron manualmente numa competência de teste e conferir que todas as faturas do mês foram criadas.
- Rodar de novo — nada pode duplicar.
- Deixar um escritório sem `billingDueDay` e conferir que ele aparece no contador 'Ativos sem fatura'.

#### Cuidados

- **Faturar é irreversível do ponto de vista do cliente.** Rode primeiro em modo simulação (log do que seria criado, sem criar) e mostre ao dono antes de ligar de verdade.
- Faz par com **G15**: sem plano gravado no cadastro, o passo 0 não tem `monthlyFee` para faturar.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g15"></a>

### G15 · O cadastro público entrega os quatro módulos de graça, para sempre, sem plano, sem assinatura e sem período de teste

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Produto / SaaS |
| **Tema** | O SaaS que entrega, não cobra e não mede |
| **Posição na fila** | 27 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | saas |

**Arquivos citados**

```
lib/actions/signup.ts:63; prisma/schema.prisma:98-101; lib/actions/painelMestre.ts:314; app/page.tsx:239
```

#### O que acontece

signupOffice cria o Office só com name/slug/blogAccess. Como moduloFinanceiro, WhatsApp, Atendimento e Assessoria têm @default(true), todo escritório que se cadastra sozinho sai com o produto completo ligado — inclusive Assessoria e WhatsApp, que nos planos mais baratos nem entram. E como nasce sem planId, sem Subscription, sem monthlyFee, sem billingEmail e sem billingDueDay, generateAndSendInvoice recusa a fatura e o cron de cobrança nunca tem o que cobrar nem o que suspender. Os cinco botões "Começar" da tabela de preços levam a um formulário que dá o software inteiro sem cobrar e sem prazo; o escritório só vira pagante se alguém lembrar de abrir o Painel Mestre e preencher tudo à mão. Subscription.trialEndsAt e o status TESTE existem no schema e nenhum código escreve neles.

#### Correção aprovada pela auditoria

Fazer /cadastro carregar o plano escolhido (/cadastro?plano=GOLD) e, na mesma transação: gravar planId, copiar a composição de módulos do Plan para os quatro booleanos em vez de aceitar o default true, criar a Subscription com status TESTE, trialEndsAt = hoje+14 e monthlyFee do catálogo, e preencher billingEmail/billingDueDay. No runBillingCycle, converter TESTE vencido em cobrança ou bloqueio, avisando por e-mail 3 dias antes do fim.

#### Por que nesta posição da fila

Depende do ciclo de faturamento do item anterior para ter onde encaixar o trial. Feito na ordem, o escritório novo nasce com plano, módulos do plano e assinatura em TESTE, e o cron converte ou bloqueia sozinho — a partir daí a venda para de depender de trabalho manual.

#### Passo a passo

1. Fazer `/cadastro` receber o plano escolhido: os cinco botões 'Começar' da tabela de preços (`app/page.tsx:239`) passam a apontar para `/cadastro?plano=GOLD` etc.
2. Em `signupOffice` (`lib/actions/signup.ts:63`), ler o plano, buscar o `Plan` correspondente e, **na mesma transação**: gravar `planId`; copiar a composição de módulos do plano para os quatro booleanos (em vez de aceitar o `@default(true)` do schema); preencher `monthlyFee`, `billingEmail` e `billingDueDay`.
3. Criar a `Subscription` com `status: 'TESTE'`, `trialEndsAt = hoje + 14 dias` e `monthlyFee` do catálogo — os dois campos existem no schema e nunca foram escritos.
4. Em `runBillingCycle` (`lib/actions/billing.ts`), tratar `TESTE` vencido: converter em cobrança ou bloquear o acesso, e enviar aviso por e-mail 3 dias antes do fim do teste.
5. Se `?plano` vier ausente ou inválido, escolher o plano mais básico — nunca cair no default de tudo ligado.

#### Como verificar

- Cadastrar um escritório de teste por cada um dos cinco botões e conferir, no Painel Mestre, que ele nasceu com o plano certo, os módulos certos, `Subscription` em TESTE e `trialEndsAt` daqui a 14 dias.
- Adiantar `trialEndsAt` para ontem num escritório de teste e rodar o ciclo de cobrança — precisa converter ou bloquear.

#### Cuidados

- **Não mexa nos escritórios já existentes.** Um backfill que 'arrume' os cadastros antigos pode cortar acesso de quem hoje usa de graça por acordo. Liste-os e deixe a decisão com o dono.
- Faz par com **G16**: sem a geração automática de fatura, o plano fica gravado e ninguém é cobrado do mesmo jeito.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g10"></a>

### G10 · Prazo final e data de abertura de licitação não entram na Agenda, nos alertas nem no resumo diário

| | |
|---|---|
| **Severidade** | P0 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Praticidade jurídica |
| **Tema** | O prazo, que é o ativo mais caro do escritório |
| **Posição na fila** | 28 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | advogado |

**Arquivos citados**

```
lib/alerts.ts:5-25 e :49; components/assessoria/AssessoriaOverviewTab.tsx:9-23; lib/actions/assessoria.ts:502-575
```

#### O que acontece

Licitacao.prazoFinal e Licitacao.dataAbertura são datas fatais (perder a sessão pública ou o prazo de impugnação = perder o certame do cliente), mas nenhuma vira compromisso. O union de AlertItem não tem nenhum kind de licitação e TodayItem só aceita TAREFA|EVENTO|AUDIENCIA|PERICIA|PRAZO|CONTA_PAGAR|CONTA_RECEBER; prazoFinal não aparece em lib/alerts.ts, lib/email.ts, lib/push.ts nem na página da Agenda. Para saber o que vence na semana o sócio precisa abrir Assessoria e percorrer empresa por empresa. Com 10 ou 20 assessorias isso não acontece — o prazo some da fila do dia, do e-mail e do push. De quebra, o único lugar que mostra o prazo (AssessoriaOverviewTab.tsx:15) rotula com l.objeto.slice(0,40), o texto do edital cortado, ignorando o campo nome de gestão criado justamente para isso.

#### Correção aprovada pela auditoria

Materializar o prazo de licitação como compromisso: em addLicitacao/updateLicitacao criar e atualizar duas Tasks type=PRAZO com licitacaoId ("Sessão de abertura — {nome}" e "Prazo final — {nome}"), canceladas quando o status virar VENCEDORA/PERDIDA/CANCELADA. Elas entram de graça na Agenda, no painel do dia, no e-mail diário e no push, que já leem Task. Enquanto isso, trocar l.objeto.slice(0,40) por l.nome ?? l.objeto.

#### Por que nesta posição da fila

Perder a sessão pública é perder o certame do cliente. A solução é barata porque reaproveita tudo que já funciona: virando Task, o prazo entra sozinho na agenda, no painel do dia, no e-mail e no push — que a esta altura já estarão corrigidos pelos itens 6, 7, 14, 15 e 22.

#### Passo a passo

1. **Correção barata primeiro:** em `components/assessoria/AssessoriaOverviewTab.tsx:15`, trocar `l.objeto.slice(0, 40)` por `l.nome ?? l.objeto` — o campo `nome` foi criado exatamente para isso.
2. Em `addLicitacao` e `updateLicitacao` (`lib/actions/assessoria.ts:502-575`), materializar duas `Task` do tipo `PRAZO` vinculadas por `licitacaoId`: 'Sessão de abertura — {nome}' com `dueDate = dataAbertura`, e 'Prazo final — {nome}' com `dueDate = prazoFinal`.
3. No `update`, sincronizar: se a data mudou, atualizar a Task; se o campo foi apagado, apagar a Task.
4. Quando o status virar `VENCEDORA`, `PERDIDA` ou `CANCELADA` (em `updateLicitacaoStatus`), concluir ou cancelar as duas Tasks.
5. Não é preciso mexer em `lib/alerts.ts`, `lib/email.ts` nem `lib/push.ts`: como são `Task`, elas entram de graça na Agenda, no painel do dia, no resumo diário e no push.
6. Backfill: rota admin que cria as Tasks para as licitações já cadastradas com data futura.

#### Como verificar

- Cadastrar uma licitação com prazo final para daqui a 2 dias e conferir que ela apareceu na Agenda, na Central de Alertas e no resumo diário.
- Mudar o status para PERDIDA e conferir que os compromissos saíram da agenda.

#### Cuidados

- Definir o responsável da Task: use o responsável da licitação se houver, senão o admin do escritório — senão você recria o **G09** (prazo sem responsável não notifica).
- Cuidado com laço de revalidação: `updateLicitacao` já chama `revalidatePath` para desktop e mobile; acrescente as rotas da Agenda.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g24"></a>

### G24 · Número de processo entra sem validação de dígito verificador CNJ — um dígito trocado e o processo nunca recebe publicação

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Dados |
| **Tema** | O prazo, que é o ativo mais caro do escritório |
| **Posição na fila** | 29 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | juiz |

**Arquivos citados**

```
lib/processNumber.ts; lib/actions/cases.ts:256; lib/roboBridge.ts:37-42; prisma/schema.prisma:723
```

#### O que acontece

createCase grava processNumber: data.processNumber || null cru; normalizeProcessNumber só remove pontuação e normalizarNumeroProcesso, usada no roteamento, só confere se há 20 dígitos. Não existe cálculo de dígito verificador em lugar nenhum. Um erro de digitação gera um número de 20 dígitos perfeitamente aceito que jamais casará com o número real vindo do DJEN: o processo existe no Lúmen, aparece na lista, e simplesmente nunca recebe publicação — sem que nada acuse o problema. Some-se a isso que não há unique em [officeId, processNumber] (só um índice), então o mesmo processo cadastrado duas vezes no mesmo escritório também quebra o roteamento.

#### Correção aprovada pela auditoria

Implementar a validação do dígito verificador CNJ (módulo 97 base 10.000, Res. CNJ 65/2008) em lib/processNumber.ts e chamá-la em createCase, updateCase e promoteCaseToJudicial, recusando ou avisando em vermelho no formulário quando o DV não fecha, e alertar o administrador quando o mesmo número aparecer em mais de um Case do escritório.

#### Por que nesta posição da fila

Um dígito trocado no cadastro e o processo nunca recebe publicação, sem nada acusar. A validação é uma função pura e fecha, no lado do cadastro, o mesmo problema que G04 fecha no lado do roteamento — vale corrigir enquanto o assunto ainda está fresco.

#### Passo a passo

1. Implementar em `lib/processNumber.ts` a validação do dígito verificador CNJ — módulo 97 base 10.000, Resolução CNJ 65/2008. Formato NNNNNNN-DD.AAAA.J.TR.OOOO: o DV é `98 - ((NNNNNNN AAAA J TR OOOO) mod 97)`.
2. Exportar `validarDigitoVerificadorCNJ(numero: string): boolean`.
3. Chamar em `createCase` (`lib/actions/cases.ts:256`), `updateCase` e `promoteCaseToJudicial`.
4. Na tela, avisar em vermelho quando o DV não fecha. **Decida com o dono se é recusa ou aviso**: número de processo administrativo e numeração antiga não seguem o padrão CNJ, então recusar de forma dura pode travar cadastro legítimo. A recomendação é avisar e pedir confirmação.
5. Acrescentar `@@unique([officeId, processNumber])` — ou, se houver duplicatas legítimas hoje, um alerta ao administrador quando o mesmo número aparecer em mais de um `Case` do escritório.
6. Rodar uma varredura (rota admin, só leitura) listando os processos existentes cujo DV não fecha, para o escritório corrigir.

#### Como verificar

- Testar com um número CNJ real conhecido (DV precisa fechar) e com o mesmo número com um dígito trocado (precisa falhar).
- Conferir que o cadastro de um processo administrativo sem numeração CNJ ainda é possível.

#### Cuidados

- Antes de acrescentar a unique, rode a varredura: se já existirem duplicatas em produção, o `prisma db push` do build de produção **falha** e o deploy quebra. Limpe primeiro.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g23"></a>

### G23 · Duas intimações distintas do mesmo processo no mesmo dia viram um card só, e gerar um compromisso baixa as duas para o escritório inteiro

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Gestão jurídica |
| **Tema** | O prazo, que é o ativo mais caro do escritório |
| **Posição na fila** | 30 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | juiz |

**Arquivos citados**

```
lib/publicationGrouping.ts:82-93; lib/publicationResolution.ts:65-77; components/PublicationsTriage.tsx:493-505
```

#### O que acontece

O agrupamento da fila é feito só por número CNJ normalizado + dia de Brasília, sem olhar o teor nem a fonte. O objetivo é juntar cópias do MESMO ato vindas de DJEN, Datajud e e-mail, mas o critério não distingue isso de dois atos reais publicados no mesmo dia no mesmo processo — situação corriqueira (sentença e despacho saneador; intimação de audiência e intimação para manifestar sobre laudo). Quando o advogado clica "Criar tarefa com prazo" para um deles, resolvePublicationGroupForOffice grava PublicationRead de todos os itens para todos os membros ativos e marca deadlineGenerated=true em todos. O segundo ato, com prazo próprio e possivelmente mais curto, some da fila de todo o escritório com a tarja "Compromisso gerado", sem nunca ter sido triado, e nenhum contador ou alerta volta a mostrá-lo. O drawer chega a listar os textos separados, mas há um único botão para o grupo inteiro.

#### Correção aprovada pela auditoria

Só colapsar itens quando forem realmente a mesma comunicação: comparar o teor normalizado (hash do texto sem acento e pontuação, ou similaridade alta) além de processo+dia; textos divergentes viram cards distintos mesmo no mesmo dia. Onde a incerteza permanecer, manter um card só mas exigir uma decisão por bloco de teor, e nunca marcar deadlineGenerated em item cujo teor não gerou compromisso.

#### Por que nesta posição da fila

Com o prazo sugerido já corrigido (item 5), o próximo furo da triagem é este: gerar compromisso para um ato baixa o outro para o escritório inteiro, e o segundo ato some sem nunca ter sido lido. Situação corriqueira (sentença mais despacho no mesmo dia), não caso de exceção.

#### Passo a passo

1. Em `lib/publicationGrouping.ts:82-93`, o agrupamento é por número CNJ normalizado + dia de Brasília. Acrescentar ao critério um **hash do teor normalizado** (texto sem acento, sem pontuação, minúsculo) — ou uma medida de similaridade alta.
2. Itens com teor divergente no mesmo processo e no mesmo dia passam a ser cards distintos. Cópias do mesmo ato vindas de DJEN/Datajud/e-mail continuam colapsando, que é o objetivo original.
3. Em `lib/publicationResolution.ts:65-77`, `resolvePublicationGroupForOffice` marca `deadlineGenerated: true` e grava `PublicationRead` para **todos** os itens do grupo. Restringir: só marcar os itens cujo teor efetivamente gerou o compromisso.
4. Em `components/PublicationsTriage.tsx:493-505`, onde o drawer já lista os textos separados, trocar o botão único do grupo por uma decisão **por bloco de teor**.

#### Como verificar

- Inserir duas publicações de teste no mesmo processo e no mesmo dia com teores diferentes — precisam virar dois cards.
- Inserir a mesma publicação vinda de duas fontes — precisa continuar virando um card só.
- Gerar compromisso para um dos dois atos e conferir que o outro **continua** na fila, sem tarja.

#### Cuidados

- Normalize bem antes de comparar: cabeçalho de fonte, quebras de linha e espaços variam entre DJEN e e-mail para o mesmo ato. Um hash cru rigoroso demais quebra o colapso legítimo e enche a fila de duplicatas — que é o problema oposto e igualmente ruim.
- Teste com uma amostra real de publicações do escritório antes de mergear.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g22"></a>

### G22 · Feriados cadastrados pelo escritório valem para processos de qualquer tribunal — o campo de escopo é mostrado na tela e ignorado no cálculo

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Gestão jurídica |
| **Tema** | O prazo, que é o ativo mais caro do escritório |
| **Posição na fila** | 31 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | juiz |

**Arquivos citados**

```
app/(app)/publicacoes/page.tsx:105; lib/prazos.ts:71-78 (isDiaUtil); prisma/schema.prisma:2147 (Holiday.scope); components/honorarios/ApurarHonorarioModal.tsx:83
```

#### O que acontece

O escritório cadastra feriados classificando-os como Estadual, Municipal ou Forense, e o HolidaysManager mostra esse rótulo em cada linha, o que dá a entender que o sistema sabe onde cada um vale. Não sabe: a consulta que alimenta o cálculo seleciona apenas date, e isDiaUtil trata qualquer feriado extra como não útil para qualquer processo. Um feriado municipal de Goiânia, ou uma suspensão por portaria do TJGO, empurra também o prazo de um processo do TJSP, do TRT-18 ou do TRF-1 — e o erro é sempre na direção perigosa: a data sugerida fica depois do prazo real e o advogado protocola fora do prazo confiando no cálculo. O dado necessário existe e é ignorado (Publication.tribunalDetectado, Case.tribunalSigla). O mesmo problema está na apuração de honorários, que passa a lista inteira de holidays para addDiasUteis.

#### Correção aprovada pela auditoria

Acrescentar a Holiday os campos que faltam (uf e tribunalSigla, além de scope) e passar o tribunal do processo/publicação para addDiasUteis, filtrando: NACIONAL sempre entra, ESTADUAL/MUNICIPAL só quando a UF bate, FORENSE só quando a sigla do tribunal bate. Enquanto o filtro não existir, mostrar na triagem quais feriados extras entraram naquele cálculo, para o advogado conferir.

#### Por que nesta posição da fila

Refina o cálculo de prazo depois que a base já está certa: o erro sempre empurra a data para depois do prazo real. Precisa de campos novos em Holiday, por isso vem depois de G02, mas antes que o escritório cadastre muito mais feriado sem escopo.

#### Passo a passo

1. Acrescentar a `Holiday` (`prisma/schema.prisma:2147`) os campos que faltam: `uf String?` e `tribunalSigla String?`, ao lado do `scope` que já existe e é exibido na tela mas nunca lido.
2. Atualizar o `HolidaysManager` para pedir UF quando o escopo for ESTADUAL/MUNICIPAL e sigla quando for FORENSE.
3. Mudar `isDiaUtil` (`lib/prazos.ts:71-78`) e `addDiasUteis` para receberem o **tribunal do processo/publicação** e filtrarem: `NACIONAL` sempre entra; `ESTADUAL`/`MUNICIPAL` só quando a UF bate; `FORENSE` só quando a sigla do tribunal bate.
4. Passar o tribunal nos dois pontos de chamada: `app/(app)/publicacoes/page.tsx:105` (usar `Publication.tribunalDetectado`) e `components/honorarios/ApurarHonorarioModal.tsx:83` (usar `Case.tribunalSigla`).
5. Backfill: para os feriados já cadastrados, preencher `uf` com a UF do escritório quando o escopo for estadual/municipal — e **listar** os que ficaram ambíguos para o dono revisar.
6. **Correção parcial imediata, enquanto o filtro não existe:** mostrar na triagem quais feriados extras entraram naquele cálculo, para o advogado conferir a olho.

#### Como verificar

- Cadastrar um feriado municipal de Goiânia e conferir que o prazo de um processo do TJSP **não** é empurrado por ele.
- Conferir que um feriado nacional continua empurrando todos.

#### Cuidados

- Este cálculo erra hoje sempre 'para mais' (data sugerida depois do prazo real). Depois da correção alguns prazos vão **encurtar** — avise o dono, porque prazos já agendados podem estar com data errada e precisam de conferência manual.
- Quando o tribunal não for conhecido, o comportamento seguro é aplicar só os feriados NACIONAIS (e avisar na tela), não a lista inteira.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g41"></a>

### G41 · A Central de Alertas lista os prazos vencidos do escritório sem dizer de quem é cada um, sem filtro por pessoa e com link fixo para /agenda

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Gestão jurídica |
| **Tema** | O prazo, que é o ativo mais caro do escritório |
| **Posição na fila** | 32 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | gestao-escritorio |

**Arquivos citados**

```
lib/alerts.ts:169-172 e :261-275; app/(app)/alertas/page.tsx
```

#### O que acontece

O alerta PRAZO_VENCIDO é montado a partir de todas as tarefas vencidas do escritório, mas o findMany não inclui responsible e o tipo AlertItem não tem nenhum campo de responsável: o card mostra só título, processo e data. O sócio abre a Central de Alertas, vê "14 prazos vencidos" e não consegue saber, sem clicar um a um, se são 14 do estagiário ou 14 espalhados, nem filtrar por pessoa para cobrar — é exatamente a tela onde a cobrança deveria acontecer e ela é anônima. Pior, o href de todos é a string fixa "/agenda", então o clique nem leva ao compromisso certo.

#### Correção aprovada pela auditoria

Incluir responsible: { select: { id, name, color } } no findMany, acrescentar responsibleName/responsibleId ao AlertItem, renderizar o círculo colorido já usado no Kanban e colocar no topo da página um filtro por pessoa. Trocar o href fixo por /agenda?visao=lista&responsibleId=... ou pelo deep link do compromisso — a Agenda já aceita responsibleId.

#### Por que nesta posição da fila

É a tela onde a cobrança interna deveria acontecer e ela é anônima. O dado já está no banco — falta um include e um campo no tipo. Barato, e transforma um número inútil ('14 prazos vencidos') em ação de gestão.

#### Passo a passo

1. Em `lib/alerts.ts:169-172`, o `findMany` que monta `PRAZO_VENCIDO` não inclui o responsável. Acrescentar `responsible: { select: { id: true, name: true, color: true } }`.
2. Acrescentar `responsibleName` e `responsibleId` ao tipo `AlertItem` (`:7-27`).
3. Renderizar no card o círculo colorido que o Kanban já usa — copie o componente, não reinvente.
4. Colocar no topo de `app/(app)/alertas/page.tsx` um filtro por pessoa.
5. Trocar o `href` fixo `"/agenda"` (`:261-275`) por `/agenda?visao=lista&responsibleId=...` ou pelo deep link do próprio compromisso — a Agenda já aceita `responsibleId`.

#### Como verificar

- Abrir a Central de Alertas com prazos vencidos de pessoas diferentes e conferir que cada card mostra de quem é.
- Filtrar por uma pessoa e conferir que a lista reduz.
- Clicar num card e conferir que cai no compromisso certo, não na agenda genérica.

#### Cuidados

- Interage com **G09**: prazo sem responsável vai aparecer sem nome. Aproveite e destaque esses como 'sem responsável' — é justamente o caso que precisa de ação.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g44"></a>

### G44 · O assistente só olha para frente: prazo vencido e compromisso de hoje são invisíveis para ele

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 11 de 11 votos válidos (um votante não cobriu este item) |
| **Categoria** | Praticidade jurídica |
| **Tema** | O prazo, que é o ativo mais caro do escritório |
| **Posição na fila** | 33 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | ia |

**Arquivos citados**

```
lib/assistantTools.ts:139-152; comparar com lib/alerts.ts:170 e lib/dueStatus.ts:21-33
```

#### O que acontece

O filtro de consultar_agenda é dueDate: { gte: agora, lte: ate }, com agora = new Date() incluindo hora. Duas falhas num escritório que vive de prazo: nada vencido aparece — perguntar "tenho algum prazo atrasado?" faz o assistente responder honestamente "não encontrei nada", que é a resposta mais perigosa possível; e dueDate é data-calendário à meia-noite UTC (convenção documentada em lib/dueStatus.ts), então qualquer prazo de HOJE já está com dueDate < agora a partir do primeiro minuto do dia — perguntar de tarde "o que vence hoje?" retorna vazio. A regra correta já existe em lib/alerts.ts, que normaliza o dia, e em classificarPrazo.

#### Correção aprovada pela auditoria

Trocar o piso por o início do dia e acrescentar o parâmetro incluirAtrasados (padrão true) ao input_schema, devolvendo cada item com a urgência de classificarPrazo. Melhor ainda, reaproveitar a consulta de lib/alerts.ts em vez de reescrever a regra de prazo pela terceira vez no projeto.

#### Por que nesta posição da fila

'Não encontrei nada atrasado' é a resposta mais perigosa que o sistema pode dar. A regra correta já existe em dois lugares do projeto; é trocar o piso da consulta e reaproveitar lib/alerts.ts em vez de reescrever a regra de prazo pela terceira vez.

#### Passo a passo

1. Em `lib/assistantTools.ts:139-152`, o filtro de `consultar_agenda` é `dueDate: { gte: agora, lte: ate }` com `agora = new Date()` incluindo hora.
2. Trocar o piso pelo **início do dia** (normalizado como em `lib/alerts.ts:170`). Sem isso, qualquer prazo de hoje já está com `dueDate < agora` a partir do primeiro minuto do dia, e 'o que vence hoje?' responde vazio à tarde.
3. Acrescentar `incluirAtrasados` (padrão `true`) ao `input_schema` da ferramenta, para que 'tenho algum prazo atrasado?' pare de responder 'não encontrei nada' — que é a resposta mais perigosa possível.
4. Devolver cada item com a urgência de `classificarPrazo` (`lib/dueStatus.ts:21-33`).
5. **Melhor ainda:** reaproveitar a consulta de `lib/alerts.ts` em vez de reescrever a regra de prazo pela terceira vez no projeto.

#### Como verificar

- Perguntar ao assistente 'o que vence hoje?' às 15h com um prazo cadastrado para hoje — precisa aparecer.
- Perguntar 'tenho algum prazo atrasado?' com um prazo vencido — precisa listar.

#### Cuidados

- Único achado com 11 votos válidos (11/11 = 100%) — um votante não o cobriu. O consenso entre quem votou foi total.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g25"></a>

### G25 · Alterar a data de um prazo não deixa rastro: sem histórico, sem autor, sem valor anterior

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Dados |
| **Tema** | O prazo, que é o ativo mais caro do escritório |
| **Posição na fila** | 34 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | juiz |

**Arquivos citados**

```
lib/actions/tasks.ts:406-446 (updateTask); prisma/schema.prisma:859 (Task); prisma/schema.prisma:3251 (AuditEvent)
```

#### O que acontece

updateTask sobrescreve dueDate, safetyDueDate, tipo, responsável e prioridade direto no registro. O findFirst anterior serve só para conferir o officeId — os valores antigos são descartados. Não existe model de histórico de Task e AuditEvent, a única trilha do produto, só é escrito em três pontos de LGPD. O contraste dentro do próprio sistema é evidente: a conclusão registra quem concluiu (completedById), o protocolo registra quem protocolou e é imutável depois de concluído, mas a data do prazo — o dado mais crítico do escritório — é livremente editável e anônima. Quando o cliente reclamar de prazo perdido, ou numa ação de responsabilidade civil, não há como demonstrar que o prazo estava correto na agenda, quem o mudou e quando.

#### Correção aprovada pela auditoria

Registrar toda mudança de dueDate/type/responsibleId numa trilha gravada na mesma transação do update: AuditEvent com kind ALTERACAO_PRAZO e meta {campo, de, para}, ou um TaskChangeLog enxuto (taskId, actorId, campo, valorAnterior, valorNovo, createdAt). Mostrar o histórico no card do compromisso ("prazo alterado de 12/09 para 19/09 por Fulano em 05/09").

#### Por que nesta posição da fila

Com os prazos já calculados e avisados corretamente, o passo seguinte é poder provar que estavam corretos. Numa reclamação de cliente ou ação de responsabilidade, hoje não há como mostrar quem mudou a data nem quando — e o produto já registra quem concluiu e quem protocolou.

#### Passo a passo

1. Escolher o formato da trilha. O mais barato é usar o `AuditEvent` que já existe (`prisma/schema.prisma:3251`) com `kind: 'ALTERACAO_PRAZO'` e `meta: { campo, de, para }`. O mais legível é um model novo `TaskChangeLog { taskId, actorId, campo, valorAnterior, valorNovo, createdAt }`.
2. Em `updateTask` (`lib/actions/tasks.ts:406-446`), o `findFirst` anterior já carrega a tarefa — hoje só para conferir o `officeId`. Passar a **guardar os valores antigos** de `dueDate`, `type` e `responsibleId`.
3. Comparar antes/depois e gravar uma linha por campo alterado, **dentro da mesma transação** do update (`prisma.$transaction`), para não existir update sem trilha.
4. Mostrar o histórico no card do compromisso: 'prazo alterado de 12/09 para 19/09 por Fulano em 05/09'.

#### Como verificar

- Alterar a data de um prazo e conferir que a linha de histórico apareceu com autor, valor anterior e novo.
- Alterar responsável e tipo e conferir que geram linhas próprias.

#### Cuidados

- Não registre alteração quando o valor não mudou — senão a trilha vira ruído e ninguém lê.
- Faz par com **G43**: sem trilha, o indicador de cumprimento de prazo pode ser fabricado movendo a data. Os dois juntos é que fazem sentido.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g42"></a>

### G42 · Processo parado é invisível: nenhum alerta, filtro ou relatório aponta caso sem movimentação ou sem tarefa aberta

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Gestão jurídica |
| **Tema** | O prazo, que é o ativo mais caro do escritório |
| **Posição na fila** | 35 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | gestao-escritorio |

**Arquivos citados**

```
lib/alerts.ts:7-27 e :155-240; app/(app)/processos/page.tsx:38; lib/actions/casesSearch.ts:13
```

#### O que acontece

Todo alerta do sistema nasce de um registro que já tem data marcada: tarefa com vencimento, conta com vencimento, follow-up agendado, pendência de atendimento. O caso que ninguém tocou — sem tarefa aberta, sem publicação, sem movimentação há oito meses — não gera dado e portanto não gera alerta nenhum. É a falha clássica que vira reclamação de cliente ("ninguém mexeu no meu processo") e, no limite, prescrição. O campo lastHistoryAt existe e é usado só como chave de ordenação (e na timeline da Assessoria); não há nenhum filtro por ele, e uma busca por caso sem tarefa (tasks: { none ... }) não retorna nenhuma ocorrência no projeto.

#### Correção aprovada pela auditoria

Adicionar um kind CASO_PARADO em getAlerts: Case ativo, sem nenhuma Task em PENDENTE/EM_ANDAMENTO e com lastHistoryAt (ou updatedAt) anterior a N dias, com N configurável por escritório e padrão de 60. Incluir na listagem de Processos um chip "Parados há +60 dias" e uma coluna com os dias desde a última movimentação, já que a ordenação por lastHistoryAt existe mas o valor não é mostrado.

#### Por que nesta posição da fila

É a falha que vira reclamação de cliente e, no limite, prescrição — e o campo lastHistoryAt já existe, só não é consultado. Vem depois dos prazos com data marcada porque é prevenção, não emergência, mas fecha o único ângulo de risco que hoje não gera dado nenhum.

#### Passo a passo

1. Acrescentar um `kind: 'CASO_PARADO'` em `getAlerts` (`lib/alerts.ts:155-240`) e ao union de `AlertItem` (`:7-27`).
2. Critério: `Case` ativo, **sem nenhuma** `Task` em `PENDENTE`/`EM_ANDAMENTO` (`tasks: { none: { status: { in: [...] } } }`) e com `lastHistoryAt` (ou `updatedAt`) anterior a N dias.
3. N configurável por escritório, com padrão 60 dias. Guardar em `Office` ou nas configurações do escritório.
4. Na listagem de Processos (`app/(app)/processos/page.tsx:38`), acrescentar um chip 'Parados há +60 dias' e uma coluna com os dias desde a última movimentação — a ordenação por `lastHistoryAt` já existe, o valor é que nunca é mostrado.
5. Conferir se `lastHistoryAt` está sendo mantido atualizado em todos os pontos que movimentam o processo; se não estiver, `updatedAt` é o fallback mais confiável.

#### Como verificar

- Criar um caso de teste sem tarefas e com `lastHistoryAt` antigo e conferir que ele aparece na Central de Alertas.
- Criar uma tarefa nele e conferir que ele sai.

#### Cuidados

- Na primeira execução em produção pode aparecer uma avalanche de casos parados — é o passivo real. Avise o dono e considere começar com N maior (120 dias) para depois apertar.
- Cuidado com a consulta: `tasks: { none: ... }` sobre a tabela inteira é lenta sem os índices de **G32**.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g43"></a>

### G43 · O sistema nunca compara a data de conclusão com o prazo: não existe indicador de cumprimento em lugar nenhum

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Gestão jurídica |
| **Tema** | O prazo, que é o ativo mais caro do escritório |
| **Posição na fila** | 36 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | gestao-escritorio |

**Arquivos citados**

```
app/(app)/produtividade/page.tsx:161-186 e :275-296; app/(app)/relatorios/page.tsx:124-146
```

#### O que acontece

A produtividade é medida só por volume: pontos e quantidade de tarefas concluídas. Uma petição protocolada 20 dias depois do prazo fatal vale os mesmos pontos que uma entregue com folga — e o ranking pode premiar justamente quem entrega tudo atrasado, desde que entregue muito. Para um escritório, o percentual de prazos cumpridos é o indicador de qualidade e de risco número um, e ele não existe. O mais revelador é que o dado é carregado e jogado fora: o tipo Row declara dueDate e a linha o preenche, mas a tabela renderizada tem só Tarefa, Tipo, "Concluída em" e Pontos; em nenhum ponto do projeto há comparação entre completedAt e dueDate.

#### Correção aprovada pela auditoria

Calcular noPrazo = completedAt <= dueDate (para PRAZO e AUDIENCIA, comparando contra o dia inteiro) e exibir um chip verde/vermelho por linha na tabela de Produtividade, já que o dueDate está ali; somar no cabeçalho de cada pessoa "X de Y no prazo (Z%)"; e acrescentar em Relatórios uma segunda barra por pessoa com o percentual de cumprimento ao lado da barra de pontos. Nenhuma migração é necessária.

#### Por que nesta posição da fila

Com a trilha de alteração de prazo no lugar (item 34), o indicador de cumprimento passa a significar alguma coisa. O dado já é carregado e jogado fora na tela de Produtividade — não precisa de migração, é comparar dois campos que já estão na mão.

#### Passo a passo

1. Em `app/(app)/produtividade/page.tsx:161-186`, o tipo `Row` já declara `dueDate` e a linha o preenche — o dado é carregado e jogado fora. Calcular `noPrazo = completedAt <= dueDate`.
2. Para `PRAZO` e `AUDIENCIA`, comparar contra o **dia inteiro** (fim do dia do `dueDate`), seguindo a convenção documentada em `lib/dueStatus.ts` de que `dueDate` é data-calendário à meia-noite UTC.
3. Exibir um chip verde/vermelho por linha na tabela (`:275-296`).
4. Somar no cabeçalho de cada pessoa: 'X de Y no prazo (Z%)'.
5. Em `app/(app)/relatorios/page.tsx:124-146`, acrescentar uma segunda barra por pessoa com o percentual de cumprimento, ao lado da barra de pontos.
6. **Nenhuma migração é necessária.**

#### Como verificar

- Concluir uma tarefa antes e outra depois do prazo e conferir que os chips saem certos.
- Conferir que uma tarefa concluída **no dia** do prazo conta como no prazo, não como atrasada.

#### Cuidados

- Este indicador pode ser fabricado movendo a data do prazo — por isso faz par com **G25** (trilha de alteração). Faça G25 antes, ou o número não é confiável.
- É um indicador de desempenho de pessoas. Combine com o dono como ele quer apresentá-lo antes de colocar num ranking visível para a equipe.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g35"></a>

### G35 · Despesa recorrente para de ser gerada em silêncio: os campos de fornecedor e beneficiário não têm chave estrangeira e o cron engole o erro

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Dados |
| **Tema** | O caixa e o número que o sócio lê |
| **Posição na fila** | 37 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | eng-dados |

**Arquivos citados**

```
prisma/schema.prisma:2093-2100 (RecurringExpense); lib/recurringFeesEngine.ts:183-196; lib/actions/suppliers.ts:69-73
```

#### O que acontece

RecurringExpense.supplierId, payeeUserId e payeeClientId são String? soltos, sem @relation — o banco não impede que apontem para um registro apagado. Já o Payable gerado a partir deles tem relação formal nesses três campos, então criar o Payable com id órfão estoura violação de FK. Como o laço do motor tem try/catch por item que só faz console.error e incrementa failed, a despesa recorrente daquele escritório (salário de estagiário, honorário de contratado, assinatura de software) simplesmente deixa de aparecer em Contas a Pagar, todo mês, até alguém notar que a conta não foi paga. A guarda de exclusão de fornecedor não fecha o buraco: só conta Payable, não RecurringExpense. E failed só aparece no corpo HTTP da resposta do cron — não vira IntegrationRun nem alerta.

#### Correção aprovada pela auditoria

Declarar as três relações formalmente em RecurringExpense (opcionais, com SET NULL), incluir a contagem de recurringExpense ativas na guarda de deleteSupplier (e o equivalente em deleteClient/deleteUser) e, quando failed > 0, gravar um IntegrationRun com status de erro e um alerta na Central de Alertas — hoje uma recorrência quebrada é invisível para o escritório.

#### Por que nesta posição da fila

Salário de estagiário e assinatura de software somem de Contas a Pagar todo mês até alguém notar. Precisa de migração (três relações) mais guarda na exclusão de fornecedor, por isso não é dos primeiros, mas é a última falha silenciosa relevante do Financeiro.

#### Passo a passo

1. Em `prisma/schema.prisma:2093-2100`, `RecurringExpense.supplierId`, `payeeUserId` e `payeeClientId` são `String?` soltos, **sem `@relation`** — o banco não impede que apontem para registro apagado. Já o `Payable` gerado a partir deles tem relação formal, então criar o Payable com id órfão estoura violação de FK.
2. Declarar as três relações formalmente em `RecurringExpense`, opcionais e com `onDelete: SetNull`.
3. Incluir a contagem de `RecurringExpense` ativas na guarda de `deleteSupplier` (`lib/actions/suppliers.ts:69-73`) — hoje ela só conta `Payable`. Fazer o equivalente em `deleteClient` e `deleteUser`.
4. Em `lib/recurringFeesEngine.ts:183-196`, o `try/catch` por item só faz `console.error` e incrementa `failed`. Quando `failed > 0`, gravar um `IntegrationRun` com status de erro **e** criar um alerta na Central de Alertas — hoje uma recorrência quebrada é invisível.
5. Rodar uma varredura (rota admin, só leitura) listando as `RecurringExpense` cujos ids apontam para registro inexistente, para o escritório corrigir antes de a FK entrar.

#### Como verificar

- Tentar excluir um fornecedor que tem despesa recorrente ativa — precisa ser barrado com mensagem clara.
- Quebrar uma recorrência de propósito (id órfão) e rodar o motor — precisa aparecer alerta, não silêncio.

#### Cuidados

- **Rode a varredura antes de declarar a FK.** Se já existirem ids órfãos em produção, o `prisma db push` do build falha e o deploy quebra. Limpe primeiro, depois mergeie o schema.
- Risco médio justamente por isso.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g26"></a>

### G26 · Todo documento transita por URL pública do Vercel Blob e a limpeza é "dispara e esquece": em qualquer erro o arquivo fica lá para sempre, sem registro

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Dados |
| **Tema** | Documento do cliente circulando solto |
| **Posição na fila** | 38 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | promotor |

**Arquivos citados**

```
lib/actions/attachments.ts:155-167, :191, :199-204; app/api/assessoria/documentos/upload/route.ts:115; app/api/attachments/blob-token/route.ts:24-29
```

#### O que acontece

O upload é em duas etapas: o navegador manda o arquivo direto para o Vercel Blob com access: "public" e depois o servidor baixa e joga no Drive. A remoção é del(data.blobUrl).catch(() => {}) — não aguardada, então numa function serverless pode nem chegar a executar; e nos caminhos de erro (falha ao resolver a pasta, falha no download, falha no upload) não há del nenhum. O arquivo — que pode ser o processo completo em PDF, um contrato, um RG — fica numa URL pública e permanente do blob.vercel-storage.com sem nada no banco apontando para ela. Sem inventário, esse arquivo é invisível: não aparece em anexo, não entra em exportação e jamais será alcançado por um pedido de exclusão do titular nem por uma varredura de incidente.

#### Correção aprovada pela auditoria

Envolver o fluxo em try/finally e sempre await del(blobUrl) no finally, logando a falha em vez de engoli-la. Prefixar o pathname por escritório e id de requisição (staging/{officeId}/{uuid}/{nome}) em onBeforeGenerateToken, para haver rastro. E criar um cron que liste o Blob e apague tudo em staging/ com mais de algumas horas — é a única forma de recuperar os órfãos que já estão lá.

#### Por que nesta posição da fila

Faz par natural com G03 (item 17): depois de tirar o link público do Drive, sobra o arquivo órfão no Blob, invisível ao banco e inalcançável por pedido de exclusão do titular. try/finally com await mais um cron de varredura resolvem.

#### Passo a passo

1. Em `lib/actions/attachments.ts:155-167`, `:191` e `:199-204`, o fluxo é: navegador manda para o Blob, servidor baixa e sobe ao Drive, e depois `del(data.blobUrl).catch(() => {})` — **não aguardado** e ausente nos caminhos de erro.
2. Envolver o fluxo inteiro em `try/finally` e sempre `await del(blobUrl)` no `finally`, logando a falha em vez de engoli-la.
3. Fazer o mesmo em `app/api/assessoria/documentos/upload/route.ts:115`.
4. Em `app/api/attachments/blob-token/route.ts:24-29` (`onBeforeGenerateToken`), prefixar o `pathname` por escritório e id de requisição: `staging/{officeId}/{uuid}/{nome}` — sem isso não há como saber depois de quem é um órfão.
5. Criar um cron novo (`app/api/cron/limpar-blobs-orfaos/route.ts`, com `CRON_SECRET` obrigatório, padrão fail-closed do `CLAUDE.md`) que lista o Blob e apaga tudo sob `staging/` com mais de algumas horas.
6. Rodar o cron uma primeira vez com `dryRun` para ver o tamanho do passivo antes de apagar.

#### Como verificar

- Forçar um erro no meio do upload (pasta inválida) e conferir que o blob foi removido mesmo assim.
- Conferir que um upload novo cria o caminho `staging/{officeId}/...`.

#### Cuidados

- O `del` no `finally` roda **depois** do upload ao Drive. Se ele falhar, o arquivo já está salvo — a falha de limpeza não pode derrubar a operação. Logue e siga.
- Faz par com **G03**: são as duas pontas do mesmo problema (arquivo do cliente acessível sem autenticação).

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g27"></a>

### G27 · A trilha de auditoria da LGPD registra apenas a exportação da própria trilha — e o componente de mascaramento não está em tela nenhuma

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Dados |
| **Tema** | Documento do cliente circulando solto |
| **Posição na fila** | 39 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | promotor |

**Arquivos citados**

```
components/Sensivel.tsx; lib/actions/privacidade.ts:56-80; app/api/admin/export-office/route.ts; app/api/financeiro/export/route.ts
```

#### O que acontece

A tela /configuracoes/privacidade mostra três abas (Revelações, Exportações, Exclusões). Só que <Sensivel> não é usado em nenhuma tela do projeto — nenhum CPF, telefone, e-mail ou endereço está de fato mascarado, então nunca há revelação a registrar e a aba fica permanentemente vazia. E o único evento kind=EXPORTACAO gravado é a exportação da própria trilha: a planilha com o escritório inteiro, os CSV/XLSX do Financeiro, o Livro Caixa, o DRE, o relatório em Word e o ZIP de protocolo não gravam nada. A trilha que o escritório apresentaria numa fiscalização registra só o ato de gerar a trilha — pior que não ter, porque é um documento de conformidade que afirma um controle inexistente.

#### Correção aprovada pela auditoria

Primeiro instrumentar as exportações: um helper registrarExportacao({ escopo, filtros, quantidadeDeLinhas }) chamado no início de cada rota de export, gravando AuditEvent kind=EXPORTACAO com autor, escopo e volume — é barato e é justamente o evento que a fiscalização pede. Depois, colocar <Sensivel> para valer onde o dado sensível aparece hoje em claro (documento, telefone, e-mail e endereço do cliente). Se a decisão for não mascarar agora, remover as abas vazias em vez de deixá-las sugerindo controle.

#### Por que nesta posição da fila

Só faz sentido depois que as exportações estão devidamente barradas (itens 1, 8 e 11) — aí registrar quem exportou o quê vira controle real, e não teatro. Comece pelo helper de registro nas rotas de export, que é barato e é justamente o que a fiscalização pede.

#### Passo a passo

1. **Comece pelo barato e pelo que a fiscalização pede:** criar `registrarExportacao({ escopo, filtros, quantidadeDeLinhas })` que grava `AuditEvent` com `kind: 'EXPORTACAO'`, autor, escopo e volume.
2. Chamar no início de cada rota de exportação: `app/api/admin/export-office/route.ts`, `app/api/financeiro/export/route.ts`, o Livro Caixa, o DRE, o Fluxo de Caixa, o relatório em Word e o ZIP de protocolo.
3. Depois, decidir sobre o `<Sensivel>` (`components/Sensivel.tsx`), hoje sem nenhum uso no projeto: ou colocá-lo para valer onde o dado sensível aparece em claro (documento, telefone, e-mail e endereço do cliente), ou **remover as abas vazias** de `/configuracoes/privacidade`.
4. A escolha é do dono, mas as duas alternativas são melhores que a situação atual: uma tela de conformidade que afirma um controle inexistente é pior que não ter a tela.

#### Como verificar

- Exportar a planilha do escritório e conferir que apareceu uma linha em Exportações com autor, escopo e quantidade.
- Repetir para cada uma das rotas listadas.

#### Cuidados

- Grave o registro **antes** de montar o arquivo, não depois — se a exportação demorar e a função for cortada, você quer o registro de que foi tentada.
- Só faz sentido depois que as exportações estão devidamente barradas (**G01**, **G05**, **G20**). Registrar quem exportou enquanto qualquer um pode exportar é teatro.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g40"></a>

### G40 · O botão Peticionar gera a petição numa pasta genérica "gerados", sem vínculo com o processo e com link público

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Praticidade jurídica |
| **Tema** | Documento do cliente circulando solto |
| **Posição na fila** | 40 de 45 |
| **Esforço** | P — Pequeno (horas) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | estagiario |

**Arquivos citados**

```
lib/actions/peticionar.ts:13-46; lib/googleDrive.ts:584 (copyAndFillTemplate)
```

#### O que acontece

O estagiário clica em Peticionar dentro do processo, escreve a peça no Google Docs e fecha a aba acreditando que o arquivo ficou no processo. Não ficou: criarPeticao recebe caseId e o usa só para montar o NOME do arquivo — não há nenhum prisma.attachment.create no arquivo, o Case não recebe referência nenhuma, e a cópia cai numa pasta única do escritório chamada "gerados", fora da pasta do processo. No dia seguinte ninguém acha a minuta pela tela do processo, só garimpando o Drive. Além disso a cópia é criada com permissão de leitura para "anyone" e nada na interface avisa que o link da minuta com dados do cliente é público.

#### Correção aprovada pela auditoria

Quando vier caseId, criar a cópia dentro da pasta do processo (case.driveFolderId, com a mesma auto-cura já usada nos anexos) e gravar um Attachment com docType PETICAO apontando para o arquivo, para a minuta aparecer na aba Anexos. Trocar a permissão anyone por compartilhamento restrito à conta do escritório (ver G03).

#### Por que nesta posição da fila

Depende da correção de permissão do item 17 para o link deixar de ser público. Feito junto, o estagiário para de perder a minuta no Drive e ela passa a aparecer na aba Anexos do processo, que é onde ele já procura.

#### Passo a passo

1. Em `criarPeticao` (`lib/actions/peticionar.ts:13-46`), o `caseId` recebido só monta o **nome** do arquivo. Passar a usá-lo de verdade.
2. Quando vier `caseId`, criar a cópia dentro da pasta do processo (`case.driveFolderId`), aplicando a mesma auto-cura já usada nos anexos: antes de reusar o id em cache, chamar `getDriveFileInfo`; se voltar `null` ou `trashed`, recriar a pasta.
3. Gravar um `Attachment` com `docType: 'PETICAO'` apontando para o arquivo, para a minuta aparecer na aba Anexos do processo — hoje não há nenhum `prisma.attachment.create` no arquivo.
4. Trocar a permissão `anyone` de `copyAndFillTemplate` (`lib/googleDrive.ts:584`) por compartilhamento restrito à conta do escritório — é o mesmo trabalho de **G03**, faça junto.
5. Se não vier `caseId`, manter o comportamento atual (pasta 'gerados').

#### Como verificar

- Clicar em Peticionar dentro de um processo, escrever algo, voltar ao processo e conferir que a minuta está na aba Anexos.
- Conferir no Drive que o arquivo está dentro da pasta do processo, não em 'gerados'.

#### Cuidados

- Depende de **G03** para a parte da permissão. Se G03 ainda não estiver feito, faça a parte do vínculo (pasta + Attachment) e deixe a permissão anotada como pendente no comentário do código.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g39"></a>

### G39 · A página do processo carrega o processo inteiro em toda visita e cada uma das nove abas recarrega tudo de novo

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Performance |
| **Tema** | Encanamento que falha calado e acabamento do dia a dia |
| **Posição na fila** | 41 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | advogado |

**Arquivos citados**

```
app/(app)/processos/[id]/page.tsx:51, :113-160, :191-230, :404-420
```

#### O que acontece

A tela mais aberta do dia busca, a cada visita, todas as tarefas, comentários, contas a receber com pagamentos, contas a pagar com pagamentos, publicações com leituras, anexos, lotes de protocolo com itens, envios de documento e lançamentos de honorário com parcelas — nenhum include com take — mais 19 consultas em paralelo, incluindo o catálogo global de tribunais (sem filtro de escritório), a lista inteira de clientes e a lista inteira de processos ativos. Como as abas são <Link href="?tab=..."> numa página force-dynamic, clicar em Anexos e depois em Financeiro repete o pacote inteiro. Num processo trabalhista de 4 anos com centenas de publicações e anexos, é o advogado esperando a tela pintar de novo a cada aba, várias vezes por hora.

#### Correção aprovada pela auditoria

Duas mudanças independentes e seguras: condicionar os includes pesados à aba pedida (comentários só em ?tab=comentarios; protocolos e envios só em protocolos; contas e honorários só em financeiro; anexos só em anexos) e mover tribunais/clientes/processos para dentro dos ramos que realmente abrem modal de edição; e paginar publicações e anexos com take e "ver mais" em vez de trazer o histórico inteiro.

#### Por que nesta posição da fila

Com os índices já criados (item 25), o ganho aqui é multiplicado. É a tela mais aberta do dia e a espera se repete várias vezes por hora; condicionar os includes à aba pedida é mudança segura e isolada.

#### Passo a passo

1. Em `app/(app)/processos/[id]/page.tsx`, condicionar os `include` pesados à aba pedida: comentários só em `?tab=comentarios`; protocolos e envios só em `protocolos`; contas e honorários só em `financeiro`; anexos só em `anexos`.
2. Mover as consultas de catálogo (tribunais — hoje sem filtro de escritório —, lista inteira de clientes, lista inteira de processos ativos) para dentro dos ramos que realmente abrem modal de edição (`:404-420`).
3. Paginar publicações e anexos com `take` e um botão 'ver mais', em vez de trazer o histórico inteiro (`:113-160`, `:191-230`).
4. As duas mudanças são independentes — dá para mergear a primeira sozinha.

#### Como verificar

- Medir o tempo de abertura de um processo grande antes e depois, e o tempo de trocar de aba.
- Conferir que cada aba continua mostrando tudo o que mostrava.

#### Cuidados

- Risco médio: é fácil condicionar um `include` a mais e uma aba ficar vazia. Abra as nove abas uma a uma antes de mergear.
- Faça **G32** (índices) antes — o ganho aqui é multiplicado por ele.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g38"></a>

### G38 · Criar processo com anexos sobe os arquivos em série dentro de 60s: no timeout o advogado vê erro, não é redirecionado, e acaba criando o processo duas vezes

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 91,7% — 11 de 12 votos |
| **Categoria** | Funcionalidade |
| **Tema** | Encanamento que falha calado e acabamento do dia a dia |
| **Posição na fila** | 42 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | backend |

**Arquivos citados**

```
lib/actions/cases.ts:179-202 e :278-281; app/(app)/processos/novo/page.tsx:3; app/api/attachments/blob-token/route.ts:13; components/NewCaseAttachmentsField.tsx:125
```

#### O que acontece

finalizeStagedAttachments roda um await finalizeAttachmentUpload por arquivo, em série; cada iteração baixa o arquivo inteiro do Blob para dentro da function e sobe para o Drive — até 25 MB por arquivo, e o seletor aceita multiple sem limite de quantidade. O prisma.case.create já foi commitado antes disso e o redirect só vem depois: quando os 60s acabam no meio dos uploads, a Server Action morre, o usuário recebe erro genérico sem redirect, não sabe que o processo foi criado e tende a preencher tudo de novo — gerando processo duplicado. Os anexos que não subiram ficam como blobs órfãos, sem nenhum registro para repescar.

#### Correção aprovada pela auditoria

Paralelizar com limite de concorrência — o helper mapComConcorrencia já existe em lib/actions/driveReorg.ts:47 e pode virar util compartilhado (concorrência 4-6 resolve a maior parte, já que é espera de rede). Limitar a quantidade de anexos por criação no formulário e mover o restante para um segundo passo dentro do processo já criado. Como rede de segurança, gravar as pendências numa tabela para o cron reprocessar em vez de deixar o blob órfão.

#### Por que nesta posição da fila

O desfecho não é só lentidão: no timeout o advogado vê erro, não é redirecionado e cria o processo duas vezes. O helper de concorrência já existe no projeto (mapComConcorrencia) e pode virar util compartilhado nesta mesma passagem de performance.

#### Passo a passo

1. **Leia a objeção antes de implementar** (única do conjunto, registrada abaixo): a lente 'advogado' apontou que `createCase` já conta `anexosComErro` e redireciona com `?anexosFalhos=N`, e que o sequencial é deliberado e comentado para não duplicar pasta no Drive. Confirme os dois pontos no código antes de mexer.
2. Se o sequencial existe para evitar corrida em `getOrCreateCategoryFolder`, a paralelização **precisa** resolver a pasta uma vez antes do laço e só então paralelizar os uploads. Sem isso, você troca lentidão por pasta duplicada.
3. Reaproveitar `mapComConcorrencia`, que já existe em `lib/actions/driveReorg.ts:47` — promovê-lo a util compartilhado (`lib/concorrencia.ts`) em vez de copiar. Concorrência 4–6 resolve a maior parte, já que é espera de rede.
4. Limitar a quantidade de anexos por criação no formulário (`components/NewCaseAttachmentsField.tsx:125`, hoje `multiple` sem teto) e mover o restante para um segundo passo dentro do processo já criado.
5. Rede de segurança: gravar as pendências numa tabela para o cron reprocessar, em vez de deixar o blob órfão (faz par com **G26**).

#### Como verificar

- Criar um processo com 10 anexos e conferir que o redirect acontece e que todos subiram para a **mesma** pasta, sem duplicata no Drive.
- Conferir que o caminho de erro parcial continua avisando o usuário.

#### Cuidados

- **Único achado que não teve unanimidade (11 de 12 · 91,7%).** Trate a paralelização como hipótese a validar, não como fato. Se a corrida de pasta se confirmar difícil de evitar, o valor está no resto: limitar a quantidade de anexos e melhorar a mensagem no timeout.

#### Objeção registrada na votação

> **advogado:** O caminho de falha já é tratado: createCase conta anexosComErro e redireciona com ?anexosFalhos=N, e a rota tem maxDuration 60; o sequencial é deliberado e comentado para não duplicar pasta no Drive, então paralelizar como sugerido reintroduz a corrida de getOrCreateCategoryFolder.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g19"></a>

### G19 · O sync de publicações por e-mail relê a base inteira a cada item e percorre todos os escritórios em série numa rota de 60s

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Performance |
| **Tema** | Encanamento que falha calado e acabamento do dia a dia |
| **Posição na fila** | 43 de 45 |
| **Esforço** | G — Grande (vários dias) |
| **Risco da mudança** | medio |
| **Levantado pelas lentes** | eng-dados, saas |

**Arquivos citados**

```
lib/jusbrasilEmailSync.ts:114-129, :136, :205-206, :243-274; lib/outlookEmailSync.ts:63-64; app/api/cron/jusbrasil-sync/route.ts:5
```

#### O que acontece

Duas causas para o mesmo desfecho. Para cada bloco extraído de cada e-mail, findCaseIdByProcessNumber carrega a lista completa de Case do escritório e findClientIdByName a lista completa de Client, comparando em JavaScript — numa rodada com 50 e-mails são centenas de varreduras completas. E getGmailClients traz todas as credenciais com syncJusbrasil=true da plataforma inteira, sem orderBy e sem take, processadas em série, com a paginação do Gmail sem teto, dentro de uma rota com maxDuration 60 que ainda roda o Outlook em paralelo. Como a ordem é sempre a mesma, são sempre os mesmos escritórios do fim da lista que ficam sem receber publicação — e nada avisa, porque esse caminho não grava IntegrationRun. O contraste está no próprio projeto: roboBridge monta os índices uma vez antes do laço e driveSync já ganhou round-robin por lastDriveSyncAt.

#### Correção aprovada pela auditoria

Carregar os índices de Case e Client uma vez por conta e passá-los às funções; acrescentar em Case uma coluna processNumberDigits indexada para o casamento virar findFirst em vez de varredura em JS. Replicar o round-robin do drive-sync (lastPublicationSyncAt com nulls first), com orçamento de tempo por rodada e take na paginação do Gmail, e gravar um IntegrationRun por escritório (sucesso, pulado por orçamento, erro).

#### Por que nesta posição da fila

Fecha a frente de performance e é o que impede que, ao crescer a base de clientes, sejam sempre os mesmos escritórios do fim da lista que deixem de receber publicação — sem nada avisar. Os padrões a copiar (round-robin do drive-sync, índices do roboBridge) já estão no projeto.

#### Passo a passo

1. Em `lib/jusbrasilEmailSync.ts:114-129` e `:136`, `findCaseIdByProcessNumber` e `findClientIdByName` recarregam a base inteira **a cada bloco**. Carregar os índices **uma vez por conta**, antes do laço, e passá-los como parâmetro — é o que `lib/roboBridge.ts` já faz.
2. Acrescentar `processNumberDigits String?` indexado a `Case` em `prisma/schema.prisma`, preenchido na escrita (`createCase`/`updateCase`) com o número só de dígitos. O casamento vira `findFirst` indexado em vez de varredura em JavaScript.
3. Backfill do novo campo por rota admin.
4. Em `getGmailClients` (`:243-274`) e no equivalente do Outlook (`lib/outlookEmailSync.ts:63-64`), replicar o **round-robin** que `drive-sync` já usa: acrescentar `lastPublicationSyncAt` ao credential, `orderBy` com nulls first, e `take` limitado.
5. Impor orçamento de tempo por rodada: parar de processar quando restarem poucos segundos de `maxDuration`, deixando o resto para a próxima.
6. Colocar `take` na paginação do Gmail (hoje sem teto).
7. Gravar um `IntegrationRun` por escritório com o desfecho: sucesso, pulado por orçamento, ou erro. Hoje esse caminho não grava nada, e por isso a falha é invisível.

#### Como verificar

- Medir o tempo da rota antes e depois com um escritório que tenha muitos casos — a diferença precisa ser grande.
- Conferir que todo escritório com credencial ativa aparece em `IntegrationRun` ao longo de algumas rodadas (round-robin funcionando).

#### Cuidados

- Esforço G. Divida: (1) índices em memória + `processNumberDigits`; (2) round-robin + orçamento + `IntegrationRun`. São dois PRs.
- Interage com **G13** (cursor). Se fizer os dois, faça G13 primeiro — não adianta acelerar uma varredura que perde e-mail.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g18"></a>

### G18 · Filtros e etiquetas de advogado cravados em "Jairo" e "Rodrigo", com dois números de OAB soltos e sem UF

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Produto / SaaS |
| **Tema** | O SaaS que entrega, não cobra e não mede |
| **Posição na fila** | 44 de 45 |
| **Esforço** | M — Médio (1–2 dias) |
| **Risco da mudança** | baixo |
| **Levantado pelas lentes** | advogado, estagiario |

**Arquivos citados**

```
app/(app)/publicacoes/page.tsx:38 e :215-216; lib/jusbrasilEmailSync.ts:64-72; lib/roboBridge.ts:47-55; app/(app)/relatorios/page.tsx:104
```

#### O que acontece

Dois danos. Dentro do Rodarte Prado a etiqueta é frágil: JAIRO_OAB_RE=/78[.\s]?295/ e RODRIGO_OAB_RE=/32[.\s]?943/ rodam sobre o texto inteiro da publicação, sem UF e sem a palavra OAB — qualquer publicação que contenha "32.943" num valor, num CEP ou num número de processo é etiquetada como do Rodrigo, e a etiqueta é justamente o que a janela "Distribuir pendentes" usa para sugerir responsável: a publicação cai na fila do sócio errado. Fora dele, qualquer escritório assinante abre Publicações e encontra dois chips com nomes de estranhos que nunca retornam nada, e o painel de Relatórios ordena por LAWYER_ORDER = ["Jairo", "Rodrigo", ...]. O estagiário também não tem como saber que esses chips filtram o advogado citado NA PUBLICAÇÃO enquanto o terceiro filtro é o responsável DENTRO do Lúmen.

#### Correção aprovada pela auditoria

Montar o regex por escritório a partir de User.oab, exigindo contexto ("OAB" + número + UF) em vez de casar dígitos soltos, e gravar Publication.lawyerTag com o usuário resolvido. Gerar os chips a partir dos usuários com OAB cadastrada (o PublicationRespFilter, que já recebe users, é o modelo), rotulando explicitamente "Advogado na publicação" x "Responsável no Lúmen", e trocar LAWYER_ORDER por ordenação por nome.

#### Por que nesta posição da fila

Tem dois lados: dentro do Rodarte Prado a etiqueta manda publicação para o sócio errado; fora dele, todo assinante vê chips com nomes de estranhos. Vem tarde porque não perde prazo nem dado, mas precisa estar resolvido antes de qualquer venda séria para escritório de fora.

#### Passo a passo

1. Remover `JAIRO_OAB_RE` e `RODRIGO_OAB_RE` de `lib/jusbrasilEmailSync.ts:64-72` e `lib/roboBridge.ts:47-55`.
2. Montar o regex **por escritório**, a partir de `User.oab`, e exigir contexto: a palavra 'OAB', o número e a UF juntos — não dígitos soltos. Um número como `32.943` aparecendo num valor ou num CEP não pode mais etiquetar ninguém.
3. Gravar `Publication.lawyerTag` com o **usuário resolvido** (id), não com um rótulo de texto.
4. Em `app/(app)/publicacoes/page.tsx:38` e `:215-216`, gerar os chips a partir dos usuários do escritório que têm OAB cadastrada. `PublicationRespFilter`, que já recebe `users`, é o modelo a copiar.
5. Rotular explicitamente os dois filtros, que hoje se confundem: 'Advogado citado NA PUBLICAÇÃO' × 'Responsável NO LÚMEN'.
6. Em `app/(app)/relatorios/page.tsx:104`, trocar `LAWYER_ORDER = ['Jairo', 'Rodrigo', ...]` por ordenação por nome.
7. Backfill: reprocessar `lawyerTag` das publicações recentes com a regra nova (rota admin), ou simplesmente deixar as antigas como estão e documentar.

#### Como verificar

- Abrir Publicações num escritório de teste sem OAB cadastrada — não pode aparecer chip nenhum, muito menos 'Jairo' ou 'Rodrigo'.
- Cadastrar a OAB de um usuário e conferir que o chip dele aparece e filtra.
- Pegar uma publicação que contenha o número '32.943' em outro contexto e conferir que ela não é mais etiquetada.

#### Cuidados

- Dentro do Rodarte Prado, essa etiqueta hoje alimenta a sugestão de responsável na janela 'Distribuir pendentes'. Confirme com o dono que a distribuição continua se comportando como ele espera depois da troca.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

<a id="g28"></a>

### G28 · O cargo do usuário é rótulo decorativo e não existe processo sigiloso: todo mundo do escritório vê todo processo

| | |
|---|---|
| **Severidade** | P1 |
| **Consenso** | 100% — 12 de 12 votos |
| **Categoria** | Segurança |
| **Tema** | Portas sem tranca |
| **Posição na fila** | 45 de 45 |
| **Esforço** | G — Grande (vários dias) |
| **Risco da mudança** | alto |
| **Levantado pelas lentes** | promotor |

**Arquivos citados**

```
lib/permissions.ts (arquivo inteiro); prisma/schema.prisma:292-305 (User.role); prisma/schema.prisma:547-620 (Case); app/(app)/configuracoes/page.tsx:124
```

#### O que acontece

O sistema oferece os cargos Advogado, Sócio, Estagiário, Financeiro, Recepcionista, Marketing e Contador, o que dá ao sócio a impressão de conceder acessos diferentes. Mas User.role não é lido por nenhuma verificação de permissão: as únicas travas do produto são isAdmin e financeAccess (o único uso funcional do cargo é escolher responsável padrão de tarefa em workflows). Uma recepcionista ou um estagiário de marketing lê integralmente todo processo: teor de publicações, anotações, descrição do caso, partes e documentos. Também não há marca de sigilo por registro — o model Case não tem campo de segredo de justiça nem lista de quem pode ver. Para um escritório que faz família, sucessões e trabalhista, é dado de saúde, de violência doméstica e de patrimônio circulando por toda a equipe, e um processo em segredo de justiça tratado como qualquer outro.

#### Correção aprovada pela auditoria

Começar pelo mínimo defensável: um booleano Case.sigiloso (e Attendance.sigiloso) que restringe o registro ao responsável, aos advogados vinculados e aos sócios, aplicado nos filtros centrais (casesFilter, publicationsWhereForViewer, busca global) e nas rotas de export; transformar os cargos que não advogam em perfis com módulos explicitamente marcados no User; e registrar em AuditEvent a abertura de registro sigiloso, que é o que responde à pergunta "quem viu".

#### Por que nesta posição da fila

É o maior projeto do conjunto e o que mais mexe em consultas centrais (filtros de processo, publicação, busca global, exports) — por isso último. Só faz sentido depois que todas as travas dos itens 1 a 12 estiverem no lugar, porque ele se apoia nelas. Comece pelo mínimo defensável: um booleano de sigilo em Case e Attendance.

#### Passo a passo

1. **Este é o maior projeto do conjunto e o mais arriscado. Não comece por ele.** Comece pelo mínimo defensável.
2. Etapa mínima: acrescentar `sigiloso Boolean @default(false)` a `Case` e a `Attendance` em `prisma/schema.prisma`.
3. Restringir o registro sigiloso ao responsável, aos advogados vinculados e aos sócios (`isAdmin`), aplicado nos **filtros centrais**: `casesFilter`, `publicationsWhereForViewer`, a busca global e as rotas de exportação. É crítico que o filtro esteja no lugar central, não espalhado por tela.
4. Registrar em `AuditEvent` a abertura de registro sigiloso — é o que responde 'quem viu'.
5. Etapa seguinte (outro PR, outra semana): transformar os cargos que não advogam (Recepcionista, Marketing, Contador) em perfis com módulos explicitamente marcados no `User`, já que `User.role` hoje não é lido por nenhuma verificação de permissão.

#### Como verificar

- Marcar um processo como sigiloso e conferir, logado como estagiário não vinculado, que ele some da listagem, da busca global, da Central de Alertas e da exportação.
- Conferir que o responsável e os sócios continuam vendo.

#### Cuidados

- Risco **alto**: um filtro esquecido vaza; um filtro errado esconde processo de quem precisa dele. Faça inventário de todos os pontos que listam `Case` antes de escrever a primeira linha.
- Só faz sentido depois que as travas dos itens 1 a 12 da fila estiverem no lugar — ele se apoia nelas.

**Pronto quando:** a correção está em `main`, o portão de verificação passou limpo, o deploy
de produção ficou `READY`, os itens de *Como verificar* foram conferidos e a caixa deste
achado na seção 3 está marcada.

---

## 5. Pendências operacionais anteriores a este roteiro

Não são achados da auditoria — são ações manuais já combinadas com o dono e ainda não
executadas. Elas não dependem de código novo.

1. **Rodar "Reorganizar anexos existentes no Drive".** O motor voltou a funcionar (o
   travamento eram duas falhas de backend já corrigidas: a quebra por módulo ESM que derrubava
   as páginas e o estouro de 300 s na montagem do plano). Rodar organiza os cerca de 20
   documentos soltos da Vida Locadora depois da mudança para a pasta nova e conserta
   retroativamente qualquer documento antigo ainda na raiz de uma empresa. Depois de rodar,
   conferir as pastas e apagar **manualmente**, no Drive, a pasta antiga que ficar vazia.
2. **Rodar o backfill de DDI:** abrir `/api/admin/backfill-phone-ddi` logado como dono da
   plataforma, para gravar o DDI 55 nos telefones já cadastrados.
3. **Paridade OneDrive/Dropbox nas ferramentas de migração** — hoje elas importam direto de
   `lib/googleDrive.ts`, o que as torna efetivamente exclusivas do Google. Adiado por decisão
   do dono ("faremos em breve"), não é achado desta auditoria.

---

## 6. Limites conhecidos desta auditoria

Ler isto evita conclusões erradas sobre o que o documento cobre.

- **As linhas citadas valem para o código na data da auditoria.** Se um arquivo mudou desde
  então, confirme antes de agir. O código manda.
- **Nenhuma verificação foi feita contra o banco de produção nem contra o app rodando.** Todos
  os achados foram verificados por leitura de código. Os efeitos descritos são deduções
  fundamentadas, não observações de produção.
- **O projeto não tem suíte de testes automatizados.** O portão de verificação é compilação,
  lint e build — ele pega erro de tipo e de sintaxe, não erro de lógica. A conferência manual
  descrita em *Como verificar* é a única rede de proteção que existe hoje.
- **Nada foi implementado a partir desta auditoria.** Este roteiro é material de decisão: o
  dono escolhe o que entra e em que ordem.
- **Um achado (G38) não teve unanimidade** (11 de 12 · 91,7%), aceito pela tolerância de 90%
  definida para a última análise. A objeção está registrada na ficha dele e deve ser conferida
  antes de implementar.

