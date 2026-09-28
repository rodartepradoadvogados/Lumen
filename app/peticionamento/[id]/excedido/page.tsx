import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { ShellPeticionamento } from "@/components/peticionamento/Shell";
import { obterSessaoPeticionamento, avaliarTrabalhoEmAndamento, contarRascunhos } from "@/lib/actions/peticionamento";
import { ExcedidoClient } from "@/components/peticionamento/ExcedidoClient";

export const dynamic = "force-dynamic";

// Especificação §8: "nunca trunca em silêncio". Esta tela é o BLOQUEIO — só existe estado
// "resumido" (que segue em frente sozinho, avisando) e "bloqueado" (que pede decisão do
// advogado); nunca um terceiro estado de "cortou e seguiu calado".
export default async function ExcedidoPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sessao = await obterSessaoPeticionamento(params.id).catch(() => null);
  if (!sessao) notFound();
  const [temTrabalho, rascunhosCount] = await Promise.all([avaliarTrabalhoEmAndamento(params.id), contarRascunhos()]);

  return (
    <ShellPeticionamento
      sessaoId={params.id}
      // "confirmar", não "documentos": esta tela só é alcançada a partir da confirmação
      // (ConfirmarClient.tsx empurra para cá quando o contexto excede o limite) — usar "confirmar"
      // aqui é o que faz o botão "Voltar" do topbar (item 2 do pedido do dono, 24/09/2026) levar
      // para onde a pessoa realmente estava, e não para "Documentos" (etapa anterior a Confirmar,
      // não a etapa de onde este bloqueio vem).
      ativo="confirmar"
      crumbAtual="Limite de contexto"
      nomeUsuario={user.name}
      papelUsuario={`OAB ${user.oab ?? "—"} · ${user.role}`}
      temTrabalho={temTrabalho}
      rascunhosCount={rascunhosCount}
    >
      <ExcedidoClient sessaoId={params.id} motivoBloqueio={sessao.contextoBloqueadoMotivo} avisoResumo={sessao.contextoResumoAviso} />
    </ShellPeticionamento>
  );
}
