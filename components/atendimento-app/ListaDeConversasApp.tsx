import Link from "next/link";
import { Clock, MessageSquare, Plus } from "lucide-react";
import { stageDot } from "@/lib/funil";
import { chipsDaLista, hrefDaListaApp, type FiltroDaLista, type LinhaPronta, type RecorteDaListaApp } from "@/lib/conversasDoApp";
import type { ContagensPorFase } from "@/lib/listaDeAtendimentos";

// A LISTA DE CONVERSAS DO APLICATIVO (ONDA A). Server Component.
//
// A linha diz, nesta ordem: quem é (avatar com iniciais), quando foi a última atividade, o que foi
// dito por último (com quem falou: "Ana:", "Você:"), "sem resposta" com o tempo e o relógio de quinze
// minutos quando há, a fase do funil (ponto + NOME: a cor nunca fala sozinha), "Processo" quando já
// virou processo e quem atende (a Ana ou a pessoa responsável). O alvo é a linha inteira (>= 72 px).
// NÃO há contador de não lidas (decisão do dono): o que existe é o FATO "sem resposta".

export default function ListaDeConversasApp({
  linhas,
  contagens,
  esperando,
  filtro,
  recorte,
  totalNaLista,
  ocultos,
  soOsMeus,
  haConversas,
}: {
  linhas: LinhaPronta[];
  contagens: ContagensPorFase;
  esperando: number;
  filtro: FiltroDaLista;
  recorte: RecorteDaListaApp;
  /** Quantas conversas casam com o filtro (pode ser mais do que as `linhas` mostradas). */
  totalNaLista: number;
  /** Quantos arquivados/recusados estão escondidos agora. */
  ocultos: number;
  soOsMeus: boolean;
  /** Existe alguma conversa neste recorte de acesso, sem filtro nem busca? */
  haConversas: boolean;
}) {
  const chips = chipsDaLista(contagens, esperando);
  const q = (recorte.q ?? "").trim();
  const nomeDoFiltro = chips.find((c) => c.chave === filtro)?.rotulo ?? "";

  return (
    <>
      <nav aria-label="Filtrar por fase" className="border-b border-regua bg-sf-fundo">
        <ul className="flex gap-2 overflow-x-auto px-3 pb-2.5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((c) => {
            const acesa = c.chave === filtro;
            return (
              <li key={c.chave} className="shrink-0">
                <Link
                  href={hrefDaListaApp({ ...recorte, f: c.chave })}
                  aria-current={acesa ? "true" : undefined}
                  className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-[2px] border px-3 text-etiqueta font-semibold ${
                    acesa ? "border-ouro-acento bg-ouro-acento text-ouro-tx" : "border-regua-forte bg-sf text-tx-2"
                  }`}
                >
                  {c.rotulo}
                  <span className="tabular-nums opacity-90">{c.contagem}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {soOsMeus && (
        <p className="border-b border-regua bg-atd-ardosia-bg px-4 py-2 text-etiqueta text-tx">Você vê só os atendimentos repassados a você.</p>
      )}

      <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-2.5 text-etiqueta text-tx-3">
        <span aria-live="polite">
          {linhas.length < totalNaLista ? `${linhas.length} de ${totalNaLista} conversas` : `${totalNaLista} ${totalNaLista === 1 ? "conversa" : "conversas"}`}
        </span>
        <span>Mais recentes primeiro</span>
      </div>

      {linhas.length === 0 ? (
        <Vazio q={q} filtro={filtro} nomeDoFiltro={nomeDoFiltro} recorte={recorte} haConversas={haConversas} />
      ) : (
        <ul className="border-t border-regua">
          {linhas.map((l) => (
            <li key={l.id}>
              <Linha l={l} />
            </li>
          ))}
        </ul>
      )}

      {(ocultos > 0 || recorte.arq) && !recorte.q && (
        <div className="px-4 py-3 text-center">
          <Link
            href={hrefDaListaApp({ ...recorte, arq: !recorte.arq })}
            className="inline-flex min-h-11 items-center px-3 text-corpo font-semibold text-tx-2 underline underline-offset-2"
          >
            {recorte.arq ? "Ocultar arquivados e recusados" : `Mostrar arquivados e recusados (${ocultos})`}
          </Link>
        </div>
      )}
    </>
  );
}

function Linha({ l }: { l: LinhaPronta }) {
  return (
    <Link
      href={l.href}
      className="flex min-h-[72px] gap-3 border-b border-regua bg-sf px-4 py-3 hover:bg-sf-apoio"
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-regua-forte bg-sf-apoio text-corpo font-bold text-tx-2"
      >
        {l.iniciais}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`min-w-0 flex-1 truncate text-destaque text-tx ${l.semResposta ? "font-bold" : "font-semibold"}`}>{l.nome}</span>
          <time dateTime={l.quandoISO} className={`shrink-0 text-etiqueta tabular-nums ${l.semResposta ? "font-bold text-urgente" : "text-tx-3"}`}>
            {l.quando}
          </time>
        </span>
        <span className="mt-0.5 block truncate text-corpo text-tx-3">
          {l.prefixo && <span className="text-tx-2">{l.prefixo}</span>}
          {l.previa}
        </span>
        {l.semResposta && (
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-etiqueta font-semibold text-urgente">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-urgente" />
              Sem resposta há {l.semResposta.espera}
            </span>
            {l.semResposta.relogio && (
              <span className="inline-flex items-center gap-1 font-medium">
                <Clock size={12} aria-hidden="true" />
                {l.semResposta.relogio}
              </span>
            )}
          </span>
        )}
        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-etiqueta font-medium text-tx-2">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: stageDot[l.faseChave] }} />
            {l.fase}
          </span>
          {l.processo && <span className="border border-current px-1.5 font-semibold uppercase tracking-wider text-concluido">Processo</span>}
          {l.quemAtende && <span className="truncate">{l.quemAtende}</span>}
        </span>
      </span>
    </Link>
  );
}

function Vazio({ q, filtro, nomeDoFiltro, recorte, haConversas }: { q: string; filtro: FiltroDaLista; nomeDoFiltro: string; recorte: RecorteDaListaApp; haConversas: boolean }) {
  // 1) Nada de conversa nenhuma para esta pessoa.
  if (!q && filtro === "todas" && !haConversas) {
    return (
      <div className="px-6 py-12 text-center text-tx-2">
        <MessageSquare size={36} aria-hidden="true" className="mx-auto mb-2 text-tx-3" />
        <p className="text-destaque font-semibold text-tx">Nenhuma conversa ainda</p>
        <p className="mt-1 text-corpo">Quando um cliente escrever pelo WhatsApp, a conversa aparece aqui.</p>
        <Link href="/atendimento-app/novo" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[2px] bg-ouro-acento px-4 text-corpo font-bold text-ouro-tx">
          <Plus size={18} aria-hidden="true" /> Novo atendimento
        </Link>
      </div>
    );
  }
  // 2) A busca não achou.  3) O filtro não tem ninguém.
  return (
    <div className="px-6 py-12 text-center text-tx-2">
      <p className="text-destaque font-semibold text-tx">{q ? "Nada encontrado" : `Nenhuma conversa em “${nomeDoFiltro}”`}</p>
      <p className="mt-1 text-corpo">{q ? `Nenhuma conversa com “${q}”${filtro !== "todas" ? ` em “${nomeDoFiltro}”` : ""}.` : "Tente outra fase."}</p>
      {(q || filtro !== "todas") && (
        <Link href={hrefDaListaApp({ arq: recorte.arq })} className="mt-4 inline-flex min-h-11 items-center rounded-[2px] border border-regua-forte bg-sf px-4 text-corpo font-semibold text-tx">
          Ver todas as conversas
        </Link>
      )}
    </div>
  );
}
