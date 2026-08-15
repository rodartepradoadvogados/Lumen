// Exporta os dados de UM escritório (nunca a plataforma inteira — ver OBSIDIAN_OFFICE_ID
// abaixo) para uma pasta de notas em Markdown que um vault do Obsidian consegue ler: uma nota
// por Cliente, Processo/Caso, Assessoria e Atendimento, ligadas entre si por [[wikilinks]], mais
// um resumo financeiro mensal. Documentos (petições, contratos...) NUNCA são copiados — cada
// nota só linka para o arquivo original no Google Drive/OneDrive/Dropbox, que continua sendo a
// única cópia e mantém o controle de acesso de sempre.
//
// SÓ LEITURA: não grava nada no banco, nunca. Roda fora deste sandbox (que não alcança o
// Postgres de produção) — ver instruções em docs/obsidian/SETUP.md.
//
// Idempotente por natureza: cada nota é sobrescrita inteira a cada execução (o nome do arquivo é
// determinístico, baseado no id do registro) — rodar de novo com dado atualizado só atualiza o
// conteúdo. Registros excluídos no Lúmen NÃO têm a nota apagada automaticamente (evita apagar
// por engano uma anotação manual que você tenha guardado na mesma pasta) — se quiser limpar
// notas de registros que não existem mais, apague a pasta OBSIDIAN_VAULT_DIR/Lumen inteira antes
// de rodar de novo.
//
// Uso:
//   OBSIDIAN_OFFICE_ID=<id-do-escritorio> OBSIDIAN_VAULT_DIR="C:\caminho\pro\vault" npx tsx scripts/exportar-obsidian.ts

import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { valorLiquido } from "../lib/financeCalc";
import { naturezaOf, NATUREZA_LABELS } from "../lib/caseNatureza";

const OFFICE_ID = process.env.OBSIDIAN_OFFICE_ID;
const VAULT_DIR = process.env.OBSIDIAN_VAULT_DIR;

if (!OFFICE_ID) {
  console.error("Defina OBSIDIAN_OFFICE_ID (id do SEU escritório — nunca exportar a plataforma inteira).");
  process.exit(1);
}
if (!VAULT_DIR) {
  console.error("Defina OBSIDIAN_VAULT_DIR (pasta do vault do Obsidian no seu computador).");
  process.exit(1);
}

const ROOT = path.join(VAULT_DIR, "Lumen");

function slug(s: string): string {
  // Remove os caracteres que Windows/Obsidian não aceitam em nome de arquivo — mantém acentos
  // (Obsidian lida bem com eles) e só troca o que quebraria o arquivo.
  return s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
}

// Sufixo curto do id, pra dois registros com o mesmo nome (dois clientes "João Silva", por
// exemplo) nunca colidirem no mesmo arquivo.
function comId(nome: string, id: string): string {
  return `${slug(nome)} (${id.slice(-6)})`;
}

function escreverNota(subpasta: string, nomeArquivo: string, conteudo: string) {
  const dir = path.join(ROOT, subpasta);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${nomeArquivo}.md`), conteudo, "utf8");
}

function frontmatter(campos: Record<string, string | number | string[]>): string {
  const linhas = Object.entries(campos).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}:\n${v.map((x) => `  - "${x}"`).join("\n")}`;
    return `${k}: "${String(v).replace(/"/g, "'")}"`;
  });
  return `---\n${linhas.join("\n")}\n---\n`;
}

