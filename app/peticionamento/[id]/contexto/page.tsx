import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { ShellPeticionamento } from "@/components/peticionamento/Shell";
import { ContextoClient } from "@/components/peticionamento/ContextoClient";
import { obterSessaoPeticionamento, buscarCandidatosDeContexto, listarMateriasParaEscritorio } from "@/lib/actions/peticionamento";

export const dynamic = "force-dynamic";

export default async function ContextoPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) notFound();

  const sessao = await obterSessaoPeticionamento(params.id).catch(() => null);
  if (!sessao) notFound();

  const [candidatos, materias] = await Promise.all([buscarCandidatosDeContexto(params.id), listarMateriasParaEscritorio()]);

  return (
    <ShellPeticionamento sessaoId={params.id} ativo="contexto" crumbAtual="Contexto" nomeUsuario={user.name} papelUsuario={`OAB ${user.oab ?? "—"} · ${user.role}`}>
      <ContextoClient sessaoId={params.id} candidatos={candidatos} materias={materias} materiaAtual={sessao.materiaNome} />
    </ShellPeticionamento>
  );
}
