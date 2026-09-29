import Link from "next/link";
import { ChevronRight, Phone } from "lucide-react";
import BotaoVoltar from "@/components/atendimento-app/BotaoVoltar";
import GuiasDaConversa from "@/components/atendimento-app/GuiasDaConversa";
import { iniciaisDoNome } from "@/lib/conversasDoApp";
import { nomeDaLinha } from "@/lib/rotulosDaEspera";
import { telefoneLegivel } from "@/lib/quemEEsteNumero";

// O cabeçalho grafite da conversa (chat e detalhes): voltar, nome e número (um só botão, que abre os
// Detalhes), ligar (o discador do aparelho) e as guias Chat / Detalhes. Fica fora da rolagem.
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
    <header className="atd-hdr shrink-0 border-b-2 border-ouro-acento bg-atd-hdr text-atd-hdr-tx pt-[env(safe-area-inset-top)]">
      <div className="flex min-h-[60px] items-center pl-0.5 pr-0.5">
        <BotaoVoltar tela="conversa" idDaConversa={id} rotulo="Voltar" />
        <h1 className="min-w-0 flex-1">
          <Link
            href={`/atendimento-app/${id}/detalhes`}
            aria-label={`Detalhes de ${nome}${numero ? `, ${numero}` : ""}`}
            className="flex min-h-12 min-w-0 items-center gap-2.5 rounded-[2px] px-1.5 hover:bg-atd-hdr-linha"
          >
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-atd-hdr-linha bg-atd-hdr-linha text-corpo font-bold">
              {iniciaisDoNome(nome)}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-destaque font-semibold">{nome}</span>
              {sub && <span className="block truncate text-etiqueta text-atd-hdr-tx2">{sub}</span>}
            </span>
            <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-atd-hdr-tx2" />
          </Link>
        </h1>
        {digitos.length >= 8 && (
          <a
            href={`tel:+${digitos}`}
            aria-label={`Ligar para ${nome}`}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] text-atd-hdr-tx hover:bg-atd-hdr-linha"
          >
            <Phone size={20} aria-hidden="true" />
          </a>
        )}
      </div>
      <GuiasDaConversa idDaConversa={id} />
    </header>
  );
}
