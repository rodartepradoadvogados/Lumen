import Link from "next/link";
import RelogioDoAtendimento from "@/components/atendimento/RelogioDoAtendimento";
import { rotuloDaEspera, rotuloDaVolta, comQuemEsta, type QuemEspera } from "@/lib/rotulosDaEspera";
import { hrefDaConversa, type DestinoDaConversa } from "@/lib/conversaDaCentral";

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
//
// PARA ONDE A LINHA ABRE NÃO É DECISÃO DESTE COMPONENTE. Quem hospeda diz, pelo `destino`: a
// Triagem antiga (app/(app)/atendimento/funil/page.tsx) não diz nada e continua abrindo a rota
// /atendimento/:id de sempre; a Central de Atendimento pede "central" e a linha abre a conversa na
// aba Atendimentos da própria tela, sem sair dela. Ver lib/conversaDaCentral.ts — o endereço é
// calculado lá, num lugar só para os três componentes de lista da Triagem.
// ============================================================================

export default function FilaDeEspera({
  lista,
  expediente,
  destino = "classico",
}: {
  lista: QuemEspera[];
  expediente: { inicio: string; fim: string } | null;
  destino?: DestinoDaConversa;
}) {
  return (
    <section className="mb-6 border border-regua bg-sf">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-regua px-5 py-3">
        <span className="h-2 w-2 shrink-0 rounded-full bg-acao" aria-hidden="true" />
        <h2 className="text-corpo font-bold text-tx">Esperando resposta</h2>
        <span className="text-corpo text-tx-3">
          {lista.length === 0
            ? "ninguém no momento"
            : `${lista.length} lead${lista.length === 1 ? "" : "s"}, do que espera há mais tempo para o mais recente`}
        </span>
        <span className="flex-1" />
        {expediente && (
          <span className="text-etiqueta text-tx-3">
            Expediente {expediente.inicio}–{expediente.fim} — o relógio só corre dentro dele
          </span>
        )}
      </div>

      {lista.length === 0 ? (
        <p className="px-5 py-6 text-corpo text-tx-3">
          Nenhum lead com mensagem sem resposta. Quando alguém escrever e ninguém responder, a conversa aparece aqui.
        </p>
      ) : (
        <>
          <div className="hidden items-center gap-4 border-b border-regua bg-sf-apoio px-5 py-2 lg:flex">
            <Cabecalho className="min-w-0 basis-[210px]">Quem</Cabecalho>
            <Cabecalho className="min-w-0 basis-[180px]">Há quanto tempo</Cabecalho>
            <Cabecalho className="min-w-0 basis-[170px]">Com quem está</Cabecalho>
            <Cabecalho className="min-w-0 flex-1">Última mensagem</Cabecalho>
            <span className="w-[76px] shrink-0" />
          </div>

          <div>
            {lista.map((q, i) => {
              const grave = (q.esperandoHa ?? 0) >= 10;
              const tarja = i === 0 ? "border-l-acao" : grave ? "border-l-aviso" : "border-l-regua-forte";
              return (
                <div
                  key={q.id}
                  className={`flex flex-wrap items-stretch border-b border-regua border-l-[3px] last:border-b-0 ${tarja}`}
                >
                  {/* A linha inteira abre a conversa — mesmo padrão do card do funil
                      (QuadroDoFunil) e do card do celular (MobileAtendimentosCard): a área de
                      informação é o link, e o que precisa continuar fora dele (aqui, o botão
                      "Abrir") fica como irmão, nunca aninhado — link dentro de link é HTML
                      inválido e quebra de formas silenciosas. */}
                  <Link
                    href={hrefDaConversa(destino, q.id)}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 outline-none focus-visible:bg-sf-apoio focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-marca-tx"
                  >
                    <div className="w-full min-w-0 lg:w-auto lg:basis-[210px]">
                      <p className="flex items-center gap-2 truncate text-corpo font-semibold text-tx">
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
                      <p className="mt-0.5 truncate text-etiqueta text-tx-3">{q.campanha || "sem campanha · veio direto"}</p>
                    </div>

                    <div className="min-w-0 basis-[180px]">
                      <p className={`truncate text-corpo font-bold ${i === 0 ? "text-marca-tx" : grave ? "text-aviso" : "text-tx-2"}`}>
                        {rotuloDaEspera(q.esperandoHa)} sem resposta
                      </p>
                      {/* O relógio de quinze minutos conta no navegador — o que falta muda a cada
                          minuto, e um número parado aqui seria acreditado. Ver RelogioDoAtendimento. */}
                      <p className="mt-0.5 text-etiqueta text-tx-3">
                        <RelogioDoAtendimento prazoISO={q.prazoISO} apenasDetalhe />
                      </p>
                    </div>

                    <div className="min-w-0 basis-[170px]">
                      <p className="truncate text-corpo text-tx">{comQuemEsta(q)}</p>
                      <p className="mt-0.5 truncate text-etiqueta text-tx-3">{rotuloDaVolta(q.voltaDaFila)}</p>
                    </div>

                    <p className="min-w-0 flex-1 truncate text-corpo text-tx-2">
                      {q.ultimaMensagem ? `“${q.ultimaMensagem}”` : "—"}
                    </p>
                  </Link>

                  {/* O botão continua existindo — não é redundância. É a garantia de quem navega
                      por teclado (o alvo de foco previsível) e de quem não descobre, só de olhar,
                      que a linha inteira é clicável; a linha é comodidade, o botão é a garantia. */}
                  <div className="flex shrink-0 items-center py-3.5 pr-5">
                    <Link
                      href={hrefDaConversa(destino, q.id)}
                      className={`inline-flex h-11 w-[76px] shrink-0 items-center justify-center whitespace-nowrap text-corpo font-semibold transition-colors ${
                        i === 0
                          ? "bg-acao text-acao-tx hover:bg-acao-hover"
                          : "border border-regua-forte bg-sf text-tx-2 hover:bg-sf-apoio hover:text-tx"
                      }`}
                    >
                      Abrir
                    </Link>
                  </div>
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
    <span className={`truncate text-etiqueta font-bold uppercase tracking-wider text-tx-3 ${className}`}>{children}</span>
  );
}
