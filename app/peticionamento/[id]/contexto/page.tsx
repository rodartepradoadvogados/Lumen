import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { ShellPeticionamento } from "@/components/peticionamento/Shell";
import { ContextoClient } from "@/components/peticionamento/ContextoClient";
import { obterSessaoPeticionamento, obterVinculosDaSessao, listarMateriasParaEscritorio, avaliarTrabalhoEmAndamento, contarRascunhos, gravarPassoDaSessao } from "@/lib/actions/peticionamento";
import { lerMateriasDaSessao } from "@/lib/peticionamentoMateria";

export const dynamic = "force-dynamic";

export default async function ContextoPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) notFound();

  const sessao = await obterSessaoPeticionamento(params.id).catch(() => null);
  if (!sessao) notFound();

  // Grava o passo real a cada navegação — Retomar usa isto, não mais a dedução (lib/peticionamentoPasso.ts).
  // NUNCA mais a lista inteira de processos/atendimentos/assessorias do escritório: só o que JÁ
  // está vinculado. A busca é do servidor, sob demanda (buscarContextoParaVincular) — item 3 do
  // pedido do dono, 22/09/2026.
  const [vinculos, materias, temTrabalho, rascunhosCount] = await Promise.all([
    obterVinculosDaSessao(params.id),
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
      rolagemSoNoMiolo
    >
      <ContextoClient
        sessaoId={params.id}
        vinculados={vinculos.vinculados}
        clienteTravado={vinculos.clienteTravado}
        materias={materias}
        materiasAtuais={lerMateriasDaSessao(sessao.materiasNomes, sessao.materiaNome)}
        naturezaProcedimento={sessao.naturezaProcedimento}
        naturezaMotivo={sessao.naturezaMotivo}
        naturezaConfirmadaManualmente={sessao.naturezaConfirmadaManualmente}
      />
    </ShellPeticionamento>
  );
}
