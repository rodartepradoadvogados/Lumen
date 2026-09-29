import { Bot, Clock } from "lucide-react";
import type { StatusDaConversa } from "@/lib/conversasDoApp";

// Uma linha, só leitura, no topo do chat: quem responde aqui e, se o cliente espera, o relógio de
// quinze minutos. Fica vermelha nos últimos cinco minutos (o texto também diz, não só a cor).
export default function StatusDaConversaLinha({ status }: { status: StatusDaConversa }) {
  return (
    <div className={`flex shrink-0 items-center gap-2 border-b border-regua px-4 py-1.5 text-etiqueta ${status.grave ? "bg-urgente-bg text-urgente" : "bg-sf-apoio text-tx-2"}`}>
      <Bot size={14} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{status.quemResponde}</span>
        {status.relogio && (
          <span className="ml-2 inline-flex items-center gap-1 font-semibold">
            <Clock size={12} aria-hidden="true" />
            {status.relogio}
          </span>
        )}
      </span>
    </div>
  );
}
