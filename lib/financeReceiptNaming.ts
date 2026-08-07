// Nome do arquivo do comprovante de pagamento/recebimento (Contas a Pagar/Contas a Receber),
// pedido explícito do usuário: "AAAA-MM-DD-[fornecedor]-[descricao]". Módulo PURO (sem Prisma,
// sem chamada a provedor de armazenamento) para o cálculo do nome poder ser testado sem banco
// (ver scripts/testar-nomeacao-comprovante.ts) e para ser a MESMA função usada tanto no upload
// quanto na decisão de "precisa renomear?" em lib/actions/financeiro.ts — nunca duas fórmulas de
// nome divergindo aos poucos.

// NÃO usa saoPauloDayKey (lib/publicationGrouping.ts) de propósito, embora pareça a escolha
// natural. paidDate/dueDate de Payable/Receivable nascem de um <input type="date"> (string
// "AAAA-MM-DD", sem hora) e são gravados como `new Date(string)` em todo o financeiro (ver
// createPayable/updatePayable/markPayablePaid em lib/actions/financeiro.ts) — o construtor Date
// trata string SÓ-DATA como meia-noite UTC. saoPauloDayKey formata em America/Sao_Paulo
// (UTC-3): meia-noite UTC de "2026-08-06" vira 21h do dia 5 em Brasília, e o comprovante sairia
// catalogado um dia ANTES do que o usuário escolheu. O que se quer aqui não é "que dia era isso
// no fuso de Brasília" (a pergunta certa para um horário de publicação de verdade, com hora
// real) — é "que dia o usuário digitou", e para isso os componentes UTC batem exatamente com o
// que foi digitado, sem reinterpretar fuso nenhum.
function utcDayKey(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Mesmo alfabeto de slug usado no restante do produto para nome de arquivo/pasta (sem acento,
// minúsculo, só letras/dígitos separados por hífen) — não reaproveita normalizeLoose de
// lib/textNormalize.ts de propósito: aquela função existe para COMPARAÇÃO (remove separadores
// por completo, "Jose Carlos" -> "josecarlos") e destruiria a legibilidade do nome do arquivo;
// aqui o hífen entre palavras precisa sobreviver.
function slugifyForFileName(s: string, maxLength: number): string {
  const slug = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug.slice(0, maxLength).replace(/-$/, "") || "sem-informacao";
}

export type ReceiptNameInput = {
  // paidDate ?? dueDate — resolvido por quem chama (a conta pode ainda não ter sido paga; nesse
  // caso o vencimento serve de data de referência, para o arquivo nunca ficar sem data no nome).
  date: Date | string;
  // Fornecedor (Payable) ou cliente/pagador (Receivable) — já resolvido pelo chamador para o
  // nome de exibição certo; esta função não sabe (nem precisa saber) qual dos dois é.
  counterpart: string | null;
  description: string;
  // Sem o ponto (ex.: "pdf") — normalmente extraído do nome do arquivo original no upload.
  extension: string;
};

export function buildReceiptFileName(input: ReceiptNameInput): string {
  const day = utcDayKey(input.date);
  const counterpartSlug = slugifyForFileName(input.counterpart || "", 50);
  const descriptionSlug = slugifyForFileName(input.description, 80);
  const ext = input.extension.replace(/^\./, "").toLowerCase() || "pdf";
  return `${day}-${counterpartSlug}-${descriptionSlug}.${ext}`;
}

// Extensão a partir do nome de arquivo original enviado pelo navegador — "documento.pdf" -> "pdf".
export function extensionFromFileName(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "pdf";
}
