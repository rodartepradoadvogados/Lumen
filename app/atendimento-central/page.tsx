import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { podeVerAtendimentos, veTodoOAtendimento, filtroDoAtendimento } from "@/lib/acessoAtendimento";
import { findAttendanceIdsByLooseName } from "@/lib/looseNameSearch";
import { stageOptions, faseDaUrl, filtroDeFase } from "@/lib/funil";
import { contagensPorFase, type ContagensPorFase } from "@/lib/listaDeAtendimentos";
import { ORDEM_POR_ATIVIDADE } from "@/lib/atividadeDoAtendimento";
import { quemEstaEsperando } from "@/lib/esperaDoAtendimento";
import { situacaoDaRecusa, type EstadoDaRecusa } from "@/lib/recusaDoLead";
import { motivosParaRecusar } from "@/lib/actions/recusaDoLead";
import { identificarNumero } from "@/lib/identificarNumero";
import { getAppUrl } from "@/lib/appUrl";
import {
  hrefDaLista,
  recorteDaConversa,
  CONVERSA_FORA_DO_SEU_ALCANCE,
  FOCO_DA_RECUSA,
  ANCORA_DA_RECUSA,
} from "@/lib/conversaDaCentral";
import { dataDeBrasilia, dataEHoraDeBrasilia } from "@/lib/horaDeBrasilia";
import ThemeToggle from "@/components/ThemeToggle";
import QuadroDoFunil, { type CardDoFunil } from "@/components/atendimento/QuadroDoFunil";
import NovaConversaModal from "@/components/atendimento/NovaConversaModal";
import FilaDeEspera from "@/components/atendimento/FilaDeEspera";
import RecusadosParaAnalise, { type RecusadoNaLista } from "@/components/atendimento/RecusadosParaAnalise";
import Conversa from "@/components/atendimento/Conversa";
import TrilhoDoAtendimento from "@/components/atendimento/TrilhoDoAtendimento";
import RelogioDoAtendimento from "@/components/atendimento/RelogioDoAtendimento";
import RecusarLeadPainel from "@/components/atendimento/RecusarLeadPainel";
import BotaoDaGaveta from "@/components/atendimento/BotaoDaGaveta";
import SeletorDeFase from "@/components/atendimento/SeletorDeFase";
import ListaDeConversas, { type LinhaDaLista } from "@/components/atendimento/ListaDeConversas";
import WhatsappReplyBox from "@/components/WhatsappReplyBox";
import AtendenteIaControle from "@/components/AtendenteIaControle";
import { isWhatsappConfigured } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// ============================================================================
// CENTRAL DE ATENDIMENTO — a tela fundida (ETAPA 1: casca e navegação).
//
// Duas abas — "triagem" (padrão) e "atendimentos" — e três sub-abas dentro de Triagem, na ordem
// pedida: Funil comercial (padrão), Esperando resposta, Recusados. Ver PROPOSTA.md/CRITICA.md do
// mockup aprovado para o raciocínio de composição visual; esta página só HOSPEDA os componentes
// que já existem (QuadroDoFunil, FilaDeEspera, RecusadosParaAnalise, Conversa,
// TrilhoDoAtendimento, RelogioDoAtendimento, QuemEEsteNumero — dentro de TrilhoDoAtendimento —,
// RecusarLeadPainel), sem reescrever nenhum deles.
//
// ETAPA 2 — A FUSÃO DE CLIQUE, feita. A linha da fila, o card do funil e a linha de recusados
// abrem a conversa na aba Atendimentos DESTA tela, e não mais na rota antiga /atendimento/:id.
//
// COMO, e por que assim:
//
//   O ENDEREÇO É A MESMA ROTA COM OUTROS PARÂMETROS (?aba=atendimentos&id=...), calculado em
//   lib/conversaDaCentral.ts. Sendo a mesma rota, o <Link> do App Router faz navegação macia: troca
//   o conteúdo e não recarrega o documento. Foi por isso que o destino não virou uma tela nova nem
//   um modal — a tela já sabia ler `?id=` da URL desde a etapa 1, e ligar o que existe custa menos
//   do que inventar estado de cliente para a mesma coisa.
//
//   O DESTINO VIAJA COMO TEXTO ("central"), não como função. QuadroDoFunil e RecusadosParaAnalise
//   são componentes de cliente; passar `(id) => ...` como prop quebraria na serialização em tempo
//   de execução, sem um pio do TypeScript. Por padrão os três componentes continuam em "classico",
//   então a Triagem antiga (app/(app)/atendimento/funil/page.tsx) não mudou de comportamento — e
//   não precisou ser editada.
//
//   O `id` QUE CHEGA É PALPITE, e é reconferido: recorteDaConversa põe o officeId de QUEM PEDIU e o
//   recorte por dono no mesmo `where` do `id`. Sem isso, o caminho novo seria o furo da fusão —
//   clicar abriria conversa que a pessoa não poderia nem listar. Quando o recorte recusa, a tela
//   diz uma frase só para os três motivos possíveis (CONVERSA_FORA_DO_SEU_ALCANCE).
//
// A aba Atendimentos continua tendo a SUA PRÓPRIA seleção (lista → conversa): é o mesmo `?id=` que
// o clique da Triagem usa, e não um segundo caminho.
//
// ETAPA 3 — O ACABAMENTO. Cinco consertos, todos levantados na revisão das duas primeiras etapas.
// Três deles vivem neste arquivo:
//
//   LARGURA MÁXIMA DA CONVERSA. A leitura tinha a largura do monitor. Agora a superfície de leitura
//   tem a medida da casa (--atd-largura-leitura, os mesmos 1040px de `.peticionamento .content`).
//
//   ESCALA TIPOGRÁFICA. A tela misturava os apelidos anônimos da escala do Tailwind (`text-xs`,
//   `text-sm`, `text-base`, `text-lg`) com os nomes das paradas da rampa da casa (`text-etiqueta`,
//   `text-corpo`) — nos MESMOS tamanhos, porque tailwind.config.ts reaponta os apelidos para as
//   paradas. Ou seja: nenhum pixel mudou, e é justamente por isso que a troca é segura. O que muda
//   é passar a dizer QUAL parada é cada texto; com o apelido anônimo, "subir um tamanhinho" é uma
//   letra de distância (`sm`→`base`) e sai da rampa sem ninguém ver. Quatro arquivos entraram nesta
//   varredura (esta página e os três componentes de lista que a Triagem desta tela renderiza); o
//   resto de components/atendimento/ fica para quando for tocado, para o diff desta etapa não virar
//   um renomear de 40 arquivos.
//
//   O REALCE DO ITEM CLICADO quando o clicado não está na lista (fora dos 200 mais ativos,
//   arquivado/recusado, fora da busca) — ver o comentário na seleção, abaixo, e o `take` em
//   carregarLista. Desde 29/09/2026 ele vira o item à parte "Conversa aberta", e não mais uma linha
//   fixada no topo.
//
// Os outros dois: o ícone "Ver a recusa" (lib/conversaDaCentral.ts, hrefDaRecusa, e a âncora do
// painel no trilho, aqui embaixo) e os chips que quebravam linha (a faixa de sub-abas aqui; as
// colunas das linhas em FilaDeEspera/RecusadosParaAnalise).
const ABAS = ["triagem", "atendimentos"] as const;
type AbaCentral = (typeof ABAS)[number];
const SUBS = ["funil", "espera", "recusados"] as const;
type SubTriagem = (typeof SUBS)[number];

