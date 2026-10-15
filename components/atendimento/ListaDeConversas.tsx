import Link from "next/link";
import { stageLabels, faseDoLead } from "@/lib/funil";
import ListaViva from "@/components/atendimento/ListaViva";
import Avatar from "@/components/atendimento-app/ui/Avatar";
import Selinho from "@/components/atendimento-app/ui/Selinho";
import { hrefDaConversa, hrefDaLista, type RecorteDaLista } from "@/lib/conversaDaCentral";
import {
  tempoRelativo,
  previaDaMensagem,
  prefixoDaPrevia,
  estaEsperandoResposta,
  type ContagensPorFase,
  type UltimaMensagemDaLinha,
} from "@/lib/listaDeAtendimentos";

// ============================================================================
// A LISTA DE CONVERSAS DA CENTRAL (A4 do plano de 29/09/2026) — Server Component.
//
// O QUE A LINHA DIZ, NESTA ORDEM: quem é (e a bolinha, se o cliente espera resposta), há quanto
// tempo foi a última atividade, o que foi dito por último (com quem falou: "Ana:", "Você:"), a FASE
// do funil e, se já virou processo, a marca "Processo".
//
// O RÓTULO DA LINHA MUDOU DE `status` PARA `stage`. A lista mostrava Attendance.status (Novo / Em
// Triagem / Convertido), vocabulário que nenhuma outra parte da tela usa; a Triagem, o funil e o
// filtro falam em FASE (Novo / Aguardando / Qualificação / Proposta / Fechado / Perdido). "Convertido"
// (tem processo) é outro fato — não é "Fechado": o funil pode estar em Fechado sem processo aberto e
// o contrário — e por isso virou a marca "Processo", ao lado da fase.
//
// NÃO HÁ CONTADOR DE NÃO LIDAS (decisão do dono): não existe estado de leitura no banco e não se
// criou campo por usuário. O que existe é a bolinha "esperando resposta", que é um FATO calculado
// (a última mensagem é do cliente) — ver a nota do topo de lib/funil.ts.
//
// A FASE NÃO É COR-SÓ: o nome está sempre escrito. O ponto vem de `stageDot` (var(--...)), mapa
// estático — nunca `f-${x}` montado em tempo de execução, que o Tailwind não geraria.
//
// A prévia é texto do próprio banco, mostrado só a quem já pode ver a conversa (o recorte por dono
// já foi aplicado na consulta). Nenhum dado sai do Lúmen: a política de privacidade não muda.
// ============================================================================

export type LinhaDaLista = {
  id: string;
  clientName: string;
  subject: string;
  stage: string;
  convertedCaseId: string | null;
  createdAt: Date;
  ultimaAtividadeEm: Date;
  whatsappMessages: UltimaMensagemDaLinha[];
};

