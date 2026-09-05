# Auditoria — pontos de anexo/armazenamento e migração de pastas (Google Drive/OneDrive/Dropbox)

Data: 2026-09-05
Escopo: leitura de código apenas (sem acesso a banco de dados de produção nem ao Drive real deste
escritório — nenhuma afirmação abaixo sobre o estado ATUAL das pastas no Drive do tenant
`rodartepradoadvogados` foi verificada ao vivo; tudo é inferido do código-fonte).

Motivação: o dono do escritório encontrou documentos de uma Licitação (aba Assessoria) numa pasta
"Assessoria" antiga, em vez de dentro da árvore "Lúmen" atual, mesmo depois de rodar a tela de
migração de pastas em Configurações/Conexões.

> **Nota de enquadramento (confirmada pelo dono do escritório, depois do levantamento inicial):**
> não existe mais nenhuma pasta-raiz "RP Financeiro" ativa em nenhum registro do sistema hoje —
> todo `driveFolderId` cacheado no banco resolve, atualmente, dentro (ou deveria resolver dentro)
> da pasta-mãe "Lúmen" (ou do nome que o escritório tiver configurado em
> `Office.drivePastaMae`/`drivePrefixo`). As pastas físicas "RP Financeiro - \*" que ainda existem
> no Drive são **sobra física antiga, sem nenhum `driveFolderId` de registro nenhum do banco
> apontando para elas hoje**, e serão excluídas manualmente pelo dono em breve — isso é operação
> humana de limpeza no Drive, não um bug de código. Por isso este relatório **não** enquadra nenhum
> achado como "ainda resolve/aponta para RP Financeiro" — essa string não está mais viva em nenhuma
> lógica de resolução de pasta. O ângulo de investigação que segue válido, e que efetivamente
> explica o sintoma relatado, é outro: um `driveFolderId` cacheado num registro (`Assessoria`,
> `Parecer`, `Case`, `Attendance`) pode ter, fisicamente, um **ancestral** diferente de onde a
> convenção atual ("Lúmen") diz que ele deveria estar — seja porque a pasta foi movida
> manualmente no Drive fora do sistema, seja porque ela nasceu antes de uma reconfiguração de
> `pastaMae`/`prefixo` do escritório em Configurações. Nenhuma das funções de "auto-cura"
> existentes (`getOrCreateCaseFolder`, `getOrCreateAttendanceFolder`, `getOrCreateParecerFolder`)
> verifica esse ancestral — só confirmam que o próprio id salvo ainda existe e não está na lixeira.

---

## Resumo executivo

- **17 pontos de anexo/upload** foram mapeados no sistema inteiro (contando os 3 provedores de
  nuvem + Vercel Blob). Desses, **13 usam o sistema centralizado de nomeação**
  (`lib/driveNaming.ts` → `lib/driveNamingOffice.ts`) corretamente, nos três provedores, e **nenhum
  ponto tem uma string de pasta hardcoded** fora desse sistema centralizado (ver seção de
  observação sobre a busca por strings de nome de escritório no código).
- **Causa raiz mais provável e mais grave, com evidência direta no código — já confirmada como
  gap real e independente de qualquer resíduo físico "RP Financeiro" no Drive:** o Attachment de
  uma Licitação (`Attachment.licitacaoId`) nunca usa a subpasta "Licitações" que já existe na
  pasta da empresa — vai sempre direto para a **raiz** da pasta da Assessoria
  (`lib/actions/attachments.ts`, ramo `else if (resolvedLicitacaoId)`) — e é um **ponto cego
  total** nas quatro ferramentas de migração/reorganização: nunca é origem de um match "de pasta"
  (Licitação não tem pasta própria) e, quando aparece como match "de arquivo" dentro da varredura
  de pastas legadas, o próprio código o marca explicitamente como **"não identificado... destino
  ambíguo"** e **não move nada** (`lib/actions/driveParentMigration.ts`, função
  `describeFileTarget`/`resolveFileTarget`, que só sabem resolver `caseId`/`attendanceId`, nunca
  `licitacaoId`). Isso é suficiente, sozinho, para produzir o sintoma relatado — documento de
  Licitação organizado de forma diferente do resto da Assessoria, e a tela de migração reportando
  itens movidos (dando a impressão de "está certo") enquanto esse documento específico cai
  silenciosamente na lista de não identificados. **Este gap já está confirmado e em correção**
  (feature aprovada: cada Licitação passa a ter pasta própria em
  `Assessoria/{empresa}/Licitações/{nome da licitação}`, com subpasta própria por Task/demanda da
  licitação).
