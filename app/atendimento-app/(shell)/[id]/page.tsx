import { prisma } from "@/lib/prisma";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { carregarPaginaDoChat } from "@/lib/mensagensDoChatDb";
import { lerEstadoDoChat } from "@/lib/estadoDoChatDb";
import { nomeDaLinha } from "@/lib/rotulosDaEspera";
import { nomeEhTemporario } from "@/lib/nomeTemporarioDoLead";
import { pareceTelefone } from "@/lib/avisoDeLead";
import ChatDaConversa from "@/components/atendimento-app/ChatDaConversa";
import SemAcessoAConversa from "@/components/atendimento-app/SemAcessoAConversa";
import { carregarConversaDoApp } from "./dados";

export const dynamic = "force-dynamic";

// A GUIA CHAT — o que a pessoa vê ao entrar numa conversa: as mensagens, a barra de estado da Ana e o
// campo para responder (Onda B-1).
//
// A conversa vem pelo recorte de acesso (carregarConversaDoApp -> whereDeUmAtendimento: id + escritório
// + dono). Só DEPOIS de ela existir para quem pediu é que se lêem as mensagens (as 60 últimas) e o estado.
// A atualização a cada 15 s é do próprio chat (rota JSON), não desta página: ela não se recarrega.
export default async function ChatDoAtendimentoPage({ params }: { params: { id: string } }) {
  const viewer = await exigirAcessoAoAtendimentoNaTela();
  const c = await carregarConversaDoApp(params.id);
  if (!c) return <SemAcessoAConversa />;

  const agora = new Date();
  const [pagina, cfg, estado] = await Promise.all([
    carregarPaginaDoChat(c.id, viewer.officeId, { agora }),
    prisma.whatsappConfig.findUnique({ where: { officeId: viewer.officeId }, select: { agenteNome: true } }),
    lerEstadoDoChat(c, viewer.officeId, agora),
  ]);
  const nomeDoAtendente = cfg?.agenteNome?.trim() || "Atendente";
  const nomeDoContato = nomeDaLinha(c.clientName, c.waPhone ?? c.contactPhone);
  const primeiroNome = nomeDoContato.split(/\s+/)[0] || "";
  const nomeTemporario = nomeEhTemporario(c.clientName) || pareceTelefone(c.clientName);

  return (
    <ChatDaConversa
      key={c.id}
      idDaConversa={c.id}
      inicial={pagina}
      estadoInicial={estado}
      agoraIso={agora.toISOString()}
      nomeDoAtendente={nomeDoAtendente}
      nomeDoContato={nomeDoContato}
      primeiroNome={primeiroNome}
      nomeTemporario={nomeTemporario}
    />
  );
}
