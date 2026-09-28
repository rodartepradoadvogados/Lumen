# Agente de Peticionamento: pesquisa jurídica com Firecrawl e validação obrigatória

> **Para quem é este documento:** o agente de IA que vai implementar, no Lúmen e no servidor
> Hermes, o uso do Firecrawl na pesquisa de jurisprudência do peticionamento, e endurecer duas
> regras que passam a ser **requisito**, não recomendação:
>
> 1. **Processo sem número completo no padrão CNJ não vale.** Não se cita e não se aprova.
> 2. **Dupla validação com o link de cada origem é obrigatória.** Uma fonte oficial **e** uma
>    fonte secundária independente, as duas com URL, as duas efetivamente lidas.
>
> Levantamento feito sobre `main` em 25/09/2026. Reconfirme os pontos citados antes de mexer.

---

## 1. Como o peticionamento funciona hoje (não pule esta seção)

- **Quem redige não roda dentro do Lúmen.** É o **Hermes**, agente num servidor próprio
  (`servidor-hermes/`, perfil `peticionamento-lumen`).
- O Lúmen monta um prompt único em `lib/peticionamentoPrompt.ts` (`montarMensagemParaHermes`) e o
  envia pela ponte (`lib/hermesPonte.ts`: `iniciarGeracaoNoHermes` e `perguntarAoHermesComPerfil`),
  a partir de `confirmarTriagemEGerar` em `lib/actions/peticionamento.ts`.
- O Hermes chama as ferramentas do Lúmen via **MCP**: `app/api/agente/mcp/route.ts`,
  JSON-RPC, `maxDuration = 30`, credencial JWT de `lib/agenteCredencial.ts` com
  `escopo: "peticionamento"`.
- **Ferramentas:** registro em `lib/assistantTools.ts` (`assistantTools: AssistantTool[]`).
  Liberação por **lista branca** em `lib/agenteFerramentasLiberadas.ts`
  (`FERRAMENTAS_DO_PETICIONAMENTO`, função `liberada`).
- **Pesquisa de jurisprudência hoje:** feita pelo próprio Hermes, com os toolsets `web,search`
  (`servidor-hermes/servidor.py`, `HERMES_TOOLSETS`), seguindo a skill
  `servidor-hermes/skills/pesquisa-jurisprudencia/SKILL.md` ("precedente não validado não é citado").
- **Resposta do Hermes:** seção `###JURISPRUDENCIA###`, uma linha por precedente, no formato
  `texto || url da fonte original || url da fonte secundária`. Quem interpreta é
  `lib/peticionamentoRespostaHermes.ts`.
- **Travas em código:**
  - `lib/peticionamentoIdentificadorDeJulgado.ts`: `classificarIdentificador` → `valido | molde | irreconhecivel`.
    Pega número mascarado ou trivial, **mas não confere o dígito verificador**.
  - `lib/peticionamentoAprovacao.ts`: `avaliarFonteDeCitacao`. **Hoje, "só oficial, sem
    secundária" é `condicional` e NÃO bloqueia.**
  - `lib/peticionamentoCitacoes.ts` e `lib/peticionamentoCitacoesSync.ts`: montam e persistem
    `PeticionamentoCitacao` (`fonteUrl`, `fonteSecundariaUrl`).
- **Não existe validação de dígito verificador (módulo 97) em lugar nenhum do repositório.**

### Travas de teste que limitam o que se pode escrever
- `lib/testes/peticionamentoPromptSemDadoDeEscritorio.teste.ts` proíbe no prompt: URLs
  (`http`, `www.`, `.com.br`), números no formato CNJ, siglas e nomes de tribunais, OAB e dados do
  escritório. **As regras novas do prompt são genéricas, sem citar tribunal nem site.**
- `lib/testes/skillsHermesSemDadoDeEscritorio.teste.ts` faz o mesmo em
  `servidor-hermes/skills/*/SKILL.md` (e também proíbe STJ/STF/TST/TSE), além de exigir frases
  fixas da `pesquisa-jurisprudencia` ("base primária", "fonte secundária", "independente",
  "passo a passo", "precedente não validado… não é citado", "tese sem número"). **Acrescente texto,
  não remova essas frases.**