- **Segunda causa contribuinte, também confirmada:** o caminho de upload de uma Licitação
  (`lib/actions/attachments.ts`, `finalizeAttachmentUpload`) e de um documento solto de Assessoria
  (`app/api/assessoria/documentos/upload/route.ts`) leem `Assessoria.driveFolderId` **direto do
  banco, sem nenhuma verificação** (nem a checagem mínima de "existe e não está na lixeira" que
  `Case`/`Attendance`/`Parecer` têm) e sem nunca chamar `getOrCreateAssessoriaCompanyFolder` de
  novo. Se esse campo ficar fisicamente desancorado da pasta-mãe atual por qualquer motivo (pasta
  movida manualmente no Drive, reconfiguração de `pastaMae`/`prefixo` depois da pasta já existir),
  **todo upload seguinte para aquela empresa — Licitação ou não — continua indo pro mesmo lugar
  físico para sempre**, sem nenhum mecanismo de autocorreção nem qualquer sinal de erro.
- Dos 17 pontos mapeados, **4 são pontos cegos confirmados** das ferramentas de migração (ver
  tabela e lista de gaps) e há **pelo menos mais 1 bug de resolução de pasta independente da
  nomenclatura**: documentos soltos de Assessoria — incluindo os do catálogo tipo
  LICITACAO/CONTRATO/REGIMENTO — sempre caem na raiz "flat" da empresa, nunca nas subpastas
  "Contratos"/"Licitações"/"Regimentos Internos" que o próprio sistema cria; só a ferramenta
  "Reorganizar anexos" sabe mover pra lá, depois do fato.
- Os módulos que usam **Vercel Blob como armazenamento final** (foto de perfil, biblioteca de
  fotos do blog) **não são afetados** por nada disto — é um backend completamente diferente, sem
  relação com Drive/OneDrive/Dropbox nem com `lib/driveNaming.ts`.

---

## Tabela — pontos de anexo/upload