export default function ListaDeConversas({
  linhas,
  conversaAberta,
  idSelecionado,
  agora,
  nomeDoAtendente,
  recorte,
  contagens,
  ocultos,
  recorteFixoPorStatus,
}: {
  linhas: LinhaDaLista[];
  /** O lead aberto por link que NÃO está na lista (fora do teto, arquivado/recusado, fora da busca). */
  conversaAberta: LinhaDaLista | null;
  idSelecionado: string | null;
  agora: Date;
  nomeDoAtendente: string;
  recorte: RecorteDaLista;
  contagens: ContagensPorFase;
  /** Quantos arquivados/recusados estão escondidos agora. */
  ocultos: number;
  /** `?status=` explícito na URL: o recorte de status é o pedido, e o alternador de arquivados não vale. */
  recorteFixoPorStatus: boolean;
}) {
  const fase = recorte.fase ?? null;
  const naFase = contagens[fase ?? "TODAS"] ?? 0;
  const hrefSemFase = hrefDaLista({ ...recorte, fase: null, id: idSelecionado });
  const mostrandoArquivados = Boolean(recorte.arquivados);

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-5 pb-1 pt-1 text-app-meta text-atd-terciario">
        <span aria-live="polite">
          {linhas.length < naFase ? `${linhas.length} de ${naFase} conversas` : `${naFase} ${naFase === 1 ? "conversa" : "conversas"}`}
        </span>
        {fase && (
          <span className="inline-flex min-h-6 items-center gap-1 rounded-atd-pilula bg-atd-ouro-suave pl-2.5 font-semibold text-atd-texto-ouro">
            Fase: {stageLabels[fase]}
            <Link
              href={hrefSemFase}
              aria-label="Remover filtro de fase"
              className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full hover:text-tx focus-visible:ring-2 focus-visible:ring-[var(--frame-accent)]"
            >
              ×
            </Link>
          </span>
        )}
        <span className="ml-auto" title="Pela última mensagem (recebida ou enviada). Conversa sem mensagem usa a data de criação.">
          Mais recentes primeiro ↓
        </span>
        {!recorteFixoPorStatus && (ocultos > 0 || mostrandoArquivados) && (
          <Link
            href={hrefDaLista({ ...recorte, arquivados: !mostrandoArquivados, id: idSelecionado })}
            className="basis-full font-semibold text-marca-tx underline underline-offset-2 hover:text-tx"
          >
            {mostrandoArquivados ? "Ocultar arquivados e recusados" : `Mostrar arquivados e recusados (${ocultos})`}
          </Link>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-lista-de-conversas="">
        {conversaAberta && (
          // O LEAD ABERTO QUE ESTÁ FORA DA LISTA — rótulo, e não posição. Ele NÃO é enfiado no topo como
          // se fosse a conversa mais recente: a lista é ordenada por atividade, e uma linha antiga no
          // topo mentiria sobre a ordem.
          <div className="mx-2 mb-2 border-b border-atd-barra-borda pb-2">
            <p className="px-3 pb-1 pt-3 text-app-meta font-semibold text-atd-terciario">Conversa aberta</p>
            <Linha a={conversaAberta} agora={agora} nomeDoAtendente={nomeDoAtendente} recorte={recorte} selecionada={conversaAberta.id === idSelecionado} />
          </div>
        )}
        {linhas.length === 0 ? (
          <div className="px-4 py-7 text-etiqueta text-tx-3">
            <p className="text-corpo font-semibold text-tx">{fase ? "Nenhuma conversa nesta fase." : "Nenhum atendimento encontrado."}</p>
            <p className="mt-1">
              {recorte.q ? `Nada para “${recorte.q}”${fase ? ` em ${stageLabels[fase]}` : ""}.` : fase ? `Ainda não há conversas em ${stageLabels[fase]}.` : "Ainda não há conversas."}
              {fase && contagens.TODAS > 0 ? ` Há ${contagens.TODAS} em outras fases.` : ""}
            </p>
            {fase && (
              <Link
                href={hrefSemFase}
                className="mt-3 inline-flex min-h-10 items-center rounded-atd-pilula bg-atd-ouro-suave px-4 font-semibold text-atd-texto-ouro focus-visible:ring-2 focus-visible:ring-[var(--frame-accent)]"
              >
                Ver todas as fases
              </Link>
            )}
          </div>
        ) : (
          // A FILA VIVA (components/atendimento/ListaViva.tsx): a cada atualização de 15 s a linha que
          // recebeu mensagem DESLIZA até o lugar novo e acende, em vez de saltar.
          <ListaViva className="px-2 pb-3">
            {linhas.map((a) => (
              <li
                key={a.id}
                data-linha-viva={a.id}
                data-marca={a.ultimaAtividadeEm.toISOString()}
                data-esperando={estaEsperandoResposta(a.whatsappMessages[0]) ? "sim" : "nao"}
                className="rounded-atd-balao"
              >
                <Linha a={a} agora={agora} nomeDoAtendente={nomeDoAtendente} recorte={recorte} selecionada={a.id === idSelecionado} />
              </li>
            ))}
          </ListaViva>
        )}
      </div>
    </>
  );
}

function Linha({
  a,
  agora,
  nomeDoAtendente,
  recorte,
  selecionada,
}: {
  a: LinhaDaLista;
  agora: Date;
  nomeDoAtendente: string;
  recorte: RecorteDaLista;
  selecionada: boolean;
}) {
  const ultima = a.whatsappMessages[0];
  const esperando = estaEsperandoResposta(ultima);
  const fase = faseDoLead(a.stage);
  const previa = ultima ? previaDaMensagem(ultima.body) : a.subject;
  // A LINHA DO APP (components/atendimento-app/ListaDeConversasApp.tsx), no computador: avatar com
  // iniciais, nome em negrito SÓ quando o cliente espera resposta (e a hora em ouro), a prévia da
  // última mensagem e a fase em etiqueta. Sem divisória: o respiro separa as linhas.
  // CONTINUA SEM CONTADOR DE NÃO LIDAS (nota do topo): quem espera ganha o PONTO em ouro, não um número.
  return (
    <Link
      // O recorte (fase, busca, arquivados) viaja no clique: sem ele, abrir uma conversa devolveria a
      // lista a "Todas".
      href={hrefDaConversa("central", a.id, recorte)}
      aria-current={selecionada ? "true" : undefined}
      data-conversa-id={a.id}
      className={`flex min-h-[72px] gap-3.5 rounded-atd-balao px-2.5 py-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--frame-accent)] ${
        selecionada ? "bg-atd-ouro-suave" : "hover:bg-atd-linha-hover"
      }`}
    >
      <Avatar nome={a.clientName} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`min-w-0 truncate text-app-nome text-tx ${esperando ? "font-bold" : "font-normal"}`}>{a.clientName}</span>
          <time dateTime={a.ultimaAtividadeEm.toISOString()} className={`shrink-0 text-app-meta tabular-nums ${esperando ? "font-semibold text-atd-hora" : "text-atd-terciario"}`}>
            {tempoRelativo(a.ultimaAtividadeEm, agora)}
          </time>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={`min-w-0 truncate text-app-previa ${esperando ? "text-atd-tinta" : "text-atd-previa"}`}>
            {ultima && prefixoDaPrevia(ultima, nomeDoAtendente) && <span className="text-atd-terciario">{prefixoDaPrevia(ultima, nomeDoAtendente)}</span>}
            {previa}
          </span>
          {esperando && (
            <span data-selo-contagem="" role="img" aria-label="Esperando resposta" title="O cliente escreveu e ninguém respondeu" className="h-3 w-3 shrink-0 rounded-full bg-atd-selo" />
          )}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Selinho tom="fase">{stageLabels[fase]}</Selinho>
          {a.convertedCaseId && <Selinho>Processo</Selinho>}
        </span>
      </span>
    </Link>
  );
}
