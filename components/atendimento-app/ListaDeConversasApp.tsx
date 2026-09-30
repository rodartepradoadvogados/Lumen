import Link from "next/link";
import { AlertCircle, CheckCheck, Clock, FileText, Image as IconeDeImagem, MessageSquare, Mic, Pin, Plus, Video } from "lucide-react";
import { chipsDaLista, hrefDaListaApp, type FiltroDaLista, type LinhaPronta, type RecorteDaListaApp } from "@/lib/conversasDoApp";
import type { ContagensPorFase } from "@/lib/listaDeAtendimentos";
import type { TipoDeMidia } from "@/lib/mensagensDoChat";
import Avatar from "@/components/atendimento-app/ui/Avatar";
import FiltroPilula from "@/components/atendimento-app/ui/FiltroPilula";
import SeloContagem from "@/components/atendimento-app/ui/SeloContagem";
import Selinho from "@/components/atendimento-app/ui/Selinho";

// A LISTA DE CONVERSAS DO APLICATIVO — acabamento WhatsApp. Server Component.
//
// A linha (sem divisória: o respiro é o espaço) diz: avatar circular de iniciais, o NOME (negrito SÓ quando a
// conversa espera resposta), a hora à direita (em ouro quando espera), a prévia em cinza com o ícone da mídia,
// "Ana:" / "Você:" e ✓✓ nas enviadas, e os selinhos de fase e "Ana". O alvo é a linha inteira (>= 72 px).
//
// "NÃO LIDA" NÃO EXISTE no banco (decisão anterior do dono: sem contador de não lidas). O que existe é o FATO
// "esperando resposta" (a última mensagem é do cliente): é ele que acende o negrito, a hora em ouro e o PONTO
// de ouro (SeloContagem sem número). Quando houver "lida/não lida" por conversa, o selo passa a levar o número.
// O alfinete é o de "tem mensagem fixada" (MensagemFixada), não o de conversa fixada no topo (esse dado não existe).

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
      <nav aria-label="Filtrar por fase">
        <ul className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((c) => (
            <li key={c.chave} className="shrink-0">
              <FiltroPilula rotulo={c.rotulo} contagem={c.contagem} ativo={c.chave === filtro} href={hrefDaListaApp({ ...recorte, f: c.chave })} />
            </li>
          ))}
        </ul>
      </nav>

      {soOsMeus && (
        <p className="mx-4 mt-2 rounded-atd-balao bg-atd-ardosia-bg px-4 py-2 text-etiqueta text-tx">Você vê só os atendimentos repassados a você.</p>
      )}

      {linhas.length < totalNaLista && (
        <p aria-live="polite" className="px-5 pb-1 pt-2 text-app-meta text-atd-terciario">
          {linhas.length} de {totalNaLista} conversas, as mais recentes primeiro
        </p>
      )}

      {linhas.length === 0 ? (
        <Vazio q={q} filtro={filtro} nomeDoFiltro={nomeDoFiltro} recorte={recorte} haConversas={haConversas} />
      ) : (
        <ul className="pt-1">
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

const ICONE_DA_MIDIA: Partial<Record<TipoDeMidia, typeof Mic>> = { imagem: IconeDeImagem, audio: Mic, video: Video, documento: FileText };

function Linha({ l }: { l: LinhaPronta }) {
  const Midia = l.midia ? ICONE_DA_MIDIA[l.midia] : undefined;
  return (
    <Link href={l.href} data-linha-da-conversa="" data-esperando={l.esperando ? "sim" : "nao"} className="flex min-h-[72px] gap-3.5 px-4 py-[11px] hover:bg-atd-linha-hover active:bg-atd-linha-hover">
      <Avatar nome={l.nome} tamanho="md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span data-nome-da-conversa="" className={`min-w-0 truncate text-app-nome text-tx ${l.esperando ? "font-bold" : "font-normal"}`}>
            {l.nome}
          </span>
          <time dateTime={l.quandoISO} className={`shrink-0 text-app-meta tabular-nums ${l.esperando ? "font-semibold text-atd-hora" : "text-atd-terciario"}`}>
            {l.quando}
          </time>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={`flex min-w-0 items-center gap-1.5 text-app-previa ${l.esperando ? "text-atd-tinta" : "text-atd-previa"}`}>
            {l.falhou && <AlertCircle size={16} aria-label="Não enviada" className="shrink-0 text-urgente" />}
            {l.enviada && <CheckCheck size={17} aria-label="Enviada" className="shrink-0 text-atd-terciario" />}
            {Midia && <Midia size={17} aria-hidden="true" className="shrink-0" />}
            <span className="truncate">
              {l.prefixo}
              {l.previa}
            </span>
          </span>
          {l.esperando ? (
            <SeloContagem rotulo={`Esperando resposta${l.semResposta?.espera ? ` há ${l.semResposta.espera}` : ""}`} />
          ) : (
            l.fixada && (
              <span className="shrink-0 text-atd-terciario">
                <Pin size={17} aria-hidden="true" />
                <span className="sr-only">Tem mensagem fixada</span>
              </span>
            )
          )}
        </span>
        {l.semResposta?.relogio && (
          <span className="mt-1 flex items-center gap-1 text-app-meta font-medium text-urgente">
            <Clock size={12} aria-hidden="true" />
            {l.semResposta.relogio}
          </span>
        )}
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Selinho tom="fase">{l.fase}</Selinho>
          {l.anaAtende && <Selinho tom="neutro">{l.quemAtende}</Selinho>}
          {l.processo && <Selinho tom="neutro">Processo</Selinho>}
          {!l.anaAtende && l.quemAtende && <span className="truncate text-app-meta text-atd-terciario">{l.quemAtende}</span>}
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
        <Link href="/atendimento-app/novo" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-atd-pilula bg-atd-ouro-suave px-5 text-corpo font-bold text-atd-texto-ouro">
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
        <Link href={hrefDaListaApp({ arq: recorte.arq })} className="mt-4 inline-flex min-h-11 items-center rounded-atd-pilula bg-atd-pilula px-5 text-corpo font-semibold text-tx">
          Ver todas as conversas
        </Link>
      )}
    </div>
  );
}