const channelLabels: Record<string, string> = { WHATSAPP: "WhatsApp", EMAIL: "E-mail", TELEFONE: "Telefone", PRESENCIAL: "Presencial" };

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

export default async function AtendimentoCentralPage({
  searchParams,
}: {
  searchParams: { aba?: string; sub?: string; id?: string; status?: string; q?: string; foco?: string; fase?: string; arq?: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  // A REGRA DO DONO, a mesma de sempre (lib/acessoAtendimento.ts): quem não tem acesso nenhum não
  // sabe que a tela existe.
  if (!podeVerAtendimentos(viewer)) notFound();

  // ── A REGRA DE ACESSO DA FUSÃO — decisão do coordenador, registrada em lib/navSections.ts e
  // repetida aqui porque é aqui que ela é APLICADA: `veTodo` decide se a aba Triagem existe no
  // DOM (não "existe desabilitada" — não existe) e se a URL pode pedir por ela. Quem só tem
  // acesso aos próprios atendimentos nunca vê a Triagem por esta tela — exatamente como hoje não
  // vê o link "Triagem" no menu nem passa pela trava de servidor de
  // app/(app)/atendimento/funil/page.tsx, que continua de pé, intocada.
  const veTodo = veTodoOAtendimento(viewer);

  const abaPedida = ABAS.includes(searchParams.aba as AbaCentral) ? (searchParams.aba as AbaCentral) : "triagem";
  // Pedido de "?aba=triagem" sem o nível para ver: cai para Atendimentos. Isto NÃO é a trava de
  // acesso (a trava de verdade é a ausência das consultas abaixo, gated pelo mesmo `veTodo`) — é
  // só o que a tela mostra quando alguém tenta a URL direta.
  const aba: AbaCentral = abaPedida === "triagem" && !veTodo ? "atendimentos" : abaPedida;
  const sub: SubTriagem = SUBS.includes(searchParams.sub as SubTriagem) ? (searchParams.sub as SubTriagem) : "funil";
  // ETAPA 3 — QUAL PAINEL A PESSOA VEIO VER. Só o ícone "Ver a recusa" pede foco hoje; o valor vem
  // da URL e por isso é conferido contra a lista, nunca usado cru (um `foco` qualquer viraria classe
  // de CSS inventada, ou pior, texto de quem pediu ecoado na tela).
  const foco = searchParams.foco === FOCO_DA_RECUSA ? FOCO_DA_RECUSA : null;

  const cfg = await prisma.whatsappConfig.findUnique({
    where: { officeId: viewer.officeId },
    select: { expedienteInicio: true, expedienteFim: true, agenteNome: true },
  });
  const nomeDoAtendente = cfg?.agenteNome?.trim() || "O atendente";

  // ── TRIAGEM — mesmas consultas de app/(app)/atendimento/funil/page.tsx, só disparadas quando
  // `veTodo` é verdadeiro. Quem só vê os próprios NUNCA dispara estas três consultas de escritório
  // inteiro, esteja a URL pedindo "triagem" ou não. ──────────────────────────────────────────────
  let esperando: Awaited<ReturnType<typeof quemEstaEsperando>>["lista"] = [];
  let naFilaDeRecusados: RecusadoNaLista[] = [];
  let cardsDoFunil: CardDoFunil[] = [];
  let closed = 0;
  let lost = 0;

  if (veTodo) {
    const now = new Date();
    const [fila, attendances, recusados] = await Promise.all([
      quemEstaEsperando(viewer.officeId, {}, viewer.id, now, 50),
      prisma.attendance.findMany({
        where: { status: { notIn: ["ARQUIVADO", "RASCUNHO", "RECUSADO"] }, officeId: viewer.officeId },
        include: {
          responsible: { select: { name: true } },
          whatsappMessages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true } },
        },
        orderBy: [{ stageChangedAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.recusaDeAtendimento.findMany({
        where: { officeId: viewer.officeId, estado: "EM_ANALISE" },
        include: {
          recusadaPor: { select: { name: true } },
          attendance: { select: { id: true, clientName: true, subject: true } },
        },
        orderBy: [{ revisitaEm: "asc" }, { recusadaEm: "asc" }],
        take: 100,
      }),
    ]);
    esperando = fila.lista.filter((q) => q.esperandoHa !== null);
    naFilaDeRecusados = recusados.map((r) => ({
      recusaId: r.id,
      attendanceId: r.attendanceId,
      nome: r.attendance.clientName,
      assunto: r.attendance.subject,
      motivo: r.motivoTexto,
      observacao: r.observacao,
      recusadoEm: dataEHoraDeBrasilia(r.recusadaEm),
      recusadoPor: r.recusadaPor?.name ?? null,
      porAgente: r.porAgente,
      situacao: situacaoDaRecusa({
        estado: r.estado as EstadoDaRecusa,
        enviadaEm: r.enviadaEm,
        abertaEm: r.abertaEm,
        revisitaEm: r.revisitaEm,
      }),
      revisitaEm: r.revisitaEm ? r.revisitaEm.toISOString() : null,
      revisitaVencida: Boolean(r.revisitaEm && r.revisitaEm <= now),
      revisitaLegivel: r.revisitaEm ? dataDeBrasilia(r.revisitaEm) : null,
    }));
    cardsDoFunil = attendances.map((a) => ({
      id: a.id,
      clientName: a.clientName,
      subject: a.subject,
      stage: stageOptions.includes(a.stage) ? a.stage : "NOVO",
      estimatedValue: a.estimatedValue,
      leadSource: a.leadSource,
      lostReason: a.lostReason,
      responsavel: a.responsible?.name ?? null,
      diasNoEstagio: daysBetween(a.stageChangedAt ?? a.createdAt, now),
      followupAtrasado: Boolean(a.nextContactAt && a.nextContactAt < now && !["FECHADO", "PERDIDO"].includes(a.stage)),
      esperandoResposta: a.whatsappMessages[0]?.direction === "IN",
    }));
    closed = cardsDoFunil.filter((c) => c.stage === "FECHADO").length;
    lost = cardsDoFunil.filter((c) => c.stage === "PERDIDO").length;
  }
  const conversionRate = closed + lost > 0 ? (closed / (closed + lost)) * 100 : null;

  // ── ATENDIMENTOS — lista + a conversa selecionada. Mesmo filtro por dono de
  // app/(app)/atendimento/page.tsx (filtroDoAtendimento) — quem só vê os próprios continua só
  // vendo os próprios aqui dentro. ──────────────────────────────────────────────────────────────
  let listaAtendimentos: LinhaDaLista[] = [];
  let contagens: ContagensPorFase = contagensPorFase([]);
  let ocultos = 0;
  let idSelecionado: string | null = null;
  let conversaAbertaForaDaLista: LinhaDaLista | null = null;
  // O RECORTE DA LISTA vem da URL e é conferido: a fase só vale se existir em stageOptions
  // (`?fase=xyz` = "Todas"), e "arquivados" só com `arq=1`.
  const faseEscolhida = faseDaUrl(searchParams.fase);
  const mostrarArquivados = searchParams.arq === "1";
  const recorte = { fase: faseEscolhida, q: (searchParams.q || "").trim(), arquivados: mostrarArquivados };
  // O ID PEDIDO NA URL fica separado do que a tela escolheu sozinha (o primeiro da lista). É a
  // diferença entre "ninguém pediu nada ainda" e "pediram isto e a reconferência recusou" — e sem
  // guardar as duas coisas a segunda viraria a mensagem da primeira ("selecione à esquerda"), que
  // manda a pessoa fazer de novo o que ela acabou de fazer.
  const idPedido = (searchParams.id || "").trim() || null;
  if (aba === "atendimentos") {
    const carregada = await carregarLista(viewer, {
      status: searchParams.status,
      q: searchParams.q,
      fase: faseEscolhida,
      arquivados: mostrarArquivados,
    });
    listaAtendimentos = carregada.linhas;
    contagens = carregada.contagens;
    ocultos = carregada.ocultos;
    idSelecionado = idPedido || listaAtendimentos[0]?.id || null;
    // ── O LEAD ABERTO QUE ESTÁ FORA DA LISTA (etapa 3, revista no A3 do plano de 29/09/2026).
    //
    // A lista traz os 200 de atividade mais recente (ver carregarLista) e respeita a busca. Um lead
    // aberto por link — clicado na Triagem, "Ver a recusa", um endereço colado — pode estar fora
    // dela: mais antigo que o teto, arquivado/recusado (escondidos por padrão), ou fora da busca. A
    // conversa CERTA abre à direita; sem uma linha à esquerda a pessoa via a conversa e a lista
    // dizendo que ela não existe.
    //
    // O CONSERTO É UMA BUSCA A MAIS, POR CHAVE PRIMÁRIA — não alargar o `take` nem tirar o
    // `orderBy`, que é o que transformaria a lista numa varredura da tabela a cada abertura de tela.
    // Uma linha, achada pelo id, só quando o id pedido não veio na página.
    //
    // E ELA PASSA PELO MESMO RECORTE DO CLIQUE (recorteDaConversa: id + escritório de quem pediu +
    // recorte por dono), porque este é um caminho de LEITURA como qualquer outro: sem isso, um id de
    // outro escritório colado na URL não abriria a conversa (essa trava está logo abaixo), mas
    // ACRESCENTARIA à tela uma linha com o nome e o assunto de um cliente de outro escritório.
    // Vazamento pela lista, não pela conversa.
    //
    // NÃO É FIXADA NO TOPO DA LISTA. Era, e isso mentia: a lista agora é ordenada por atividade, e
    // uma linha antiga no topo se passaria pela mais recente. Ela vira um item À PARTE, rotulado
    // "Conversa aberta", acima da lista — o rótulo diz o que ela é em vez de dar a ela um lugar que
    // não é dela.
    if (idPedido && !listaAtendimentos.some((a) => a.id === idPedido)) {
      conversaAbertaForaDaLista = await prisma.attendance.findFirst({
        where: recorteDaConversa(viewer, idPedido),
        select: SELECT_DA_LINHA,
      });
    }
  }

  const selecionado = idSelecionado
    ? await prisma.attendance.findFirst({
        // A RECONFERÊNCIA DO CAMINHO NOVO, num lugar só (lib/conversaDaCentral.ts): id + escritório
        // de quem pediu + recorte por dono. O `id` da URL nunca decide sozinho.
        where: recorteDaConversa(viewer, idSelecionado),
        include: {
          responsible: { select: { name: true } },
          campanha: { select: { nome: true } },
          attachments: { orderBy: { createdAt: "desc" } },
          whatsappMessages: { orderBy: { createdAt: "asc" }, include: { transcricao: true } },
          pendencias: { orderBy: [{ status: "asc" }, { dueDate: "asc" }] },
          recusas: { where: { estado: { not: "REVERTIDA" } }, orderBy: { recusadaEm: "desc" }, take: 1, include: { recusadaPor: { select: { name: true } } } },
        },
      })
    : null;

  const { telefone: telefoneDoContato, contato: contatoConhecido } = selecionado
    ? await identificarNumero(viewer.officeId, selecionado)
    : { telefone: null, contato: null };

  const recusaAtual = selecionado?.recusas[0] ?? null;
  const motivosDeRecusa = selecionado && !recusaAtual && !selecionado.convertedCaseId ? await motivosParaRecusar() : [];
  const enderecoDoSite = getAppUrl();
  const recusaNaTela = recusaAtual
    ? {
        id: recusaAtual.id,
        estado: recusaAtual.estado as EstadoDaRecusa,
        motivoTexto: recusaAtual.motivoTexto,
        observacao: recusaAtual.observacao,
        token: recusaAtual.token,
        enviadaEm: recusaAtual.enviadaEm ? recusaAtual.enviadaEm.toISOString() : null,
        abertaEm: recusaAtual.abertaEm ? recusaAtual.abertaEm.toISOString() : null,
        aberturas: recusaAtual.aberturas,
        revisitaEm: recusaAtual.revisitaEm ? recusaAtual.revisitaEm.toISOString() : null,
        recusadaPor: recusaAtual.recusadaPor?.name ?? null,
        porAgente: recusaAtual.porAgente,
      }
    : null;
  const agora = new Date();
  const ultimaMensagem = selecionado?.whatsappMessages[selecionado.whatsappMessages.length - 1];
  const esperandoResposta = ultimaMensagem?.direction === "IN";
  // Mesma regra da tela do atendimento: há número do cliente E o canal do escritório está ligado.
  const podeResponder = Boolean(selecionado?.waPhone) && (selecionado ? await isWhatsappConfigured(viewer.officeId) : false);

  // Pediram uma conversa por id e ela não voltou: a reconferência recusou (outro escritório, de
  // outra pessoa, ou não existe). Ver CONVERSA_FORA_DO_SEU_ALCANCE — uma frase para os três.
  const pedidoNegado = Boolean(idPedido) && !selecionado;

  const hrefAba = (destino: AbaCentral) => `/atendimento-central?aba=${destino}`;
  const hrefSub = (destino: SubTriagem) => `/atendimento-central?aba=triagem&sub=${destino}`;

  // ALTURA TRAVADA NA JANELA, e o DOCUMENTO NUNCA ROLA (A1, 29/09/2026). O invólucro é
  // `.atd-central-fixa` (layout.tsx + atendimento-central.css): 100dvh, overflow clip, e html/body
  // sem rolagem. Esta raiz só preenche ele (`h-full`). Com piso (min-h-screen), a coluna cresceria do
  // tamanho da conversa e a caixa de resposta desceria junto; e com `h-screen` sozinho, a coluna do
  // trilho — que era mais alta que a linha — empurrava o documento, e o cabeçalho ("Sair para o
  // Lúmen", "Atendimento", as abas) saía da janela do PWA (877x612). Agora só regiões internas
  // rolam: a lista, a conversa e a coluna do trilho.
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--work-bg)]">
      {/* ── MOLDURA: barra superior ─────────────────────────────────────────────────────────── */}
      <div className="atd-barra-topo flex h-12 shrink-0 items-center justify-between gap-4 border-b border-[var(--frame-border)] bg-[var(--frame-bg)] px-5">
        <a href="/painel" className="text-etiqueta font-semibold text-[var(--frame-tx-2)] transition-colors hover:text-[var(--frame-tx-0)]">
          ← Sair para o Lúmen
        </a>
        <div className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 truncate text-etiqueta text-[var(--frame-tx-2)]">{viewer.name}</span>
          {/* Variante "cromo": a MESMA usada pelo rail e pelo blog para uma barra que nunca
              retematiza — a moldura desta tela é fixa nos dois temas, exatamente essa superfície. */}
          <ThemeToggle variant="cromo" />
        </div>
      </div>

      {/* ── MOLDURA: título + abas principais ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[var(--frame-border)] bg-[var(--frame-bg)] px-5 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-destaque font-bold tracking-wide text-[var(--frame-tx-0)]">Atendimento</h1>
          {/* Só existe seletor de aba quando há mais de uma aba para escolher — mesma regra de
              components/PageSectionTabs.tsx (items.length < 2 não mostra nada para escolher). Quem
              não tem `atendimentoTotal` só tem "Atendimentos": a aba Triagem não é desabilitada,
              ela SOME — nem o botão dela é renderizado. */}
          {veTodo && (
            <div className="inline-flex overflow-hidden rounded-sm border border-[var(--frame-border-strong)]">
              <Link
                href={hrefAba("triagem")}
                className={`px-4 py-2 text-etiqueta font-bold ${
                  aba === "triagem" ? "bg-[var(--frame-accent-bg)] text-[var(--frame-tx-0)]" : "bg-[var(--frame-bg-raised)] text-[var(--frame-tx-1)] hover:text-[var(--frame-tx-0)]"
                }`}
              >
                Triagem
              </Link>
              <Link
                href={hrefAba("atendimentos")}
                className={`border-l border-[var(--frame-border-strong)] px-4 py-2 text-etiqueta font-bold ${
                  aba === "atendimentos" ? "bg-[var(--frame-accent-bg)] text-[var(--frame-tx-0)]" : "bg-[var(--frame-bg-raised)] text-[var(--frame-tx-1)] hover:text-[var(--frame-tx-0)]"
                }`}
              >
                Atendimentos
              </Link>
            </div>
          )}
        </div>

        {aba === "triagem" && veTodo && (
          // A FAIXA DE SUB-ABAS NÃO QUEBRA LINHA (etapa 3). Ela era `flex-wrap`: em largura
          // intermediária a terceira guia caía para uma segunda linha e a régua de baixo
          // (border-b) continuava desenhada só embaixo da primeira — o sublinhado da guia ativa
          // ficava solto no meio da tela, e a faixa deixava de ler como uma faixa. Uma guia é um
          // chip: ou cabe inteira na linha, ou a faixa desliza (overflow-x). Encolher o rótulo não
          // é opção — o nome da guia é o que diz onde a pessoa está.
          <div className="mt-3 flex flex-nowrap gap-4 overflow-x-auto border-b border-[var(--frame-border)]">
            <SubAba href={hrefSub("funil")} ativa={sub === "funil"} numero={1} rotulo="Funil comercial" />
            <SubAba href={hrefSub("espera")} ativa={sub === "espera"} numero={2} rotulo="Esperando resposta" contagem={esperando.length} />
            <SubAba href={hrefSub("recusados")} ativa={sub === "recusados"} numero={3} rotulo="Recusados" contagem={naFilaDeRecusados.length} />
          </div>
        )}
      </div>

      {/* ── CONTEÚDO ────────────────────────────────────────────────────────────────────────── */}
      {aba === "triagem" && veTodo && (
        <div className="flex-1 overflow-y-auto bg-[var(--work-bg)] p-5">
          {sub === "espera" && (
            <FilaDeEspera
              lista={esperando}
              expediente={cfg ? { inicio: cfg.expedienteInicio, fim: cfg.expedienteFim } : null}
              destino="central"
            />
          )}
          {sub === "recusados" && <RecusadosParaAnalise lista={naFilaDeRecusados} destino="central" />}
          {sub === "funil" && (
            <>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-etiqueta font-bold uppercase tracking-wider text-tx-3">Funil comercial</h2>
                <span className="min-w-0 text-etiqueta text-tx-3">arraste entre as colunas — o estágio continua sendo movido por você, nunca pelo sistema</span>
                {conversionRate !== null && (
                  <span className="ml-auto shrink-0 whitespace-nowrap text-etiqueta text-tx-3">
                    Taxa de conversão <span className="font-semibold tabular-nums text-concluido">{conversionRate.toFixed(0)}%</span> ({closed} de {closed + lost} decididos)
                  </span>
                )}
              </div>
              <QuadroDoFunil cards={cardsDoFunil} isAdmin={Boolean(viewer.isAdmin)} destino="central" />
            </>
          )}
        </div>
      )}

      {aba === "atendimentos" && (
        // `data-vista` só importa em janela de celular (<=760px): ver atendimento-central.css. Com `?id=`
        // pedido na URL é a conversa; sem ele, a lista.
        <div className="atd-corpo" data-vista={idPedido ? "conversa" : "lista"}>
          {/* ── COLUNA DE LISTA ─────────────────────────────────────────────────────────────── */}
          <div className="atd-lista">
            <div className="shrink-0 border-b border-[var(--frame-border)] bg-[var(--frame-bg-raised)] p-3">
              <form className="flex gap-1.5">
                {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
                <input type="hidden" name="aba" value="atendimentos" />
                {/* A busca preserva o recorte: fase e "arquivados" viajam junto (a busca não os zera). */}
                {faseEscolhida && <input type="hidden" name="fase" value={faseEscolhida} />}
                {mostrarArquivados && <input type="hidden" name="arq" value="1" />}
                <label htmlFor="busca-atendimentos" className="sr-only">
                  Buscar por nome ou assunto
                </label>
                <input
                  id="busca-atendimentos"
                  type="text"
                  name="q"
                  defaultValue={searchParams.q}
                  placeholder="Buscar por nome ou assunto"
                  className="min-h-9 min-w-0 flex-1 border border-[var(--frame-border-strong)] bg-[var(--frame-bg)] px-2.5 py-1.5 text-etiqueta text-[var(--frame-tx-0)] placeholder:text-[var(--frame-tx-ghost)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--frame-accent)]"
                />
              </form>
              {/* F5.5 — "eu só consigo responder reativamente": este botão abre uma conversa nova
                  sem esperar o cliente escrever primeiro. Fica na coluna de lista, e não na moldura
                  de cima, porque é ação DESTA aba (Atendimentos), não da tela inteira.
                  A4 — o seletor de FASE mora AO LADO dele (pedido do dono): mesma linha, mesma altura. */}
              <div className="mt-2 flex items-stretch gap-2">
                <NovaConversaModal destino="central" />
                <SeletorDeFase fase={faseEscolhida} contagens={contagens} q={recorte.q} arquivados={mostrarArquivados} id={idPedido} />
              </div>
            </div>
            <ListaDeConversas
              linhas={listaAtendimentos}
              conversaAberta={conversaAbertaForaDaLista}
              idSelecionado={idSelecionado}
              agora={agora}
              nomeDoAtendente={cfg?.agenteNome?.trim() || "Atendente"}
              recorte={recorte}
              contagens={contagens}
              ocultos={ocultos}
              recorteFixoPorStatus={Boolean(searchParams.status)}
            />
          </div>

          {/* ── SUPERFÍCIE DE TRABALHO: conversa ────────────────────────────────────────────── */}
          <div className="atd-conversa">
            {selecionado ? (
              <>
                {/* A MEDIDA DE LEITURA (--atd-largura-leitura, ver atendimento-central.css) LIMITA O
                    CONTEÚDO, NÃO A COLUNA: o fundo e a régua de baixo do cabeçalho seguem de ponta a
                    ponta — o que ganha limite é o texto. Limitar a coluna deixaria uma faixa de
                    fundo diferente à direita, que é um defeito no lugar de outro. E o mesmo limite
                    vale no cabeçalho e na conversa, senão o nome do cliente e as mensagens dele
                    ficariam em réguas diferentes. */}
                <div className="shrink-0 border-b border-[var(--atd-border)] bg-[var(--work-bg-raised)] px-6 py-3 max-[760px]:px-3">
                  <div className="flex w-full max-w-[var(--atd-largura-leitura)] items-start justify-between gap-3">
                    {/* Só em janela de celular: volta da conversa para a lista (o mesmo endereço, sem o
                        `id`). É <Link>, e não botão com estado: funciona sem JavaScript e o botão
                        Voltar do navegador leva ao mesmo lugar. */}
                    <Link
                      href={hrefDaLista(recorte)}
                      aria-label="Voltar à lista de conversas"
                      className="atd-so-celular min-h-11 min-w-11 shrink-0 items-center justify-center border border-[var(--atd-border-strong)] text-etiqueta font-semibold text-tx-2 hover:text-tx focus-visible:ring-2 focus-visible:ring-[var(--frame-accent)]"
                    >
                      ←
                    </Link>
                    <div className="min-w-0 flex-1">
                      <h2 className="flex items-center gap-2 truncate text-corpo font-bold text-tx">
                        {esperandoResposta && (
                          <span className="bolinha-espera" role="img" aria-label="O cliente está esperando resposta" title="O cliente escreveu e ninguém respondeu" />
                        )}
                        <span className="truncate">{selecionado.clientName}</span>
                      </h2>
                      <p className="truncate text-etiqueta text-tx-3">{selecionado.subject}</p>
                    </div>
                    <RelogioDoAtendimento prazoISO={selecionado.prazoDeRespostaAte ? selecionado.prazoDeRespostaAte.toISOString() : null} />
                    <BotaoDaGaveta modo="abrir" />
                  </div>
                </div>
                {/* A caixa que ROLA continua sendo esta (min-h-0 + overflow-y-auto): a medida de
                    leitura entra num invólucro DENTRO dela, e não nela — trocar quem rola por causa
                    de largura seria mexer no chassi da tela para resolver um problema de texto.
                    `data-rolagem-da-conversa` é o que RolarParaOFim procura (closest): SEM ele o
                    componente não achava a caixa e a conversa abria no COMEÇO — só as telas antigas
                    (/atendimento/[id] e /m/atendimento/[id]) tinham o atributo, esta não.
                    `key` = o lead: ao trocar de conversa pela lista o React reaproveitava o mesmo
                    Conversa e o efeito de montagem não rodava de novo — a conversa nova abria onde a
                    anterior tinha parado. */}
                <div data-rolagem-da-conversa="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 max-[760px]:px-3">
                  <div className="w-full max-w-[var(--atd-largura-leitura)]">
                    <Conversa
                      key={selecionado.id}
                      mensagens={selecionado.whatsappMessages}
                      agora={agora}
                      nomeDoAtendente={nomeDoAtendente}
                      transferidoPor={selecionado.transferidoPor}
                      transferidoEm={selecionado.transferidoEm}
                    />
                  </div>
                </div>
                {/* A CAIXA DE RESPOSTA — a Central virou a tela oficial de atendimento e a conversa
                    estava em modo de leitura: a atendente abria o cliente e não tinha onde digitar.
                    É o MESMO pé de conversa de app/(app)/atendimento/[id]/page.tsx (a chave do
                    atendente em cima, WhatsappReplyBox embaixo, e a frase quando não há por onde
                    responder), sem componente novo.
                    FICA FORA DA CAIXA QUE ROLA, irmã dela e `shrink-0`: dentro, ela rolaria junto
                    com a conversa e sumiria no alto de uma conversa comprida. E usa a MESMA medida
                    de leitura do cabeçalho e da conversa, senão desalinha delas.
                    QUEM PODE RESPONDER não se decide aqui: `selecionado` já passou por
                    recorteDaConversa, e replyWhatsapp reconfere com o mesmo recorte no servidor. */}
                <div data-caixa-de-resposta="" className="shrink-0 border-t border-[var(--atd-border)] bg-[var(--work-bg-raised)] px-6 pb-4 pt-3 max-[760px]:px-3">
                  <div className="w-full max-w-[var(--atd-largura-leitura)]">
                    {podeResponder ? (
                      <>
                        <AtendenteIaControle
                          attendanceId={selecionado.id}
                          responde={selecionado.agenteResponde}
                          silenciado={Boolean(selecionado.agenteSilenciadoEm)}
                          ultimaEhDoCliente={esperandoResposta}
                          nomeDoAtendente={nomeDoAtendente}
                        />
                        <WhatsappReplyBox attendanceId={selecionado.id} nomeDoCliente={selecionado.clientName} />
                      </>
                    ) : (
                      <p className="py-2 text-etiqueta text-tx-3">
                        {selecionado.waPhone
                          ? "O canal de WhatsApp do escritório não está configurado, então não há como responder por aqui."
                          : "Este atendimento não tem WhatsApp vinculado. Responda pelo e-mail, na ficha completa do atendimento."}
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-6">
                <p className="max-w-[46ch] text-center text-corpo text-tx-3">
                  {pedidoNegado ? CONVERSA_FORA_DO_SEU_ALCANCE : "Selecione um atendimento à esquerda."}
                </p>
              </div>
            )}
          </div>

          {/* ── SUPERFÍCIE DE TRABALHO: trilho ──────────────────────────────────────────────── */}
          {selecionado && (
            <div className="atd-trilho">
              {/* Só em janela estreita, onde o trilho é gaveta por cima da conversa. */}
              <BotaoDaGaveta modo="fechar" />
              <div className="min-h-0 flex-1">
                <TrilhoDoAtendimento
                  attendanceId={selecionado.id}
                  telefone={telefoneDoContato}
                  contato={contatoConhecido}
                  nomeAtual={selecionado.clientName}
                  area={selecionado.area}
                  canal={channelLabels[selecionado.channel] || selecionado.channel}
                  campanha={selecionado.campanha?.nome ?? null}
                  responsavel={selecionado.responsible?.name ?? null}
                  abertoEm={selecionado.createdAt}
                  descricao={selecionado.description}
                  anexos={selecionado.attachments.map((att) => ({ id: att.id, name: att.name, driveUrl: att.driveUrl }))}
                  pendencias={selecionado.pendencias}
                  jaConvertido={Boolean(selecionado.convertedCaseId)}
                >
                  {/* O PAINEL DE RECUSA MORA DENTRO DA REGIÃO QUE ROLA DO TRILHO (A1). Era irmão do
                      trilho, embaixo dele, e por isso a coluna ficava mais alta que a janela — a
                      causa do cabeçalho cortado. Agora ele é alcançado rolando DENTRO da coluna, e
                      "Transformar em processo" (o pé do trilho) continua preso à vista. */}
                  {/* ETAPA 3 — ESTE É O DESTINO DO ÍCONE "VER A RECUSA" (ver lib/conversaDaCentral.ts).
                      O `id` é a âncora que o navegador usa para rolar até aqui, e vem da mesma constante
                      que monta o endereço — duas palavras iguais em dois arquivos divergiriam calado.
                      O ANEL É A GARANTIA: quem clicou no ícone está procurando ESTE painel entre dois, e
                      o anel é desenhado pelo servidor, sem depender de o navegador ter rolado. */}
                  {!selecionado.convertedCaseId && (
                    <div
                      id={ANCORA_DA_RECUSA}
                      className={`scroll-mt-4 border border-regua bg-sf p-4 ${
                        foco === FOCO_DA_RECUSA ? "ring-2 ring-inset ring-[var(--frame-accent)]" : ""
                      }`}
                    >
                      <RecusarLeadPainel attendanceId={selecionado.id} motivos={motivosDeRecusa} recusa={recusaNaTela} enderecoDoSite={enderecoDoSite} />
                    </div>
                  )}
                  {/* O ÍCONE NUNCA PODE CAIR NO VAZIO. O painel acima não aparece para lead já convertido
                      em processo — e isso está certo, porque recusar quem já virou cliente não faz sentido.
                      Só que o ícone "Ver a recusa" CONTINUA na lista nesse caso: a fila de recusados busca
                      por `estado: EM_ANALISE`, e converter um lead não muda esse estado. Sem este bloco, o
                      ícone promete mostrar a recusa e entrega uma tela sem nada — o usuário clica de novo,
                      acha que travou, e desconfia do resto da tela.
                      A âncora e o anel são os MESMOS do painel, então o destino do ícone existe nos dois
                      casos; o que muda é o que ele explica. */}
                  {selecionado.convertedCaseId && (
                    <div
                      id={ANCORA_DA_RECUSA}
                      className={`scroll-mt-4 border border-regua bg-sf p-4 ${
                        foco === FOCO_DA_RECUSA ? "ring-2 ring-inset ring-[var(--frame-accent)]" : ""
                      }`}
                    >
                      <p className="text-etiqueta text-tx-3">Recusa</p>
                      <p className="mt-1 max-w-[60ch] text-corpo text-tx-2">
                        Este atendimento foi recusado e depois convertido em processo. O painel de recusa não
                        se aplica a quem já é cliente — o registro da recusa continua no histórico do
                        atendimento.
                      </p>
                    </div>
                  )}
                </TrilhoDoAtendimento>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubAba({ href, ativa, numero, rotulo, contagem }: { href: string; ativa: boolean; numero: number; rotulo: string; contagem?: number }) {
  return (
    <Link
      href={href}
      className={`shrink-0 whitespace-nowrap border-b-2 pb-2 text-etiqueta font-semibold uppercase tracking-[.06em] transition-colors ${
        ativa ? "border-[var(--frame-accent)] text-[var(--frame-tx-0)]" : "border-transparent text-[var(--frame-tx-2)] hover:text-[var(--frame-tx-0)]"
      }`}
    >
      <span className="mr-1.5 tabular-nums opacity-70">{numero}</span>
      {rotulo}
      {contagem !== undefined && <span className="ml-1.5 tabular-nums text-[var(--frame-tx-2)]">({contagem})</span>}
    </Link>
  );
}

// As colunas da linha da lista (e da linha "Conversa aberta", que é a mesma coisa achada por id).
// A última mensagem vem junto (uma por lead) para a prévia, o prefixo "Ana:/Você:" e a bolinha de
// "esperando resposta" — o mesmo critério do funil: a última mensagem é do cliente.
const SELECT_DA_LINHA = {
  id: true,
  clientName: true,
  subject: true,
  stage: true,
  convertedCaseId: true,
  createdAt: true,
  ultimaAtividadeEm: true,
  whatsappMessages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, body: true, porAgente: true, createdAt: true } },
} satisfies Prisma.AttendanceSelect;

// Mesma consulta de app/(app)/atendimento/page.tsx — extraída aqui para não crescer ainda mais o
// corpo do componente de página. `soOsMeus` não entra no retorno porque esta etapa não reescreve
// o rótulo de cabeçalho por nível; o RECORTE por dono, que é o que importa para segurança, já está
// aplicado via `filtroDoAtendimento`.
//
// O `take: 200` CONTINUA 200, DE PROPÓSITO (etapa 3). Ele é o teto de uma lista que se lê rolando, e
// tirá-lo faria cada abertura desta tela varrer a tabela de atendimentos do escritório inteiro. O
// lead clicado que cai fora da página é resolvido com UMA busca por chave primária na seleção (ver
// lá), e não alargando esta consulta.
//
// A4 — FASE, CONTAGENS E ARQUIVADOS. Três consultas em paralelo, TODAS com o mesmo recorte de dono
// (`officeId` + `filtroDoAtendimento`, e a busca por nome):
//   1. as linhas: recorte + FASE, no `where` ANTES do `take` (filtrar depois cortaria conversa
//      antiga que tem a fase pedida);
//   2. as contagens do menu: `groupBy stage` do MESMO recorte, sem a fase (o menu mostra quantos
//      há em CADA fase); o número do menu e o tamanho da lista vêm do mesmo `where`;
//   3. quantos arquivados/recusados estão escondidos (o alternador "Mostrar arquivados e recusados").
// ARQUIVADOS e RECUSADOS ficam escondidos por padrão, como a Triagem já faz (decisão do dono);
// RASCUNHO nunca aparece. Um `?status=` explícito na URL continua valendo como sempre valeu.
async function carregarLista(
  viewer: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  pedido: { status: string | undefined; q: string | undefined; fase: string | null; arquivados: boolean },
): Promise<{ linhas: LinhaDaLista[]; contagens: ContagensPorFase; ocultos: number }> {
  const ESCONDIDOS_POR_PADRAO = ["ARQUIVADO", "RECUSADO"];
  const recorteDeDono: Prisma.AttendanceWhereInput = {
    officeId: viewer.officeId,
    ...filtroDoAtendimento(viewer, viewer.id),
  };
  const statusDaLista: Prisma.AttendanceWhereInput["status"] = pedido.status
    ? pedido.status
    : pedido.arquivados
      ? { not: "RASCUNHO" }
      : { notIn: ["RASCUNHO", ...ESCONDIDOS_POR_PADRAO] };
  const baseFilters: Prisma.AttendanceWhereInput = { ...recorteDeDono, status: statusDaLista };
  const termo = (pedido.q || "").trim();
  // A busca acha por nome em TODOS os status visíveis (só o rascunho fica de fora), e o status da
  // lista estreita depois: senão, com uma busca, o alternador dos escondidos nunca teria o que contar.
  const daBuscaBase: Prisma.AttendanceWhereInput = { ...recorteDeDono, status: pedido.status ? pedido.status : { not: "RASCUNHO" } };
  const matchingIds = termo ? await findAttendanceIdsByLooseName(termo, daBuscaBase) : [];
  const daBusca: Prisma.AttendanceWhereInput = termo ? { id: { in: matchingIds } } : {};
  const [linhas, porFase, ocultos] = await Promise.all([
    prisma.attendance.findMany({
      where: { ...baseFilters, ...daBusca, ...filtroDeFase(pedido.fase) },
      select: SELECT_DA_LINHA,
      // A ORDEM É A ATIVIDADE MAIS RECENTE (lib/atividadeDoAtendimento.ts), e o `take` vem DEPOIS
      // dela: os 200 que entram são os 200 mais ativos, não os 200 mais novos. Ordenar por
      // criação cortaria justamente a conversa antiga que acabou de receber mensagem.
      orderBy: ORDEM_POR_ATIVIDADE,
      take: 200,
    }),
    prisma.attendance.groupBy({ by: ["stage"], where: { ...baseFilters, ...daBusca }, _count: { _all: true } }),
    pedido.status || pedido.arquivados
      ? Promise.resolve(0)
      : prisma.attendance.count({ where: { ...recorteDeDono, ...daBusca, status: { in: ESCONDIDOS_POR_PADRAO } } }),
  ]);
  return { linhas, contagens: contagensPorFase(porFase), ocultos };
}
