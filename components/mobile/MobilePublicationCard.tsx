"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  markPublicationsRead,
  markPublicationsUnread,
  restorePublicationSnapshots,
} from "@/lib/actions/publications";
import { concluirParaTodos, descartarPublicacao, desfazerDescarte } from "@/lib/actions/publicacoesFila";
import MobileConcluirSheet from "@/components/mobile/MobileConcluirSheet";
import { ROTULO_DO_DESFECHO, type DesfechoDeConclusao, type MotivoDeDescarte } from "@/lib/desfechosDePublicacao";
import { Badge } from "@/components/ui";
import { dataDeBrasilia } from "@/lib/horaDeBrasilia";
import DelegateTaskForm from "@/components/DelegateTaskForm";
import LinkPublicationMenu from "@/components/LinkPublicationMenu";
import CopyButton from "@/components/CopyButton";
import { useUndoToast } from "@/components/UndoToastProvider";
import {
  Check,
  CalendarClock,
  ChevronDown,
  Layers,
  X,
} from "lucide-react";
import type { PublicationGroup } from "@/lib/publicationGrouping";
import { limiteParaAbrirOAviso } from "@/lib/classificarAto";

type Pub = {
  id: string;
  kind: string;
  source: string;
  content: string;
  publishedAt: string;
  read: boolean;
  caseId: string | null;
  caseTitle: string | null;
  clientId?: string | null;
  clientName?: string | null;
  processNumberRaw: string | null;
  assignedToId?: string | null;
  tipoAto?: "AVISO_INTIMACAO" | "INTIMACAO" | "MOVIMENTACAO";
};


