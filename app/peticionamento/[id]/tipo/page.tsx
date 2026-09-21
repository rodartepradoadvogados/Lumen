import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { ShellPeticionamento } from "@/components/peticionamento/Shell";
import { TipoPecaClient } from "@/components/peticionamento/TipoPecaClient";
import { obterSessaoPeticionamento, avaliarTrabalhoEmAndamento, contarRascunhos } from "@/lib/actions/peticionamento";

export const dynamic = "force-dynamic";

// A PRIMEIRA TELA depois de "Iniciar" (espec. §1 e §7): "a primeira pergunta passa a ser o tipo".
export default async function TipoPecaPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sessao = await obterSessaoPeticionamento(params.id).catch(() => null);
  if (!sessao) notFound();
  const [temTrabalho, rascunhosCount] = await Promise.all([avaliarTrabalhoEmAndamento(params.id), contarRascunhos()]);

  return (
    <ShellPeticionamento
      sessaoId={params.id}
      ativo="tipo"
      crumbAtual="Tipo da peça"
      nomeUsuario={user.name}
      papelUsuario={`OAB ${user.oab ?? "—"} · ${user.role}`}
      temTrabalho={temTrabalho}
      rascunhosCount={rascunhosCount}
    >
      <TipoPecaClient sessaoId={params.id} categoriaAtual={sessao.categoriaPeca} />
    </ShellPeticionamento>
  );
}