| Ponto de anexo | Arquivo:linha da função que resolve a pasta | Fórmula do caminho resultante | Usa nomeação centralizada? | Campo de cache do driveFolderId | Coberto pela migração? | Observação/risco |
|---|---|---|---|---|---|---|
| Processo/Caso — anexo por categoria | `lib/googleDrive.ts:708` `getOrCreateCaseFolder` (+ `:761` `getOrCreateCategoryFolder`); espelhos em `lib/oneDriveStorage.ts:189`, `lib/dropboxStorage.ts` | `{pastaMãe}/{Processos ou Casos}/{título}/{categoria}` | Sim (`nomeacaoDoEscritorio`) | `Case.driveFolderId` | Sim — `driveFolderMigration.ts` (raiz Processos/Atendimentos) e `driveParentMigration.ts` (raízes legadas fora da pasta-mãe atual) cobrem Case | Auto-cura só checa existir/não-lixeira (Google), nunca se o ancestral bate com a pasta-mãe atual; OneDrive/Dropbox não checam nem isso (retornam o id cacheado sem nenhuma validação) |
| Atendimento — anexo por categoria | `lib/googleDrive.ts:739` `getOrCreateAttendanceFolder` (+ `getOrCreateCategoryFolder`); espelhos em `lib/oneDriveStorage.ts:201`, `lib/dropboxStorage.ts` | `{pastaMãe}/Atendimentos/{assunto}/{categoria}` | Sim | `Attendance.driveFolderId` | Sim — mesmas duas ferramentas acima cobrem Attendance | Mesma auto-cura parcial (Google) / nenhuma (OneDrive/Dropbox) |
| Atendimento convertido em Processo | `lib/actions/attendance.ts:527-534` (`convertAttendanceToCase`) | Reaproveita a MESMA pasta do atendimento, só **renomeada** — nunca reancorada em "Processos" | N/A (não recria pasta) | `Case.driveFolderId` recebe o id antigo de `Attendance.driveFolderId` | **Não** — nenhuma das 4 ferramentas reancora essa pasta em "Lúmen - Processos"/"Lúmen - Casos" | Pasta de um Processo convertido continua fisicamente dentro de "Lúmen - Atendimentos" para sempre — inconsistência estrutural, best-effort (silenciosa se falhar) |
| Assessoria — pasta da empresa (raiz + subpastas Contratos/Pareceres/Licitações/Regimentos) | `lib/googleDrive.ts:626` `getOrCreateAssessoriaCompanyFolder`; espelhos em `lib/oneDriveStorage.ts:250`, `lib/dropboxStorage.ts` | `{pastaMãe}/Assessoria/{empresa}` (+ 4 subpastas fixas criadas junto) | Sim | `Assessoria.driveFolderId` | Sim, como match de PASTA — `driveParentMigration.ts` (`matchItem`→`ASSESSORIA`) mas **NÃO** por `driveFolderMigration.ts` (só Case/Attendance) | **Chamada só na criação e no botão "Tentar criar pasta de novo"** — depois disso, todo upload lê `Assessoria.driveFolderId` direto do banco, **sem NENHUMA verificação** (nem existir/lixeira). Se ficar desatualizado uma vez, fica errado para sempre |
| Assessoria — documento solto do catálogo (CONTRATO/LICITACAO/REGIMENTO_INTERNO/OUTRO, sem Parecer) | `app/api/assessoria/documentos/upload/route.ts:73` — `folderId = assessoria.driveFolderId` (uso DIRETO, sem chamar nenhum `getOrCreate*`) | Cai sempre na **raiz** da pasta da empresa — nunca nas subpastas "Contratos"/"Licitações"/"Regimentos Internos" que existem desde a criação | Indiretamente (herda o `driveFolderId` já centralizado da empresa) mas **não roteia por docType** | `AssessoriaDocumento.storageFileId`/`driveUrl` (arquivo); pasta vem só de `Assessoria.driveFolderId` | Só reativamente — `lib/actions/driveReorg.ts` ("Reorganizar anexos") sabe mover esse arquivo pra subpasta certa DEPOIS do fato; nada faz isso no momento do upload | Bug de organização independente da nomenclatura: todo documento novo do catálogo (exceto Parecer) nasce solto na raiz da empresa |
| Assessoria — Parecer (pasta própria por demanda) | `lib/googleDrive.ts:640` `getOrCreateParecerFolder`; espelhos em `lib/oneDriveStorage.ts:262`, `lib/dropboxStorage.ts` | `{pastaMãe}/Assessoria/{empresa}/Pareceres/{nome do parecer}` | Sim | `Parecer.driveFolderId` | Sim, como match de PASTA em `driveParentMigration.ts` (`matchItem`→`PARECER`) | Auto-cura (Google) só existir/não-lixeira, nunca ancestral; OneDrive/Dropbox sem nenhuma checagem |
| **Assessoria — Licitação específica (Attachment.licitacaoId)** | `lib/actions/attachments.ts:127` — `targetFolderId = l.assessoria.driveFolderId` (uso DIRETO, sem `getOrCreate*` nenhum) | Cai direto na **raiz** da pasta da empresa (nem a subpasta "Licitações" do catálogo) | Indiretamente (herda `Assessoria.driveFolderId`) | Nenhum campo próprio — Licitação/Attachment não têm pasta cacheada | **NÃO — ponto cego confirmado nas 4 ferramentas** (ver seção de gaps) | **Causa raiz nº 1, gap confirmado e já em correção** (feature aprovada: pasta própria por Licitação em `Licitações/{nome}`, com subpasta por Task/demanda). Zero verificação de qualquer tipo hoje; zero cobertura de migração; se `Assessoria.driveFolderId` estiver desancorado da pasta-mãe atual, TODO anexo de TODA Licitação daquela empresa segue indo pro mesmo lugar físico, sem nunca ser corrigido pelas ferramentas administrativas |
| Financeiro — comprovante de Pagável/Recebível | `app/api/financeiro/comprovante/upload/route.ts:101` → `lib/googleDrive.ts:908/913` `getFinanceDespesasRootFolderId`/`getFinanceReceitasRootFolderId`; espelhos em `lib/oneDriveStorage.ts:240-246`, `lib/dropboxStorage.ts` | `{pastaMãe}/Financeiro - Despesas` ou `{pastaMãe}/Financeiro - Receitas` (raiz flat, sem subpasta por conta) | Sim | **Nenhum** — raiz nunca é cacheada por registro; só `Payable/Receivable.receiptStorageFileId` (o arquivo em si) | N/A — não precisa: a raiz é re-resolvida por nome sob a pasta-mãe a cada chamada, não há id "preso" que possa envelhecer | **Baixo risco** — este é o desenho mais seguro contra o bug de ancestralidade: nunca fica com um id de pasta desatualizado guardado |
| Peticionar / Documentos Gerados (preenchimento de modelo) | `lib/googleDrive.ts:516` `copyAndFillTemplate` → `getOrCreateFolderId("gerados", ...)` em `lib/googleDrive.ts:339` | `{pastaMãe}/Documentos Gerados/{nome do documento}` | **Sim** — apesar do comentário em `lib/storageProvider.ts` dizer que este fluxo é "Google-only, sem equivalente no dispatcher", a resolução de PASTA usa a mesma `nomeacaoDoEscritorio` central; só a geração via Google Docs API em si é exclusiva do Google (OneDrive/Dropbox não têm Docs API) | `GoogleCredential.generatedFolderId` (raiz única, não por documento) | Não se aplica diretamente (raiz de sistema); nenhuma ferramenta valida `generatedFolderId`/`rootFolderId`/`folderId`/`templatesFolderId` da credencial | **Zero auto-cura**: se `generatedFolderId` (ou `rootFolderId`, a pasta-mãe) ficar apontando para algo trashado/deletado, nada detecta nem recria sozinho — pior que Case/Attendance/Parecer nesse ponto específico |
| Modelos de Documento (upload de .docx convertido para Google Docs) | `lib/googleDrive.ts:437` `uploadDocumentTemplateFile` → `getOrCreateFolderId("modelos", ...)` | `{pastaMãe}/Modelos de Documento/{nome}` | Sim | `GoogleCredential.templatesFolderId` | Não se aplica (raiz de sistema); sem auto-cura | Mesmo padrão de risco do item acima |
| Anexo "solto" (sem Processo/Atendimento/Licitação) e fallback quando a pasta de destino é nula | `lib/googleDrive.ts:398` `uploadFileToDrive` → `getOrCreateFolderId("anexos", ...)` | `{pastaMãe}/Anexos/{arquivo}` | Sim | `GoogleCredential.folderId` | Não se aplica; sem auto-cura | Também é o **fallback silencioso** quando `Assessoria.driveFolderId` é nulo em `finalizeAttachmentUpload`/upload de Assessoria — um documento de Licitação pode terminar aqui, na raiz genérica de Anexos, se a empresa nunca teve pasta criada |
| Protocolos — pasta-espelho de atalhos | `lib/googleDrive.ts:777` `getOrCreateProtocolosContainerFolder` + `:800` `createDriveShortcut` | `{pastaMãe}/Processos/{título}/Protocolos/` (atalhos, Google-only) | Sim (usa `getOrCreateCaseFolder`, já centralizado) | `ProtocoloLote.driveFolderId` | Indiretamente coberto (depende só de `Case.driveFolderId`, que é coberto) | **Confirmado: não cria arquivo novo**, só atalhos para anexos já existentes — nenhum ponto de upload extra. OneDrive/Dropbox não geram pasta-espelho (sem equivalente a atalho) |
| Envio de Documentos por E-mail/WhatsApp | `lib/actions/documentoEnvios.ts:269-275` (`downloadDriveFile`) | N/A — só leitura | N/A | N/A | N/A | **Confirmado: referência apenas** — baixa um Attachment/AssessoriaDocumento já existente para anexar no e-mail/WhatsApp; nunca cria pasta nem faz upload novo |
| Criação de pasta a pedido (dentro de Processo/Caso) | `lib/actions/driveFolders.ts` → `lib/storageProvider.ts:253` `createNamedFolder` → `lib/googleDrive.ts:785` `createNamedDriveFolder` | Subpasta com nome exato dentro do container já resolvido (Case/Attendance) | Sim (herda o container já centralizado) | Nenhum campo próprio (a pasta não é referenciada por id em nenhum model — só existe no Drive) | N/A | Fora do escopo de migração porque não há registro no banco apontando pra ela |
| Foto de perfil (Meu Perfil) | `app/api/perfil/foto/upload/route.ts:33` (`put`, Vercel Blob) | URL pública do Blob — não é pasta | **Não se aplica** — backend diferente | N/A | N/A | **Fora de escopo**: Vercel Blob, nada a ver com Drive/OneDrive/Dropbox |
| Biblioteca de fotos do blog | `app/api/photos/upload/route.ts:51` (`put`, Vercel Blob) + `lib/actions/photos.ts` | URL pública do Blob | **Não se aplica** | N/A | N/A | **Fora de escopo**: idem acima |
| Etapa de staging (upload grande) — Anexos/Assessoria | `app/api/attachments/blob-token/route.ts` (gera token do Blob) | Blob temporário, apagado (`del`) assim que o conteúdo é copiado pro provedor definitivo | N/A | N/A | N/A | Não é destino final — é só a ponte para caber em payload pequeno de Server Action; o destino real é sempre um dos pontos acima |