// Mesmo critério do desktop (components/PublicationRow.tsx): recebe o GRUPO inteiro (uma ou mais
// publicações do mesmo processo — ver lib/publicationGrouping.ts). O card mostra o item
// "primary" (fonte de maior prioridade), com um selo "+N outras fontes" quando o processo tem
// mais de uma; marcar como lida afeta TODOS os itens do grupo.
export default function MobilePublicationCard({ group, users = [] }: { group: PublicationGroup<Pub>; users?: { id: string; name: string }[] }) {
  const router = useRouter();
  const pub = group.primary;
  const groupIds = group.items.map((i) => i.id);
  const hasMultiple = group.items.length > 1;

  const [open, setOpen] = useState(false);
  const [concluirOpen, setConcluirOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  // "Gerar Prazo"/"Marcar Audiência"/etc. no menu Agenda pré-selecionam o tipo e abrem o MESMO
  // formulário de Delegar (não um form solto) — antes, essas ações criavam uma Task sem
  // responsável (órfã), diferente de "Delegar", que sempre atribui a alguém. Unificado num
  // fluxo só: default TAREFA quando aberto pelo botão "Delegar" puro.
  const ehAviso = pub.tipoAto === "AVISO_INTIMACAO";
  // Tratar = registrar prazo + delegar, o mesmo formulário (o tipo se troca dentro dele). Aviso de
  // intimação ainda não tem prazo: abre como tarefa ("abrir no tribunal").
  const [delegateType, setDelegateType] = useState(ehAviso ? "TAREFA" : "PRAZO");
  const [pending, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const { showUndo } = useUndoToast();

  function markRead() {
    // Mesmo efeito do desktop: desliza 3cm pra esquerda esmorecendo por 1.5s antes de sumir
    // de verdade, pra ficar evidente que a ação surtiu efeito. Marca TODOS os itens do grupo.
    setLeaving(true);
    setTimeout(() => {
      startTransition(async () => {
        await markPublicationsRead(groupIds);
        router.refresh();
        showUndo({
          message: hasMultiple ? `Publicação e mais ${group.items.length - 1} fonte(s) marcadas como lidas.` : "Publicação marcada como lida.",
          onUndo: async () => {
            await markPublicationsUnread(groupIds);
            router.refresh();
          },
        });
      });
    }, 1500);
  }

  // Conclusão para o escritório inteiro e descarte: mesmas ações do servidor do site, com desfazer.
  function concluirTodos(desfecho: DesfechoDeConclusao) {
    const eramNovas = group.items.filter((i) => !i.read).map((i) => i.id);
    startTransition(async () => {
      const r = await concluirParaTodos(pub.id, desfecho);
      setConcluirOpen(false);
      if (r.error || !r.antes) {
        showUndo({ message: r.error ?? "Não foi possível concluir." });
        return;
      }
      const antes = r.antes;
      setLeaving(true);
      router.refresh();
      showUndo({
        message: `Concluída para todos: ${ROTULO_DO_DESFECHO[desfecho]}.`,
        onUndo: async () => {
          await restorePublicationSnapshots(antes);
          await markPublicationsUnread(eramNovas);
          setLeaving(false);
          router.refresh();
        },
      });
    });
  }

  function descartar(motivo: MotivoDeDescarte, opcoes: { bloquearProcesso: "ESCRITORIO" | "USUARIO" | null }) {
    const eramNovas = group.items.filter((i) => !i.read).map((i) => i.id);
    startTransition(async () => {
      const r = await descartarPublicacao(pub.id, motivo, opcoes);
      setConcluirOpen(false);
      if (r.error || !r.antes) {
        showUndo({ message: r.error ?? "Não foi possível descartar." });
        return;
      }
      const antes = r.antes;
      const desfazer = r.desfazer ?? {};
      setLeaving(true);
      router.refresh();
      showUndo({
        message: `Descartada: ${ROTULO_DO_DESFECHO[motivo]}.${desfazer.officeBlockId ? " Processo bloqueado para o escritório." : desfazer.userBlockedId ? " Processo bloqueado só para você." : ""}`,
        onUndo: async () => {
          await desfazerDescarte(antes, desfazer);
          await markPublicationsUnread(eramNovas);
          setLeaving(false);
          router.refresh();
        },
      });
    });
  }

  return (
    <div
      className={`px-4 py-3 transition-all duration-[1500ms] ease-in-out ${
        leaving ? "opacity-0 -translate-x-[3cm] pointer-events-none" : ""
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <Badge color={pub.kind === "PUBLICACAO" ? "blue" : "gold"}>
          {pub.kind === "PUBLICACAO" ? "Publicação" : "Andamento"}
        </Badge>
        <Badge color="navy">{pub.source}</Badge>
        {/* publishedAt é instante — formatDate() lia sem fuso e virava um dia errado perto da
            meia-noite. */}
        <Badge color="slate">{dataDeBrasilia(pub.publishedAt)}</Badge>
        {/* Indicador de agrupamento: mesmo processo capturado por mais de uma fonte (DJEN,
            Datajud, e-mail do Jusbrasil...) — clicar no card já expande e mostra todas. */}
        {pub.tipoAto === "AVISO_INTIMACAO" && <Badge color="gold">Aviso de intimação</Badge>}
        {hasMultiple && (
          <Badge color="bordo" className="inline-flex items-center gap-1">
            <Layers size={11} /> +{group.items.length - 1} outra{group.items.length - 1 > 1 ? "s" : ""} fonte{group.items.length - 1 > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {pub.tipoAto === "AVISO_INTIMACAO" && (
        <p className="text-sm text-tx mb-1">
          O prazo só aparece depois de abrir o aviso no tribunal. Abra até {limiteParaAbrirOAviso(pub.publishedAt).split("-").reverse().join("/")} (estimativa, confirme no tribunal).
        </p>
      )}

      {pub.caseId && pub.caseTitle && (
        <Link href={`/m/processos/${pub.caseId}`} className="text-corpo font-medium text-marca-tx block mb-1">
          {pub.caseTitle}
        </Link>
      )}
      {!pub.caseId && pub.clientId && pub.clientName && (
        <p className="text-corpo font-medium text-concluido mb-1">Cliente compatível: {pub.clientName}</p>
      )}

      {/* Cartão recolhido por padrão — clicar no conteúdo expande INLINE (mesma posição, sem
          modal) e revela o histórico completo do grupo + as ações (marcar como lida, agenda,
          delegar etc). Evita uma lista longa de andamentos já vir toda aberta com botões. */}
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-start justify-between gap-2 text-left">
        <p className={`text-sm text-tx-2 flex-1 ${open ? "" : "line-clamp-2"}`}>{pub.content}</p>
        <ChevronDown
          size={16}
          className={`shrink-0 mt-0.5 text-tx-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-2">
          {hasMultiple ? (
            // Achatado (achado do $impeccable audit, cartão-dentro-de-cartão): antes cada item
            // vinha numa caixa com borda nas 4 arestas, dentro do filete de fonte do grupo
            // (MobilePublicationsList.tsx), dentro do <Card> da página — 3 níveis de moldura.
            // Um único contêiner por grupo (o filete do grupo já cumpre esse papel); os itens
            // dentro dele se separam por divisor, não por caixa própria.
            <div className="divide-y divide-regua mb-2">
              {group.items.map((item) => (
                <div key={item.id} className="py-2.5 first:pt-0">
                  <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge color="navy">{item.source}</Badge>
                      <Badge color="slate">{dataDeBrasilia(item.publishedAt)}</Badge>
                      {!item.read && <Badge color="gold">Não lida</Badge>}
                    </div>
                    <CopyButton
                      text={item.content}
                      label="Copiar conteúdo"
                      showLabel={false}
                      className="shrink-0 p-1 text-tx-2 hover:bg-sf-apoio transition-colors rounded-[2px]"
                    />
                  </div>
                  <p className="text-sm text-tx-2 whitespace-pre-wrap">{item.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-end mb-1">
              <CopyButton
                text={pub.content}
                label="Copiar conteúdo"
                showLabel={false}
                className="shrink-0 p-1.5 text-tx-2 hover:bg-sf-apoio transition-colors rounded-[2px]"
              />
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {users.length > 0 && (
              <button
                type="button"
                disabled={pending || leaving}
                onClick={() => {
                  setDelegateType(ehAviso ? "TAREFA" : "PRAZO");
                  setDelegateOpen(true);
                }}
                className="inline-flex items-center gap-1 text-corpo font-semibold text-acao-tx px-4 py-1.5 bg-acao hover:bg-acao-hover disabled:opacity-50 min-h-[44px]"
              >
                <CalendarClock size={13} /> Tratar
              </button>
            )}
            <button
              type="button"
              disabled={pending || leaving}
              onClick={() => setConcluirOpen(true)}
              aria-haspopup="dialog"
              className="inline-flex items-center gap-1 text-corpo font-semibold text-tx-2 px-3 py-1.5 bg-sf-apoio hover:bg-regua disabled:opacity-50 min-h-[44px]"
            >
              <Check size={13} /> {pending || leaving ? "Concluindo..." : "Concluir"} <ChevronDown size={12} />
            </button>

            {pub.caseId && (
              <Link
                href={`/m/processos/${pub.caseId}`}
                className="inline-flex items-center gap-1 text-corpo font-semibold text-tx-2 px-3 py-1.5 bg-sf-apoio hover:bg-regua min-h-[44px]"
              >
                Abrir Processo
              </Link>
            )}
            {/* "Abrir Cadastro do Cliente" fica de fora do app mobile de propósito — não existe
                tela de detalhe de cliente em /m ainda (mesmo motivo de MobileGlobalSearch
                descartar resultados do tipo "Clientes"). O app nunca deve levar pro site desktop. */}
            {!pub.caseId && (
              <LinkPublicationMenu
                publicationId={pub.id}
                // publicationId na query: MobileNewCaseForm lê direto (useSearchParams) e repassa a
                // createCaseMobile, que vincula automaticamente esta publicação ao processo recém-
                // criado (ver linkOriginPublicationBestEffort em lib/actions/cases.ts).
                newCaseHref={`/m/processos/novo?type=JUDICIAL&publicationId=${encodeURIComponent(pub.id)}${pub.processNumberRaw ? `&processNumber=${encodeURIComponent(pub.processNumberRaw)}` : ""}`}
                processNumberRaw={pub.processNumberRaw}
              />
            )}

          </div>
        </div>
      )}

      {concluirOpen && (
        <MobileConcluirSheet
          ehAviso={ehAviso}
          temCaso={Boolean(pub.caseId)}
          jaVisto={group.allRead}
          busy={pending}
          onFechar={() => setConcluirOpen(false)}
          onVisto={() => {
            setConcluirOpen(false);
            markRead();
          }}
          onConcluir={concluirTodos}
          onDescartar={descartar}
        />
      )}

      {delegateOpen && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div className="bg-sf shadow-pop w-full max-w-md max-h-[85vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-bold text-tx">Delegar publicação</h3>
              <button onClick={() => setDelegateOpen(false)} className="text-tx-3 hover:text-tx">
                <X size={18} />
              </button>
            </div>
            <DelegateTaskForm
              users={users}
              initial={{
                publicationId: pub.id,
                title: pub.content.slice(0, 50),
                referTo: pub.caseId ? "PROCESSO" : "OUTROS",
                selectedLink: pub.caseId && pub.caseTitle ? { id: pub.caseId, label: pub.caseTitle } : undefined,
                type: delegateType,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
