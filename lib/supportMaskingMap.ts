import type { MaskKind } from "@/lib/supportMasking";

// Mapa declarativo do "Vidro Fosco": por model do Prisma, quais campos escalares são sigilosos
// e com que função cada um é redigido.
//
// O que NÃO entra aqui, por decisão explícita — o suporte PRECISA disso para diagnosticar e
// nada disso identifica ninguém sozinho:
//   - `id` e chaves estrangeiras (`officeId`, `caseId`, `clientId`, ...);
//   - `createdAt` / `updatedAt` / demais DateTime (data raramente identifica e é o principal
//     eixo de diagnóstico: "sumiu depois do dia X");
//   - enums e campos de status/tipo em texto (`status`, `kind`, `type`, `direction`, `stage`,
//     `channel`, `priority`, `triageStatus`, ...);
//   - flags booleanas e contadores (`read`, `active`, `installmentNumber`, `columnOrder`, ...);
//   - catálogos públicos (tribunal, comarca, categoria financeira, centro de custo) — são a
//     mesma informação para todos os escritórios, não são dado do cliente.
//
// Regra de tipo: este mapa só declara a INTENÇÃO. Quem garante que um campo `Float` continua
// `Float` (e nunca vira string) é lib/supportMaskingApply.ts, consultando o DMMF do Prisma —
// ver o comentário lá. Por isso é seguro marcar um campo como "money" aqui sem conferir à mão
// se ele é anulável no schema.
export const SUPPORT_MASK_MAP: Record<string, Record<string, MaskKind>> = {
  // ---------- Pessoas e partes ----------
  Client: {
    name: "personName",
    document: "document",
    rg: "document",
    email: "email",
    phone: "phone",
    address: "freeText",
    notes: "freeText",
    // Qualificação usada em petição. Isolados parecem inofensivos; juntos (nacionalidade +
    // estado civil + profissão + cidade) identificam uma pessoa com folga.
    nationality: "freeText",
    maritalStatus: "freeText",
    profession: "freeText",
  },
  CaseParty: {
    name: "personName",
    document: "document",
    address: "freeText",
  },
  Lawyer: {
    name: "personName",
    oab: "document",
    email: "email",
    phone: "phone",
    // Não estavam no levantamento original: o escritório do advogado ADVERSO identifica o caso
    // quase tão bem quanto o nome dele, e `notes` é texto livre sobre a relação com ele.
    firm: "freeText",
    notes: "freeText",
  },
  Supplier: {
    name: "personName",
    document: "document",
    email: "email",
    phone: "phone",
    notes: "freeText",
  },

  // ---------- Processos ----------
  Case: {
    title: "freeText",
    description: "freeText",
    decision: "freeText",
    outcome: "freeText",
    processNumber: "processNumber",
    folder: "freeText",
    tags: "freeText",
    sourceUrl: "url",
    caseValue: "money",
    convictionValue: "money",
    economicBenefitValue: "money",
    agreementValue: "money",
    // Não estavam no levantamento: a parte contrária é parte identificada do processo, com
    // nome/CPF/endereço no próprio Case (não só em CaseParty). Deixar de fora seria um furo
    // grande — a tela de processo mostra esses campos direto.
    opposingPartyName: "personName",
    opposingPartyDocument: "document",
    opposingPartyAddress: "freeText",
    // Último andamento em texto livre: teor puro de processo.
    lastHistoryDesc: "freeText",
  },

  // ---------- Agenda / Kanban ----------
  Task: {
    title: "freeText",
    description: "freeText",
    // `strategy` é estratégia processual — o dado mais privilegiado que existe num escritório.
    strategy: "freeText",
    location: "freeText",
    meetingUrl: "url",
  },

  Comment: { content: "freeText" },
  // Defesa em profundidade: Anotacao já é filtrada por authorId em todas as queries, então o
  // suporte não deveria vê-la nunca. Mascarada mesmo assim — se um dia alguém escrever uma
  // query sem o filtro, o teor continua protegido.
  Anotacao: { content: "freeText" },

  // ---------- Atendimento / CRM ----------
  Attendance: {
    clientName: "personName",
    contact: "personName",
    contactPhone: "phone",
    clientEmail: "email",
    waPhone: "phone",
    subject: "freeText",
    description: "freeText",
    notes: "freeText",
    lostReason: "freeText",
    estimatedValue: "money",
    // Percentual de honorário é cláusula comercial do contrato, não metadado.
    feePercentual: "money",
  },
  WhatsappMessage: {
    body: "freeText",
    fromNumber: "phone",
  },
  EmailMessage: {
    toAddress: "email",
    fromAddress: "email",
    subject: "freeText",
    body: "freeText",
  },

  // ---------- Documentos ----------
  Attachment: {
    name: "freeText",
    driveUrl: "url",
    // Não é só um id: com o storageFileId dá para abrir o arquivo direto no provedor.
    storageFileId: "freeText",
  },
  AssessoriaDocumento: {
    name: "freeText",
    driveUrl: "url",
    storageFileId: "freeText",
  },
  // Pasta de parecer da Assessoria. O nome costuma dizer exatamente o que está sendo consultado
  // ("Parecer — rescisão do contrato com a Prefeitura de X"), e a descrição idem: é teor, não
  // metadado. driveFolderId entra pelo mesmo motivo de storageFileId acima — com ele em mãos dá
  // para abrir a pasta direto no provedor, fora do Lúmen e fora de qualquer trilha de auditoria.
  Parecer: {
    name: "freeText",
    description: "freeText",
    driveFolderId: "freeText",
  },
  ProtocoloLote: {
    titulo: "freeText",
    observacao: "freeText",
    numeroProtocolo: "document",
  },
  ProtocoloLoteItem: { nomeSnapshot: "freeText" },
  DocumentoEnvio: {
    destinatarioNome: "personName",
    // Pode ser telefone OU e-mail dependendo do método — sem formato garantido, vai de freeText.
    destinatarioContato: "freeText",
  },
  DocumentoEnvioItem: { nomeSnapshot: "freeText" },

  // ---------- Publicações ----------
  Publication: {
    content: "freeText",
    emailSubject: "freeText",
    emailAccount: "email",
    processNumberRaw: "processNumber",
    lawyerTag: "personName",
  },

  // ---------- Financeiro ----------
  Receivable: {
    description: "freeText",
    amount: "money",
    paidAmount: "money",
    discount: "money",
    surcharge: "money",
    percentual: "money",
    documentNumber: "document",
    paymentReceiptNumber: "document",
    installmentBoleto: "freeText",
    notes: "freeText",
    payerName: "personName",
  },
  Payable: {
    description: "freeText",
    // `supplier` aqui é o NOME do fornecedor em texto (existe junto do supplierId opcional).
    supplier: "personName",
    amount: "money",
    paidAmount: "money",
    discount: "money",
    surcharge: "money",
    documentNumber: "document",
    paymentReceiptNumber: "document",
    installmentBoleto: "freeText",
    notes: "freeText",
  },
  FinancePayment: {
    amount: "money",
    documentNumber: "document",
    notes: "freeText",
  },
  HonorarioLancamento: {
    valorTotalIndicado: "money",
    documentNumber: "document",
    payerName: "personName",
    encerradoMotivo: "freeText",
  },
  BankAccount: {
    name: "freeText",
    agency: "document",
    accountNumber: "document",
    initialBalance: "money",
    notes: "freeText",
    // `bank` (Itaú, BB, ...) fica visível de propósito: não identifica ninguém e é exatamente o
    // que o suporte precisa saber para diagnosticar integração bancária.
  },

  // ---------- SEGREDOS DE INTEGRAÇÃO ----------
  // Estes não estavam no levantamento e são o achado mais grave da varredura: são CREDENCIAIS
  // VIVAS. Um refresh token do Drive/OneDrive/Dropbox, o access token do WhatsApp ou o token do
  // BTG dão acesso duradouro à conta do escritório FORA do Lúmen — sem passar por sessão de
  // suporte, sem prazo de 30 minutos e sem nenhum registro em AccessAuditLog. Ler um nome de
  // cliente é um vazamento pontual; ler um refresh token é entregar a chave da casa.
  //
  // Consequência aceita: enquanto uma sessão de suporte estiver ativa, código que leia o token
  // para chamar a API do provedor recebe o valor redigido e falha. Isso é falha-fecha e é o
  // comportamento desejado. Cron e rotas de robô rodam SEM o cookie de "atuar como", então
  // continuam lendo o token real e as integrações seguem funcionando normalmente.
  GoogleCredential: {
    accountEmail: "email",
    refreshToken: "freeText",
  },
  MicrosoftCredential: {
    accountEmail: "email",
    refreshToken: "freeText",
  },
  DropboxCredential: {
    accountEmail: "email",
    refreshToken: "freeText",
  },
  WhatsappConfig: {
    accessToken: "freeText",
    phoneNumberId: "document",
    displayPhone: "phone",
  },
  BtgConnection: {
    accessToken: "freeText",
    refreshToken: "freeText",
  },

  // ---------- OUTROS CONTEÚDOS SIGILOSOS ENCONTRADOS NA VARREDURA ----------
  // Nenhum destes estava na lista do levantamento, mas todos carregam teor ou identidade.
  Notice: { content: "freeText" }, // recados internos do escritório
  AtendimentoPendencia: { description: "freeText" },
  Assessoria: {
    planningNotes: "freeText",
    monthlyFee: "money",
  },
  RecurringFee: {
    description: "freeText",
    amount: "money",
  },
  Licitacao: {
    objeto: "freeText",
    orgao: "freeText",
    valorEstimado: "money",
    editalUrl: "url",
  },
  // `termo` é literalmente o nome do cliente/parte sob vigilância no Radar de Publicações.
  TermoVigilancia: { termo: "personName" },
  BlockedProcessNumber: {
    processNumber: "processNumber",
    displayNumber: "processNumber",
  },
  // `entityLabel` guarda o rótulo legível do que se quer excluir — costuma ser o nome do
  // cliente ou o título do processo.
  DeletionRequest: { entityLabel: "freeText" },
  DriveSyncIssue: {
    description: "freeText",
    suggestedFix: "freeText",
    driveUrl: "url",
  },
  DocumentTemplate: {
    name: "freeText",
    driveUrl: "url",
  },
  // Tabelas de captura dos robôs (DJEN, DOU, PNCP). Não têm officeId — são globais — mas o teor
  // capturado é conteúdo processual e o nome/OAB identificam o advogado.
  RoboPublicacao: {
    teor: "freeText",
    nomeAdvogado: "personName",
    numeroProcesso: "processNumber",
    oab: "document",
  },
  RoboAndamento: {
    numeroProcesso: "processNumber",
    descricaoMovimento: "freeText",
  },
  RoboDouItem: {
    titulo: "freeText",
    ementa: "freeText",
    textoResumo: "freeText",
    termoEncontrado: "personName",
    payloadBruto: "freeText",
  },
  RoboLicitacao: {
    objeto: "freeText",
    orgaoNome: "freeText",
    orgaoCnpj: "document",
    valorEstimado: "money",
    linkSistemaOrigem: "url",
    payloadBruto: "freeText",
  },
};

