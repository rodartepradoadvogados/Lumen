import * as XLSX from "xlsx";
import path from "path";

const OUT_DIR = path.join(__dirname, "..", "public", "templates");

function writeTemplate(filename: string, headers: string[], exampleRow: (string | number)[]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Modelo");
  XLSX.writeFile(wb, path.join(OUT_DIR, filename));
  console.log(`Gerado: ${filename}`);
}

writeTemplate(
  "modelo-contatos.xlsx",
  ["Nome", "Tipo", "Documento", "Email", "Telefone", "Endereço", "Observações"],
  ["João da Silva", "PF", "123.456.789-00", "joao@exemplo.com.br", "(62) 99999-0000", "Rua Exemplo, 100 - Goiânia/GO", "Cliente indicado por outro cliente"]
);

writeTemplate(
  "modelo-processos-casos-atendimentos.xlsx",
  [
    "Tipo", "Título", "Papel do cliente", "Cliente", "Outros clientes", "Outros envolvidos", "Pasta", "Ação", "Número",
    "Data de distribuição", "Objeto", "Observações", "Matéria", "Valor da causa", "Valor da condenação",
    "Decisão do processo", "Resultado do processo", "Etiquetas", "Data de Criação", "Data de Encerramento",
    "Data do último histórico", "Descrição do último histórico", "Instância Original", "Instância Atual",
    "URL do Processo", "Vara", "Foro", "Responsável",
  ],
  [
    "Processo", "João da Silva x Empresa XYZ Ltda", "Autor", "João da Silva", "", "Empresa XYZ Ltda (PARTE)", "PASTA-001", "Ação de Cobrança",
    "0000000-00.2026.8.09.0051", "01/02/2026", "Cobrança de valores em aberto", "Observação livre sobre o caso", "Cível", 15000, "",
    "", "", "", "01/02/2026", "", "", "", "1", "1", "", "3ª Vara Cível de Goiânia", "Goiânia", "Jairo Rodarte",
  ]
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