---

## Como a migração de pastas hoje é composta (mapeamento exato botão → código)

A tela fica em **Configurações → Conexões** (`app/(app)/conexoes/page.tsx`), seção "Manutenção",
com três componentes que, juntos, somam os quatro botões citados pelo dono do escritório:

1. **"1. Conferir migração da pasta-mãe"** / **"2. Confirmar e mover"**
   → `components/MigrarPastaMaeButton.tsx` → `lib/actions/driveParentMigration.ts` (`migrarPastaMaeLumen`).
   Faz duas coisas: (a) move as nove raízes "Lúmen - \*" que ainda estejam soltas em `root` para
   dentro da pasta-mãe "Lúmen"; (b) audita pastas remanescentes em `root` cujo nome bate com o
   prefixo antigo do escritório antes de existir pasta-mãe (hoje, na prática, qualquer pasta
   "RP Financeiro - \*" que ainda esteja solta em `root` — detectadas por
   `f.name.toLowerCase().startsWith("rp financeiro")`, `lib/actions/driveParentMigration.ts:128`,
   um filtro específico para a transição de marca deste produto, não genérico),
   casando cada filho por **id salvo no banco** (`Case`, `Attendance`, `Assessoria`, `Parecer`,
   `Attachment.storageFileId`/URL, `AssessoriaDocumento.storageFileId`/URL) e movendo o que casa.
   Segundo o dono do escritório, hoje não há mais nenhum `driveFolderId` de registro nenhum do
   banco apontando para dentro de uma dessas pastas antigas — as pastas físicas "RP Financeiro - \*"
   que ainda existem no Drive são sobra sem vínculo nenhum com o banco, a serem excluídas
   manualmente; não é algo que esta (ou qualquer outra) ferramenta de migração precise resolver.