// Models que passam INTEIROS de propósito, para ficar registrado que foram considerados e não
// esquecidos. Ver o relatório/limitações antes de mexer.
export const DELIBERATELY_UNMASKED_MODELS = [
  // Plano de controle do próprio acesso de suporte. Mascarar aqui cegaria a tela de
  // transparência do escritório e o próprio lib/currentUser.ts.
  "AccessRequest",
  "AccessSession",
  "AccessAuditLog",
  "PlatformMember",
  "PlatformRole",
  "SupportTicket",
  // Identidade das contas e do escritório: é o caso de uso legítimo do suporte (descobrir QUAL
  // usuário está com a integração quebrada). Ver "limitações conhecidas" no relatório.
  "User",
  "Office",
  // Catálogos e configuração compartilhada, sem dado de cliente.
  "Tribunal",
  "FinancialCategory",
  "CostCenter",
  "KanbanColumn",
  "Holiday",
  // Cobrança do escritório PARA a plataforma. É dado comercial da própria Lúmen sobre o
  // tenant (mensalidade, boleto, Pix), não segredo do cliente do escritório — e é o que o
  // Painel Mestre precisa mostrar.
  "TenantInvoice",
  // Saúde das fontes do Radar: só nome de fonte, status e detalhe de execução. É diagnóstico
  // puro, sem dado de cliente.
  "FonteAdministrativa",
] as const;
