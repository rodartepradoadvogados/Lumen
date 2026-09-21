import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { ShellPeticionamento } from "@/components/peticionamento/Shell";
import { MinutaClient } from "@/components/peticionamento/MinutaClient";
import { obterSessaoPeticionamento } from "@/lib/actions/peticionamento";
import { montarNotaObrigatoria, type PrecedenteCitado } from "@/lib/peticionamentoNotaObrigatoria";
import { perfilDePeticionamento } from "@/lib/hermesPonte";
import { avaliarExportacao } from "@/lib/peticionamentoAcesso";

export const dynamic = "force-dynamic";

async function descricaoDoContexto(sessao: { officeId: string; vinculoCaseIds: unknown; vinculoAttendanceIds: unknown; vinculoAssessoriaIds: unknown }): Promise<string | null> {
  const caseIds = (sessao.vinculoCaseIds as string[] | null) ?? [];
  const attendanceIds = (sessao.vinculoAttendanceIds as string[] | null) ?? [];
  const assessoriaIds = (sessao.vinculoAssessoriaIds as string[] | null) ?? [];
  if (caseIds.length === 0 && attendanceIds.length === 0 && assessoriaIds.length === 0) return null;
  const partes: string[] = [];
  if (caseIds.length) {
    const cs = await prisma.case.findMany({ where: { id: { in: caseIds }, officeId: sessao.officeId }, select: { processNumber: true, title: true, court: true } });
    partes.push(...cs.map((c) => (c.processNumber ? `Processo nº ${c.processNumber}${c.court ? ` — ${c.court}` : ""}` : c.title)));
  }
  if (attendanceIds.length) {
    const as = await prisma.attendance.findMany({ where: { id: { in: attendanceIds }, officeId: sessao.officeId }, select: { subject: true } });
    partes.push(...as.map((a) => `Atendimento — ${a.subject}`));
  }
  if (assessoriaIds.length) {
    const ases = await prisma.assessoria.findMany({ where: { id: { in: assessoriaIds }, officeId: sessao.officeId }, include: { client: true } });
    partes.push(...ases.map((a) => `Assessoria — ${a.client.name}`));
  }
  return partes.length ? partes.join(" · ") : null;
}

export default async function MinutaPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sessao = await obterSessaoPeticionamento(params.id).catch(() => null);
  if (!sessao) notFound();

  if (sessao.status === "GERANDO") {
    return (
      <ShellPeticionamento sessaoId={params.id} ativo="minuta" crumbAtual="Minuta" nomeUsuario={user.name} papelUsuario={user.role}>
        <div className="content">
          <div className="callout">Gerando minuta com o Hermes — isto pode levar até 1-2 minutos.</div>
        </div>
      </ShellPeticionamento>
    );
  }

  if (sessao.status === "FALHA_GERACAO" || !sessao.minutaTexto) {
    return (
      <ShellPeticionamento sessaoId={params.id} ativo="minuta" crumbAtual="Minuta" nomeUsuario={user.name} papelUsuario={user.role}>
        <div className="content">
          <div className="callout callout-danger">
            <h2>Não foi possível gerar a minuta</h2>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
              O agente (perfil <span className="mono">peticionamento-lumen</span>) não respondeu. Isto costuma significar que o Hermes não está configurado ou
              está indisponível neste ambiente — os dados desta sessão continuam salvos, nada foi perdido.
            </p>
          </div>
          <a className="btn btn-primary" style={{ marginTop: 16, width: "fit-content" }} href={`/peticionamento/${params.id}/confirmar`}>
            Tentar novamente
          </a>
        </div>
      </ShellPeticionamento>
    );
  }

  const contextoDescricao = await descricaoDoContexto(sessao);
  const notaObrigatoria = montarNotaObrigatoria({
    precedentes: ((sessao.jurisprudenciaCitada as PrecedenteCitado[] | null) ?? []) as PrecedenteCitado[],
    documentosBaseConsultados: ((sessao.documentosBaseConsultados as string[] | null) ?? []) as string[],
    contextoVinculadoDescricao: contextoDescricao,
    geradoEm: sessao.geradoEm ?? new Date(),
    perfil: perfilDePeticionamento(),
    sessaoId: sessao.id,
  });

  return (
    <ShellPeticionamento
      sessaoId={params.id}
      ativo="minuta"
      crumbAtual="Minuta"
      nomeUsuario={user.name}
      papelUsuario={`OAB ${user.oab ?? "—"} · ${user.role}`}
      statusCentro={sessao.status === "EXPORTADA" ? "exportada" : "documento vivo · edição local, ainda não exportado"}
    >
      <MinutaClient
        sessaoId={params.id}
        titulo={`${sessao.tipoPeca ?? "Petição"}${sessao.clienteNome ? ` — ${sessao.clienteNome}` : ""}`}
        notaObrigatoria={notaObrigatoria}
        notaRiscos={((sessao.notaRiscos as string[] | null) ?? []) as string[]}
        corpoInicial={sessao.minutaTexto}
        podeExportar={avaliarExportacao(user)}
        exportada={sessao.status === "EXPORTADA"}
      />
    </ShellPeticionamento>
  );
}
