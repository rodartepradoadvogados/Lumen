export const TEMPLATE_CATEGORIES = [
  { value: "CONTRATO", label: "Contrato de Honorários" },
  { value: "PETICAO", label: "Petição" },
  { value: "PROCURACAO", label: "Procuração" },
  { value: "DECLARACAO_HIPOSSUFICIENCIA", label: "Declaração de Hipossuficiência" },
  { value: "DECLARACAO_MORADIA", label: "Declaração de Moradia" },
  { value: "OUTRO", label: "Outro" },
] as const;

// Placeholders reconhecidos por "Gerar Documento" (ver lib/actions/generateDocument.ts) — o
// modelo precisa conter EXATAMENTE esses tokens, entre chaves duplas, em algum lugar do texto
// (ex.: "Eu, {{CLIENTE}}, portador..."). Sem os tokens no texto do modelo, o documento é gerado
// normalmente mas nenhum dado é preenchido (a busca simplesmente não encontra nada pra trocar).
export const MERGE_FIELDS: { token: string; desc: string; scope: "comum" | "processo" | "atendimento" }[] = [
  { token: "DATA", desc: "Data de hoje", scope: "comum" },
  { token: "CIDADE", desc: "Cidade-sede do escritório", scope: "comum" },
  { token: "CLIENTE", desc: "Nome do cliente", scope: "comum" },
  { token: "CLIENTE_QUALIFICACAO", desc: "Qualificação completa (nacionalidade, estado civil, profissão, RG, CPF/CNPJ, endereço)", scope: "comum" },
  { token: "CLIENTE_CPF", desc: "Só o CPF/CNPJ do cliente", scope: "comum" },
  { token: "ADVOGADO", desc: "Nome do advogado responsável", scope: "comum" },
  { token: "MATERIA", desc: "Área/matéria jurídica", scope: "comum" },
  { token: "CLAUSULA_OBJETO", desc: "Parágrafo pronto descrevendo o objeto do contrato/serviço", scope: "comum" },
  { token: "CLAUSULA_HONORARIOS", desc: "Cláusula de honorários (só quando o formulário de honorários é preenchido)", scope: "comum" },
  { token: "PROCESSO", desc: "Título do processo/caso", scope: "processo" },
  { token: "NUMERO_PROCESSO", desc: "Número do processo (CNJ)", scope: "processo" },
  { token: "VARA", desc: "Vara/juízo", scope: "processo" },
  { token: "FORO", desc: "Foro/comarca", scope: "processo" },
  { token: "PARTE_ADVERSA", desc: "Nome da parte adversa", scope: "processo" },
  { token: "POLO_PARTE_ADVERSA", desc: "Polo da parte adversa (autor/réu)", scope: "processo" },
  { token: "VALOR_CAUSA", desc: "Valor da causa, já formatado em R$", scope: "processo" },
  { token: "ASSUNTO", desc: "Assunto do atendimento", scope: "atendimento" },
  { token: "DESCRICAO", desc: "Descrição do atendimento", scope: "atendimento" },
];