- `lib/testes/agenteEscopoPeticionamento.teste.ts` e `lib/testes/agenteMcp.teste.ts` têm uma
  cópia literal da lista branca (`LISTA_BRANCA_ESPERADA`). Mudou a lista, mude os dois testes.

---

## 2. Credenciais

Nenhum valor real em código, commit, PR ou chat.

| Variável | Onde vive | Uso |
|---|---|---|
| `FIRECRAWL_API_KEY` | Vercel (já configurada) | Ferramentas novas no Lúmen (`lib/firecrawl.ts`) |
| `FIRECRAWL_API_URL` | Opcional | Só para Firecrawl auto-hospedado |
| `AUTH_SECRET` | Vercel (já existe) | Assina a credencial que o Hermes usa no MCP. Não muda. |

**A chave do Firecrawl não vai para o servidor Hermes.** O Hermes usa o Firecrawl **através** do
Lúmen (ferramenta MCP). Assim há um único lugar com a chave, com log de uso (`registrarUso`) e
fail-closed.

---

## 3. Regra 1: número CNJ completo e válido

### 3.1 Formato e dígito verificador (Resolução CNJ 65/2008)
Formato: `NNNNNNN-DD.AAAA.J.TR.OOOO` (20 dígitos). `DD` é o dígito verificador pelo ISO 7064
MOD 97-10:
- **Validar:** `int(NNNNNNN + AAAA + J + TR + OOOO + DD) % 97 == 1`.
- **Calcular DD:** `98 - (int(NNNNNNN + AAAA + J + TR + OOOO + "00") % 97)`, com 2 dígitos.
- Use `BigInt` em TypeScript (o número passa de 2^53) ou reduza em blocos.

Exemplos **conferidos** para os testes:

| Número | Válido? |
|---|---|
| `0001234-85.2023.5.18.0001` | sim |
| `1001234-68.2021.8.26.0000` | sim |
| `5012345-88.2024.8.09.0051` | sim |
| `0001234-56.2023.5.18.0001` | **não** (DV errado; hoje usado como "válido" em `lib/testes/peticionamentoCitacoes.teste.ts`) |
| `1001234-56.2021.8.26.0000` | **não** (idem) |

### 3.2 O que implementar
1. **Novo módulo puro `lib/cnjNumero.ts`:**
   - `normalizarCnj(texto): string | null`: 20 dígitos, ou null.
   - `digitoVerificadorCnj(semDv18: string): string`.
   - `cnjValido(texto): boolean`: formato + DV.
   - `formatarCnj(digitos20): string`.

   Reaproveite o catálogo de `lib/cnjTribunal.ts` (`detectarTribunalPorNumeroCNJ`) para também
   exigir que `J.TR` exista.
2. **`classificarIdentificador`** (`lib/peticionamentoIdentificadorDeJulgado.ts`): número no
   formato CNJ com DV inválido passa a ser `molde` (bloqueia) e **não** `valido`. Atualize as
   fixtures dos testes para números com DV correto (tabela acima). Mantenha um caso com DV errado
   esperando `molde`.
3. **Gate de aprovação** (`lib/peticionamentoAprovacao.ts` → `avaliarAprovacaoDeMinuta`): toda
   citação de **julgado** (classes EMENTA/TRECHO de `lib/peticionamentoCitacoes.ts`) precisa ter um
   número CNJ válido no texto. Sem ele: `bloqueia: true`, com o motivo "processo sem número completo
   no padrão CNJ não pode ser citado".
4. **O que não é processo:** súmula, tema repetitivo/repercussão geral e enunciado **não têm número
   CNJ**. São identificados por espécie + número + órgão (`RE_SUMULA`, `RE_TEMA`) e continuam
   exigindo a dupla validação da regra 2. **Um acórdão de tribunal superior é processo**: o número
   CNJ tem de ser buscado na página oficial do julgado. "REsp 1.234.567/SP" sozinho não basta.
