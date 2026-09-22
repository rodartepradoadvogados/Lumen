import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { ShellPeticionamento } from "@/components/peticionamento/Shell";
import { ConfirmarClient } from "@/components/peticionamento/ConfirmarClient";
import { obterSessaoPeticionamento, obterResumoTriagem, avaliarTrabalhoEmAndamento, contarRascunhos, gravarPassoDaSessao } from "@/lib/actions/peticionamento";

export const dynamic = "force-dynamic";

export default async function ConfirmarPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sessao = await obterSessaoPeticionamento(params.id).catch(() => null);
  if (!sessao) notFound();
  // Grava o passo real a cada navegação — Retomar usa isto, não mais a dedução (lib/peticionamentoPasso.ts).
  const [resumo, temTrabalho, rascunhosCount] = await Promise.all([
    obterResumoTriagem(params.id),
    avaliarTrabalhoEmAndamento(params.id),
    contarRascunhos(),
    gravarPassoDaSessao(params.id, "confirmacao"),
  ]);

  return (
    <ShellPeticionamento
      sessaoId={params.id}
      ativo="confirmar"
      crumbAtual="Confirmar geração"
      nomeUsuario={user.name}
      papelUsuario={`OAB ${user.oab ?? "—"} · ${user.role}`}
      temTrabalho={temTrabalho}
      rascunhosCount={rascunhosCount}
    >
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
