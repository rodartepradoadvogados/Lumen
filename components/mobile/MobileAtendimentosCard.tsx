import Link from "next/link";
import { Phone, Plus, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui";
import { rotuloDaEspera, procedencia, type QuemEspera } from "@/lib/esperaDoAtendimento";

// ============================================================================
// O CARTÃO DE ATENDIMENTOS NA TELA INICIAL DO APP.
//
// Era um selo "Novo Atendimento": um botão para CRIAR, ao lado do de criar compromisso. Mas quem
// abre o app do escritório às onze da noite quase nunca quer criar um atendimento — quer saber se
// tem alguém esperando resposta. O cartão passa a responder isso antes de oferecer o botão.
//
// O CRIAR VIROU UM ÍCONE DE 44×44 no canto do cabeçalho. Continua ali, com alvo de toque cheio, e
// deixou de ocupar metade da largura da tela para uma coisa que se faz uma vez por dia.
//
// A TARJA DA ESQUERDA DIZ DE QUEM É A OBRIGAÇÃO: bordô quando o atendimento é seu, ocre quando é de
// outra pessoa (ou de ninguém), e nada quando já foi respondido. Cor sozinha não informa — por isso
// o tempo de espera vem escrito ao lado, e "respondido" é palavra, não cor.
// ============================================================================

export default function MobileAtendimentosCard({
  lista,
  abertos,
  esperando,
}: {
  lista: QuemEspera[];
  abertos: number;
  esperando: number;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-regua px-4 py-3.5">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center bg-acao text-acao-tx">
          <Phone size={17} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-tx">Atendimentos</p>
          <p className="mt-0.5 text-corpo text-tx-2">
            {esperando > 0 ? `${esperando} esperando resposta · ` : ""}
            {abertos} aberto{abertos === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/m/atendimento/novo"
          aria-label="Novo atendimento"
          title="Novo atendimento"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center bg-acao text-acao-tx"
        >
          <Plus size={18} strokeWidth={2.4} />
        </Link>
      </div>

      {lista.length === 0 ? (
        <p className="px-4 py-4 text-sm text-tx-2">Nenhum atendimento aberto.</p>
      ) : (
        <div className="divide-y divide-regua">
          {lista.map((q) => {
            const espera = rotuloDaEspera(q.esperandoHa);
            const tarja = q.esperandoHa === null ? "border-transparent" : q.meu ? "border-marca-tx" : "border-aviso";
            return (
              <Link
                key={q.id}
                href={`/m/atendimento/${q.id}`}
                className={`block border-l-[3px] px-4 py-3.5 ${tarja}`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-tx">{q.nome}</span>
                  {espera ? (
                    <span className={`shrink-0 text-corpo font-bold ${q.meu ? "text-marca-tx" : "text-aviso"}`}>{espera}</span>
                  ) : q.respondido ? (
                    <span className="shrink-0 text-corpo font-semibold text-concluido">respondido</span>
                  ) : null}
                </div>
                {q.ultimaMensagem && <p className="mt-1 truncate text-corpo text-tx-2">“{q.ultimaMensagem}”</p>}
                <p className="mt-1 truncate text-etiqueta text-tx-3">{procedencia(q)}</p>
              </Link>
            );
          })}
        </div>
      )}

      <Link href="/m/atendimento" className="flex items-center gap-1 px-4 py-3.5 text-corpo font-semibold text-marca-tx">
        Ver os {abertos} atendimentos <ChevronRight size={14} strokeWidth={2} />
      </Link>
    </Card>
  );
}
