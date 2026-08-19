# 04 — Conexões

Referência: slide 13 do deck; wireframe `1f`. Nova rota: `app/(app)/conexoes/page.tsx`.

## O problema

Integrações, e-mail, armazenamento, DJEN, Datajud, WhatsApp e cobrança vivem hoje
espalhados numa aba longa de `app/(app)/configuracoes/page.tsx` (1242 linhas). Cada
integração inventou seu próprio jeito de dizer "funcionando". A pergunta "isso está de
pé?" não tem um lugar.

## A estrutura

Página de duas colunas. Cabeçalho com régua de 2px: "Conexões" (30px/800) e, abaixo,
"{n} integrações · {n} exigem atenção".

### Coluna esquerda — catálogo (520px, borda direita 2px)

Grupos com cabeçalho em 10px caixa alta `.12em` `--tx-2` sobre fundo `--sf-apoio`:

| Grupo | Itens |
| --- | --- |
| **Tribunais** | DJEN · DATAJUD |
| **Dinheiro** | Asaas (gateway) · BTG (conciliação) |
| **Arquivos** | Google Drive · OneDrive · Dropbox |
| **Mensagens** | E-mail de envio · WhatsApp |
| **Chaves e automação** | API keys do escritório · Servidores MCP · Webhooks e log |

Cada item: nome (15px/600), estado à direita (13px/600), e uma linha de contexto
(13px `--tx-2`). Item selecionado: fundo `--sf-apoio`, filete esquerdo 4px `--acao`.

### Vocabulário de estado — igual para todas

Quatro estados, e só quatro. Substitui o `StatusLine` atual e todo badge ad-hoc:

| Estado | Cor | Texto |
| --- | --- | --- |
| `ok` | `--concluido` | "ativo" |
| `erro` | `--vinho` | "falhando" |
| `aviso` | `--aviso` | "expira em {n} dias" |
| `off` | `--tx-3` | "não configurado" |

Um ponto de 8px na cor + o texto. Sem caixa colorida, sem ícone.

### Coluna direita — detalhe

Sempre a mesma anatomia, em qualquer integração. É isso que faz a página funcionar:

