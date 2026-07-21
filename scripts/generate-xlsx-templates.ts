import * as XLSX from "xlsx";
import path from "path";

const OUT_DIR = path.join(__dirname, "..", "public", "templates");

function writeTemplate(
  filename: string,
  headers: string[],
  exampleRow: (string | number)[],
  legendRows?: (string | number)[][]
) {
  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  if (legendRows) {
    const legendWs = XLSX.utils.aoa_to_sheet(legendRows);
    legendWs["!cols"] = [{ wch: 32 }, { wch: 60 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, legendWs, "Legenda");
  }
  XLSX.utils.book_append_sheet(wb, ws, "Modelo");
  XLSX.writeFile(wb, path.join(OUT_DIR, filename));
  console.log(`Gerado: ${filename}`);
}

// Legenda da planilha combinada de Processos/Casos/Atendimentos/Contatos.
// Aba separada, sempre a primeira do arquivo, para orientar quem vai preencher.
const PROCESSOS_LEGEND_ROWS: (string | number)[][] = [
  ["LEGENDA PARA PREENCHIMENTO"],
  [""],
  ["Esta aba é só de leitura — os dados de verdade ficam na aba \"Modelo\". Leia antes de preencher."],
  [""],
  ["1. COLUNA \"Tipo\" — o que cada valor faz"],
  ["Valor aceito", "O que acontece ao importar"],
  ["Processo", "Cria um Processo judicial (usa Número, Vara, Tribunal, Instância etc.)."],
  ["Caso", "Cria um Caso (mesma estrutura de Processo, sem exigir número/tribunal)."],
  ["Atendimento", "Cria um Atendimento (consulta ou serviço avulso, sem processo)."],
  ["Contato", "NÃO cria processo/caso — cadastra só o contato (Cliente/Autor/Réu preenchido) em Contatos → Clientes."],
  [""],
  ["2. FORMATO DO NÚMERO DO PROCESSO (padrão CNJ)"],
  ["Máscara", "NNNNNNN-DD.AAAA.J.TR.OOOO"],
  ["Exemplo preenchido", "0001234-56.2026.8.09.0051"],
  ["O que é cada parte", "NNNNNNN = número sequencial do processo (7 dígitos) · DD = dígito verificador (2 dígitos) · AAAA = ano de ajuizamento (4 dígitos) · J = segmento de justiça (1 dígito, ex: 8 = Justiça Estadual) · TR = tribunal (2 dígitos) · OOOO = unidade de origem (4 dígitos)"],
  [""],
  ["3. COMO INDICAR O CLIENTE (quem é o NOSSO cliente no processo)"],
  ["Forma simples (como já era)", "Preencha só a coluna \"Cliente\" com o nome do seu cliente. \"Outros envolvidos\" recebe a parte contrária, se quiser registrar."],
  ["Forma recomendada (mais clara)", "Preencha \"Autor\" e \"Réu\" com os nomes das partes do processo, e diga em \"Papel do cliente\" qual das duas é o seu cliente (ex: \"Autor\" ou \"Réu\"). O sistema identifica automaticamente quem é o cliente e quem é a parte contrária."],
  ["Se preencher Autor/Réu e Cliente juntos", "Autor/Réu tem prioridade — a coluna \"Cliente\" é ignorada nesse caso."],
  [""],
  ["4. SIGLAS DE TRIBUNAL ACEITAS NA COLUNA \"Tribunal\""],
  ["Grupo", "Siglas"],
  ["Tribunais superiores", "STF, STJ, TST, TSE, STM"],
  ["Justiça Estadual (2º grau)", "TJ + sigla do estado, ex: TJGO, TJSP, TJRJ, TJMG..."],
  ["Justiça Federal", "TRF1, TRF2, TRF3, TRF4, TRF5, TRF6"],
  ["Justiça do Trabalho", "TRT1 a TRT24"],
  ["Justiça Eleitoral", "TRE + sigla do estado, ex: TREGO, TRESP..."],
  [""],
  ["5. OUTRAS ORIENTAÇÕES"],
  ["Campos em branco", "São ignorados — preencha só o que tiver."],
  ["Datas", "Formato DD/MM/AAAA (ex: 21/07/2026)."],
  ["Valores monetários", "Só números, sem \"R$\" e sem separador de milhar (ex: 15000 ou 15000,50)."],
];

writeTemplate(
  "modelo-contatos.xlsx",
  ["Nome", "Tipo", "Documento", "Email", "Telefone", "Endereço", "Observações"],
  ["João da Silva", "PF", "123.456.789-00", "joao@exemplo.com.br", "(62) 99999-0000", "Rua Exemplo, 100 - Goiânia/GO", "Cliente indicado por outro cliente"]
);

writeTemplate(
  "modelo-processos-casos-atendimentos.xlsx",
  [
    "Tipo", "Título", "Papel do cliente", "Cliente", "Autor", "Réu", "Outros clientes", "Outros envolvidos", "Pasta", "Ação", "Número",
    "Data de distribuição", "Objeto", "Observações", "Matéria", "Valor da causa", "Valor da condenação",
    "Decisão do processo", "Resultado do processo", "Etiquetas", "Data de Criação", "Data de Encerramento",
    "Data do último histórico", "Descrição do último histórico", "Instância Original", "Instância Atual",
    "URL do Processo", "Tribunal", "Vara", "Foro", "Responsável",
  ],
  [
    "Processo", "João da Silva x Empresa XYZ Ltda", "Autor", "", "João da Silva", "Empresa XYZ Ltda", "", "Empresa XYZ Ltda (PARTE)", "PASTA-001", "Ação de Cobrança",
    "0001234-56.2026.8.09.0051", "01/02/2026", "Cobrança de valores em aberto", "Observação livre sobre o caso", "Cível", 15000, "",
    "", "", "", "01/02/2026", "", "", "", "1", "1", "", "TJGO", "3ª Vara Cível de Goiânia", "Goiânia", "Jairo Rodarte",
  ],
  PROCESSOS_LEGEND_ROWS
);

writeTemplate(
  "modelo-agenda.xlsx",
  [
    "Data", "Hora", "Tipo", "Responsável", "Título", "Título do processo/caso/atendimento", "Número do processo",
    "Juízo", "Observação da atividade", "Etiquetas", "Envolvidos", "Status", "Prioridade", "Data de criação", "Data de conclusão",
  ],
  [
    "15/02/2026", "14:00", "Audiência", "Jairo Rodarte", "Audiência de instrução e julgamento", "João da Silva x Empresa XYZ Ltda",
    "0000000-00.2026.8.09.0051", "3ª Vara Cível de Goiânia", "Levar cópia dos documentos originais", "", "", "Em andamento", "Alta", "", "",
  ]
);

writeTemplate(
  "modelo-financeiro.xlsx",
  ["Data", "Conta Financeira", "Descricao", "Categoria", "Centro de custo", "Pago para / Recebido de", "Cliente", "Documento", "Caso", "Responsavel", "Valor", "Tipo", "Status"],
  ["05/02/2026", "Rodarte Prado Advogados", "Honorários contratuais - parcela 1/6", "Honorários Contratuais", "Civil", "João da Silva", "João da Silva", "", "João da Silva x Empresa XYZ Ltda", "Jairo Rodarte", 1500, "Entrada", "Recebido"]
);

console.log("Todos os modelos .xlsx gerados em public/templates/");
