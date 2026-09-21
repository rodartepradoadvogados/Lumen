import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { EntradaClient } from "@/components/peticionamento/EntradaClient";

export const dynamic = "force-dynamic";

// Tela de entrada — index.html do mockup. O layout já barrou quem não pode acessar a aba
// (lib/peticionamentoAcesso.ts); aqui só falta buscar os rascunhos salvos automaticamente
// (especificação §7: "contexto preenchido pela metade e abandonado é salvo automaticamente como
// rascunho reaproveitável, nunca perdido ao fechar a aba").
export default async function PeticionamentoEntrada() {
  const user = await getCurrentUser();
  const rascunhos = user
    ? await prisma.peticionamentoSessao.findMany({
        where: { officeId: user.officeId, criadoPorId: user.id, status: "CONTEXTO" },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, updatedAt: true },
      })
    : [];

  return (
    <div className="entry">
      <div className="entry-top">
        <a className="exit-link" href="/painel">
          <span>Lúmen</span> <span className="quiet">— Processos, Financeiro, Agenda…</span>
        </a>
      </div>

      <div className="entry-center">
        <h1 className="title">Peticionamento</h1>
        <p className="scope-line">
          Minuta em rascunho, redigida pelo agente a partir do contexto que você escolher. <strong>Nunca protocolada por aqui</strong> — protocolar continua sendo ato seu.
        </p>
        <EntradaClient rascunhos={rascunhos.map((r) => ({ id: r.id, atualizadoEm: r.updatedAt.toISOString() }))} />
      </div>

      <div />
      <div className="entry-foot">
        <span>
          <span className="dot" style={{ display: "inline-block" }} /> Rodarte Prado Advogados · Lúmen
        </span>
        <span className="quiet">
          perfil <span className="mono">peticionamento-lumen</span> {user ? `· ${user.name}${user.oab ? ` · OAB ${user.oab}` : ""}` : ""}
        </span>
      </div>
    </div>
  );
}
