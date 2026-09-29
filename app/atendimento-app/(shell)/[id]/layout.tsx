import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import CabecalhoDaConversa from "@/components/atendimento-app/CabecalhoDaConversa";
import SemAcessoAConversa from "@/components/atendimento-app/SemAcessoAConversa";
import PainelDaConversa from "@/components/atendimento-app/PainelDaConversa";
import { carregarConversaDoApp } from "./dados";

export const dynamic = "force-dynamic";

// A CONVERSA EM TELA CHEIA (Onda A): cabeçalho grafite + guias Chat/Detalhes + o conteúdo da guia.
// Cobre a tela toda (`fixed inset-0`) — a casca do app não desenha cabeçalho nem barra aqui — e o
// conteúdo rola por dentro, com o cabeçalho fixo. A coluna tem a largura do app (max-w-md).
export default async function ConversaLayout({ children, params }: { children: React.ReactNode; params: { id: string } }) {
  await exigirAcessoAoAtendimentoNaTela();
  const c = await carregarConversaDoApp(params.id);
  if (!c) return <SemAcessoAConversa />;

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-sf-fundo">
      <div className="flex h-full w-full max-w-md flex-col border-x border-regua bg-sf-fundo">
        <CabecalhoDaConversa id={c.id} clientName={c.clientName} waPhone={c.waPhone} contactPhone={c.contactPhone} subject={c.subject} />
        <PainelDaConversa>{children}</PainelDaConversa>
      </div>
    </div>
  );
}
