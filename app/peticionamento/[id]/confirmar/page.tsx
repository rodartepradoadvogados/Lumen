import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { ShellPeticionamento } from "@/components/peticionamento/Shell";
import { ConfirmarClient } from "@/components/peticionamento/ConfirmarClient";
import { obterSessaoPeticionamento, obterResumoTriagem } from "@/lib/actions/peticionamento";

export const dynamic = "force-dynamic";

export default async function ConfirmarPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sessao = await obterSessaoPeticionamento(params.id).catch(() => null);
  if (!sessao) notFound();
  const resumo = await obterResumoTriagem(params.id);

  return (
    <ShellPeticionamento sessaoId={params.id} ativo="documentos" crumbAtual="Confirmar geração" nomeUsuario={user.name} papelUsuario={`OAB ${user.oab ?? "—"} · ${user.role}`}>
      <div className="page-head">
        <div>
          <h1>Confirme antes de gerar</h1>
          <p>Este é o resumo do que você preencheu nesta sessão — o texto de &quot;Fatos&quot; é exatamente o que você escreveu, sem reescrita nenhuma. Confira e corrija o que precisar.</p>
        </div>
      </div>
      <div className="content">
        <ConfirmarClient sessaoId={params.id} resumo={resumo} />
      </div>
    </ShellPeticionamento>
  );
}