2. **"Verificar pastas do Drive fora do lugar"**
   → `components/MigrarPastasLegadasButton.tsx`, que dispara **duas** server actions em paralelo:
   - `lib/actions/driveFolderMigration.ts` (`migrarPastasLegadasDoDrive`/`aplicarMigracaoPastasSelecionadas`)
     — cobre **só `Case` e `Attendance`** (raízes Processos/Atendimentos/Casos), com detecção de
     duplicata por nome exato e por similaridade (`pareceMesmoCaso`). **Não toca em Assessoria,
     Parecer, Attachment nem AssessoriaDocumento.**
   - `lib/actions/driveUnlinkedFiles.ts` (`planoArquivosNaoVinculados`/`sincronizarArquivosSelecionados`)
     — encontra arquivos que **já estão** na pasta certa da árvore nova (Processos/Casos/Atendimentos/
     Assessoria/Pareceres) mas sem `Attachment`/`AssessoriaDocumento` no banco, e cria o registro.
     Cobre Assessoria/Pareceres, mas **nunca cria vínculo com `licitacaoId`** — a função
     `sincronizarArquivosSelecionados` só grava `caseId`/`attendanceId` num Attachment novo.

3. **"Reorganizar anexos existentes no Drive"**
   → `components/ReorganizeAttachmentsButton.tsx` → `lib/actions/driveReorg.ts`
   (`planoReorganizacao`/`aplicarReorganizacaoSelecionada`). Para `Attachment`/`AssessoriaDocumento`
   **já registrados no banco**, recalcula onde cada um DEVERIA estar (mesmas funções `getOrCreate*`
   do upload normal) e move o arquivo se não estiver lá. A consulta de `Attachment` usa
   `WHERE caseId IS NOT NULL OR attendanceId IS NOT NULL` (`lib/actions/driveReorg.ts:96`) —
   **exclui explicitamente** qualquer Attachment que só tenha `licitacaoId`.

