import Link from "next/link";
import { stageLabels, stageDot, faseDoLead } from "@/lib/funil";
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
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--atd-border)] px-4 py-2 text-etiqueta text-tx-3">
        <span aria-live="polite">
          {linhas.length < naFase ? `${linhas.length} de ${naFase} conversas` : `${naFase} ${naFase === 1 ? "conversa" : "conversas"}`}
        </span>
        {fase && (
          <span className="inline-flex min-h-6 items-center gap-1 border border-[var(--atd-border-strong)] bg-[var(--list-bg-hover)] pl-2 font-semibold text-tx">
            Fase: {stageLabels[fase]}
            <Link
              href={hrefSemFase}
              aria-label="Remover filtro de fase"
              className="inline-flex min-h-6 min-w-6 items-center justify-center text-tx-3 hover:text-tx focus-visible:ring-2 focus-visible:ring-[var(--frame-accent)]"
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
          <div className="border-b border-[var(--atd-border-strong)]">
            <p className="px-4 pb-1 pt-3 text-etiqueta font-bold uppercase tracking-wider text-tx-3">Conversa aberta</p>
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
                className="mt-3 inline-flex min-h-9 items-center border border-[var(--atd-border-strong)] px-3 font-semibold text-tx hover:bg-[var(--list-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--frame-accent)]"
              >
                Ver todas as fases
              </Link>
            )}
          </div>
        ) : (
          <ul>
            {linhas.map((a) => (
              <li key={a.id}>
                <Linha a={a} agora={agora} nomeDoAtendente={nomeDoAtendente} recorte={recorte} selecionada={a.id === idSelecionado} />
              </li>
            ))}
          </ul>
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
  return (
    <Link
      // O recorte (fase, busca, arquivados) viaja no clique: sem ele, abrir uma conversa devolveria a
      // lista a "Todas".
      href={hrefDaConversa("central", a.id, recorte)}
      aria-current={selecionada ? "true" : undefined}
      data-conversa-id={a.id}
      className={`block min-h-16 border-b border-[var(--atd-border)] px-4 py-3 transition-colors hover:bg-[var(--list-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--frame-accent)] ${
        selecionada ? "bg-[var(--list-bg-hover)]" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        {esperando && (
          <span className="bolinha-espera" role="img" aria-label="Esperando resposta" title="O cliente escreveu e ninguém respondeu" />
        )}
        <span className={`min-w-0 flex-1 truncate text-corpo text-tx ${selecionada || esperando ? "font-bold" : "font-medium"}`}>{a.clientName}</span>
        <time dateTime={a.ultimaAtividadeEm.toISOString()} className="shrink-0 text-etiqueta tabular-nums text-tx-3">
          {tempoRelativo(a.ultimaAtividadeEm, agora)}
        </time>
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-etiqueta text-tx-3">
          {ultima && prefixoDaPrevia(ultima, nomeDoAtendente) && <span className="text-tx-2">{prefixoDaPrevia(ultima, nomeDoAtendente)}</span>}
          {previa}
        </span>
        {a.convertedCaseId && (
          <span className="shrink-0 border border-current px-1.5 text-etiqueta font-semibold uppercase tracking-wider text-concluido" title="Já virou processo">
            Processo
          </span>
        )}
        <span className="inline-flex shrink-0 items-center gap-1.5 text-etiqueta font-medium text-tx-2">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: stageDot[fase] }} />
          {stageLabels[fase]}
        </span>
      </div>
    </Link>
  );
}
