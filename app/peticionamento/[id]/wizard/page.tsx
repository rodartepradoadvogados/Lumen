import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { ShellPeticionamento } from "@/components/peticionamento/Shell";
import { WizardClient } from "@/components/peticionamento/WizardClient";
import { obterSessaoPeticionamento, avaliarTrabalhoEmAndamento, contarRascunhos, gravarPassoDaSessao } from "@/lib/actions/peticionamento";

export const dynamic = "force-dynamic";

export default async function WizardPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sessao = await obterSessaoPeticionamento(params.id).catch(() => null);
  if (!sessao) notFound();
  // Grava o passo real a cada navegação — Retomar usa isto, não mais a dedução (lib/peticionamentoPasso.ts).
  const [temTrabalho, rascunhosCount] = await Promise.all([
    avaliarTrabalhoEmAndamento(params.id),
    contarRascunhos(),
    gravarPassoDaSessao(params.id, "questionario"),
  ]);

  return (
    <ShellPeticionamento
      sessaoId={params.id}
      ativo="wizard"
      crumbAtual="Questionário"
      nomeUsuario={user.name}
      papelUsuario={`OAB ${user.oab ?? "—"} · ${user.role}`}
      temTrabalho={temTrabalho}
      rascunhosCount={rascunhosCount}
    >
      <WizardClient
        sessaoId={params.id}
        categoriaPeca={sessao.categoriaPeca}
        inicial={{
          tipoPeca: sessao.tipoPeca,
          tipoPecaOutro: sessao.tipoPecaOutro,
          fatos: sessao.fatos ?? "",
          pedidos: ((sessao.pedidos as string[] | null) ?? []) as string[],
          prazoFatal: sessao.prazoFatal ? sessao.prazoFatal.toISOString().slice(0, 10) : "",
          prazoPreclusivo: sessao.prazoPreclusivo,
          valorCausa: sessao.valorCausa ?? "",
          descumprimentoLiminar: sessao.descumprimentoLiminar ?? "",
          teses: ((sessao.teses as string[] | null) ?? []) as string[],
          observacoes: sessao.observacoes ?? "",
        }}
      />
    </ShellPeticionamento>
  );
}