---

## Gaps concretos, priorizados

### 🔴 P0 — Attachment.licitacaoId é invisível às 4 ferramentas de migração/reorganização (gap confirmado e em correção)

Nenhuma das quatro ações (`driveParentMigration.ts`, `driveFolderMigration.ts`,
`driveUnlinkedFiles.ts`, `driveReorg.ts`) tem qualquer caminho de código para mover, re-vincular ou
sequer **detectar corretamente** um `Attachment` cujo único vínculo é `licitacaoId`. Isso já foi
confirmado nesta investigação como o gap com o efeito prático mais direto sobre o sintoma
relatado, e **já está em correção**: a feature aprovada dá a cada Licitação uma pasta própria em
`Assessoria/{empresa}/Licitações/{nome da licitação}`, com subpasta própria por Task/demanda da
licitação — em vez de o anexo cair direto na raiz da pasta da empresa
(`lib/actions/attachments.ts`, ramo `else if (resolvedLicitacaoId)`, hoje `targetFolderId =
l.assessoria.driveFolderId`).

- `driveParentMigration.ts`: `matchItem` casa o arquivo (por `storageFileId`/URL) mas
  `describeFileTarget`/`resolveFileTarget` só sabem calcular destino para `caseId`/`attendanceId` —
  um Attachment de Licitação cai em `naoIdentificados` com a mensagem "registrado no sistema, mas
  sem processo/atendimento vinculado — destino ambíguo" e **nunca é movido**, mesmo que o operador
  rode "Confirmar e mover" quantas vezes quiser.
- `driveReorg.ts`: a query nem sequer traz esse Attachment para análise (`WHERE caseId IS NOT NULL
  OR attendanceId IS NOT NULL`).
- `driveFolderMigration.ts`: nem enxerga Attachment, de nenhum tipo (só Case/Attendance).
- `driveUnlinkedFiles.ts`: não tem nenhuma varredura que produza um Attachment com `licitacaoId`.

**Risco (antes da correção em andamento):** cada Licitação de cada Assessoria de cada
escritório-cliente que usa este módulo tem seus anexos permanentemente fora do alcance de qualquer
ferramenta de correção automática — o único jeito de arrumar um já existente é mover manualmente
no Drive. Como o produto é multi-tenant, isso afeta **todo** cliente que usar Assessoria +
Licitações, não só este escritório.

**Correção em andamento:** cada Licitação passa a ter pasta própria em
`Assessoria/{empresa}/Licitações/{nome da licitação}`, com subpasta própria por Task/demanda da
licitação — mesmo padrão de pasta por demanda que `Parecer` já tem. Ao aplicar essa mudança, vale
também ensinar `resolveFileTarget`/`describeFileTarget` (em `driveParentMigration.ts`) e a query de
`driveReorg.ts` a resolver `licitacaoId` para essa nova subpasta, para que documentos de Licitação
já existentes hoje na raiz da empresa também passem a ser alcançáveis pelas ferramentas de
migração/reorganização, e não fiquem presos lá mesmo depois da mudança na lógica de upload.

### 🔴 P0 — `Assessoria.driveFolderId` é lido sem NENHUMA verificação em todo upload subsequente