1. **Nome e uma frase** dizendo o que a integração faz (não o que ela é)
2. **Ações**: "Testar agora", "Reconectar"/"Conectar", "Desativar" (secundários)
3. **Linha de estado**: fundo `--sf-apoio`, filete esquerdo 4px na cor do estado, uma
   frase com o último resultado real ("Funcionando — último ciclo às 06:12, 14
   publicações, 0 erro")
4. **Credencial**: campo com valor mascarado (`djen_live_••••••••4f2a`) e ação "revelar"
   que passa pelo break-glass do documento 07. Abaixo: quando foi criada, quando foi
   usada. Nunca mostre a chave inteira sem justificativa registrada.
5. **Frequência** (quando aplicável): controle segmentado 1×/dia · 2×/dia · de hora em
   hora, e o horário
6. **Log de execução**: tabela de 7 dias — data/hora (150px), status HTTP colorido pelo
   estado (90px), resultado. Linhas separadas por 1px `--regua`. "Ver 30 dias" no pé.

## Por integração

### DJEN

Reaproveita `components/TestDjenButton.tsx`, `SyncPublicationsButton.tsx`,
`TermosVigilanciaPanel.tsx` e `robo-publicacoes/`. Adiciona: frequência configurável e
log persistido. Detalhe extra: lista dos termos de vigilância ativos com contagem de
publicações por termo nos últimos 30 dias — é o que diz se o termo está bem escrito.

### DATAJUD

Mesma anatomia. Erros 401 e 429 são os casos reais (vistos no log atual); o texto de erro
precisa dizer o que fazer, não só o código: "401 — a chave foi revogada pelo CNJ.
Reconecte." / "429 — limite do tribunal; o Lúmen repete sozinho em 15 min."

### Asaas / BTG (gateway)

Reaproveita `lib/actions/subscriptionBilling.ts` e `components/OfficeBillingSummary.tsx`.
Mostra: forma de cobrança ativa, webhook (URL, último evento recebido, últimos 5 eventos),
e o par ambiente/chave. **A URL de webhook fica copiável com um clique**
(`components/CopyButton.tsx`).

### Google Drive / OneDrive / Dropbox

Reaproveita `lib/googleDrive.ts` (`getDriveStatus`, `listGoogleAccounts`),
`lib/oneDriveStorage.ts`, `lib/dropboxStorage.ts` e
`components/StorageProviderPicker.tsx`. Mostra pasta-mãe (`PASTA_MAE_PADRAO`), prefixo
(`PREFIXO_PADRAO`), contas conectadas e espaço. Os botões de migração
(`MigrarPastaMaeButton`, `MigrarPastasLegadasButton`, `ReorganizeAttachmentsButton`,
`RenameCasesToConventionButton`) ficam num bloco "Manutenção" ao pé do detalhe do
provedor ativo — não na primeira dobra.

### E-mail de envio

Reaproveita `components/EmailSendProviderPicker.tsx` e `TestEmailButton.tsx`. Mostra
provedor, domínio remetente e o estado de verificação (SPF/DKIM) como uma das quatro
linhas de estado. Liga para o documento 06: "Templates e cadência ficam em Comunicados."

### WhatsApp

Reaproveita `components/WhatsappConfigForm.tsx`. O estado `aviso` existe por causa da
expiração de token — mostre os dias restantes no catálogo, não só no detalhe.

### API keys do escritório

Tabela: nome, prefixo visível, escopo, criada em, último uso, ação Revogar (destrutivo em
`--vinho`). Criar chave abre modal (`ModalShell`) que mostra o valor **uma única vez**,
com `CopyButton` e o aviso de que não será exibido de novo.

### Servidores MCP

Novo. Hoje o assistente vive em `components/ClaudeAssistantWidget.tsx` sem nenhuma tela
de administração. Precisa de:

- lista de servidores MCP configurados: nome, endpoint, transporte, estado
- por servidor: as ferramentas que ele expõe, com um interruptor por ferramenta
- escopo de dados: quais entidades o servidor pode ler (processo, cliente, financeiro) —
  **começa tudo desligado**, e ligar financeiro exige confirmação
- log das últimas 50 chamadas: ferramenta, quem disparou, duração, resultado
- alerta explícito na tela: dado de cliente sai do escritório quando uma ferramenta
  remota é chamada; o texto precisa dizer isso em português claro

### Webhooks e log de execução

Visão consolidada de tudo: filtro por integração, por estado e por período. Exportável em
CSV (a exportação entra na trilha de auditoria do documento 07).

## Permissão

A página exige `isAdmin` **ou** `canConfigureIntegrations` (`lib/supportCapabilities.ts`)
— o mesmo critério que a aba "Modelos & Integrações" usa hoje, para o suporte da
plataforma continuar podendo configurar em sessão mascarada.

## Schema (Prisma)

Novo modelo, para o log deixar de ser efêmero:

```prisma
model IntegrationRun {
  id           String   @id @default(cuid())
  officeId     String
  integration  String   // "DJEN" | "DATAJUD" | "ASAAS" | "DRIVE" | "WHATSAPP" | "MCP" | ...
  startedAt    DateTime @default(now())
  durationMs   Int?
  status       String   // "OK" | "ERRO" | "AVISO"
  httpStatus   Int?
  itemCount    Int?
  message      String?
  @@index([officeId, integration, startedAt])
}
```

Retenção: 90 dias, limpeza no mesmo cron do robô de publicações.

## O que sobra em Configurações

`configuracoes/page.tsx` perde a aba "Modelos & Integrações" inteira e fica com: Equipe,
Financeiro, Geral, Workflows, Blog Jurídico, Cobrança. Modelos de documento e timbrado
(`DocumentTemplatesManager`, `TimbradoForm`) **não** são integração: vão para a aba Geral.

## Aceite

- [ ] Toda integração usa os mesmos quatro estados e a mesma anatomia de detalhe
- [ ] Nenhuma credencial aparece inteira sem passar pelo break-glass
- [ ] O log persiste entre deploys e mostra 7 dias sem consulta manual ao banco
- [ ] MCP começa sem nenhum escopo de dado liberado
- [ ] A URL de webhook é copiável