function dataBR(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString("pt-BR") : "—";
}

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function main() {
  const office = await prisma.office.findUnique({ where: { id: OFFICE_ID }, select: { name: true } });
  if (!office) {
    console.error(`Escritório ${OFFICE_ID} não encontrado — confira o OBSIDIAN_OFFICE_ID.`);
    process.exit(1);
  }
  console.log(`Exportando "${office.name}" para ${ROOT}...`);

  // ---------- Clientes ----------
  const clientes = await prisma.client.findMany({
    where: { officeId: OFFICE_ID },
    include: { cases: { select: { id: true, title: true } }, attendances: { select: { id: true, subject: true } }, assessoria: { select: { id: true } } },
  });
  for (const c of clientes) {
    const nomeArq = comId(c.name, c.id);
    const linhas = [
      frontmatter({ tipo: "cliente", lumen_id: c.id, cadastro: dataBR(c.createdAt) }),
      `# ${c.name}\n`,
      `- **Tipo:** ${c.type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}`,
      c.document ? `- **Documento:** ${c.document}` : null,
      c.email ? `- **E-mail:** ${c.email}` : null,
      c.phone ? `- **Telefone:** ${c.phone}` : null,
      `- **Cadastrado em:** ${dataBR(c.createdAt)}`,
      "",
      c.assessoria ? `## Assessoria\n\n[[${comId(c.name, c.assessoria.id)} - Assessoria]]\n` : null,
      c.cases.length > 0 ? `## Processos e casos (${c.cases.length})\n\n${c.cases.map((cs) => `- [[${comId(cs.title, cs.id)} - Processo]]`).join("\n")}\n` : null,
      c.attendances.length > 0
        ? `## Atendimentos (${c.attendances.length})\n\n${c.attendances.map((a) => `- [[${comId(a.subject, a.id)} - Atendimento]]`).join("\n")}\n`
        : null,
    ].filter((l): l is string => l !== null);
    escreverNota("02-Clientes", nomeArq, linhas.join("\n"));
  }
  console.log(`  ${clientes.length} cliente(s)`);

  // ---------- Processos e Casos ----------
  const casos = await prisma.case.findMany({
    where: { officeId: OFFICE_ID },
    include: {
      client: { select: { id: true, name: true } },
      responsible: { select: { name: true } },
      assessoria: { select: { id: true, client: { select: { name: true } } } },
      attachments: { select: { name: true, driveUrl: true, docType: true }, orderBy: { createdAt: "desc" } },
      receivables: { select: { amount: true, discount: true, surcharge: true, status: true, kind: true, payments: { select: { amount: true } } } },
    },
  });
  for (const cs of casos) {
    const nat = naturezaOf(cs.type);
    const totalFaturado = cs.receivables.reduce((s, r) => s + valorLiquido(r.amount, r.discount, r.surcharge), 0);
    const totalRecebido = cs.receivables.reduce((s, r) => s + r.payments.reduce((p, pg) => p + pg.amount, 0), 0);
    const nomeArq = comId(cs.title, cs.id);
    const linhas = [
      frontmatter({
        tipo: "processo",
        lumen_id: cs.id,
        natureza: NATUREZA_LABELS[nat],
        status: cs.status,
        numero_processo: cs.processNumber ?? "",
      }),
      `# ${cs.title}\n`,
      `- **Natureza:** ${NATUREZA_LABELS[nat]}`,
      `- **Status:** ${cs.status}`,
      cs.processNumber ? `- **Número:** ${cs.processNumber}` : null,
      cs.court ? `- **Vara/Comarca:** ${cs.court}` : null,
      cs.caseValue ? `- **Valor da causa:** ${moeda(cs.caseValue)}` : null,
      cs.responsible ? `- **Responsável:** ${cs.responsible.name}` : null,
      cs.client ? `- **Cliente:** [[${comId(cs.client.name, cs.client.id)}]]` : null,
      cs.assessoria ? `- **Assessoria:** [[${comId(cs.assessoria.client.name, cs.assessoria.id)} - Assessoria]]` : null,
      `- **Abrir no Lúmen:** (link interno — acesse pelo sistema)`,
      "",
      cs.receivables.length > 0
        ? `## Financeiro\n\n- Faturado: ${moeda(totalFaturado)}\n- Recebido: ${moeda(totalRecebido)}\n- Em aberto: ${moeda(totalFaturado - totalRecebido)}\n`
        : null,
      cs.attachments.length > 0
        ? `## Documentos (${cs.attachments.length})\n\n${cs.attachments
            .slice(0, 200)
            .map((a) => (a.driveUrl ? `- [${a.name}](${a.driveUrl}) _(${a.docType})_` : `- ${a.name} _(${a.docType})_`))
            .join("\n")}\n`
        : null,
    ].filter((l): l is string => l !== null);
    escreverNota("03-Processos", nomeArq, linhas.join("\n"));
  }
  console.log(`  ${casos.length} processo(s)/caso(s)`);

  // ---------- Assessorias ----------
  const assessorias = await prisma.assessoria.findMany({
    where: { officeId: OFFICE_ID },
    include: {
      client: { select: { id: true, name: true } },
      responsible: { select: { name: true } },
      cases: { select: { id: true, title: true } },
      attendances: { select: { id: true, subject: true } },
    },
  });
  for (const a of assessorias) {
    const nomeArq = `${comId(a.client.name, a.id)} - Assessoria`;
    const linhas = [
      frontmatter({ tipo: "assessoria", lumen_id: a.id, status: a.status }),
      `# Assessoria — ${a.client.name}\n`,
      `- **Cliente:** [[${comId(a.client.name, a.client.id)}]]`,
      `- **Status:** ${a.status}`,
      `- **Mensalidade:** ${moeda(a.monthlyFee)}`,
      a.responsible ? `- **Responsável:** ${a.responsible.name}` : null,
      "",
      a.cases.length > 0 ? `## Processos vinculados\n\n${a.cases.map((cs) => `- [[${comId(cs.title, cs.id)} - Processo]]`).join("\n")}\n` : null,
      a.attendances.length > 0
        ? `## Atendimentos vinculados\n\n${a.attendances.map((at) => `- [[${comId(at.subject, at.id)} - Atendimento]]`).join("\n")}\n`
        : null,
    ].filter((l): l is string => l !== null);
    escreverNota("04-Assessorias", nomeArq, linhas.join("\n"));
  }
  console.log(`  ${assessorias.length} assessoria(s)`);

  // ---------- Atendimentos (funil comercial) ----------
  const atendimentos = await prisma.attendance.findMany({
    where: { officeId: OFFICE_ID },
    include: { responsible: { select: { name: true } }, client: { select: { id: true, name: true } } },
  });
  for (const at of atendimentos) {
    const nomeArq = `${comId(at.subject, at.id)} - Atendimento`;
    const linhas = [
      frontmatter({ tipo: "atendimento", lumen_id: at.id, status: at.status, estagio: at.stage }),
      `# ${at.clientName} — ${at.subject}\n`,
      `- **Status:** ${at.status}`,
      `- **Estágio do funil:** ${at.stage}`,
      at.responsible ? `- **Responsável:** ${at.responsible.name}` : null,
      at.client ? `- **Cliente cadastrado:** [[${comId(at.client.name, at.client.id)}]]` : null,
      `- **Criado em:** ${dataBR(at.createdAt)}`,
    ].filter((l): l is string => l !== null);
    escreverNota("05-Atendimentos", nomeArq, linhas.join("\n"));
  }
  console.log(`  ${atendimentos.length} atendimento(s)`);

  // ---------- Financeiro: resumo do mês corrente ----------
  const agora = new Date();
  const competencia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
  const [receber, pagar] = await Promise.all([
    prisma.receivable.findMany({
      where: { officeId: OFFICE_ID, dueDate: { gte: inicioMes, lt: fimMes }, status: { not: "CANCELADO" } },
      select: { amount: true, discount: true, surcharge: true, payments: { select: { amount: true } } },
    }),
    prisma.payable.findMany({
      where: { officeId: OFFICE_ID, dueDate: { gte: inicioMes, lt: fimMes }, status: { not: "CANCELADO" } },
      select: { amount: true, discount: true, surcharge: true, payments: { select: { amount: true } } },
    }),
  ]);
  const somaReceber = receber.reduce((s, r) => s + valorLiquido(r.amount, r.discount, r.surcharge), 0);
  const somaRecebido = receber.reduce((s, r) => s + r.payments.reduce((p, pg) => p + pg.amount, 0), 0);
  const somaPagar = pagar.reduce((s, p) => s + valorLiquido(p.amount, p.discount, p.surcharge), 0);
  const somaPago = pagar.reduce((s, p) => s + p.payments.reduce((pp, pg) => pp + pg.amount, 0), 0);
  escreverNota(
    "06-Financeiro",
    `Resumo - ${competencia}`,
    [
      frontmatter({ tipo: "resumo-financeiro", competencia }),
      `# Financeiro — ${competencia}\n`,
      `## A receber no mês`,
      `- Total: ${moeda(somaReceber)}`,
      `- Recebido: ${moeda(somaRecebido)}`,
      `- Em aberto: ${moeda(somaReceber - somaRecebido)}`,
      "",
      `## A pagar no mês`,
      `- Total: ${moeda(somaPagar)}`,
      `- Pago: ${moeda(somaPago)}`,
      `- Em aberto: ${moeda(somaPagar - somaPago)}`,
      "",
      `_Gerado em ${new Date().toLocaleString("pt-BR")}. Valores por conta individual estão nas notas de cada Processo/Cliente._`,
    ].join("\n")
  );
  console.log(`  resumo financeiro de ${competencia}`);

  console.log("\nPronto. Nada foi alterado no banco — exportação só de leitura.");
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
