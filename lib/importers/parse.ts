import * as XLSX from "xlsx";

export type Row = Record<string, unknown>;

export async function parseSpreadsheet(file: File): Promise<Row[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });
}

export function col(row: Row, ...names: string[]): string {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== "") {
      return String(row[name]).trim();
    }
  }
  return "";
}

export function parseBrDate(value: string): Date | null {
  if (!value || value === "-") return null;
  const datePart = value.split(" - ")[0].trim();
  const timePart = value.includes(" - ") ? value.split(" - ")[1].trim() : null;
  const m = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (timePart) {
    const tm = timePart.match(/^(\d{1,2}):(\d{2})/);
    if (tm) date.setHours(Number(tm[1]), Number(tm[2]));
  }
  return isNaN(date.getTime()) ? null : date;
}

export function parseBrTime(value: string): string | null {
  if (!value || value === "-") return null;
  const m = value.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

export function parseBrCurrency(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
