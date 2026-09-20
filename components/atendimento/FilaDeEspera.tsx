import Link from "next/link";
import RelogioDoAtendimento from "@/components/atendimento/RelogioDoAtendimento";
import { rotuloDaEspera, rotuloDaVolta, comQuemEsta, type QuemEspera } from "@/lib/rotulosDaEspera";

// ============================================================================
// A FILA DE QUEM ESTÁ ESPERANDO RESPOSTA — no topo da Triagem.
//
// O funil comercial é do ritmo da SEMANA: um lead muda de estágio quando alguém decide que mudou.
// A fila é do ritmo do MINUTO: o relógio corre, e em quinze minutos o lead passa para outra pessoa.
// Pôr as duas coisas no mesmo peso visual foi o erro que esta tela corrige — o funil ocupava a tela
// inteira e a fila não existia em lugar nenhum.
//
// AS COLUNAS TÊM CABEÇALHO, e isso não é enfeite: "11 min" e "1ª vez" são dois números de naturezas
// diferentes na mesma linha, e sem rótulo o leitor tem de adivinhar qual é qual toda vez.
//
// SÓ O PRIMEIRO BOTÃO É CHEIO. É a linha que espera há mais tempo — a única sobre a qual há algo a
// fazer AGORA. Cinco botões cheios numa tela não apontam para nada.
// ============================================================================

export default function FilaDeEspera({
  lista,
  expediente,
}: {
  lista: QuemEspera[];
  expediente: { inicio: string; fim: string } | null;
}) {
  return (
    <section className="mb-6 border border-regua bg-sf">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-regua px-5 py-3">
        <span className="h-2 w-2 shrink-0 rounded-full bg-acao" aria-hidden="true" />
        <h2 className="text-base font-bold text-tx">Esperando resposta</h2>
        <span className="text-sm text-tx-3">
          {lista.length === 0
            ? "ninguém no momento"
            : `${lista.length} lead${lista.length === 1 ? "" : "s"}, do que espera há mais tempo para o mais recente`}
        </span>
        <span className="flex-1" />
        {expediente && (
          <span className="text-xs text-tx-3">
            Expediente {expediente.inicio}–{expediente.fim} — o relógio só corre dentro dele
          </span>
        )}
      </div>

      {lista.length === 0 ? (
        <p className="px-5 py-6 text-sm text-tx-3">
          Nenhum lead com mensagem sem resposta. Quando alguém escrever e ninguém responder, a conversa aparece aqui.
        </p>
      ) : (
        <>
          <div className="hidden items-center gap-4 border-b border-regua bg-sf-apoio px-5 py-2 lg:flex">
            <Cabecalho className="w-[210px]">Quem</Cabecalho>
            <Cabecalho className="w-[180px]">Há quanto tempo</Cabecalho>
            <Cabecalho className="w-[170px]">Com quem está</Cabecalho>
            <Cabecalho className="flex-1">Última mensagem</Cabecalho>
            <span className="w-[76px] shrink-0" />
          </div>

          <div>
            {lista.map((q, i) => {
              const grave = (q.esperandoHa ?? 0) >= 10;
              const tarja = i === 0 ? "border-l-acao" : grave ? "border-l-aviso" : "border-l-regua-forte";
              return (
                <div
                  key={q.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-regua border-l-[3px] px-5 py-3.5 last:border-b-0 ${tarja}`}
                >
                  <div className="w-full min-w-0 lg:w-[210px] lg:shrink-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-tx">
                      {/* A bolinha pisca porque TODA linha desta fila é alguém esperando resposta.
                          Ver lib/funil.ts: isto é FATO (a última mensagem é do cliente), diferente
                          da coluna "Aguardando" do quadro, que é estágio escolhido. */}
                      <span
                        className="bolinha-espera"
                        role="img"
                        aria-label="O cliente está esperando resposta"
                        title="O cliente escreveu e ninguém respondeu"
                      />
                      <span className="min-w-0 truncate">{q.nome}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-tx-3">{q.campanha || "sem campanha · veio direto"}</p>
                  </div>

                  <div className="w-[180px] shrink-0">
                    <p className={`text-sm font-bold ${i === 0 ? "text-marca-tx" : grave ? "text-aviso" : "text-tx-2"}`}>
                      {rotuloDaEspera(q.esperandoHa)} sem resposta
                    </p>
                    {/* O relógio de quinze minutos conta no navegador — o que falta muda a cada
                        minuto, e um número parado aqui seria acreditado. Ver RelogioDoAtendimento. */}
                    <p className="mt-0.5 text-xs text-tx-3">
                      <RelogioDoAtendimento prazoISO={q.prazoISO} apenasDetalhe />
                    </p>
                  </div>

                  <div className="w-[170px] shrink-0">
                    <p className="truncate text-sm text-tx">{comQuemEsta(q)}</p>
                    <p className="mt-0.5 text-xs text-tx-3">{rotuloDaVolta(q.voltaDaFila)}</p>
                  </div>

                  <p className="min-w-0 flex-1 truncate text-sm text-tx-2">
                    {q.ultimaMensagem ? `“${q.ultimaMensagem}”` : "—"}
                  </p>

                  <Link
                    href={`/atendimento/${q.id}`}
                    className={`inline-flex h-11 w-[76px] shrink-0 items-center justify-center text-sm font-semibold transition-colors ${
                      i === 0
                        ? "bg-acao text-acao-tx hover:bg-acao-hover"
                        : "border border-regua-forte bg-sf text-tx-2 hover:bg-sf-apoio hover:text-tx"
                    }`}
                  >
                    Abrir
                  </Link>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function Cabecalho({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`shrink-0 text-etiqueta font-bold uppercase tracking-wider text-tx-3 ${className}`}>{children}</span>
  );
}