5. **Prompt** (`lib/peticionamentoPrompt.ts`, perto da regra "Toda jurisprudência citada precisa
   vir com fonte real…"): acrescente, sem citar tribunal nem site, que
   - todo julgado citado deve trazer o número único completo no padrão nacional de 20 dígitos;
   - julgado sem esse número não é citado; descreva a tese sem número.

   Rode o teste de "sem dado de escritório" para confirmar que a frase passa.

---

## 4. Regra 2: dupla validação com link de origem

### 4.1 Mudança de régua
Em `avaliarFonteDeCitacao`, **`condicional` (só oficial) passa a bloquear**
(`bloqueia: true`), com o rótulo "confirmada só no oficial; falta a fonte secundária
independente; a peça não pode usar isto". Resultado:

| Oficial | Secundária | Antes | Agora |
|---|---|---|---|
| não | não | bloqueia | bloqueia |
| sim | não | **não bloqueava** | **bloqueia** |
| não | sim | bloqueia | bloqueia |
| sim | sim | libera | libera **se** as duas passarem em 4.2 |

Atualize `lib/testes/` que afirmem o comportamento antigo de `condicional` e
`lib/peticionamentoNotaObrigatoria.ts`, se o texto mencionar "condicional".

### 4.2 Checagem das URLs (função pura nova em `lib/peticionamentoAprovacao.ts`)
- `fonteUrl` precisa ser **oficial**: domínio `*.jus.br` (tribunais) ou `planalto.gov.br` /
  `in.gov.br` para legislação.
- `fonteSecundariaUrl` precisa ser **independente**: domínio diferente do oficial e **não**
  `*.jus.br` (ex.: conjur.com.br, migalhas.com.br, jusbrasil.com.br).
- Ambas `https://`. Nada de URL de busca (`google.`, `bing.`, `?q=`).

Falhou em qualquer item → bloqueia, com o motivo específico.

---

## 5. Firecrawl como ferramenta do agente

### 5.1 Duas ferramentas novas em `lib/assistantTools.ts`
Crie um módulo novo `"pesquisa"` no union `AssistantToolModule`.

**`pesquisar_jurisprudencia`**
- `input_schema`: `{ consulta: string (obrigatória), dominio?: string, limite?: number (1..5) }`.
- `executar`: se `dominio` vier, monte `"<consulta> site:<dominio>"`. Chame
  `buscarNaWeb(consulta, { limite, timeoutMs: 20_000 })`.
- Retorno (string JSON, padrão das outras ferramentas):
  `{ resultados: [{ titulo, url, descricao, oficial: boolean }], aviso: "snippet de busca não é fonte: leia a página com ler_fonte_juridica antes de citar" }`.

**`ler_fonte_juridica`**
- `input_schema`: `{ url: string (obrigatória, https) }`.
- `executar`: `lerPagina(url, { timeoutMs: 20_000 })`. Corte o markdown em ~15.000 caracteres.
  Extraia com regex os números CNJ presentes e marque cada um com `cnjValido`.
- Retorno:
  `{ url, titulo, oficial: boolean, numerosCnj: [{ numero, valido }], markdown }`.

**Regras das duas ferramentas:**
- **Timeout:** a rota MCP tem `maxDuration = 30`. Use `timeoutMs` ≤ 20s. Não suba o
  `maxDuration` da rota inteira por causa disso.
- **Fail-closed amigável:** sem `FIRECRAWL_API_KEY` (erro `ERRO_FIRECRAWL_NAO_CONFIGURADO`),
  **retorne** uma string explicando que a pesquisa web do Lúmen não está configurada. Não lance
  exceção: a rota MCP trocaria a mensagem por um genérico "Não foi possível consultar agora".
- Recuse URL que não seja `https://`. Recuse IP literal e `localhost` (evita SSRF via Firecrawl).
- Descrições em português, dizendo **quando** usar: "para localizar e LER o julgado no site oficial
  e na fonte secundária antes de citá-lo".

### 5.2 Liberar para o peticionamento
- Adicione os dois nomes a `FERRAMENTAS_DO_PETICIONAMENTO` em `lib/agenteFerramentasLiberadas.ts`.
- Atualize `LISTA_BRANCA_ESPERADA` em `agenteEscopoPeticionamento.teste.ts` **e**
  `agenteMcp.teste.ts`.
- Rótulos em `lib/agenteProcedencia.ts` (`ROTULOS`): "pesquisa de jurisprudência na web" e
  "leitura de fonte jurídica".
- A conversa (escopo `conversa`) recebe todas as ferramentas (há teste que compara com
  `assistantTools.length`). Isso é aceitável: são ferramentas só de leitura pública.

### 5.3 Ensinar o Hermes (`servidor-hermes/skills/pesquisa-jurisprudencia/SKILL.md`)
**Acrescente** (sem remover as frases exigidas pelo teste e sem nomes de tribunal ou site) um passo:
> Para cada precedente candidato: (1) use `pesquisar_jurisprudencia` para achar a página oficial
> do julgado e uma fonte secundária independente; (2) use `ler_fonte_juridica` nas duas; (3) só
> cite se as duas páginas foram lidas, se o número único do processo aparece completo e com
> `valido: true`, e se a tese confere nas duas; (4) devolva na linha de `###JURISPRUDENCIA###`
> as duas URLs lidas, oficial primeiro. Faltou qualquer item, não cite: descreva a tese sem número.

Os toolsets `web,search` do Hermes podem continuar como apoio. A **prova** da validação passa a
ser a leitura via ferramentas do Lúmen, que fica registrada em `registrarUso`.

Implantar a skill no servidor Hermes é um passo **do dono**, descrito em
`servidor-hermes/LEIA-ME.md`. O agente atualiza o arquivo no repositório e avisa.

---

## 6. Testes obrigatórios (`lib/testes/`, estilo `executar.ts`)
- `cnjNumero.teste.ts`: os 3 números válidos da tabela passam; os 2 inválidos falham; 19/21
  dígitos falham; `J.TR` inexistente falha; `digitoVerificadorCnj` reproduz os DVs da tabela.
- `peticionamentoCitacoes.teste.ts`: fixtures migradas para DV válido; DV inválido vira `molde`.
- `peticionamentoAprovacao` (novo ou existente):
  - só oficial → bloqueia;
  - oficial + secundária do mesmo domínio → bloqueia;
  - secundária `*.jus.br` → bloqueia;
  - oficial `*.jus.br` + conjur → libera;
  - julgado sem CNJ válido → bloqueia;
  - súmula com as duas fontes → libera.
- `firecrawlFerramentas.teste.ts`: sem chave, `executar` **retorna** a mensagem (fetch mockado,
  nunca chamado); URL `http://`/`localhost` recusada; `timeoutMs` ≤ 20.000.
- Listas brancas atualizadas nos dois testes de escopo.
- `peticionamentoPromptSemDadoDeEscritorio` e `skillsHermesSemDadoDeEscritorio` continuam verdes.

## 7. Verificação e entrega
```bash
rm -rf .next && npx tsc --noEmit -p .
npx eslint <arquivos alterados>
npm run testar
npx next build
```
Commit e PR em português (causa raiz, impacto, correção). Se o `next build` falhar só por falta de
acesso ao banco no ambiente, diga isso no PR e não mergeie sozinho.

## 8. Critérios de aceite
- [ ] Nenhuma minuta aprovável com julgado sem número CNJ completo e com DV válido.
- [ ] Nenhuma minuta aprovável com citação sem **as duas** URLs (oficial + secundária
      independente).
- [ ] O Hermes consegue pesquisar e ler fontes pelo Lúmen (`tools/list` do escopo peticionamento
      mostra as 2 ferramentas novas).
- [ ] Sem `FIRECRAWL_API_KEY`, as ferramentas respondem "não configurado" e o resto do
      peticionamento segue funcionando.
- [ ] Testes de "sem dado de escritório" verdes; nenhum segredo no diff.