`lib/actions/attachments.ts:127` e `app/api/assessoria/documentos/upload/route.ts:73` leem o campo
cru do banco. Diferente de `Case`/`Attendance`/`Parecer`, que ao menos chamam `getDriveFileInfo`
para confirmar que a pasta ainda existe e não está na lixeira antes de reutilizar o id,
**nada revalida `Assessoria.driveFolderId`** fora da criação inicial e do botão manual "Tentar
criar pasta de novo". Se esse valor ficar fisicamente desancorado da pasta-mãe atual por qualquer
motivo — pasta movida manualmente no Drive fora do sistema, um `CONFLITO` de nomes não resolvido
na migração da pasta-mãe, ou a pasta ter nascido antes de uma reconfiguração de
`pastaMae`/`prefixo` do escritório — o sistema nunca se autocorrige, e cada novo documento
(catálogo OU Licitação) continua indo pro mesmo lugar físico indefinidamente, sem gerar nenhum
erro visível (o upload "funciona", só vai parar num lugar diferente do que a convenção atual
descreve).

**Correção sugerida:** aplicar em `Assessoria.driveFolderId` a mesma auto-cura best-effort que já
existe em `getOrCreateCaseFolder`/`getOrCreateAttendanceFolder`/`getOrCreateParecerFolder`
(`lib/googleDrive.ts`), e idealmente também verificar se o **pai** da pasta ainda é a raiz
"Assessoria" correta, dentro da pasta-mãe configurada atualmente (nenhuma das quatro funções de
auto-cura hoje confere ancestral — só existência/lixeira do próprio id).

### 🟠 P1 — Documento solto de Assessoria (catálogo) nunca nasce na subpasta certa

`app/api/assessoria/documentos/upload/route.ts:73` manda qualquer documento sem Parecer direto pra
raiz da empresa, nunca para "Contratos"/"Licitações"/"Regimentos Internos" — mesmo essas subpastas
já existindo desde a criação da Assessoria (`ASSESSORIA_DOC_TYPE_FOLDERS`,
`getOrCreateAssessoriaCompanyFolder`). Só o botão "Reorganizar anexos" resolve isso, depois do
fato. Isso não tem relação com pasta-mãe/prefixo do escritório, mas contribui para a sensação de
"documento no lugar errado" que o dono relatou, e é o mesmo padrão de risco (lógica de destino no
upload divergente da lógica de destino nas ferramentas de correção).

### 🟠 P1 — OneDrive/Dropbox: zero auto-cura, e "Reorganizar anexos" praticamente não funciona

- `lib/oneDriveStorage.ts` e `lib/dropboxStorage.ts` não têm NENHUMA verificação de
  existência/lixeira ao reutilizar `driveFolderId` cacheado (nem o nível básico que o Google tem) —
  pior cenário de "cache eterno e nunca revalidado" dos três provedores.
- As quatro ferramentas de migração (`driveParentMigration.ts`, `driveFolderMigration.ts`,
  `driveUnlinkedFiles.ts`) importam funções **direto de `lib/googleDrive.ts`**, não do dispatcher —
  ou seja, são **Google-only**: um escritório em OneDrive/Dropbox não tem nenhuma dessas três
  ferramentas disponíveis de fato (ou elas simplesmente não encontram nada, por não saberem ler o
  Drive de outro provedor).
- Mesmo a que usa o dispatcher (`driveReorg.ts`) tem uma falha própria: `resolverDestinoAttachment`
  calcula o `fileId` de um Attachment de Processo/Atendimento via
  `extractDriveFileId(att.driveUrl)` (regex específica de URL do Google Drive,
  `lib/googleDrive.ts:482`) e **nunca olha `Attachment.storageFileId`** — então, para qualquer
  escritório em OneDrive/Dropbox, todo Attachment de Processo/Atendimento cai em "não movível"
  nesta ferramenta, silenciosamente.

**Risco:** como o produto é multi-tenant e já oferece OneDrive/Dropbox como opção de
armazenamento (`Office.storageProvider`), qualquer cliente novo que escolher um desses dois
provedores herda um conjunto de ferramentas de correção que, na prática, não fazem quase nada por
ele. Isso é maior que o problema pontual relatado — é um risco estrutural para o produto como um
todo.

### 🟡 P2 — Atendimento convertido em Processo nunca reancora a pasta física

`lib/actions/attendance.ts:527-534` só renomeia a pasta do atendimento e transplanta o id para
`Case.driveFolderId` — a pasta continua fisicamente dentro de "Lúmen - Atendimentos" para sempre.
Não está relacionado a nenhuma migração de nome de escritório, mas é o mesmo padrão de bug (destino
correto no banco, localização física desatualizada/ancestral errado) e nenhuma das quatro ferramentas de migração
cobre esse caso — `driveFolderMigration.ts` só reconhece a raiz "correta" pelo `type` atual do
Case, mas não audita se uma pasta de Case está fisicamente dentro da raiz de Atendimentos.

