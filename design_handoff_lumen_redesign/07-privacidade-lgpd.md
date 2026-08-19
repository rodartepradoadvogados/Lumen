# 07 — Privacidade, máscaras e trilha

Referência: slide 16 do deck; wireframe `1i`. Nova rota:
`app/(app)/configuracoes/privacidade/page.tsx`. Base existente:
`components/BreakGlassReveal.tsx`, `components/MaskedInput.tsx`,
`components/SupportAccessBanner.tsx`, `components/SupportAccessPolicyPicker.tsx`,
`components/DeletionRequestsPanel.tsx`, `POLITICA_ACESSO_SUPORTE.md`.

## Princípio

O mecanismo já existe no código. O que falta é **uma tela onde isso seja visível e
auditável sem abrir o banco**.

## Máscara padrão

Vale para toda a equipe, **inclusive admin**. Quem tem o dado na mão é quem precisa dele
para o ato.

| Campo | Forma mascarada |
| --- | --- |
| CPF | `024.•••.•••-04` |
| CNPJ | `04.•••.•••/0001-90` |
| Valor de honorário (sem acesso financeiro) | `R$ ••.•••,••` |
| Telefone | `(62) ••••-••32` |
| Endereço | logradouro visível, número e complemento mascarados |
| E-mail | `j••••@gmail.com` |

Implementar como um utilitário único em `lib/mask.ts` e um componente
`<Sensivel campo="cpf" valor={...} />` que decide entre mascarado e revelado a partir da
sessão. Nunca mascare no cliente com o valor completo no HTML — a máscara é aplicada no
servidor e o valor cru só é enviado após a revelação.

## Break-glass

Filete esquerdo 4px `--vinho`, rótulo BREAK-GLASS em `--vinho`.

- Revelar **exige motivo escrito** (mínimo 20 caracteres, texto livre)
- A revelação dura **15 minutos**, por campo e por registro, e expira sozinha
- O registro é **imutável** (append-only; sem `update` nem `delete` na trilha)
- O titular do escritório recebe a revelação **no resumo do dia** (documento 06)
- Botão de confirmação: sólido em `--vinho`, texto branco — o único botão vinho sólido do
  produto, junto com a confirmação de exclusão

## Acesso do suporte da plataforma

Mantém o que `POLITICA_ACESSO_SUPORTE.md` já define, e passa a mostrar em tela:

- estado atual ("Nenhuma sessão ativa" / sessão em curso com contagem regressiva)
- convite parte **do escritório**, com prazo e **escopo declarado** (ex.:
  `CONFIG_INTEGRACAO`)
- tudo mascarado durante a sessão de suporte, sem exceção
- encerra sozinho no prazo; botão "Encerrar agora" sempre disponível
  (`EndSupportAccessButton`)
- histórico com escopo e duração

## Trilha de auditoria

Coluna direita (640px). Abas: **Revelações · Exportações · Exclusões · Suporte**.

Cada linha: quem + o que (18px/800), data/hora à direita (15px `--tx-3`), e uma segunda
linha 16px `--tx-2` com o contexto (registro afetado + motivo). Separadas por 1px
`--regua`.

Exportável em CSV — e **a exportação da trilha entra na própria trilha**.

## Pedido do titular (LGPD art. 18)

Bloco ao pé, fundo `--sf-apoio`: exclusão e anonimização entram como **pedido com prazo
legal**, não como botão de apagar.

Fluxo: abrir pedido (titular, tipo, canal de origem, data) → prazo de 15 dias visível →
avaliação (há dever legal de guarda? processo em curso?) → execução (anonimização
substitui contato e qualificação, preservando o que a lei obriga a manter) → registro na
trilha com o que foi substituído.

Reaproveite `components/DeletionRequestsPanel.tsx` como ponto de partida.

## Schema (Prisma)

```prisma
model AuditEvent {
  id         String   @id @default(cuid())
  officeId   String
  actorId    String
  kind       String   // "REVELACAO" | "EXPORTACAO" | "EXCLUSAO" | "ANONIMIZACAO" | "SUPORTE"
  entityType String?
  entityId   String?
  field      String?
  reason     String?
  meta       Json?
  createdAt  DateTime @default(now())
  @@index([officeId, kind, createdAt])
}

model DataSubjectRequest {
  id         String   @id @default(cuid())
  officeId   String
  subjectName String
  subjectDoc String?
  kind       String   // "EXCLUSAO" | "ANONIMIZACAO" | "ACESSO" | "CORRECAO"
  channel    String
  receivedAt DateTime
  dueAt      DateTime // receivedAt + 15 dias
  status     String   // "ABERTO" | "EM_ANALISE" | "EXECUTADO" | "RECUSADO"
  decision   String?
  executedAt DateTime?
}
```

`AuditEvent` é **append-only**: nenhuma server action pode atualizar ou apagar um registro.
Deixe isso explícito em comentário no arquivo da action.

## Aceite

- [ ] CPF e valores aparecem mascarados por padrão para todos, inclusive admin
- [ ] Revelar sem motivo é impossível na UI e na action
- [ ] A revelação expira em 15 minutos sem intervenção
- [ ] Exportar a trilha gera um evento na trilha
- [ ] Sessão de suporte mostra escopo, prazo e contagem regressiva
