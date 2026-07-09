import { prisma } from "@/lib/prisma";
import { col, parseBrDate, parseBrCurrency, parseBrTime, Row } from "@/lib/importers/parse";

export type ImportResult = { created: number; skipped: number; errors: string[] };

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

async function findUserByName(name: string, users: { id: string; name: string }[]) {
  if (!name) return null;
  const target = norm(name);
  return users.find((u) => norm(u.name) === target || target.includes(norm(u.name)) || norm(u.name).includes(target))?.id ?? null;
}

async function findOrCreateClient(name: string, cache: Map<string, string>) {
  const key = norm(name);
  if (cache.has(key)) return cache.get(key)!;
  const existing = await prisma.client.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }
  const created = await prisma.client.create({ data: { name, type: "PJ" } });
  cache.set(key, created.id);
  return created.id;
}

const instanceLabels: Record<string, string> = { "1": "1º Grau", "2": "2º Grau", "3": "3º Grau" };

export async function importCasesCore(rows: Row[]): Promise<ImportResult> {
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const clientCache = new Map<string, string>();

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [i, row] of rows.entries()) {
    try {
      const title = col(row, "Título", "Titulo");
      if (!title) {
        skipped++;
        continue;
      }
      const tipoRaw = col(row, "Tipo");
      const type = tipoRaw === "Processo" ? "JUDICIAL" : "ATENDIMENTO";

      const clientName = col(row, "Cliente");
      const clientId = clientName ? await findOrCreateClient(clientName, clientCache) : null;

      const othersRaw = col(row, "Outros envolvidos");
      const opposingPartyName = othersRaw ? othersRaw.split(",")[0].replace(/\(PARTE\)/gi, "").trim() || null : null;

      const responsibleName = col(row, "Responsável", "Responsavel");
      const responsibleId = await findUserByName(responsibleName, users);

      const instanceOriginal = col(row, "Instância Original", "Instancia Original");
      const instanceCurrent = col(row, "Instância Atual", "Instancia Atual");

      const descParts = [col(row, "Objeto"), col(row, "Observações", "Observacoes")].filter(Boolean);
      if (othersRaw) descParts.push(`Outros envolvidos: ${othersRaw}`);
      const outrosClientes = col(row, "Outros clientes");
      if (outrosClientes) descParts.push(`Outros clientes: ${outrosClientes}`);

      await prisma.case.create({
        data: {
          title,
          type,
          area: col(row, "Matéria", "Materia") || null,
          clientRole: col(row, "Papel do cliente") || null,
          folder: col(row, "Pasta") || null,
          actionType: col(row, "Ação", "Acao") || null,
          processNumber: col(row, "Número", "Numero") || null,
          distributedAt: parseBrDate(col(row, "Data de distribuição", "Data de distribuicao")),
          closedAt: parseBrDate(col(row, "Data de Encerramento")),
          lastHistoryAt: parseBrDate(col(row, "Data do último histórico", "Data do ultimo historico")),
          lastHistoryDesc: col(row, "Descrição do último histórico", "Descricao do ultimo historico") || null,
          description: descParts.join("\n\n") || null,
          caseValue: parseBrCurrency(col(row, "Valor da causa")),
          convictionValue: parseBrCurrency(col(row, "Valor da condenação", "Valor da condenacao")),
          decision: col(row, "Decisão do processo", "Decisao do processo") || null,
          outcome: col(row, "Resultado do processo") || null,
          tags: col(row, "Etiquetas") || null,
          instance: instanceLabels[instanceOriginal] || instanceOriginal || null,
          currentInstance: instanceLabels[instanceCurrent] || instanceCurrent || null,
          sourceUrl: col(row, "URL do Processo", "URL do processo") || null,
          court: col(row, "Vara") || null,
          forum: col(row, "Foro") || null,
          clientId,
          opposingPartyName,
          responsibleId,
        },
      });
      created++;
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro desconhecido";
      errors.push(`Linha ${i + 2}: ${message}`);
    }
  }

  return { created, skipped, errors };
}

const taskTypeMap: Record<string, string> = {
  tarefa: "TAREFA",
  prazo: "PRAZO",
  audiencia: "AUDIENCIA",
  audiência: "AUDIENCIA",
  pericia: "PERICIA",
  perícia: "PERICIA",
  reuniao: "EVENTO",
  reunião: "EVENTO",
  evento: "EVENTO",
};

const priorityMap: Record<string, string> = { alta: "ALTA", media: "MEDIA", média: "MEDIA", baixa: "BAIXA", urgente: "URGENTE" };

export async function importAgendaCore(rows: Row[]): Promise<ImportResult> {
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const cases = await prisma.case.findMany({ select: { id: true, title: true, processNumber: true } });
  const firstColumn = await prisma.kanbanColumn.findFirst({ orderBy: { order: "asc" } });
  const doneColumn = await prisma.kanbanColumn.findFirst({ where: { isDoneCol: true } });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [i, row] of rows.entries()) {
    try {
      const title = col(row, "Título", "Titulo");
      const dueDate = parseBrDate(col(row, "Data"));
      if (!title || !dueDate) {
        skipped++;
        continue;
      }

      const tipoRaw = norm(col(row, "Tipo"));
      const type = taskTypeMap[tipoRaw] || "TAREFA";
      const priorityRaw = norm(col(row, "Prioridade"));
      const priority = priorityMap[priorityRaw] || "MEDIA";
      const statusRaw = norm(col(row, "Status"));
      const status = statusRaw.includes("conclu") ? "CONCLUIDO" : statusRaw.includes("andamento") ? "EM_ANDAMENTO" : "PENDENTE";

      const responsibleId = await findUserByName(col(row, "Responsável", "Responsavel"), users);

      const caseTitle = col(row, "Título do processo/caso/atendimento", "Titulo do processo/caso/atendimento");
      const processNumber = col(row, "Número do processo", "Numero do processo");
      let matchedCase = processNumber ? cases.find((c) => c.processNumber === processNumber) : null;
      if (!matchedCase && caseTitle) {
        const nt = norm(caseTitle);
        matchedCase = cases.find((c) => norm(c.title) === nt) || cases.find((c) => norm(c.title).includes(nt) || nt.includes(norm(c.title)));
      }

      const descParts = [col(row, "Observação da atividade", "Observacao da atividade")];
      if (col(row, "Juízo", "Juizo")) descParts.push(`Juízo: ${col(row, "Juízo", "Juizo")}`);
      if (col(row, "Envolvidos")) descParts.push(`Envolvidos: ${col(row, "Envolvidos")}`);
      if (col(row, "Etiquetas")) descParts.push(`Etiquetas: ${col(row, "Etiquetas")}`);
      if (!matchedCase && caseTitle) descParts.push(`Processo/caso (não localizado no sistema): ${caseTitle}`);

      await prisma.task.create({
        data: {
          title,
          type,
          dueDate,
          dueTime: parseBrTime(col(row, "Hora")),
          priority,
          status,
          completedAt: parseBrDate(col(row, "Data de conclusão", "Data de conclusao")),
          description: descParts.filter(Boolean).join("\n") || null,
          responsibleId,
          caseId: matchedCase?.id ?? null,
          columnId: (status === "CONCLUIDO" ? doneColumn?.id : firstColumn?.id) ?? firstColumn?.id ?? null,
        },
      });
      created++;
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro desconhecido";
      errors.push(`Linha ${i + 2}: ${message}`);
    }
  }

  return { created, skipped, errors };
}
