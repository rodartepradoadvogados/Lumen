import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import TelaCheiaDaConversa from "@/components/atendimento-app/TelaCheiaDaConversa";
import CabecalhoDaConversa from "@/components/atendimento-app/CabecalhoDaConversa";
import SemAcessoAConversa from "@/components/atendimento-app/SemAcessoAConversa";
import PainelDaConversa from "@/components/atendimento-app/PainelDaConversa";
import { carregarConversaDoApp } from "./dados";

export const dynamic = "force-dynamic";

// A CONVERSA EM TELA CHEIA (Onda A): cabeçalho sobre o fundo da tela (acabamento WhatsApp) + guias Chat/Detalhes + o conteúdo da guia.
// Cobre a tela toda (`fixed inset-0`, com a altura do que o aparelho de fato mostra — o teclado virtual não esconde o campo) — a casca do app não desenha cabeçalho nem barra aqui — e o
// conteúdo rola por dentro, com o cabeçalho fixo. A coluna tem a largura do app (max-w-md).
export default async function ConversaLayout({ children, params }: { children: React.ReactNode; params: { id: string } }) {
  await exigirAcessoAoAtendimentoNaTela();
  const c = await carregarConversaDoApp(params.id);
  if (!c) return <SemAcessoAConversa />;

  return (
    <TelaCheiaDaConversa>
      <div className="flex h-full w-full max-w-md flex-col border-x border-atd-barra-borda bg-atd-tela">
        <CabecalhoDaConversa id={c.id} clientName={c.clientName} waPhone={c.waPhone} contactPhone={c.contactPhone} subject={c.subject} />
        <PainelDaConversa>{children}</PainelDaConversa>
      </div>
    </TelaCheiaDaConversa>
  );
}
