# 06 — Comunicados

Referência: slide 15 do deck; wireframe `1h`. Nova rota:
`app/(app)/configuracoes/comunicados/page.tsx` (ou `/comunicados`, se preferir topo).

## A regra, dita pelo dono do escritório

> "Os comunicados por e-mail ou pop-up no celular somente uma vez ao dia."

Implementada assim: um resumo por dia, no horário escolhido pelo usuário, com uma
exceção explícita e curta. Sem a exceção a regra vira risco — um prazo que vence hoje não
pode esperar até amanhã às 8h.

## Estrutura da tela

Duas colunas: regras (640px, borda direita 2px) e editor de template.

### Bloco 1 — Resumo diário

- Interruptor Ativo/Inativo (retângulo de 52×28, raio 0; o "punho" é um quadrado)
- Horário (campo de 92px) + "dias úteis" / "todos os dias"
- Frase de explicação: "Um e-mail e um push por dia, com tudo que aconteceu desde o
  último. Nada é enviado duas vezes."

### Bloco 2 — Exceção: fura a fila

Fundo `--sf-apoio`, filete esquerdo 4px `--vinho`, rótulo em `--vinho`. Caixas de seleção
quadradas. Só quatro eventos podem estar aqui, e dois vêm marcados:

- ☑ Prazo vence hoje
- ☑ Audiência em menos de 24h
- ☐ Publicação nova
- ☐ Honorário recebido

Manter a lista curta é parte do desenho. Se tudo pode furar a fila, não existe fila.

### Bloco 3 — Por evento: canal e cadência

Tabela de eventos × (canal, cadência). Canais: `e-mail`, `push`, `in-app`. Cadências:
`na hora`, `diário`, `semanal`, `nunca`.

| Evento | Padrão |
| --- | --- |
| Publicação nova no processo | e-mail · diário |
| Prazo vencendo | push · na hora |
| Honorário a receber | e-mail · diário |
| Cobrança em atraso | e-mail · semanal |
| Andamento processual | in-app · diário |
| Tarefa delegada a mim | e-mail · diário |
| Convite de equipe | e-mail · na hora |

Cada usuário tem as suas; o admin define o padrão do escritório.

## Editor de template

- Cabeçalho: nome do template, "editável", ações "Enviar teste" e "Salvar"
- Coluna de variáveis (240px, borda direita 2px): chips monoespaçados de 15px,
  arrastáveis pro corpo — `{{cliente}}`, `{{processo}}`, `{{tribunal}}`, `{{prazo}}`,
  `{{link}}`, `{{responsavel}}`, `{{teor}}`. Nota: variável sem valor não deixa linha
  vazia — a linha desaparece na renderização.
- Abas: Corpo · Assunto · Rodapé e LGPD
- **Prévia ao vivo (440px) sobre fundo `--sf-apoio`, renderizando o e-mail real:**
  logomarca + "LÚMEN" com régua ouro embaixo, título, corpo, bloco de prazo com filete
  ouro, botão "Abrir no Lúmen" em tinta chapada, e rodapé obrigatório: "Você recebe este
  resumo uma vez por dia. Alterar horário ou cancelar em Lúmen > Comunicados."

O e-mail é HTML de tabela, largura 600px, sem canto arredondado, Archivo com fallback
para Helvetica/Arial. Reaproveite o provedor de `components/EmailSendProviderPicker.tsx`.

## Schema (Prisma)

```prisma
model NotificationPreference {
  id           String   @id @default(cuid())
  userId       String
  officeId     String
  digestOn     Boolean  @default(true)
  digestHour   Int      @default(8)     // 0-23, fuso do escritório
  weekdaysOnly Boolean  @default(true)
  breakthrough String[]                 // ["PRAZO_HOJE","AUDIENCIA_24H"]
  perEvent     Json                     // { "PUBLICACAO_NOVA": { canal: "EMAIL", cadencia: "DIARIO" }, ... }
  @@unique([userId])
}

model NotificationOutbox {
  id         String    @id @default(cuid())
  officeId   String
  userId     String
  event      String
  payload    Json
  channel    String    // "EMAIL" | "PUSH" | "IN_APP"
  dueAt      DateTime  // quando pode sair (agora, ou o próximo horário de digest)
  sentAt     DateTime?
  dedupeKey  String    // impede o mesmo evento sair duas vezes
  @@unique([dedupeKey])
  @@index([officeId, dueAt, sentAt])
}

model EmailTemplate {
  id        String   @id @default(cuid())
  officeId  String
  event     String
  subject   String
  bodyHtml  String
  updatedAt DateTime @updatedAt
  @@unique([officeId, event])
}
```

## Comportamento do envio

1. Todo evento entra na `NotificationOutbox` com `dedupeKey` e um `dueAt` calculado a
   partir da preferência do usuário.
2. Um cron de 5 minutos varre `dueAt <= now && sentAt == null`, agrupa por usuário e
   canal, e envia um e-mail e um push por usuário por rodada.
3. Evento marcado como exceção entra com `dueAt = now` e sai sozinho, sem agrupamento.
4. `dedupeKey` garante que um reprocessamento do robô não reenvie nada.

## Aceite

- [ ] Dois eventos comuns no mesmo dia geram um e-mail só
- [ ] Prazo de hoje sai na hora, sem o digest ativo
- [ ] Reprocessar um robô de publicações não reenvia nada
- [ ] O template é editável e a prévia reflete a edição antes de salvar
- [ ] O rodapé com a forma de cancelar aparece em todo e-mail automático
