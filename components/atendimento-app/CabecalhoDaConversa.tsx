import Link from "next/link";
import { Phone } from "lucide-react";
import BotaoVoltar from "@/components/atendimento-app/BotaoVoltar";
import GuiasDaConversa from "@/components/atendimento-app/GuiasDaConversa";
import { Avatar } from "@/components/atendimento-app/ui";
import { nomeDaLinha } from "@/lib/rotulosDaEspera";
import { telefoneLegivel } from "@/lib/quemEEsteNumero";

// O cabeçalho da conversa (chat e detalhes), no acabamento WhatsApp: SEM faixa grafite e SEM filete de ouro, sobre o
// fundo da tela. Voltar, avatar de iniciais em tom suave, nome e número (um só link, que abre os Detalhes), ligar (o
// discador do aparelho) e as guias Chat / Detalhes. Fica fora da rolagem. O estado da Ana ("Ana responde aqui") mora na
// pílula na linha das guias (BarraDoChat, por portal), que é quem conhece o estado vivo da conversa.
export default function CabecalhoDaConversa({
  id,
  clientName,
  waPhone,
  contactPhone,
  subject,
}: {
  id: string;
  clientName: string;
  waPhone: string | null;
  contactPhone: string | null;
  subject: string;
}) {
  const nome = nomeDaLinha(clientName, waPhone ?? contactPhone);
  const numeroBruto = waPhone || contactPhone;
  const numero = numeroBruto ? telefoneLegivel(numeroBruto) : "";
  const digitos = (numeroBruto || "").replace(/\D/g, "");
  // O nome já É o número quando o WhatsApp não mandou o nome do perfil: não repete embaixo.
  const sub = numero && numero !== nome ? numero : subject;

  return (
    <header className="shrink-0 bg-atd-tela pt-[env(safe-area-inset-top)] text-atd-tinta">
      <div className="flex min-h-[58px] items-center pl-0.5 pr-1">
        <BotaoVoltar tela="conversa" idDaConversa={id} rotulo="Voltar" tom="claro" />
        <h1 className="min-w-0 flex-1">
          <Link
            href={`/atendimento-app/${id}/detalhes`}
            aria-label={`Detalhes de ${nome}${numero ? `, ${numero}` : ""}`}
            className="flex min-h-12 min-w-0 items-center gap-2.5 rounded-atd-balao px-1.5 hover:bg-atd-linha-hover"
          >
            <Avatar nome={nome} tamanho="sm" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-app-nome font-semibold text-atd-tinta">{nome}</span>
              {sub && <span className="block truncate text-app-meta text-atd-terciario">{sub}</span>}
            </span>
          </Link>
        </h1>
        {digitos.length >= 8 && (
          <a
            href={`tel:+${digitos}`}
            aria-label={`Ligar para ${nome}`}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-atd-tinta hover:bg-atd-linha-hover"
          >
            <Phone size={20} aria-hidden="true" />
          </a>
        )}
      </div>
      <GuiasDaConversa idDaConversa={id} />
    </header>
  );
}

