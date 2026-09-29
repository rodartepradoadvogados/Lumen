import { prisma } from "@/lib/prisma";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { carregarPaginaDoChat } from "@/lib/mensagensDoChatDb";
import { statusDaConversa } from "@/lib/conversasDoApp";
import AtualizarAoVivo from "@/components/atendimento/AtualizarAoVivo";
import ChatDaConversa from "@/components/atendimento-app/ChatDaConversa";
import AvisoSemEnvio from "@/components/atendimento-app/AvisoSemEnvio";
import StatusDaConversaLinha from "@/components/atendimento-app/StatusDaConversa";
import SemAcessoAConversa from "@/components/atendimento-app/SemAcessoAConversa";
import { carregarConversaDoApp } from "./dados";

export const dynamic = "force-dynamic";

// A GUIA CHAT — o que a pessoa vê ao entrar numa conversa (Onda A: modo leitura).
//
// A conversa vem pelo recorte de acesso (carregarConversaDoApp -> whereDeUmAtendimento: id + escritório
// + dono). Só DEPOIS de ela existir para quem pediu é que se lêem as mensagens: as 60 últimas.
export default async function ChatDoAtendimentoPage({ params }: { params: { id: string } }) {
  const viewer = await exigirAcessoAoAtendimentoNaTela();
  const c = await carregarConversaDoApp(params.id);
  if (!c) return <SemAcessoAConversa />;

  const agora = new Date();
  const [pagina, cfg] = await Promise.all([
    carregarPaginaDoChat(c.id, viewer.officeId, { agora }),
    prisma.whatsappConfig.findUnique({ where: { officeId: viewer.officeId }, select: { agenteNome: true } }),
  ]);
  const nomeDoAtendente = cfg?.agenteNome?.trim() || "Atendente";
  const ultima = pagina.mensagens[pagina.mensagens.length - 1];
  const status = statusDaConversa(c, ultima ? ultima.direction : null, agora, nomeDoAtendente);
  const semWhatsapp = !c.waPhone && pagina.mensagens.length === 0;

  return (
    <>
      <StatusDaConversaLinha status={status} />
      <ChatDaConversa key={c.id} idDaConversa={c.id} inicial={pagina} nomeDoAtendente={nomeDoAtendente} semWhatsapp={semWhatsapp} />
      <AvisoSemEnvio />
      {/* Mensagem nova aparece sozinha a cada 15 s (pausa com a aba oculta). */}
      <AtualizarAoVivo />
    </>
  );
}
