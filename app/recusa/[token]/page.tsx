import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { montarCartaDeRecusa, tokenValido } from "@/lib/recusaDoLead";
import { registrarAberturaDaCarta } from "@/lib/actions/recusaDoLead";
import LumenMark from "@/components/LumenMark";

export const dynamic = "force-dynamic";

// ============================================================================
// A CARTA DE RECUSA, DO LADO DE QUEM A RECEBE.
//
// Página pública, sem login, aberta por um link único. É o que o lead vê quando o escritório
// decide não assumir o caso dele.
//
// TRÊS COISAS QUE GOVERNAM ESTA TELA:
//
// 1. ELA REGISTRA A ABERTURA, e é isso que vale como prova de ciência. Sem exigir clique de "li e
//    entendi" — metade não clicaria, e aí a prova seria pior do que a de não exigir nada.
//
// 2. ELA NÃO DIZ MAIS DO QUE PODE. Não opina sobre o mérito, não nomeia lei, não estima prazo.
//    Uma carta de recusa que dá parecer é um parecer dado a quem o escritório acabou de recusar —
//    o pior dos dois mundos.
//
// 3. TOKEN INVÁLIDO É 404, sempre, e sem distinguir "não existe" de "formato errado". Um link de
//    recusa não pode virar um jeito de descobrir se uma pessoa procurou aquele escritório.
//
// Sem `dangerouslySetInnerHTML` em lugar nenhum: a carta chega como texto estruturado de
// lib/recusaDoLead.ts e a marcação é montada aqui.
// ============================================================================

export default async function CartaDeRecusaPage({ params }: { params: { token: string } }) {
  if (!tokenValido(params.token)) notFound();

  const recusa = await prisma.recusaDeAtendimento.findUnique({
    where: { token: params.token },
    select: {
      estado: true,
      motivoTexto: true,
      recusadaEm: true,
      attendance: { select: { clientName: true } },
      office: { select: { name: true } },
    },
  });
  if (!recusa) notFound();

  // Recusa desfeita não mostra carta: o escritório mudou de ideia, e o lead que abrisse o link
  // depois disso leria uma recusa que já não existe. É o pior jeito possível de descobrir que o
  // caso foi aceito.
  if (recusa.estado === "REVERTIDA") notFound();

  await registrarAberturaDaCarta(params.token);

  const carta = montarCartaDeRecusa({
    nome: recusa.attendance.clientName,
    escritorio: recusa.office.name,
    motivo: recusa.motivoTexto,
    registradaEm: recusa.recusadaEm,
  });

  return (
    <main className="min-h-screen bg-sf-fundo px-5 py-10">
      <div className="mx-auto w-full max-w-[620px]">
        <div className="mb-6 flex items-center gap-2.5">
          <LumenMark size={28} />
          <span className="text-sm font-semibold text-tx-2">{recusa.office.name}</span>
        </div>

        <article className="border border-regua bg-sf p-7 sm:p-9">
          <h1 className="text-guia font-bold leading-tight text-tx">{carta.titulo}</h1>

          {carta.paragrafos.map((p, i) => (
            <p key={i} className="mt-4 text-base leading-relaxed text-tx-2">
              {p}
            </p>
          ))}

          <div className="mt-7 space-y-4 border-t border-regua pt-6">
            {carta.avisos.map((a) => (
              <div key={a.titulo}>
                <h2 className="text-sm font-bold text-tx">{a.titulo}</h2>
                <p className="mt-1 text-base leading-relaxed text-tx-2">{a.texto}</p>
              </div>
            ))}
          </div>

          <p className="mt-7 text-base leading-relaxed text-tx-2">{carta.fecho}</p>

          <p className="mt-7 border-t border-regua pt-4 text-xs text-tx-3">{carta.rodape}</p>
        </article>
      </div>
    </main>
  );
}