### 🟡 P2 — `GoogleCredential.rootFolderId`/`folderId`/`templatesFolderId`/`generatedFolderId` sem auto-cura nenhuma

Diferente de `Case`/`Attendance`/`Parecer`, essas quatro raízes de sistema (pasta-mãe, Anexos,
Modelos, Documentos Gerados) são cacheadas uma vez e nunca revalidadas — nem existência, nem
lixeira. Se qualquer uma for movida/apagada manualmente fora do sistema, cada upload subsequente
(potencialmente TODOS os uploads do escritório inteiro, se for a pasta-mãe) falha ou vai pro lugar
errado sem nenhum mecanismo de recuperação automática, e nenhuma das quatro ferramentas de
migração valida esses quatro campos.

### Observação — não há resíduo de "RP Financeiro" vivo em nenhuma lógica de resolução de pasta

`grep -rni "rp financeiro"` no código-fonte (fora de `docs/` e de artefatos de build) só retorna:
(a) comentários explicativos e texto de UI da própria tela de migração, e (b) uma única linha de
lógica real — `lib/actions/driveParentMigration.ts:128`, o filtro
`f.name.toLowerCase().startsWith("rp financeiro")`, que a ferramenta usa **de propósito**, como
parte de uma migração pontual e já concluída de fato (confirmado pelo dono: não há mais nenhuma
pasta-raiz assim solta em `root`, nem `driveFolderId` de registro nenhum apontando para dentro de
uma árvore com esse nome). Não há nenhum lugar em que o sistema **decida criar ou procurar** uma
pasta nova usando "RP Financeiro" como nome — toda criação de pasta passa por
`lib/driveNaming.ts`/`lib/driveNamingOffice.ts`, que hoje resolve para "Lúmen" (ou o que o
escritório configurar). Ou seja: o código de criação está certo, e o resíduo físico "RP
Financeiro - \*" no Drive é só uma sobra sem vínculo com o banco, a ser limpa manualmente pelo
dono — **não é a causa do sintoma relatado**. A causa real está nos gaps de cobertura das
ferramentas de migração e na falta de verificação de ancestral no cache de `driveFolderId`,
documentados acima, que valem tanto para uma pasta desancorada de "Lúmen" quanto valeriam para
qualquer nome de pasta-mãe que um escritório-cliente configure no futuro.

---

## Notas de metodologia / o que não foi possível confirmar

- Não houve acesso ao banco de dados de produção nem ao Drive real do escritório
  `rodartepradoadvogados` nesta investigação — a única confirmação de estado real veio do próprio
  dono do escritório (não existe mais pasta-raiz "RP Financeiro" ativa em nenhum registro do
  sistema; as pastas físicas remanescentes com esse nome não têm `driveFolderId` nenhum apontando
  para elas hoje). Não é possível confirmar, sem consultar o banco/Drive diretamente, qual dos
  gaps confirmados no código foi a causa exata **neste caso específico**: (1) o Attachment da
  Licitação indo para a raiz da pasta da empresa em vez da subpasta "Licitações" (gap já
  identificado e em correção), (2) `Assessoria.driveFolderId` desta empresa especificamente com o
  ancestral físico fora da árvore "Lúmen" atual, (3) o documento ter sido um documento de catálogo
  (não Attachment de Licitação) caído na raiz flat da empresa, ou uma combinação das três. As três
  são gaps reais e confirmados no código; qualquer uma delas — isoladamente ou combinada — produz
  exatamente o sintoma relatado ("a tela diz que corrigiu, mas o documento não mudou de lugar
  esperado").
- Não foi verificado se o Office `rodartepradoadvogados` está de fato em `GOOGLE_DRIVE` (mais
  provável, dado o relato) ou outro provedor — os achados de P1 sobre OneDrive/Dropbox são
  relevantes para o risco multi-tenant do produto, não necessariamente para este caso pontual.
- Não foi possível testar em runtime nenhuma das funções — toda a análise é estática, lendo os
  arquivos indicados linha a linha.
