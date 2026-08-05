import type { OfficeAccessLogEntry } from "@/lib/supportAccess";
import { ACCESS_ACTION_LABEL } from "@/lib/supportAccessConstants";

// Montagem PURA do CSV do extrato de acessos (Fase C, comprovação nº 2). Separado da rota
// (app/api/configuracoes/acessos/exportar/route.ts) pelo mesmo motivo de todo o resto deste
// pacote de comprovação: sem next/server, testável de um script solto
// (scripts/testar-comprovacao.ts) passando um `log` fabricado, sem precisar de banco nem de uma
// requisição HTTP de verdade.

// Escapa um campo para CSV (RFC 4180): aspas duplas quando o valor contém separador, aspas ou
// quebra de linha; aspas internas viram aspas duplicadas.
function csvField(value: string): string {
  if (/[",\n\r;]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(fields: string[]): string {
  return fields.map(csvField).join(",") + "\r\n";
}

export function buildAccessLogCsv(input: {
  officeName: string;
  days: number;
  log: OfficeAccessLogEntry[];
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - input.days * 24 * 60 * 60 * 1000);
  const periodo = `${since.toLocaleDateString("pt-BR")} a ${now.toLocaleDateString("pt-BR")} (${input.days} dias)`;

  let csv = "";
  csv += csvRow(["Extrato de acessos da Lúmen"]);
  csv += csvRow([`Escritório: ${input.officeName}`]);
  csv += csvRow([`Período: ${periodo}`]);
  csv += csvRow([`Gerado em: ${now.toLocaleString("pt-BR")}`]);
  csv += "\r\n";

  if (input.log.length === 0) {
    // Extrato vazio é a prova mais forte que existe — precisa ficar EXPLÍCITO que é isso, e não
    // um arquivo quebrado ou uma consulta que falhou.
    csv += csvRow(["Nenhum acesso da equipe Lúmen neste período."]);
    return csv;
  }

  csv += csvRow(["Data/hora", "Quem (equipe Lúmen)", "Ação", "Motivo", "Registro afetado", "Duração", "Fora do protocolo normal"]);
  for (const entry of input.log) {
    csv += csvRow([
      entry.createdAt.toLocaleString("pt-BR"),
      entry.memberName,
      ACCESS_ACTION_LABEL[entry.action] ?? entry.action,
      entry.reasonLabel,
      entry.scopeDescription ?? "",
      entry.durationMinutes !== null ? `${entry.durationMinutes} min` : "",
      entry.outOfBand ? "Sim" : "Não",
    ]);
  }
  return csv;
}

// Nome de arquivo seguro a partir do nome do escritório (mesmo espírito do sanitize usado em
// app/api/protocolos/[loteId]/zip/route.ts).
const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

export function safeFileFragment(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "") // remove acentos combinantes após NFD
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
