import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { ShellPeticionamento } from "@/components/peticionamento/Shell";
import { ContextoClient } from "@/components/peticionamento/ContextoClient";
import { obterSessaoPeticionamento, buscarCandidatosDeContexto, listarMateriasParaEscritorio, avaliarTrabalhoEmAndamento, contarRascunhos, gravarPassoDaSessao } from "@/lib/actions/peticionamento";

export const dynamic = "force-dynamic";

export default async function ContextoPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) notFound();

  const sessao = await obterSessaoPeticionamento(params.id).catch(() => null);
  if (!sessao) notFound();

  // Grava o passo real a cada navegação — Retomar usa isto, não mais a dedução (lib/peticionamentoPasso.ts).
  const [candidatos, materias, temTrabalho, rascunhosCount] = await Promise.all([
    buscarCandidatosDeContexto(params.id),
    listarMateriasParaEscritorio(),
    avaliarTrabalhoEmAndamento(params.id),
    contarRascunhos(),
    gravarPassoDaSessao(params.id, "contexto"),
  ]);

  return (
    <ShellPeticionamento
      sessaoId={params.id}
      ativo="contexto"
      crumbAtual="Contexto"
      nomeUsuario={user.name}
      papelUsuario={`OAB ${user.oab ?? "—"} · ${user.role}`}
      temTrabalho={temTrabalho}
      rascunhosCount={rascunhosCount}
    >
      <ContextoClient
        sessaoId={params.id}
        candidatos={candidatos}
        materias={materias}
        materiaAtual={sessao.materiaNome}
        naturezaProcedimento={sessao.naturezaProcedimento}
        naturezaMotivo={sessao.naturezaMotivo}
        naturezaConfirmadaManualmente={sessao.naturezaConfirmadaManualmente}
      />
    </ShellPeticionamento>
  );
}
