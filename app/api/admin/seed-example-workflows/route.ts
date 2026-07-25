import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// Ação pontual: cria 2 workflows de exemplo no escritório do admin logado, para servir de
// referência de como montar um workflow próprio (Configurações → Workflows). Não faz nada se
// o escritório já tiver algum workflow com o mesmo nome (idempotente).
//
// Uso: GET /api/admin/seed-example-workflows
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) {
    return NextResponse.json({ error: "Apenas administradores podem rodar isso." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const EXAMPLES = [
    {
      name: "Novo Processo Cível — Petição Inicial",
      area: "Cível",
      description: "Passos padrão desde a distribuição do processo até a primeira audiência.",
      steps: [
        { title: "Protocolar petição inicial", taskType: "TAREFA", offsetDays: 0, priority: "ALTA", role: "Advogado" },
        { title: "Conferir citação da parte adversa", taskType: "PRAZO", offsetDays: 15, priority: "MEDIA", role: "Advogado" },
        { title: "Analisar contestação (se houver)", taskType: "PRAZO", offsetDays: 30, priority: "ALTA", role: "Advogado" },
        { title: "Audiência de conciliação", taskType: "AUDIENCIA", offsetDays: 45, priority: "ALTA", role: "Advogado" },
      ],
    },
    {
      name: "Audiência Trabalhista — Preparação",
      area: "Trabalhista",
      description: "Checklist de preparação para audiência, da notificação à ata final.",
      steps: [
        { title: "Confirmar data/hora da audiência com o cliente", taskType: "TAREFA", offsetDays: 0, priority: "MEDIA", role: "Recepcionista" },
        { title: "Reunir documentos e provas do processo", taskType: "TAREFA", offsetDays: 3, priority: "ALTA", role: "Estagiário" },
        { title: "Reunião de alinhamento com o cliente", taskType: "EVENTO", offsetDays: 7, priority: "MEDIA", role: "Advogado" },
        { title: "Audiência", taskType: "AUDIENCIA", offsetDays: 10, priority: "ALTA", role: "Advogado" },
        { title: "Registrar ata e próximos passos", taskType: "TAREFA", offsetDays: 10, priority: "MEDIA", role: "Advogado" },
      ],
    },
  ];

  const created: string[] = [];
  const skipped: string[] = [];

  for (const example of EXAMPLES) {
    const existing = await prisma.workflowTemplate.findFirst({ where: { officeId: viewer.officeId, name: example.name } });
    if (existing) {
      skipped.push(example.name);
      continue;
    }
    const template = await prisma.workflowTemplate.create({
      data: { name: example.name, area: example.area, description: example.description, officeId: viewer.officeId },
    });
    await prisma.workflowStep.createMany({
      data: example.steps.map((s, i) => ({
        templateId: template.id,
        order: i,
        title: s.title,
        taskType: s.taskType,
        offsetDays: s.offsetDays,
        priority: s.priority,
        role: s.role,
        officeId: viewer.officeId,
      })),
    });
    created.push(example.name);
  }

  return NextResponse.json({ criados: created, jaExistiam: skipped }, { headers: { "Cache-Control": "no-store" } });
}
